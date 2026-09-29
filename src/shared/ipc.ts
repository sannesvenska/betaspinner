import type { FolderPatch, LibrarySnapshot, MediaEntry, NewFolderInput, ScanProgress } from './content';
import type { Result } from './result';
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
}

/** main → renderer push events */
export interface IpcEventContract {
  'library:scanProgress': ScanProgress;
  'library:changed': LibrarySnapshot;
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
];

export const IPC_EVENTS: readonly IpcEvent[] = ['library:scanProgress', 'library:changed'];
