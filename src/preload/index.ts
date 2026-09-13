import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { EVENT_CHANNELS, INVOKE_CHANNELS, type CellarBridge } from '@shared/ipc-contract';

const invokeAllowed = new Set<string>(INVOKE_CHANNELS);
const eventsAllowed = new Set<string>(EVENT_CHANNELS);

const bridge: CellarBridge = {
  invoke(channel, ...args) {
    if (!invokeAllowed.has(channel)) return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, listener) {
    if (!eventsAllowed.has(channel)) throw new Error(`Blocked IPC event: ${channel}`);
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload as never);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
  getPathForFile(file) {
    return webUtils.getPathForFile(file);
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('cellar', bridge);
