/**
 * `call(module, task)`: one interface for a chat to hand work to the rest of Cellar instead of
 * redoing it inline. Every module takes the same `{ action, params }` task and answers the same
 * `{ status, result, stdout? }` shape.
 *
 * Work that needs a model (a Cowork task, a Code session, a design, a board) cannot finish inside a
 * tool call, so those actions start a real conversation, return its job id straight away, and the
 * caller polls with `{ action: 'status', params: { task_id } }`. The delegated conversation shows up
 * in the sidebar like any other, so the user can watch it and answer its approval cards.
 *
 * Rate limited per module (Settings → Capabilities, default 5 calls a minute) so a model that
 * decides to poll in a tight loop cannot spawn work faster than anyone can read it.
 */
import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { calculate } from '@shared/math/calc';
import { generateQuiz, type QuizRequest } from '@shared/math/quiz';
import { solutionText, solve, type SolveRequest } from '@shared/math/solve';
import type { PermissionMode } from '@shared/types/agent';
import type { ModelEntry, ModelRef } from '@shared/types/models';
import { chat } from '../chat/orchestrator';
import { formatProblems, projectCheck, quickCheck } from '../code/diagnostics';
import { exportDesign } from '../design/export';
import { designForConversation } from '../design/store';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage, newId } from '../lib/util';
import { exportBoard } from '../math/export';
import { boardForConversation } from '../math/store';
import { providers } from '../providers/registry';
import { settings } from '../services/settings';
import { paths } from '../system/paths';
import { voice } from '../voice/whisper';
import { describeModules, MODULE_ACTIONS, MODULE_IDS, moduleReadOnly, RESERVED_ACTIONS, type ModuleId } from './catalog';

export { MODULE_IDS, type ModuleId } from './catalog';

const log = logger('modules');

export interface ModuleTask {
  action: string;
  params?: Record<string, unknown>;
}

export interface ModuleResult {
  status: 'success' | 'error';
  result: unknown;
  stdout?: string;
}

export interface CallOptions {
  /** The conversation the call came from, used to pick a model and to link the delegated work back. */
  conversationId?: string;
  signal?: AbortSignal;
}

type JobState = 'running' | 'done' | 'error' | 'stopped';

interface Job {
  id: string;
  module: ModuleId;
  action: string;
  state: JobState;
  conversationId: string;
  /** The conversation that asked for the work. */
  callerId?: string;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

export class ModuleCallError extends Error {}

const asString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new ModuleCallError(`"${field}" is required and must be text.`);
  return value.trim();
};

const optString = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

class ModuleRegistry {
  private jobs = new Map<string, Job>();
  /** conversationId → job id, for the turn-finished hook. */
  private byConversation = new Map<string, string>();
  private calls = new Map<ModuleId, number[]>();
  private hooked = false;

  /** Whether the user is asked before this task runs. */
  readOnly(module: ModuleId, action: string): boolean {
    return moduleReadOnly(module, action);
  }

  describe(): string {
    return describeModules();
  }

  private hook(): void {
    if (this.hooked) return;
    this.hooked = true;
    chat.onTurnFinished((event) => {
      const jobId = this.byConversation.get(event.conversationId);
      if (!jobId) return;
      this.byConversation.delete(event.conversationId);
      const job = this.jobs.get(jobId);
      if (!job) return;
      job.state = event.status === 'complete' ? 'done' : event.status === 'stopped' ? 'stopped' : 'error';
      job.error = event.error;
      job.finishedAt = Date.now();
    });
  }

  /** Sliding one-minute window per module. */
  private checkRate(module: ModuleId): void {
    const limit = Math.max(1, settings.get().moduleCallsPerMinute);
    const now = Date.now();
    const recent = (this.calls.get(module) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= limit) {
      const waitMs = 60_000 - (now - recent[0]);
      throw new ModuleCallError(`${module} has already been called ${recent.length} times in the last minute (the limit is ${limit}). Wait ${Math.ceil(waitMs / 1000)}s, or raise it in Settings → Capabilities.`);
    }
    recent.push(now);
    this.calls.set(module, recent);
  }

  async call(module: ModuleId, task: ModuleTask, options: CallOptions = {}): Promise<ModuleResult> {
    const action = asString(task.action, 'action').toLowerCase().replace(/[\s-]+/g, '_');
    const params = (task.params ?? {}) as Record<string, unknown>;
    this.hook();
    try {
      if (action === 'actions') return { status: 'success', result: MODULE_ACTIONS[module], stdout: describeModules() };
      if (action === 'status') return this.jobStatus(asString(params.task_id ?? params.taskId ?? params.id, 'params.task_id'));
      if (action === 'cancel') return this.cancel(asString(params.task_id ?? params.taskId ?? params.id, 'params.task_id'));
      this.checkRate(module);
      switch (module) {
        case 'cellar-math':
          return await this.math(action, params, options);
        case 'cellar-design':
          return await this.design(action, params, options);
        case 'cellar-code':
          return await this.code(action, params, options);
        case 'cellar-cowork':
          return await this.cowork(action, params, options);
        case 'cellar-voice':
          return await this.voice(action, params);
      }
    } catch (err) {
      if (!(err instanceof ModuleCallError)) log.warn(`${module}.${action} failed`, errorMessage(err));
      return { status: 'error', result: null, stdout: errorMessage(err) };
    }
  }

  private unknown(module: ModuleId, action: string): ModuleResult {
    return { status: 'error', result: null, stdout: `${module} has no action "${action}". It accepts: ${MODULE_ACTIONS[module].map((a) => a.action).join(', ')}, status, cancel, actions.` };
  }

  // ---- modules ----------------------------------------------------------

  private async math(action: string, params: Record<string, unknown>, options: CallOptions): Promise<ModuleResult> {
    if (action === 'calculate') {
      const list = Array.isArray(params.expressions) ? params.expressions : [params.expression ?? params.expressions ?? params.input];
      const expressions = list.map((e) => asString(e, 'params.expression')).slice(0, 20);
      const results = expressions.map((expression) => ({ expression, ...calculate(expression, { angle: params.angle === 'rad' ? 'rad' : 'deg', steps: !!params.steps, decimals: typeof params.decimals === 'number' ? params.decimals : undefined }) }));
      return { status: 'success', result: results, stdout: results.map((r) => `${r.expression} = ${r.ok ? r.answer : r.error ?? '?'}`).join('\n') };
    }
    if (action === 'solve') {
      const solution = solve(params as unknown as SolveRequest);
      return { status: 'success', result: solution, stdout: solutionText(solution) };
    }
    if (action === 'quiz') {
      const quiz = generateQuiz(params as unknown as QuizRequest);
      return { status: 'success', result: quiz, stdout: quiz.questions.map((q, i) => `${i + 1}. ${q.prompt}`).join('\n') };
    }
    if (action === 'create_board') {
      const prompt = asString(params.prompt ?? params.task, 'params.prompt');
      return this.startConversation('cellar-math', action, options, (model) =>
        chat.send({
          content: prompt,
          attachmentIds: [],
          model,
          thinking: 'on',
          math: { topic: optString(params.topic), paper: params.paper as never, angleMode: params.angle_mode as never },
        }),
      );
    }
    if (action === 'export') {
      const boardId = optString(params.board_id) ?? (optString(params.conversation_id) ? boardForConversation(optString(params.conversation_id)!)?.id : undefined);
      if (!boardId) throw new ModuleCallError('Give either params.board_id or params.conversation_id of a Math board.');
      const format = (optString(params.format) ?? 'pdf') as 'pdf' | 'png' | 'md';
      const path = await exportBoard({ boardId, format, answers: params.answers !== false }, { path: await this.exportPath(`board-${boardId.slice(0, 8)}.${format}`) });
      return { status: 'success', result: { path }, stdout: `Wrote ${path}` };
    }
    return this.unknown('cellar-math', action);
  }

  private async design(action: string, params: Record<string, unknown>, options: CallOptions): Promise<ModuleResult> {
    if (action === 'create') {
      const prompt = asString(params.prompt ?? params.task, 'params.prompt');
      const format = (optString(params.format) ?? 'slides') as never;
      return this.startConversation('cellar-design', action, options, (model) =>
        chat.send({ content: prompt, attachmentIds: [], model, thinking: 'on', design: { format, themeId: optString(params.theme) ?? optString(params.theme_id) ?? '' } }),
      );
    }
    if (action === 'export') {
      const designId = optString(params.design_id) ?? (optString(params.conversation_id) ? designForConversation(optString(params.conversation_id)!)?.id : undefined);
      if (!designId) throw new ModuleCallError('Give either params.design_id or params.conversation_id of a design.');
      const format = (optString(params.format) ?? 'pdf') as 'png' | 'pdf' | 'pptx';
      const path = await exportDesign({ designId, format, scale: typeof params.scale === 'number' ? params.scale : undefined }, { path: await this.exportPath(`design-${designId.slice(0, 8)}.${format}`) });
      return { status: 'success', result: { path }, stdout: `Wrote ${path}` };
    }
    return this.unknown('cellar-design', action);
  }

  private async code(action: string, params: Record<string, unknown>, options: CallOptions): Promise<ModuleResult> {
    if (action === 'run') {
      const folder = asString(params.folder ?? params.repo ?? params.path, 'params.folder');
      const prompt = asString(params.prompt ?? params.task, 'params.prompt');
      const mode = (['ask', 'plan', 'code'].includes(String(params.mode)) ? params.mode : settings.get().codeMode) as 'ask' | 'plan' | 'code';
      return this.startConversation('cellar-code', action, options, (model) =>
        chat.send({
          content: prompt,
          attachmentIds: [],
          model,
          thinking: 'on',
          code: { folder, mode, autoAcceptEdits: settings.get().codeAutoAcceptEdits, worktree: settings.get().codeUseWorktrees },
        }),
      );
    }
    if (action === 'diagnostics') {
      const folder = asString(params.folder ?? params.path, 'params.folder');
      const file = optString(params.file) ?? optString(params.target);
      if (file) {
        const problems = await quickCheck(join(folder, file), folder, options.signal ?? new AbortController().signal);
        return { status: 'success', result: problems, stdout: problems.length ? formatProblems(problems) : `No problems found in ${file}.` };
      }
      const check = await projectCheck(folder, options.signal ?? new AbortController().signal);
      return { status: 'success', result: check, stdout: [check.ran.length ? `Checked with ${check.ran.join(', ')}.` : 'No checker applies to this project.', formatProblems(check.problems), ...check.notes].filter(Boolean).join('\n') };
    }
    return this.unknown('cellar-code', action);
  }

  private async cowork(action: string, params: Record<string, unknown>, options: CallOptions): Promise<ModuleResult> {
    if (action === 'run') {
      const prompt = asString(params.prompt ?? params.task, 'params.prompt');
      const permissionMode = (['ask', 'auto-edits', 'plan'].includes(String(params.permission_mode)) ? params.permission_mode : settings.get().coworkPermissionMode) as PermissionMode;
      return this.startConversation('cellar-cowork', action, options, (model) =>
        chat.send({ content: prompt, attachmentIds: [], model, thinking: 'on', task: { folder: optString(params.folder) ?? null, permissionMode } }),
      );
    }
    return this.unknown('cellar-cowork', action);
  }

  private async voice(action: string, params: Record<string, unknown>): Promise<ModuleResult> {
    if (action === 'info') {
      const status = await voice.status();
      const installed = status.models.filter((m) => m.installed).map((m) => m.label);
      return {
        status: 'success',
        result: { ready: status.ready, model: status.model, language: status.language, runtime: status.runtime?.variant ?? null, installedModels: installed, speakReplies: settings.get().voiceReplies },
        stdout: status.ready ? `Dictation is ready (${status.runtime?.variant} build, ${status.model}).` : 'Dictation is not set up yet — Settings → Voice.',
      };
    }
    if (action === 'transcribe') {
      const path = asString(params.path ?? params.file, 'params.path');
      const { readFile } = await import('node:fs/promises');
      const wav = await readFile(path).catch(() => {
        throw new ModuleCallError(`Could not read ${path}.`);
      });
      const result = await voice.transcribe(new Uint8Array(wav), optString(params.language));
      return { status: 'success', result, stdout: result.text || '(no speech recognized)' };
    }
    if (action === 'speak') {
      // The main process has no audio output; the renderer owns speech synthesis.
      const text = asString(params.text ?? params.message, 'params.text');
      bus.emit('voice:speak', { text: text.slice(0, 4000) });
      return { status: 'success', result: { spoken: true }, stdout: 'Speaking.' };
    }
    return this.unknown('cellar-voice', action);
  }

  // ---- jobs -------------------------------------------------------------

  private async pickModel(callerId?: string): Promise<ModelRef> {
    const wanted = (callerId ? this.conversationModel(callerId) : null) ?? settings.get().defaultModel;
    let entry: ModelEntry | undefined;
    if (wanted) entry = (await providers.findModel(wanted)) ?? undefined;
    if (!entry || entry.capabilities.embedding || !entry.capabilities.tools) {
      const models = (await providers.listModels(true)).filter((m) => !m.capabilities.embedding && m.capabilities.tools);
      entry = models.find((m) => m.loaded) ?? models[0] ?? entry;
    }
    if (!entry) throw new ModuleCallError('No model that supports tool calling is available, so the work cannot be delegated.');
    return entry.ref;
  }

  private conversationModel(conversationId: string): ModelRef | null {
    try {
      return chat.getConversation(conversationId).conversation.model ?? null;
    } catch {
      return null;
    }
  }

  private async startConversation(module: ModuleId, action: string, options: CallOptions, send: (model: ModelRef) => Promise<{ conversationId: string }>): Promise<ModuleResult> {
    const model = await this.pickModel(options.conversationId);
    const { conversationId } = await send(model);
    const job: Job = { id: newId(), module, action, state: 'running', conversationId, callerId: options.conversationId, startedAt: Date.now() };
    this.jobs.set(job.id, job);
    this.byConversation.set(conversationId, job.id);
    // Keep the map small: an hour of finished jobs is plenty for polling.
    for (const [id, old] of this.jobs) if (old.finishedAt && Date.now() - old.finishedAt > 60 * 60_000) this.jobs.delete(id);
    return {
      status: 'success',
      result: { task_id: job.id, state: 'running', conversation_id: conversationId },
      stdout: `Started ${module} ${action}. It runs in its own conversation, which the user can watch. Poll with call("${module}", { "action": "status", "params": { "task_id": "${job.id}" } }).`,
    };
  }

  private jobStatus(taskId: string): ModuleResult {
    const job = this.jobs.get(taskId);
    if (!job) return { status: 'error', result: null, stdout: `There is no delegated task ${taskId}.` };
    const answer = job.state === 'done' ? this.finalText(job.conversationId) : '';
    return {
      status: 'success',
      result: {
        task_id: job.id,
        module: job.module,
        action: job.action,
        state: job.state,
        conversation_id: job.conversationId,
        elapsed_ms: (job.finishedAt ?? Date.now()) - job.startedAt,
        error: job.error,
        answer: answer || undefined,
      },
      stdout:
        job.state === 'running'
          ? `Still working (${Math.round((Date.now() - job.startedAt) / 1000)}s so far). Poll again in a little while.`
          : job.state === 'done'
            ? answer || 'Finished.'
            : job.state === 'stopped'
              ? 'The delegated work was stopped.'
              : job.error ?? 'The delegated work failed.',
    };
  }

  private cancel(taskId: string): ModuleResult {
    const job = this.jobs.get(taskId);
    if (!job) return { status: 'error', result: null, stdout: `There is no delegated task ${taskId}.` };
    chat.stopConversation(job.conversationId);
    return { status: 'success', result: { task_id: job.id, state: 'stopped' }, stdout: 'Asked the delegated work to stop.' };
  }

  private finalText(conversationId: string): string {
    try {
      const { conversation, messages } = chat.getConversation(conversationId);
      const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.content.trim());
      return last ? `${conversation.title ? `${conversation.title}\n\n` : ''}${last.content.trim()}` : '';
    } catch {
      return '';
    }
  }

  /** Delegated exports land in the chat's own folder rather than anywhere the model names. */
  private async exportPath(name: string): Promise<string> {
    const dir = join(paths().cellarHome, 'chat', 'exports');
    await mkdir(dir, { recursive: true });
    return join(dir, basename(name));
  }

  /** Test seam. */
  reset(): void {
    this.jobs.clear();
    this.byConversation.clear();
    this.calls.clear();
  }
}

export const modules = new ModuleRegistry();
