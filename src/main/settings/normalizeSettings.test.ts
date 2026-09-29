import { DEFAULT_SETTINGS } from '@shared/settings';
import { describe, expect, it } from 'vitest';
import { normalizeSettings } from './normalizeSettings';

describe('normalizeSettings', () => {
  it('fills missing fields with defaults', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and replaces invalid ones field by field', () => {
    const result = normalizeSettings({
      languagePack: 'klingon',
      startFullscreen: false,
      animationSpeed: 99,
      sound: { enabled: true, volume: 'loud' },
    });

    expect(result).toEqual({
      ...DEFAULT_SETTINGS,
      startFullscreen: false,
      animationSpeed: 3,
      sound: { enabled: true, volume: DEFAULT_SETTINGS.sound.volume },
    });
  });

  it('throws when the root is not an object', () => {
    expect(() => normalizeSettings(null)).toThrow();
    expect(() => normalizeSettings([])).toThrow();
  });
});
