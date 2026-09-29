import { ACTION_IDS, type ActionId } from '@shared/actions';
import { FOLDER_DEFAULTS, WEIGHT_RANGE, type FolderConfig } from '@shared/content';
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/settings';
import type { Migration } from '../storage/jsonStore';
import { normalizeSettings } from '../settings/normalizeSettings';

/** config.json (game-design §21). Grows with later work packages (actions, session rules …). */
export interface AppConfig {
  settings: AppSettings;
  folders: FolderConfig[];
}

export const CONFIG_SCHEMA_VERSION = 2;

export const DEFAULT_CONFIG: AppConfig = { settings: DEFAULT_SETTINGS, folders: [] };

export const CONFIG_MIGRATIONS: Readonly<Record<number, Migration>> = {
  // v1 stored AppSettings at the root
  1: (data) => ({ settings: data, folders: [] }),
};

const MIN_TASK_COUNT = 1;
const MAX_TASK_COUNT = 500;
const MAX_MIN_IMAGES = 1000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

function normalizeAllowedActions(value: unknown): ActionId[] | null {
  if (!Array.isArray(value)) return null;
  return ACTION_IDS.filter((id) => value.includes(id));
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
    role: value.role === 'action' ? 'action' : 'content',
    enabled: typeof value.enabled === 'boolean' ? value.enabled : FOLDER_DEFAULTS.enabled,
    selectionWeight: clampInt(
      value.selectionWeight,
      WEIGHT_RANGE.min,
      WEIGHT_RANGE.max,
      FOLDER_DEFAULTS.selectionWeight,
    ),
    shareWeight: clampInt(value.shareWeight, WEIGHT_RANGE.min, WEIGHT_RANGE.max, FOLDER_DEFAULTS.shareWeight),
    taskRange: normalizeTaskRange(value.taskRange),
    allowedActions: normalizeAllowedActions(value.allowedActions),
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
  };
}
