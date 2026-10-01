import { describe, expect, it } from 'vitest';
import { shortDistance, wrapField } from '../track';
import type { Card, SessionState } from '../types';
import { detourConversionsAvailable, findDriftTarget, isDetour, passesOver } from './boardChanges';
import type { EngineContext } from './context';
import { head, landOnAction, readyToRoll, run, withCard } from './engineTestKit';
import { reduce } from './reduce';

/** Hidden bad normal cards; `except` leaves out a field a test is about to overwrite. */
const hiddenBad = (state: SessionState, except?: number) =>
  state.cards.filter(
    (card) => card.kind === 'normal' && card.group === 'bad' && !card.discovered && card.field !== except,
  ).length;
const hiddenGood = (state: SessionState) =>
  state.cards.filter((card) => card.kind === 'normal' && card.group === 'good' && !card.discovered).length;

/** Moves the goal to `goalField` (keeps goal card and goalField consistent). */
function withGoal(state: SessionState, goalField: number): SessionState {
  const cards = state.cards.map((card): Card =>
    card.field === goalField
      ? { field: goalField, kind: 'goal', discovered: false }
      : card.kind === 'goal'
        ? {
            field: card.field,
            kind: 'normal',
            group: 'good',
            folderId: 'good-a',
            taskCount: 5,
            discovered: false,
          }
        : card,
  );
  return { ...state, goalField, cards };
}

function moveBy(state: SessionState, context: EngineContext, steps: number, direction: 'left' | 'right') {
  return run(
    { ...state, chooseNextRoll: true, forcedDirection: null },
    context,
    { type: 'chooseRoll', value: steps },
    { type: 'chooseDirection', direction },
  );
}

describe('stroke tiers (§8.6)', () => {
  it('multiplies the task and rolls that many dice next', () => {
    const { session, context } = readyToRoll();
    const target = wrapField(session.position + 1);
    let state = withCard(session, {
      field: target,
      kind: 'normal',
      group: 'good',
      folderId: 'good-a',
      taskCount: 7,
      discovered: false,
    });
    state = moveBy(state, context, 1, 'right');
    const task = state.pending.at(-1);
    expect(task).toMatchObject({ kind: 'task', count: 7, tierable: true });
    // Resolve move notices (detour etc.) first
    while (head(state)?.kind === 'notice') state = run(state, context, { type: 'confirm' });

    const before = state.stats.tasksPerformed;
    expect(reduce(state, { type: 'confirm', tier: 4 as never }, context).error).toBe('invalid_value');
    state = run(state, context, { type: 'confirm', tier: 3 });
    expect(state.stats.tasksPerformed - before).toBe(21);
    expect(state.nextDice).toBe(3);
    expect(state.stats.strokeTiers).toEqual([1, 0, 1]); // start card ×1 + this card ×3

    state = run({ ...state, forcedDirection: null }, context, { type: 'roll' });
    expect(state.lastDice).toHaveLength(3);
    expect(state.lastRoll).toBe(state.lastDice.reduce((sum, die) => sum + die, 0));
    expect(state.nextDice).toBe(1);
  });

  it('rejects a tier on non-tierable tasks (action tasks, collectibles)', () => {
    const { session, context } = readyToRoll();
    const squeeze = landOnAction(session, context, 'squeeze_task');
    expect(head(squeeze)).toMatchObject({ kind: 'task' });
    expect(head(squeeze)).not.toHaveProperty('tierable');
    expect(reduce(squeeze, { type: 'confirm', tier: 2 }, context).error).toBe('invalid_value');
  });
});

describe('detour conversion (§8.4)', () => {
  it('detects detours against the goal before the move', () => {
    expect(isDetour(10, 8, 20)).toBe(true);
    expect(isDetour(10, 12, 20)).toBe(false);
    expect(passesOver(18, 'right', 4, 20)).toBe(true);
    expect(passesOver(18, 'right', 2, 20)).toBe(false); // lands on it
    expect(passesOver(3, 'left', 5, 100)).toBe(true); // wraps around
  });

  it('converts one undiscovered bad normal card per detour (default)', () => {
    const { session, context } = readyToRoll();
    const prepared = withGoal(session, wrapField(session.position + 30));
    const badBefore = hiddenBad(prepared);
    const goodBefore = hiddenGood(prepared);
    const state = moveBy(prepared, context, 2, 'left');
    expect(head(state)).toEqual({
      kind: 'notice',
      notice: { type: 'cards_converted', count: 1, source: 'detour' },
    });
    const landedWasBad = state.reveal?.kind === 'normal' && state.reveal.group === 'bad' ? 1 : 0;
    const landedWasGood = state.reveal?.kind === 'normal' && state.reveal.group === 'good' ? 1 : 0;
    expect(hiddenBad(state)).toBe(badBefore - 1 - landedWasBad);
    expect(hiddenGood(state)).toBe(goodBefore + 1 - landedWasGood);
    expect(state.stats).toMatchObject({ detours: 1, detourConversions: 1 });
  });

  it('respects the cap and runs out of bad cards gracefully', () => {
    const { session, context } = readyToRoll();
    const capped = {
      ...context,
      rules: { ...context.rules, detourConversion: 2, maxDetourConversions: 3 },
    };
    expect(detourConversionsAvailable(session, capped.rules)).toBe(2);
    expect(
      detourConversionsAvailable(
        { ...session, stats: { ...session.stats, detourConversions: 2 } },
        capped.rules,
      ),
    ).toBe(1);
    expect(
      detourConversionsAvailable(
        { ...session, stats: { ...session.stats, detourConversions: 3 } },
        capped.rules,
      ),
    ).toBe(0);

    const noBad = {
      ...session,
      cards: session.cards.map((card) =>
        card.kind === 'normal' ? { ...card, group: 'good' as const } : card,
      ),
    };
    const state = moveBy(withGoal(noBad, wrapField(session.position + 30)), context, 2, 'left');
    expect(
      state.pending.some((step) => step.kind === 'notice' && step.notice.type === 'cards_converted'),
    ).toBe(false);
    expect(state.stats.detours).toBe(1);
  });
});

describe('goal drift (§8.8)', () => {
  const driftRules = { goalDriftRange: [3, 8], goalDriftWidenStep: 4, goalDriftMaxDistance: 20 } as const;
  const fixedRng = (value: number) => ({ next: () => value, state: 0 });

  it('prefers undiscovered fields 3–8 away and falls back when none exist', () => {
    const { session } = readyToRoll();
    const base = withGoal(session, 50);
    for (let step = 0; step < 10; step++) {
      const target = findDriftTarget({ ...base, position: 45 }, fixedRng(step / 10), driftRules);
      expect(target).toBeDefined();
      expect(shortDistance(target ?? 0, 50)).toBeGreaterThanOrEqual(3);
      expect(shortDistance(target ?? 0, 50)).toBeLessThanOrEqual(8);
      expect(target).not.toBe(45);
    }
    const allDiscoveredNearby = {
      ...base,
      position: 45,
      cards: base.cards.map((card) =>
        shortDistance(card.field, 50) <= 20 && card.kind !== 'goal' ? { ...card, discovered: true } : card,
      ),
    };
    const far = findDriftTarget(allDiscoveredNearby, fixedRng(0.5), driftRules);
    expect(shortDistance(far ?? 0, 50)).toBeGreaterThan(20);
  });
});

describe('collectibles (§9.4)', () => {
  function landOnCollectible(state: SessionState, context: EngineContext, discovered = false) {
    const target = wrapField(state.position + 1);
    const prepared = withCard(withGoal(state, wrapField(state.position + 50)), {
      field: target,
      kind: 'collectible',
      folderId: 'perf-a',
      imageHash: `perf-${target}`.padEnd(40, '0'),
      taskCount: 9,
      discovered,
      ...(discovered ? { collected: true } : {}),
    });
    return moveBy(prepared, context, 1, 'right');
  }

  it('collects on the first landing and grants each tier once', () => {
    const { session, context } = readyToRoll();
    // Goal placed like the helper does, so the count below only sees the tier conversion
    let state: SessionState = { ...withGoal(session, wrapField(session.position + 50)), collected: 2 };
    const badBefore = hiddenBad(state, wrapField(state.position + 1));
    state = landOnCollectible(state, context);
    expect(state.collected).toBe(3);
    expect(state.reachedTiers).toEqual([3]);
    expect(state.pending).toEqual([
      { kind: 'task', count: 9, pace: null },
      {
        kind: 'notice',
        notice: { type: 'collectible_tier', collected: 3, bonus: { type: 'convert_bad', count: 5 } },
      },
    ]);
    expect(hiddenBad(state)).toBe(badBefore - 5);
    // Keep the collected counter consistent with the cards for the next landing
    state = run(state, context, { type: 'confirm' }, { type: 'confirm' });
    state = landOnCollectible(state, context);
    expect(state.reachedTiers).toEqual([3, 4]);
    expect(state.pending.at(-1)).toMatchObject({
      notice: { type: 'collectible_tier', collected: 4, bonus: { type: 'release_chance', percent: 5 } },
    });
  });

  it('a revisit shows only a stroke task (10–25) and no bonus', () => {
    const { session, context } = readyToRoll();
    const state = landOnCollectible({ ...session, collected: 1 }, context, true);
    expect(state.collected).toBe(1);
    expect(state.pending).toHaveLength(1);
    const task = head(state);
    if (task?.kind !== 'task') throw new Error('expected task');
    expect(task.count).toBeGreaterThanOrEqual(10);
    expect(task.count).toBeLessThanOrEqual(25);
    expect(task.tierable).toBeUndefined();
    expect(state.stats.revisitConversions).toBe(0);
  });
});

describe('forced reversal (§8.7)', () => {
  it('forces the opposite direction for one move, never twice in a row', () => {
    const { session, context } = readyToRoll();
    const always = { ...context, rules: { ...context.rules, forcedReversalChance: 1 } };
    let state = moveBy(withGoal(session, wrapField(session.position + 50)), always, 1, 'right');
    while (state.phase === 'resolve_card') state = run(state, always, { type: 'confirm' });
    expect(state.forcedDirection).toBe('left');

    state = run({ ...state, chooseNextRoll: true }, always, { type: 'chooseRoll', value: 1 });
    expect(reduce(state, { type: 'chooseDirection', direction: 'right' }, always).error).toBe(
      'direction_blocked',
    );
    state = run(state, always, { type: 'chooseDirection', direction: 'left' });
    while (state.phase === 'resolve_card') state = run(state, always, { type: 'confirm' });
    expect(state.stats.forcedReversals).toBe(1);
    expect(state.forcedDirection).toBeNull(); // not twice in a row
  });
});

describe('Redemption (§10.1)', () => {
  it('converts 3–5 bad cards, or reports nothing to convert', () => {
    const ready = readyToRoll();
    const { context } = ready;
    const session = withGoal(ready.session, wrapField(ready.session.position + 50));
    const before = hiddenBad(session, wrapField(session.position + 1));
    const state = landOnAction(session, context, 'redemption');
    const notice = head(state);
    if (notice?.kind !== 'notice' || notice.notice.type !== 'cards_converted')
      throw new Error('expected conversion');
    expect(notice.notice.count).toBeGreaterThanOrEqual(3);
    expect(notice.notice.count).toBeLessThanOrEqual(5);
    expect(hiddenBad(state)).toBe(before - notice.notice.count);

    const noBad = {
      ...session,
      cards: session.cards.map((card) =>
        card.kind === 'normal' ? { ...card, group: 'good' as const } : card,
      ),
    };
    expect(head(landOnAction(noBad, context, 'redemption'))).toEqual({
      kind: 'notice',
      notice: { type: 'nothing_to_convert' },
    });
  });
});

describe('revisit penalty (§8.5, §14.1)', () => {
  function revisit(group: 'good' | 'bad') {
    const { session, context } = readyToRoll();
    const target = wrapField(session.position + 1);
    const state = withCard(withGoal(session, wrapField(session.position + 50)), {
      field: target,
      kind: 'normal',
      group,
      folderId: `${group}-a`,
      taskCount: 5,
      discovered: true,
    });
    return moveBy(state, context, 1, 'right');
  }

  it('a revisited good field turns bad and costs release chance', () => {
    const state = revisit('good');
    expect(state.stats.revisitConversions).toBe(1);
    expect(state.stats.revisitPenalties).toBe(1);
    expect(state.pending.at(-1)).toMatchObject({ kind: 'task', revisit: 'converted', revisitPenalty: 0.5 });
  });

  it('a revisited bad field costs nothing extra', () => {
    const state = revisit('bad');
    expect(state.stats.revisitConversions).toBe(1);
    expect(state.stats.revisitPenalties).toBe(0);
    expect(state.pending.at(-1)).not.toHaveProperty('revisitPenalty');
  });
});
