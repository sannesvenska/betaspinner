import { create } from 'zustand';
import type { SessionSnapshot, SpinResult } from '@shared/ipc';
import type { EngineEvent } from '@shared/session/engine/reduce';
import type { SessionState } from '@shared/session/types';

interface SessionStoreState {
  snapshot: SessionSnapshot | null;
  /** A request is in flight – further input is ignored to avoid double actions. */
  busy: boolean;
  error: string | null;
  load: () => Promise<void>;
  /** Spins in main; the caller animates and then calls `adopt` with the result. */
  spin: () => Promise<SpinResult | null>;
  adopt: (result: SpinResult) => void;
  dispatch: (event: EngineEvent) => Promise<SessionState | null>;
  close: () => Promise<void>;
  dismissError: () => void;
}

export const useSessionStore = create<SessionStoreState>()((set, get) => ({
  snapshot: null,
  busy: false,
  error: null,
  load: async () => {
    const result = await window.api.invoke('session:getSnapshot', undefined);
    set(result.ok ? { snapshot: result.data, error: null } : { error: result.error });
  },
  spin: async () => {
    if (get().busy) return null;
    set({ busy: true });
    const result = await window.api.invoke('session:spin', undefined);
    set({ busy: false, ...(result.ok ? { error: null } : { error: result.error }) });
    return result.ok ? result.data : null;
  },
  adopt: (result) => {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    set({
      snapshot: {
        session: result.session,
        mediaKinds: result.mediaKinds,
        progression: {
          ...snapshot.progression,
          lockoutUntil: result.lockoutUntil ?? snapshot.progression.lockoutUntil,
        },
      },
    });
    // Progression changed in main (session counter, category usage) – refresh quietly
    void get().load();
  },
  dispatch: async (event) => {
    const snapshot = get().snapshot;
    if (get().busy || !snapshot?.session) return null;
    set({ busy: true });
    const result = await window.api.invoke('session:dispatch', event);
    if (!result.ok) {
      set({ busy: false, error: result.error });
      return null;
    }
    set({
      busy: false,
      error: null,
      snapshot: { ...snapshot, session: result.data.session, mediaKinds: result.data.mediaKinds },
    });
    return result.data.session;
  },
  close: async () => {
    const result = await window.api.invoke('session:close', undefined);
    set(result.ok ? { snapshot: result.data, error: null } : { error: result.error });
  },
  dismissError: () => {
    set({ error: null });
  },
}));

export const useSession = (): SessionState | null =>
  useSessionStore((state) => state.snapshot?.session ?? null);
