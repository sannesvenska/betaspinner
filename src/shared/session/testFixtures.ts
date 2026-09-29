import type { FolderConfig, MediaEntry } from '../content';
import { FOLDER_DEFAULTS } from '../content';
import type { Group } from '../game';
import { DEFAULT_ACTIONS, DEFAULT_PROGRESSION, DEFAULT_SESSION_RULES } from './defaults';
import type { GenerateSessionInput } from './generateSession';

export function folder(
  id: string,
  group: Group,
  role: 'content' | 'action' = 'content',
  extra: Partial<FolderConfig> = {},
): FolderConfig {
  return {
    id,
    path: `C:/media/${id}`,
    displayName: id,
    group,
    role,
    ...FOLDER_DEFAULTS,
    taskRange: [...FOLDER_DEFAULTS.taskRange],
    ...extra,
  };
}

export function mediaFor(folderId: string, count: number): MediaEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    hash: `${folderId}-${index}`.padEnd(40, '0'),
    folderId,
    path: `C:/media/${folderId}/${index}.png`,
    fileName: `${index}.png`,
    size: 1,
    mtimeMs: 1,
    kind: 'image' as const,
    mimeType: 'image/png',
    width: 10,
    height: 10,
  }));
}

/** 2 good + 2 bad categories (80 images each) and one action folder per group. */
export function standardInput(overrides: Partial<GenerateSessionInput> = {}): GenerateSessionInput {
  const folders = [
    folder('good-a', 'good'),
    folder('good-b', 'good'),
    folder('bad-a', 'bad'),
    folder('bad-b', 'bad'),
    folder('act-good', 'good', 'action'),
    folder('act-bad', 'bad', 'action'),
  ];
  return {
    seed: 1,
    sessionId: 'session-1',
    now: '2026-09-29T20:00:00.000Z',
    goalValue: 42,
    rules: DEFAULT_SESSION_RULES,
    actions: DEFAULT_ACTIONS,
    folders,
    media: folders.flatMap((entry) => mediaFor(entry.id, 80)),
    progression: DEFAULT_PROGRESSION,
    ...overrides,
  };
}
