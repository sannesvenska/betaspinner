import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

async function setup(
  runScan: RunScan = fakeScan,
  trash: (path: string) => Promise<void> = () => Promise.resolve(),
) {
  const configStore = memoryStore<AppConfig>(DEFAULT_CONFIG);
  const indexStore = memoryStore<LibraryIndex>({ entries: [], folders: {} });
  const onChanged = vi.fn();
  const service = await createLibraryService({
    config: await createConfigService(configStore),
    indexStore,
    runScan,
    onProgress: vi.fn(),
    onChanged,
    trash,
  });
  return { service, configStore, indexStore, onChanged };
}

describe('libraryService', () => {
  it('moves media of one folder to the recycle bin and keeps failed files indexed', async () => {
    const trash = vi.fn((path: string) =>
      path.includes('Bad') ? Promise.reject(new Error('locked')) : Promise.resolve(),
    );
    const { service, indexStore } = await setup(fakeScan, trash);
    await service.addFolders([
      { path: 'C:/Pics/Good', displayName: 'Good', group: 'good', role: 'content' },
      { path: 'C:/Pics/Bad', displayName: 'Bad', group: 'bad', role: 'content' },
    ]);
    await service.rescan();
    const [good, bad] = service.snapshot().folders;
    if (!good || !bad) throw new Error('folders missing');

    // Both folders hold the same hash: trashing it in one folder keeps the other file (and its mask)
    const result = await service.trashMedia(good.id, [HASH]);
    expect(result).toEqual({ trashed: 1, failed: [], orphanedHashes: [] });
    expect(trash).toHaveBeenCalledWith(`${good.path}\\x.png`);
    expect(indexStore.current().entries.map((entry) => entry.folderId)).toEqual([bad.id]);
    expect(indexStore.current().folders[good.id]?.mediaCount).toBe(0);

    const failed = await service.trashMedia(bad.id, [HASH]);
    expect(failed).toEqual({ trashed: 0, failed: ['x.png'], orphanedHashes: [] });
    expect(indexStore.current().entries).toHaveLength(1);
  });

  it('inspects picked folders: media count like the scan and already added paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bs-inspect-'));
    try {
      await Promise.all(
        ['a.png', 'b.webm', 'c.gif', 'notes.txt', '.hidden.png'].map((name) =>
          writeFile(join(root, name), ''),
        ),
      );
      await mkdir(join(root, 'sub'));
      await writeFile(join(root, 'sub', 'd.png'), '');
      const { service } = await setup();
      await service.addFolders([
        { path: join(root, 'sub'), displayName: 'Sub', group: 'good', role: 'content' },
      ]);

      const picked = await service.inspectFolders([root, join(root, 'SUB'), join(root, 'missing')]);
      expect(picked).toEqual([
        { path: root, mediaCount: 3, alreadyAdded: null },
        { path: join(root, 'SUB'), mediaCount: 1, alreadyAdded: 'Sub' },
        { path: join(root, 'missing'), mediaCount: null, alreadyAdded: null },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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
