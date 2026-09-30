import { app, BrowserWindow, dialog, globalShortcut } from 'electron';
import type { LibraryIndex } from '@shared/content';
import { DEFAULT_PROGRESSION } from '@shared/session/defaults';
import type { SessionRecord } from '@shared/session/history';
import type { Progression } from '@shared/session/types';
import type { IpcEvent, IpcEventContract } from '@shared/ipc';
import {
  CONFIG_MIGRATIONS,
  CONFIG_SCHEMA_VERSION,
  DEFAULT_CONFIG,
  normalizeConfig,
  normalizeGame,
  type AppConfig,
} from './config/appConfig';
import { DEFAULT_GAME_CONFIG, hasErrors, validateGameSection } from '@shared/config/gameConfig';
import { simulateSessions } from '@shared/session/simulateSessions';
import { createActionCardService } from './config/actionCardService';
import { createConfigService } from './config/configService';
import { createActionArtStore } from './content/actionArtStore';
import { EMPTY_INDEX, INDEX_MIGRATIONS, INDEX_SCHEMA_VERSION, normalizeIndex } from './content/libraryIndex';
import { createLibraryService } from './content/libraryService';
import { MEDIA_EXTENSIONS } from './content/mediaFormats';
import { handleMediaProtocol, registerMediaScheme } from './content/mediaProtocol';
import { runScanInWorker } from './content/runScanInWorker';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import {
  HISTORY_SCHEMA_VERSION,
  normalizeHistory,
  normalizeProgression,
  normalizeSessionFile,
  PROGRESSION_SCHEMA_VERSION,
  SESSION_MIGRATIONS,
  SESSION_SCHEMA_VERSION,
  type StoredSession,
} from './session/persistence';
import { createSessionService } from './session/sessionService';
import { normalizeSettings } from './settings/normalizeSettings';
import { createJsonStore } from './storage/jsonStore';
import { createMainWindow } from './window';

const isDev = !app.isPackaged;
const DECAY_CHECK_INTERVAL_MS = 60_000;
const MAX_SIMULATION_RUNS = 5000;
let registeredHotkey: string | null = null;

/** game-design §19: global pause hotkey (configurable) works even when the window is not focused. */
function registerPauseHotkey(accelerator: string): void {
  if (registeredHotkey === accelerator) return;
  if (registeredHotkey) globalShortcut.unregister(registeredHotkey);
  registeredHotkey = null;
  const registered = globalShortcut.register(accelerator, () => {
    broadcast('app:togglePause', null);
  });
  if (registered) registeredHotkey = accelerator;
  else console.error(`[pause] could not register global hotkey ${accelerator}`);
}

// Dev/test only: isolate app data (config, index) from the real profile
const userDataOverride = process.env.CHANCE_RUNNER_USER_DATA;
if (isDev && userDataOverride) app.setPath('userData', userDataOverride);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerMediaScheme();
  void startApp();
}

function broadcast<E extends IpcEvent>(event: E, payload: IpcEventContract[E]): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(event, payload);
}

async function startApp(): Promise<void> {
  await app.whenReady();
  const userData = app.getPath('userData');

  const config = await createConfigService(
    createJsonStore<AppConfig>({
      directory: userData,
      fileName: 'config.json',
      schemaVersion: CONFIG_SCHEMA_VERSION,
      defaults: DEFAULT_CONFIG,
      migrations: CONFIG_MIGRATIONS,
      normalize: normalizeConfig,
    }),
  );

  const library = await createLibraryService({
    config,
    indexStore: createJsonStore<LibraryIndex>({
      directory: userData,
      fileName: 'image-index.json',
      schemaVersion: INDEX_SCHEMA_VERSION,
      defaults: EMPTY_INDEX,
      migrations: INDEX_MIGRATIONS,
      normalize: normalizeIndex,
    }),
    runScan: runScanInWorker,
    onProgress: (progress) => {
      broadcast('library:scanProgress', progress);
    },
    onChanged: (snapshot) => {
      broadcast('library:changed', snapshot);
    },
  });

  const actionArt = createActionArtStore(userData);
  const actionCards = createActionCardService(config, actionArt);
  // Library media first; action card images are served from the app-owned action-art store
  handleMediaProtocol((hash) => library.resolveMedia(hash) ?? actionArt.resolve(hash, actionCards.list()));

  const sessions = await createSessionService({
    progressionStore: createJsonStore<Progression>({
      directory: userData,
      fileName: 'progression.json',
      schemaVersion: PROGRESSION_SCHEMA_VERSION,
      defaults: DEFAULT_PROGRESSION,
      normalize: normalizeProgression,
    }),
    sessionStore: createJsonStore<StoredSession>({
      directory: userData,
      fileName: 'session-current.json',
      schemaVersion: SESSION_SCHEMA_VERSION,
      defaults: null,
      migrations: SESSION_MIGRATIONS,
      normalize: normalizeSessionFile,
    }),
    historyStore: createJsonStore<SessionRecord[]>({
      directory: userData,
      fileName: 'history.json',
      schemaVersion: HISTORY_SCHEMA_VERSION,
      defaults: [],
      normalize: normalizeHistory,
    }),
    folders: () => config.get().folders,
    media: library.mediaEntries,
    actionCards: actionCards.list,
    game: () => config.get().game,
    onProgressionChanged: (progression) => {
      broadcast('session:progression', progression);
    },
  });

  // game-design §13.3: decay lazily on start and every minute while running
  const runDecay = () => {
    sessions.tickDecay().catch((error: unknown) => {
      console.error('[progression] decay failed', error);
    });
  };
  runDecay();
  const decayTimer = setInterval(runDecay, DECAY_CHECK_INTERVAL_MS);

  const getMainWindow = (): BrowserWindow | undefined => BrowserWindow.getAllWindows()[0];

  registerIpcHandlers({
    'app:getInfo': () => ({ version: app.getVersion(), isDev, userDataPath: userData }),
    'settings:load': () => config.get().settings,
    'settings:save': async (next) => {
      const saved = await config.update((current) => ({ ...current, settings: normalizeSettings(next) }));
      registerPauseHotkey(saved.settings.pauseHotkey);
      return saved.settings;
    },
    'window:toggleFullscreen': () => {
      const window = getMainWindow();
      if (!window) throw new Error('No main window');
      window.setFullScreen(!window.isFullScreen());
      return window.isFullScreen();
    },
    'library:getSnapshot': () => library.snapshot(),
    'library:pickFolders': async (_request, event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.OpenDialogOptions = { properties: ['openDirectory', 'multiSelections'] };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      return result.canceled ? [] : result.filePaths;
    },
    'library:addFolders': (inputs) => library.addFolders(inputs),
    'library:updateFolder': ({ id, patch }) => library.updateFolder(id, patch),
    'library:removeFolder': ({ id }) => library.removeFolder(id),
    'library:rescan': () => library.rescan(),
    'library:listMedia': ({ folderId, offset, limit }) => library.listMedia(folderId, offset, limit),
    'session:getSnapshot': () => sessions.snapshot(),
    'session:spin': () => sessions.spin(),
    'session:dispatch': (event) => sessions.dispatch(event),
    'session:close': () => sessions.close(),
    'session:reroll': () => sessions.reroll(),
    'progression:reset': () => sessions.resetProgression(),
    'config:getGame': () => config.get().game,
    'config:updateGame': async (update) => {
      // Same field specs as the renderer: invalid input is rejected, never silently clamped
      if (hasErrors(validateGameSection(update))) throw new Error('invalid_config');
      const saved = await config.update((current) => ({
        ...current,
        game: normalizeGame({ ...current.game, [update.section]: update.value }),
      }));
      return saved.game;
    },
    'config:resetGame': async ({ section }) => {
      const saved = await config.update((current) => ({
        ...current,
        game: { ...current.game, [section]: DEFAULT_GAME_CONFIG[section] },
      }));
      return saved.game;
    },
    'admin:simulate': ({ runs }) =>
      simulateSessions(
        {
          rules: config.get().game.rules,
          actionCards: actionCards.list(),
          folders: config.get().folders,
          media: library.mediaEntries(),
          progression: sessions.snapshot().progression,
        },
        Math.min(Math.max(1, Math.round(runs)), MAX_SIMULATION_RUNS),
      ),
    'actionCards:list': () => actionCards.list(),
    'actionCards:update': ({ id, patch }) => actionCards.update(id, patch),
    'actionCards:duplicate': ({ id, name }) => actionCards.duplicate(id, name),
    'actionCards:remove': ({ id }) => actionCards.remove(id),
    'actionCards:reset': ({ id }) => actionCards.reset(id),
    'actionCards:pickImage': async ({ id }, event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: [{ name: 'Media', extensions: [...MEDIA_EXTENSIONS] }],
      };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      const [path] = result.filePaths;
      return result.canceled || !path ? actionCards.list() : actionCards.assignImage(id, path);
    },
    'actionCards:clearImage': ({ id }) => actionCards.clearImage(id),
    'dev:placeAction': ({ action }) => {
      // Never available in packaged builds
      if (!isDev) throw new Error('Not available');
      return sessions.devPlaceAction(action);
    },
  });

  // Fullscreen by default, but not while developing
  createMainWindow({ fullscreen: config.get().settings.startFullscreen && !isDev, isDev });

  // game-design §5.3: scan on startup (cached files are cheap)
  void library.rescan().catch((error: unknown) => {
    console.error('[library] startup scan failed', error);
  });

  app.on('second-instance', () => {
    const window = getMainWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  registerPauseHotkey(config.get().settings.pauseHotkey);
  app.on('will-quit', () => {
    clearInterval(decayTimer);
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
