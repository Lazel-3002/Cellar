import { randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();

export const now = (): number => Date.now();

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error('Aborted'));
      },
      { once: true },
    );
  });
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message && !err.message.includes(cause.message)) {
      return `${err.message} (${cause.message})`;
    }
    return err.message;
  }
  return String(err);
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.message === 'Aborted' || err.message.includes('aborted'));
}

/** fetch with a timeout that composes with an optional caller signal. */
export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 5000, signal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs} ms`)), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function safeJsonParse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function throttle<A extends unknown[]>(fn: (...args: A) => void, intervalMs: number): ((...args: A) => void) & { flush: () => void } {
  let last = 0;
  let pending: A | null = null;
  let timer: NodeJS.Timeout | null = null;
  const run = () => {
    timer = null;
    if (pending) {
      last = Date.now();
      const args = pending;
      pending = null;
      fn(...args);
    }
  };
  const throttled = (...args: A) => {
    pending = args;
    const wait = intervalMs - (Date.now() - last);
    if (wait <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      run();
    } else if (!timer) {
      timer = setTimeout(run, wait);
    }
  };
  throttled.flush = () => {
    if (timer) clearTimeout(timer);
    run();
  };
  return throttled;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i >= 3 ? 2 : i === 0 ? 0 : 1)} ${units[i]}`;
}
