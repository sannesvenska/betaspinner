import { randInt, type Rng } from './rng';
import { shortDistance, TRACK_LENGTH, wrapField } from './track';
import type { SessionRules } from './types';

const START_ATTEMPTS = 50;
const OPPOSITE_OFFSET = TRACK_LENGTH / 2;

export interface WheelResult {
  value: number;
  /** Landed on a penalty field → lockout, no session (game-design §13.1). */
  penalty: boolean;
}

/** Start wheel (game-design §8.1). The result is decided here; the animation only shows it. */
export function spinStartWheel(
  rng: Rng,
  rules: Pick<SessionRules, 'wheelRange'>,
  penaltyFields: readonly number[],
): WheelResult {
  const value = randInt(rng, rules.wheelRange[0], rules.wheelRange[1]);
  return { value, penalty: penaltyFields.includes(value) };
}

/**
 * game-design §6.1: the start sits roughly opposite the goal, jittered, at least `minGoalDistance` away
 * (shorter way around). Falls back to the exact opposite field if the rules make that impossible.
 */
export function placeStart(
  rng: Rng,
  goalField: number,
  rules: Pick<SessionRules, 'startJitter' | 'minGoalDistance'>,
): number {
  for (let attempt = 0; attempt < START_ATTEMPTS; attempt++) {
    const jitter = randInt(rng, -rules.startJitter, rules.startJitter);
    const start = wrapField(goalField + OPPOSITE_OFFSET + jitter);
    if (shortDistance(start, goalField) >= rules.minGoalDistance) return start;
  }
  return wrapField(goalField + OPPOSITE_OFFSET);
}
