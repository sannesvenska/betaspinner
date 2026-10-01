import type { ActiveEffect, Card, Direction, EffectType, Pace } from '../types';

/**
 * game-design §11 effects engine – pure functions over the effect list.
 * One instance per effect type; stacking rules are applied on `applyEffect`.
 */

export const NEGATIVE_EFFECTS: readonly EffectType[] = [
  'double_trouble',
  'pace_slow',
  'pace_fast',
  'u_turn',
  'pixelate',
  'splatter',
];

const DOUBLE_TROUBLE_MULTIPLIER = 2;

const find = (effects: readonly ActiveEffect[], type: EffectType) =>
  effects.find((effect) => effect.type === type);
const without = (effects: readonly ActiveEffect[], ...types: EffectType[]) =>
  effects.filter((effect) => !types.includes(effect.type));

export type EffectChange =
  | { type: 'double_trouble'; rounds: number }
  | { type: 'pace_slow' | 'pace_fast'; rounds: number }
  | { type: 'u_turn'; rounds: number; blocked: Direction }
  | { type: 'pixelate'; maxLevel: number }
  | { type: 'splatter' }
  | { type: 'success_multiplier'; value: number }
  | { type: 'shield' };

export const directionSign = (direction: Direction): number => (direction === 'right' ? 1 : -1);

export function applyEffect(
  effects: readonly ActiveEffect[],
  change: EffectChange,
  round: number,
): ActiveEffect[] {
  const existing = find(effects, change.type);
  const base = { id: change.type, type: change.type, createdRound: round };
  switch (change.type) {
    case 'double_trouble':
      // Re-trigger adds rounds instead of stacking the multiplier
      return [
        ...without(effects, 'double_trouble'),
        { ...base, remainingRounds: (existing?.remainingRounds ?? 0) + change.rounds },
      ];
    case 'pace_slow':
    case 'pace_fast':
      // Mutually exclusive, newest wins
      return [...without(effects, 'pace_slow', 'pace_fast'), { ...base, remainingRounds: change.rounds }];
    case 'u_turn':
      return [
        ...without(effects, 'u_turn'),
        { ...base, remainingRounds: change.rounds, value: directionSign(change.blocked) },
      ];
    case 'pixelate':
      return [
        ...without(effects, 'pixelate'),
        { ...base, value: Math.min(change.maxLevel, (existing?.value ?? 0) + 1) },
      ];
    case 'splatter':
      return existing ? [...effects] : [...effects, base];
    case 'success_multiplier':
      // Highest value is kept
      return [
        ...without(effects, 'success_multiplier'),
        { ...base, value: Math.max(existing?.value ?? 0, change.value) },
      ];
    case 'shield':
      return existing ? [...effects] : [...effects, base];
  }
}

/** Pixelate loses one level; every other effect is removed completely. */
export function removeEffect(effects: readonly ActiveEffect[], type: EffectType): ActiveEffect[] {
  const existing = find(effects, type);
  if (type === 'pixelate' && existing && (existing.value ?? 0) > 1) {
    return effects.map((effect) =>
      effect.type === 'pixelate' ? { ...effect, value: (effect.value ?? 1) - 1 } : effect,
    );
  }
  return without(effects, type);
}

/** Ends a round: round-based effects created before this round lose one round and expire at 0. */
export function tickRound(effects: readonly ActiveEffect[], round: number): ActiveEffect[] {
  return effects.flatMap((effect) => {
    if (effect.remainingRounds === undefined || effect.createdRound >= round) return [effect];
    const remainingRounds = effect.remainingRounds - 1;
    return remainingRounds > 0 ? [{ ...effect, remainingRounds }] : [];
  });
}

export const getTaskMultiplier = (effects: readonly ActiveEffect[]): number =>
  find(effects, 'double_trouble') ? DOUBLE_TROUBLE_MULTIPLIER : 1;

export const getPace = (effects: readonly ActiveEffect[]): Pace | null =>
  find(effects, 'pace_slow') ? 'slow' : find(effects, 'pace_fast') ? 'fast' : null;

export function getBlockedDirection(effects: readonly ActiveEffect[]): Direction | null {
  const uTurn = find(effects, 'u_turn');
  if (!uTurn) return null;
  return (uTurn.value ?? 0) > 0 ? 'right' : 'left';
}

export const getSuccessMultiplier = (effects: readonly ActiveEffect[]): number =>
  find(effects, 'success_multiplier')?.value ?? 1;

export const getPixelLevel = (effects: readonly ActiveEffect[]): number =>
  find(effects, 'pixelate')?.value ?? 0;

export const hasEffect = (effects: readonly ActiveEffect[], type: EffectType): boolean =>
  find(effects, type) !== undefined;

export const activeNegativeEffects = (effects: readonly ActiveEffect[]): EffectType[] =>
  effects.filter((effect) => NEGATIVE_EFFECTS.includes(effect.type)).map((effect) => effect.type);

/** Visual effects never touch action cards or the goal (§12.1). */
export const canSplatter = (card: Card): boolean => card.kind !== 'goal' && card.kind !== 'action';

/** Visual state for the renderer (§12). Splatter lives on the cards themselves. */
export function getVisualState(effects: readonly ActiveEffect[], card: Card | null) {
  return { pixelLevel: getPixelLevel(effects), splatterSeed: card?.splatterSeed ?? null };
}
