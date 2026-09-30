import { describe, expect, it } from 'vitest';
import {
  boxFromPoints,
  hitTest,
  isUsableRegion,
  moveRegion,
  normalizeMask,
  regionAt,
  regionsForEffect,
  resizeRegion,
  simplifyPath,
  statusFor,
  type MaskRegion,
} from './masks';

const rect = (x: number, y: number, w: number, h: number, extra: Partial<MaskRegion> = {}): MaskRegion => ({
  id: `r${x}${y}`,
  shape: 'rect',
  rect: { x, y, w, h },
  effects: ['pixelate', 'splatter'],
  feather: 0,
  ...extra,
});
const HASH = 'a'.repeat(40);

/** Floating point safe comparison of boxes / points. */
function expectClose(actual: object | undefined, expected: Record<string, number>) {
  for (const [key, value] of Object.entries(expected))
    expect((actual as Record<string, number> | undefined)?.[key], key).toBeCloseTo(value, 6);
}

describe('mask geometry (§12.3)', () => {
  it('builds boxes from any drag direction and clamps to the image', () => {
    expectClose(boxFromPoints({ x: 0.6, y: 0.8 }, { x: 0.2, y: -0.5 }), { x: 0.2, y: 0, w: 0.4, h: 0.8 });
  });

  it('hit-tests rectangles, ellipses and polygons', () => {
    expect(hitTest(rect(0.1, 0.1, 0.2, 0.2), { x: 0.2, y: 0.2 })).toBe(true);
    const ellipse: MaskRegion = { ...rect(0, 0, 1, 0.5), shape: 'ellipse' };
    expect(hitTest(ellipse, { x: 0.5, y: 0.25 })).toBe(true);
    expect(hitTest(ellipse, { x: 0.02, y: 0.02 })).toBe(false); // corner of the box, outside the ellipse
    const triangle: MaskRegion = {
      id: 't',
      shape: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
      effects: ['pixelate'],
      feather: 0,
    };
    expect(hitTest(triangle, { x: 0.2, y: 0.2 })).toBe(true);
    expect(hitTest(triangle, { x: 0.8, y: 0.8 })).toBe(false);
    expect(
      regionAt([rect(0, 0, 1, 1, { id: 'bottom' }), rect(0.4, 0.4, 0.2, 0.2, { id: 'top' })], {
        x: 0.5,
        y: 0.5,
      })?.id,
    ).toBe('top');
  });

  it('moves regions without leaving the image and resizes by a corner', () => {
    expectClose(moveRegion(rect(0.7, 0.7, 0.2, 0.2), 0.5, 0.5).rect, { x: 0.8, y: 0.8, w: 0.2, h: 0.2 });
    expectClose(resizeRegion(rect(0.2, 0.2, 0.2, 0.2), 'se', { x: 0.8, y: 0.6 }).rect, {
      x: 0.2,
      y: 0.2,
      w: 0.6,
      h: 0.4,
    });
    expectClose(resizeRegion(rect(0.2, 0.2, 0.2, 0.2), 'nw', { x: 0.1, y: 0.1 }).rect, {
      x: 0.1,
      y: 0.1,
      w: 0.3,
      h: 0.3,
    });
    const polygon: MaskRegion = {
      id: 'p',
      shape: 'polygon',
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.2 },
        { x: 0.3, y: 0.4 },
      ],
      effects: ['pixelate'],
      feather: 0,
    };
    const scaled = resizeRegion(polygon, 'se', { x: 0.6, y: 0.6 });
    expectClose(scaled.points?.[1], { x: 0.6, y: 0.2 });
  });

  it('simplifies lasso strokes with RDP and drops accidental clicks', () => {
    const line = Array.from({ length: 50 }, (_, index) => ({ x: index / 49, y: 0.5 + (index % 2) * 0.001 }));
    expect(simplifyPath(line)).toHaveLength(2);
    const corner = [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.001 },
      { x: 0.5, y: 0 },
      { x: 0.5, y: 0.5 },
    ];
    expect(simplifyPath(corner)).toEqual([corner[0], corner[2], corner[3]]);
    expect(isUsableRegion(rect(0.5, 0.5, 0.001, 0.2))).toBe(false);
  });
});

describe('mask status and normalization', () => {
  it('derives the status from the regions', () => {
    expect(statusFor([rect(0, 0, 0.5, 0.5)], 'no_regions')).toBe('masked');
    expect(statusFor([], 'no_regions')).toBe('no_regions');
    expect(statusFor([], 'masked')).toBe('unreviewed');
  });

  it('only masked images restrict effects to their regions', () => {
    const masked = {
      imageHash: HASH,
      status: 'masked' as const,
      regions: [rect(0, 0, 0.5, 0.5, { effects: ['pixelate'] })],
      updatedAt: '',
    };
    expect(regionsForEffect(masked, 'pixelate')).toHaveLength(1);
    expect(regionsForEffect(masked, 'splatter')).toEqual([]);
    expect(regionsForEffect({ ...masked, status: 'no_regions', regions: [] }, 'pixelate')).toBeUndefined();
    expect(regionsForEffect(undefined, 'pixelate')).toBeUndefined();
  });

  it('repairs stored masks and drops broken regions', () => {
    const mask = normalizeMask({
      imageHash: HASH,
      status: 'masked',
      regions: [
        {
          id: 'a',
          shape: 'rect',
          rect: { x: 0.8, y: 0.8, w: 0.5, h: 0.5 },
          effects: ['pixelate', 'blur'],
          feather: 3,
        },
        { id: 'b', shape: 'polygon', points: [{ x: 0, y: 0 }] },
        { shape: 'ellipse', rect: { x: 0, y: 0, w: 1, h: 1 } },
      ],
    });
    expect(mask?.regions).toHaveLength(1);
    expect(mask?.regions[0]).toMatchObject({ id: 'a', shape: 'rect', effects: ['pixelate'], feather: 0.1 });
    expectClose(mask?.regions[0]?.rect, { x: 0.8, y: 0.8, w: 0.2, h: 0.2 });
    expect(mask?.status).toBe('masked');
    expect(normalizeMask({ imageHash: 'nope' })).toBeNull();
  });
});
