import { randomUUID } from 'node:crypto';
import { resolve as resolvePath } from 'node:path';
import type {
  FolderConfig,
  FolderPatch,
  LibraryIndex,
  LibrarySnapshot,
  MediaEntry,
  NewFolderInput,
  ScanProgress,
} from '@shared/content';
import { normalizeFolder } from '../config/appConfig';
import type { ConfigService } from '../config/configService';
import type { JsonStore } from '../storage/jsonStore';
import type { ResolvedMedia } from './mediaProtocol';
import type { ScanFolder } from './scanLibrary';

export type RunScan = (
  folders: ScanFolder[],
  previous: LibraryIndex,
  onProgress: (progress: ScanProgress) => void,
) => Promise<LibraryIndex>;

interface LibraryServiceOptions {
  config: ConfigService;
  indexStore: JsonStore<LibraryIndex>;
  runScan: RunScan;
  onProgress: (progress: ScanProgress) => void;
  onChanged: (snapshot: LibrarySnapshot) => void;
}

export interface LibraryService {
  snapshot: () => LibrarySnapshot;
  addFolders: (inputs: NewFolderInput[]) => Promise<LibrarySnapshot>;
  updateFolder: (id: string, patch: FolderPatch) => Promise<LibrarySnapshot>;
  removeFolder: (id: string) => Promise<LibrarySnapshot>;
  /** Single-flight: a call during a running scan schedules exactly one follow-up scan. */
  rescan: () => Promise<LibrarySnapshot>;
  listMedia: (folderId: string, offset: number, limit: number) => { entries: MediaEntry[]; total: number };
  resolveMedia: (hash: string) => ResolvedMedia | undefined;
}

/** Windows paths are case-insensitive. */
const pathKey = (path: string): string => resolvePath(path).toLowerCase();

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

  async function addFolders(inputs: NewFolderInput[]): Promise<LibrarySnapshot> {
    const knownPaths = new Set(folders().map((folder) => pathKey(folder.path)));
    const added = inputs.flatMap((input) => {
      const key = pathKey(input.path);
      if (knownPaths.has(key)) return [];
      knownPaths.add(key);
      const folder = normalizeFolder({ ...input, id: randomUUID(), path: resolvePath(input.path) });
      return folder ? [folder] : [];
    });
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

  async function removeFolder(id: string): Promise<LibrarySnapshot> {
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
    emitChanged();
    return snapshot();
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

  return { snapshot, addFolders, updateFolder, removeFolder, rescan, listMedia, resolveMedia };
}
