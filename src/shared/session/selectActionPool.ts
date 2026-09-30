import { actionGroup, type ActionId } from '../actions';
import type { Group } from '../game';
import { chance, pickWeighted, randInt, type Rng } from './rng';
import type { ActionCardDefinition, Range } from './types';

const REQUIRE_REPLACE_ATTEMPTS = 10;

interface SelectActionPoolInput {
  cards: readonly ActionCardDefinition[];
  /** Progression reward "block a bad action for the next session" (definition ids). */
  blocked: readonly string[];
  size: Range;
}

export const cardGroup = (card: Pick<ActionCardDefinition, 'type'>): Group => actionGroup(card.type);

/** Any-of dependency on resolver types; no dependency is always met. */
export const requirementMet = (
  card: Pick<ActionCardDefinition, 'requires'>,
  presentTypes: ReadonlySet<ActionId>,
): boolean =>
  !card.requires || card.requires.length === 0 || card.requires.some((type) => presentTypes.has(type));

/**
 * game-design §6.4 v2 – the action card definitions that can appear in this session:
 * gates and blocks first, guaranteed cards (`minPerSession > 0`) always, at least one good and one bad
 * card when available, then a weighted pick without replacement up to the rolled size.
 * Cards whose `requires` is not in the pool are replaced (10 attempts) or dropped.
 */
export function selectActionPool(
  rng: Rng,
  { cards, blocked, size }: SelectActionPoolInput,
): ActionCardDefinition[] {
  const candidates = cards.filter(
    (card) =>
      card.enabled &&
      (card.weight > 0 || card.minPerSession > 0) &&
      !blocked.includes(card.id) &&
      (card.sessionChance === null || chance(rng, card.sessionChance)),
  );
  const target = randInt(rng, Math.round(size[0]), Math.round(size[1]));
  const pool = candidates.filter((card) => card.minPerSession > 0);
  const remaining = () => candidates.filter((card) => !pool.includes(card) && card.weight > 0);
  const pickFrom = (list: readonly ActionCardDefinition[]) => pickWeighted(rng, list, (card) => card.weight);

  for (const group of ['good', 'bad'] as const) {
    if (pool.length >= target || pool.some((card) => cardGroup(card) === group)) continue;
    const picked = pickFrom(remaining().filter((card) => cardGroup(card) === group));
    if (picked) pool.push(picked);
  }
  while (pool.length < target) {
    const picked = pickFrom(remaining());
    if (!picked) break;
    pool.push(picked);
  }

  const types = () => new Set(pool.map((card) => card.type));
  for (let index = 0; index < pool.length; index++) {
    const current = pool[index] as ActionCardDefinition;
    if (requirementMet(current, types())) continue;
    let replacement: ActionCardDefinition | undefined;
    for (let attempt = 0; attempt < REQUIRE_REPLACE_ATTEMPTS && !replacement; attempt++) {
      const candidate = pickFrom(remaining());
      if (candidate && requirementMet(candidate, new Set([...types(), candidate.type])))
        replacement = candidate;
    }
    if (replacement) pool[index] = replacement;
    else pool.splice(index--, 1);
  }
  return pool;
}
