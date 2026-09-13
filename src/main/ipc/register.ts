import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { InvokeChannel, IpcInvokeMap } from '@shared/ipc-contract';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage } from '../lib/util';

const log = logger('ipc');

type HandlerFn<K extends InvokeChannel> = (...args: IpcInvokeMap[K]['args']) => Promise<IpcInvokeMap[K]['result']> | IpcInvokeMap[K]['result'];

let trustedOrigin: (url: string) => boolean = () => true;

export function setTrustedOrigin(check: (url: string) => boolean): void {
  trustedOrigin = check;
}

function assertTrusted(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!trustedOrigin(url)) throw new Error(`Untrusted IPC sender: ${url}`);
}

export function handle<K extends InvokeChannel>(channel: K, fn: HandlerFn<K>): void {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrusted(event);
    try {
      return await fn(...(args as IpcInvokeMap[K]['args']));
    } catch (err) {
      log.warn(`${channel} failed:`, errorMessage(err));
      // Re-throw a plain Error so the renderer gets a clean message.
      throw new Error(errorMessage(err));
    }
  });
}

/** Forward every bus event to all renderer windows. */
export function forwardBusToWindows(): void {
  bus.onAny((channel, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  });
}
