import type { FolderConfig } from '@shared/content';
import { getPixelLevel } from '@shared/session/engine/effects';
import type { ActiveEffect, Card } from '@shared/session/types';
import type { EffectOptions } from './drawEffects';

export const NO_EFFECTS: EffectOptions = { pixelLevel: 0, splatterSeed: null };

/**
 * Visual effects for one card (game-design §12). Folders with `unmaskedEffectBehavior: 'none'` stay
 * untouched until region masks exist (AP11); `full` applies to the whole image.
 */
export function cardEffectOptions(
  card: Card | null | undefined,
  effects: readonly ActiveEffect[],
  folders: readonly FolderConfig[],
): EffectOptions {
  if (!card?.imageHash) return NO_EFFECTS;
  const folder = folders.find((candidate) => candidate.id === card.folderId);
  if (folder?.unmaskedEffectBehavior === 'none') return NO_EFFECTS;
  return { pixelLevel: getPixelLevel(effects), splatterSeed: card.splatterSeed ?? null };
}
