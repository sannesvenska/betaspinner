import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryIndex, MediaEntry } from '@shared/content';
import { EMPTY_PACKAGE_CONTENT, type PackageContent } from '../config/appConfig';
import { createConfigService } from '../config/configService';
import type { JsonStore } from '../storage/jsonStore';
import { createLibraryService, folderDirName, type RunScan } from './libraryService';

const HASH = 'a'.repeat(40);
const workspaces: string[] = [];

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

/** Fake scan: one media file per folder, all with the same hash. */
const fakeScan: RunScan = (folders) =>
  Promise.resolve({
    entries: folders.map((folder) => entryFor(folder.id, join(folder.path, 'x.png'))),
    folders: Object.fromEntries(
      folders.map((folder) => [
        folder.id,
        { folderId: folder.id, state: 'ok' as const, mediaCount: 1, failedCount: 0, lastScannedAt: 'now' },
      ]),
    ),
  });

/** Temp workspace with a package (`package/folders`) and source folders filled with distinct files. */
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'bs-library-'));
  workspaces.push(root);
  const source = async (name: string, files: Readonly<Record<string, string>>) => {
    const dir = join(root, 'sources', name);
    await mkdir(dir, { recursive: true });
    await Promise.all(Object.entries(files).map(([file, content]) => writeFile(join(dir, file), content)));
    return dir;
  };
  return { root, foldersRoot: join(root, 'package', 'folders'), source };
}

async function setup(
  runScan: RunScan = fakeScan,
  trash: (path: string) => Promise<void> = () => Promise.resolve(),
) {
  const space = await workspace();
  const configStore = memoryStore<PackageContent>(EMPTY_PACKAGE_CONTENT);
  const indexStore = memoryStore<LibraryIndex>({ entries: [], folders: {} });
  const onChanged = vi.fn();
  const onImportProgress = vi.fn();
  const service = await createLibraryService({
    config: await createConfigService(configStore, EMPTY_PACKAGE_CONTENT),
    foldersRoot: space.foldersRoot,
    indexStore,
    runScan,
    onProgress: vi.fn(),
    onImportProgress,
    onChanged,
    trash,
  });
  return { service, configStore, indexStore, onChanged, onImportProgress, ...space };
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('libraryService', () => {
  it('copies added folders into the package, skips duplicate content and keeps the source', async () => {
    const { service, configStore, source, foldersRoot, onImportProgress } = await setup();
    const good = await source('Good Stuff', { 'a.png': 'A', 'b.png': 'B', 'notes.txt': 'x' });
    const more = await source('More', { 'c.png': 'C', 'same-as-a.png': 'A' });

    await service.addFolders([
      { path: good, displayName: 'Good Stuff', group: 'good', role: 'content' },
      { path: good.toUpperCase(), displayName: 'Dupe', group: 'bad', role: 'content' },
      { path: more, displayName: 'More', group: 'bad', role: 'content' },
    ]);

    const folders = configStore.current().folders;
    expect(folders.map((folder) => folder.displayName)).toEqual(['Good Stuff', 'More']);
    const [first, second] = folders;
    if (!first || !second) throw new Error('folders missing');
    expect(first).toMatchObject({ sourcePath: good, enabled: true, selectionWeight: 50 });
    expect(first.path).toBe(join(foldersRoot, folderDirName('Good Stuff', first.id)));
    expect((await readdir(first.path)).sort()).toEqual(['a.png', 'b.png']);
    // The second folder's copy of "A" is already in the package
    expect(await readdir(second.path)).toEqual(['c.png']);
    expect(await readdir(good)).toHaveLength(3);
    expect(onImportProgress).toHaveBeenLastCalledWith({
      folderName: 'More',
      folderIndex: 1,
      folderCount: 2,
      copied: 2,
      total: 2,
    });
  });

  it('inspects picked folders: media count like the scan and already added sources', async () => {
    const { service, source, root } = await setup();
    const top = await source('top', {
      'a.png': '1',
      'b.webm': '2',
      'c.gif': '3',
      'notes.txt': '4',
      '.hidden.png': '5',
    });
    const sub = await source('sub', { 'd.png': '6' });
    await service.addFolders([{ path: sub, displayName: 'Sub', group: 'good', role: 'content' }]);

    const picked = await service.inspectFolders([top, sub.toUpperCase(), join(root, 'missing')]);
    expect(picked).toEqual([
      { path: top, mediaCount: 3, alreadyAdded: null },
      { path: sub.toUpperCase(), mediaCount: 1, alreadyAdded: 'Sub' },
      { path: join(root, 'missing'), mediaCount: null, alreadyAdded: null },
    ]);
  });

  it('indexes after a rescan; removing a folder drops it and sends its copy to the recycle bin', async () => {
    const trash = vi.fn(() => Promise.resolve());
    const { service, source } = await setup(fakeScan, trash);
    const dir = await source('a', { '1.png': '1' });
    const snapshot = await service.addFolders([
      { path: dir, displayName: 'A', group: 'bad', role: 'content' },
    ]);
    const folder = snapshot.folders[0];
    if (!folder) throw new Error('folder missing');
    await service.rescan();

    expect(service.resolveMedia(HASH)).toMatchObject({ mimeType: 'image/png' });
    expect(service.listMedia(folder.id, 0, 10).total).toBe(1);

    await service.removeFolder(folder.id);
    expect(service.resolveMedia(HASH)).toBeUndefined();
    expect(service.snapshot().status[folder.id]).toBeUndefined();
    expect(trash).toHaveBeenCalledWith(folder.path);
    expect(existsSync(dir)).toBe(true);
  });

  it('moves media of one folder to the recycle bin and keeps failed files indexed', async () => {
    const trash = vi.fn((path: string) =>
      path.includes('bad-') ? Promise.reject(new Error('locked')) : Promise.resolve(),
    );
    const { service, indexStore, source } = await setup(fakeScan, trash);
    await service.addFolders([
      { path: await source('Good', { '1.png': '1' }), displayName: 'Good', group: 'good', role: 'content' },
      { path: await source('Bad', { '2.png': '2' }), displayName: 'Bad', group: 'bad', role: 'content' },
    ]);
    await service.rescan();
    const [good, bad] = service.snapshot().folders;
    if (!good || !bad) throw new Error('folders missing');

    // Both folders hold the same hash: trashing it in one folder keeps the other file
    const result = await service.trashMedia(good.id, [HASH]);
    expect(result).toEqual({ trashed: 1, failed: [], orphanedHashes: [] });
    expect(trash).toHaveBeenCalledWith(join(good.path, 'x.png'));
    expect(indexStore.current().entries.map((entry) => entry.folderId)).toEqual([bad.id]);
    expect(indexStore.current().folders[good.id]?.mediaCount).toBe(0);

    const failed = await service.trashMedia(bad.id, [HASH]);
    expect(failed).toEqual({ trashed: 0, failed: ['x.png'], orphanedHashes: [] });
    expect(indexStore.current().entries).toHaveLength(1);
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
    const { service, source } = await setup();
    const snapshot = await service.addFolders([
      { path: await source('a', { '1.png': '1' }), displayName: 'A', group: 'bad', role: 'content' },
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
