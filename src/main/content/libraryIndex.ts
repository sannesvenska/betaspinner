import type { FolderScanStatus, LibraryIndex, MediaEntry } from '@shared/content';
import type { Migration } from '../storage/jsonStore';

/** Bump whenever scanner rules change (formats, validation, hashing) so cached entries are rebuilt. */
export const INDEX_SCHEMA_VERSION = 2;
export const EMPTY_INDEX: LibraryIndex = { entries: [], folders: {} };

const DROP_CACHE: Migration = () => EMPTY_INDEX;

export const INDEX_MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: DROP_CACHE, // v2: unreadable image headers are rejected
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isMediaEntry = (value: unknown): value is MediaEntry =>
  isRecord(value) &&
  typeof value.hash === 'string' &&
  typeof value.folderId === 'string' &&
  typeof value.path === 'string' &&
  typeof value.fileName === 'string' &&
  typeof value.size === 'number' &&
  typeof value.mtimeMs === 'number' &&
  (value.kind === 'image' || value.kind === 'animated' || value.kind === 'video') &&
  typeof value.mimeType === 'string';

const isScanStatus = (value: unknown): value is FolderScanStatus =>
  isRecord(value) && typeof value.folderId === 'string' && typeof value.mediaCount === 'number';

/** The index is a cache: invalid entries are dropped silently and simply re-scanned. */
export function normalizeIndex(data: unknown): LibraryIndex {
  if (!isRecord(data)) throw new Error('Index root must be an object');
  const entries = Array.isArray(data.entries) ? data.entries.filter(isMediaEntry) : [];
  const folders: Record<string, FolderScanStatus> = {};
  if (isRecord(data.folders)) {
    for (const [id, status] of Object.entries(data.folders)) if (isScanStatus(status)) folders[id] = status;
  }
  return { entries, folders };
}
