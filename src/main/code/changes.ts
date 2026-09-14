/**
 * Changes panel and file editor backend: `code:changes`, `code:fileDiff`, `code:discardFile`,
 * `code:commit`, `code:merge`, `code:listDir`, `code:readFile`, `code:writeFile`.
 * The work happens in changes-git.ts (git sessions) and changes-files.ts (snapshots and files).
 */
import { z } from 'zod';
import type { CodeSessionInfo } from '@shared/types/code';
import { handle } from '../ipc/register';
import { bus } from '../lib/events';
import { listDirectory, readWorkspaceFile, snapshotChangeSet, snapshotDiscardFile, snapshotFileDiff, writeWorkspaceFile } from './changes-files';
import { commitAll, gitChangeSet, gitDiscardFile, gitFileDiff, mergeSession } from './changes-git';
import { codeSession, type CodeSessionContext } from './context';

const conversationIdSchema = z.string().min(1).max(200);
const pathSchema = z.string().max(4096);
const messageSchema = z.string().max(20_000);
const contentSchema = z.string().max(50 * 1024 * 1024);

/** The commit changes are shown against, when the session tracks them with git. */
const gitBase = (code: CodeSessionInfo): string | null => (code.isGit && code.baseCommit ? code.baseCommit : null);

async function session(conversationId: unknown): Promise<CodeSessionContext> {
  return codeSession(conversationIdSchema.parse(conversationId));
}

/** A path from the renderer, checked to stay inside the working folder, relative with forward slashes. */
async function relPath(s: CodeSessionContext, path: unknown): Promise<string> {
  const rel = s.workspace.relative(await s.workspace.resolve(pathSchema.parse(path)));
  if (rel === '.') throw new Error('Choose a file inside the working folder.');
  return rel;
}

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
