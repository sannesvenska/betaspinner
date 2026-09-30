import { create } from 'zustand';
import type { AppSettings } from '@shared/settings';

export type Screen = 'home' | 'admin' | 'showcase';
export type AdminSection =
  | 'folders'
  | 'mediaLibrary'
  | 'actionCards'
  | 'rules'
  | 'performers'
  | 'visualEffects'
  | 'penalties'
  | 'controls';

type SettingsState =
  { status: 'loading' } | { status: 'ready'; settings: AppSettings } | { status: 'error'; error: string };

interface UiState {
  screen: Screen;
  adminSection: AdminSection;
  settingsState: SettingsState;
  /** Neutral pause screen (game-design §19) */
  paused: boolean;
  /** Sessions whose category reveal was already shown (UI-only step, not part of the engine). */
  revealedSessionIds: string[];
  /** The resume question is asked once per app start. */
  resumeAnswered: boolean;
  navigate: (screen: Screen) => void;
  /** Opens the admin on a section (game-design §16). */
  openAdmin: (section: AdminSection) => void;
  loadSettings: () => Promise<void>;
  /** Persists settings in main; returns an error message or null. */
  saveSettings: (settings: AppSettings) => Promise<string | null>;
  togglePause: () => void;
  markRevealed: (sessionId: string) => void;
  answerResume: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  screen: 'home',
  adminSection: 'folders',
  settingsState: { status: 'loading' },
  paused: false,
  revealedSessionIds: [],
  resumeAnswered: false,
  navigate: (screen) => {
    set({ screen });
  },
  openAdmin: (adminSection) => {
    set({ screen: 'admin', adminSection });
  },
  loadSettings: async () => {
    const result = await window.api.invoke('settings:load', undefined);
    set({
      settingsState: result.ok
        ? { status: 'ready', settings: result.data }
        : { status: 'error', error: result.error },
    });
  },
  saveSettings: async (settings) => {
    const result = await window.api.invoke('settings:save', settings);
    if (!result.ok) return result.error;
    set({ settingsState: { status: 'ready', settings: result.data } });
    return null;
  },
  togglePause: () => {
    set((state) => ({ paused: !state.paused }));
  },
  markRevealed: (sessionId) => {
    set((state) => ({ revealedSessionIds: [...state.revealedSessionIds, sessionId] }));
  },
  answerResume: () => {
    set({ resumeAnswered: true });
  },
}));

const BASE_SPEED = 1;

/** Duration multiplier: 0 with reduced motion (OS or app setting), else the `animationSpeed` setting. */
export function useAnimationScale(): number {
  const settingsState = useUiStore((state) => state.settingsState);
  const settings = settingsState.status === 'ready' ? settingsState.settings : null;
  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced || settings?.reducedMotion) return 0;
  return settings?.animationSpeed ?? BASE_SPEED;
}
