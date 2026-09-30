import type { ActionId } from '../actions';
import type { Group } from '../game';
import { pickWeighted, type Rng } from './rng';
import { cardGroup, requirementMet } from './selectActionPool';
import type { ActionCardDefinition } from './types';

const REQUIRE_REROLL_ATTEMPTS = 10;

/** Action card definition ids per group. */
export type ActionSlots = Record<Group, string[]>;

interface AssignActionSlotsInput {
  slotCounts: Readonly<Record<Group, number>>;
  /** The session's action pool (gates and blocks already applied). */
  pool: readonly ActionCardDefinition[];
}

const countOf = (slots: readonly string[], id: string): number => slots.filter((slot) => slot === id).length;

const hasCapacity = (card: ActionCardDefinition, slots: readonly string[]): boolean =>
  card.maxPerSession === null || countOf(slots, card.id) < card.maxPerSession;

/**
 * game-design §6.4 steps 3–5 on the session's action pool. Slots that cannot be filled (everything at
 * its max) are dropped – the caller turns them into normal cards.
 */
export function assignActionSlots(rng: Rng, { slotCounts, pool }: AssignActionSlotsInput): ActionSlots {
  const slots: ActionSlots = { good: [], bad: [] };
  for (const group of ['good', 'bad'] as const) {
    const groupCards = pool.filter((card) => cardGroup(card) === group);
    const target = slotCounts[group];
    const filled = slots[group];

    // 3: guaranteed minimums
    for (const card of groupCards) {
      const minimum = Math.min(card.minPerSession, card.maxPerSession ?? card.minPerSession);
      for (let i = 0; i < minimum && filled.length < target; i++) filled.push(card.id);
    }
    // 4: weighted fill within max
    while (filled.length < target) {
      const next = pickWeighted(
        rng,
        groupCards.filter((card) => hasCapacity(card, filled)),
        (card) => card.weight,
      );
      if (!next) break;
      filled.push(next.id);
    }
  }

  // 5: `requires` against the types actually on the board
  const byId = new Map(pool.map((card) => [card.id, card]));
  const presentTypes = () =>
    new Set<ActionId>(
      [...slots.good, ...slots.bad].flatMap((id) => {
        const type = byId.get(id)?.type;
        return type ? [type] : [];
      }),
    );
  for (const group of ['good', 'bad'] as const) {
    const filled = slots[group];
    for (let index = 0; index < filled.length; index++) {
      const current = byId.get(filled[index] as string);
      if (!current || requirementMet(current, presentTypes())) continue;

      const others = filled.filter((_, i) => i !== index);
      const replaceable = pool.filter(
        (card) => cardGroup(card) === group && card.id !== current.id && hasCapacity(card, others),
      );
      let replacement: ActionCardDefinition | undefined;
      for (let attempt = 0; attempt < REQUIRE_REROLL_ATTEMPTS && !replacement; attempt++) {
        const candidate = pickWeighted(rng, replaceable, (card) => card.weight);
        if (candidate && requirementMet(candidate, new Set([...presentTypes(), candidate.type])))
          replacement = candidate;
      }
      // Fallback: highest-weight card without unmet requirements
      replacement ??= [...replaceable]
        .sort((a, b) => b.weight - a.weight)
        .find((card) => requirementMet(card, presentTypes()));

      if (replacement) filled[index] = replacement.id;
      else filled.splice(index--, 1);
    }
  }
  return slots;
}
