import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { LibraryIndex, MediaEntry } from '@shared/content';
import type { ImageMask } from '@shared/masks';
import type {
  PackageImportMode,
  PackageProgress,
  PackagesStatus,
  PackageSummary,
  PackageZipInfo,
} from '@shared/packages';
import { EMPTY_PACKAGE_CONTENT, type PackageContent } from '../config/appConfig';
import type { ConfigService } from '../config/configService';
import { copyMediaFolder } from '../content/copyMedia';
import { normalizeIndex } from '../content/libraryIndex';
import { folderDirName } from '../content/libraryService';
import { MASKS_SCHEMA_VERSION, normalizeMaskFile, type MaskService } from '../masks/maskService';
import { migrate } from '../storage/jsonStore';
import {
  STATE_FILES,
  openPackageContext,
  type PackageContext,
  type PackageContextOptions,
} from './packageContext';
import {
  ACTION_ART_DIR,
  DRAFT_ART_DIR,
  FOLDERS_DIR,
  PACKAGE_FILE_NAME,
  PACKAGE_SCHEMA_VERSION,
  createPackageStore,
  normalizePackageFile,
  normalizePackageName,
  withStoredFolders,
  type PackageFile,
} from './packageFile';
import {
  extractZip,
  readZipEntries,
  safeEntryPath,
  writePackageZip,
  ZIP_MASKS_FILE,
  ZIP_PACKAGE_FILE,
} from './packageZip';

export class PackageError extends Error {
  constructor(
    readonly code:
      | 'no_library'
      | 'no_package'
      | 'not_found'
      | 'session_active'
      | 'active_package'
      | 'invalid_name'
      | 'invalid_zip'
      | 'target_not_empty',
  ) {
    super(code);
    this.name = 'PackageError';
  }
}

const DEFAULT_PACKAGE_NAME = 'Default';
const COPY_SUFFIX = ' (copy)';
const LEGACY_STATE_FILES = [STATE_FILES.progression, STATE_FILES.session, STATE_FILES.history] as const;

type ContextHooks = Omit<PackageContextOptions, 'packageDir' | 'stateDir' | 'fallback'>;

export interface PackageManagerOptions {
  config: ConfigService;
  userData: string;
  masks: () => MaskService;
  hooks: ContextHooks;
  onProgress: (progress: PackageProgress) => void;
}

export interface PackageManager {
  status: () => Promise<PackagesStatus>;
  context: () => PackageContext | null;
  requireContext: () => PackageContext;
  /** Opens the active package on start (no-op without library). */
  start: () => Promise<void>;
  /** Setup: library folder chosen – old content is copied into "Default", else an empty "Default" */
  chooseRoot: (root: string) => Promise<PackagesStatus>;
  activate: (id: string) => Promise<PackagesStatus>;
  create: (name: string) => Promise<PackagesStatus>;
  rename: (id: string, name: string) => Promise<PackagesStatus>;
  duplicate: (id: string) => Promise<PackagesStatus>;
  remove: (id: string) => Promise<PackagesStatus>;
  exportZip: (id: string, target: string) => Promise<void>;
  inspectZip: (path: string) => Promise<PackageZipInfo>;
  importZip: (path: string, mode: PackageImportMode) => Promise<PackagesStatus>;
  moveRoot: (target: string) => Promise<PackagesStatus>;
}

interface FoundPackage {
  dir: string;
  file: PackageFile;
}

const fallbackFile = (id: string, name: string): PackageFile => ({
  id,
  name,
  createdAt: new Date().toISOString(),
  ...EMPTY_PACKAGE_CONTENT,
});

async function directorySize(directory: string): Promise<{ files: number; bytes: number }> {
  if (!existsSync(directory)) return { files: 0, bytes: 0 };
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  let bytes = 0;
  let files = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    files++;
    bytes += (await stat(join(entry.parentPath, entry.name))).size;
  }
  return { files, bytes };
}

/** Moves a directory, also across drives (rename fails with EXDEV there). */
async function moveDirectory(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch {
    await cp(from, to, { recursive: true, errorOnExist: true, force: false });
    await rm(from, { recursive: true, force: true });
  }
}

const jsonEnvelope = (schemaVersion: number, data: unknown): Buffer =>
  Buffer.from(JSON.stringify({ schemaVersion, data }, null, 2), 'utf8');

export function createPackageManager(options: PackageManagerOptions): PackageManager {
  const { config, userData } = options;
  let current: PackageContext | null = null;
  let currentId: string | null = null;

  const root = (): string => {
    const value = config.get().library.root;
    if (!value) throw new PackageError('no_library');
    return value;
  };
  const stateDir = (id: string): string => join(userData, 'packages', id);

  async function findPackages(): Promise<FoundPackage[]> {
    const libraryRoot = config.get().library.root;
    if (!libraryRoot || !existsSync(libraryRoot)) return [];
    const entries = await readdir(libraryRoot, { withFileTypes: true });
    const found: FoundPackage[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const dir = join(libraryRoot, entry.name);
      if (!existsSync(join(dir, PACKAGE_FILE_NAME))) continue;
      try {
        const file = await createPackageStore(dir).read();
        // A manually copied package folder keeps its id – only the first one counts
        if (seen.has(file.id)) continue;
        seen.add(file.id);
        found.push({ dir, file });
      } catch (error) {
        console.error('[packages] skipping unreadable package', dir, error);
      }
    }
    return found.sort((a, b) => a.file.name.localeCompare(b.file.name));
  }

  async function find(id: string): Promise<FoundPackage> {
    const match = (await findPackages()).find((entry) => entry.file.id === id);
    if (!match) throw new PackageError('not_found');
    return match;
  }

  const isPlaying = (): boolean => {
    const session = current?.sessions.snapshot().session;
    return Boolean(session && session.phase !== 'ended');
  };

  async function open(found: FoundPackage): Promise<void> {
    current = await openPackageContext({
      ...options.hooks,
      packageDir: found.dir,
      stateDir: stateDir(found.file.id),
      fallback: found.file,
    });
    currentId = found.file.id;
    void current.library.rescan().catch((error: unknown) => {
      console.error('[library] scan after opening the package failed', error);
    });
  }

  async function setActive(id: string | null): Promise<void> {
    await config.update((value) => ({ ...value, library: { ...value.library, activePackageId: id } }));
  }

  async function writeNewPackage(file: PackageFile): Promise<string> {
    const dir = join(root(), folderDirName(file.name, file.id));
    await mkdir(join(dir, FOLDERS_DIR), { recursive: true });
    await createPackageStore(dir).write(file);
    return dir;
  }

  async function summaries(found: readonly FoundPackage[]): Promise<PackageSummary[]> {
    return Promise.all(
      found.map(async ({ dir, file }) => {
        const media = await directorySize(join(dir, FOLDERS_DIR));
        const all = await directorySize(dir);
        return {
          id: file.id,
          name: file.name,
          createdAt: file.createdAt,
          folderCount: file.folders.length,
          mediaCount: media.files,
          sizeBytes: all.bytes,
        };
      }),
    );
  }

  async function status(): Promise<PackagesStatus> {
    const found = await findPackages();
    const active = found.find((entry) => entry.file.id === currentId);
    return {
      root: config.get().library.root,
      activeId: active ? active.file.id : null,
      activeName: active ? (current?.packageConfig.manifest().name ?? active.file.name) : null,
      packages: await summaries(found),
      needsSetup: !current,
      hasLegacyContent: config.get().legacy !== null,
    };
  }

  /** §5.4 setup: copies the folders of a pre-package install (keeping their ids) and the app-owned art. */
  async function migrateLegacy(legacy: PackageContent): Promise<string> {
    const id = randomUUID();
    const dir = join(root(), folderDirName(DEFAULT_PACKAGE_NAME, id));
    const knownHashes = new Set<string>();
    const folders = [];
    for (const [index, folder] of legacy.folders.entries()) {
      const target = join(dir, FOLDERS_DIR, folderDirName(folder.displayName, folder.id));
      if (existsSync(folder.path)) {
        await copyMediaFolder(folder.path, target, knownHashes, (progress) => {
          options.onProgress({
            task: 'setup',
            label: `${folder.displayName} (${index + 1}/${legacy.folders.length})`,
            done: progress.copied,
            total: progress.total,
          });
        });
      } else await mkdir(target, { recursive: true });
      folders.push({ ...folder, path: target, sourcePath: folder.sourcePath ?? folder.path });
    }
    for (const art of [ACTION_ART_DIR, DRAFT_ART_DIR]) {
      const source = join(userData, art);
      if (existsSync(source)) await cp(source, join(dir, art), { recursive: true });
    }
    await createPackageStore(dir).write({
      id,
      name: DEFAULT_PACKAGE_NAME,
      createdAt: new Date().toISOString(),
      ...legacy,
      folders,
    });
    // Progression, running session and history continue in the new package (the scan cache is rebuilt)
    await mkdir(stateDir(id), { recursive: true });
    for (const name of LEGACY_STATE_FILES) {
      const source = join(userData, name);
      if (existsSync(source)) await cp(source, join(stateDir(id), name));
    }
    return id;
  }

  async function packageMediaHashes(found: FoundPackage): Promise<string[]> {
    if (found.file.id === currentId && current)
      return current.library.mediaEntries().map((entry) => entry.hash);
    try {
      const raw = JSON.parse(await readFile(join(stateDir(found.file.id), STATE_FILES.index), 'utf8')) as {
        data?: unknown;
      };
      const index: LibraryIndex = normalizeIndex(raw.data);
      return index.entries.map((entry: MediaEntry) => entry.hash);
    } catch {
      return [];
    }
  }

  return {
    status,
    context: () => current,
    requireContext: () => {
      if (!current) throw new PackageError('no_package');
      return current;
    },

    start: async () => {
      const found = await findPackages();
      const active =
        found.find((entry) => entry.file.id === config.get().library.activePackageId) ?? found[0];
      if (!active) return;
      await open(active);
      if (config.get().library.activePackageId !== active.file.id) await setActive(active.file.id);
    },

    chooseRoot: async (libraryRoot) => {
      await mkdir(libraryRoot, { recursive: true });
      await config.update((value) => ({ ...value, library: { ...value.library, root: libraryRoot } }));
      const legacy = config.get().legacy;
      let id: string;
      if (legacy) {
        id = await migrateLegacy(legacy);
        await config.update((value) => ({ ...value, legacy: null }));
      } else {
        // A library that already holds packages is simply used
        const existing = (await findPackages())[0];
        id = existing ? existing.file.id : randomUUID();
        if (!existing) await writeNewPackage(fallbackFile(id, DEFAULT_PACKAGE_NAME));
      }
      await setActive(id);
      await open(await find(id));
      return status();
    },

    activate: async (id) => {
      if (id === currentId) return status();
      if (isPlaying()) throw new PackageError('session_active');
      await open(await find(id));
      await setActive(id);
      return status();
    },

    create: async (name) => {
      const clean = normalizePackageName(name);
      if (!clean) throw new PackageError('invalid_name');
      await writeNewPackage(fallbackFile(randomUUID(), clean));
      return status();
    },

    rename: async (id, name) => {
      const clean = normalizePackageName(name);
      if (!clean) throw new PackageError('invalid_name');
      if (id === currentId && current) await current.packageConfig.rename(clean);
      else {
        const { dir, file } = await find(id);
        await createPackageStore(dir).write({ ...file, name: clean });
      }
      return status();
    },

    /** Same content under a new id; the game progress starts fresh. */
    duplicate: async (id) => {
      const { dir, file } = await find(id);
      const copy: PackageFile = {
        ...file,
        id: randomUUID(),
        name: normalizePackageName(file.name + COPY_SUFFIX) ?? file.name,
        createdAt: new Date().toISOString(),
      };
      const target = join(root(), folderDirName(copy.name, copy.id));
      await cp(dir, target, { recursive: true });
      // Folder paths are relative inside the package, so they point into the copy
      const store = createPackageStore(target);
      await store.write({ ...(await store.read()), id: copy.id, name: copy.name, createdAt: copy.createdAt });
      return status();
    },

    remove: async (id) => {
      if (id === currentId) throw new PackageError('active_package');
      const { dir } = await find(id);
      await options.hooks.trash(dir);
      await rm(stateDir(id), { recursive: true, force: true });
      return status();
    },

    exportZip: async (id, target) => {
      const found = await find(id);
      // Never ship where the files came from on this computer
      const shared: PackageFile = {
        ...withStoredFolders(found.dir, found.file),
        folders: withStoredFolders(found.dir, found.file).folders.map((folder) => ({
          ...folder,
          sourcePath: null,
        })),
      };
      const hashes = await packageMediaHashes(found);
      const masks = options.masks().getMany(hashes);
      await writePackageZip(
        found.dir,
        target,
        {
          [ZIP_PACKAGE_FILE]: jsonEnvelope(PACKAGE_SCHEMA_VERSION, shared),
          [ZIP_MASKS_FILE]: jsonEnvelope(MASKS_SCHEMA_VERSION, { masks }),
        },
        (progress) => {
          options.onProgress({ task: 'export', label: found.file.name, ...progress });
        },
      );
    },

    inspectZip: async (path) => {
      const file = await readPackageFromZip(path);
      const exists = (await findPackages()).some((entry) => entry.file.id === file.id);
      return { path, id: file.id, name: file.name, folderCount: file.folders.length, exists };
    },

    importZip: async (path, mode) => {
      const file = await readPackageFromZip(path);
      const existing = (await findPackages()).find((entry) => entry.file.id === file.id);
      const replacing = mode === 'replace' && existing !== undefined;
      if (replacing && existing.file.id === currentId && isPlaying())
        throw new PackageError('session_active');
      const id = replacing || !existing ? file.id : randomUUID();
      const name =
        replacing || !existing ? file.name : (normalizePackageName(file.name + COPY_SUFFIX) ?? file.name);

      const temp = join(root(), `.import-${randomUUID()}`);
      try {
        await extractZip(path, temp, [ZIP_PACKAGE_FILE, ZIP_MASKS_FILE], (progress) => {
          options.onProgress({ task: 'import', label: name, ...progress });
        });
        // Folder paths must stay inside the package (a foreign ZIP must not point anywhere else)
        const folders = file.folders.map((folder) => ({
          ...folder,
          path:
            safeEntryPath(temp, folder.path) ??
            join(temp, FOLDERS_DIR, folderDirName(folder.displayName, folder.id)),
          sourcePath: null,
        }));
        await createPackageStore(temp).write({ ...file, id, name, folders });
        if (replacing) await options.hooks.trash(existing.dir);
        await rename(temp, join(root(), folderDirName(name, id)));
      } catch (error) {
        await rm(temp, { recursive: true, force: true });
        throw error;
      }

      const { [ZIP_MASKS_FILE]: masksBuffer } = await readZipEntries(path, [ZIP_MASKS_FILE]);
      if (masksBuffer) {
        try {
          const envelope = JSON.parse(masksBuffer.toString('utf8')) as {
            schemaVersion: number;
            data: unknown;
          };
          const masks: Record<string, ImageMask> = normalizeMaskFile(
            migrate(envelope, MASKS_SCHEMA_VERSION, {}),
          ).masks;
          await options.masks().merge(masks);
        } catch (error) {
          console.error('[packages] masks of the imported package skipped', error);
        }
      }
      if (replacing && id === currentId) await open(await find(id));
      return status();
    },

    moveRoot: async (target) => {
      if (isPlaying()) throw new PackageError('session_active');
      if (existsSync(target) && (await readdir(target)).length > 0)
        throw new PackageError('target_not_empty');
      await mkdir(target, { recursive: true });
      for (const { dir } of await findPackages())
        await moveDirectory(dir, join(target, dir.split(/[\\/]/).at(-1) ?? ''));
      await config.update((value) => ({ ...value, library: { ...value.library, root: target } }));
      if (currentId) await open(await find(currentId));
      return status();
    },
  };

  async function readPackageFromZip(path: string): Promise<PackageFile> {
    try {
      const { [ZIP_PACKAGE_FILE]: buffer } = await readZipEntries(path, [ZIP_PACKAGE_FILE]);
      if (!buffer) throw new Error('missing package.json');
      const envelope = JSON.parse(buffer.toString('utf8')) as { schemaVersion: number; data: unknown };
      return normalizePackageFile(migrate(envelope, PACKAGE_SCHEMA_VERSION, {}));
    } catch (error) {
      console.error('[packages] not a package ZIP', path, error);
      throw new PackageError('invalid_zip');
    }
  }
}
