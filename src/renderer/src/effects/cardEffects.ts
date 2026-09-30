import type { FolderConfig } from '@shared/content';
import { regionsForEffect, type ImageMask } from '@shared/masks';
import { getPixelLevel } from '@shared/session/engine/effects';
import type { ActiveEffect, Card } from '@shared/session/types';
import type { EffectOptions } from './drawEffects';

export const NO_EFFECTS: EffectOptions = { pixelLevel: 0, splatterSeed: null };

/**
 * Visual effects for one card (game-design §12). A masked image (§12.1) gets its effects only inside the
 * regions of each effect; other images follow their folder: `full` = whole image, `none` = untouched.
 */
export function cardEffectOptions(
  card: Card | null | undefined,
  effects: readonly ActiveEffect[],
  folders: readonly FolderConfig[],
  masks: Readonly<Record<string, ImageMask>> = {},
): EffectOptions {
  if (!card?.imageHash) return NO_EFFECTS;
  const mask = masks[card.imageHash];
  const base = { pixelLevel: getPixelLevel(effects), splatterSeed: card.splatterSeed ?? null };
  if (mask?.status === 'masked') {
    return {
      ...base,
      pixelateRegions: regionsForEffect(mask, 'pixelate'),
      splatterRegions: regionsForEffect(mask, 'splatter'),
    };
  }
  const folder = folders.find((candidate) => candidate.id === card.folderId);
  if (folder?.unmaskedEffectBehavior === 'none') return NO_EFFECTS;
  return base;
}
