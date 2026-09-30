import type { ReleaseChance, SessionRules, SessionState } from '../types';
import { getSuccessMultiplier } from './effects';

/** Floating point noise (0.4 × 35 = 14.000000000000002) must never cost a whole percent. */
const FLOOR_EPSILON = 1e-9;

/** Percent bonus of the collectible tiers reached so far (§9.4). */
export function collectibleBonusPercent(
  reachedTiers: readonly number[],
  tiers: SessionRules['collectibleTiers'],
): number {
  return tiers
    .filter((tier) => reachedTiers.includes(tier.collected))
    .reduce((sum, tier) => sum + (tier.bonus.type === 'release_chance' ? tier.bonus.percent : 0), 0);
}

/**
 * game-design §14.1 v2 – deterministic release chance, shown live in the console:
 * `clamp(floor((discovered × rate + bonus) × multiplier), min, max)`.
 */
export function computeReleaseChance(
  state: Pick<SessionState, 'cards' | 'effects' | 'reachedTiers'>,
  rules: Pick<SessionRules, 'chancePerDiscovered' | 'winChanceBounds' | 'collectibleTiers'>,
): ReleaseChance {
  const discovered = state.cards.filter((card) => card.discovered).length;
  const rate = rules.chancePerDiscovered;
  const base = discovered * rate;
  const bonus = collectibleBonusPercent(state.reachedTiers, rules.collectibleTiers);
  const multiplier = getSuccessMultiplier(state.effects);
  const [min, max] = rules.winChanceBounds;
  const finalChance = Math.min(max, Math.max(min, Math.floor((base + bonus) * multiplier + FLOOR_EPSILON)));
  return { discovered, rate, base, bonus, multiplier, finalChance };
}
