import { EventEmitter } from 'node:events';
import type { EventChannel, IpcEventMap } from '@shared/ipc-contract';

/**
 * Process-wide bus. Services publish here; the IPC layer forwards every event to renderer windows.
 * Keeping services unaware of Electron makes them unit-testable in plain Node.
 */
class TypedBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit<K extends EventChannel>(channel: K, payload: IpcEventMap[K]): void {
    this.emitter.emit(channel, payload);
    this.emitter.emit('*', channel, payload);
  }

  on<K extends EventChannel>(channel: K, listener: (payload: IpcEventMap[K]) => void): () => void {
    this.emitter.on(channel, listener);
    return () => this.emitter.off(channel, listener);
  }

  onAny(listener: (channel: EventChannel, payload: unknown) => void): () => void {
    this.emitter.on('*', listener);
    return () => this.emitter.off('*', listener);
  }
}

export const bus = new TypedBus();
