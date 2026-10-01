import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '../../config/gameConfig';
import { DEFAULT_DRAFT_CONFIG, draftOutcome, type DraftOutcome, type DraftState } from '../../draft';
import { DEFAULT_SESSION_RULES } from '../defaults';
import { generateSession } from '../generateSession';
import { standardInput } from '../testFixtures';
import { wrapField } from '../track';
import type { ActiveEffect, SessionState } from '../types';
import { head, landOnAction, readyToRoll, run, withCard } from './engineTestKit';
import { getPixelLevel, hasEffect } from './effects';
import { reduce } from './reduce';
import type { EngineContext } from './context';

const RULES = DEFAULT_SESSION_RULES;
const pixelate = (value: number): ActiveEffect => ({
  id: 'pixelate',
  type: 'pixelate',
  value,
  createdRound: 0,
});
const splatter: ActiveEffect = { id: 'splatter', type: 'splatter', createdRound: 0 };
const splattered = (state: SessionState) => state.cards.filter((card) => card.splatterSeed !== undefined);

/** Splatters the first `count` non-goal cards. */
function withSplatter(state: SessionState, count: number): SessionState {
  let marked = 0;
  const cards = state.cards.map((card) => {
    if (card.kind === 'goal' || marked >= count) return card;
    marked++;
    return { ...card, splatterSeed: marked };
  });
  return {
    ...state,
    cards,
    effects: [...state.effects.filter((effect) => effect.type !== 'splatter'), splatter],
  };
}

function landOnCollectible(state: SessionState, context: EngineContext): SessionState {
  const target = wrapField(state.position + 1);
  const prepared = withCard(
    { ...state, phase: 'roll', chooseNextRoll: true, forcedDirection: null },
    {
      field: target,
      kind: 'collectible',
      folderId: 'perf-a',
      imageHash: `perf-${target}`.padEnd(40, '0'),
      taskCount: 9,
      discovered: false,
    },
  );
  return run(
    prepared,
    context,
    { type: 'chooseRoll', value: 1 },
    { type: 'chooseDirection', direction: 'right' },
  );
}

describe('defaults (former beta mode, the only mode since 2026-10-01)', () => {
  it('uses visible performer cards with pixelate relief and the splash draft', () => {
    expect(DEFAULT_GAME_CONFIG.rules).toMatchObject({
      collectibleCount: [5, 5],
      collectiblePixelateRelief: 1,
    });
    expect(DEFAULT_GAME_CONFIG.draft).toMatchObject({
      enabled: true,
      fieldCount: 12,
      picks: 6,
      composition: { pixelate: 6, splash: 3, bad: 2, good: 0, double: 1 },
      splashShare: 0.3,
    });
  });
});

describe('splash draft (§6.0)', () => {
  const draftWith = (picked: DraftState['board']): DraftState => ({
    id: 'draft',
    board: picked,
    picked: picked.map((_, index) => index),
    picks: picked.length,
  });
  const config = { ...DEFAULT_DRAFT_CONFIG, splashShare: 0.3 };

  it('splatters 30 % per splash field and caps pixelate at level 5', () => {
    const outcome = draftOutcome(
      draftWith(['pixelate', 'pixelate', 'pixelate', 'pixelate', 'splash', 'splash']),
      config,
      0.4,
    );
    expect(outcome.pixelLevel).toBe(5);
    expect(outcome.splatterShare).toBeCloseTo(0.6);
    const capped = draftOutcome(draftWith(['splash', 'splash', 'splash', 'splash']), config, 0.4);
    expect(capped.splatterShare).toBe(1);
  });

  it('starts the session with splattered cards and a splatter effect', () => {
    const draft: DraftOutcome = {
      counts: { bad: 0, good: 0, pixelate: 0, splash: 1, double: 0 },
      goodShare: 0.4,
      pixelLevel: 0,
      winMultiplier: 1,
      splatterShare: 0.3,
    };
    const { session } = generateSession(standardInput({ draft }));
    const splatterable = session.cards.filter((card) => card.kind !== 'goal' && card.kind !== 'action');
    expect(splattered(session)).toHaveLength(Math.round(splatterable.length * 0.3));
    // Action cards and the goal are never splattered (§12.1)
    expect(splattered(session).every((card) => card.kind !== 'goal' && card.kind !== 'action')).toBe(true);
    expect(hasEffect(session.effects, 'splatter')).toBe(true);
  });

  it('can deal Freshen Up in every session', () => {
    const pools = Array.from(
      { length: 40 },
      (_, seed) => generateSession(standardInput({ seed })).session.actionPool,
    );
    expect(pools.some((pool) => pool.includes('freshen_up'))).toBe(true);
  });
});

describe('performer cards (§9.4)', () => {
  it('lowers pixelate by one on the first landing', () => {
    const { session, context } = readyToRoll({ rules: RULES });
    const state = landOnCollectible({ ...session, effects: [pixelate(3)] }, context);
    expect(getPixelLevel(state.effects)).toBe(2);
    expect(state.pending).toContainEqual({ kind: 'notice', notice: { type: 'pixelate_relief', level: 2 } });
  });

  it('has only the normal effect at pixelate 0', () => {
    const { session, context } = readyToRoll({ rules: RULES });
    const state = landOnCollectible({ ...session, effects: [] }, context);
    expect(state.collected).toBe(1);
    expect(
      state.pending.some((step) => step.kind === 'notice' && step.notice.type === 'pixelate_relief'),
    ).toBe(false);
  });

  it('never lowers pixelate when the relief is set to 0', () => {
    const { session, context } = readyToRoll({ rules: { ...RULES, collectiblePixelateRelief: 0 } });
    const state = landOnCollectible({ ...session, effects: [pixelate(3)] }, context);
    expect(getPixelLevel(state.effects)).toBe(3);
  });
});

describe('Freshen Up (§10.1)', () => {
  it('lets the player choose when pixelate and splatter are active', () => {
    const { session, context } = readyToRoll({ rules: RULES });
    const prepared = withSplatter({ ...session, effects: [pixelate(2)] }, 20);
    const state = landOnAction(prepared, context, 'freshen_up');
    expect(head(state)).toEqual({
      kind: 'pick_effect',
      options: ['pixelate', 'splatter'],
      splatterShare: 0.3,
    });

    const cleaned = run(state, context, { type: 'pickEffect', effect: 'splatter' });
    expect(splattered(cleaned)).toHaveLength(14);
    expect(getPixelLevel(cleaned.effects)).toBe(2);
    expect(head(cleaned)).toEqual({ kind: 'notice', notice: { type: 'splatter_cleaned', count: 6 } });

    const lowered = run(state, context, { type: 'pickEffect', effect: 'pixelate' });
    expect(getPixelLevel(lowered.effects)).toBe(1);
    expect(splattered(lowered)).toHaveLength(20);
  });

  it('applies the only possible effect directly and ends splatter with the last card', () => {
    const { session, context } = readyToRoll({ rules: RULES });
    const state = landOnAction(withSplatter({ ...session, effects: [] }, 2), context, 'freshen_up');
    expect(head(state)).toEqual({ kind: 'notice', notice: { type: 'splatter_cleaned', count: 1 } });
    expect(splattered(state)).toHaveLength(1);
    expect(hasEffect(state.effects, 'splatter')).toBe(true);

    const last = landOnAction(run(state, context, { type: 'confirm' }), context, 'freshen_up');
    expect(splattered(last)).toHaveLength(0);
    expect(hasEffect(last.effects, 'splatter')).toBe(false);
  });

  it('reports nothing to remove without negative visual effects', () => {
    const { session, context } = readyToRoll({ rules: RULES });
    const state = landOnAction({ ...session, effects: [] }, context, 'freshen_up');
    expect(head(state)).toEqual({ kind: 'notice', notice: { type: 'nothing_to_remove' } });
    expect(reduce(state, { type: 'pickEffect', effect: 'pixelate' }, context).error).toBe('invalid_event');
  });
});

describe('Splatter action (§10.2)', () => {
  it('never splatters action cards', () => {
    const { session, context } = readyToRoll();
    const state = landOnAction({ ...session, effects: [] }, context, 'splatter');
    expect(splattered(state).length).toBeGreaterThan(0);
    expect(splattered(state).every((card) => card.kind !== 'action' && card.kind !== 'goal')).toBe(true);
  });
});
