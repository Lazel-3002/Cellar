import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { MemoryFile } from '@shared/types/code';
import { chat } from '../chat/orchestrator';
import { deleteConversations } from '../db/chat-store';
import { handle } from '../ipc/register';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage } from '../lib/util';
import { relPath } from './changes';
import { codeSession } from './context';
import { findMemoryFile, removeWorktree, repoInfo } from './git';
import { lsp } from './lsp';
import { deleteSnapshots } from './snapshots';
import { terminals } from './terminal';

const log = logger('code');

const id = z.string().min(1).max(100);
const codeMode = z.enum(['ask', 'plan', 'code']);
const textSchema = z.string().max(50 * 1024 * 1024);
const positionSchema = z.object({ line: z.number().int().min(1), column: z.number().int().min(1) });

/** Code session handlers: repository info, modes, memory and deletion. */
export function registerCodeHandlers(): void {
  handle('code:repoInfo', (folder) => repoInfo(z.string().min(1).max(4096).parse(folder)));

  handle('code:setMode', (conversationId, mode, autoAcceptEdits) => chat.setCodeMode(id.parse(conversationId), codeMode.parse(mode), z.boolean().parse(autoAcceptEdits)));

  handle('code:memory', async (conversationId): Promise<MemoryFile> => {
    const { workspace } = await codeSession(id.parse(conversationId));
    const name = (await findMemoryFile(workspace.root)) ?? 'CELLAR.md';
    const content = await readFile(join(workspace.root, name), 'utf8').catch(() => null);
    return { path: name, exists: content !== null, content: content ?? '' };
  });

  handle('code:lspOpen', async (conversationId, path, text) => {
    const s = await codeSession(id.parse(conversationId));
    return lsp.open(s.conversationId, s.workspace.root, await relPath(s, path), textSchema.parse(text));
  });
  handle('code:lspChange', async (conversationId, path, text) => {
    const s = await codeSession(id.parse(conversationId));
    await lsp.change(s.conversationId, s.workspace.root, await relPath(s, path), textSchema.parse(text));
  });
  handle('code:lspClose', async (conversationId, path) => {
    const s = await codeSession(id.parse(conversationId));
    await lsp.close(s.conversationId, s.workspace.root, await relPath(s, path));
  });
  handle('code:lspCompletion', async (conversationId, path, position) => {
    const s = await codeSession(id.parse(conversationId));
    return lsp.completion(s.conversationId, s.workspace.root, await relPath(s, path), positionSchema.parse(position));
  });
  handle('code:lspDefinition', async (conversationId, path, position) => {
    const s = await codeSession(id.parse(conversationId));
    return lsp.definition(s.conversationId, s.workspace.root, await relPath(s, path), positionSchema.parse(position));
  });
  handle('code:lspReferences', async (conversationId, path, position) => {
    const s = await codeSession(id.parse(conversationId));
    return lsp.references(s.conversationId, s.workspace.root, await relPath(s, path), positionSchema.parse(position));
  });

  handle('code:deleteSession', async (conversationId, removeWorktreeToo) => {
    const sessionId = id.parse(conversationId);
    const session = await codeSession(sessionId).catch(() => null);
    chat.stopConversation(sessionId);
    terminals.killForConversation(sessionId);
    await lsp.disposeForSession(sessionId);
    if (session && removeWorktreeToo && session.code.worktree) {
      // Give stopped commands and terminals a moment to release their handles on the folder.
      await new Promise((r) => setTimeout(r, 400));
      try {
        await removeWorktree(session.code.repoRoot, session.task.workDir, session.code.branch, true);
      } catch (err) {
        log.warn('worktree removal failed', errorMessage(err));
        throw new Error(`The session was not deleted because its worktree could not be removed: ${errorMessage(err)}`);
      }
    }
    await deleteSnapshots(sessionId).catch(() => undefined);
    deleteConversations([sessionId]);
    bus.emit('chat:changed', {});
  });
}
