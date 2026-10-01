import { create } from 'zustand';
import type { IpcChannel, IpcRequest } from '@shared/ipc';
import type { PackageImportMode, PackageProgress, PackagesStatus, PackageZipInfo } from '@shared/packages';

interface PackagesState {
  status: PackagesStatus | null;
  /** Running setup copy, export, import or move */
  progress: PackageProgress | null;
  busy: boolean;
  error: string | null;
  load: () => Promise<void>;
  subscribe: () => () => void;
  chooseRoot: () => Promise<void>;
  activate: (id: string) => Promise<void>;
  create: (name: string) => Promise<boolean>;
  rename: (id: string, name: string) => Promise<boolean>;
  duplicate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  exportPackage: (id: string) => Promise<boolean>;
  pickImport: () => Promise<PackageZipInfo | null>;
  importPackage: (info: PackageZipInfo, mode: PackageImportMode) => Promise<boolean>;
  moveRoot: () => Promise<void>;
  dismissError: () => void;
}

type StatusChannel =
  | 'packages:status'
  | 'packages:chooseRoot'
  | 'packages:activate'
  | 'packages:create'
  | 'packages:rename'
  | 'packages:duplicate'
  | 'packages:remove'
  | 'packages:import'
  | 'packages:moveRoot';

/**
 * The renderer's stores all belong to the active package (§5.4), so switching it (or touching the
 * active package's files) reloads the window – every store starts fresh from the new package.
 */
const reloadWindow = () => {
  window.location.reload();
};

export const usePackagesStore = create<PackagesState>()((set, get) => {
  /** Runs a status-returning call; reloads when the active package or the library changed. */
  async function apply<C extends StatusChannel>(channel: C, request: IpcRequest<C>): Promise<boolean> {
    const before = get().status;
    set({ busy: true });
    const result = await window.api.invoke(channel, request);
    set({ busy: false, progress: null });
    if (!result.ok) {
      set({ error: result.error });
      return false;
    }
    const next = result.data;
    set({ status: next, error: null });
    if (before && (before.activeId !== next.activeId || before.root !== next.root)) reloadWindow();
    return true;
  }

  const invoke = async <C extends IpcChannel>(channel: C, request: IpcRequest<C>) => {
    set({ busy: true });
    const result = await window.api.invoke(channel, request);
    set({ busy: false, progress: null });
    if (!result.ok) set({ error: result.error });
    return result;
  };

  return {
    status: null,
    progress: null,
    busy: false,
    error: null,
    load: async () => {
      await apply('packages:status', undefined);
    },
    subscribe: () =>
      window.api.on('packages:progress', (progress) => {
        set({ progress });
      }),
    chooseRoot: async () => {
      await apply('packages:chooseRoot', undefined);
    },
    activate: async (id) => {
      await apply('packages:activate', { id });
    },
    create: (name) => apply('packages:create', { name }),
    rename: (id, name) => apply('packages:rename', { id, name }),
    duplicate: async (id) => {
      await apply('packages:duplicate', { id });
    },
    remove: async (id) => {
      await apply('packages:remove', { id });
    },
    exportPackage: async (id) => {
      const result = await invoke('packages:export', { id });
      return result.ok && result.data;
    },
    pickImport: async () => {
      const result = await invoke('packages:pickImport', undefined);
      return result.ok ? result.data : null;
    },
    importPackage: async (info, mode) => {
      const replacesActive = mode === 'replace' && info.id === get().status?.activeId;
      const ok = await apply('packages:import', { path: info.path, mode });
      // Replacing the active package swaps its files under the running stores
      if (ok && replacesActive) reloadWindow();
      return ok;
    },
    moveRoot: async () => {
      await apply('packages:moveRoot', undefined);
    },
    dismissError: () => {
      set({ error: null });
    },
  };
});
