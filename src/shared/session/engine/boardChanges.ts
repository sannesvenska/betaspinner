import { randInt, shuffle, type Rng } from '../rng';
import { shortDistance, wrapField } from '../track';
import type { Card, Direction, ResolutionStep, SessionRules, SessionState } from '../types';
import { freshNormalCard } from './cardImages';
import type { EngineContext } from './context';
import { directionSign } from './effects';
import { swapGoal } from './relocation';

const isHiddenBadNormal = (card: Card): boolean =>
  card.kind === 'normal' && card.group === 'bad' && !card.discovered;

/**
 * Converts up to `count` random undiscovered bad normal cards into good ones (§8.4, Redemption,
 * collectible tier). Collectibles and action cards are never touched. Returns the converted count.
 */
export function convertBadToGood(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  count: number,
): number {
  const fields = shuffle(
    rng,
    draft.cards.filter(isHiddenBadNormal).map((card) => card.field),
  ).slice(0, Math.max(0, count));
  for (const field of fields) {
    const card = draft.cards[field - 1];
    if (card) draft.cards[field - 1] = freshNormalCard(draft, rng, context, card, 'good');
  }
  return fields.length;
}

/** §8.4: a move is a detour when the shortest distance to the goal (before the move) grows. */
export const isDetour = (from: number, to: number, goalField: number): boolean =>
  shortDistance(to, goalField) > shortDistance(from, goalField);

/** How many cards a detour would convert right now (cap and remaining bad cards applied). */
export function detourConversionsAvailable(
  state: Pick<SessionState, 'cards' | 'stats'>,
  rules: Pick<SessionRules, 'detourConversion' | 'maxDetourConversions'>,
): number {
  const capLeft =
    rules.maxDetourConversions === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, rules.maxDetourConversions - state.stats.detourConversions);
  const hiddenBad = state.cards.filter(isHiddenBadNormal).length;
  return Math.min(rules.detourConversion, capLeft, hiddenBad);
}

export function applyDetour(draft: SessionState, rng: Rng, context: EngineContext): ResolutionStep[] {
  draft.stats.detours++;
  const converted = convertBadToGood(draft, rng, context, detourConversionsAvailable(draft, context.rules));
  if (converted === 0) return [];
  draft.stats.detourConversions += converted;
  return [{ kind: 'notice', notice: { type: 'cards_converted', count: converted, source: 'detour' } }];
}

/** True when a rolled move passes over `field` without landing on it (§8.8). */
export function passesOver(from: number, direction: Direction, steps: number, field: number): boolean {
  const sign = directionSign(direction);
  for (let step = 1; step < steps; step++) if (wrapField(from + sign * step) === field) return true;
  return false;
}

/**
 * §8.8 goal drift target: an undiscovered non-goal field within `goalDriftRange` of the goal (never the
 * player's field). The range widens up to `goalDriftMaxDistance`, then any undiscovered field is used.
 */
export function findDriftTarget(
  state: Pick<SessionState, 'cards' | 'position' | 'goalField'>,
  rng: Rng,
  rules: Pick<SessionRules, 'goalDriftRange' | 'goalDriftWidenStep' | 'goalDriftMaxDistance'>,
): number | undefined {
  const free = state.cards.filter(
    (card) => card.kind !== 'goal' && !card.discovered && card.field !== state.position,
  );
  const [min] = rules.goalDriftRange;
  const pick = (candidates: readonly Card[]) => candidates[randInt(rng, 0, candidates.length - 1)]?.field;
  for (let max = rules.goalDriftRange[1]; ; max += rules.goalDriftWidenStep) {
    const limit = Math.min(max, rules.goalDriftMaxDistance);
    const inRange = free.filter((card) => {
      const distance = shortDistance(card.field, state.goalField);
      return distance >= min && distance <= limit;
    });
    if (inRange.length > 0) return pick(inRange);
    if (limit >= rules.goalDriftMaxDistance) break;
  }
  return free.length > 0 ? pick(free) : undefined;
}

export function applyGoalDrift(draft: SessionState, rng: Rng, context: EngineContext): ResolutionStep[] {
  const target = findDriftTarget(draft, rng, context.rules);
  if (target === undefined) return [];
  const from = draft.goalField;
  swapGoal(draft, target);
  draft.stats.goalDrifts++;
  return [{ kind: 'notice', notice: { type: 'goal_drifted', from, to: target } }];
}

/** §9.4 first landing on a collectible: count it and grant every newly reached tier once. */
export function collect(draft: SessionState, rng: Rng, context: EngineContext): ResolutionStep[] {
  draft.collected++;
  const steps: ResolutionStep[] = [];
  for (const tier of context.rules.collectibleTiers) {
    if (tier.collected > draft.collected || draft.reachedTiers.includes(tier.collected)) continue;
    draft.reachedTiers.push(tier.collected);
    const bonus =
      tier.bonus.type === 'convert_bad'
        ? { ...tier.bonus, count: convertBadToGood(draft, rng, context, tier.bonus.count) }
        : tier.bonus;
    steps.push({ kind: 'notice', notice: { type: 'collectible_tier', collected: tier.collected, bonus } });
  }
  return steps;
}
