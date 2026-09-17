import { spawn } from 'node:child_process';
import { gitFailureLine } from './git';

/**
 * A thin wrapper around the GitHub CLI (`gh`) for opening pull requests from a Code session.
 * Cellar never talks to GitHub's API directly: `gh` already carries the user's own login.
 */

interface GhResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

function runGh(cwd: string, args: string[], timeoutMs = 30_000): Promise<GhResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('gh', args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', GH_PROMPT_DISABLED: '1' },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const done = (exitCode: number | null, spawnError?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (spawnError) {
        reject(new Error((spawnError as NodeJS.ErrnoException).code === 'ENOENT' ? 'gh is not installed or not on PATH.' : spawnError.message));
        return;
      }
      resolvePromise({ stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), exitCode });
    };
    child.on('error', (e) => done(null, e));
    child.on('close', (code) => done(code));
  });
}

let ghOk: boolean | null = null;

/** Whether `gh` is on PATH at all (cached; the app is not reinstalling it mid-session). */
export async function ghAvailable(): Promise<boolean> {
  if (ghOk !== null) return ghOk;
  try {
    const r = await runGh(process.cwd(), ['--version'], 10_000);
    ghOk = r.exitCode === 0;
  } catch {
    ghOk = false;
  }
  return ghOk;
}

/** Whether `gh` is signed in for this repository's host. */
export async function ghAuthenticated(cwd: string): Promise<boolean> {
  const r = await runGh(cwd, ['auth', 'status'], 15_000).catch(() => null);
  return !!r && r.exitCode === 0;
}

export interface PullRequestInput {
  base: string;
  head: string;
  title: string;
  body: string;
}

/** Opens a pull request with `gh pr create`, returning its URL. */
export async function createPullRequest(cwd: string, input: PullRequestInput): Promise<{ url: string }> {
  const r = await runGh(cwd, ['pr', 'create', '--base', input.base, '--head', input.head, '--title', input.title, '--body', input.body], 60_000);
  if (r.exitCode !== 0) throw new Error(gitFailureLine(`${r.stderr}\n${r.stdout}`, 'gh pr create failed.'));
  const url = r.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  if (!url || !/^https?:\/\//.test(url)) throw new Error("gh did not return a pull request URL. Run `gh pr create` yourself to see what's wrong.");
  return { url };
}

/** The URL of an existing pull request for a branch, if `gh` knows of one. */
export async function existingPullRequestUrl(cwd: string, head: string): Promise<string | undefined> {
  const r = await runGh(cwd, ['pr', 'view', head, '--json', 'url', '-q', '.url'], 15_000).catch(() => null);
  if (!r || r.exitCode !== 0) return undefined;
  return r.stdout.trim() || undefined;
}
