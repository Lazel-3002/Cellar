import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** Folders that are never worth walking into. */
export const IGNORED_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv', '.cache', '.pnpm-store', '$RECYCLE.BIN', 'System Volume Information']);

function escapeRegex(text: string): string {
  return text.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a glob to a RegExp over forward-slash relative paths. A pattern without a slash matches
 * file names at any depth (like .gitignore), so "*.md" finds Markdown files in every subfolder.
 */
export function globToRegExp(pattern: string, caseInsensitive = process.platform === 'win32'): RegExp {
  let glob = pattern.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  const anchored = glob.includes('/');
  glob = glob.replace(/^\/+/, '');
  let out = '';
  let braceDepth = 0;
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        const slashAfter = glob[i + 2] === '/';
        out += slashAfter ? '(?:.*/)?' : '.*';
        i += slashAfter ? 2 : 1;
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else if (ch === '[') {
      const close = glob.indexOf(']', i + 1);
      if (close === -1) {
        out += '\\[';
      } else {
        const body = glob.slice(i + 1, close).replace(/\\/g, '\\\\');
        out += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`;
        i = close;
      }
    } else if (ch === '{') {
      braceDepth++;
      out += '(?:';
    } else if (ch === '}' && braceDepth > 0) {
      braceDepth--;
      out += ')';
    } else if (ch === ',' && braceDepth > 0) {
      out += '|';
    } else {
      out += escapeRegex(ch);
    }
  }
  while (braceDepth-- > 0) out += ')';
  const prefix = anchored ? '^' : '^(?:.*/)?';
  return new RegExp(`${prefix}${out}$`, caseInsensitive ? 'i' : '');
}

export interface WalkEntry {
  /** Forward-slash path relative to the walk root. */
  path: string;
  absolutePath: string;
  isDirectory: boolean;
}

export interface WalkOptions {
  maxEntries?: number;
  maxDepth?: number;
  signal?: AbortSignal;
}

/** Breadth-first walk that skips ignored folders and never follows links. */
export async function* walk(root: string, options: WalkOptions = {}): AsyncGenerator<WalkEntry> {
  const maxEntries = options.maxEntries ?? 50_000;
  const maxDepth = options.maxDepth ?? 64;
  const queue: Array<{ abs: string; rel: string; depth: number }> = [{ abs: root, rel: '', depth: 0 }];
  let count = 0;
  while (queue.length) {
    if (options.signal?.aborted) return;
    const dir = queue.shift()!;
    let entries: Dirent[];
    try {
      entries = await readdir(dir.abs, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const rel = dir.rel ? `${dir.rel}/${entry.name}` : entry.name;
      const abs = join(dir.abs, entry.name);
      const isDirectory = entry.isDirectory();
      if (isDirectory && IGNORED_DIRS.has(entry.name)) continue;
      yield { path: rel, absolutePath: abs, isDirectory };
      if (++count >= maxEntries) return;
      if (isDirectory && dir.depth + 1 < maxDepth) queue.push({ abs, rel, depth: dir.depth + 1 });
    }
  }
}

export interface GlobMatch {
  path: string;
  absolutePath: string;
  mtimeMs: number;
  size: number;
}

export async function globFiles(root: string, pattern: string, limit: number, signal?: AbortSignal): Promise<{ matches: GlobMatch[]; truncated: boolean }> {
  const regex = globToRegExp(pattern);
  const matches: GlobMatch[] = [];
  let truncated = false;
  for await (const entry of walk(root, { signal })) {
    if (entry.isDirectory || !regex.test(entry.path)) continue;
    try {
      const info = await stat(entry.absolutePath);
      matches.push({ path: entry.path, absolutePath: entry.absolutePath, mtimeMs: info.mtimeMs, size: info.size });
    } catch {
      continue;
    }
    if (matches.length >= limit * 4) {
      truncated = true;
      break;
    }
  }
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (matches.length > limit) truncated = true;
  return { matches: matches.slice(0, limit), truncated };
}
