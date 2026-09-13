import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';

let logFile: string | null = null;

export function initLogFile(dir: string): void {
  logFile = join(dir, 'main.log');
}

function write(level: string, scope: string, args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${scope}: ${args
    .map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  if (logFile) void appendFile(logFile, line + '\n').catch(() => undefined);
}

export function logger(scope: string) {
  return {
    info: (...args: unknown[]) => write('info', scope, args),
    warn: (...args: unknown[]) => write('warn', scope, args),
    error: (...args: unknown[]) => write('error', scope, args),
  };
}
