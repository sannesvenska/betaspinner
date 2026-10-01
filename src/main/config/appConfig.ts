import {
  DEFAULT_GAME_CONFIG,
  normalizeDraft,
  normalizePenaltyRules,
  normalizeSessionRules,
  normalizeVisualEffects,
  type GameConfig,
} from '@shared/config/gameConfig';
import { FOLDER_DEFAULTS, WEIGHT_RANGE, type ActionArtImage, type FolderConfig } from '@shared/content';
import { DRAFT_ART_SLOTS, type DraftArtSlot, type DraftCrop } from '@shared/draft';
import { DEFAULT_ACTION_CARDS } from '@shared/session/defaults';
import type { ActionCardDefinition } from '@shared/session/types';
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/settings';
import type { Migration } from '../storage/jsonStore';
import { normalizeSettings } from '../settings/normalizeSettings';
import { normalizeActionArtImage, normalizeActionCards } from './actionCardsConfig';

/** config.json (game-design §21). */
export interface AppConfig {
  settings: AppSettings;
  folders: FolderConfig[];
  /** game-design §10.4 action card definitions */
  actionCards: ActionCardDefinition[];
  /** game-design §16 session rules, penalties, visual effects, draft (admin) */
  game: GameConfig;
  /** game-design §6.0 draft card images (square crops) */
  draftArt: DraftArt;
}

export type DraftArt = Record<DraftArtSlot, DraftArtImage | null>;
export interface DraftArtImage {
  image: ActionArtImage;
  crop: DraftCrop;
}

export const EMPTY_DRAFT_ART: DraftArt = { back: null, bad: null, good: null, pixelate: null, double: null };

export const CONFIG_SCHEMA_VERSION = 5;

export const DEFAULT_CONFIG: AppConfig = {
  settings: DEFAULT_SETTINGS,
  folders: [],
  actionCards: [...DEFAULT_ACTION_CARDS],
  game: DEFAULT_GAME_CONFIG,
  draftArt: EMPTY_DRAFT_ART,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const CONFIG_MIGRATIONS: Readonly<Record<number, Migration>> = {
  // v1 stored AppSettings at the root
  1: (data) => ({ settings: data, folders: [] }),
  // v3 (game-design §5.1 v2): action folders become disabled content folders; action cards are defined
  2: (data) => {
    const root = isRecord(data) ? data : {};
    const folders: unknown[] = Array.isArray(root.folders) ? root.folders : [];
    return {
      ...root,
      folders: folders.map((folder) => {
        if (!isRecord(folder)) return folder;
        const rest = { ...folder };
        delete rest.allowedActions;
        return folder.role === 'action' ? { ...rest, role: 'content', enabled: false } : rest;
      }),
      actionCards: [],
    };
  },
  // v4 (AP10): game rules become configurable; normalization fills the defaults
  3: (data) => ({ ...(isRecord(data) ? data : {}), game: {} }),
  // v5: session draft (config + images); normalization fills the defaults
  4: (data) => ({ ...(isRecord(data) ? data : {}), draftArt: {} }),
};

const MIN_TASK_COUNT = 1;
const MAX_TASK_COUNT = 500;
const MAX_MIN_IMAGES = 1000;

const clampInt = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

function normalizeTaskRange(value: unknown): [number, number] {
  const [defaultMin, defaultMax] = FOLDER_DEFAULTS.taskRange;
  if (!Array.isArray(value)) return [defaultMin, defaultMax];
  const min = clampInt(value[0], MIN_TASK_COUNT, MAX_TASK_COUNT, defaultMin);
  const max = clampInt(value[1], MIN_TASK_COUNT, MAX_TASK_COUNT, defaultMax);
  return min <= max ? [min, max] : [max, min];
}

/** Returns null for entries that can't be repaired (no id/path/group) – they are dropped. */
export function normalizeFolder(value: unknown): FolderConfig | null {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.path)) return null;
  if (value.group !== 'good' && value.group !== 'bad') return null;

  return {
    id: value.id,
    path: value.path,
    displayName: nonEmptyString(value.displayName) ? value.displayName.trim() : value.path,
    group: value.group,
    role: value.role === 'performer' ? 'performer' : 'content',
    enabled: typeof value.enabled === 'boolean' ? value.enabled : FOLDER_DEFAULTS.enabled,
    selectionWeight: clampInt(
      value.selectionWeight,
      WEIGHT_RANGE.min,
      WEIGHT_RANGE.max,
      FOLDER_DEFAULTS.selectionWeight,
    ),
    shareWeight: clampInt(value.shareWeight, WEIGHT_RANGE.min, WEIGHT_RANGE.max, FOLDER_DEFAULTS.shareWeight),
    taskRange: normalizeTaskRange(value.taskRange),
    unmaskedEffectBehavior: value.unmaskedEffectBehavior === 'none' ? 'none' : 'full',
    minImages: clampInt(value.minImages, 1, MAX_MIN_IMAGES, FOLDER_DEFAULTS.minImages),
  };
}

export function normalizeConfig(data: unknown): AppConfig {
  if (!isRecord(data)) throw new Error('Config root must be an object');
  const rawFolders = Array.isArray(data.folders) ? data.folders : [];
  const seenIds = new Set<string>();
  const folders = rawFolders.flatMap((raw) => {
    const folder = normalizeFolder(raw);
    if (!folder || seenIds.has(folder.id)) return [];
    seenIds.add(folder.id);
    return [folder];
  });
  return {
    settings: isRecord(data.settings) ? normalizeSettings(data.settings) : DEFAULT_SETTINGS,
    folders,
    actionCards: normalizeActionCards(data.actionCards),
    game: normalizeGame(data.game),
    draftArt: normalizeDraftArt(data.draftArt),
  };
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function normalizeCrop(value: unknown): DraftCrop {
  if (!isRecord(value) || ![value.x, value.y, value.w, value.h].every(isNumber))
    return { x: 0, y: 0, w: 1, h: 1 };
  const w = Math.min(1, Math.max(0.01, value.w as number));
  const h = Math.min(1, Math.max(0.01, value.h as number));
  return {
    x: Math.min(1 - w, Math.max(0, value.x as number)),
    y: Math.min(1 - h, Math.max(0, value.y as number)),
    w,
    h,
  };
}

export function normalizeDraftArt(value: unknown): DraftArt {
  const source = isRecord(value) ? value : {};
  const usedHashes = new Set<string>();
  return Object.fromEntries(
    DRAFT_ART_SLOTS.map((slot) => {
      const entry = source[slot];
      const image = isRecord(entry) ? normalizeActionArtImage(entry.image) : null;
      // Videos are not allowed as draft art; one file per slot
      if (!image || image.kind === 'video' || usedHashes.has(image.hash)) return [slot, null];
      usedHashes.add(image.hash);
      return [slot, { image, crop: normalizeCrop(isRecord(entry) ? entry.crop : null) }];
    }),
  ) as DraftArt;
}

export function normalizeGame(value: unknown): GameConfig {
  const game = isRecord(value) ? value : {};
  return {
    rules: normalizeSessionRules(game.rules),
    penalties: normalizePenaltyRules(game.penalties),
    visualEffects: normalizeVisualEffects(game.visualEffects),
    draft: normalizeDraft(game.draft),
  };
}
