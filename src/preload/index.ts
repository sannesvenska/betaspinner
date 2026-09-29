import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type PreloadApi } from '@shared/ipc';
import { fail } from '@shared/result';

const allowedChannels = new Set<string>(IPC_CHANNELS);

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
};

contextBridge.exposeInMainWorld('api', api);
