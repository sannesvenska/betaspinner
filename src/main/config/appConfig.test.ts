import { describe, expect, it } from 'vitest';
import { FOLDER_DEFAULTS } from '@shared/content';
import { DEFAULT_SETTINGS } from '@shared/settings';
import { migrate } from '../storage/jsonStore';
import { CONFIG_MIGRATIONS, CONFIG_SCHEMA_VERSION, normalizeConfig, normalizeFolder } from './appConfig';

describe('config migration', () => {
  it('moves v1 root settings into settings and adds an empty folder list', () => {
    const v1 = { schemaVersion: 1, data: { ...DEFAULT_SETTINGS, startFullscreen: false } };
    const migrated = migrate(v1, CONFIG_SCHEMA_VERSION, CONFIG_MIGRATIONS);

    expect(normalizeConfig(migrated)).toEqual({
      settings: { ...DEFAULT_SETTINGS, startFullscreen: false },
      folders: [],
    });
  });
});

describe('normalizeFolder', () => {
  it('fills defaults for a minimal folder', () => {
    expect(normalizeFolder({ id: 'a', path: 'C:/pics', group: 'bad' })).toEqual({
      id: 'a',
      path: 'C:/pics',
      displayName: 'C:/pics',
      group: 'bad',
      role: 'content',
      ...FOLDER_DEFAULTS,
      taskRange: [...FOLDER_DEFAULTS.taskRange],
    });
  });

  it('clamps weights, orders the task range and filters unknown actions', () => {
    const folder = normalizeFolder({
      id: 'a',
      path: 'p',
      group: 'good',
      role: 'action',
      selectionWeight: 500,
      taskRange: [30, 10],
      allowedActions: ['good_fairy', 'nope'],
    });

    expect(folder).toMatchObject({
      role: 'action',
      selectionWeight: 100,
      taskRange: [10, 30],
      allowedActions: ['good_fairy'],
    });
  });

  it('rejects folders without id, path or valid group', () => {
    expect(normalizeFolder({ id: 'a', path: 'p' })).toBeNull();
    expect(normalizeFolder({ id: '', path: 'p', group: 'good' })).toBeNull();
    expect(normalizeFolder('nope')).toBeNull();
  });
});

describe('normalizeConfig', () => {
  it('drops broken and duplicate folders but keeps the rest', () => {
    const config = normalizeConfig({
      settings: {},
      folders: [
        { id: 'a', path: 'p1', group: 'good' },
        { id: 'a', path: 'p2', group: 'good' },
        { id: 'b', path: 'p3' },
      ],
    });

    expect(config.folders.map((folder) => folder.path)).toEqual(['p1']);
  });
});
