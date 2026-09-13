import type { EventChannel, InvokeChannel, IpcEventMap, IpcInvokeMap } from '@shared/ipc-contract';

export function cleanIpcError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '');
}

export async function invoke<K extends InvokeChannel>(channel: K, ...args: IpcInvokeMap[K]['args']): Promise<IpcInvokeMap[K]['result']> {
  try {
    return await window.cellar.invoke(channel, ...args);
  } catch (err) {
    throw new Error(cleanIpcError(err));
  }
}

export function onEvent<K extends EventChannel>(channel: K, listener: (payload: IpcEventMap[K]) => void): () => void {
  return window.cellar.on(channel, listener);
}

export const platform = window.cellar.platform;
