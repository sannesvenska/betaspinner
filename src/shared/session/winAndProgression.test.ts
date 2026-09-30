import { describe, expect, it } from 'vitest';
import { DEFAULT_PENALTY_RULES, DEFAULT_PROGRESSION } from './defaults';
import { readyToRoll, run, withCard } from './engine/engineTestKit';
import { reduce } from './engine/reduce';
import { computeReleaseChance } from './engine/releaseChance';
import { applyEffect } from './engine/effects';
import { applyDecay, applySessionOutcome, nextDecayAt } from './progressionRules';
import { createRng } from './rng';
import { wrapField } from './track';
import type { SessionState } from './types';

/** Lands exactly on the goal one field to the right. */
function reachGoal(seed = 1): { state: SessionState; context: ReturnType<typeof readyToRoll>['context'] } {
  const { session, context } = readyToRoll({ seed });
  const goalField = wrapField(session.position + 1);
  const oldGoal = session.goalField;
  let state = withCard(
    { ...session, goalField, chooseNextRoll: true },
    { field: goalField, kind: 'goal', discovered: false },
  );
  state = withCard(state, { field: oldGoal, kind: 'normal', group: 'bad', taskCount: 5, folderId: 'bad-a' });
  state = run(
    state,
    context,
    { type: 'chooseRoll', value: 1 },
    { type: 'chooseDirection', direction: 'right' },
  );
  return { state, context };
}

describe('win flow (§14)', () => {
  it('computes the release chance: floor((discovered × 0.4 + bonus) × multiplier), clamped to 1..95', () => {
    const { state } = reachGoal();
    const rules = {
      chancePerDiscovered: 0.4,
      winChanceBounds: [1, 95] as const,
      collectibleTiers: [{ collected: 4, bonus: { type: 'release_chance' as const, percent: 5 } }],
    };
    const discoveredCards = (count: number) =>
      state.cards.map((card, index) => ({ ...card, discovered: index < count }));
    expect(
      computeReleaseChance({ cards: discoveredCards(35), effects: [], reachedTiers: [] }, rules),
    ).toEqual({
      discovered: 35,
      rate: 0.4,
      base: 35 * 0.4,
      bonus: 0,
      multiplier: 1,
      finalChance: 14,
    });
    const multiplied = applyEffect([], { type: 'success_multiplier', value: 2 }, 0);
    expect(
      computeReleaseChance({ cards: discoveredCards(41), effects: multiplied, reachedTiers: [4] }, rules)
        .finalChance,
    ).toBe(Math.floor((41 * 0.4 + 5) * 2));
    expect(
      computeReleaseChance({ cards: discoveredCards(1), effects: [], reachedTiers: [] }, rules).finalChance,
    ).toBe(1);
    const tripled = applyEffect([], { type: 'success_multiplier', value: 3 }, 0);
    expect(
      computeReleaseChance({ cards: discoveredCards(99), effects: tripled, reachedTiers: [] }, rules)
        .finalChance,
    ).toBe(95);
  });

  it('runs goal → final wheel → outcome → ended (no win-check roll)', () => {
    const { state: atGoal, context } = reachGoal();
    expect(atGoal.phase).toBe('final_wheel');
    expect(reduce(atGoal, { type: 'endEarly' }, context).error).toBe('invalid_event');
    expect(atGoal.winCheck).toMatchObject({ discovered: 1, finalChance: 1 }); // only the start card
    let state = atGoal;
    expect(reduce(state, { type: 'finishFinalWheel' }, context).error).toBe('invalid_event');

    state = run(state, context, { type: 'startFinalWheel' });
    expect(state.finalWheel?.holdSeconds).toBe(1);
    expect(state.finalWheel?.landing).toBeGreaterThanOrEqual(0.1);
    expect(state.finalWheel?.landing).toBeLessThanOrEqual(0.9);
    expect(reduce(state, { type: 'startFinalWheel' }, context).error).toBe('invalid_event'); // decided once

    state = run(state, context, { type: 'finishFinalWheel' });
    expect(state.phase).toBe('outcome');
    const ended =
      state.finalWheel?.result === 'denied'
        ? run(state, context, { type: 'confirm' } as never)
        : run(state, context, { type: 'chooseOutcome', outcome: 'interrupted' });
    expect(ended.phase).toBe('ended');
    expect(ended.endReason).toBe(state.finalWheel?.result === 'denied' ? 'denied' : 'interrupted');
  });

  it('caps the Hold Position countdown (§14.2 v2)', () => {
    const { state, context } = reachGoal();
    const many = {
      ...state,
      winCheck: { ...(state.winCheck as NonNullable<SessionState['winCheck']>), discovered: 80 },
    };
    expect(run(many, context, { type: 'startFinalWheel' }).finalWheel?.holdSeconds).toBe(60);
  });

  it('allows success in about finalChance % of wheels', () => {
    let allowed = 0;
    const runs = 400;
    for (let seed = 1; seed <= runs; seed++) {
      const { state, context } = reachGoal(seed);
      const wheel = run(
        {
          ...state,
          phase: 'final_wheel',
          winCheck: { discovered: 30, rate: 1, base: 30, bonus: 0, multiplier: 1, finalChance: 30 },
        },
        context,
        {
          type: 'startFinalWheel',
        },
      );
      if (wheel.finalWheel?.result === 'allowed') allowed++;
    }
    expect(allowed / runs).toBeGreaterThan(0.24);
    expect(allowed / runs).toBeLessThan(0.36);
  });

  it('success requires a reward; block_bad_action picks an enabled bad action', () => {
    const { state, context } = reachGoal();
    const outcome = {
      ...state,
      phase: 'outcome' as const,
      finalWheel: { result: 'allowed' as const, landing: 0.5, holdSeconds: 3 },
    };
    expect(reduce(outcome, { type: 'chooseOutcome', outcome: 'success' }, context).error).toBe(
      'invalid_value',
    );
    const ended = run(outcome, context, {
      type: 'chooseOutcome',
      outcome: 'success',
      reward: 'block_bad_action',
    });
    expect(ended.reward?.type).toBe('block_bad_action');
    if (ended.reward?.type === 'block_bad_action') {
      expect(ended.reward.action).not.toBe('mistress_says_no');
      expect(context.actionCards.map((card) => card.id)).toContain(ended.reward.actionCardId);
    }
  });
});

describe('progression rules (§13, §14.3)', () => {
  const rng = () => createRng(1);
  const base = { ...DEFAULT_PROGRESSION, penaltyFields: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
  const finished = (endReason: SessionState['endReason'], extra: Partial<SessionState> = {}) => ({
    endReason,
    reward: null,
    penaltyFieldsRemoved: 0,
    ...extra,
  });

  it('escalates losses by step × streak and caps at the maximum', () => {
    let progression = { ...DEFAULT_PROGRESSION };
    const added: number[] = [];
    for (let i = 0; i < 6; i++) {
      const result = applySessionOutcome(progression, finished('ended_early'), DEFAULT_PENALTY_RULES, rng());
      added.push(result.change.penaltyFieldsAdded);
      progression = result.progression;
    }
    expect(added).toEqual([2, 4, 6, 8, 10, 10]); // 2+4+6+8+10 = 30, then cap 40
    expect(progression.penaltyFields).toHaveLength(40);
    expect(new Set(progression.penaltyFields).size).toBe(40);
    expect(progression.lossStreak).toBe(6);
  });

  it('applies success rewards and resets the loss streak', () => {
    const streaked = { ...base, lossStreak: 3 };
    const removed = applySessionOutcome(
      streaked,
      finished('success', { reward: { type: 'remove_penalty_fields' } }),
      DEFAULT_PENALTY_RULES,
      rng(),
    );
    expect(removed.progression.penaltyFields).toHaveLength(6);
    expect(removed.progression.lossStreak).toBe(0);

    const chance = applySessionOutcome(
      base,
      finished('success', { reward: { type: 'increase_good_chance' } }),
      DEFAULT_PENALTY_RULES,
      rng(),
    );
    expect(chance.progression.goodChance).toBe(0.43);

    const blocked = applySessionOutcome(
      base,
      finished('success', {
        reward: { type: 'block_bad_action', actionCardId: 'pixelate', action: 'pixelate' },
      }),
      DEFAULT_PENALTY_RULES,
      rng(),
    );
    expect(blocked.progression.blockedActionsNextSession).toEqual(['pixelate']);
  });

  it('interrupted removes 2, no result removes 2 and lowers the good chance', () => {
    expect(
      applySessionOutcome(base, finished('interrupted'), DEFAULT_PENALTY_RULES, rng()).progression
        .penaltyFields,
    ).toHaveLength(8);
    const noResult = applySessionOutcome(base, finished('no_result'), DEFAULT_PENALTY_RULES, rng());
    expect(noResult.progression.penaltyFields).toHaveLength(8);
    expect(noResult.progression.goodChance).toBe(0.385);
  });

  it('denied is neutral and keeps the loss streak', () => {
    const streaked = { ...base, lossStreak: 2 };
    const result = applySessionOutcome(streaked, finished('denied'), DEFAULT_PENALTY_RULES, rng());
    expect(result.progression).toEqual(streaked);
  });

  it('adds Guessing Game removals to any outcome', () => {
    const result = applySessionOutcome(
      base,
      finished('denied', { penaltyFieldsRemoved: 4 }),
      DEFAULT_PENALTY_RULES,
      rng(),
    );
    expect(result.progression.penaltyFields).toHaveLength(6);
  });

  it('clamps the good chance to its bounds', () => {
    const high = { ...base, goodChance: 0.69 };
    expect(
      applySessionOutcome(
        high,
        finished('success', { reward: { type: 'increase_good_chance' } }),
        DEFAULT_PENALTY_RULES,
        rng(),
      ).progression.goodChance,
    ).toBe(0.7);
  });

  it('decays 2 fields per full hour and keeps the remainder', () => {
    const start = new Date('2026-09-29T10:00:00.000Z');
    const progression = { ...base, lastDecayAt: start.toISOString() };
    const later = applyDecay(progression, new Date('2026-09-29T12:30:00.000Z'), DEFAULT_PENALTY_RULES, rng());
    expect(later.penaltyFields).toHaveLength(6);
    expect(later.lastDecayAt).toBe('2026-09-29T12:00:00.000Z');
    expect(nextDecayAt(later)?.toISOString()).toBe('2026-09-29T13:00:00.000Z');
    expect(applyDecay(later, new Date('2026-09-29T12:59:00.000Z'), DEFAULT_PENALTY_RULES, rng())).toBe(later);
  });

  it('starts the decay clock when none is set', () => {
    const now = new Date('2026-09-29T10:00:00.000Z');
    expect(applyDecay(base, now, DEFAULT_PENALTY_RULES, rng()).lastDecayAt).toBe(now.toISOString());
  });
});
