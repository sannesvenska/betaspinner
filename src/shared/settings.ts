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
  /** Mask editor choices kept between images and app starts (game-design §12.3). */
  maskEditor: MaskEditorSettings;
}

export const MASK_DRAW_TOOLS = ['rect', 'ellipse', 'polygon', 'lasso'] as const;
export type MaskDrawTool = (typeof MASK_DRAW_TOOLS)[number];
export const MASK_PREVIEW_LEVELS = 5;

export interface MaskEditorSettings {
  /** Last drawing tool (select is never remembered) */
  tool: MaskDrawTool;
  /** Start value of "invert" for images without a saved mask */
  inverted: boolean;
  previewSplatter: boolean;
  /** Pixelate preview level 0..5 */
  previewLevel: number;
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
  maskEditor: { tool: 'rect', inverted: false, previewSplatter: false, previewLevel: 0 },
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
