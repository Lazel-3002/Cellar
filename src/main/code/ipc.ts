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
import { codeSession } from './context';
import { findMemoryFile, removeWorktree, repoInfo } from './git';
import { deleteSnapshots } from './snapshots';
import { terminals } from './terminal';

const log = logger('code');

const id = z.string().min(1).max(100);
const codeMode = z.enum(['ask', 'plan', 'code']);

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

  handle('code:deleteSession', async (conversationId, removeWorktreeToo) => {
    const sessionId = id.parse(conversationId);
    const session = await codeSession(sessionId).catch(() => null);
    chat.stopConversation(sessionId);
    terminals.killForConversation(sessionId);
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
