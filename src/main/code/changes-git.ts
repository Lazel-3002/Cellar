import { readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type { ChangedFile, ChangeSet, ChangeStatus, CodeSessionInfo, CommitResult, FileDiff, MergeResult } from '@shared/types/code';
import { countLines, decodeText, isBinary, MAX_DIFF_BYTES, readLimited } from './changes-text';
import { currentBranch, git, gitBuffer, GitError, isDirty } from './git';

/**
 * Changes of a git Code session: the working tree compared with the commit the session started
 * from, plus committing and merging the session branch.
 */

interface NameStatus {
  status: ChangeStatus;
  oldPath?: string;
}

/** Paths in `<rev>:./<path>` are relative to the working folder instead of the repository top. */
const revPath = (rev: string, rel: string) => `${rev}:./${rel}`;

function statusOf(code: string): ChangeStatus {
  switch (code[0]) {
    case 'A':
    case 'C':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    default:
      return 'modified';
  }
}

/** `git diff --name-status -z -M <base>` as path → status (renames keyed by the new path). */
export async function gitNameStatus(workDir: string, base: string): Promise<Map<string, NameStatus>> {
  const out = (await git(workDir, ['diff', '--name-status', '-z', '-M', '--relative', base])).stdout;
  const tokens = out.split('\0');
  const map = new Map<string, NameStatus>();
  for (let i = 0; i < tokens.length; ) {
    const code = tokens[i++];
    if (!code) continue;
    if (code[0] === 'R' || code[0] === 'C') {
      const oldPath = tokens[i++];
      const path = tokens[i++];
      if (path) map.set(path, code[0] === 'R' ? { status: 'renamed', oldPath } : { status: 'added' });
    } else {
      const path = tokens[i++];
      if (path) map.set(path, { status: statusOf(code) });
    }
  }
  return map;
}

/** `git diff --numstat -z -M <base>` as path → line counts; binary files report no counts. */
async function gitNumstat(workDir: string, base: string): Promise<Map<string, { additions: number; deletions: number; binary: boolean }>> {
  const out = (await git(workDir, ['diff', '--numstat', '-z', '-M', '--relative', base])).stdout;
  const tokens = out.split('\0');
  const map = new Map<string, { additions: number; deletions: number; binary: boolean }>();
  for (let i = 0; i < tokens.length; ) {
    const token = tokens[i++];
    if (!token) continue;
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(token);
    if (!match) continue;
    let path = match[3];
    // Renames: "added\tdeleted\t" followed by the old and the new path as separate fields.
    if (!path) {
      i++;
      path = tokens[i++];
    }
    if (!path) continue;
    const binary = match[1] === '-' && match[2] === '-';
    map.set(path, { additions: binary ? 0 : Number(match[1]), deletions: binary ? 0 : Number(match[2]), binary });
  }
  return map;
}

async function untrackedFiles(workDir: string): Promise<string[]> {
  const out = (await git(workDir, ['ls-files', '--others', '--exclude-standard', '-z'])).stdout;
  return out.split('\0').filter((p) => p && !p.endsWith('/'));
}

const byPath = (a: ChangedFile, b: ChangedFile) => a.path.localeCompare(b.path, 'en-US');

export async function gitChangeSet(workDir: string, base: string): Promise<ChangeSet> {
  const [names, numstat, untracked, status, commits, short] = await Promise.all([
    gitNameStatus(workDir, base),
    gitNumstat(workDir, base),
    untrackedFiles(workDir),
    git(workDir, ['status', '--porcelain', '-uall']),
    git(workDir, ['rev-list', '--count', `${base}..HEAD`], { allowFailure: true }),
    git(workDir, ['rev-parse', '--short', base], { allowFailure: true }),
  ]);

  const files: ChangedFile[] = [];
  for (const [path, entry] of names) {
    const counts = numstat.get(path) ?? { additions: 0, deletions: 0, binary: false };
    files.push({ path, ...(entry.oldPath ? { oldPath: entry.oldPath } : {}), status: entry.status, ...counts });
  }
  const known = new Set(names.keys());
  const added = await Promise.all(
    untracked
      .filter((path) => !known.has(path))
      .map(async (path): Promise<ChangedFile> => {
        const read = await readLimited(join(workDir, path), MAX_DIFF_BYTES);
        const binary = !!read.content && isBinary(read.content);
        const additions = read.content && !binary ? countLines(decodeText(read.content)) : 0;
        return { path, status: 'added', additions, deletions: 0, binary };
      }),
  );
  files.push(...added);
  files.sort(byPath);

  return {
    source: 'git',
    base: short.exitCode === 0 ? short.stdout.trim() : base.slice(0, 7),
    files,
    additions: files.reduce((sum, f) => sum + f.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    uncommitted: status.stdout.split('\n').filter((line) => line.trim()).length,
    commits: commits.exitCode === 0 ? Number(commits.stdout.trim()) || 0 : 0,
  };
}

/** A blob of the base commit: null when the path did not exist, `tooLarge` above the diff limit. */
async function baseBlob(workDir: string, base: string, rel: string): Promise<{ content: Buffer | null; tooLarge: boolean }> {
  const size = await git(workDir, ['cat-file', '-s', revPath(base, rel)], { allowFailure: true });
  if (size.exitCode !== 0) return { content: null, tooLarge: false };
  if (Number(size.stdout.trim()) > MAX_DIFF_BYTES) return { content: null, tooLarge: true };
  const blob = await gitBuffer(workDir, ['cat-file', 'blob', revPath(base, rel)], { allowFailure: true });
  return { content: blob.exitCode === 0 ? blob.stdout : null, tooLarge: false };
}

export async function existsInBase(workDir: string, base: string, rel: string): Promise<boolean> {
  const r = await git(workDir, ['cat-file', '-e', revPath(base, rel)], { allowFailure: true });
  return r.exitCode === 0;
}

export async function gitFileDiff(workDir: string, base: string, rel: string): Promise<FileDiff> {
  const entry = (await gitNameStatus(workDir, base)).get(rel);
  const [old, current] = await Promise.all([baseBlob(workDir, base, entry?.oldPath ?? rel), readLimited(join(workDir, rel), MAX_DIFF_BYTES)]);
  return buildDiff(rel, old.content, old.tooLarge, current.content, current.isFile && !current.content);
}

export function buildDiff(path: string, before: Buffer | null, beforeTooLarge: boolean, after: Buffer | null, afterTooLarge: boolean): FileDiff {
  if (beforeTooLarge || afterTooLarge) return { path, oldText: '', newText: '', binary: false, tooLarge: true };
  if ((before && isBinary(before)) || (after && isBinary(after))) return { path, oldText: '', newText: '', binary: true, tooLarge: false };
  return { path, oldText: before ? decodeText(before) : '', newText: after ? decodeText(after) : '', binary: false, tooLarge: false };
}

/** Remove folders left empty after deleting a file, up to (not including) the working folder. */
async function removeEmptyParents(workDir: string, abs: string): Promise<void> {
  const root = resolve(workDir);
  let dir = dirname(abs);
  while (dir !== root && !relative(root, dir).startsWith('..')) {
    const entries = await readdir(dir).catch(() => null);
    if (!entries || entries.length > 0) return;
    await rmdir(dir).catch(() => undefined);
    dir = dirname(dir);
  }
}

async function deleteNewFile(workDir: string, rel: string): Promise<void> {
  const abs = join(workDir, rel);
  await rm(abs, { force: true });
  await git(workDir, ['--literal-pathspecs', 'rm', '--cached', '--quiet', '--ignore-unmatch', '--', rel]);
  await removeEmptyParents(workDir, abs);
}

const restoreFromBase = (workDir: string, base: string, rel: string) =>
  git(workDir, ['--literal-pathspecs', 'restore', `--source=${base}`, '--staged', '--worktree', '--', rel]);

/** Put one file back the way it was in the base commit (deleting it when the session created it). */
export async function gitDiscardFile(workDir: string, base: string, rel: string): Promise<void> {
  const entry = (await gitNameStatus(workDir, base)).get(rel);
  if (entry?.status === 'renamed' && entry.oldPath) {
    await deleteNewFile(workDir, rel);
    await restoreFromBase(workDir, base, entry.oldPath);
    return;
  }
  if (await existsInBase(workDir, base, rel)) await restoreFromBase(workDir, base, rel);
  else await deleteNewFile(workDir, rel);
}

const IDENTITY_HELP =
  'Git does not know your name and email yet. Set them with git config --global user.name "Your Name" and git config --global user.email "you@example.com", then try again.';

const missingIdentity = (output: string) => /please tell me who you are|empty ident name|unable to auto-detect email|no email was given/i.test(output);

/** The most useful line of a failed git command's output. */
function gitFailure(output: string, fallback: string): string {
  const lines = output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const line = lines.find((l) => /^(fatal|error):/.test(l)) ?? lines[0];
  return line ? line.replace(/^(fatal|error):\s*/, '') : fallback;
}

/** Stage everything in the working folder and commit it. */
export async function commitAll(workDir: string, message: string): Promise<CommitResult> {
  const text = message.trim();
  if (!text) throw new Error('Write a commit message first.');
  await git(workDir, ['add', '-A'], { timeoutMs: 120_000 });
  const staged = await git(workDir, ['diff', '--cached', '--quiet'], { allowFailure: true });
  if (staged.exitCode === 0) throw new Error('There is nothing to commit.');
  const r = await git(workDir, ['commit', '-m', text], { allowFailure: true, timeoutMs: 300_000 });
  if (r.exitCode !== 0) {
    const output = `${r.stderr}\n${r.stdout}`;
    if (missingIdentity(output)) throw new Error(IDENTITY_HELP);
    if (/nothing to commit/i.test(output)) throw new Error('There is nothing to commit.');
    throw new GitError(gitFailure(output, 'git commit failed.'), r.exitCode, r.stderr);
  }
  const [commit, summary] = (await git(workDir, ['log', '-1', '--format=%h%x00%s'])).stdout.trim().split('\0');
  return { commit, summary: summary ?? text.split('\n')[0] };
}

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

/** Merge a worktree session's branch into the branch it started from, in the main checkout. */
export async function mergeSession(code: CodeSessionInfo, workDir: string): Promise<MergeResult> {
  const { repoRoot, branch, baseBranch } = code;
  if (!code.isGit || !code.worktree || !branch || !baseBranch) throw new Error('Only sessions that work in their own worktree can be merged.');
  if (await isDirty(workDir)) throw new Error("The session has uncommitted changes. Commit or discard the session's changes first.");
  const checkedOut = await currentBranch(repoRoot);
  if (checkedOut !== baseBranch) {
    throw new Error(`${code.repoName} has ${checkedOut ? `${checkedOut} checked out` : 'no branch checked out'}, not ${baseBranch}. Switch it to ${baseBranch} to merge ${branch}.`);
  }
  const tracked = await git(repoRoot, ['status', '--porcelain', '--untracked-files=no']);
  if (tracked.stdout.trim()) throw new Error(`${code.repoName} has uncommitted changes on ${baseBranch}. Commit or stash them before merging.`);

  const ahead = await git(repoRoot, ['rev-list', '--count', `${baseBranch}..${branch}`]);
  const count = Number(ahead.stdout.trim()) || 0;
  if (count === 0) return { merged: false, message: `${baseBranch} already has everything from ${branch}.` };

  const r = await git(repoRoot, ['merge', '--no-edit', branch], { allowFailure: true, timeoutMs: 300_000 });
  if (r.exitCode === 0) {
    const how = /fast-forward/i.test(r.stdout) ? ' (fast-forward)' : '';
    return { merged: true, message: `Merged ${plural(count, 'commit')} from ${branch} into ${baseBranch}${how}.` };
  }
  const files = await conflictedFiles(repoRoot);
  if (files.length > 0) {
    // Left in progress (MERGE_HEAD stays) so the conflicts can be resolved and the merge continued.
    const shown = files.slice(0, 8).join(', ') + (files.length > 8 ? ` and ${files.length - 8} more` : '');
    return { merged: false, conflicted: files, message: `Merging ${branch} into ${baseBranch} conflicts in ${shown}. Resolve the conflicts, then continue or abort the merge.` };
  }
  const inProgress = await mergeInProgress(repoRoot);
  if (inProgress) await abortMerge(repoRoot);
  const output = `${r.stderr}\n${r.stdout}`;
  if (missingIdentity(output)) throw new Error(IDENTITY_HELP);
  throw new GitError(gitFailure(output, 'git merge failed.'), r.exitCode, r.stderr);
}

/** Whether the working folder has a merge waiting to be resolved (or aborted). */
export async function mergeInProgress(repoRoot: string): Promise<boolean> {
  const r = await git(repoRoot, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { allowFailure: true });
  return r.exitCode === 0;
}

/** Paths with unresolved (unmerged) conflicts. */
export async function conflictedFiles(repoRoot: string): Promise<string[]> {
  const r = await git(repoRoot, ['diff', '--name-only', '--diff-filter=U', '-z'], { allowFailure: true });
  return r.stdout.split('\0').filter(Boolean);
}

export async function abortMerge(repoRoot: string): Promise<void> {
  await git(repoRoot, ['merge', '--abort'], { allowFailure: true });
}

const CONFLICT_MARKER = /^<{7}(?!<)/m;

/** Whether a conflicted file still has `<<<<<<<` markers in it. */
export async function fileHasConflictMarkers(repoRoot: string, rel: string): Promise<boolean> {
  const read = await readLimited(join(repoRoot, rel), MAX_DIFF_BYTES);
  if (!read.content || isBinary(read.content)) return false;
  return CONFLICT_MARKER.test(decodeText(read.content));
}

/** Read one file straight from the repository checkout (for editing a merge conflict). */
export async function readRepoFile(repoRoot: string, rel: string): Promise<string> {
  const read = await readLimited(join(repoRoot, rel), MAX_DIFF_BYTES);
  if (!read.isFile || !read.content) throw new Error(`${rel} could not be read.`);
  if (isBinary(read.content)) throw new Error(`${rel} is a binary file, so it cannot be edited here.`);
  return decodeText(read.content);
}

export async function writeRepoFile(repoRoot: string, rel: string, content: string): Promise<void> {
  await writeFile(join(repoRoot, rel), content, 'utf8');
}

/** Stage the resolved files and finish an in-progress merge; throws while any conflict marker remains. */
export async function continueMerge(repoRoot: string): Promise<CommitResult> {
  if (!(await mergeInProgress(repoRoot))) throw new Error('There is no merge in progress.');
  const remaining = await conflictedFiles(repoRoot);
  const stillConflicted: string[] = [];
  for (const rel of remaining) if (await fileHasConflictMarkers(repoRoot, rel)) stillConflicted.push(rel);
  if (stillConflicted.length > 0) {
    const shown = stillConflicted.slice(0, 5).join(', ') + (stillConflicted.length > 5 ? ` and ${stillConflicted.length - 5} more` : '');
    throw new Error(`${shown} still ${stillConflicted.length === 1 ? 'has' : 'have'} conflict markers (<<<<<<<). Resolve them before continuing.`);
  }
  // Stage only what was conflicted, so unrelated files in the checkout stay out of the merge commit.
  if (remaining.length > 0) await git(repoRoot, ['--literal-pathspecs', 'add', '-A', '--', ...remaining], { timeoutMs: 120_000 });
  const r = await git(repoRoot, ['commit', '--no-edit'], { allowFailure: true, timeoutMs: 300_000 });
  if (r.exitCode !== 0) {
    const output = `${r.stderr}\n${r.stdout}`;
    if (missingIdentity(output)) throw new Error(IDENTITY_HELP);
    throw new GitError(gitFailure(output, 'git commit failed.'), r.exitCode, r.stderr);
  }
  const [commit, summary] = (await git(repoRoot, ['log', '-1', '--format=%h%x00%s'])).stdout.trim().split('\0');
  return { commit, summary: summary ?? 'Merge' };
}
