import { describe, expect, it, vi } from 'vitest';
import type { LibraryIndex, MediaEntry } from '@shared/content';
import { DEFAULT_CONFIG, type AppConfig } from '../config/appConfig';
import { createConfigService } from '../config/configService';
import type { JsonStore } from '../storage/jsonStore';
import { createLibraryService, type RunScan } from './libraryService';

const HASH = 'a'.repeat(40);

function memoryStore<T>(initial: T): JsonStore<T> & { current: () => T } {
  let value = initial;
  return {
    filePath: 'memory',
    read: () => Promise.resolve(value),
    write: (next) => {
      value = next;
      return Promise.resolve();
    },
    current: () => value,
  };
}

const entryFor = (folderId: string, path: string): MediaEntry => ({
  hash: HASH,
  folderId,
  path,
  fileName: 'x.png',
  size: 1,
  mtimeMs: 1,
  kind: 'image',
  mimeType: 'image/png',
  width: 1,
  height: 1,
});

/** Fake scan: one media file per folder. */
const fakeScan: RunScan = (folders) =>
  Promise.resolve({
    entries: folders.map((folder) => entryFor(folder.id, `${folder.path}\\x.png`)),
    folders: Object.fromEntries(
      folders.map((folder) => [
        folder.id,
        { folderId: folder.id, state: 'ok' as const, mediaCount: 1, failedCount: 0, lastScannedAt: 'now' },
      ]),
    ),
  });

async function setup(runScan: RunScan = fakeScan) {
  const configStore = memoryStore<AppConfig>(DEFAULT_CONFIG);
  const indexStore = memoryStore<LibraryIndex>({ entries: [], folders: {} });
  const onChanged = vi.fn();
  const service = await createLibraryService({
    config: await createConfigService(configStore),
    indexStore,
    runScan,
    onProgress: vi.fn(),
    onChanged,
  });
  return { service, configStore, indexStore, onChanged };
}

describe('libraryService', () => {
  it('adds folders with defaults, skips duplicate paths (case-insensitive) and persists them', async () => {
    const { service, configStore } = await setup();
    await service.addFolders([
      { path: 'C:\\Pics\\Good', displayName: 'Good', group: 'good', role: 'content' },
      { path: 'c:\\pics\\good', displayName: 'Dupe', group: 'bad', role: 'content' },
    ]);

    const folders = configStore.current().folders;
    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatchObject({
      displayName: 'Good',
      group: 'good',
      enabled: true,
      selectionWeight: 50,
    });
  });

  it('indexes after a rescan and resolves media only for registered folders', async () => {
    const { service } = await setup();
    const snapshot = await service.addFolders([
      { path: 'C:\\a', displayName: 'A', group: 'bad', role: 'content' },
    ]);
    const folderId = snapshot.folders[0]?.id ?? '';
    await service.rescan();

    expect(service.resolveMedia(HASH)).toMatchObject({ mimeType: 'image/png' });
    expect(service.listMedia(folderId, 0, 10).total).toBe(1);

    await service.removeFolder(folderId);
    expect(service.resolveMedia(HASH)).toBeUndefined();
    expect(service.snapshot().status[folderId]).toBeUndefined();
  });

  it('runs one follow-up scan when rescan is requested during a running scan', async () => {
    let release: () => void = () => undefined;
    const runScan = vi.fn<RunScan>(
      (folders, previous, onProgress) =>
        new Promise((done) => {
          release = () => {
            done(fakeScan(folders, previous, onProgress));
          };
        }),
    );
    const { service } = await setup(runScan);

    const first = service.rescan();
    const second = service.rescan();
    const third = service.rescan();
    release();
    await vi.waitFor(() => {
      expect(runScan).toHaveBeenCalledTimes(2);
    });
    release();
    await Promise.all([first, second, third]);

    expect(runScan).toHaveBeenCalledTimes(2);
    expect(service.snapshot().scanning).toBe(false);
  });

  it('keeps path and id immutable and clamps patched values', async () => {
    const { service } = await setup();
    const snapshot = await service.addFolders([
      { path: 'C:\\a', displayName: 'A', group: 'bad', role: 'content' },
    ]);
    const folder = snapshot.folders[0];
    if (!folder) throw new Error('folder missing');

    const updated = await service.updateFolder(folder.id, {
      selectionWeight: 999,
      enabled: false,
      displayName: 'B',
    });

    expect(updated.folders[0]).toMatchObject({
      path: folder.path,
      selectionWeight: 100,
      enabled: false,
      displayName: 'B',
    });
  });
});
