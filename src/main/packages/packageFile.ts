import { isAbsolute, join, relative, resolve } from 'node:path';
import { normalizePackageContent, type PackageContent } from '../config/appConfig';
import { createConfigService, type ConfigService } from '../config/configService';
import { createJsonStore, type JsonStore } from '../storage/jsonStore';

/**
 * game-design §5.4 content packages: every package is a folder in the library with `package.json`
 * (manifest + content), `folders/` (copied media), `action-art/` and `draft-art/`.
 */
export const PACKAGE_FILE_NAME = 'package.json';
export const PACKAGE_SCHEMA_VERSION = 1;
export const FOLDERS_DIR = 'folders';
export const ACTION_ART_DIR = 'action-art';
export const DRAFT_ART_DIR = 'draft-art';

export interface PackageManifest {
  id: string;
  name: string;
  createdAt: string;
}

export interface PackageFile extends PackageManifest, PackageContent {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const MAX_NAME_LENGTH = 60;

export function normalizePackageName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed === '' ? null : trimmed;
}

/** Throws without id or name – such a folder is not a package. */
export function normalizePackageFile(data: unknown): PackageFile {
  if (!isRecord(data) || typeof data.id !== 'string' || data.id.trim() === '')
    throw new Error('Package without id');
  const name = normalizePackageName(data.name);
  if (!name) throw new Error('Package without name');
  return {
    id: data.id,
    name,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date(0).toISOString(),
    ...normalizePackageContent(data),
  };
}

/** Folder paths are stored relative to the package, so a package works wherever it is copied. */
const toStoredPath = (packageDir: string, path: string): string => {
  const relation = relative(packageDir, path);
  return relation === '' || relation.startsWith('..') || isAbsolute(relation)
    ? path
    : relation.split('\\').join('/');
};

const toAbsolutePath = (packageDir: string, path: string): string =>
  isAbsolute(path) ? path : resolve(packageDir, path);

export const withAbsoluteFolders = (packageDir: string, file: PackageFile): PackageFile => ({
  ...file,
  folders: file.folders.map((folder) => ({ ...folder, path: toAbsolutePath(packageDir, folder.path) })),
});

export const withStoredFolders = (packageDir: string, file: PackageFile): PackageFile => ({
  ...file,
  folders: file.folders.map((folder) => ({ ...folder, path: toStoredPath(packageDir, folder.path) })),
});

/** package.json with folder paths resolved against the package directory. */
export function createPackageStore(packageDir: string): JsonStore<PackageFile> {
  // A missing file reads as null: that folder is not a package
  const store = createJsonStore<PackageFile | null>({
    directory: packageDir,
    fileName: PACKAGE_FILE_NAME,
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    defaults: null,
    normalize: normalizePackageFile,
  });
  return {
    filePath: join(packageDir, PACKAGE_FILE_NAME),
    read: async () => {
      const file = await store.read();
      if (!file) throw new Error(`No ${PACKAGE_FILE_NAME} in ${packageDir}`);
      return withAbsoluteFolders(packageDir, file);
    },
    write: (file) => store.write(withStoredFolders(packageDir, file)),
  };
}

export interface PackageConfig {
  /** Content as the services see it (absolute folder paths) */
  config: ConfigService<PackageContent>;
  manifest: () => PackageManifest;
  rename: (name: string) => Promise<PackageManifest>;
}

/** Content view on a package file: services update the content, the manifest stays. */
export async function openPackageConfig(packageDir: string, fallback: PackageFile): Promise<PackageConfig> {
  const file = await createConfigService(createPackageStore(packageDir), fallback);
  const manifest = (): PackageManifest => {
    const { id, name, createdAt } = file.get();
    return { id, name, createdAt };
  };
  const content = (current: PackageFile): PackageContent => ({
    folders: current.folders,
    actionCards: current.actionCards,
    game: current.game,
    draftArt: current.draftArt,
  });
  return {
    config: {
      get: () => content(file.get()),
      update: async (change) =>
        content(await file.update((current) => ({ ...current, ...change(content(current)) }))),
    },
    manifest,
    rename: async (name) => {
      await file.update((current) => ({ ...current, name }));
      return manifest();
    },
  };
}
