import { create } from 'zustand';
import type { AppSettings } from '@shared/settings';

export type Screen = 'home' | 'showcase';

type SettingsState =
  { status: 'loading' } | { status: 'ready'; settings: AppSettings } | { status: 'error'; error: string };

interface UiState {
  screen: Screen;
  settingsState: SettingsState;
  navigate: (screen: Screen) => void;
  loadSettings: () => Promise<void>;
}

export const useUiStore = create<UiState>()((set) => ({
  screen: 'home',
  settingsState: { status: 'loading' },
  navigate: (screen) => {
    set({ screen });
  },
  loadSettings: async () => {
    const result = await window.api.invoke('settings:load', undefined);
    set({
      settingsState: result.ok
        ? { status: 'ready', settings: result.data }
        : { status: 'error', error: result.error },
    });
  },
}));
