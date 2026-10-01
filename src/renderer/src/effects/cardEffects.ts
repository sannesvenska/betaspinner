import type { FolderConfig } from '@shared/content';
import { clipForEffect, type ImageMask } from '@shared/masks';
import { getPixelLevel } from '@shared/session/engine/effects';
import type { ActiveEffect, Card } from '@shared/session/types';
import type { EffectOptions } from './drawEffects';

export const NO_EFFECTS: EffectOptions = { pixelLevel: 0, splatterSeed: null };

/**
 * Visual effects for one card (game-design §12.1) – never on action cards:
 * - masked: each effect only inside its regions (inverted mask: everywhere except the regions)
 * - "no regions needed": no visual effects at all
 * - unreviewed: the folder decides – `full` = whole image, `none` = untouched
 */
export function cardEffectOptions(
  card: Card | null | undefined,
  effects: readonly ActiveEffect[],
  folders: readonly FolderConfig[],
  masks: Readonly<Record<string, ImageMask>> = {},
): EffectOptions {
  // Action cards always show their own art untouched
  if (!card?.imageHash || card.kind === 'action') return NO_EFFECTS;
  const mask = masks[card.imageHash];
  const base = { pixelLevel: getPixelLevel(effects), splatterSeed: card.splatterSeed ?? null };
  const pixelate = clipForEffect(mask, 'pixelate');
  const splatter = clipForEffect(mask, 'splatter');
  if (pixelate === 'none' || splatter === 'none') return NO_EFFECTS;
  if (pixelate && splatter) {
    return {
      ...base,
      pixelateRegions: pixelate.regions,
      splatterRegions: splatter.regions,
      invertRegions: pixelate.inverted,
    };
  }
  const folder = folders.find((candidate) => candidate.id === card.folderId);
  if (folder?.unmaskedEffectBehavior === 'none') return NO_EFFECTS;
  return base;
}
