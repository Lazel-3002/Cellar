import type { PermissionMode } from './agent';
import type { ModelRef } from './models';

/**
 * A reminder a model set for itself with `create_reminder`. It rides on the scheduled-task table so
 * it survives the session that made it, the app being quit, and the machine sleeping — the same OS
 * wake job wakes Cellar for it.
 */
export interface ReminderSpec {
  /** The conversation the reminder belongs to and posts back into. */
  conversationId: string;
  /** Posted into the conversation when the reminder fires. */
  message?: string;
  /** Sent into the conversation as a new request when the reminder fires. */
  task?: string;
  /** An inbox to check and summarize; the model uses whatever email connector it has. */
  emailCheck?: string;
}

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
  /** Fires once at `fireAt` and then turns itself off; `cron` is only there for display. */
  oneShot?: boolean;
  fireAt?: number;
  /** Set when the model made this itself with `create_reminder`. */
  reminder?: ReminderSpec;
}

export type ScheduledTaskInput = Omit<ScheduledTask, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'lastStatus' | 'nextRunAt' | 'oneShot' | 'fireAt' | 'reminder'> & { id?: string };

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
