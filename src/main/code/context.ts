import type { TaskState } from '@shared/types/agent';
import type { CodeSessionInfo } from '@shared/types/code';
import { Workspace } from '../agent/workspace';
import { chat } from '../chat/orchestrator';

export interface CodeSessionContext {
  conversationId: string;
  task: TaskState;
  code: CodeSessionInfo;
  /** The session's working folder (the worktree, or the repository itself). */
  workspace: Workspace;
}

/** The live state of a Code session, with its working folder opened for safe path resolution. */
export async function codeSession(conversationId: string): Promise<CodeSessionContext> {
  const { conversation } = chat.getConversation(conversationId);
  const task = conversation.task;
  if (conversation.kind !== 'code' || !task?.code) throw new Error('This is not a Code session.');
  const workspace = await Workspace.open(task.workDir);
  return { conversationId, task, code: task.code, workspace };
}
