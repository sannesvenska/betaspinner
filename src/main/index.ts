import { app, BrowserWindow } from 'electron';
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA_VERSION, type AppSettings } from '@shared/settings';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { normalizeSettings } from './settings/normalizeSettings';
import { createJsonStore } from './storage/jsonStore';
import { createMainWindow } from './window';

const isDev = !app.isPackaged;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void startApp();
}

async function startApp(): Promise<void> {
  await app.whenReady();

  const settingsStore = createJsonStore<AppSettings>({
    directory: app.getPath('userData'),
    fileName: 'config.json',
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    defaults: DEFAULT_SETTINGS,
    normalize: normalizeSettings,
  });

  let settings = DEFAULT_SETTINGS;
  try {
    settings = await settingsStore.read();
  } catch (error) {
    // Newer schema or unreadable file: run with defaults but never overwrite the file implicitly
    console.error('[settings] could not load config.json, using defaults', error);
  }

  const getMainWindow = (): BrowserWindow | undefined => BrowserWindow.getAllWindows()[0];

  registerIpcHandlers({
    'app:getInfo': () => ({ version: app.getVersion(), isDev, userDataPath: app.getPath('userData') }),
    'settings:load': () => settings,
    'settings:save': async (next) => {
      const normalized = normalizeSettings(next);
      await settingsStore.write(normalized);
      settings = normalized;
      return settings;
    },
    'window:toggleFullscreen': () => {
      const window = getMainWindow();
      if (!window) throw new Error('No main window');
      window.setFullScreen(!window.isFullScreen());
      return window.isFullScreen();
    },
  });

  // Fullscreen by default, but not while developing
  createMainWindow({ fullscreen: settings.startFullscreen && !isDev, isDev });

  app.on('second-instance', () => {
    const window = getMainWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
