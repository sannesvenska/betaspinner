import type { JsonStore } from '../storage/jsonStore';
import { DEFAULT_CONFIG, type AppConfig } from './appConfig';

export interface ConfigService {
  get: () => AppConfig;
  /** Applies an immutable update and persists it; the in-memory value only changes after a successful write. */
  update: (change: (config: AppConfig) => AppConfig) => Promise<AppConfig>;
}

export async function createConfigService(store: JsonStore<AppConfig>): Promise<ConfigService> {
  let config = DEFAULT_CONFIG;
  let writable = true;
  try {
    config = await store.read();
  } catch (error) {
    // Newer schema or unreadable file: run with defaults but never overwrite that file
    writable = false;
    console.error('[config] could not load config.json, running read-only with defaults', error);
  }

  return {
    get: () => config,
    update: async (change) => {
      if (!writable)
        throw new Error('config.json is from a newer app version or unreadable; changes are not saved');
      const next = change(config);
      await store.write(next);
      config = next;
      return config;
    },
  };
}
