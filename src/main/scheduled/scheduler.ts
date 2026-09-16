/**
 * Scheduled tasks: prompts that run on a cron schedule as a chat or a Cowork task, with local models.
 * A timer checks every 20 seconds while Cellar runs (in the tray when the window is closed). A run that
 * was missed while Cellar was closed happens once when it starts again, and a single OS-level wake job
 * (Task Scheduler / launchd / cron, see os-scheduler.ts) relaunches Cellar for the next due task even
 * if it was fully quit or the machine was asleep, so tasks aren't only caught up whenever someone next
 * opens the app.
 */
import { readFile, writeFile } from 'node:fs/promises';
import type { PermissionMode } from '@shared/types/agent';
import type { ModelEntry, ModelRef } from '@shared/types/models';
import type { ScheduledRun, ScheduledRunStatus, ScheduledTask, ScheduledTaskInput } from '@shared/types/scheduled';
import { chat, type TurnFinished } from '../chat/orchestrator';
import { all, get, run } from '../db/client';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage, newId, safeJsonParse } from '../lib/util';
import { providers } from '../providers/registry';
import { settings } from '../services/settings';
import { paths } from '../system/paths';
import { nextFire, parseCron } from './cron';
import { syncWakeJob } from './os-scheduler';

const log = logger('scheduled');
const TICK_MS = 20_000;
/** Later than this after the scheduled time, a run counts as a catch-up. */
const CATCH_UP_AFTER_MS = 3 * 60_000;

interface TaskRow {
  id: string;
  name: string;
  prompt: string;
  kind: 'chat' | 'task';
  cron: string;
  model: string | null;
  folder: string | null;
  permission_mode: PermissionMode;
  allow_commands: number;
  project_id: string | null;
  enabled: number;
  last_run_at: number | null;
  last_status: ScheduledRunStatus | null;
  last_fire_at: number | null;
  created_at: number;
  updated_at: number;
}

interface RunRow {
  id: string;
  task_id: string;
  task_name: string | null;
  kind: 'chat' | 'task' | null;
  conversation_id: string | null;
  trigger: ScheduledRun['trigger'];
  status: ScheduledRunStatus;
  error: string | null;
  started_at: number;
  finished_at: number | null;
}

function toTask(r: TaskRow): ScheduledTask {
  const enabled = r.enabled === 1;
  return {
    id: r.id,
    name: r.name,
    prompt: r.prompt,
    kind: r.kind === 'task' ? 'task' : 'chat',
    cron: r.cron,
    model: safeJsonParse<ModelRef | null>(r.model, null),
    folder: r.folder,
    permissionMode: r.permission_mode,
    allowCommands: r.allow_commands === 1,
    projectId: r.project_id,
    enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastRunAt: r.last_run_at ?? undefined,
    lastStatus: r.last_status ?? undefined,
    nextRunAt: enabled ? nextFire(r.cron, Math.max(Date.now(), r.last_fire_at ?? 0)) ?? undefined : undefined,
  };
}

const toRun = (r: RunRow): ScheduledRun => ({
  id: r.id,
  taskId: r.task_id,
  taskName: r.task_name ?? 'Deleted task',
  kind: r.kind ?? 'chat',
  conversationId: r.conversation_id,
  trigger: r.trigger,
  status: r.status,
  error: r.error ?? undefined,
  startedAt: r.started_at,
  finishedAt: r.finished_at ?? undefined,
});

class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  /** conversationId → run id, for runs whose turn is still going. */
  private active = new Map<string, string>();
  private firing = new Set<string>();

  init(): void {
    // Runs that were going when Cellar quit did not finish.
    run("UPDATE scheduled_runs SET status = 'stopped', finished_at = ? WHERE status IN ('running', 'waiting')", Date.now());
    chat.onTurnFinished((event) => this.finished(event));
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    setTimeout(() => void this.tick(), 5000).unref();
    void this.resyncOsWakeJob();
  }

  /**
   * Rewrites ~/.cellar/scheduled_tasks.json from the (authoritative) SQLite table and points the
   * single OS wake job at the earliest enabled, non-expired task. Called on startup and whenever a
   * task is created, edited, enabled/disabled, deleted, or fires.
   */
  private async resyncOsWakeJob(): Promise<void> {
    const registryPath = paths().scheduledRegistry;
    const previous = await readFile(registryPath, 'utf8')
      .then((text) => safeJsonParse<{ tasks: unknown[] }>(text, { tasks: [] }).tasks.length)
      .catch(() => 0);
    const enabled = this.list().filter((t) => t.enabled);
    const registry = {
      updatedAt: Date.now(),
      tasks: enabled.map((t) => ({ id: t.id, name: t.name, cron: t.cron, kind: t.kind, nextRunAt: t.nextRunAt ?? null })),
    };
    await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8').catch((err) => log.warn('could not write scheduled task registry', err));
    if (previous !== registry.tasks.length) log.info(`scheduled task registry: ${previous} -> ${registry.tasks.length} enabled task(s)`);
    const nextRunAt = registry.tasks.reduce<number | null>((min, t) => (t.nextRunAt !== null && (min === null || t.nextRunAt < min) ? t.nextRunAt : min), null);
    await syncWakeJob(nextRunAt);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private changed(): void {
    bus.emit('scheduled:changed', {});
  }

  list(): ScheduledTask[] {
    return all<TaskRow>('SELECT * FROM scheduled_tasks ORDER BY created_at').map(toTask);
  }

  get(id: string): ScheduledTask {
    const row = get<TaskRow>('SELECT * FROM scheduled_tasks WHERE id = ?', id);
    if (!row) throw new Error('Scheduled task not found.');
    return toTask(row);
  }

  runs(taskId?: string, limit = 50): ScheduledRun[] {
    const where = taskId ? 'WHERE r.task_id = ?' : '';
    const params: unknown[] = taskId ? [taskId, limit] : [limit];
    return all<RunRow>(
      `SELECT r.*, t.name AS task_name, t.kind AS kind FROM scheduled_runs r LEFT JOIN scheduled_tasks t ON t.id = r.task_id ${where} ORDER BY r.started_at DESC LIMIT ?`,
      ...params,
    ).map(toRun);
  }

  save(input: ScheduledTaskInput): ScheduledTask {
    const name = input.name.trim();
    if (!name) throw new Error('Give the task a name.');
    if (!input.prompt.trim()) throw new Error('Write what the task should do.');
    parseCron(input.cron);
    const now = Date.now();
    const values = [
      name.slice(0, 120),
      input.prompt.trim().slice(0, 50_000),
      input.kind === 'task' ? 'task' : 'chat',
      input.cron.trim().replace(/\s+/g, ' '),
      input.model ? JSON.stringify({ providerId: input.model.providerId, modelId: input.model.modelId }) : null,
      input.kind === 'task' ? input.folder : null,
      ['ask', 'auto-edits', 'plan'].includes(input.permissionMode) ? input.permissionMode : 'auto-edits',
      input.allowCommands ? 1 : 0,
      input.projectId,
      input.enabled ? 1 : 0,
    ] as const;
    const existing = input.id ? get<TaskRow>('SELECT * FROM scheduled_tasks WHERE id = ?', input.id) : undefined;
    let id = existing?.id;
    if (existing) {
      const scheduleChanged = existing.cron !== values[3] || (existing.enabled === 0 && input.enabled);
      run(
        'UPDATE scheduled_tasks SET name = ?, prompt = ?, kind = ?, cron = ?, model = ?, folder = ?, permission_mode = ?, allow_commands = ?, project_id = ?, enabled = ?, updated_at = ?, last_fire_at = ? WHERE id = ?',
        ...values,
        now,
        scheduleChanged ? now : existing.last_fire_at,
        existing.id,
      );
    } else {
      id = newId();
      run(
        'INSERT INTO scheduled_tasks (name, prompt, kind, cron, model, folder, permission_mode, allow_commands, project_id, enabled, id, created_at, updated_at, last_fire_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ...values,
        id,
        now,
        now,
        now,
      );
    }
    this.changed();
    void this.resyncOsWakeJob();
    return this.get(id!);
  }

  setEnabled(id: string, enabled: boolean): ScheduledTask {
    const task = this.get(id);
    // Turning a task back on starts its schedule from now, so it does not fire for the time it was off.
    run('UPDATE scheduled_tasks SET enabled = ?, updated_at = ?, last_fire_at = CASE WHEN ? = 1 AND enabled = 0 THEN ? ELSE last_fire_at END WHERE id = ?', enabled ? 1 : 0, Date.now(), enabled ? 1 : 0, Date.now(), task.id);
    this.changed();
    void this.resyncOsWakeJob();
    return this.get(id);
  }

  delete(id: string): void {
    run('DELETE FROM scheduled_tasks WHERE id = ?', id);
    this.changed();
    void this.resyncOsWakeJob();
  }

  async tick(now = Date.now()): Promise<void> {
    let fired = false;
    for (const row of all<TaskRow>('SELECT * FROM scheduled_tasks WHERE enabled = 1')) {
      const due = nextFire(row.cron, row.last_fire_at ?? row.created_at);
      if (due === null || due > now || this.firing.has(row.id)) continue;
      run('UPDATE scheduled_tasks SET last_fire_at = ? WHERE id = ?', now, row.id);
      fired = true;
      await this.fire(toTask(row), now - due > CATCH_UP_AFTER_MS ? 'catch-up' : 'schedule').catch((err) => log.error('scheduled run failed', row.name, errorMessage(err)));
    }
    // A fired task's last_fire_at moved, which changes when it (and so the OS wake job) is next due.
    if (fired) void this.resyncOsWakeJob();
  }

  private async pickModel(task: ScheduledTask): Promise<ModelEntry> {
    const wanted = task.model ?? settings.get().defaultModel;
    if (wanted) {
      const entry = await providers.findModel(wanted);
      if (entry && !entry.capabilities.embedding) return entry;
      if (task.model) throw new Error('The model this task uses is not available. Start its app or pick another model for the task.');
    }
    const models = (await providers.listModels(true)).filter((m) => !m.capabilities.embedding);
    const preferred = task.kind === 'task' ? models.filter((m) => m.capabilities.tools) : models;
    const entry = preferred.find((m) => m.loaded) ?? preferred[0] ?? models[0];
    if (!entry) throw new Error('No model is available. Download one or start Ollama, LM Studio or Unsloth Studio.');
    return entry;
  }

  /** Start a run now. Returns the conversation it runs in. */
  async fire(task: ScheduledTask, trigger: ScheduledRun['trigger']): Promise<{ conversationId: string | null; runId: string }> {
    const runId = newId();
    const startedAt = Date.now();
    this.firing.add(task.id);
    run('INSERT INTO scheduled_runs (id, task_id, conversation_id, trigger, status, started_at) VALUES (?, ?, NULL, ?, ?, ?)', runId, task.id, trigger, 'running', startedAt);
    run("UPDATE scheduled_tasks SET last_run_at = ?, last_status = 'running' WHERE id = ?", startedAt, task.id);
    this.changed();
    try {
      const entry = await this.pickModel(task);
      const date = new Date(startedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
      const result = await chat.send({
        content: task.prompt,
        attachmentIds: [],
        model: entry.ref,
        thinking: entry.reasoningStyle === 'effort' ? 'medium' : entry.reasoningStyle === 'none' ? 'off' : 'on',
        projectId: task.projectId,
        title: `${task.name} · ${date}`,
        ...(task.kind === 'task' ? { task: { folder: task.folder, permissionMode: task.permissionMode, allowCommands: task.allowCommands } } : {}),
      });
      run('UPDATE scheduled_runs SET conversation_id = ? WHERE id = ?', result.conversationId, runId);
      this.active.set(result.conversationId, runId);
      log.info(`started "${task.name}" (${trigger})`, entry.displayName);
      this.changed();
      return { conversationId: result.conversationId, runId };
    } catch (err) {
      const message = errorMessage(err);
      this.complete(runId, task.id, 'error', message);
      bus.emit('tasks:notify', { conversationId: '', conversationKind: task.kind, kind: 'error', title: `Scheduled task "${task.name}" could not start`, body: message });
      throw err;
    } finally {
      this.firing.delete(task.id);
    }
  }

  async runNow(id: string): Promise<{ conversationId: string | null }> {
    const { conversationId } = await this.fire(this.get(id), 'manual');
    return { conversationId };
  }

  private complete(runId: string, taskId: string, status: ScheduledRunStatus, error?: string): void {
    const finishedAt = Date.now();
    run('UPDATE scheduled_runs SET status = ?, error = ?, finished_at = ? WHERE id = ?', status, error ?? null, finishedAt, runId);
    run('UPDATE scheduled_tasks SET last_status = ? WHERE id = ?', status, taskId);
    this.changed();
  }

  private finished(event: TurnFinished): void {
    const runId = this.active.get(event.conversationId);
    if (!runId) return;
    this.active.delete(event.conversationId);
    const row = get<{ task_id: string; name: string | null; kind: string | null }>('SELECT r.task_id, t.name, t.kind FROM scheduled_runs r LEFT JOIN scheduled_tasks t ON t.id = r.task_id WHERE r.id = ?', runId);
    if (!row) return;
    const status: ScheduledRunStatus = event.status === 'complete' ? 'done' : event.status;
    this.complete(runId, row.task_id, status, event.error);
    // Cowork tasks notify through the task runner; scheduled chats say so here.
    if (row.kind === 'chat' && status !== 'stopped') {
      const message = chat.getConversation(event.conversationId).messages.find((m) => m.id === event.messageId);
      bus.emit('tasks:notify', {
        conversationId: event.conversationId,
        conversationKind: 'chat',
        kind: status === 'done' ? 'done' : 'error',
        title: status === 'done' ? `${row.name ?? 'Scheduled task'} is done` : `${row.name ?? 'Scheduled task'} failed`,
        body: status === 'done' ? message?.content.split('\n').find((l) => l.trim())?.slice(0, 180) ?? 'The scheduled chat finished.' : event.error ?? 'Something went wrong.',
      });
    }
  }
}

export const scheduler = new Scheduler();
