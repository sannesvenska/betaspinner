import { createRng, randInt } from '@shared/session/rng';

/** game-design §12.4: block size per pixelation level as a fraction of the image's short side. */
export const PIXEL_BLOCK_FRACTIONS = [0, 0.012, 0.022, 0.035, 0.05, 0.075] as const;
const MIN_BLOCK_PX = 2;

const SPLATTER_STAMPS = { min: 3, max: 6 } as const;
const STAMP_SCALE = { min: 0.25, max: 0.55 } as const;
const FULL_TURN_RAD = Math.PI * 2;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `object-fit: contain` rectangle of media inside a box (never cropped). */
export function containRect(
  mediaWidth: number,
  mediaHeight: number,
  boxWidth: number,
  boxHeight: number,
): Rect {
  if (mediaWidth <= 0 || mediaHeight <= 0 || boxWidth <= 0 || boxHeight <= 0)
    return { x: 0, y: 0, width: 0, height: 0 };
  const scale = Math.min(boxWidth / mediaWidth, boxHeight / mediaHeight);
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}

/** Pixel block edge length for a level at the drawn size; 0 = no pixelation. */
export function pixelBlockSize(
  level: number,
  rect: Pick<Rect, 'width' | 'height'>,
  fractions: readonly number[] = PIXEL_BLOCK_FRACTIONS,
): number {
  const fraction = fractions[Math.max(0, Math.min(fractions.length - 1, Math.round(level)))] ?? 0;
  if (fraction <= 0) return 0;
  return Math.max(MIN_BLOCK_PX, Math.round(Math.min(rect.width, rect.height) * fraction));
}

export interface SplatterStamp {
  textureIndex: number;
  /** Center, relative to the media rect (0..1) */
  x: number;
  y: number;
  /** Stamp size relative to the short side */
  scale: number;
  rotation: number;
}

/**
 * Deterministic splatter layout per card (seeded by `card.splatterSeed`), so a card looks the same in
 * the stage, the ring preview and the gallery, and after a reload.
 */
export function splatterStamps(seed: number, textureCount: number): SplatterStamp[] {
  if (textureCount <= 0) return [];
  const rng = createRng(seed);
  const count = randInt(rng, SPLATTER_STAMPS.min, SPLATTER_STAMPS.max);
  return Array.from({ length: count }, () => ({
    textureIndex: randInt(rng, 0, textureCount - 1),
    x: 0.1 + rng.next() * 0.8,
    y: 0.1 + rng.next() * 0.8,
    scale: STAMP_SCALE.min + rng.next() * (STAMP_SCALE.max - STAMP_SCALE.min),
    rotation: rng.next() * FULL_TURN_RAD,
  }));
}
