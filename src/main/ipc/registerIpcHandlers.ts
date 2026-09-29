import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { IpcChannel, IpcInvokeContract, IpcRequest, IpcResponse } from '@shared/ipc';
import { fail, ok } from '@shared/result';

export type IpcHandlers = {
  [C in IpcChannel]: (
    request: IpcRequest<C>,
    event: IpcMainInvokeEvent,
  ) => Promise<IpcInvokeContract[C]['response']> | IpcInvokeContract[C]['response'];
};

/** Registers every handler; thrown errors are converted to `{ ok: false }` results and logged. */
export function registerIpcHandlers(handlers: IpcHandlers): void {
  for (const channel of Object.keys(handlers) as IpcChannel[]) {
    ipcMain.handle(channel, async (event, request: unknown): Promise<IpcResponse<typeof channel>> => {
      try {
        const handler = handlers[channel] as (req: unknown, evt: IpcMainInvokeEvent) => unknown;
        return ok(await handler(request, event)) as IpcResponse<typeof channel>;
      } catch (error) {
        console.error(`[ipc] ${channel} failed`, error);
        return fail(error);
      }
    });
  }
}
