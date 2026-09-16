import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { TaskState, TaskStatus } from '@shared/types/agent';
import { newId } from '../lib/util';
import { settings } from '../services/settings';
import { paths } from '../system/paths';

/** Task state of a Math session; the board itself lives in the boards table under `boardId`. */
export async function prepareMathSession(status: TaskStatus = 'running', boardId = newId()): Promise<TaskState> {
  const workDir = join(paths().boards, boardId);
  await mkdir(workDir, { recursive: true });
  return {
    folder: null,
    workDir,
    permissionMode: 'auto-edits',
    status,
    todos: [],
    files: [],
    sources: [],
    allowCommands: false,
    allowedDomains: [],
    steps: 0,
    maxSteps: settings.get().coworkMaxSteps,
    math: { boardId },
  };
}
