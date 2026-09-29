import { app, BrowserWindow, dialog, globalShortcut } from 'electron';
import type { LibraryIndex } from '@shared/content';
import { DEFAULT_PROGRESSION } from '@shared/session/defaults';
import type { Progression, SessionState } from '@shared/session/types';
import type { IpcEvent, IpcEventContract } from '@shared/ipc';
import {
  CONFIG_MIGRATIONS,
  CONFIG_SCHEMA_VERSION,
  DEFAULT_CONFIG,
  normalizeConfig,
  type AppConfig,
} from './config/appConfig';
import { createConfigService } from './config/configService';
import { EMPTY_INDEX, INDEX_MIGRATIONS, INDEX_SCHEMA_VERSION, normalizeIndex } from './content/libraryIndex';
import { createLibraryService } from './content/libraryService';
import { handleMediaProtocol, registerMediaScheme } from './content/mediaProtocol';
import { runScanInWorker } from './content/runScanInWorker';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import {
  normalizeProgression,
  normalizeSessionFile,
  PROGRESSION_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSION,
} from './session/persistence';
import { createSessionService } from './session/sessionService';
import { normalizeSettings } from './settings/normalizeSettings';
import { createJsonStore } from './storage/jsonStore';
import { createMainWindow } from './window';

const isDev = !app.isPackaged;
/** Default from game-design §19; configurable in AP9. */
const PAUSE_HOTKEY = 'CommandOrControl+Shift+Space';

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

  handleMediaProtocol(library.resolveMedia);

  const sessions = await createSessionService({
    progressionStore: createJsonStore<Progression>({
      directory: userData,
      fileName: 'progression.json',
      schemaVersion: PROGRESSION_SCHEMA_VERSION,
      defaults: DEFAULT_PROGRESSION,
      normalize: normalizeProgression,
    }),
    sessionStore: createJsonStore<SessionState | null>({
      directory: userData,
      fileName: 'session-current.json',
      schemaVersion: SESSION_SCHEMA_VERSION,
      defaults: null,
      normalize: normalizeSessionFile,
    }),
    folders: () => config.get().folders,
    media: library.mediaEntries,
  });

  const getMainWindow = (): BrowserWindow | undefined => BrowserWindow.getAllWindows()[0];

  registerIpcHandlers({
    'app:getInfo': () => ({ version: app.getVersion(), isDev, userDataPath: userData }),
    'settings:load': () => config.get().settings,
    'settings:save': async (next) => {
      const saved = await config.update((current) => ({ ...current, settings: normalizeSettings(next) }));
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

  // game-design §19: global pause hotkey works even when the window is not focused
  if (
    !globalShortcut.register(PAUSE_HOTKEY, () => {
      broadcast('app:togglePause', null);
    })
  ) {
    console.error(`[pause] could not register global hotkey ${PAUSE_HOTKEY}`);
  }
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
