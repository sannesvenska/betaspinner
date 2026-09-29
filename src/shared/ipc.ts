import type { Result } from './result';
import type { AppSettings } from './settings';

export interface AppInfo {
  version: string;
  isDev: boolean;
  userDataPath: string;
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
}

export type IpcChannel = keyof IpcInvokeContract;
export type IpcRequest<C extends IpcChannel> = IpcInvokeContract[C]['request'];
export type IpcResponse<C extends IpcChannel> = Result<IpcInvokeContract[C]['response']>;

/** Shape of `window.api` exposed by the preload script. */
export interface PreloadApi {
  invoke: <C extends IpcChannel>(channel: C, request: IpcRequest<C>) => Promise<IpcResponse<C>>;
}

export const IPC_CHANNELS: readonly IpcChannel[] = [
  'app:getInfo',
  'settings:load',
  'settings:save',
  'window:toggleFullscreen',
];
