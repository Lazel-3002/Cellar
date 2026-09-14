import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CodeSessionInfo } from '../../src/shared/types/code';

process.env.CELLAR_HOME = join(tmpdir(), `cellar-changes-home-${process.pid}`);

const { initPaths } = await import('../../src/main/system/paths');
const { snapshotBeforeChange, readManifest } = await import('../../src/main/code/snapshots');
const { Workspace } = await import('../../src/main/agent/workspace');
const { commitAll, gitChangeSet, gitDiscardFile, gitFileDiff, mergeSession } = await import('../../src/main/code/changes-git');
const { listDirectory, readWorkspaceFile, snapshotChangeSet, snapshotDiscardFile, snapshotFileDiff, writeWorkspaceFile } = await import('../../src/main/code/changes-files');
const { countLineChanges, countLines } = await import('../../src/main/code/changes-text');

let root: string;

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function makeRepo(name: string): Promise<string> {
  const dir = await mkdtemp(join(root, `${name}-`));
  sh(dir, 'init', '-q', '-b', 'main');
  sh(dir, 'config', 'user.name', 'Cellar Test');
  sh(dir, 'config', 'user.email', 'test@cellar.local');
  sh(dir, 'config', 'core.autocrlf', 'false');
  sh(dir, 'config', 'commit.gpgsign', 'false');
  return dir;
}

async function put(dir: string, rel: string, content: string | Buffer): Promise<void> {
  await mkdir(join(dir, rel, '..'), { recursive: true });
  await writeFile(join(dir, rel), content);
}

function commit(dir: string, message: string): string {
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', message);
  return sh(dir, 'rev-parse', 'HEAD');
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const OLD_TEXT = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cellar-changes-'));
  initPaths(join(root, 'user-data'), join(root, 'runtime'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
  await rm(process.env.CELLAR_HOME!, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
});

describe('line counting', () => {
  it('counts added and removed lines like git', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
    expect(countLineChanges('a\nb\nc\n', 'a\nb\nc\n')).toEqual({ additions: 0, deletions: 0 });
    expect(countLineChanges('one\ntwo\nthree\n', 'one\n2\nthree\nfour\n')).toEqual({ additions: 2, deletions: 1 });
    expect(countLineChanges('a\nb\n', 'a\nb')).toEqual({ additions: 1, deletions: 1 });
    expect(countLineChanges('a\r\nb\r\n', 'a\nb\n')).toEqual({ additions: 0, deletions: 0 });
    expect(countLineChanges('', 'x\ny\n')).toEqual({ additions: 2, deletions: 0 });
    expect(countLineChanges('a\nb\nc\nd\ne\n', 'b\nc\nX\ne\nf\n')).toEqual({ additions: 2, deletions: 2 });
  });

  it('falls back to counting everything for huge unrelated inputs', () => {
    const before = Array.from({ length: 30_000 }, (_, i) => `old ${i}`).join('\n');
    const after = Array.from({ length: 30_000 }, (_, i) => `new ${i}`).join('\n');
    const started = Date.now();
    expect(countLineChanges(before, after)).toEqual({ additions: 30_000, deletions: 30_000 });
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe('git sessions', () => {
  let repo: string;
  let base: string;

  beforeAll(async () => {
    repo = await makeRepo('repo');
    await put(repo, 'a.txt', 'one\ntwo\nthree\n');
    await put(repo, 'c.txt', 'gone\nbye\n');
    await put(repo, 'old.txt', OLD_TEXT);
    await put(repo, 'bin.dat', Buffer.from([1, 2, 0, 3]));
    await put(repo, 'bom.txt', Buffer.concat([BOM, Buffer.from('hello\n')]));
    await put(repo, 'src/keep.ts', 'export {};\n');
    base = commit(repo, 'base');

    await put(repo, 'a.txt', 'one\n2\nthree\nfour\n');
    await put(repo, 'new/added.txt', 'x\ny\n');
    await unlink(join(repo, 'c.txt'));
    sh(repo, 'mv', 'old.txt', 'renamed.txt');
    await put(repo, 'bin.dat', Buffer.from([1, 2, 0, 4, 5]));
    await put(repo, 'pic.bin', Buffer.from([0, 0, 1]));
    await put(repo, 'bom.txt', Buffer.concat([BOM, Buffer.from('hello\nworld\n')]));
  });

  it('lists modified, added, deleted, renamed and binary files against the base commit', async () => {
    const set = await gitChangeSet(repo, base);
    expect(set.source).toBe('git');
    expect(set.base).toBe(sh(repo, 'rev-parse', '--short', base));
    expect(set.commits).toBe(0);
    expect(set.files.map((f) => f.path)).toEqual(['a.txt', 'bin.dat', 'bom.txt', 'c.txt', 'new/added.txt', 'pic.bin', 'renamed.txt']);
    const byPath = Object.fromEntries(set.files.map((f) => [f.path, f]));
    expect(byPath['a.txt']).toMatchObject({ status: 'modified', additions: 2, deletions: 1, binary: false });
    expect(byPath['bin.dat']).toMatchObject({ status: 'modified', additions: 0, deletions: 0, binary: true });
    expect(byPath['bom.txt']).toMatchObject({ status: 'modified', additions: 1, deletions: 0 });
    expect(byPath['c.txt']).toMatchObject({ status: 'deleted', additions: 0, deletions: 2 });
    expect(byPath['new/added.txt']).toMatchObject({ status: 'added', additions: 2, deletions: 0, binary: false });
    expect(byPath['pic.bin']).toMatchObject({ status: 'added', binary: true, additions: 0 });
    expect(byPath['renamed.txt']).toMatchObject({ status: 'renamed', oldPath: 'old.txt', additions: 0, deletions: 0 });
    expect(set.additions).toBe(5);
    expect(set.deletions).toBe(3);
    // a.txt, bin.dat, bom.txt, c.txt, the rename, and two untracked files.
    expect(set.uncommitted).toBe(7);
  });

  it('returns both sides of each file', async () => {
    expect(await gitFileDiff(repo, base, 'a.txt')).toEqual({ path: 'a.txt', oldText: 'one\ntwo\nthree\n', newText: 'one\n2\nthree\nfour\n', binary: false, tooLarge: false });
    expect(await gitFileDiff(repo, base, 'new/added.txt')).toMatchObject({ oldText: '', newText: 'x\ny\n' });
    expect(await gitFileDiff(repo, base, 'c.txt')).toMatchObject({ oldText: 'gone\nbye\n', newText: '' });
    expect(await gitFileDiff(repo, base, 'renamed.txt')).toMatchObject({ oldText: OLD_TEXT, newText: OLD_TEXT });
    expect(await gitFileDiff(repo, base, 'bin.dat')).toMatchObject({ binary: true, oldText: '', newText: '' });
    expect(await gitFileDiff(repo, base, 'bom.txt')).toMatchObject({ oldText: 'hello\n', newText: 'hello\nworld\n' });
  });

  it('flags files over 2 MB as too large', async () => {
    const big = await makeRepo('big');
    await put(big, 'small.txt', 'x\n');
    const bigBase = commit(big, 'base');
    await put(big, 'huge.txt', 'y'.repeat(2 * 1024 * 1024 + 10));
    expect(await gitFileDiff(big, bigBase, 'huge.txt')).toMatchObject({ tooLarge: true, oldText: '', newText: '' });
    const set = await gitChangeSet(big, bigBase);
    expect(set.files).toEqual([{ path: 'huge.txt', status: 'added', additions: 0, deletions: 0, binary: false }]);
  });

  it('discards each kind of change back to the base commit', async () => {
    await gitDiscardFile(repo, base, 'a.txt');
    expect(await readFile(join(repo, 'a.txt'), 'utf8')).toBe('one\ntwo\nthree\n');

    await gitDiscardFile(repo, base, 'new/added.txt');
    expect(existsSync(join(repo, 'new/added.txt'))).toBe(false);
    expect(existsSync(join(repo, 'new'))).toBe(false);

    await gitDiscardFile(repo, base, 'c.txt');
    expect(await readFile(join(repo, 'c.txt'), 'utf8')).toBe('gone\nbye\n');

    await gitDiscardFile(repo, base, 'renamed.txt');
    expect(existsSync(join(repo, 'renamed.txt'))).toBe(false);
    expect(await readFile(join(repo, 'old.txt'), 'utf8')).toBe(OLD_TEXT);

    // A new file that was staged is removed from the index too.
    await put(repo, 'staged.txt', 'staged\n');
    sh(repo, 'add', 'staged.txt');
    await gitDiscardFile(repo, base, 'staged.txt');
    expect(existsSync(join(repo, 'staged.txt'))).toBe(false);
    expect(sh(repo, 'ls-files', 'staged.txt')).toBe('');

    await gitDiscardFile(repo, base, 'bin.dat');
    await gitDiscardFile(repo, base, 'pic.bin');
    await gitDiscardFile(repo, base, 'bom.txt');
    const set = await gitChangeSet(repo, base);
    expect(set.files).toEqual([]);
    expect(set.uncommitted).toBe(0);
  });

  it('commits everything and refuses when there is nothing to commit', async () => {
    await put(repo, 'feature.ts', 'export const feature = 1;\n');
    await put(repo, 'a.txt', 'one\ntwo\nthree\nmore\n');
    const result = await commitAll(repo, 'Add feature\n\nDetails here.');
    expect(result.summary).toBe('Add feature');
    expect(result.commit).toBe(sh(repo, 'rev-parse', '--short', 'HEAD'));
    const set = await gitChangeSet(repo, base);
    expect(set.commits).toBe(1);
    expect(set.uncommitted).toBe(0);
    expect(set.files.map((f) => f.path)).toEqual(['a.txt', 'feature.ts']);
    await expect(commitAll(repo, 'Again')).rejects.toThrow('There is nothing to commit.');
    await expect(commitAll(repo, '   ')).rejects.toThrow('Write a commit message first.');
  });

  it('explains how to set a missing git identity', async () => {
    const dir = await mkdtemp(join(root, 'anon-'));
    sh(dir, 'init', '-q', '-b', 'main');
    sh(dir, 'config', 'user.useConfigOnly', 'true');
    sh(dir, 'config', 'commit.gpgsign', 'false');
    await put(dir, 'file.txt', 'hi\n');
    const emptyConfig = join(root, 'empty.gitconfig');
    await writeFile(emptyConfig, '');
    const saved = { global: process.env.GIT_CONFIG_GLOBAL, nosystem: process.env.GIT_CONFIG_NOSYSTEM };
    const env = ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'EMAIL'].map((k) => [k, process.env[k]] as const);
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    for (const [k] of env) delete process.env[k];
    try {
      await expect(commitAll(dir, 'First')).rejects.toThrow(/user\.name.*user\.email/);
    } finally {
      if (saved.global === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = saved.global;
      if (saved.nosystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
      else process.env.GIT_CONFIG_NOSYSTEM = saved.nosystem;
      for (const [k, v] of env) if (v !== undefined) process.env[k] = v;
    }
  });
});

describe('merging a worktree session', () => {
  let repo: string;
  let worktree: string;
  let code: CodeSessionInfo;

  beforeAll(async () => {
    repo = await makeRepo('merge');
    await put(repo, 'shared.txt', 'first\nsecond\n');
    await put(repo, 'readme.md', '# Project\n');
    const base = commit(repo, 'base');
    worktree = join(root, 'worktrees', 'session');
    await mkdir(join(root, 'worktrees'), { recursive: true });
    sh(repo, 'worktree', 'add', '-q', '-b', 'cellar/session', worktree, base);
    code = { repoRoot: repo, repoName: 'merge', isGit: true, worktree: true, branch: 'cellar/session', baseBranch: 'main', baseCommit: base, mode: 'code' };
  });

  it('refuses when the session has uncommitted changes', async () => {
    await put(worktree, 'feature.txt', 'feature\n');
    await expect(mergeSession(code, worktree)).rejects.toThrow("Commit or discard the session's changes first");
    await commitAll(worktree, 'Add feature');
  });

  it('refuses when the repository is on another branch', async () => {
    sh(repo, 'checkout', '-q', '-b', 'other');
    try {
      await expect(mergeSession(code, worktree)).rejects.toThrow(/other.*main/);
    } finally {
      sh(repo, 'checkout', '-q', 'main');
    }
  });

  it('refuses when the repository has uncommitted tracked changes', async () => {
    await put(repo, 'readme.md', '# Changed\n');
    try {
      await expect(mergeSession(code, worktree)).rejects.toThrow(/uncommitted changes on main/);
    } finally {
      sh(repo, 'checkout', '--', 'readme.md');
    }
  });

  it('merges the session branch into the base branch', async () => {
    await put(repo, 'notes-untracked.txt', 'not part of git\n');
    const result = await mergeSession(code, worktree);
    expect(result.merged).toBe(true);
    expect(result.message).toContain('Merged 1 commit from cellar/session into main');
    expect(await readFile(join(repo, 'feature.txt'), 'utf8')).toBe('feature\n');
    const again = await mergeSession(code, worktree);
    expect(again.merged).toBe(false);
    expect(again.message).toContain('already has everything');
  });

  it('cancels a conflicting merge and names the conflicting files', async () => {
    await put(worktree, 'shared.txt', 'first from session\nsecond\n');
    await commitAll(worktree, 'Session edit');
    await put(repo, 'shared.txt', 'first from main\nsecond\n');
    commit(repo, 'Main edit');
    const result = await mergeSession(code, worktree);
    expect(result.merged).toBe(false);
    expect(result.message).toContain('shared.txt');
    expect(sh(repo, 'status', '--porcelain', '--untracked-files=no')).toBe('');
    expect(existsSync(join(repo, '.git', 'MERGE_HEAD'))).toBe(false);
    expect(await readFile(join(repo, 'shared.txt'), 'utf8')).toBe('first from main\nsecond\n');
  });

  it('only merges worktree sessions', async () => {
    await expect(mergeSession({ ...code, worktree: false }, repo)).rejects.toThrow('own worktree');
  });
});

describe('snapshot sessions outside git', () => {
  const conversationId = 'snapshot-session';
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(root, 'plain-'));
    await put(dir, 'keep.txt', 'keep\n');
    await put(dir, 'edit.txt', 'a\nb\nc\n');
    await put(dir, 'remove.txt', 'x\ny\n');
    await put(dir, 'sub/deep.txt', 'deep\n');
  });

  const snap = (rel: string) => snapshotBeforeChange(conversationId, dir, join(dir, rel));

  it('reports the files the session changed', async () => {
    await snap('edit.txt');
    await put(dir, 'edit.txt', 'a\nB\nc\nd\n');
    await snap('created.txt');
    await put(dir, 'created.txt', '1\n2\n3\n');
    await snap('remove.txt');
    await unlink(join(dir, 'remove.txt'));
    await snap('keep.txt');
    await snap('sub/deep.txt');
    await put(dir, 'sub/deep.txt', 'deeper\n');

    const set = await snapshotChangeSet(conversationId, dir);
    expect(set.source).toBe('snapshots');
    expect(set.files).toEqual([
      { path: 'created.txt', status: 'added', additions: 3, deletions: 0, binary: false },
      { path: 'edit.txt', status: 'modified', additions: 2, deletions: 1, binary: false },
      { path: 'remove.txt', status: 'deleted', additions: 0, deletions: 2, binary: false },
      { path: 'sub/deep.txt', status: 'modified', additions: 1, deletions: 1, binary: false },
    ]);
    expect(set.additions).toBe(6);
    expect(set.deletions).toBe(4);

    expect(await snapshotFileDiff(conversationId, dir, 'edit.txt')).toMatchObject({ oldText: 'a\nb\nc\n', newText: 'a\nB\nc\nd\n' });
    expect(await snapshotFileDiff(conversationId, dir, 'created.txt')).toMatchObject({ oldText: '', newText: '1\n2\n3\n' });
    expect(await snapshotFileDiff(conversationId, dir, 'remove.txt')).toMatchObject({ oldText: 'x\ny\n', newText: '' });
    expect(await snapshotFileDiff(conversationId, dir, 'keep.txt')).toMatchObject({ oldText: 'keep\n', newText: 'keep\n' });
  });

  it('records edits saved from the editor', async () => {
    const workspace = await Workspace.open(dir);
    await writeWorkspaceFile(workspace, 'notes/new.md', '# Notes\n', { snapshotConversationId: conversationId });
    const set = await snapshotChangeSet(conversationId, dir);
    expect(set.files.find((f) => f.path === 'notes/new.md')).toMatchObject({ status: 'added', additions: 1 });
  });

  it('restores every file from its snapshot', async () => {
    for (const rel of ['created.txt', 'edit.txt', 'remove.txt', 'sub/deep.txt', 'notes/new.md']) {
      await snapshotDiscardFile(conversationId, dir, rel);
    }
    expect(existsSync(join(dir, 'created.txt'))).toBe(false);
    expect(existsSync(join(dir, 'notes/new.md'))).toBe(false);
    expect(await readFile(join(dir, 'edit.txt'), 'utf8')).toBe('a\nb\nc\n');
    expect(await readFile(join(dir, 'remove.txt'), 'utf8')).toBe('x\ny\n');
    expect(await readFile(join(dir, 'sub/deep.txt'), 'utf8')).toBe('deep\n');
    expect((await snapshotChangeSet(conversationId, dir)).files).toEqual([]);
    expect(Object.keys(await readManifest(conversationId))).toEqual(['keep.txt']);
    await expect(snapshotDiscardFile(conversationId, dir, 'edit.txt')).rejects.toThrow('no saved copy');
  });
});

describe('file tree and editor', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(root, 'files-'));
    sh(dir, 'init', '-q');
    await put(dir, 'b.txt', 'bee');
    await put(dir, 'A.md', '# A');
    await put(dir, 'file10.txt', '');
    await put(dir, 'file2.txt', '');
    await put(dir, 'src/index.ts', 'export {};\n');
    await put(dir, 'node_modules/pkg/index.js', '');
    await put(dir, 'image.bin', Buffer.from([137, 80, 0, 1]));
    await put(dir, 'bom.txt', Buffer.concat([BOM, Buffer.from('with bom\r\n')]));
  });

  it('lists folders first, then files by name, without .git', async () => {
    const workspace = await Workspace.open(dir);
    const entries = await listDirectory(workspace, '.');
    expect(entries.map((e) => e.name)).toEqual(['node_modules', 'src', 'A.md', 'b.txt', 'bom.txt', 'file2.txt', 'file10.txt', 'image.bin']);
    expect(entries.find((e) => e.name === 'b.txt')).toEqual({ name: 'b.txt', path: 'b.txt', isDirectory: false, size: 3 });
    expect(await listDirectory(workspace, 'src')).toEqual([{ name: 'index.ts', path: 'src/index.ts', isDirectory: false, size: 11 }]);
    await expect(listDirectory(workspace, '../')).rejects.toThrow('outside the working folder');
    await expect(listDirectory(workspace, 'b.txt')).rejects.toThrow('not a folder');
  });

  it('reads text, binary and missing files', async () => {
    const workspace = await Workspace.open(dir);
    expect(await readWorkspaceFile(workspace, 'bom.txt')).toEqual({ path: 'bom.txt', content: 'with bom\r\n', binary: false, tooLarge: false, size: 13 });
    expect(await readWorkspaceFile(workspace, 'image.bin')).toMatchObject({ binary: true, content: '' });
    await expect(readWorkspaceFile(workspace, 'missing.txt')).rejects.toThrow('does not exist');
    await expect(readWorkspaceFile(workspace, 'src')).rejects.toThrow('is a folder');
  });

  it('writes files, keeping an existing byte order mark', async () => {
    const workspace = await Workspace.open(dir);
    await writeWorkspaceFile(workspace, 'bom.txt', 'changed\r\n');
    expect(await readFile(join(dir, 'bom.txt'))).toEqual(Buffer.concat([BOM, Buffer.from('changed\r\n')]));
    await writeWorkspaceFile(workspace, 'deep/new/file.ts', 'const x = 1;\n');
    expect(await readFile(join(dir, 'deep/new/file.ts'), 'utf8')).toBe('const x = 1;\n');
    await expect(writeWorkspaceFile(workspace, '../escape.txt', 'no')).rejects.toThrow('outside the working folder');
    await expect(writeWorkspaceFile(workspace, 'src', 'no')).rejects.toThrow('is a folder');
  });
});
