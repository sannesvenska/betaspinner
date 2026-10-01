import { join } from 'node:path';
import type { ImportProgress, LibraryIndex, LibrarySnapshot, ScanProgress } from '@shared/content';
import { DEFAULT_PROGRESSION } from '@shared/session/defaults';
import type { SessionRecord } from '@shared/session/history';
import type { Progression } from '@shared/session/types';
import { createActionCardService, type ActionCardService } from '../config/actionCardService';
import { createDraftArtService, type DraftArtService } from '../config/draftArtService';
import { cardImages, createActionArtStore, type ActionArtStore } from '../content/actionArtStore';
import { EMPTY_INDEX, INDEX_MIGRATIONS, INDEX_SCHEMA_VERSION, normalizeIndex } from '../content/libraryIndex';
import { createLibraryService, type LibraryService, type RunScan } from '../content/libraryService';
import type { ResolvedMedia } from '../content/mediaProtocol';
import {
  HISTORY_SCHEMA_VERSION,
  normalizeHistory,
  normalizeProgression,
  normalizeSessionFile,
  PROGRESSION_SCHEMA_VERSION,
  SESSION_MIGRATIONS,
  SESSION_SCHEMA_VERSION,
  type StoredSession,
} from '../session/persistence';
import { createSessionService, type SessionService } from '../session/sessionService';
import { createJsonStore } from '../storage/jsonStore';
import {
  ACTION_ART_DIR,
  DRAFT_ART_DIR,
  FOLDERS_DIR,
  openPackageConfig,
  type PackageConfig,
  type PackageFile,
} from './packageFile';

/** Per-package state that is never exported (§5.4): progression, running session, history, scan cache. */
export const STATE_FILES = {
  progression: 'progression.json',
  session: 'session-current.json',
  history: 'history.json',
  index: 'image-index.json',
} as const;

export interface PackageContextOptions {
  packageDir: string;
  /** `userData/packages/<id>` */
  stateDir: string;
  /** Used when package.json cannot be read (read-only fallback) */
  fallback: PackageFile;
  runScan: RunScan;
  trash: (path: string) => Promise<void>;
  onScanProgress: (progress: ScanProgress) => void;
  onImportProgress: (progress: ImportProgress) => void;
  onLibraryChanged: (snapshot: LibrarySnapshot) => void;
  onProgressionChanged: (progression: Progression) => void;
}

/** Everything the game uses from one package – swapped as a whole when another package is activated. */
export interface PackageContext {
  readonly packageDir: string;
  readonly stateDir: string;
  readonly packageConfig: PackageConfig;
  readonly library: LibraryService;
  readonly actionArt: ActionArtStore;
  readonly actionCards: ActionCardService;
  readonly draftArt: DraftArtService;
  readonly sessions: SessionService;
  /** Library media, then action card and draft images of this package */
  resolveMedia: (hash: string) => ResolvedMedia | undefined;
}

export async function openPackageContext(options: PackageContextOptions): Promise<PackageContext> {
  const { packageDir, stateDir } = options;
  const packageConfig = await openPackageConfig(packageDir, options.fallback);
  const { config } = packageConfig;

  const library = await createLibraryService({
    config,
    foldersRoot: join(packageDir, FOLDERS_DIR),
    indexStore: createJsonStore<LibraryIndex>({
      directory: stateDir,
      fileName: STATE_FILES.index,
      schemaVersion: INDEX_SCHEMA_VERSION,
      defaults: EMPTY_INDEX,
      migrations: INDEX_MIGRATIONS,
      normalize: normalizeIndex,
    }),
    runScan: options.runScan,
    onProgress: options.onScanProgress,
    onImportProgress: options.onImportProgress,
    onChanged: options.onLibraryChanged,
    trash: options.trash,
  });

  const actionArt = createActionArtStore(packageDir, ACTION_ART_DIR);
  const actionCards = createActionCardService(config, actionArt);
  const draftArtStore = createActionArtStore(packageDir, DRAFT_ART_DIR);
  const draftArt = createDraftArtService(config, draftArtStore);

  const sessions = await createSessionService({
    progressionStore: createJsonStore<Progression>({
      directory: stateDir,
      fileName: STATE_FILES.progression,
      schemaVersion: PROGRESSION_SCHEMA_VERSION,
      defaults: DEFAULT_PROGRESSION,
      normalize: normalizeProgression,
    }),
    sessionStore: createJsonStore<StoredSession>({
      directory: stateDir,
      fileName: STATE_FILES.session,
      schemaVersion: SESSION_SCHEMA_VERSION,
      defaults: null,
      migrations: SESSION_MIGRATIONS,
      normalize: normalizeSessionFile,
    }),
    historyStore: createJsonStore<SessionRecord[]>({
      directory: stateDir,
      fileName: STATE_FILES.history,
      schemaVersion: HISTORY_SCHEMA_VERSION,
      defaults: [],
      normalize: normalizeHistory,
    }),
    folders: () => config.get().folders,
    media: library.mediaEntries,
    actionCards: actionCards.list,
    game: () => config.get().game,
    onProgressionChanged: options.onProgressionChanged,
  });

  return {
    packageDir,
    stateDir,
    packageConfig,
    library,
    actionArt,
    actionCards,
    draftArt,
    sessions,
    resolveMedia: (hash) =>
      library.resolveMedia(hash) ??
      actionArt.resolve(hash, cardImages(actionCards.list())) ??
      draftArtStore.resolve(
        hash,
        Object.values(draftArt.get()).map((entry) => entry?.image ?? null),
      ),
  };
}
