import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';

const MIN_WINDOW_WIDTH = 1280;
const MIN_WINDOW_HEIGHT = 720;
const DEFAULT_WINDOW_WIDTH = 1600;
const DEFAULT_WINDOW_HEIGHT = 900;
/** Matches the `bg` design token so no white flash appears before the first paint. */
const WINDOW_BACKGROUND = '#0C0B0A';
/** Neutral title shown in the taskbar, never changed by the renderer (privacy). */
export const NEUTRAL_WINDOW_TITLE = 'Chance Runner';

interface CreateMainWindowOptions {
  fullscreen: boolean;
  isDev: boolean;
}

export function createMainWindow({ fullscreen, isDev }: CreateMainWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    fullscreen,
    show: false,
    title: NEUTRAL_WINDOW_TITLE,
    backgroundColor: WINDOW_BACKGROUND,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  window.removeMenu();
  window.on('page-title-updated', (event) => {
    event.preventDefault();
  });
  window.once('ready-to-show', () => {
    window.show();
  });

  // No popups, no navigation away from the app
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isDev && url.startsWith('http')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      window.setFullScreen(!window.isFullScreen());
      event.preventDefault();
    } else if (isDev && input.key === 'F12') {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (isDev && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}
