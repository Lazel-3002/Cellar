/** IPC for the built-in browser panel: chrome actions from the renderer, plus where to paint the view. */
import { z } from 'zod';
import { handle } from '../ipc/register';
import { browser } from './browser';
import { loginStatus } from './sessions';

const tabId = z.string().min(1);
const url = z.string().min(1).max(4096);

const boundsSchema = z
  .object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite().min(0), height: z.number().finite().min(0) })
  .nullable();

export function registerBrowserHandlers(): void {
  handle('browser:state', () => browser.state());
  handle('browser:open', (address, newTab) => browser.open(url.parse(address), newTab ? null : browser.state().activeTabId));
  handle('browser:navigate', (id, address) => browser.navigate(url.parse(address), id ? tabId.parse(id) : null));
  handle('browser:back', (id) => browser.goBack(id ? tabId.parse(id) : null));
  handle('browser:forward', (id) => browser.goForward(id ? tabId.parse(id) : null));
  handle('browser:reload', (id) => browser.reload(id ? tabId.parse(id) : null));
  handle('browser:stop', (id) => browser.stop(id ? tabId.parse(id) : null));
  handle('browser:activate', (id) => browser.activate(tabId.parse(id)));
  handle('browser:close', (id) => browser.close(tabId.parse(id)));
  handle('browser:setBounds', (bounds) => browser.setBounds(boundsSchema.parse(bounds ?? null)));
  handle('browser:setVisible', (visible) => browser.setVisible(!!visible));
  handle('browser:loginStatus', (domain) => loginStatus(z.string().min(1).parse(domain)));
}
