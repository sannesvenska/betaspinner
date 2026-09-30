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
import type { Progression, SessionState } from './session/types';
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
}

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
  'library:pickFolders': { request: undefined; response: string[] };
  'library:addFolders': { request: NewFolderInput[]; response: LibrarySnapshot };
  'library:updateFolder': { request: { id: string; patch: FolderPatch }; response: LibrarySnapshot };
  'library:removeFolder': { request: { id: string }; response: LibrarySnapshot };
  /** Resolves when the scan (and any follow-up scan) finished. */
  'library:rescan': { request: undefined; response: LibrarySnapshot };
  'library:listMedia': { request: { folderId: string; offset: number; limit: number }; response: MediaPage };
  'session:getSnapshot': { request: undefined; response: SessionSnapshot };
  /** Spins the start wheel and, unless a penalty field is hit, generates the session. */
  'session:spin': { request: undefined; response: SpinResult };
  /** Runs one engine event; the new state is saved before it is returned. */
  'session:dispatch': { request: EngineEvent; response: SessionView };
  'session:close': { request: undefined; response: SessionSnapshot };
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
  'session:getSnapshot',
  'session:spin',
  'session:dispatch',
  'session:close',
  'dev:placeAction',
];

export const IPC_EVENTS: readonly IpcEvent[] = [
  'library:scanProgress',
  'library:changed',
  'app:togglePause',
  'session:progression',
];
