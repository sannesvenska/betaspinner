import { create } from 'zustand';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '@shared/config/gameConfig';
import type { GameConfigUpdate } from '@shared/ipc';
import type { SimulationResult } from '@shared/session/simulateSessions';

interface GameConfigState {
  /** Defaults until loaded, so screens never wait for rules. */
  config: GameConfig;
  simulation: SimulationResult | null;
  simulating: boolean;
  error: string | null;
  load: () => Promise<void>;
  update: (update: GameConfigUpdate) => Promise<boolean>;
  reset: (section: GameConfigUpdate['section']) => Promise<void>;
  simulate: (runs: number) => Promise<void>;
  dismissError: () => void;
}

/** game-design §16 admin values (session rules, penalties, visual effects). */
export const useGameConfigStore = create<GameConfigState>()((set) => ({
  config: DEFAULT_GAME_CONFIG,
  simulation: null,
  simulating: false,
  error: null,
  load: async () => {
    const result = await window.api.invoke('config:getGame', undefined);
    set(result.ok ? { config: result.data, error: null } : { error: result.error });
  },
  update: async (update) => {
    const result = await window.api.invoke('config:updateGame', update);
    set(result.ok ? { config: result.data, error: null } : { error: result.error });
    return result.ok;
  },
  reset: async (section) => {
    const result = await window.api.invoke('config:resetGame', { section });
    set(result.ok ? { config: result.data, error: null } : { error: result.error });
  },
  simulate: async (runs) => {
    set({ simulating: true });
    const result = await window.api.invoke('admin:simulate', { runs });
    set(
      result.ok
        ? { simulation: result.data, simulating: false, error: null }
        : { simulating: false, error: result.error },
    );
  },
  dismissError: () => {
    set({ error: null });
  },
}));
