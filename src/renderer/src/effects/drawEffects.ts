import { containRect, pixelBlockSize, splatterStamps } from './effectMath';

export interface EffectOptions {
  pixelLevel: number;
  /** null = card is not splattered */
  splatterSeed: number | null;
  /** Block size per level incl. level 0 (admin visual effects, §12.4); default: built-in levels */
  blockFractions?: readonly number[];
}

export const hasEffects = (options: EffectOptions): boolean =>
  options.pixelLevel > 0 || options.splatterSeed !== null;

/**
 * game-design §12.4 pipeline for one frame: contain-fit → pixelate (downscale + nearest-neighbour upscale)
 * → splatter stamps clipped to the media. `scratch` is a reusable offscreen canvas.
 */
export function drawEffectFrame(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  mediaWidth: number,
  mediaHeight: number,
  options: EffectOptions,
  textures: readonly HTMLImageElement[],
  scratch: HTMLCanvasElement,
): void {
  const { width, height } = context.canvas;
  context.clearRect(0, 0, width, height);
  const rect = containRect(mediaWidth, mediaHeight, width, height);
  if (rect.width === 0) return;

  const block = pixelBlockSize(options.pixelLevel, rect, options.blockFractions);
  if (block > 0) {
    const smallWidth = Math.max(1, Math.ceil(rect.width / block));
    const smallHeight = Math.max(1, Math.ceil(rect.height / block));
    scratch.width = smallWidth;
    scratch.height = smallHeight;
    const scratchContext = scratch.getContext('2d');
    if (scratchContext) {
      scratchContext.imageSmoothingEnabled = true;
      scratchContext.drawImage(source, 0, 0, smallWidth, smallHeight);
      context.imageSmoothingEnabled = false;
      context.drawImage(scratch, 0, 0, smallWidth, smallHeight, rect.x, rect.y, rect.width, rect.height);
      context.imageSmoothingEnabled = true;
    }
  } else {
    context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
  }

  if (options.splatterSeed === null || textures.length === 0) return;
  const shortSide = Math.min(rect.width, rect.height);
  context.save();
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
  for (const stamp of splatterStamps(options.splatterSeed, textures.length)) {
    const texture = textures[stamp.textureIndex];
    if (!texture) continue;
    const size = stamp.scale * shortSide;
    context.save();
    context.translate(rect.x + stamp.x * rect.width, rect.y + stamp.y * rect.height);
    context.rotate(stamp.rotation);
    context.drawImage(texture, -size / 2, -size / 2, size, size);
    context.restore();
  }
  context.restore();
}
