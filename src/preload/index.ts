import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS, type PreloadApi } from '@shared/ipc';
import { fail } from '@shared/result';

const allowedChannels = new Set<string>(IPC_CHANNELS);
const allowedEvents = new Set<string>(IPC_EVENTS);

const api: PreloadApi = {
  invoke: async (channel, request) => {
    // Defense in depth: only whitelisted channels reach the main process
    if (!allowedChannels.has(channel)) return fail(`Blocked IPC channel: ${channel}`);
    try {
      return (await ipcRenderer.invoke(channel, request)) as Awaited<ReturnType<PreloadApi['invoke']>>;
    } catch (error) {
      return fail(error);
    }
  },
  on: (event, listener) => {
    if (!allowedEvents.has(event)) throw new Error(`Blocked IPC event: ${event}`);
    // Never hand the raw IpcRendererEvent (with sender access) to the page
    const wrapped = (_event: IpcRendererEvent, payload: Parameters<typeof listener>[0]) => {
      listener(payload);
    };
    ipcRenderer.on(event, wrapped);
    return () => {
      ipcRenderer.removeListener(event, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
