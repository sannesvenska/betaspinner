import { describe, expect, it } from 'vitest';
import { FOLDER_DEFAULTS } from '@shared/content';
import { DEFAULT_GAME_CONFIG } from '@shared/config/gameConfig';
import { DEFAULT_ACTION_CARDS } from '@shared/session/defaults';
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
      actionCards: DEFAULT_ACTION_CARDS,
      game: DEFAULT_GAME_CONFIG,
    });
  });

  it('v2 to v3: action folders become disabled content folders and lose allowedActions', () => {
    const v2 = {
      schemaVersion: 2,
      data: {
        settings: DEFAULT_SETTINGS,
        folders: [
          {
            id: 'a',
            path: 'p1',
            group: 'good',
            role: 'action',
            enabled: true,
            allowedActions: ['good_fairy'],
          },
          { id: 'b', path: 'p2', group: 'bad', role: 'content', enabled: true, allowedActions: null },
        ],
      },
    };
    const config = normalizeConfig(migrate(v2, CONFIG_SCHEMA_VERSION, CONFIG_MIGRATIONS));
    expect(config.folders.map(({ id, role, enabled }) => ({ id, role, enabled }))).toEqual([
      { id: 'a', role: 'content', enabled: false },
      { id: 'b', role: 'content', enabled: true },
    ]);
    expect(config.folders.every((folder) => !('allowedActions' in folder))).toBe(true);
    expect(config.actionCards).toEqual(DEFAULT_ACTION_CARDS);
  });
});

describe('normalizeActionCards (10.4)', () => {
  const image = {
    hash: 'a'.repeat(40),
    fileName: `${'a'.repeat(40)}.png`,
    mimeType: 'image/png',
    kind: 'image',
  };

  it('keeps every built-in, merges saved overrides and accepts user variants', () => {
    const { actionCards } = normalizeConfig({
      actionCards: [
        { id: 'pixelate', builtIn: true, weight: 500, enabled: false, image },
        { id: 'squeeze-hard', type: 'squeeze_task', name: '  Squeeze hard ', params: { count: [30, 15] } },
        { id: 'broken', type: 'nope' },
        { id: 'pixelate', type: 'pixelate' }, // duplicate id of a built-in
      ],
    });
    expect(actionCards).toHaveLength(DEFAULT_ACTION_CARDS.length + 1);
    expect(actionCards.find((card) => card.id === 'pixelate')).toMatchObject({
      builtIn: true,
      weight: 100,
      enabled: false,
      image,
    });
    expect(actionCards.find((card) => card.id === 'squeeze-hard')).toMatchObject({
      type: 'squeeze_task',
      builtIn: false,
      name: 'Squeeze hard',
      params: { count: [15, 30] },
    });
  });

  it('assigns an image to one card only and rejects malformed images', () => {
    const { actionCards } = normalizeConfig({
      actionCards: [
        { id: 'pixelate', image },
        { id: 'splatter', image },
        { id: 'u_turn', image: { ...image, fileName: '../evil.png' } },
      ],
    });
    const byId = (id: string) => actionCards.find((card) => card.id === id);
    expect(byId('pixelate')?.image).toEqual(image);
    expect(byId('splatter')?.image).toBeNull();
    expect(byId('u_turn')?.image).toBeNull();
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

  it('clamps weights, orders the task range and maps unknown roles to content', () => {
    const folder = normalizeFolder({
      id: 'a',
      path: 'p',
      group: 'good',
      role: 'action',
      selectionWeight: 500,
      taskRange: [30, 10],
    });

    expect(folder).toMatchObject({ role: 'content', selectionWeight: 100, taskRange: [10, 30] });
    expect(normalizeFolder({ id: 'b', path: 'p', group: 'good', role: 'performer' })?.role).toBe('performer');
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
