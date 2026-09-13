import { lstat, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export class PathAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathAccessError';
  }
}

const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

function inside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The folder a task works in. Every path a model supplies goes through `resolve`, which refuses
 * anything that lands outside the folder — including through `..`, other drives, UNC paths,
 * alternate data streams, device names and junctions or symlinks that point elsewhere.
 */
export class Workspace {
  private constructor(
    readonly root: string,
    private readonly realRoot: string,
  ) {}

  static async open(root: string): Promise<Workspace> {
    const abs = resolve(root);
    let info;
    try {
      info = await stat(abs);
    } catch {
      throw new Error(`The folder ${abs} does not exist.`);
    }
    if (!info.isDirectory()) throw new Error(`${abs} is not a folder.`);
    return new Workspace(abs, await realpath(abs));
  }

  async resolve(input: unknown): Promise<string> {
    let p = typeof input === 'string' ? input.trim() : '';
    if (/^(["']).*\1$/.test(p)) p = p.slice(1, -1).trim();
    if (!p) p = '.';
    if (p.includes('\0')) throw new PathAccessError('Invalid path.');
    if (/^[\\/]{2}[?.][\\/]/.test(p)) throw new PathAccessError(`Device paths are not allowed: ${p}`);
    // "C:foo" is relative to that drive's current directory, which is never what a model means.
    if (/^[a-zA-Z]:(?![\\/])/.test(p)) throw new PathAccessError(`Use a path inside the working folder instead of ${p}.`);
    // Models often write "/notes.md" meaning the top of the working folder.
    if (/^[\\/](?![\\/])/.test(p)) p = p.replace(/^[\\/]+/, '') || '.';

    const target = resolve(this.root, p);
    if (!inside(this.root, target)) {
      throw new PathAccessError(`${p} is outside the working folder. Only files inside ${this.root} can be used.`);
    }
    const segments = relative(this.root, target).split(sep).filter(Boolean);
    for (const segment of segments) {
      if (segment.includes(':')) throw new PathAccessError(`Invalid file name: ${segment}`);
      if (RESERVED_NAMES.test(segment)) throw new PathAccessError(`${segment} is a reserved Windows device name.`);
    }

    // Follow junctions and symlinks on the deepest part of the path that exists.
    let existing = target;
    while (!(await exists(existing))) {
      const parent = dirname(existing);
      if (parent === existing) break;
      existing = parent;
    }
    try {
      const real = await realpath(existing);
      if (!inside(this.realRoot, real)) throw new PathAccessError(`${p} links to a location outside the working folder.`);
    } catch (err) {
      if (err instanceof PathAccessError) throw err;
      // Broken links cannot be followed; treat them as outside.
      throw new PathAccessError(`${p} cannot be resolved inside the working folder.`);
    }
    return target;
  }

  /** Path relative to the root with forward slashes ("." for the root itself). */
  relative(abs: string): string {
    return relative(this.root, abs).split(sep).join('/') || '.';
  }

  contains(abs: string): boolean {
    return inside(this.root, resolve(abs));
  }
}
