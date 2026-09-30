import { useEffect } from 'react';
import { create } from 'zustand';
import type { ImageMask } from '@shared/masks';

interface MasksState {
  /** Masks by image hash; hashes without a mask are remembered as loaded (`null`). */
  masks: Record<string, ImageMask | null>;
  ensure: (hashes: readonly string[]) => Promise<void>;
  /** After an edit in the Mask Editor */
  put: (mask: ImageMask | null, imageHash: string) => void;
  forget: (hashes: readonly string[]) => void;
}

/** game-design §12 masks needed by the effect pipeline (game, gallery, previews). */
export const useMasksStore = create<MasksState>()((set, get) => ({
  masks: {},
  ensure: async (hashes) => {
    const missing = [...new Set(hashes)].filter((hash) => !(hash in get().masks));
    if (missing.length === 0) return;
    const result = await window.api.invoke('masks:getMany', { hashes: missing });
    if (!result.ok) return;
    set((state) => ({
      masks: {
        ...state.masks,
        ...Object.fromEntries(missing.map((hash) => [hash, result.data[hash] ?? null])),
      },
    }));
  },
  put: (mask, imageHash) => {
    set((state) => ({ masks: { ...state.masks, [imageHash]: mask } }));
  },
  forget: (hashes) => {
    const forgotten = new Set(hashes);
    set((state) => ({
      masks: Object.fromEntries(Object.entries(state.masks).filter(([hash]) => !forgotten.has(hash))),
    }));
  },
}));

/** Loads the masks of `hashes` and returns every known mask (missing ones are simply absent). */
export function useMasks(hashes: readonly string[]): Record<string, ImageMask> {
  const ensure = useMasksStore((state) => state.ensure);
  const masks = useMasksStore((state) => state.masks);
  const key = hashes.join(',');
  useEffect(() => {
    void ensure(key === '' ? [] : key.split(','));
  }, [ensure, key]);
  return Object.fromEntries(
    Object.entries(masks).filter((entry): entry is [string, ImageMask] => entry[1] !== null),
  );
}
