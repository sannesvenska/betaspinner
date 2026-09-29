import { describe, expect, it } from 'vitest';
import type { ActiveEffect } from '../types';
import {
  activeNegativeEffects,
  applyEffect,
  getBlockedDirection,
  getPace,
  getPixelLevel,
  getSuccessMultiplier,
  getTaskMultiplier,
  removeEffect,
  tickRound,
} from './effects';

const none: ActiveEffect[] = [];

describe('effects engine (§11)', () => {
  it('Double Trouble doubles tasks and re-triggering adds rounds', () => {
    let effects = applyEffect(none, { type: 'double_trouble', rounds: 3 }, 1);
    effects = applyEffect(effects, { type: 'double_trouble', rounds: 2 }, 2);
    expect(getTaskMultiplier(effects)).toBe(2);
    expect(effects).toEqual([
      { id: 'double_trouble', type: 'double_trouble', remainingRounds: 5, createdRound: 2 },
    ]);
  });

  it('pace effects are mutually exclusive, newest wins', () => {
    let effects = applyEffect(none, { type: 'pace_slow', rounds: 3 }, 1);
    effects = applyEffect(effects, { type: 'pace_fast', rounds: 2 }, 1);
    expect(getPace(effects)).toBe('fast');
    expect(effects).toHaveLength(1);
  });

  it('U Turn blocks a direction and refreshes rounds', () => {
    const effects = applyEffect(none, { type: 'u_turn', rounds: 2, blocked: 'left' }, 1);
    expect(getBlockedDirection(effects)).toBe('left');
    expect(
      getBlockedDirection(applyEffect(effects, { type: 'u_turn', rounds: 4, blocked: 'right' }, 2)),
    ).toBe('right');
  });

  it('Pixelate stacks up to the max level and removal lowers it by one', () => {
    let effects = none;
    for (let i = 0; i < 7; i++) effects = applyEffect(effects, { type: 'pixelate', maxLevel: 5 }, 1);
    expect(getPixelLevel(effects)).toBe(5);
    effects = removeEffect(effects, 'pixelate');
    expect(getPixelLevel(effects)).toBe(4);
    const single = applyEffect(none, { type: 'pixelate', maxLevel: 5 }, 1);
    expect(removeEffect(single, 'pixelate')).toEqual([]);
  });

  it('Hail Mary keeps the highest multiplier', () => {
    let effects = applyEffect(none, { type: 'success_multiplier', value: 2.5 }, 1);
    effects = applyEffect(effects, { type: 'success_multiplier', value: 1.5 }, 2);
    expect(getSuccessMultiplier(effects)).toBe(2.5);
    expect(getSuccessMultiplier(none)).toBe(1);
  });

  it('ticks only effects created before the current round and expires them at 0', () => {
    let effects = applyEffect(none, { type: 'double_trouble', rounds: 2 }, 3);
    effects = tickRound(effects, 3); // created this round → no tick
    expect(effects[0]?.remainingRounds).toBe(2);
    effects = tickRound(effects, 4);
    effects = tickRound(effects, 5);
    expect(effects).toEqual([]);
  });

  it('session-long effects never tick away', () => {
    const effects = applyEffect(
      applyEffect(none, { type: 'pixelate', maxLevel: 5 }, 1),
      { type: 'shield' },
      1,
    );
    expect(tickRound(tickRound(effects, 5), 6)).toEqual(effects);
  });

  it('lists only removable negative effects', () => {
    let effects = applyEffect(none, { type: 'shield' }, 1);
    effects = applyEffect(effects, { type: 'success_multiplier', value: 2 }, 1);
    effects = applyEffect(effects, { type: 'splatter' }, 1);
    expect(activeNegativeEffects(effects)).toEqual(['splatter']);
  });
});
