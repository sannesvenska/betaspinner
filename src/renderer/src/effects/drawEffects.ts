import type { MaskRegion } from '@shared/masks';
import { containRect, pixelBlockSize, splatterStamps, type Rect } from './effectMath';

export interface EffectOptions {
  pixelLevel: number;
  /** null = card is not splattered */
  splatterSeed: number | null;
  /** Block size per level incl. level 0 (admin visual effects, §12.4); default: built-in levels */
  blockFractions?: readonly number[];
  /** §12.1 regions for pixelate; undefined = whole image, [] = nowhere */
  pixelateRegions?: readonly MaskRegion[] | undefined;
  /** §12.1 regions for splatter; undefined = whole image, [] = nowhere */
  splatterRegions?: readonly MaskRegion[] | undefined;
  /** Inverted mask: effects outside the regions (no regions = whole image) */
  invertRegions?: boolean | undefined;
}

/** Reusable offscreen canvases of one EffectMedia instance. */
export interface EffectScratch {
  small: HTMLCanvasElement;
  layer: HTMLCanvasElement;
  mask: HTMLCanvasElement;
}

export const createEffectScratch = (): EffectScratch => ({
  small: document.createElement('canvas'),
  layer: document.createElement('canvas'),
  mask: document.createElement('canvas'),
});

export const hasEffects = (options: EffectOptions): boolean =>
  options.pixelLevel > 0 || options.splatterSeed !== null;

const FULL_TURN = Math.PI * 2;

/** Adds one normalized region to the current path, mapped onto the drawn media rect. */
export function traceRegion(context: CanvasRenderingContext2D, region: MaskRegion, rect: Rect): void {
  const x = (value: number) => rect.x + value * rect.width;
  const y = (value: number) => rect.y + value * rect.height;
  if (region.shape === 'polygon') {
    const [first, ...rest] = region.points ?? [];
    if (!first) return;
    context.moveTo(x(first.x), y(first.y));
    for (const point of rest) context.lineTo(x(point.x), y(point.y));
    context.closePath();
    return;
  }
  const box = region.rect;
  if (!box) return;
  if (region.shape === 'rect') {
    context.rect(x(box.x), y(box.y), box.w * rect.width, box.h * rect.height);
    return;
  }
  const rx = (box.w * rect.width) / 2;
  const ry = (box.h * rect.height) / 2;
  context.moveTo(x(box.x) + 2 * rx, y(box.y) + ry);
  context.ellipse(x(box.x) + rx, y(box.y) + ry, rx, ry, 0, 0, FULL_TURN);
}

function sizeTo(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  context?.clearRect(0, 0, width, height);
  return context;
}

/**
 * White alpha mask of the regions; each region is feathered by its own blur (§12.4). Inverted: the media
 * rect is white and the regions are cut out.
 */
function drawMask(
  mask: HTMLCanvasElement,
  width: number,
  height: number,
  regions: readonly MaskRegion[],
  rect: Rect,
  inverted: boolean,
): void {
  const context = sizeTo(mask, width, height);
  if (!context) return;
  const shortSide = Math.min(rect.width, rect.height);
  context.fillStyle = '#fff';
  if (inverted) {
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.globalCompositeOperation = 'destination-out';
  }
  for (const region of regions) {
    const blur = region.feather * shortSide;
    context.filter = blur > 0 ? `blur(${blur.toFixed(1)}px)` : 'none';
    context.beginPath();
    traceRegion(context, region, rect);
    context.fill();
  }
  context.filter = 'none';
  context.globalCompositeOperation = 'source-over';
}

/**
 * Draws `paint` either straight onto `target` (no regions = whole image) or through a layer that is
 * cut to the feathered region mask.
 */
function paintRestricted(
  target: CanvasRenderingContext2D,
  regions: readonly MaskRegion[] | undefined,
  inverted: boolean,
  rect: Rect,
  scratch: EffectScratch,
  paint: (context: CanvasRenderingContext2D) => void,
): void {
  // No restriction, or an inverted mask without regions for this effect → whole image
  if (regions === undefined || (inverted && regions.length === 0)) {
    paint(target);
    return;
  }
  if (regions.length === 0) return;
  const { width, height } = target.canvas;
  const layer = sizeTo(scratch.layer, width, height);
  if (!layer) return;
  paint(layer);
  drawMask(scratch.mask, width, height, regions, rect, inverted);
  layer.globalCompositeOperation = 'destination-in';
  layer.drawImage(scratch.mask, 0, 0);
  layer.globalCompositeOperation = 'source-over';
  target.drawImage(scratch.layer, 0, 0);
}

/**
 * game-design §12.4 pipeline for one frame: contain-fit → pixelate (downscale + nearest-neighbour upscale)
 * → splatter stamps, each clipped to the media and – for masked images – to the feathered regions.
 */
export function drawEffectFrame(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  mediaWidth: number,
  mediaHeight: number,
  options: EffectOptions,
  textures: readonly HTMLImageElement[],
  scratch: EffectScratch,
): void {
  const { width, height } = context.canvas;
  context.clearRect(0, 0, width, height);
  const rect = containRect(mediaWidth, mediaHeight, width, height);
  if (rect.width === 0) return;
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
  const inverted = options.invertRegions === true;

  const block = pixelBlockSize(options.pixelLevel, rect, options.blockFractions);
  if (block > 0) {
    const smallWidth = Math.max(1, Math.ceil(rect.width / block));
    const smallHeight = Math.max(1, Math.ceil(rect.height / block));
    const small = sizeTo(scratch.small, smallWidth, smallHeight);
    if (small) {
      small.imageSmoothingEnabled = true;
      small.drawImage(source, 0, 0, smallWidth, smallHeight);
      paintRestricted(context, options.pixelateRegions, inverted, rect, scratch, (target) => {
        target.imageSmoothingEnabled = false;
        target.drawImage(
          scratch.small,
          0,
          0,
          smallWidth,
          smallHeight,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
        );
        target.imageSmoothingEnabled = true;
      });
    }
  }

  if (options.splatterSeed === null || textures.length === 0) return;
  const seed = options.splatterSeed;
  const shortSide = Math.min(rect.width, rect.height);
  paintRestricted(context, options.splatterRegions, inverted, rect, scratch, (target) => {
    target.save();
    target.beginPath();
    target.rect(rect.x, rect.y, rect.width, rect.height);
    target.clip();
    for (const stamp of splatterStamps(seed, textures.length)) {
      const texture = textures[stamp.textureIndex];
      if (!texture) continue;
      const size = stamp.scale * shortSide;
      target.save();
      target.translate(rect.x + stamp.x * rect.width, rect.y + stamp.y * rect.height);
      target.rotate(stamp.rotation);
      target.drawImage(texture, -size / 2, -size / 2, size, size);
      target.restore();
    }
    target.restore();
  });
}
