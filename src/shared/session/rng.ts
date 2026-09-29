/**
 * Seeded PRNG (mulberry32) – the only source of game randomness (game-design §22).
 * The state is a single uint32, persisted in the session so reloads continue deterministically.
 */
export interface Rng {
  /** Float in [0, 1). */
  next: () => number;
  /** Current state; `createRng(state)` continues exactly from here. */
  readonly state: number;
}

const MULBERRY_INCREMENT = 0x6d2b79f5;
const UINT32_RANGE = 4294967296;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next: () => {
      state = (state + MULBERRY_INCREMENT) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
    },
    get state() {
      return state;
    },
  };
}

/** Integer in [min, max] (inclusive). */
export function randInt(rng: Rng, min: number, max: number): number {
  if (max < min) throw new Error(`randInt: max ${max} < min ${min}`);
  return min + Math.floor(rng.next() * (max - min + 1));
}

export function chance(rng: Rng, probability: number): boolean {
  return rng.next() < probability;
}

/** Fisher–Yates; returns a new array. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

/** Index picked proportionally to weight; undefined when no positive weight exists. */
export function pickWeightedIndex(rng: Rng, weights: readonly number[]): number | undefined {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return undefined;
  let threshold = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    threshold -= Math.max(0, weights[i] ?? 0);
    if (threshold < 0) return i;
  }
  // Floating point edge: return the last positive weight
  for (let i = weights.length - 1; i >= 0; i--) if ((weights[i] ?? 0) > 0) return i;
  return undefined;
}

export function pickWeighted<T>(rng: Rng, items: readonly T[], weightOf: (item: T) => number): T | undefined {
  const index = pickWeightedIndex(rng, items.map(weightOf));
  return index === undefined ? undefined : items[index];
}
