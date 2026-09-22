import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { TaskState, TaskStatus } from '@shared/types/agent';
import type { StudyMode } from '@shared/types/study';
import { settings } from '../services/settings';
import { paths } from '../system/paths';

/** Task state of a Study chat; the book lives in the books table under `bookId`. */
export async function prepareStudySession(bookId: string, status: TaskStatus = 'done', mode: StudyMode = 'tutor'): Promise<TaskState> {
  // The tools never write files, but every task has a working folder.
  const workDir = join(paths().books, 'work', bookId);
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
    study: { bookId, mode },
  };
}
