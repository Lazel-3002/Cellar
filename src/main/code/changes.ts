/**
 * Changes panel and file editor backend: `code:changes`, `code:fileDiff`, `code:discardFile`,
 * `code:commit`, `code:merge`, `code:listDir`, `code:readFile`, `code:writeFile`, plus pushing,
 * opening a pull request and resolving merge conflicts.
 * The work happens in changes-git.ts (git sessions) and changes-files.ts (snapshots and files).
 */
import { z } from 'zod';
import type { CodeSessionInfo } from '@shared/types/code';
import { Workspace } from '../agent/workspace';
import { handle } from '../ipc/register';
import { bus } from '../lib/events';
import { listDirectory, readWorkspaceFile, snapshotChangeSet, snapshotDiscardFile, snapshotFileDiff, writeWorkspaceFile } from './changes-files';
import {
  abortMerge,
  commitAll,
  conflictedFiles,
  continueMerge,
  fileHasConflictMarkers,
  gitChangeSet,
  gitDiscardFile,
  gitFileDiff,
  mergeInProgress,
  mergeSession,
  readRepoFile,
  writeRepoFile,
} from './changes-git';
import { codeSession, type CodeSessionContext } from './context';
import { createPullRequest, existingPullRequestUrl, ghAuthenticated, ghAvailable } from './gh';
import { isGitHubRemote, pushBranch, remoteUrl } from './git';

const conversationIdSchema = z.string().min(1).max(200);
const pathSchema = z.string().max(4096);
const messageSchema = z.string().max(20_000);
const contentSchema = z.string().max(50 * 1024 * 1024);
const titleSchema = z.string().min(1).max(300);
const bodySchema = z.string().max(60_000);

/** The commit changes are shown against, when the session tracks them with git. */
const gitBase = (code: CodeSessionInfo): string | null => (code.isGit && code.baseCommit ? code.baseCommit : null);

async function session(conversationId: unknown): Promise<CodeSessionContext> {
  return codeSession(conversationIdSchema.parse(conversationId));
}

/** A path from the renderer, checked to stay inside the working folder, relative with forward slashes. */
export async function relPath(s: CodeSessionContext, path: unknown): Promise<string> {
  const rel = s.workspace.relative(await s.workspace.resolve(pathSchema.parse(path)));
  if (rel === '.') throw new Error('Choose a file inside the working folder.');
  return rel;
}

/** A path from the renderer, checked to stay inside the *repository* (not the session's worktree). */
async function repoRelPath(repoRoot: string, path: unknown): Promise<string> {
  const repo = await Workspace.open(repoRoot);
  const rel = repo.relative(await repo.resolve(pathSchema.parse(path)));
  if (rel === '.') throw new Error('Choose a file inside the repository.');
  return rel;
}

/** Where push and pull-request commands run: the worktree for a worktree session, otherwise the repository itself. */
const remoteDir = (s: CodeSessionContext) => (s.code.worktree ? s.workspace.root : s.code.repoRoot);

const changed = (conversationId: string) => bus.emit('chat:changed', { conversationId });

export function registerChangesHandlers(): void {
  handle('code:changes', async (conversationId) => {
    const s = await session(conversationId);
    const base = gitBase(s.code);
    return base ? gitChangeSet(s.workspace.root, base) : snapshotChangeSet(s.conversationId, s.workspace.root);
  });

  handle('code:fileDiff', async (conversationId, path) => {
    const s = await session(conversationId);
    const rel = await relPath(s, path);
    const base = gitBase(s.code);
    return base ? gitFileDiff(s.workspace.root, base, rel) : snapshotFileDiff(s.conversationId, s.workspace.root, rel);
  });

  handle('code:discardFile', async (conversationId, path) => {
    const s = await session(conversationId);
    const rel = await relPath(s, path);
    const base = gitBase(s.code);
    if (base) await gitDiscardFile(s.workspace.root, base, rel);
    else await snapshotDiscardFile(s.conversationId, s.workspace.root, rel);
    changed(s.conversationId);
  });

  handle('code:commit', async (conversationId, message) => {
    const s = await session(conversationId);
    if (!s.code.isGit) throw new Error("Committing needs a git repository, and this session's folder is not one.");
    const result = await commitAll(s.workspace.root, messageSchema.parse(message));
    changed(s.conversationId);
    return result;
  });

  handle('code:merge', async (conversationId) => {
    const s = await session(conversationId);
    const result = await mergeSession(s.code, s.workspace.root);
    changed(s.conversationId);
    return result;
  });

  handle('code:remoteInfo', async (conversationId) => {
    const s = await session(conversationId);
    if (!s.code.isGit) return { hasRemote: false, isGitHub: false };
    const url = await remoteUrl(remoteDir(s));
    return { hasRemote: !!url, isGitHub: isGitHubRemote(url) };
  });

  handle('code:push', async (conversationId) => {
    const s = await session(conversationId);
    if (!s.code.isGit || !s.code.branch) throw new Error('Pushing needs a git branch.');
    return pushBranch(remoteDir(s), s.code.branch);
  });

  handle('code:createPullRequest', async (conversationId, title, body) => {
    const s = await session(conversationId);
    if (!s.code.isGit || !s.code.branch || !s.code.baseBranch) throw new Error('Opening a pull request needs a branch and the branch it started from.');
    if (!(await ghAvailable())) throw new Error('The GitHub CLI (gh) is not installed. Install it from https://cli.github.com, then sign in with `gh auth login`.');
    const dir = remoteDir(s);
    if (!(await ghAuthenticated(dir))) throw new Error('Sign in first with `gh auth login`, then try again.');
    return createPullRequest(dir, { base: s.code.baseBranch, head: s.code.branch, title: titleSchema.parse(title), body: bodySchema.parse(body) });
  });

  handle('code:pullRequestUrl', async (conversationId) => {
    const s = await session(conversationId);
    if (!s.code.isGit || !s.code.branch || !(await ghAvailable())) return undefined;
    return existingPullRequestUrl(remoteDir(s), s.code.branch);
  });

  handle('code:mergeStatus', async (conversationId) => {
    const s = await session(conversationId);
    if (!s.code.isGit) return { inProgress: false, conflicted: [] };
    const inProgress = await mergeInProgress(s.code.repoRoot);
    return { inProgress, conflicted: inProgress ? await conflictedFiles(s.code.repoRoot) : [] };
  });

  handle('code:conflictFile', async (conversationId, path) => {
    const s = await session(conversationId);
    if (!s.code.isGit) throw new Error('This is not a git repository.');
    const rel = await repoRelPath(s.code.repoRoot, path);
    const conflicted = await conflictedFiles(s.code.repoRoot);
    if (!conflicted.includes(rel)) throw new Error(`${rel} is not a conflicted file.`);
    const [content, hasMarkers] = await Promise.all([readRepoFile(s.code.repoRoot, rel), fileHasConflictMarkers(s.code.repoRoot, rel)]);
    return { path: rel, content, resolved: !hasMarkers };
  });

  handle('code:writeConflictFile', async (conversationId, path, content) => {
    const s = await session(conversationId);
    if (!s.code.isGit) throw new Error('This is not a git repository.');
    const rel = await repoRelPath(s.code.repoRoot, path);
    const conflicted = await conflictedFiles(s.code.repoRoot);
    if (!conflicted.includes(rel)) throw new Error(`${rel} is not a conflicted file.`);
    await writeRepoFile(s.code.repoRoot, rel, contentSchema.parse(content));
  });

  handle('code:continueMerge', async (conversationId) => {
    const s = await session(conversationId);
    if (!s.code.isGit) throw new Error('This is not a git repository.');
    const result = await continueMerge(s.code.repoRoot);
    changed(s.conversationId);
    return result;
  });

  handle('code:abortMerge', async (conversationId) => {
    const s = await session(conversationId);
    if (!s.code.isGit) throw new Error('This is not a git repository.');
    await abortMerge(s.code.repoRoot);
    changed(s.conversationId);
  });

  handle('code:listDir', async (conversationId, path) => {
    const s = await session(conversationId);
    return listDirectory(s.workspace, pathSchema.parse(path));
  });

  handle('code:readFile', async (conversationId, path) => {
    const s = await session(conversationId);
    return readWorkspaceFile(s.workspace, await relPath(s, path));
  });

  handle('code:writeFile', async (conversationId, path, content) => {
    const s = await session(conversationId);
    const rel = await relPath(s, path);
    await writeWorkspaceFile(s.workspace, rel, contentSchema.parse(content), { snapshotConversationId: gitBase(s.code) ? undefined : s.conversationId });
    changed(s.conversationId);
  });
}
