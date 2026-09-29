import { randInt, type Rng } from './rng';
import { ALL_FIELDS, shortDistance } from './track';
import type { SessionRules } from './types';

const GAP_ATTEMPTS = 20;

interface PlaceActionsInput {
  startField: number;
  goalField: number;
  count: number;
  rules: Pick<SessionRules, 'startProtection' | 'goalProtection' | 'minActionGap'>;
}

/** Fields that may hold an action card (not start/goal, outside their protected zones). */
export function eligibleActionFields({
  startField,
  goalField,
  rules,
}: Omit<PlaceActionsInput, 'count'>): number[] {
  return ALL_FIELDS.filter(
    (field) =>
      shortDistance(field, startField) > rules.startProtection &&
      shortDistance(field, goalField) > rules.goalProtection,
  );
}

/**
 * game-design §6.5 stratified placement: the eligible fields (in ring order) are cut into `count`
 * equal segments starting at a random offset, one action per segment, respecting `minActionGap`
 * (relaxed for a card after 20 failed attempts). Returns fields in ring order.
 */
export function placeActions(rng: Rng, input: PlaceActionsInput): number[] {
  const eligible = eligibleActionFields(input);
  const count = Math.min(input.count, eligible.length);
  if (count === 0) return [];

  // Rotate so segment borders are not predictable
  const offset = randInt(rng, 0, eligible.length - 1);
  const ring = [...eligible.slice(offset), ...eligible.slice(0, offset)];
  const placed: number[] = [];
  const taken = new Set<number>();
  const respectsGap = (field: number) =>
    placed.every((other) => shortDistance(field, other) >= input.rules.minActionGap);

  for (let segment = 0; segment < count; segment++) {
    const from = Math.floor((segment * ring.length) / count);
    const to = Math.floor(((segment + 1) * ring.length) / count) - 1;
    const segmentFields = ring.slice(from, to + 1).filter((field) => !taken.has(field));

    let choice: number | undefined;
    for (let attempt = 0; attempt < GAP_ATTEMPTS && choice === undefined; attempt++) {
      const candidate = segmentFields[randInt(rng, 0, segmentFields.length - 1)];
      if (candidate !== undefined && respectsGap(candidate)) choice = candidate;
    }
    // Deterministic scan before relaxing the gap
    choice ??= segmentFields.find(respectsGap) ?? segmentFields[randInt(rng, 0, segmentFields.length - 1)];
    if (choice === undefined) continue;
    placed.push(choice);
    taken.add(choice);
  }
  return placed.sort((a, b) => a - b);
}
