import { create } from 'zustand';
import type { DraftArtSlot, DraftCrop } from '@shared/draft';
import type { DraftArtView } from '@shared/ipc';

interface DraftArtState {
  art: DraftArtView | null;
  error: string | null;
  load: () => Promise<void>;
  pickImage: (slot: DraftArtSlot) => Promise<void>;
  setCrop: (slot: DraftArtSlot, crop: DraftCrop) => Promise<void>;
  clear: (slot: DraftArtSlot) => Promise<void>;
  dismissError: () => void;
}

/** game-design §6.0 draft card images (back + 4 field types) with their square crops. */
export const useDraftArtStore = create<DraftArtState>()((set) => {
  const apply = (result: Awaited<ReturnType<typeof window.api.invoke<'draftArt:get'>>>) => {
    set(result.ok ? { art: result.data, error: null } : { error: result.error });
  };
  return {
    art: null,
    error: null,
    load: async () => {
      apply(await window.api.invoke('draftArt:get', undefined));
    },
    pickImage: async (slot) => {
      apply(await window.api.invoke('draftArt:pickImage', { slot }));
    },
    setCrop: async (slot, crop) => {
      apply(await window.api.invoke('draftArt:setCrop', { slot, crop }));
    },
    clear: async (slot) => {
      apply(await window.api.invoke('draftArt:clear', { slot }));
    },
    dismissError: () => {
      set({ error: null });
    },
  };
});
