import type { FolderConfig, FolderRole, MediaEntry } from '../content';
import { FOLDER_DEFAULTS } from '../content';
import type { Group } from '../game';
import { DEFAULT_ACTION_CARDS, DEFAULT_PROGRESSION, DEFAULT_SESSION_RULES } from './defaults';
import type { GenerateSessionInput } from './generateSession';

export function folder(
  id: string,
  group: Group,
  role: FolderRole = 'content',
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
    sourcePath: null,
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

/** 3 good + 3 bad categories (80 images each) and one performer gallery (20 images). */
export function standardInput(overrides: Partial<GenerateSessionInput> = {}): GenerateSessionInput {
  const folders = [
    folder('good-a', 'good'),
    folder('good-b', 'good'),
    folder('good-c', 'good'),
    folder('bad-a', 'bad'),
    folder('bad-b', 'bad'),
    folder('bad-c', 'bad'),
    folder('perf-a', 'good', 'performer'),
  ];
  return {
    seed: 1,
    sessionId: 'session-1',
    now: '2026-09-29T20:00:00.000Z',
    goalValue: 42,
    rules: DEFAULT_SESSION_RULES,
    actionCards: DEFAULT_ACTION_CARDS,
    folders,
    media: folders.flatMap((entry) => mediaFor(entry.id, entry.role === 'performer' ? 20 : 80)),
    progression: DEFAULT_PROGRESSION,
    ...overrides,
  };
}
