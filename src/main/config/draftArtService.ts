import { centeredSquareCrop, type DraftArtSlot, type DraftCrop } from '@shared/draft';
import type { ActionArtStore } from '../content/actionArtStore';
import { normalizeDraftArt, type DraftArt } from './appConfig';
import { storedImage } from './actionCardService';
import type { ConfigService } from './configService';

export class DraftArtError extends Error {
  constructor(readonly code: 'unsupported' | 'empty_slot') {
    super(code);
    this.name = 'DraftArtError';
  }
}

export interface DraftArtService {
  get: () => DraftArt;
  /** Copies an image (no video) into the draft-art store; the crop starts as the largest centered square. */
  assign: (slot: DraftArtSlot, sourcePath: string) => Promise<DraftArt>;
  setCrop: (slot: DraftArtSlot, crop: DraftCrop) => Promise<DraftArt>;
  clear: (slot: DraftArtSlot) => Promise<DraftArt>;
}

const usedImages = (art: DraftArt) => Object.values(art).map((entry) => entry?.image ?? null);

/** game-design §6.0 draft card images: one per slot (back + 4 field types), shown as square crops. */
export function createDraftArtService(config: ConfigService, store: ActionArtStore): DraftArtService {
  const get = () => config.get().draftArt;

  async function save(next: DraftArt): Promise<DraftArt> {
    const previous = get();
    const saved = await config.update((current) => ({ ...current, draftArt: normalizeDraftArt(next) }));
    for (const entry of Object.values(previous))
      if (entry) await store.removeIfUnused(entry.image, usedImages(saved.draftArt));
    return saved.draftArt;
  }

  return {
    get,
    assign: async (slot, sourcePath) => {
      const imported = await store.importFile(sourcePath);
      if (imported.kind === 'video') {
        await store.removeIfUnused(imported, usedImages(get()));
        throw new DraftArtError('unsupported');
      }
      return save({
        ...get(),
        [slot]: { image: storedImage(imported), crop: centeredSquareCrop(imported.width, imported.height) },
      });
    },
    setCrop: (slot, crop) => {
      const entry = get()[slot];
      if (!entry) throw new DraftArtError('empty_slot');
      return save({ ...get(), [slot]: { ...entry, crop } });
    },
    clear: (slot) => save({ ...get(), [slot]: null }),
  };
}
