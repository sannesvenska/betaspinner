import { actionGroup, type ActionId } from '../actions';
import type { Group } from '../game';
import { chance, pickWeighted, type Rng } from './rng';
import type { ActionConfig } from './types';

const REQUIRE_REROLL_ATTEMPTS = 10;

export type ActionSlots = Record<Group, ActionId[]>;

interface AssignActionSlotsInput {
  slotCounts: Readonly<Record<Group, number>>;
  actions: readonly ActionConfig[];
  /** Progression reward "block a bad action for the next session". */
  blocked: readonly ActionId[];
}

const countOf = (slots: readonly ActionId[], id: ActionId): number =>
  slots.filter((slot) => slot === id).length;

const hasCapacity = (config: ActionConfig, slots: readonly ActionId[]): boolean =>
  config.maxPerSession === null || countOf(slots, config.id) < config.maxPerSession;

const requirementMet = (config: ActionConfig, present: ReadonlySet<ActionId>): boolean =>
  !config.requires || config.requires.length === 0 || config.requires.some((id) => present.has(id));

/**
 * game-design §6.4. Slots that cannot be filled (everything disabled or at its max) are dropped –
 * the caller turns them into normal cards.
 */
export function assignActionSlots(
  rng: Rng,
  { slotCounts, actions, blocked }: AssignActionSlotsInput,
): ActionSlots {
  // 1 + 2: session gates and progression blocks
  const eligible = actions.filter(
    (config) =>
      config.enabled &&
      config.weight > 0 &&
      !blocked.includes(config.id) &&
      (config.sessionChance === undefined || chance(rng, config.sessionChance)),
  );

  const slots: ActionSlots = { good: [], bad: [] };
  for (const group of ['good', 'bad'] as const) {
    const groupActions = eligible.filter((config) => actionGroup(config.id) === group);
    const target = slotCounts[group];
    const filled = slots[group];

    // 3: guaranteed minimums
    for (const config of groupActions) {
      const minimum = Math.min(config.minPerSession, config.maxPerSession ?? config.minPerSession);
      for (let i = 0; i < minimum && filled.length < target; i++) filled.push(config.id);
    }
    // 4: weighted fill within max
    while (filled.length < target) {
      const next = pickWeighted(
        rng,
        groupActions.filter((config) => hasCapacity(config, filled)),
        (config) => config.weight,
      );
      if (!next) break;
      filled.push(next.id);
    }
  }

  // 5: resolve `requires` across both groups
  const byId = new Map(eligible.map((config) => [config.id, config]));
  const present = () => new Set<ActionId>([...slots.good, ...slots.bad]);
  for (const group of ['good', 'bad'] as const) {
    const filled = slots[group];
    for (let index = 0; index < filled.length; index++) {
      const current = byId.get(filled[index] as ActionId);
      if (!current || requirementMet(current, present())) continue;

      const others = filled.filter((_, i) => i !== index);
      const replaceable = eligible.filter(
        (config) =>
          actionGroup(config.id) === group && config.id !== current.id && hasCapacity(config, others),
      );
      let replacement: ActionConfig | undefined;
      for (let attempt = 0; attempt < REQUIRE_REROLL_ATTEMPTS && !replacement; attempt++) {
        const candidate = pickWeighted(rng, replaceable, (config) => config.weight);
        if (candidate && requirementMet(candidate, new Set([...present(), candidate.id])))
          replacement = candidate;
      }
      // Fallback: highest-weight action without unmet requirements
      replacement ??= [...replaceable]
        .sort((a, b) => b.weight - a.weight)
        .find((config) => requirementMet(config, present()));

      if (replacement) filled[index] = replacement.id;
      else filled.splice(index--, 1);
    }
  }
  return slots;
}
