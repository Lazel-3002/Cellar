import { lstatSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { TerminalShell } from '@shared/types/settings';

const cache = new Map<string, string | null>();

/** Full path of an executable on PATH (Windows adds PATHEXT extensions), or null. */
export function findOnPath(name: string): string | null {
  if (cache.has(name)) return cache.get(name)!;
  const dirs = (process.env.PATH ?? process.env.Path ?? '').split(delimiter).filter(Boolean);
  const exts = process.platform === 'win32' && !/\.\w+$/.test(name) ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  let found: string | null = null;
  outer: for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext.toLowerCase());
      try {
        if (statSync(candidate).isFile()) {
          found = candidate;
          break outer;
        }
      } catch {
        // Store apps install app execution aliases (like pwsh.exe in WindowsApps): stat fails on them, but they run.
        try {
          lstatSync(candidate);
          found = candidate;
          break outer;
        } catch {
          // not here
        }
      }
    }
  }
  cache.set(name, found);
  return found;
}

export type PowerShellEdition = 'pwsh' | 'powershell';

/** Which PowerShell the agent's commands use: PowerShell 7 when preferred and installed. */
export function agentPowerShell(preference: TerminalShell): { exe: string; edition: PowerShellEdition } {
  if (process.platform === 'win32' && (preference === 'auto' || preference === 'pwsh')) {
    const pwsh = findOnPath('pwsh');
    if (pwsh) return { exe: pwsh, edition: 'pwsh' };
  }
  return { exe: 'powershell.exe', edition: 'powershell' };
}
