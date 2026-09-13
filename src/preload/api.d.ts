import type { CellarBridge } from '../shared/ipc-contract';

declare global {
  interface Window {
    cellar: CellarBridge;
  }
}

export {};
