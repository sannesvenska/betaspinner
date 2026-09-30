import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FolderConfig, FolderScanStatus, LibraryIndex, MediaEntry, ScanProgress } from '@shared/content';
import { describeMedia } from './describeMedia';
import { mediaFormatOf } from './mediaFormats';

/** Parallel file reads per scan; higher values don't help on HDDs. */
const SCAN_CONCURRENCY = 4;
const PROGRESS_INTERVAL_MS = 100;

export type ScanFolder = Pick<FolderConfig, 'id' | 'path'>;

interface ScanOptions {
  folders: ScanFolder[];
  previous: LibraryIndex;
  onProgress?: (progress: ScanProgress) => void;
  now?: () => Date;
}

interface PendingFile {
  folderId: string;
  path: string;
  fileName: string;
  size: number;
  mtimeMs: number;
}

const cacheKey = (path: string, size: number, mtimeMs: number): string => `${path}|${size}|${mtimeMs}`;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function listMediaFiles(folder: ScanFolder): Promise<PendingFile[]> {
  // Non-recursive: one folder = one category
  const entries = await readdir(folder.path, { withFileTypes: true });
  const files: PendingFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.') || !mediaFormatOf(entry.name)) continue;
    const path = join(folder.path, entry.name);
    try {
      const info = await stat(path);
      files.push({ folderId: folder.id, path, fileName: entry.name, size: info.size, mtimeMs: info.mtimeMs });
    } catch {
      // Vanished between readdir and stat – skip
    }
  }
  return files;
}

async function describeFile(file: PendingFile): Promise<MediaEntry> {
  return { ...file, ...(await describeMedia(file.path, file.size)) };
}

/**
 * Scans the given folders and returns a fresh index for them.
 * Unchanged files (same path + size + mtime) reuse their cached entry, so rescans only hash new or changed files.
 * Index data of folders not in `folders` is dropped.
 */
export async function scanLibrary({
  folders,
  previous,
  onProgress,
  now = () => new Date(),
}: ScanOptions): Promise<LibraryIndex> {
  const cache = new Map(
    previous.entries.map((entry) => [cacheKey(entry.path, entry.size, entry.mtimeMs), entry]),
  );
  const statuses: Record<string, FolderScanStatus> = {};
  const pending: PendingFile[] = [];
  const scannedAt = now().toISOString();

  for (const folder of folders) {
    try {
      pending.push(...(await listMediaFiles(folder)));
      statuses[folder.id] = {
        folderId: folder.id,
        state: 'ok',
        mediaCount: 0,
        failedCount: 0,
        lastScannedAt: scannedAt,
      };
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
      statuses[folder.id] = {
        folderId: folder.id,
        state: missing ? 'missing' : 'error',
        mediaCount: 0,
        failedCount: 0,
        lastScannedAt: scannedAt,
        ...(missing ? {} : { error: errorMessage(error) }),
      };
    }
  }

  const entries: MediaEntry[] = [];
  let processed = 0;
  let lastReport = 0;
  const report = (force = false) => {
    const current = Date.now();
    if (!onProgress || (!force && current - lastReport < PROGRESS_INTERVAL_MS)) return;
    lastReport = current;
    onProgress({ processed, total: pending.length, currentFolderId: pending[processed]?.folderId ?? null });
  };
  report(true);

  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < pending.length) {
      const file = pending[nextIndex++];
      if (!file) break;
      const status = statuses[file.folderId];
      const cached = cache.get(cacheKey(file.path, file.size, file.mtimeMs));
      try {
        // Cached entries may come from another folder id if a folder was re-added – rebind
        entries.push(cached ? { ...cached, folderId: file.folderId } : await describeFile(file));
        if (status) status.mediaCount++;
      } catch {
        if (status) status.failedCount++;
      }
      processed++;
      report();
    }
  };
  await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker));
  report(true);

  // Stable order for UIs and deterministic session generation
  entries.sort((a, b) => a.folderId.localeCompare(b.folderId) || a.fileName.localeCompare(b.fileName));
  return { entries, folders: statuses };
}
