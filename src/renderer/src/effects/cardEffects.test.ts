import { describe, expect, it } from 'vitest';
import { FOLDER_DEFAULTS, type FolderConfig } from '@shared/content';
import type { ActiveEffect, Card } from '@shared/session/types';
import { cardEffectOptions, NO_EFFECTS } from './cardEffects';

const folder = (id: string, behavior: 'full' | 'none'): FolderConfig => ({
  id,
  path: id,
  displayName: id,
  group: 'good',
  role: 'content',
  ...FOLDER_DEFAULTS,
  taskRange: [6, 18],
  unmaskedEffectBehavior: behavior,
});

const card = (folderId: string, splatterSeed?: number): Card => ({
  field: 1,
  kind: 'normal',
  folderId,
  imageHash: 'h'.repeat(40),
  discovered: true,
  ...(splatterSeed === undefined ? {} : { splatterSeed }),
});

const pixelate: ActiveEffect[] = [{ id: 'pixelate', type: 'pixelate', value: 3, createdRound: 0 }];

describe('cardEffectOptions', () => {
  it('applies the global pixel level and the card splatter for full folders', () => {
    expect(cardEffectOptions(card('a', 42), pixelate, [folder('a', 'full')])).toEqual({
      pixelLevel: 3,
      splatterSeed: 42,
    });
  });

  it('keeps folders with behavior none untouched', () => {
    expect(cardEffectOptions(card('b', 42), pixelate, [folder('b', 'none')])).toEqual(NO_EFFECTS);
  });

  it('has no effects without an image', () => {
    expect(cardEffectOptions({ field: 1, kind: 'goal', discovered: false }, pixelate, [])).toEqual(
      NO_EFFECTS,
    );
    expect(cardEffectOptions(null, pixelate, [])).toEqual(NO_EFFECTS);
  });

  it('restricts effects to the regions of a masked image, even in "none" folders', () => {
    const region = {
      id: 'r',
      shape: 'rect' as const,
      rect: { x: 0, y: 0, w: 0.5, h: 0.5 },
      effects: ['pixelate' as const],
      feather: 0,
    };
    const masks = {
      ['h'.repeat(40)]: {
        imageHash: 'h'.repeat(40),
        status: 'masked' as const,
        regions: [region],
        inverted: false,
        updatedAt: '',
      },
    };
    expect(cardEffectOptions(card('b', 42), pixelate, [folder('b', 'none')], masks)).toEqual({
      pixelLevel: 3,
      splatterSeed: 42,
      pixelateRegions: [region],
      splatterRegions: [],
      invertRegions: false,
    });
  });

  it('gives "no regions needed" images no effects at all, even in "full" folders', () => {
    const masks = {
      ['h'.repeat(40)]: {
        imageHash: 'h'.repeat(40),
        status: 'no_regions' as const,
        regions: [],
        inverted: false,
        updatedAt: '',
      },
    };
    expect(cardEffectOptions(card('a', 42), pixelate, [folder('a', 'full')], masks)).toEqual(NO_EFFECTS);
  });
});
