import { pickWeightedIndex, type Rng } from './rng';
import type { Progression, SessionRules } from './types';

export interface CategoryCandidate {
  id: string;
  selectionWeight: number;
}

interface SelectCategoriesInput {
  candidates: readonly CategoryCandidate[];
  count: number;
  usage: Progression['categoryUsage'];
  sessionIndex: number;
  rules: Pick<SessionRules, 'cooldownSessions' | 'freshnessBonus' | 'freshnessCap'>;
}

/**
 * game-design §6.2 – weighted pick without replacement with cooldown and freshness bonus.
 * Candidates must already be filtered to eligible folders of one group.
 * Returns fewer ids than `count` only if fewer candidates exist.
 */
export function selectCategories(
  rng: Rng,
  { candidates, count, usage, sessionIndex, rules }: SelectCategoriesInput,
): string[] {
  const sessionsSinceUse = (id: string): number => {
    const lastUsed = usage[id]?.lastUsedSessionIndex;
    // Never used counts as maximally fresh
    return lastUsed === undefined ? Number.POSITIVE_INFINITY : sessionIndex - lastUsed;
  };

  const fresh = candidates.filter((candidate) => sessionsSinceUse(candidate.id) > rules.cooldownSessions);
  const pool = [...fresh];
  if (pool.length < count) {
    // Small libraries: relax cooldown gracefully, longest-unused first
    const cooling = candidates
      .filter((candidate) => !fresh.includes(candidate))
      .sort((a, b) => sessionsSinceUse(b.id) - sessionsSinceUse(a.id));
    pool.push(...cooling.slice(0, count - pool.length));
  }

  const score = (candidate: CategoryCandidate): number =>
    candidate.selectionWeight *
    (1 + rules.freshnessBonus * Math.min(sessionsSinceUse(candidate.id), rules.freshnessCap));

  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = pickWeightedIndex(rng, pool.map(score)) ?? 0;
    const [chosen] = pool.splice(index, 1);
    if (chosen) picked.push(chosen.id);
  }
  return picked;
}
