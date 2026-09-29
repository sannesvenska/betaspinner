import { describe, expect, it } from 'vitest';
import { shortDistance, wrapField } from '../track';
import { computeActionHint } from './actionHint';
import { applyEffect } from './effects';
import { head, landOnAction, readyToRoll, run, setup, withCard } from './engineTestKit';
import { reduce } from './reduce';

describe('engine – core loop (§8)', () => {
  it('runs initial task → start card → roll → direction → landing', () => {
    const { session, context } = setup();
    expect(session.phase).toBe('initial_task');

    let state = run(session, context, { type: 'confirm' });
    expect(state.phase).toBe('resolve_card');
    expect(head(state)).toMatchObject({ kind: 'task', count: state.cards[state.startField - 1]?.taskCount });

    state = run(state, context, { type: 'confirm' });
    expect(state.phase).toBe('roll');
    expect(state.stats.tasksPerformed).toBe(
      session.initialTaskCount + (session.cards[session.startField - 1]?.taskCount ?? 0),
    );

    state = run(state, context, { type: 'roll' });
    expect(state.phase).toBe('choose_direction');
    expect(state.round).toBe(1);
    expect(state.lastRoll).toBeGreaterThanOrEqual(1);
    expect(state.lastRoll).toBeLessThanOrEqual(6);

    const from = state.position;
    state = run(state, context, { type: 'chooseDirection', direction: 'right' });
    expect(state.position).toBe(wrapField(from + (state.lastRoll ?? 0)));
    expect(state.cards[state.position - 1]?.discovered).toBe(true);
    expect(state.reveal?.field).toBe(state.position);
  });

  it('rejects invalid events without changing state', () => {
    const { session, context } = setup();
    const result = reduce(session, { type: 'roll' }, context);
    expect(result.error).toBe('invalid_event');
    expect(result.state).toBe(session);
  });

  it('is deterministic for the same event sequence', () => {
    const play = () => {
      const { session, context } = readyToRoll({ seed: 5 });
      let state = session;
      for (let i = 0; i < 15 && state.phase === 'roll'; i++) {
        state = run(
          state,
          context,
          { type: 'roll' },
          { type: 'chooseDirection', direction: i % 2 ? 'left' : 'right' },
        );
        while (state.phase === 'resolve_card') {
          const step = head(state);
          const event =
            step?.kind === 'pick_effect'
              ? ({ type: 'pickEffect', effect: step.options[0] } as const)
              : step?.kind === 'guess'
                ? ({ type: 'guess', numbers: [1, 2] } as const)
                : step?.kind === 'choose_reward'
                  ? ({ type: 'chooseReward', reward: 'remove_penalty_fields' } as const)
                  : step?.kind === 'switcheroo_pool'
                    ? ({ type: 'switcherooPool', pool: step.pools[0] } as const)
                    : step?.kind === 'switcheroo_folder'
                      ? ({ type: 'switcherooFolder', folderId: step.folderIds[0] ?? '' } as const)
                      : ({ type: 'confirm' } as const);
          state = run(state, context, event as Parameters<typeof reduce>[1]);
        }
        if (state.phase === 'roll' && state.chooseNextRoll) state = { ...state, chooseNextRoll: false };
      }
      return state;
    };
    expect(play()).toEqual(play());
  });
});

describe('engine – movement rules', () => {
  it('passing over the goal does nothing; landing exactly starts the win check', () => {
    const { session, context } = readyToRoll();
    const goalField = wrapField(session.position + 2);
    const prepared = {
      ...session,
      goalField,
      cards: session.cards.map((card) =>
        card.field === goalField
          ? { field: goalField, kind: 'goal' as const, discovered: false }
          : card.kind === 'goal'
            ? { ...card, kind: 'normal' as const, group: 'bad' as const, taskCount: 5 }
            : card,
      ),
      chooseNextRoll: true,
    };

    const passed = run(
      prepared,
      context,
      { type: 'chooseRoll', value: 4 },
      { type: 'chooseDirection', direction: 'right' },
    );
    expect(passed.phase).toBe('resolve_card');
    // Passed fields stay undiscovered
    for (const step of [1, 2, 3])
      expect(passed.cards[wrapField(session.position + step) - 1]?.discovered).toBe(false);

    const landed = run(
      prepared,
      context,
      { type: 'chooseRoll', value: 2 },
      { type: 'chooseDirection', direction: 'right' },
    );
    expect(landed.phase).toBe('win_check');
    expect(reduce(landed, { type: 'roll' }, context).error).toBe('invalid_event');
  });

  it('re-rolls the task count when landing on a discovered normal card again', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const { session, context } = readyToRoll({ seed });
      const target = wrapField(session.position + 1);
      const prepared = withCard(
        { ...session, chooseNextRoll: true },
        {
          field: target,
          kind: 'normal',
          group: 'good',
          folderId: 'good-a',
          taskCount: 100,
          discovered: true,
        },
      );
      const state = run(
        prepared,
        context,
        { type: 'chooseRoll', value: 1 },
        { type: 'chooseDirection', direction: 'right' },
      );
      const count = state.cards[target - 1]?.taskCount ?? 0;
      expect(count).toBeGreaterThanOrEqual(6);
      expect(count).toBeLessThanOrEqual(18);
      counts.add(count);
    }
    expect(counts.size).toBeGreaterThan(3);
  });

  it('blocks the U Turn direction', () => {
    const { session, context } = readyToRoll();
    const blocked = {
      ...session,
      effects: applyEffect([], { type: 'u_turn', rounds: 2, blocked: 'left' }, 0),
    };
    const rolled = run(blocked, context, { type: 'roll' });
    expect(reduce(rolled, { type: 'chooseDirection', direction: 'left' }, context).error).toBe(
      'direction_blocked',
    );
    expect(reduce(rolled, { type: 'chooseDirection', direction: 'right' }, context).error).toBeUndefined();
  });

  it('ends early at any time', () => {
    const { session, context } = readyToRoll();
    const ended = run(session, context, { type: 'endEarly' });
    expect(ended).toMatchObject({ phase: 'ended', endReason: 'ended_early' });
    expect(reduce(ended, { type: 'roll' }, context).error).toBe('invalid_event');
  });
});

describe('engine – effects over rounds', () => {
  it('Double Trouble doubles the next tasks and expires after its rounds', () => {
    const { session, context } = readyToRoll();
    let state = landOnAction(session, context, 'double_trouble');
    const rounds = state.effects.find((effect) => effect.type === 'double_trouble')?.remainingRounds ?? 0;
    state = run(state, context, { type: 'confirm' });
    expect(state.phase).toBe('roll');

    for (let round = 0; round < rounds; round++) {
      expect(state.effects.some((effect) => effect.type === 'double_trouble')).toBe(true);
      const target = wrapField(state.position + 1);
      state = withCard(
        { ...state, chooseNextRoll: true },
        { field: target, kind: 'normal', group: 'bad', taskCount: 7, discovered: false, folderId: 'bad-a' },
      );
      state = run(
        state,
        context,
        { type: 'chooseRoll', value: 1 },
        { type: 'chooseDirection', direction: 'right' },
      );
      expect(head(state)).toMatchObject({ kind: 'task', count: 14 });
      state = run(state, context, { type: 'confirm' });
    }
    expect(state.effects.some((effect) => effect.type === 'double_trouble')).toBe(false);
  });
});

describe('engine – actions (§10)', () => {
  it('Good Fairy removes a chosen negative effect, or grants a shield', () => {
    const { session, context } = readyToRoll();
    const withPixelate = { ...session, effects: applyEffect([], { type: 'pixelate', maxLevel: 5 }, 0) };
    let state = landOnAction(withPixelate, context, 'good_fairy');
    expect(head(state)).toEqual({ kind: 'pick_effect', options: ['pixelate'] });
    state = run(state, context, { type: 'pickEffect', effect: 'pixelate' });
    expect(state.effects).toEqual([]);

    const shielded = landOnAction(session, context, 'good_fairy');
    expect(shielded.effects.map((effect) => effect.type)).toEqual(['shield']);
  });

  it('the shield blocks the next bad action but never Mistress Says No', () => {
    const { session, context } = readyToRoll();
    const shielded = { ...session, effects: applyEffect([], { type: 'shield' }, 0) };
    const blocked = landOnAction(shielded, context, 'pixelate');
    expect(head(blocked)).toMatchObject({
      kind: 'notice',
      notice: { type: 'shield_blocked', action: 'pixelate' },
    });
    expect(blocked.effects).toEqual([]);

    const mistress = landOnAction(shielded, context, 'mistress_says_no');
    expect(mistress).toMatchObject({ phase: 'ended', endReason: 'mistress_says_no' });
  });

  it('Clearing Edges: hold first, then pick an effect', () => {
    const { session, context } = readyToRoll();
    const effects = applyEffect([], { type: 'double_trouble', rounds: 3 }, 0);
    let state = landOnAction({ ...session, effects }, context, 'clearing_edges');
    const hold = head(state);
    expect(hold?.kind).toBe('hold');
    if (hold?.kind === 'hold') {
      expect(hold.seconds).toBeGreaterThanOrEqual(15);
      expect(hold.seconds).toBeLessThanOrEqual(35);
    }
    state = run(state, context, { type: 'confirm' });
    expect(head(state)).toEqual({ kind: 'pick_effect', options: ['double_trouble'] });
    expect(reduce(state, { type: 'pickEffect', effect: 'pixelate' }, context).error).toBe('invalid_value');
  });

  it('Decision Maker lets the player choose the next roll', () => {
    const { session, context } = readyToRoll();
    let state = run(landOnAction(session, context, 'decision_maker'), context, { type: 'confirm' });
    expect(state.chooseNextRoll).toBe(true);
    expect(reduce(state, { type: 'roll' }, context).error).toBe('invalid_event');
    state = run(state, context, { type: 'chooseRoll', value: 6 });
    expect(state.lastRoll).toBe(6);
    expect(state.chooseNextRoll).toBe(false);
  });

  it('Pixelate, Splatter and Cleaning Lady', () => {
    const { session, context } = readyToRoll();
    let state = run(landOnAction(session, context, 'pixelate'), context, { type: 'confirm' });
    expect(state.effects.find((effect) => effect.type === 'pixelate')?.value).toBe(1);
    state = run(landOnAction(state, context, 'splatter'), context, { type: 'confirm' });
    const splattered = state.cards.filter((card) => card.splatterSeed !== undefined);
    expect(splattered.length).toBeGreaterThanOrEqual(3);
    expect(splattered.length).toBeLessThanOrEqual(10);
    state = landOnAction(state, context, 'cleaning_lady');
    expect(head(state)).toMatchObject({
      notice: { type: 'effects_cleared', effects: ['pixelate', 'splatter'] },
    });
    expect(state.effects).toEqual([]);
    expect(state.cards.some((card) => card.splatterSeed !== undefined)).toBe(false);
  });

  it('Hail Mary grants a multiplier on the step grid; Bad Luck removes it', () => {
    const { session, context } = readyToRoll();
    const state = landOnAction(session, context, 'hail_mary');
    const value = state.effects.find((effect) => effect.type === 'success_multiplier')?.value ?? 0;
    expect([1.5, 2, 2.5, 3]).toContain(value);
    const unlucky = landOnAction(run(state, context, { type: 'confirm' }), context, 'bad_luck');
    expect(unlucky.effects.some((effect) => effect.type === 'success_multiplier')).toBe(false);
  });

  it('U Turn blocks the direction of travel; pace actions add a pace line to tasks', () => {
    const { session, context } = readyToRoll();
    const uTurn = landOnAction(session, context, 'u_turn');
    expect(uTurn.effects.find((effect) => effect.type === 'u_turn')?.value).toBe(1); // travelled right

    const slow = run(landOnAction(session, context, 'take_it_slow'), context, { type: 'confirm' });
    const squeeze = landOnAction(slow, context, 'squeeze_task');
    expect(head(squeeze)).toMatchObject({ kind: 'task', pace: 'slow' });
    const fast = landOnAction(run(squeeze, context, { type: 'confirm' }), context, 'speed_it_up');
    expect(fast.effects.map((effect) => effect.type)).toContain('pace_fast');
    expect(fast.effects.map((effect) => effect.type)).not.toContain('pace_slow');
  });

  it('Edge & Hold and Highperformer are timed steps', () => {
    const { session, context } = readyToRoll();
    const hold = landOnAction(session, context, 'edge_and_hold');
    expect(head(hold)).toMatchObject({ kind: 'hold', thenPickEffect: false });
    const after = run(hold, context, { type: 'confirm' });
    expect(after.stats.holdTasks).toBe(1);
    expect(head(landOnAction(session, context, 'highperformer'))?.kind).toBe('timed_task');
  });

  it('Guessing Game: rejects equal numbers; a match offers a reward, a miss gives d1×d2 tasks', () => {
    let matched = false;
    let missed = false;
    for (let seed = 1; seed <= 30 && !(matched && missed); seed++) {
      const { session, context } = readyToRoll({ seed });
      const state = landOnAction(session, context, 'guessing_game');
      expect(reduce(state, { type: 'guess', numbers: [3, 3] }, context).error).toBe('invalid_value');
      const guessed = run(state, context, { type: 'guess', numbers: [1, 2] });
      const result = head(guessed);
      if (result?.kind !== 'notice' || result.notice.type !== 'guess_result')
        throw new Error('expected result');
      const next = guessed.pending[1];
      if (result.notice.match) {
        matched = true;
        expect(next).toEqual({ kind: 'choose_reward', canRemoveEffect: false });
        const rewarded = run(
          guessed,
          context,
          { type: 'confirm' },
          { type: 'chooseReward', reward: 'remove_penalty_fields' },
        );
        expect(rewarded.penaltyFieldsRemoved).toBe(2);
      } else {
        missed = true;
        expect(next?.kind).toBe('task');
        if (next?.kind === 'task') expect(next.count).toBeLessThanOrEqual(36);
      }
    }
    expect(matched && missed).toBe(true);
  });

  it('Goal Teleport moves the goal to an undiscovered field outside the safety zone', () => {
    const { session, context } = readyToRoll();
    let state = landOnAction(session, context, 'goal_teleport');
    expect(head(state)).toMatchObject({ kind: 'task', followUp: 'teleport_goal' });
    state = run(state, context, { type: 'confirm' });
    const notice = head(state);
    if (notice?.kind !== 'notice' || notice.notice.type !== 'goal_moved')
      throw new Error('expected goal_moved');
    const { from, to } = notice.notice;
    expect(state.goalField).toBe(to);
    expect(state.cards[to - 1]?.kind).toBe('goal');
    expect(state.cards[from - 1]?.kind).not.toBe('goal');
    expect(shortDistance(to, state.position)).toBeGreaterThanOrEqual(12);
    expect(shortDistance(to, from)).toBeGreaterThanOrEqual(12);
  });

  it('Moving Day moves the player and resolves the landed card', () => {
    const { session, context } = readyToRoll();
    const state = run(landOnAction(session, context, 'moving_day'), context, { type: 'confirm' });
    const notice = head(state);
    if (notice?.kind !== 'notice' || notice.notice.type !== 'player_moved')
      throw new Error('expected player_moved');
    expect(state.position).toBe(notice.notice.to);
    expect(state.cards[state.position - 1]?.discovered).toBe(true);
    expect(state.pending.length).toBeGreaterThanOrEqual(1);
    expect(state.reveal?.field).toBe(state.position);
  });

  it('Switcheroo swaps the undiscovered cards of the chosen content pool', () => {
    const { session, context } = readyToRoll();
    let state = landOnAction(session, context, 'switcheroo');
    const poolStep = head(state);
    if (poolStep?.kind !== 'switcheroo_pool') throw new Error('expected pool choice');
    expect(poolStep.pools).toEqual(['good_content', 'bad_content']); // one alternative each, action folders active = all
    state = run(state, context, { type: 'switcherooPool', pool: 'bad_content' });
    const folderStep = head(state);
    if (folderStep?.kind !== 'switcheroo_folder') throw new Error('expected folder choice');
    const [folderId] = folderStep.folderIds;
    if (!folderId) throw new Error('no alternative');
    state = run(state, context, { type: 'switcherooFolder', folderId });

    expect(state.categories.bad).toEqual([folderId]);
    const undiscoveredBad = state.cards.filter(
      (card) => card.kind === 'normal' && card.group === 'bad' && !card.discovered,
    );
    expect(undiscoveredBad.every((card) => card.folderId === folderId)).toBe(true);
    expect(state.stats.switches).toHaveLength(1);
    const hashes = state.cards.flatMap((card) => (card.imageHash ? [card.imageHash] : []));
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('converts consumed action cards (retrigger once) and keeps them with retrigger always', () => {
    const { session, context } = readyToRoll();
    const once = landOnAction(session, context, 'squeeze_task');
    const field = once.position;
    expect(once.reveal).toMatchObject({ kind: 'action', action: 'squeeze_task' });
    const converted = once.cards[field - 1];
    expect(converted).toMatchObject({ kind: 'normal', group: 'bad', actionConsumed: true, discovered: true });
    expect(converted?.taskCount).toBeGreaterThanOrEqual(6);
    expect(converted?.taskCount).toBeLessThanOrEqual(20);
    expect(session.categories.bad).toContain(converted?.folderId);

    const alwaysContext = { ...context, rules: { ...context.rules, actionRetrigger: 'always' as const } };
    const always = landOnAction(session, alwaysContext, 'squeeze_task');
    expect(always.cards[field - 1]).toMatchObject({ kind: 'action', action: 'squeeze_task' });
  });
});

describe('computeActionHint (§7.4 split_by_side)', () => {
  it('counts hidden action cards per arc between position and goal', () => {
    const { session } = setup();
    const base = {
      ...session,
      position: 10,
      goalField: 20,
      cards: session.cards.map((card) => ({ ...card, kind: 'normal' as const, discovered: false })),
    };
    let state = withCard(base, { field: 15, kind: 'action', group: 'good', action: 'good_fairy' });
    state = withCard(state, { field: 50, kind: 'action', group: 'bad', action: 'pixelate' });
    state = withCard(state, {
      field: 60,
      kind: 'action',
      group: 'bad',
      action: 'pixelate',
      discovered: true,
    });
    state = withCard(state, {
      field: 70,
      kind: 'action',
      group: 'bad',
      action: 'pixelate',
      actionConsumed: true,
    });

    expect(computeActionHint(state)).toEqual({
      total: { good: 1, bad: 1 },
      right: { good: 1, bad: 0 },
      left: { good: 0, bad: 1 },
    });
  });
});
