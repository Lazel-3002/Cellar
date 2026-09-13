import { app, Menu, type MenuItemConstructorOptions } from 'electron';
import type { AppCommand } from '@shared/ipc-contract';
import { bus } from './lib/events';

/**
 * The menu bar itself is hidden (the renderer draws Claude-style chrome), but the menu still
 * provides accelerators that work while focus is inside text fields.
 */
export function installAppMenu(): void {
  const command = (name: AppCommand) => () => bus.emit('app:command', { command: name });
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New chat', accelerator: 'CmdOrCtrl+N', click: command('new-chat') },
        { label: 'New incognito chat', accelerator: 'CmdOrCtrl+Shift+N', click: command('new-incognito') },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: command('settings') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Search', accelerator: 'CmdOrCtrl+K', click: command('search') },
        { label: 'Toggle sidebar', accelerator: 'CmdOrCtrl+B', click: command('toggle-sidebar') },
        { label: 'Models', accelerator: 'CmdOrCtrl+Shift+M', click: command('models') },
        { label: 'Discover models', accelerator: 'CmdOrCtrl+Shift+D', click: command('discover') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  if (process.platform === 'darwin') template.unshift({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
