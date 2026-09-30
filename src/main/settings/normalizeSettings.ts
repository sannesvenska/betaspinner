import {
  DEFAULT_SETTINGS,
  isValidAccelerator,
  LANGUAGE_PACKS,
  type AppSettings,
  type LanguagePackId,
} from '@shared/settings';

const MIN_ANIMATION_SPEED = 0;
const MAX_ANIMATION_SPEED = 3;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const booleanOr = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const isLanguagePack = (value: unknown): value is LanguagePackId =>
  LANGUAGE_PACKS.some((pack) => pack === value);

/**
 * Tolerant settings reader: unknown or invalid fields fall back to defaults field by field,
 * so one bad value never resets the whole file. Throws only if the root is not an object.
 */
export function normalizeSettings(data: unknown): AppSettings {
  if (!isRecord(data)) throw new Error('Settings root must be an object');
  const sound = isRecord(data.sound) ? data.sound : {};

  return {
    languagePack: isLanguagePack(data.languagePack) ? data.languagePack : DEFAULT_SETTINGS.languagePack,
    startFullscreen: booleanOr(data.startFullscreen, DEFAULT_SETTINGS.startFullscreen),
    animationSpeed: clamp(
      numberOr(data.animationSpeed, DEFAULT_SETTINGS.animationSpeed),
      MIN_ANIMATION_SPEED,
      MAX_ANIMATION_SPEED,
    ),
    reducedMotion: booleanOr(data.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
    sound: {
      enabled: booleanOr(sound.enabled, DEFAULT_SETTINGS.sound.enabled),
      volume: clamp(numberOr(sound.volume, DEFAULT_SETTINGS.sound.volume), 0, 1),
    },
    pauseHotkey:
      typeof data.pauseHotkey === 'string' && isValidAccelerator(data.pauseHotkey)
        ? data.pauseHotkey
        : DEFAULT_SETTINGS.pauseHotkey,
  };
}
