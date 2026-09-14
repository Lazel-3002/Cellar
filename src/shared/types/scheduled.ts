import type { PermissionMode } from './agent';
import type { ModelRef } from './models';

/** A prompt that runs on a schedule: as a chat, or as a Cowork task in a folder. */
export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  kind: 'chat' | 'task';
  /** Five-field cron expression (minute hour day-of-month month day-of-week), local time. */
  cron: string;
  /** null: the default model (or the first available one) at run time. */
  model: ModelRef | null;
  /** Cowork: the folder to work in; null makes a new task folder for each run. */
  folder: string | null;
  permissionMode: PermissionMode;
  /** Cowork: run commands without asking. */
  allowCommands: boolean;
  projectId: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastStatus?: ScheduledRunStatus;
  /** Next time the schedule fires (absent when disabled or invalid). */
  nextRunAt?: number;
}

export type ScheduledTaskInput = Omit<ScheduledTask, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'lastStatus' | 'nextRunAt'> & { id?: string };

export type ScheduledRunStatus = 'running' | 'waiting' | 'done' | 'error' | 'stopped';

export interface ScheduledRun {
  id: string;
  taskId: string;
  taskName: string;
  conversationId: string | null;
  kind: 'chat' | 'task';
  trigger: 'schedule' | 'manual' | 'catch-up';
  status: ScheduledRunStatus;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface CronPreview {
  valid: boolean;
  error?: string;
  /** Plain-English summary, e.g. "Every weekday at 09:00". */
  description?: string;
  next: number[];
}
