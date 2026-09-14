/**
 * Running in the background: a notification-area icon keeps Cellar (and its scheduled tasks) alive when
 * the window is closed, and a global shortcut opens the quick entry window from anywhere.
 */
import { join } from 'node:path';
import { app, BrowserWindow, globalShortcut, Menu, nativeImage, Notification, screen, Tray } from 'electron';
import type { ConversationKind } from '@shared/types/agent';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage } from '../lib/util';
import { settings } from '../services/settings';
import { createAppWindow } from '../window';

const log = logger('background');

let tray: Tray | null = null;
let quickWindow: BrowserWindow | null = null;
let registered: string | null = null;
let quitting = false;
let toldAboutTray = false;
let getMain: () => BrowserWindow | null = () => null;
let createMain: () => BrowserWindow = () => {
  throw new Error('not ready');
};

export function isQuitting(): boolean {
  return quitting;
}

/** Background mode is on and the notification-area icon exists. */
export function backgroundActive(): boolean {
  return !!tray && settings.get().runInBackground;
}

export function markQuitting(): void {
  quitting = true;
}

/** Show (or recreate) the main window. */
export function showMainWindow(): BrowserWindow {
  let win = getMain();
  if (!win || win.isDestroyed()) win = createMain();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return win;
}

function iconPath(): string {
  return join(app.getAppPath(), 'resources', 'icon.png');
}

function updateTray(): void {
  const wanted = settings.get().runInBackground;
  if (!wanted) {
    tray?.destroy();
    tray = null;
    return;
  }
  if (!tray) {
    const image = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 });
    tray = new Tray(image);
    tray.setToolTip('Cellar');
    tray.on('click', () => showMainWindow());
  }
  const shortcut = settings.get().quickEntryShortcut;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Cellar', click: () => showMainWindow() },
      {
        label: 'New chat',
        click: () => {
          showMainWindow();
          bus.emit('app:command', { command: 'new-chat' });
        },
      },
      { label: 'Quick entry', accelerator: registered ? shortcut : undefined, click: () => toggleQuickEntry() },
      {
        label: 'Scheduled tasks',
        click: () => {
          showMainWindow();
          bus.emit('app:command', { command: 'scheduled' });
        },
      },
      { type: 'separator' },
      {
        label: 'Quit Cellar',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function positionQuickWindow(win: BrowserWindow): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width } = win.getBounds();
  const area = display.workArea;
  win.setPosition(Math.round(area.x + (area.width - width) / 2), Math.round(area.y + area.height * 0.22));
}

export function toggleQuickEntry(): void {
  if (quickWindow && !quickWindow.isDestroyed() && quickWindow.isVisible()) {
    quickWindow.hide();
    return;
  }
  if (!quickWindow || quickWindow.isDestroyed()) {
    quickWindow = createAppWindow({ quick: true });
    quickWindow.on('blur', () => {
      if (!quickWindow?.webContents.isDevToolsOpened()) quickWindow?.hide();
    });
    quickWindow.on('closed', () => {
      quickWindow = null;
    });
  }
  positionQuickWindow(quickWindow);
  quickWindow.show();
  quickWindow.focus();
  quickWindow.webContents.send('quick:shown', {});
}

export function hideQuickEntry(): void {
  if (quickWindow && !quickWindow.isDestroyed()) quickWindow.hide();
}

/** After a quick entry message: bring up the main window on the new conversation. */
export function openConversation(conversationId: string, kind: ConversationKind): void {
  hideQuickEntry();
  const win = showMainWindow();
  const send = () => bus.emit('app:open', { conversationId, kind });
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => setTimeout(send, 300));
  else send();
}

function registerShortcut(): void {
  const accelerator = settings.get().quickEntryShortcut;
  if (registered === accelerator) return;
  if (registered) globalShortcut.unregister(registered);
  registered = null;
  if (!accelerator || process.env.CELLAR_NO_GLOBAL_SHORTCUT) return;
  try {
    if (globalShortcut.register(accelerator, toggleQuickEntry)) registered = accelerator;
    else log.warn(`quick entry shortcut ${accelerator} is taken by another app`);
  } catch (err) {
    log.warn(`invalid quick entry shortcut ${accelerator}`, errorMessage(err));
  }
}

export function quickEntryShortcutActive(): boolean {
  return registered !== null && registered === settings.get().quickEntryShortcut;
}

export function installBackground(options: { getMainWindow: () => BrowserWindow | null; createMainWindow: () => BrowserWindow }): void {
  getMain = options.getMainWindow;
  createMain = options.createMainWindow;
  registerShortcut();
  updateTray();
  bus.on('settings:changed', () => {
    registerShortcut();
    updateTray();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}

/** The main window's close button: hide to the tray instead of quitting when background mode is on. */
export function attachCloseToTray(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (quitting || !settings.get().runInBackground || !tray) return;
    event.preventDefault();
    win.hide();
    if (!toldAboutTray && Notification.isSupported()) {
      toldAboutTray = true;
      try {
        new Notification({ title: 'Cellar is still running', body: 'Scheduled tasks keep running. Open Cellar or quit it from the icon in the notification area.' }).show();
      } catch {
        // notifications unavailable
      }
    }
  });
}
