import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { TaskState, TaskStatus } from '@shared/types/agent';
import { newId } from '../lib/util';
import { settings } from '../services/settings';
import { paths } from '../system/paths';

/** Task state of a Design session; the design itself lives in the designs table under `designId`. */
export async function prepareDesignSession(status: TaskStatus = 'running', designId = newId()): Promise<TaskState> {
  const workDir = join(paths().designs, designId);
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
    design: { designId },
  };
}
