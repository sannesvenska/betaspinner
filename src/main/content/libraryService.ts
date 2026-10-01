import { randomUUID } from 'node:crypto';
import { isAbsolute, join, relative, resolve as resolvePath } from 'node:path';
import type {
  FolderConfig,
  FolderPatch,
  ImportProgress,
  LibraryIndex,
  LibrarySnapshot,
  MediaEntry,
  NewFolderInput,
  PickedFolder,
  ScanProgress,
} from '@shared/content';
import { normalizeFolder, type PackageContent } from '../config/appConfig';
import type { ConfigService } from '../config/configService';
import { copyMediaFolder } from './copyMedia';
import type { JsonStore } from '../storage/jsonStore';
import type { ResolvedMedia } from './mediaProtocol';
import { countMediaFiles, type ScanFolder } from './scanLibrary';

export type RunScan = (
  folders: ScanFolder[],
  previous: LibraryIndex,
  onProgress: (progress: ScanProgress) => void,
) => Promise<LibraryIndex>;

interface LibraryServiceOptions {
  /** The active package's content (§5.4) */
  config: ConfigService<PackageContent>;
  /** Package directory for copied folders (`<package>/folders`) */
  foldersRoot: string;
  onImportProgress?: (progress: ImportProgress) => void;
  indexStore: JsonStore<LibraryIndex>;
  runScan: RunScan;
  onProgress: (progress: ScanProgress) => void;
  onChanged: (snapshot: LibrarySnapshot) => void;
  /** Moves a file to the OS recycle bin (Electron `shell.trashItem`). */
  trash: (path: string) => Promise<void>;
}

export interface TrashResult {
  trashed: number;
  /** File names that could not be moved to the recycle bin (still indexed) */
  failed: string[];
  /** Hashes no indexed file has any more (their masks can go) */
  orphanedHashes: string[];
}

export interface LibraryService {
  snapshot: () => LibrarySnapshot;
  inspectFolders: (paths: readonly string[]) => Promise<PickedFolder[]>;
  addFolders: (inputs: NewFolderInput[]) => Promise<LibrarySnapshot>;
  updateFolder: (id: string, patch: FolderPatch) => Promise<LibrarySnapshot>;
  removeFolder: (id: string) => Promise<LibrarySnapshot>;
  /** game-design §12.2: moves media files of one folder to the recycle bin and drops them from the index. */
  trashMedia: (folderId: string, hashes: readonly string[]) => Promise<TrashResult>;
  /** Single-flight: a call during a running scan schedules exactly one follow-up scan. */
  rescan: () => Promise<LibrarySnapshot>;
  listMedia: (folderId: string, offset: number, limit: number) => { entries: MediaEntry[]; total: number };
  resolveMedia: (hash: string) => ResolvedMedia | undefined;
  /** All indexed media of registered folders (input for session generation). */
  mediaEntries: () => readonly MediaEntry[];
}

/** Windows paths are case-insensitive. */
const pathKey = (path: string): string => resolvePath(path).toLowerCase();

const isInside = (parent: string, path: string): boolean => {
  const relation = relative(parent, path);
  return relation !== '' && !relation.startsWith('..') && !isAbsolute(relation);
};

const FOLDER_SLUG_LENGTH = 40;
const ID_SUFFIX_LENGTH = 8;

/** Readable, unique directory name for a copied folder. */
export function folderDirName(displayName: string, id: string): string {
  const slug = displayName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, FOLDER_SLUG_LENGTH);
  return `${slug || 'folder'}-${id.slice(0, ID_SUFFIX_LENGTH)}`;
}

export async function createLibraryService(options: LibraryServiceOptions): Promise<LibraryService> {
  let index: LibraryIndex;
  try {
    index = await options.indexStore.read();
  } catch (error) {
    console.error('[library] index unreadable, starting empty', error);
    index = { entries: [], folders: {} };
  }
  let mediaByHash = new Map<string, MediaEntry>();
  let scanning = false;
  let runningScan: Promise<LibrarySnapshot> | null = null;
  let rescanRequested = false;
  // Function call so the flag isn't narrowed across the awaited scan
  const isRescanRequested = (): boolean => rescanRequested;

  const folders = (): FolderConfig[] => options.config.get().folders;

  const rebuildLookup = () => {
    const registeredIds = new Set(folders().map((folder) => folder.id));
    mediaByHash = new Map(
      index.entries.filter((entry) => registeredIds.has(entry.folderId)).map((entry) => [entry.hash, entry]),
    );
  };
  rebuildLookup();

  const snapshot = (): LibrarySnapshot => ({ folders: folders(), status: index.folders, scanning });

  const emitChanged = () => {
    options.onChanged(snapshot());
  };

  async function scanOnce(): Promise<void> {
    const scanFolders = folders().map(({ id, path }) => ({ id, path }));
    const next = await options.runScan(scanFolders, index, options.onProgress);
    // Folders removed while scanning must not come back
    const currentIds = new Set(folders().map((folder) => folder.id));
    index = {
      entries: next.entries.filter((entry) => currentIds.has(entry.folderId)),
      folders: Object.fromEntries(Object.entries(next.folders).filter(([id]) => currentIds.has(id))),
    };
    rebuildLookup();
    await options.indexStore.write(index);
  }

  function rescan(): Promise<LibrarySnapshot> {
    if (runningScan) {
      rescanRequested = true;
      return runningScan;
    }
    scanning = true;
    emitChanged();
    runningScan = (async () => {
      try {
        do {
          rescanRequested = false;
          await scanOnce();
        } while (isRescanRequested());
      } finally {
        scanning = false;
        runningScan = null;
        emitChanged();
      }
      return snapshot();
    })();
    return runningScan;
  }

  /** Original location of a folder (copied folders remember where they came from). */
  const originOf = (folder: FolderConfig): string => folder.sourcePath ?? folder.path;

  /** Setup dialog data: media count (same rules as the scan) and whether the path is already a folder. */
  async function inspectFolders(paths: readonly string[]): Promise<PickedFolder[]> {
    const known = new Map(folders().map((folder) => [pathKey(originOf(folder)), folder.displayName]));
    return Promise.all(
      paths.map(async (path) => ({
        path,
        mediaCount: await countMediaFiles(path),
        alreadyAdded: known.get(pathKey(path)) ?? null,
      })),
    );
  }

  /**
   * §5.4: the files are copied into the package (`folders/<name>-<id>`); the original stays untouched.
   * Content that is already in the package is not copied again.
   */
  async function addFolders(inputs: NewFolderInput[]): Promise<LibrarySnapshot> {
    const knownSources = new Set(folders().map((folder) => pathKey(originOf(folder))));
    const fresh = inputs.filter((input) => {
      const key = pathKey(input.path);
      if (knownSources.has(key)) return false;
      knownSources.add(key);
      return true;
    });
    const knownHashes = new Set(index.entries.map((entry) => entry.hash));
    const added: FolderConfig[] = [];
    for (const [folderIndex, input] of fresh.entries()) {
      const id = randomUUID();
      const source = resolvePath(input.path);
      const target = join(options.foldersRoot, folderDirName(input.displayName, id));
      await copyMediaFolder(source, target, knownHashes, (progress) => {
        options.onImportProgress?.({
          folderName: input.displayName,
          folderIndex,
          folderCount: fresh.length,
          ...progress,
        });
      });
      const folder = normalizeFolder({ ...input, id, path: target, sourcePath: source });
      if (folder) added.push(folder);
    }
    if (added.length === 0) return snapshot();

    await options.config.update((config) => ({ ...config, folders: [...config.folders, ...added] }));
    emitChanged();
    void rescan().catch((error: unknown) => {
      console.error('[library] scan after adding folders failed', error);
    });
    return snapshot();
  }

  async function updateFolder(id: string, patch: FolderPatch): Promise<LibrarySnapshot> {
    await options.config.update((config) => ({
      ...config,
      folders: config.folders.map((folder) => {
        if (folder.id !== id) return folder;
        // id and path are immutable; normalization clamps every patched value
        return normalizeFolder({ ...folder, ...patch, id: folder.id, path: folder.path }) ?? folder;
      }),
    }));
    rebuildLookup();
    emitChanged();
    return snapshot();
  }

  /** Removes the folder; its copy inside the package goes to the recycle bin (the original stays). */
  async function removeFolder(id: string): Promise<LibrarySnapshot> {
    const removed = folders().find((folder) => folder.id === id);
    await options.config.update((config) => ({
      ...config,
      folders: config.folders.filter((folder) => folder.id !== id),
    }));
    index = {
      entries: index.entries.filter((entry) => entry.folderId !== id),
      folders: Object.fromEntries(Object.entries(index.folders).filter(([folderId]) => folderId !== id)),
    };
    rebuildLookup();
    await options.indexStore.write(index);
    if (removed && isInside(options.foldersRoot, removed.path)) {
      await options.trash(removed.path).catch((error: unknown) => {
        console.error('[library] could not move the folder copy to the recycle bin', removed.path, error);
      });
    }
    emitChanged();
    return snapshot();
  }

  async function trashMedia(folderId: string, hashes: readonly string[]): Promise<TrashResult> {
    const wanted = new Set(hashes);
    const targets = index.entries.filter((entry) => entry.folderId === folderId && wanted.has(entry.hash));
    const trashedPaths = new Set<string>();
    const failed: string[] = [];
    for (const entry of targets) {
      try {
        await options.trash(entry.path);
        trashedPaths.add(entry.path);
      } catch (error) {
        console.error('[library] could not move to the recycle bin', entry.path, error);
        failed.push(entry.fileName);
      }
    }
    if (trashedPaths.size > 0) {
      const status = index.folders[folderId];
      index = {
        entries: index.entries.filter((entry) => !trashedPaths.has(entry.path)),
        folders: status
          ? {
              ...index.folders,
              [folderId]: { ...status, mediaCount: Math.max(0, status.mediaCount - trashedPaths.size) },
            }
          : index.folders,
      };
      rebuildLookup();
      await options.indexStore.write(index);
      emitChanged();
    }
    const remaining = new Set(index.entries.map((entry) => entry.hash));
    return {
      trashed: trashedPaths.size,
      failed,
      orphanedHashes: [...wanted].filter((hash) => !remaining.has(hash)),
    };
  }

  function listMedia(folderId: string, offset: number, limit: number) {
    const entries = index.entries.filter((entry) => entry.folderId === folderId);
    return { entries: entries.slice(offset, offset + limit), total: entries.length };
  }

  function resolveMedia(hash: string): ResolvedMedia | undefined {
    const entry = mediaByHash.get(hash);
    const folder = entry && folders().find((candidate) => candidate.id === entry.folderId);
    if (!entry || !folder) return undefined;
    return { path: entry.path, folderPath: folder.path, mimeType: entry.mimeType };
  }

  const mediaEntries = (): readonly MediaEntry[] => index.entries;

  return {
    snapshot,
    inspectFolders,
    addFolders,
    updateFolder,
    removeFolder,
    trashMedia,
    rescan,
    listMedia,
    resolveMedia,
    mediaEntries,
  };
}
