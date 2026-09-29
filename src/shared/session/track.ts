/** The circular 100-field track (game-design §3). Fields are numbered 1..TRACK_LENGTH. */
export const TRACK_LENGTH = 100;

/** Wraps any integer onto 1..TRACK_LENGTH. */
export const wrapField = (field: number): number =>
  ((((field - 1) % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH) + 1;

/** Steps going clockwise (right) from `from` to `to`, 0..TRACK_LENGTH-1. */
export const clockwiseDistance = (from: number, to: number): number =>
  (((to - from) % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;

/** Shorter way around, 0..TRACK_LENGTH/2. */
export const shortDistance = (a: number, b: number): number => {
  const clockwise = clockwiseDistance(a, b);
  return Math.min(clockwise, TRACK_LENGTH - clockwise);
};

export const ALL_FIELDS: readonly number[] = Array.from({ length: TRACK_LENGTH }, (_, index) => index + 1);
