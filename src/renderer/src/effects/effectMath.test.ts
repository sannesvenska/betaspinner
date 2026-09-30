import { describe, expect, it } from 'vitest';
import { containRect, pixelBlockSize, splatterStamps } from './effectMath';

describe('containRect', () => {
  it('fits portrait media into a landscape box without cropping, centered', () => {
    expect(containRect(1000, 2000, 1600, 900)).toEqual({ x: 575, y: 0, width: 450, height: 900 });
  });

  it('fits landscape media into a portrait box', () => {
    expect(containRect(1600, 900, 800, 1000)).toEqual({ x: 0, y: 275, width: 800, height: 450 });
  });

  it('returns an empty rect for unknown sizes', () => {
    expect(containRect(0, 100, 100, 100)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('pixelBlockSize', () => {
  const rect = { width: 1000, height: 800 };

  it('is 0 at level 0 and grows with the level relative to the short side', () => {
    expect(pixelBlockSize(0, rect)).toBe(0);
    expect(pixelBlockSize(1, rect)).toBe(10); // 800 × 0.012 = 9.6
    expect(pixelBlockSize(5, rect)).toBe(60); // 800 × 0.075
  });

  it('clamps levels and never goes below 2 px', () => {
    expect(pixelBlockSize(9, rect)).toBe(60);
    expect(pixelBlockSize(1, { width: 40, height: 40 })).toBe(2);
  });
});

describe('splatterStamps', () => {
  it('is deterministic per seed and stays inside the media', () => {
    const first = splatterStamps(12345, 5);
    expect(splatterStamps(12345, 5)).toEqual(first);
    expect(splatterStamps(999, 5)).not.toEqual(first);
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(first.length).toBeLessThanOrEqual(6);
    for (const stamp of first) {
      expect(stamp.textureIndex).toBeLessThan(5);
      expect(stamp.x).toBeGreaterThanOrEqual(0.1);
      expect(stamp.x).toBeLessThanOrEqual(0.9);
    }
  });

  it('has no stamps without textures', () => {
    expect(splatterStamps(1, 0)).toEqual([]);
  });
});
