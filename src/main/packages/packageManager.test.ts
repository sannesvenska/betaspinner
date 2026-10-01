import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import yazl from 'yazl';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { DEFAULT_CONFIG, EMPTY_PACKAGE_CONTENT, normalizeFolder, type AppConfig } from '../config/appConfig';
import { createConfigService } from '../config/configService';
import { scanLibrary } from '../content/scanLibrary';
import { createMaskService, EMPTY_MASK_FILE, type MaskFile } from '../masks/maskService';
import type { JsonStore } from '../storage/jsonStore';
import { createPackageManager, PackageError } from './packageManager';
import { createPackageStore, FOLDERS_DIR } from './packageFile';
import { safeEntryPath } from './packageZip';

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

/** 1×1 PNG with a distinct last byte, so every file has its own hash. */
const png = (variant: number): Buffer =>
  Buffer.concat([
    Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201ad5a3d2e0000000049454e44ae426082',
      'hex',
    ),
    Buffer.from([variant]),
  ]);

async function setup(initial: AppConfig = DEFAULT_CONFIG) {
  const base = await mkdtemp(join(tmpdir(), 'bs-packages-'));
  workspaces.push(base);
  const userData = join(base, 'userData');
  const libraryRoot = join(base, 'library');
  await mkdir(userData, { recursive: true });
  const configStore = memoryStore<AppConfig>(initial);
  const config = await createConfigService(configStore, DEFAULT_CONFIG);
  const maskStore = memoryStore<MaskFile>(EMPTY_MASK_FILE);
  const trash = vi.fn((path: string) => rm(path, { recursive: true, force: true }));
  let mediaOfActive: () => readonly { hash: string; folderId: string }[] = () => [];
  const masks = await createMaskService({
    store: maskStore,
    media: () => mediaOfActive() as never,
  });
  const manager = createPackageManager({
    config,
    userData,
    masks: () => masks,
    hooks: {
      runScan: (folders, previous, onProgress) => scanLibrary({ folders, previous, onProgress }),
      trash,
      onScanProgress: vi.fn(),
      onImportProgress: vi.fn(),
      onLibraryChanged: vi.fn(),
      onProgressionChanged: vi.fn(),
    },
    onProgress: vi.fn(),
  });
  mediaOfActive = () => manager.context()?.library.mediaEntries() ?? [];
  return { base, userData, libraryRoot, config, configStore, manager, masks, maskStore, trash };
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('package manager (§5.4)', () => {
  it('needs a library first and then creates an empty "Default" package', async () => {
    const { manager, libraryRoot, configStore } = await setup();
    await manager.start();
    expect((await manager.status()).needsSetup).toBe(true);
    expect(() => manager.requireContext()).toThrow(PackageError);

    const status = await manager.chooseRoot(libraryRoot);
    expect(status).toMatchObject({ needsSetup: false, activeName: 'Default', root: libraryRoot });
    expect(status.packages).toHaveLength(1);
    expect(configStore.current().library.activePackageId).toBe(status.activeId);
  });

  it('copies the content of a pre-package install into "Default" (folders keep their ids)', async () => {
    const empty = await setup();
    const source = join(empty.base, 'pics');
    await mkdir(source);
    await writeFile(join(source, 'a.png'), png(1));
    await writeFile(join(source, 'b.png'), png(2));
    const folder = normalizeFolder({ id: 'f-1', path: source, displayName: 'Pics', group: 'good' });
    if (!folder) throw new Error('folder');
    const { manager, libraryRoot, userData, configStore } = await setup({
      ...DEFAULT_CONFIG,
      legacy: { ...EMPTY_PACKAGE_CONTENT, folders: [folder] },
    });
    await writeFile(join(userData, 'progression.json'), '{"schemaVersion":1,"data":{"goodChance":0.5}}');

    const status = await manager.chooseRoot(libraryRoot);
    const context = manager.requireContext();
    const [copied] = context.packageConfig.config.get().folders;
    expect(copied).toMatchObject({ id: 'f-1', displayName: 'Pics', sourcePath: source });
    expect((await readdir(copied?.path ?? '')).sort()).toEqual(['a.png', 'b.png']);
    expect(configStore.current().legacy).toBeNull();
    expect(context.sessions.snapshot().progression.goodChance).toBe(0.5);
    expect(status.packages[0]).toMatchObject({ name: 'Default', folderCount: 1, mediaCount: 2 });
  });

  it('creates, renames, duplicates, switches and removes packages', async () => {
    const { manager, libraryRoot } = await setup();
    await manager.chooseRoot(libraryRoot);
    let status = await manager.create('Second');
    const second = status.packages.find((entry) => entry.name === 'Second');
    if (!second) throw new Error('second');

    status = await manager.rename(second.id, '  Summer  ');
    expect(status.packages.map((entry) => entry.name)).toContain('Summer');
    status = await manager.duplicate(second.id);
    expect(status.packages.map((entry) => entry.name)).toContain('Summer (copy)');

    status = await manager.activate(second.id);
    expect(status.activeName).toBe('Summer');
    await expect(manager.remove(second.id)).rejects.toMatchObject({ code: 'active_package' });
    const copy = status.packages.find((entry) => entry.name === 'Summer (copy)');
    status = await manager.remove(copy?.id ?? '');
    expect(status.packages.map((entry) => entry.name)).not.toContain('Summer (copy)');
    await expect(manager.create('   ')).rejects.toMatchObject({ code: 'invalid_name' });
  });

  it('exports a ZIP without local paths and imports it as copy with its masks', async () => {
    const { manager, libraryRoot, base, masks, maskStore } = await setup();
    await manager.chooseRoot(libraryRoot);
    const source = join(base, 'pics');
    await mkdir(source);
    await writeFile(join(source, 'a.png'), png(7));
    const context = manager.requireContext();
    await context.library.addFolders([{ path: source, displayName: 'Pics', group: 'good', role: 'content' }]);
    await context.library.rescan();
    const [entry] = context.library.mediaEntries();
    if (!entry) throw new Error('media');
    await masks.save({ imageHash: entry.hash, regions: [], status: 'no_regions' });

    const status = await manager.status();
    const zipPath = join(base, 'export.zip');
    await manager.exportZip(status.activeId ?? '', zipPath);
    expect(existsSync(zipPath)).toBe(true);

    // Masks vanish locally, the import brings them back
    await masks.bulk([entry.hash], 'clear');
    const info = await manager.inspectZip(zipPath);
    expect(info).toMatchObject({ name: 'Default', exists: true, folderCount: 1 });
    const imported = await manager.importZip(zipPath, 'copy');
    const copy = imported.packages.find((item) => item.name === 'Default (copy)');
    expect(copy).toMatchObject({ folderCount: 1, mediaCount: 1 });

    const dirs = await readdir(libraryRoot);
    const copyDir = dirs.find((dir) => dir.startsWith('default-copy'));
    const file = await createPackageStore(join(libraryRoot, copyDir ?? '')).read();
    expect(file.folders[0]?.sourcePath).toBeNull();
    expect(file.folders[0]?.path.startsWith(join(libraryRoot, copyDir ?? '', FOLDERS_DIR))).toBe(true);
    const rawPackage = await readFile(join(libraryRoot, copyDir ?? '', 'package.json'), 'utf8');
    expect(rawPackage).not.toContain(base.replaceAll('\\', '\\\\'));
    expect(maskStore.current().masks[entry.hash]).toMatchObject({ status: 'no_regions' });
  });

  it('rejects ZIPs that are no package or try to write outside the library', async () => {
    const { manager, libraryRoot, base } = await setup();
    await manager.chooseRoot(libraryRoot);
    const writeZip = async (path: string, entries: Readonly<Record<string, string>>) => {
      const zip = new yazl.ZipFile();
      for (const [name, content] of Object.entries(entries)) zip.addBuffer(Buffer.from(content), name);
      const done = pipeline(zip.outputStream, createWriteStream(path));
      zip.end();
      await done;
    };
    const noPackage = join(base, 'nothing.zip');
    await writeZip(noPackage, { 'readme.txt': 'hi' });
    await expect(manager.inspectZip(noPackage)).rejects.toMatchObject({ code: 'invalid_zip' });

    // Folder paths of a foreign package are forced into the package
    const foreign = join(base, 'foreign.zip');
    await writeZip(foreign, {
      'package.json': JSON.stringify({
        schemaVersion: 1,
        data: { id: 'foreign', name: 'Foreign', folders: [{ id: 'x', path: 'C:/Windows', group: 'good' }] },
      }),
    });
    await manager.importZip(foreign, 'copy');
    const dir = (await readdir(libraryRoot)).find((name) => name.startsWith('foreign'));
    const file = await createPackageStore(join(libraryRoot, dir ?? '')).read();
    expect(file.folders[0]?.path.startsWith(join(libraryRoot, dir ?? '', FOLDERS_DIR))).toBe(true);
    expect((await readdir(libraryRoot)).some((name) => name.startsWith('.import-'))).toBe(false);
  });
});

describe('safeEntryPath (zip slip)', () => {
  it('accepts package entries and rejects paths leaving the target', () => {
    const root = join(tmpdir(), 'target');
    expect(safeEntryPath(root, 'folders/a/1.png')).toBe(join(root, 'folders', 'a', '1.png'));
    for (const name of ['../outside.txt', 'a/../../x', '/etc/passwd', 'C:/Windows/x', String.raw`a\..\x`])
      expect(safeEntryPath(root, name)).toBeNull();
  });
});
