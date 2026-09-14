import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, screen, shell } from 'electron';
import { paths } from './system/paths';

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

const TITLE_BAR_HEIGHT = 36;
const THEMES = {
  dark: { color: '#151515', symbolColor: '#C3C2B7' },
  light: { color: '#FAF9F5', symbolColor: '#3D3D3A' },
} as const;

function statePath() {
  return join(paths().userData, 'window-state.json');
}

function loadState(): WindowState {
  try {
    const state = JSON.parse(readFileSync(statePath(), 'utf8')) as WindowState;
    const visible = screen.getAllDisplays().some((d) => {
      const b = d.workArea;
      return state.x !== undefined && state.y !== undefined && state.x < b.x + b.width - 100 && state.y < b.y + b.height - 100 && state.x + state.width > b.x + 100 && state.y > b.y - 50;
    });
    return visible ? state : { width: state.width, height: state.height, maximized: state.maximized };
  } catch {
    const { workAreaSize } = screen.getPrimaryDisplay();
    return { width: Math.min(1440, workAreaSize.width), height: Math.min(920, workAreaSize.height), maximized: workAreaSize.width < 1500 };
  }
}

function saveState(win: BrowserWindow) {
  if (win.isDestroyed()) return;
  const bounds = win.getNormalBounds();
  const state: WindowState = { ...bounds, maximized: win.isMaximized() };
  try {
    writeFileSync(statePath(), JSON.stringify(state));
  } catch {
    // ignore
  }
}

/** Windows drawn with a native title bar overlay (the quick entry window has none). */
const overlayWindows = new WeakSet<BrowserWindow>();

export function applyTitleBarTheme(win: BrowserWindow, theme: 'dark' | 'light'): void {
  if (process.platform === 'darwin' || win.isDestroyed()) return;
  if (overlayWindows.has(win)) win.setTitleBarOverlay({ ...THEMES[theme], height: TITLE_BAR_HEIGHT });
  win.setBackgroundColor(THEMES[theme].color);
}

export function isAppUrl(url: string): boolean {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl && url.startsWith(devUrl)) return true;
  return url.startsWith('file://');
}

function loadRenderer(win: BrowserWindow, hash?: string): void {
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash ? `#${hash}` : ''}`);
  else void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined);
}

function guardNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
}

/** The main window, or the small quick entry window (frameless, on top, hidden from the taskbar). */
export function createAppWindow(options: { quick?: boolean } = {}): BrowserWindow {
  if (!options.quick) return createMainWindow();
  const win = new BrowserWindow({
    width: 680,
    height: 200,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'Cellar quick entry',
    backgroundColor: THEMES.dark.color,
    roundedCorners: true,
    icon: join(app.getAppPath(), 'resources', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: true,
    },
  });
  win.setMenuBarVisibility(false);
  guardNavigation(win);
  loadRenderer(win, '/quick');
  return win;
}

export function createMainWindow(): BrowserWindow {
  const state = loadState();
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Cellar',
    backgroundColor: THEMES.dark.color,
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : { ...THEMES.dark, height: TITLE_BAR_HEIGHT },
    trafficLightPosition: { x: 14, y: 12 },
    autoHideMenuBar: true,
    icon: join(app.getAppPath(), 'resources', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: true,
    },
  });
  win.setMenuBarVisibility(false);
  if (process.platform !== 'darwin') overlayWindows.add(win);

  win.once('ready-to-show', () => {
    if (state.maximized) win.maximize();
    win.show();
  });

  let saveTimer: NodeJS.Timeout | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveState(win), 500);
  };
  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('close', () => saveState(win));

  guardNavigation(win);
  loadRenderer(win);
  return win;
}
