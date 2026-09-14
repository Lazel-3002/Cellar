import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { RepoInfo } from '@shared/types/code';
import { globFiles } from '../agent/glob';

export class GitError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface GitOptions {
  /** Resolve instead of throwing when git exits with an error. */
  allowFailure?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Return stdout as raw bytes decoded later (for file contents). */
  maxBytes?: number;
}

const MAX_OUTPUT = 64 * 1024 * 1024;

/** Run git without a console window, prompts, pagers or localized messages. */
export function git(cwd: string, args: string[], options: GitOptions = {}): Promise<GitResult> {
  return gitBuffer(cwd, args, options).then((r) => ({ stdout: r.stdout.toString('utf8'), stderr: r.stderr, exitCode: r.exitCode }));
}

export function gitBuffer(cwd: string, args: string[], options: GitOptions = {}): Promise<{ stdout: Buffer; stderr: string; exitCode: number | null }> {
  const maxBytes = options.maxBytes ?? MAX_OUTPUT;
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', ['-c', 'core.quotepath=false', '-c', 'color.ui=false', ...args], {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', LC_ALL: 'C', LANG: 'C', GIT_OPTIONAL_LOCKS: '0' },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    let settled = false;
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= maxBytes) out.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    const timer = options.timeoutMs ? setTimeout(() => child.kill(), options.timeoutMs) : null;
    const onAbort = () => child.kill();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const done = (exitCode: number | null, spawnError?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      const stderr = Buffer.concat(err).toString('utf8').trim();
      if (spawnError) {
        reject(new GitError((spawnError as NodeJS.ErrnoException).code === 'ENOENT' ? 'Git is not installed or not on PATH.' : spawnError.message, null, ''));
        return;
      }
      const stdout = Buffer.concat(out);
      if (exitCode !== 0 && !options.allowFailure) {
        const firstLine = stderr.split('\n').find((l) => l.trim()) ?? `git ${args[0]} failed`;
        reject(new GitError(firstLine.replace(/^(fatal|error):\s*/, ''), exitCode, stderr));
        return;
      }
      resolvePromise({ stdout, stderr, exitCode });
    };
    child.on('error', (e) => done(null, e));
    child.on('close', (code) => done(code));
  });
}

let available: boolean | null = null;

export async function gitAvailable(): Promise<boolean> {
  if (available !== null) return available;
  try {
    await git(process.cwd(), ['--version'], { timeoutMs: 10_000 });
    available = true;
  } catch {
    available = false;
  }
  return available;
}

/** The top level of the repository containing `folder`, or null outside git. */
export async function repoTopLevel(folder: string): Promise<string | null> {
  if (!(await gitAvailable())) return null;
  const r = await git(folder, ['rev-parse', '--show-toplevel'], { allowFailure: true, timeoutMs: 15_000 });
  if (r.exitCode !== 0) return null;
  const top = r.stdout.trim();
  return top ? resolve(top) : null;
}

export async function headCommit(cwd: string): Promise<string | undefined> {
  const r = await git(cwd, ['rev-parse', 'HEAD'], { allowFailure: true });
  return r.exitCode === 0 ? r.stdout.trim() : undefined;
}

export async function currentBranch(cwd: string): Promise<string | undefined> {
  const r = await git(cwd, ['branch', '--show-current'], { allowFailure: true });
  return r.exitCode === 0 ? r.stdout.trim() || undefined : undefined;
}

export async function isDirty(cwd: string): Promise<boolean> {
  const r = await git(cwd, ['status', '--porcelain', '-uall'], { allowFailure: true });
  return r.exitCode === 0 && r.stdout.trim().length > 0;
}

export async function localBranches(cwd: string): Promise<string[]> {
  const r = await git(cwd, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/heads'], { allowFailure: true });
  return r.exitCode === 0 ? r.stdout.split('\n').map((l) => l.trim()).filter(Boolean) : [];
}

const MEMORY_FILES = ['CELLAR.md', 'AGENTS.md', 'CLAUDE.md'];

/** The project memory file in a folder: CELLAR.md, or AGENTS.md / CLAUDE.md for compatibility. */
export async function findMemoryFile(dir: string): Promise<string | undefined> {
  for (const name of MEMORY_FILES) {
    const info = await stat(join(dir, name)).catch(() => null);
    if (info?.isFile()) return name;
  }
  return undefined;
}

export async function repoInfo(folder: string): Promise<RepoInfo> {
  const abs = resolve(folder);
  const info = await stat(abs).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`The folder ${abs} does not exist.`);
  const gitOk = await gitAvailable();
  const top = gitOk ? await repoTopLevel(abs) : null;
  if (!top) {
    return { path: abs, name: basename(abs) || abs, isGit: false, gitAvailable: gitOk, branches: [], dirty: false, memoryFile: await findMemoryFile(abs) };
  }
  const [branch, branches, dirty, memoryFile] = await Promise.all([currentBranch(top), localBranches(top), isDirty(top), findMemoryFile(top)]);
  return { path: top, name: basename(top) || top, isGit: true, gitAvailable: true, branch, branches, dirty, memoryFile };
}

/** "Fix the login bug!" → "fix-the-login-bug" */
export function branchSlug(text: string, maxWords = 5): string {
  const words = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, maxWords);
  return words.join('-').slice(0, 40).replace(/-+$/, '') || 'session';
}

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  const r = await git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { allowFailure: true });
  return r.exitCode === 0;
}

export interface WorktreeInput {
  repoRoot: string;
  /** Where the worktree goes; must not exist yet. */
  dir: string;
  branch: string;
  /** Branch or commit to start from (default HEAD). */
  base?: string;
}

/** `git worktree add -b <branch> <dir> <base>`; returns the commit the branch starts at. */
export async function createWorktree(input: WorktreeInput): Promise<{ commit: string }> {
  await mkdir(dirname(input.dir), { recursive: true });
  const base = input.base || 'HEAD';
  const commit = (await git(input.repoRoot, ['rev-parse', '--verify', `${base}^{commit}`])).stdout.trim();
  await git(input.repoRoot, ['worktree', 'add', '-b', input.branch, input.dir, commit], { timeoutMs: 300_000 });
  await copyWorktreeIncludes(input.repoRoot, input.dir).catch(() => undefined);
  return { commit };
}

/**
 * Copy ignored files a project needs (like .env) into a new worktree. Patterns come from a
 * `.worktreeinclude` file at the top of the repository, one glob per line.
 */
export async function copyWorktreeIncludes(repoRoot: string, dir: string): Promise<string[]> {
  const list = await readFile(join(repoRoot, '.worktreeinclude'), 'utf8').catch(() => '');
  const patterns = list
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const copied: string[] = [];
  for (const pattern of patterns) {
    const { matches } = await globFiles(repoRoot, pattern, 200);
    for (const match of matches) {
      const rel = match.absolutePath.slice(repoRoot.length).replace(/^[\\/]+/, '');
      const target = join(dir, rel);
      if (await stat(target).catch(() => null)) continue;
      await mkdir(dirname(target), { recursive: true });
      await copyFile(match.absolutePath, target);
      copied.push(rel.split('\\').join('/'));
    }
  }
  return copied;
}

export async function removeWorktree(repoRoot: string, dir: string, branch?: string, deleteBranch = true): Promise<void> {
  const r = await git(repoRoot, ['worktree', 'remove', '--force', dir], { allowFailure: true, timeoutMs: 120_000 });
  if (r.exitCode !== 0 || (await stat(dir).catch(() => null))) {
    // The folder may be unregistered already, or still held for a moment by a process that was just
    // stopped (a terminal whose working folder it was); rm retries busy files on Windows.
    await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => undefined);
    await git(repoRoot, ['worktree', 'prune'], { allowFailure: true });
    if (await stat(dir).catch(() => null)) throw new Error(`${dir} is in use by another program. Close it and try again.`);
  }
  if (branch && deleteBranch) await git(repoRoot, ['branch', '-D', branch], { allowFailure: true });
}
