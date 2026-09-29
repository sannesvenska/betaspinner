/**
 * App-level settings (subset of config.json that exists before the admin area, AP9).
 * Game rules config is added in later work packages.
 */
export interface AppSettings {
  languagePack: LanguagePackId;
  startFullscreen: boolean;
  /** Multiplies all animation durations; 0 = skip animations. */
  animationSpeed: number;
  reducedMotion: boolean;
  sound: { enabled: boolean; volume: number };
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
};
