import type { JsonStore } from '../storage/jsonStore';
import type { AppConfig } from './appConfig';

export interface ConfigService<T = AppConfig> {
  get: () => T;
  /** Applies an immutable update and persists it; the in-memory value only changes after a successful write. */
  update: (change: (config: T) => T) => Promise<T>;
}

/**
 * JSON-backed config (config.json, a package's package.json). A file from a newer app version or an
 * unreadable one runs read-only with the fallback, so it is never overwritten.
 */
export async function createConfigService<T = AppConfig>(
  store: JsonStore<T>,
  fallback: T,
): Promise<ConfigService<T>> {
  let config = fallback;
  let writable = true;
  try {
    config = await store.read();
  } catch (error) {
    writable = false;
    console.error(`[config] could not load ${store.filePath}, running read-only with defaults`, error);
  }

  return {
    get: () => config,
    update: async (change) => {
      if (!writable)
        throw new Error(`${store.filePath} is from a newer app version or unreadable; changes are not saved`);
      const next = change(config);
      await store.write(next);
      config = next;
      return config;
    },
  };
}
