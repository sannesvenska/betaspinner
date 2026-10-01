import { create } from 'zustand';
import type {
  FolderPatch,
  ImportProgress,
  LibrarySnapshot,
  NewFolderInput,
  ScanProgress,
} from '@shared/content';
import type { IpcChannel, IpcInvokeContract, IpcRequest } from '@shared/ipc';

/** Channels that answer with a fresh library snapshot. */
type SnapshotChannel = {
  [C in IpcChannel]: IpcInvokeContract[C]['response'] extends LibrarySnapshot ? C : never;
}[IpcChannel];

interface LibraryState {
  snapshot: LibrarySnapshot | null;
  progress: ScanProgress | null;
  /** Folders being copied into the package (§5.4) */
  importing: ImportProgress | null;
  /** Last failed operation, shown inline until dismissed or the next success. */
  error: string | null;
  load: () => Promise<void>;
  /** Subscribes to main-process push events; returns the unsubscribe function. */
  subscribe: () => () => void;
  addFolders: (inputs: NewFolderInput[]) => Promise<boolean>;
  updateFolder: (id: string, patch: FolderPatch) => Promise<boolean>;
  removeFolder: (id: string) => Promise<boolean>;
  rescan: () => Promise<boolean>;
  dismissError: () => void;
}

export const useLibraryStore = create<LibraryState>()((set) => {
  /** Runs a snapshot-returning call and stores either the snapshot or the error. */
  async function applySnapshot<C extends SnapshotChannel>(
    channel: C,
    request: IpcRequest<C>,
  ): Promise<boolean> {
    const result = await window.api.invoke(channel, request);
    if (!result.ok) {
      set({ error: result.error });
      return false;
    }
    set({ snapshot: result.data, error: null });
    return true;
  }

  return {
    snapshot: null,
    progress: null,
    importing: null,
    error: null,
    load: async () => {
      await applySnapshot('library:getSnapshot', undefined);
    },
    subscribe: () => {
      const offChanged = window.api.on('library:changed', (snapshot) => {
        set(snapshot.scanning ? { snapshot } : { snapshot, progress: null });
      });
      const offProgress = window.api.on('library:scanProgress', (progress) => {
        set({ progress });
      });
      const offImport = window.api.on('library:importProgress', (importing) => {
        set({ importing });
      });
      return () => {
        offChanged();
        offProgress();
        offImport();
      };
    },
    addFolders: async (inputs) => {
      const ok = await applySnapshot('library:addFolders', inputs);
      set({ importing: null });
      return ok;
    },
    updateFolder: (id, patch) => applySnapshot('library:updateFolder', { id, patch }),
    removeFolder: (id) => applySnapshot('library:removeFolder', { id }),
    rescan: () => applySnapshot('library:rescan', undefined),
    dismissError: () => {
      set({ error: null });
    },
  };
});
