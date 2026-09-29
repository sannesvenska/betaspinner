import { describe, expect, it } from 'vitest';
import { createRng, pickWeightedIndex, randInt, shuffle } from './rng';
import { clockwiseDistance, shortDistance, wrapField } from './track';

describe('createRng', () => {
  it('is deterministic per seed and resumable from its state', () => {
    const a = createRng(42);
    const b = createRng(42);
    const first = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(first);

    const resumed = createRng(a.state);
    expect(resumed.next()).toBe(a.next());
  });

  it('produces values in [0, 1) with a roughly uniform mean', () => {
    const rng = createRng(7);
    const samples = Array.from({ length: 10_000 }, () => rng.next());
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThan(1);
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});

describe('rng helpers', () => {
  it('randInt covers the inclusive range', () => {
    const rng = createRng(1);
    const seen = new Set(Array.from({ length: 500 }, () => randInt(rng, 1, 6)));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('shuffle keeps all items', () => {
    const rng = createRng(3);
    expect(shuffle(rng, [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('pickWeightedIndex respects weights and ignores zero weights', () => {
    const rng = createRng(9);
    const counts = [0, 0, 0];
    for (let i = 0; i < 10_000; i++) {
      const index = pickWeightedIndex(rng, [1, 0, 3]);
      if (index !== undefined) counts[index] = (counts[index] ?? 0) + 1;
    }
    expect(counts[1]).toBe(0);
    expect((counts[2] ?? 0) / (counts[0] ?? 1)).toBeGreaterThan(2.6);
    expect((counts[2] ?? 0) / (counts[0] ?? 1)).toBeLessThan(3.4);
    expect(pickWeightedIndex(rng, [0, 0])).toBeUndefined();
  });
});

describe('track geometry', () => {
  it('wraps and measures distances around the ring', () => {
    expect(wrapField(101)).toBe(1);
    expect(wrapField(0)).toBe(100);
    expect(wrapField(-1)).toBe(99);
    expect(clockwiseDistance(98, 3)).toBe(5);
    expect(shortDistance(98, 3)).toBe(5);
    expect(shortDistance(1, 51)).toBe(50);
  });
});
