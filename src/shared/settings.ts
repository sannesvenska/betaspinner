/** App-level settings (config.json `settings`); game rules live in `@shared/config/gameConfig`. */
export interface AppSettings {
  languagePack: LanguagePackId;
  startFullscreen: boolean;
  /** Multiplies all animation durations; 0 = skip animations. */
  animationSpeed: number;
  reducedMotion: boolean;
  sound: { enabled: boolean; volume: number };
  /** Global pause hotkey as Electron accelerator (game-design §19), e.g. `CommandOrControl+Shift+Space`. */
  pauseHotkey: string;
}

export const LANGUAGE_PACKS = ['en-nsfw'] as const;
export type LanguagePackId = (typeof LANGUAGE_PACKS)[number];

export const SETTINGS_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  languagePack: 'en-nsfw',
  startFullscreen: true,
  animationSpeed: 1,
  reducedMotion: false,
  sound: { enabled: false, volume: 0.6 },
  pauseHotkey: 'CommandOrControl+Shift+Space',
};

const MODIFIERS = ['CommandOrControl', 'Control', 'Alt', 'Shift', 'Super'] as const;
const KEY_PATTERN = /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Home|End|PageUp|PageDown|Insert|Delete|Pause)$/;

/**
 * Accelerator with at least one modifier and exactly one key – a bare key would swallow normal typing
 * system-wide.
 */
export function isValidAccelerator(value: string): boolean {
  const parts = value.split('+');
  const key = parts.pop();
  if (!key || parts.length === 0 || !KEY_PATTERN.test(key)) return false;
  const modifiers = new Set(parts);
  return (
    modifiers.size === parts.length && parts.every((part) => (MODIFIERS as readonly string[]).includes(part))
  );
}
