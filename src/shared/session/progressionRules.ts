import type { ActionId } from '../actions';
import { shuffle, type Rng } from './rng';
import { ALL_FIELDS } from './track';
import type { EndReason, PenaltyRules, Progression, SessionState } from './types';

const MS_PER_HOUR = 3_600_000;
/** Rounding noise from repeated ±0.03 steps (0.43000000000000005) */
const CHANCE_PRECISION = 1000;

export const LOSS_OUTCOMES: readonly EndReason[] = ['ended_early', 'mistress_says_no'];

/** What a finished session does to progression – shown before it is applied (§13.2, §14.3). */
export interface ProgressionChange {
  penaltyFieldsAdded: number;
  penaltyFieldsRemoved: number;
  goodChanceDelta: number;
  lossStreak: number;
  blockedAction: ActionId | null;
}

const clampChance = (value: number, rules: PenaltyRules): number =>
  Math.round(
    Math.min(rules.goodChanceBounds[1], Math.max(rules.goodChanceBounds[0], value)) * CHANCE_PRECISION,
  ) / CHANCE_PRECISION;

function removeRandomFields(rng: Rng, fields: readonly number[], count: number): number[] {
  const removed = new Set(shuffle(rng, fields).slice(0, count));
  return fields.filter((field) => !removed.has(field));
}

function addRandomFields(rng: Rng, fields: readonly number[], count: number, max: number): number[] {
  const free = ALL_FIELDS.filter((field) => !fields.includes(field));
  const room = Math.max(0, max - fields.length);
  return [...fields, ...shuffle(rng, free).slice(0, Math.min(count, room))].sort((a, b) => a - b);
}

/**
 * Applies a finished session (phase `ended`) to progression. Guessing Game rewards are included.
 * `Denied` is neutral: no fields, no chance change, loss streak unchanged (§14.3).
 */
export function applySessionOutcome(
  progression: Progression,
  session: Pick<SessionState, 'endReason' | 'reward' | 'penaltyFieldsRemoved'>,
  rules: PenaltyRules,
  rng: Rng,
): { progression: Progression; change: ProgressionChange } {
  const outcome = session.endReason;
  let { penaltyFields, goodChance, lossStreak } = progression;
  let blockedActionsNextSession = progression.blockedActionsNextSession;
  let removeCount = session.penaltyFieldsRemoved;
  const before = { fields: penaltyFields.length, goodChance };

  if (outcome && LOSS_OUTCOMES.includes(outcome)) {
    // Escalation: step × streak (2, 4, 6 …), capped
    lossStreak += 1;
    penaltyFields = addRandomFields(
      rng,
      penaltyFields,
      rules.penaltyStep * lossStreak,
      rules.maxPenaltyFields,
    );
  } else if (outcome === 'success' || outcome === 'interrupted' || outcome === 'no_result') {
    lossStreak = 0;
    if (outcome === 'success') {
      const reward = session.reward;
      if (reward?.type === 'remove_penalty_fields') removeCount += rules.successRemoveFields;
      if (reward?.type === 'increase_good_chance')
        goodChance = clampChance(goodChance + rules.goodChanceStep, rules);
      if (reward?.type === 'block_bad_action') blockedActionsNextSession = [reward.action];
    } else {
      removeCount += rules.partialRemoveFields;
      if (outcome === 'no_result') goodChance = clampChance(goodChance - rules.goodChanceStep / 2, rules);
    }
  }
  const afterAdding = penaltyFields.length;
  penaltyFields = removeRandomFields(rng, penaltyFields, removeCount);

  return {
    progression: { ...progression, penaltyFields, goodChance, lossStreak, blockedActionsNextSession },
    change: {
      penaltyFieldsAdded: afterAdding - before.fields,
      penaltyFieldsRemoved: afterAdding - penaltyFields.length,
      goodChanceDelta: Math.round((goodChance - before.goodChance) * CHANCE_PRECISION) / CHANCE_PRECISION,
      lossStreak,
      blockedAction: blockedActionsNextSession[0] ?? null,
    },
  };
}

/**
 * §13.3 lazy decay: every full hour since `lastDecayAt` removes `decayAmount` random fields.
 * The remainder of a started hour is kept, so frequent calls never lose time.
 */
export function applyDecay(progression: Progression, now: Date, rules: PenaltyRules, rng: Rng): Progression {
  if (!progression.lastDecayAt) return { ...progression, lastDecayAt: now.toISOString() };
  const last = new Date(progression.lastDecayAt).getTime();
  const hours = Math.floor((now.getTime() - last) / MS_PER_HOUR);
  if (hours <= 0) return progression;
  if (progression.penaltyFields.length === 0) return { ...progression, lastDecayAt: now.toISOString() };
  return {
    ...progression,
    penaltyFields: removeRandomFields(rng, progression.penaltyFields, hours * rules.decayAmount),
    lastDecayAt: new Date(last + hours * MS_PER_HOUR).toISOString(),
  };
}

/** Next decay moment, or null when nothing can decay. */
export function nextDecayAt(progression: Progression): Date | null {
  if (!progression.lastDecayAt || progression.penaltyFields.length === 0) return null;
  return new Date(new Date(progression.lastDecayAt).getTime() + MS_PER_HOUR);
}
