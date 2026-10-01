import type {
  FolderPatch,
  LibrarySnapshot,
  MediaEntry,
  MediaKind,
  NewFolderInput,
  ScanProgress,
} from './content';
import type { ActionId } from './actions';
import type { Result } from './result';
import type { EngineEvent } from './session/engine/reduce';
import type { GenerationErrorCode } from './session/generateSession';
import type { WheelResult } from './session/goalAndStart';
import type { GameConfig } from './config/gameConfig';
import type { DraftArtSlot, DraftCrop } from './draft';
import type { ActionArtImage, ImportProgress, PickedFolder } from './content';
import type { PackageImportMode, PackageProgress, PackagesStatus, PackageZipInfo } from './packages';
import type { ImageMask, MaskRegion, MaskStatus } from './masks';
import type { SimulationResult } from './session/simulateSessions';
import type { ActionCardDefinition, Progression, SessionState } from './session/types';
import type { AppSettings } from './settings';

export interface AppInfo {
  version: string;
  isDev: boolean;
  userDataPath: string;
}

export interface MediaPage {
  entries: MediaEntry[];
  total: number;
}

/** Media kind per image hash on the track (the renderer needs it to pick <img> vs <video>). */
export type SessionMediaKinds = Record<string, MediaKind>;

export interface SessionView {
  session: SessionState;
  mediaKinds: SessionMediaKinds;
}

export interface SessionSnapshot {
  /** null = no session (start screen) */
  session: SessionState | null;
  mediaKinds: SessionMediaKinds;
  progression: Progression;
  /** A saved session of an older format was discarded without scoring (game-design §8.3 v2). */
  discardedLegacySession: boolean;
}

/** Editable fields of an action card definition (admin, AP10). `sessionChance: null` = no gate. */
export type ActionCardPatch = Partial<
  Pick<
    ActionCardDefinition,
    | 'name'
    | 'description'
    | 'enabled'
    | 'weight'
    | 'minPerSession'
    | 'maxPerSession'
    | 'sessionChance'
    | 'params'
    | 'requires'
  >
>;

export type MaskFilter = 'all' | MaskStatus;
export type MaskBulkAction = 'no_regions' | 'clear';

/** Review progress of one folder (game-design §12.2). */
export interface MaskFolderSummary {
  total: number;
  reviewed: number;
  masked: number;
  noRegions: number;
}

export interface MaskedMediaEntry extends MediaEntry {
  maskStatus: MaskStatus;
  regionCount: number;
}

/** Draft images per slot (image in the action-art store + square crop). */
export type DraftArtView = Record<DraftArtSlot, { image: ActionArtImage; crop: DraftCrop } | null>;

export type GameConfigSection = keyof GameConfig;
export type GameConfigUpdate = {
  [S in GameConfigSection]: { section: S; value: GameConfig[S] };
}[GameConfigSection];

export interface SpinResult {
  wheel: WheelResult;
  /** null on a penalty field or when generation failed */
  session: SessionState | null;
  mediaKinds: SessionMediaKinds;
  lockoutUntil: string | null;
  generationError?: GenerationErrorCode;
}

/**
 * Single source of truth for renderer → main invoke channels.
 * Every handler returns a Result so the renderer must handle failures explicitly.
 */
export interface IpcInvokeContract {
  'app:getInfo': { request: undefined; response: AppInfo };
  'settings:load': { request: undefined; response: AppSettings };
  'settings:save': { request: AppSettings; response: AppSettings };
  'window:toggleFullscreen': { request: undefined; response: boolean };
  'library:getSnapshot': { request: undefined; response: LibrarySnapshot };
  /** Opens the native folder picker; empty array when cancelled. */
  'library:pickFolders': { request: undefined; response: PickedFolder[] };
  'library:addFolders': { request: NewFolderInput[]; response: LibrarySnapshot };
  'library:updateFolder': { request: { id: string; patch: FolderPatch }; response: LibrarySnapshot };
  'library:removeFolder': { request: { id: string }; response: LibrarySnapshot };
  /** Resolves when the scan (and any follow-up scan) finished. */
  'library:rescan': { request: undefined; response: LibrarySnapshot };
  'library:listMedia': { request: { folderId: string; offset: number; limit: number }; response: MediaPage };
  /** Moves media files of one folder to the recycle bin (§12.2); masks stay (keyed by content hash). */
  'library:trashMedia': {
    request: { folderId: string; hashes: string[] };
    response: { trashed: number; failed: string[] };
  };
  'session:getSnapshot': { request: undefined; response: SessionSnapshot };
  /** Spins the start wheel and, unless a penalty field is hit, generates the session. */
  'session:spin': { request: undefined; response: SpinResult };
  /** Runs one engine event; the new state is saved before it is returned. */
  'session:dispatch': { request: EngineEvent; response: SessionView };
  'session:close': { request: undefined; response: SessionSnapshot };
  /** §6.0 session draft: deal (if none pending) and turn over one field. */
  'draft:deal': { request: undefined; response: SessionSnapshot };
  'draft:pick': { request: { index: number }; response: SessionSnapshot };
  /** Draft card images (square crops) – admin */
  'draftArt:get': { request: undefined; response: DraftArtView };
  'draftArt:pickImage': { request: { slot: DraftArtSlot }; response: DraftArtView };
  'draftArt:setCrop': { request: { slot: DraftArtSlot; crop: DraftCrop }; response: DraftArtView };
  'draftArt:clear': { request: { slot: DraftArtSlot }; response: DraftArtView };
  /** §6.2 `allowReroll`: new board without the current categories, once, on the briefing. */
  'session:reroll': { request: undefined; response: SessionView };
  'progression:reset': { request: undefined; response: SessionSnapshot };
  'config:getGame': { request: undefined; response: GameConfig };
  /** Rejects invalid values (the renderer validates first with the same field specs). */
  'config:updateGame': { request: GameConfigUpdate; response: GameConfig };
  'config:resetGame': { request: { section: GameConfigSection }; response: GameConfig };
  /** Runs the generator with the saved config (game-design §16 simulation). */
  'admin:simulate': { request: { runs: number }; response: SimulationResult };
  'actionCards:list': { request: undefined; response: ActionCardDefinition[] };
  'actionCards:update': { request: { id: string; patch: ActionCardPatch }; response: ActionCardDefinition[] };
  'actionCards:duplicate': { request: { id: string; name: string }; response: ActionCardDefinition[] };
  'actionCards:remove': { request: { id: string }; response: ActionCardDefinition[] };
  'actionCards:reset': { request: { id: string }; response: ActionCardDefinition[] };
  /** Opens the native file picker and assigns the picked file; unchanged list when cancelled. */
  'actionCards:pickImage': { request: { id: string }; response: ActionCardDefinition[] };
  'actionCards:clearImage': { request: { id: string }; response: ActionCardDefinition[] };
  'masks:summary': { request: undefined; response: Record<string, MaskFolderSummary> };
  /** All media of a folder (sorted by file name) with their mask status; the grid virtualizes rendering. */
  'masks:listFolder': { request: { folderId: string; filter: MaskFilter }; response: MaskedMediaEntry[] };
  'masks:getMany': { request: { hashes: string[] }; response: Record<string, ImageMask> };
  'masks:save': {
    request: { imageHash: string; regions: MaskRegion[]; inverted?: boolean; status?: MaskStatus };
    response: ImageMask;
  };
  'masks:bulk': { request: { hashes: string[]; action: MaskBulkAction }; response: number };
  /** §5.4 content packages */
  'packages:status': { request: undefined; response: PackagesStatus };
  /** Opens the folder picker for the library; unchanged status when cancelled. */
  'packages:chooseRoot': { request: undefined; response: PackagesStatus };
  'packages:activate': { request: { id: string }; response: PackagesStatus };
  'packages:create': { request: { name: string }; response: PackagesStatus };
  'packages:rename': { request: { id: string; name: string }; response: PackagesStatus };
  'packages:duplicate': { request: { id: string }; response: PackagesStatus };
  'packages:remove': { request: { id: string }; response: PackagesStatus };
  /** Opens the save dialog; false when cancelled. */
  'packages:export': { request: { id: string }; response: boolean };
  /** Opens the file picker and reads the ZIP; null when cancelled. */
  'packages:pickImport': { request: undefined; response: PackageZipInfo | null };
  'packages:import': { request: { path: string; mode: PackageImportMode }; response: PackagesStatus };
  /** Opens the folder picker and moves all packages there; unchanged status when cancelled. */
  'packages:moveRoot': { request: undefined; response: PackagesStatus };
  /** Dev builds only (QA): puts an action card on both neighbour fields and enables a chosen roll. */
  'dev:placeAction': { request: { action: ActionId }; response: SessionView };
}

/** main → renderer push events */
export interface IpcEventContract {
  'library:scanProgress': ScanProgress;
  'library:changed': LibrarySnapshot;
  /** Global pause hotkey pressed (game-design §19) */
  'app:togglePause': null;
  /** Progression changed without a request (hourly decay) */
  'session:progression': Progression;
  /** Copying folders into the active package (§5.4) */
  'library:importProgress': ImportProgress;
  /** Setup copy, ZIP export / import, moving the library */
  'packages:progress': PackageProgress;
}

export type IpcChannel = keyof IpcInvokeContract;
export type IpcRequest<C extends IpcChannel> = IpcInvokeContract[C]['request'];
export type IpcResponse<C extends IpcChannel> = Result<IpcInvokeContract[C]['response']>;
export type IpcEvent = keyof IpcEventContract;

/** Shape of `window.api` exposed by the preload script. */
export interface PreloadApi {
  invoke: <C extends IpcChannel>(channel: C, request: IpcRequest<C>) => Promise<IpcResponse<C>>;
  /** Returns an unsubscribe function. */
  on: <E extends IpcEvent>(event: E, listener: (payload: IpcEventContract[E]) => void) => () => void;
}

export const IPC_CHANNELS: readonly IpcChannel[] = [
  'app:getInfo',
  'settings:load',
  'settings:save',
  'window:toggleFullscreen',
  'library:getSnapshot',
  'library:pickFolders',
  'library:addFolders',
  'library:updateFolder',
  'library:removeFolder',
  'library:rescan',
  'library:listMedia',
  'library:trashMedia',
  'session:getSnapshot',
  'session:spin',
  'session:dispatch',
  'session:close',
  'draft:deal',
  'draft:pick',
  'draftArt:get',
  'draftArt:pickImage',
  'draftArt:setCrop',
  'draftArt:clear',
  'session:reroll',
  'progression:reset',
  'config:getGame',
  'config:updateGame',
  'config:resetGame',
  'admin:simulate',
  'actionCards:list',
  'actionCards:update',
  'actionCards:duplicate',
  'actionCards:remove',
  'actionCards:reset',
  'actionCards:pickImage',
  'actionCards:clearImage',
  'masks:summary',
  'masks:listFolder',
  'masks:getMany',
  'masks:save',
  'masks:bulk',
  'packages:status',
  'packages:chooseRoot',
  'packages:activate',
  'packages:create',
  'packages:rename',
  'packages:duplicate',
  'packages:remove',
  'packages:export',
  'packages:pickImport',
  'packages:import',
  'packages:moveRoot',
  'dev:placeAction',
];

export const IPC_EVENTS: readonly IpcEvent[] = [
  'library:scanProgress',
  'library:changed',
  'app:togglePause',
  'session:progression',
  'library:importProgress',
  'packages:progress',
];
