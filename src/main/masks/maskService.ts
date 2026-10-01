import type { MediaEntry } from '@shared/content';
import type { MaskBulkAction, MaskFolderSummary, MaskedMediaEntry, MaskFilter } from '@shared/ipc';
import { normalizeMask, statusFor, type ImageMask, type MaskRegion, type MaskStatus } from '@shared/masks';
import type { JsonStore } from '../storage/jsonStore';

/** masks.json (game-design §12.3): masks keyed by image content hash. */
export interface MaskFile {
  masks: Record<string, ImageMask>;
}

export const MASKS_SCHEMA_VERSION = 1;
export const EMPTY_MASK_FILE: MaskFile = { masks: {} };

export function normalizeMaskFile(data: unknown): MaskFile {
  if (typeof data !== 'object' || data === null) throw new Error('Mask file root must be an object');
  const raw = (data as { masks?: unknown }).masks;
  const masks: Record<string, ImageMask> = {};
  if (typeof raw === 'object' && raw !== null) {
    for (const value of Object.values(raw)) {
      const mask = normalizeMask(value);
      if (mask && mask.status !== 'unreviewed') masks[mask.imageHash] = mask;
    }
  }
  return { masks };
}

interface MaskServiceOptions {
  store: JsonStore<MaskFile>;
  media: () => readonly MediaEntry[];
  now?: () => Date;
}

export interface MaskService {
  getMany: (hashes: readonly string[]) => Record<string, ImageMask>;
  /** Saves regions (status derived; `no_regions` only when explicitly requested and empty). */
  save: (input: {
    imageHash: string;
    regions: MaskRegion[];
    inverted?: boolean;
    status?: MaskStatus;
  }) => Promise<ImageMask>;
  /** `no_regions` never overwrites existing regions; `clear` removes the masks. Returns changed count. */
  bulk: (hashes: readonly string[], action: MaskBulkAction) => Promise<number>;
  summary: () => Record<string, MaskFolderSummary>;
  listFolder: (folderId: string, filter: MaskFilter) => MaskedMediaEntry[];
}

/** Record without some keys (no dynamic `delete`). */
const without = <T>(record: Record<string, T>, keys: ReadonlySet<string>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !keys.has(key)));

const byFileName = (a: MediaEntry, b: MediaEntry): number =>
  a.fileName.localeCompare(b.fileName, undefined, { numeric: true });

export async function createMaskService(options: MaskServiceOptions): Promise<MaskService> {
  const now = options.now ?? (() => new Date());
  let file = await options.store.read().catch((error: unknown) => {
    console.error('[masks] masks.json unreadable, starting empty', error);
    return EMPTY_MASK_FILE;
  });

  async function write(masks: Record<string, ImageMask>): Promise<void> {
    const next = { masks };
    await options.store.write(next);
    file = next;
  }

  const statusOf = (hash: string): MaskStatus => file.masks[hash]?.status ?? 'unreviewed';

  return {
    getMany: (hashes) =>
      Object.fromEntries(
        hashes.flatMap((hash) => {
          const mask = file.masks[hash];
          return mask ? [[hash, mask] as const] : [];
        }),
      ),

    save: async ({ imageHash, regions, inverted = false, status }) => {
      const normalized = normalizeMask({
        imageHash,
        regions,
        inverted,
        status: status ?? statusOf(imageHash),
        updatedAt: now().toISOString(),
      });
      if (!normalized) throw new Error('invalid_mask');
      const mask = { ...normalized, status: statusFor(normalized.regions, status ?? normalized.status) };
      await write(
        mask.status === 'unreviewed'
          ? without(file.masks, new Set([imageHash]))
          : { ...file.masks, [imageHash]: mask },
      );
      return mask;
    },

    bulk: async (hashes, action) => {
      if (action === 'clear') {
        const removed = new Set(hashes.filter((hash) => hash in file.masks));
        if (removed.size > 0) await write(without(file.masks, removed));
        return removed.size;
      }
      const masks = { ...file.masks };
      let changed = 0;
      for (const hash of hashes) {
        const existing = masks[hash];
        if (!existing || existing.regions.length === 0) {
          masks[hash] = {
            imageHash: hash,
            status: 'no_regions',
            regions: [],
            inverted: false,
            updatedAt: now().toISOString(),
          };
          changed++;
        }
      }
      if (changed > 0) await write(masks);
      return changed;
    },

    summary: () => {
      const result: Record<string, MaskFolderSummary> = {};
      for (const entry of options.media()) {
        const summary = (result[entry.folderId] ??= { total: 0, reviewed: 0, masked: 0, noRegions: 0 });
        summary.total++;
        const status = statusOf(entry.hash);
        if (status !== 'unreviewed') summary.reviewed++;
        if (status === 'masked') summary.masked++;
        if (status === 'no_regions') summary.noRegions++;
      }
      return result;
    },

    listFolder: (folderId, filter) =>
      options
        .media()
        .filter((entry) => entry.folderId === folderId)
        .sort(byFileName)
        .map((entry) => ({
          ...entry,
          maskStatus: statusOf(entry.hash),
          regionCount: file.masks[entry.hash]?.regions.length ?? 0,
        }))
        .filter((entry) => filter === 'all' || entry.maskStatus === filter),
  };
}
