import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { app, BrowserWindow, dialog, globalShortcut, shell, type OpenDialogOptions } from 'electron';
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
import { createConfigService } from './config/configService';
import {
  createMaskService,
  EMPTY_MASK_FILE,
  MASKS_SCHEMA_VERSION,
  normalizeMaskFile,
  type MaskFile,
} from './masks/maskService';
import { IMAGE_EXTENSIONS, MEDIA_EXTENSIONS } from './content/mediaFormats';
import { handleMediaProtocol, registerMediaScheme } from './content/mediaProtocol';
import { runScanInWorker } from './content/runScanInWorker';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { createPackageManager } from './packages/packageManager';
import { normalizeSettings } from './settings/normalizeSettings';
import { createJsonStore } from './storage/jsonStore';
import type { MediaEntry } from '@shared/content';
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
const userDataOverride = process.env.BETASPINNER_USER_DATA;
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
    DEFAULT_CONFIG,
  );

  // Masks are shared by all packages (keyed by content hash, §5.4 / §12.3)
  let mediaOfActivePackage: () => readonly MediaEntry[] = () => [];
  const masks = await createMaskService({
    store: createJsonStore<MaskFile>({
      directory: userData,
      fileName: 'masks.json',
      schemaVersion: MASKS_SCHEMA_VERSION,
      defaults: EMPTY_MASK_FILE,
      normalize: normalizeMaskFile,
    }),
    media: () => mediaOfActivePackage(),
  });

  const packages = createPackageManager({
    config,
    userData,
    masks: () => masks,
    hooks: {
      runScan: runScanInWorker,
      trash: (path) => shell.trashItem(path),
      onScanProgress: (progress) => {
        broadcast('library:scanProgress', progress);
      },
      onImportProgress: (progress) => {
        broadcast('library:importProgress', progress);
      },
      onLibraryChanged: (snapshot) => {
        broadcast('library:changed', snapshot);
      },
      onProgressionChanged: (progression) => {
        broadcast('session:progression', progression);
      },
    },
    onProgress: (progress) => {
      broadcast('packages:progress', progress);
    },
  });
  await packages.start();
  /** The active package; IPC calls before the setup fail with `no_package`. */
  const ctx = () => packages.requireContext();
  mediaOfActivePackage = () => packages.context()?.library.mediaEntries() ?? [];
  handleMediaProtocol((hash) => packages.context()?.resolveMedia(hash));

  // game-design §13.3: decay lazily on start and every minute while running
  const runDecay = () => {
    packages
      .context()
      ?.sessions.tickDecay()
      .catch((error: unknown) => {
        console.error('[progression] decay failed', error);
      });
  };
  runDecay();
  const decayTimer = setInterval(runDecay, DECAY_CHECK_INTERVAL_MS);

  const getMainWindow = (): BrowserWindow | undefined => BrowserWindow.getAllWindows()[0];
  const showOpen = (sender: Electron.WebContents, options: OpenDialogOptions) => {
    const window = BrowserWindow.fromWebContents(sender);
    return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
  };

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
    'library:getSnapshot': () => ctx().library.snapshot(),
    'library:pickFolders': async (_request, event) => {
      // Start next to the most recently added folder (siblings are usually the next categories)
      const last = ctx().packageConfig.config.get().folders.at(-1);
      const lastSource = last ? (last.sourcePath ?? last.path) : undefined;
      const startDirectory = lastSource ? dirname(lastSource) : undefined;
      const result = await showOpen(event.sender, {
        properties: ['openDirectory', 'multiSelections'],
        ...(startDirectory && existsSync(startDirectory) ? { defaultPath: startDirectory } : {}),
      });
      return result.canceled ? [] : ctx().library.inspectFolders(result.filePaths);
    },
    'library:addFolders': (inputs) => ctx().library.addFolders(inputs),
    'library:updateFolder': ({ id, patch }) => ctx().library.updateFolder(id, patch),
    'library:removeFolder': ({ id }) => ctx().library.removeFolder(id),
    'library:rescan': () => ctx().library.rescan(),
    'library:listMedia': ({ folderId, offset, limit }) => ctx().library.listMedia(folderId, offset, limit),
    // Masks stay (keyed by content hash): re-importing the same image later brings them back (§12.3)
    'library:trashMedia': async ({ folderId, hashes }) => {
      const result = await ctx().library.trashMedia(folderId, hashes);
      return { trashed: result.trashed, failed: result.failed };
    },
    'session:getSnapshot': () => ctx().sessions.snapshot(),
    'session:spin': () => ctx().sessions.spin(),
    'session:dispatch': (event) => ctx().sessions.dispatch(event),
    'session:close': () => ctx().sessions.close(),
    'session:reroll': () => ctx().sessions.reroll(),
    'draft:deal': () => ctx().sessions.dealDraft(),
    'draft:pick': ({ index }) => ctx().sessions.pickDraft(index),
    'draftArt:get': () => ctx().draftArt.get(),
    'draftArt:pickImage': async ({ slot }, event) => {
      const result = await showOpen(event.sender, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: [...IMAGE_EXTENSIONS] }],
      });
      const [path] = result.filePaths;
      return result.canceled || !path ? ctx().draftArt.get() : ctx().draftArt.assign(slot, path);
    },
    'draftArt:setCrop': ({ slot, crop }) => ctx().draftArt.setCrop(slot, crop),
    'draftArt:clear': ({ slot }) => ctx().draftArt.clear(slot),
    'progression:reset': () => ctx().sessions.resetProgression(),
    'config:getGame': () => ctx().packageConfig.config.get().game,
    'config:updateGame': async (update) => {
      // Same field specs as the renderer: invalid input is rejected, never silently clamped
      if (hasErrors(validateGameSection(update))) throw new Error('invalid_config');
      const saved = await ctx().packageConfig.config.update((current) => ({
        ...current,
        game: normalizeGame({ ...current.game, [update.section]: update.value }),
      }));
      return saved.game;
    },
    'config:resetGame': async ({ section }) => {
      const saved = await ctx().packageConfig.config.update((current) => ({
        ...current,
        game: { ...current.game, [section]: DEFAULT_GAME_CONFIG[section] },
      }));
      return saved.game;
    },
    'admin:simulate': ({ runs }) => {
      const { packageConfig, actionCards, library, sessions } = ctx();
      return simulateSessions(
        {
          rules: packageConfig.config.get().game.rules,
          actionCards: actionCards.list(),
          folders: packageConfig.config.get().folders,
          media: library.mediaEntries(),
          progression: sessions.snapshot().progression,
        },
        Math.min(Math.max(1, Math.round(runs)), MAX_SIMULATION_RUNS),
      );
    },
    'actionCards:list': () => ctx().actionCards.list(),
    'actionCards:update': ({ id, patch }) => ctx().actionCards.update(id, patch),
    'actionCards:duplicate': ({ id, name }) => ctx().actionCards.duplicate(id, name),
    'actionCards:remove': ({ id }) => ctx().actionCards.remove(id),
    'actionCards:reset': ({ id }) => ctx().actionCards.reset(id),
    'actionCards:pickImage': async ({ id }, event) => {
      const result = await showOpen(event.sender, {
        properties: ['openFile'],
        filters: [{ name: 'Media', extensions: [...MEDIA_EXTENSIONS] }],
      });
      const [path] = result.filePaths;
      return result.canceled || !path ? ctx().actionCards.list() : ctx().actionCards.assignImage(id, path);
    },
    'actionCards:clearImage': ({ id }) => ctx().actionCards.clearImage(id),
    'masks:summary': () => masks.summary(),
    'masks:listFolder': ({ folderId, filter }) => masks.listFolder(folderId, filter),
    'masks:getMany': ({ hashes }) => masks.getMany(hashes),
    'masks:save': (input) => masks.save(input),
    'masks:bulk': ({ hashes, action }) => masks.bulk(hashes, action),
    'dev:placeAction': ({ action }) => {
      // Never available in packaged builds
      if (!isDev) throw new Error('Not available');
      return ctx().sessions.devPlaceAction(action);
    },
    'packages:status': () => packages.status(),
    'packages:chooseRoot': async (_request, event) => {
      const result = await showOpen(event.sender, { properties: ['openDirectory', 'createDirectory'] });
      const [path] = result.filePaths;
      return result.canceled || !path ? packages.status() : packages.chooseRoot(path);
    },
    'packages:activate': ({ id }) => packages.activate(id),
    'packages:create': ({ name }) => packages.create(name),
    'packages:rename': ({ id, name }) => packages.rename(id, name),
    'packages:duplicate': ({ id }) => packages.duplicate(id),
    'packages:remove': ({ id }) => packages.remove(id),
    'packages:export': async ({ id }, event) => {
      const status = await packages.status();
      const name = status.packages.find((entry) => entry.id === id)?.name ?? 'package';
      const window = BrowserWindow.fromWebContents(event.sender);
      const options = {
        defaultPath: `${name}.zip`,
        filters: [{ name: 'Betaspinner package', extensions: ['zip'] }],
      };
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return false;
      await packages.exportZip(id, result.filePath);
      return true;
    },
    'packages:pickImport': async (_request, event) => {
      const result = await showOpen(event.sender, {
        properties: ['openFile'],
        filters: [{ name: 'Betaspinner package', extensions: ['zip'] }],
      });
      const [path] = result.filePaths;
      return result.canceled || !path ? null : packages.inspectZip(path);
    },
    'packages:import': ({ path, mode }) => packages.importZip(path, mode),
    'packages:moveRoot': async (_request, event) => {
      const result = await showOpen(event.sender, { properties: ['openDirectory', 'createDirectory'] });
      const [path] = result.filePaths;
      return result.canceled || !path ? packages.status() : packages.moveRoot(path);
    },
  });

  // Fullscreen by default, but not while developing
  createMainWindow({ fullscreen: config.get().settings.startFullscreen && !isDev, isDev });

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
