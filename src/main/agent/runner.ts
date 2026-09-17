import { randomBytes } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { codePermissionMode } from '@shared/code-commands';
import { branchPath } from '@shared/message-tree';
import type { AgentPart, ApprovalDecision, ApprovalRequest, ConversationKind, PermissionMode, ReasoningPart, TaskStartOptions, TaskState, TextPart, ToolPart } from '@shared/types/agent';
import type { CodeMode } from '@shared/types/code';
import type { ChatStreamEvent, GenerationStats, Message, ThinkingLevel } from '@shared/types/chat';
import { DEFAULT_INFERENCE_PARAMS, type InferenceParams, type LoadConfig, type ModelEntry } from '@shared/types/models';
import { attachmentFromBytes } from '../chat/attachments';
import { estimateTokens } from '../chat/context-window';
import { buildSystemPrompt, supportsArtifactInstructions } from '../chat/prompts';
import { problemsAfterChange } from '../code/diagnostics';
import { buildCodePrompt } from '../code/prompt';
import { loadProjectMemory, loadUserMemory } from '../code/session';
import { snapshotBeforeChange } from '../code/snapshots';
import { assistantContext } from '../customize/context';
import { buildDesignPrompt } from '../design/prompt';
import { getDesign } from '../design/store';
import { designToolsFor } from '../design/tools';
import { buildMathPrompt } from '../math/prompt';
import { getBoard } from '../math/store';
import { MATH_TOOLS } from '../math/tools';
import type { ChatStore } from '../db/chat-store';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage, throttle } from '../lib/util';
import { getPreset } from '../models/presets';
import { providers } from '../providers/registry';
import type { Provider, ProviderMessage, ToolSchema } from '../providers/types';
import { saveArtifactsFromMessage } from '../services/artifacts';
import { getProject, projectKnowledge } from '../services/projects';
import { settings } from '../services/settings';
import { paths } from '../system/paths';
import { pdfAvailable } from './documents';
import { buildTaskHistory, historyTokens, transcriptForSummary, type ToolProtocol } from './history';
import { buildAgentPrompt, COMPACTION_SYSTEM, compactionRequest, CONTINUE_NUDGE } from './prompt';
import { agentPowerShell } from './shell';
import { parseLooseJson, parseTextToolCall, TEXT_PROTOCOL_STOPS, textProtocolInstructions, ToolCallTagSplitter } from './text-protocol';
import { ALL_TOOLS, ASSISTANT_TOOLS, chatBaseTools, codeToolsFor, extraTools, findTool, normalizeArgs, toolsFor, toolSchema, type AgentTool, type ToolContext } from './tools';
import { ToolError } from './tools/types';
import { extractUrls } from './tools/web';
import { PathAccessError, Workspace } from './workspace';

const log = logger('cowork');

/** Tool results in live stream events are shortened; the full text stays in main. */
const LIVE_RESULT_CHARS = 1500;
/** Output kept while a command runs (its tail is shown live). */
const LIVE_OUTPUT_CHARS = 8000;
const MAX_IDENTICAL_CALLS = 3;

/** Raised when the model repeats one call too many times; caught in `loop()` as a resumable pause, not a hard failure. */
class RepeatedCallLimitError extends Error {}
/** Model calls per chat turn: chats use tools for lookups, not long projects. */
export const CHAT_MAX_STEPS = 16;
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Nine alphanumeric characters: the strictest format chat templates expect (Mistral). */
export function newToolCallId(): string {
  return [...randomBytes(9)].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

export function joinText(parts: AgentPart[]): string {
  return parts
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

function joinReasoning(parts: AgentPart[]): string {
  return parts
    .filter((p): p is ReasoningPart => p.type === 'reasoning')
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

/** Host of a URL a tool asked about; browse_open accepts bare hostnames, so add the scheme first. */
function hostOf(raw: string): string | null {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
}

/**
 * 'auto' approval mode: reviews one pending tool call (opening a page, editing a file, running a
 * command, calling a connector, …) with a fresh, single-turn call to the same model — no
 * conversation history, so it can't be talked into approving by the same context that led the
 * acting call astray. Denies by default if the reviewer can't be reached.
 */
async function autoApproveAction(provider: Provider, entry: ModelEntry, load: LoadConfig, request: ApprovalRequest): Promise<{ allow: boolean; note?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('auto-approval timeout')), 20_000);
  let verdict = '';
  try {
    for await (const event of provider.chat({
      entry,
      messages: [
        {
          role: 'system',
          content:
            'You are a fast, strict safety reviewer for a single automated action another AI assistant wants to take — opening a web page, filling a field, editing a file, running a shell/PowerShell command, or calling a connector. You see only this one action, nothing else about the task it is part of. Reply with ALLOW or DENY on the first line, then a short reason on the next line. DENY anything that touches money or purchases, account or security settings, credentials, deleting or overwriting something irreplaceable, installing or removing software, changing system settings, sending something on the user\'s behalf, or signing into/out of an account — unless it is unmistakably low-risk (reading, searching, listing, a harmless edit or command clearly scoped to the task). When unsure, DENY.',
        },
        {
          role: 'user',
          content: `Action (${request.kind}): ${request.title}${request.url ? `\nURL: ${request.url}` : ''}${request.path ? `\nPath: ${request.path}` : ''}${request.preview ? `\nDetails:\n${request.preview.slice(0, 1500)}` : ''}`,
        },
      ],
      params: { ...DEFAULT_INFERENCE_PARAMS, temperature: 0, maxTokens: 60 },
      thinking: 'off',
      load,
      signal: controller.signal,
      onStatus: () => undefined,
    })) {
      if (event.type === 'text') verdict += event.delta;
    }
  } catch (err) {
    log.warn('auto-approval could not reach the model; denying', errorMessage(err));
    return { allow: false, note: 'The automatic reviewer could not be reached, so the action was denied.' };
  } finally {
    clearTimeout(timer);
  }
  return { allow: /^\s*ALLOW/i.test(verdict), note: verdict.split('\n').slice(1).join(' ').trim().slice(0, 300) || undefined };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** How notifications and messages name a conversation's agent work. */
function agentNoun(kind: ConversationKind | undefined): { fallback: string; settings: string; mode: string } {
  if (kind === 'chat') return { fallback: 'A chat', settings: '', mode: 'This chat' };
  if (kind === 'design') return { fallback: 'A design', settings: 'Settings → Cowork', mode: 'Design' };
  if (kind === 'math') return { fallback: 'A board', settings: 'Settings → Cowork', mode: 'Math' };
  return kind === 'code' ? { fallback: 'A Code session', settings: 'Settings → Code', mode: 'Code' } : { fallback: 'A Cowork task', settings: 'Settings → Cowork', mode: 'Cowork' };
}

/** Chats that use tools run through the agent loop with this throwaway task state. */
async function chatTaskState(): Promise<TaskState> {
  const workDir = join(paths().cellarHome, 'chat');
  await mkdir(workDir, { recursive: true });
  return { folder: null, workDir, permissionMode: 'ask', status: 'running', todos: [], files: [], sources: [], allowCommands: false, allowedDomains: [], steps: 0, maxSteps: CHAT_MAX_STEPS };
}

export interface TaskRunInput {
  store: ChatStore;
  conversationId: string;
  assistant: Message;
  entry: ModelEntry;
  thinking: ThinkingLevel;
}

export interface TaskRunnerHooks {
  onFinished?: (input: TaskRunInput, result: { status: 'complete' | 'stopped' | 'error'; text: string }) => void;
}

interface LiveRun {
  controller: AbortController;
  /** A chat turn with tools: no task state is saved and no task notifications are sent. */
  chat: boolean;
  store: ChatStore;
  conversationId: string;
  messageId: string;
  parts: AgentPart[];
  task: TaskState;
  state: ChatStreamEvent;
  approvals: Map<string, (decision: ApprovalDecision) => void>;
  emit: (() => void) & { flush: () => void };
}

interface RoundOptions {
  provider: Provider;
  entry: ModelEntry;
  thinking: ThinkingLevel;
  load: LoadConfig;
  params: InferenceParams;
  tools?: ToolSchema[];
  messages: ProviderMessage[];
  round: number;
  stats: GenerationStats;
  onToken: () => void;
}

export class TaskRunner {
  private runs = new Map<string, LiveRun>();

  constructor(private readonly hooks: TaskRunnerHooks = {}) {}

  /** Initial task state; creates a scratch folder when the user skipped choosing one. */
  async prepare(conversationId: string, options: TaskStartOptions): Promise<TaskState> {
    let workDir: string;
    if (options.folder) {
      const info = await stat(options.folder).catch(() => null);
      if (!info?.isDirectory()) throw new Error(`The folder ${options.folder} does not exist.`);
      workDir = options.folder;
      const recent = settings.get().recentFolders.filter((f) => f.toLowerCase() !== options.folder!.toLowerCase());
      settings.update({ recentFolders: [options.folder, ...recent] });
    } else {
      const day = new Date().toISOString().slice(0, 10);
      workDir = join(paths().cellarHome, 'tasks', `${day}-${conversationId.slice(0, 8)}`);
      await mkdir(workDir, { recursive: true });
    }
    return {
      folder: options.folder,
      workDir,
      permissionMode: options.permissionMode,
      status: 'running',
      todos: [],
      files: [],
      sources: [],
      allowCommands: !!options.allowCommands,
      allowedDomains: [],
      steps: 0,
      maxSteps: settings.get().coworkMaxSteps,
    };
  }

  activeStreams(): ChatStreamEvent[] {
    return [...this.runs.values()].map((run) => this.snapshot(run));
  }

  isRunningIn(conversationId: string): boolean {
    return [...this.runs.values()].some((r) => r.conversationId === conversationId);
  }

  /** Current parts and text of a running turn, for reads while it streams. */
  liveMessage(messageId: string): Pick<Message, 'content' | 'parts'> | undefined {
    const run = this.runs.get(messageId);
    return run ? { content: joinText(run.parts), parts: run.parts } : undefined;
  }

  liveTask(conversationId: string): TaskState | undefined {
    return [...this.runs.values()].find((r) => r.conversationId === conversationId && !r.chat)?.task;
  }

  stop(messageId: string): void {
    this.runs.get(messageId)?.controller.abort(new Error('Stopped by user'));
  }

  stopConversation(conversationId: string): void {
    for (const run of this.runs.values()) if (run.conversationId === conversationId) run.controller.abort(new Error('Stopped'));
  }

  stopAll(): void {
    for (const run of this.runs.values()) run.controller.abort(new Error('Application closing'));
  }

  approve(messageId: string, toolCallId: string, decision: ApprovalDecision): void {
    const run = this.runs.get(messageId);
    const resolve = run?.approvals.get(toolCallId);
    if (!run || !resolve) throw new Error('This request is no longer waiting for approval.');
    run.approvals.delete(toolCallId);
    resolve(decision);
  }

  /** Change a task's state, live when it is running (the next model step sees it) or in storage. */
  private updateTask(store: ChatStore, conversationId: string, change: (task: TaskState) => void): void {
    const run = [...this.runs.values()].find((r) => r.conversationId === conversationId);
    if (run) {
      change(run.task);
      run.store.updateConversation(conversationId, { task: run.task });
      run.emit();
    } else {
      const conversation = store.getConversation(conversationId);
      if (!conversation?.task) throw new Error('Task not found');
      const task = structuredClone(conversation.task);
      change(task);
      store.updateConversation(conversationId, { task });
    }
    bus.emit('chat:changed', { conversationId });
  }

  setPermissionMode(store: ChatStore, conversationId: string, mode: PermissionMode): void {
    // Deliberately not the default for new tasks: loosening one task should not loosen the next.
    this.updateTask(store, conversationId, (task) => {
      if (task.code) throw new Error('Use the Code mode menu for Code sessions.');
      task.permissionMode = mode;
    });
  }

  setCodeMode(store: ChatStore, conversationId: string, mode: CodeMode, autoAcceptEdits: boolean): void {
    this.updateTask(store, conversationId, (task) => {
      if (!task.code) throw new Error('This is not a Code session.');
      task.code = { ...task.code, mode };
      task.permissionMode = codePermissionMode(mode, autoAcceptEdits);
    });
  }

  toolResult(store: ChatStore, messageId: string, toolCallId: string): string {
    const parts = this.runs.get(messageId)?.parts ?? store.getMessage(messageId)?.parts ?? [];
    const call = parts.find((p): p is ToolPart => p.type === 'tool' && p.id === toolCallId);
    if (!call) throw new Error('Step not found');
    return call.result ?? call.error ?? '';
  }

  private snapshot(run: LiveRun): ChatStreamEvent {
    return {
      ...run.state,
      content: joinText(run.parts),
      reasoning: '',
      parts: run.parts.map((p) => {
        if (p.type !== 'tool' || !p.result || p.result.length <= LIVE_RESULT_CHARS) return { ...p };
        // A running command shows its latest output; finished steps show the start.
        const result = p.status === 'running' ? p.result.slice(-LIVE_RESULT_CHARS) : p.result.slice(0, LIVE_RESULT_CHARS);
        return { ...p, result, resultTruncated: true };
      }),
      task: { ...run.task },
    };
  }

  private persist(run: LiveRun): void {
    run.store.updateMessage(run.messageId, { parts: run.parts, content: joinText(run.parts) });
    if (!run.chat) run.store.updateConversation(run.conversationId, { task: run.task });
  }

  async run(input: TaskRunInput): Promise<void> {
    const { store, conversationId, assistant } = input;
    const conversation = store.getConversation(conversationId);
    const chat = conversation?.kind === 'chat';
    if (!conversation || (!chat && !conversation.task)) throw new Error('Task not found');
    const app = settings.get();
    const task: TaskState = chat ? await chatTaskState() : { ...conversation.task!, status: 'running', steps: 0, maxSteps: conversation.task!.code ? app.codeMaxSteps : app.coworkMaxSteps };
    const run: LiveRun = {
      controller: new AbortController(),
      chat,
      store,
      conversationId,
      messageId: assistant.id,
      parts: [],
      task,
      approvals: new Map(),
      state: { conversationId, messageId: assistant.id, content: '', reasoning: '', status: 'streaming' },
      emit: undefined as unknown as LiveRun['emit'],
    };
    run.emit = throttle(() => bus.emit('chat:stream', this.snapshot(run)), 80);
    this.runs.set(assistant.id, run);
    if (!chat) store.updateConversation(conversationId, { task });
    bus.emit('chat:changed', { conversationId });

    const stats: GenerationStats = {};
    const startedAt = Date.now();
    let firstToken: number | undefined;
    let status: 'complete' | 'stopped' | 'error' = 'complete';
    try {
      await this.loop(run, input, stats, () => {
        firstToken ??= Date.now();
      });
    } catch (err) {
      if (run.controller.signal.aborted) {
        status = 'stopped';
      } else {
        status = 'error';
        run.state.error = errorMessage(err);
        log.error('task failed', input.entry.ref, errorMessage(err));
      }
    } finally {
      this.finish(run, input, status, stats, startedAt, firstToken);
    }
  }

  private async loop(run: LiveRun, input: TaskRunInput, stats: GenerationStats, onToken: () => void): Promise<void> {
    const { store, conversationId, assistant, entry, thinking } = input;
    const { task, parts } = run;
    const signal = run.controller.signal;
    const conversation = store.getConversation(conversationId)!;
    const app = settings.get();
    const workspace = await Workspace.open(task.workDir);
    const preset = getPreset(entry.ref, entry.contextLength);
    const params: InferenceParams = { ...preset.inference, ...conversation.settings.inference, stop: conversation.settings.inference?.stop ?? preset.inference.stop };
    const provider = providers.get(entry.ref.providerId);
    const protocol: ToolProtocol = entry.capabilities.tools ? 'native' : 'text';
    const contextLength = entry.loadedContextLength ?? (typeof preset.load.contextLength === 'number' ? preset.load.contextLength : entry.contextLength ?? 8192);
    const reserve = params.maxTokens ?? Math.min(4096, Math.floor(contextLength * 0.25));
    const budget = Math.max(1024, contextLength - reserve);

    const branch = branchPath(store.listMessages(conversationId), assistant.parentId);
    let projectName: string | undefined;
    let projectInstructions: string | undefined;
    let knowledge: string | undefined;
    if (conversation.projectId) {
      try {
        const project = getProject(conversation.projectId);
        projectName = project.name;
        projectInstructions = project.instructions;
        const lastUser = [...branch].reverse().find((m) => m.role === 'user');
        knowledge = await projectKnowledge(project.id, lastUser?.content ?? '', Math.min(6000, Math.floor(contextLength * 0.2)));
      } catch {
        // project deleted
      }
    }

    const knownUrls = new Set(task.sources.map((s) => s.url));
    for (const m of branch) if (m.role === 'user') for (const url of extractUrls(m.content)) knownUrls.add(url);
    const code = task.code;
    const powershell = agentPowerShell(app.terminalShell);
    const [memory, userMemory] = code ? await Promise.all([loadProjectMemory(workspace.root), loadUserMemory()]) : [undefined, undefined];
    const customize = await assistantContext({ settings: app, incognito: store.incognito, tools: true });
    const ctx: ToolContext = {
      workspace,
      task,
      settings: app,
      signal,
      maxResultChars: Math.round(Math.min(60_000, Math.max(3_000, contextLength * 0.3 * 3.2))),
      knownUrls,
      conversationId,
      incognito: store.incognito,
      shell: code ? powershell.exe : undefined,
      // Cowork tasks and Code sessions outside git keep the original so an edit can be undone;
      // git Code sessions already have that in the checkout's history.
      beforeChange: !code || !code.isGit ? (abs) => snapshotBeforeChange(conversationId, workspace.root, abs) : undefined,
      afterChange: run.chat || task.design || task.math ? undefined : (abs) => problemsAfterChange(abs, workspace.root),
      recordFile: (file) => {
        const path = workspace.relative(file.absolutePath);
        const previous = task.files.find((f) => f.path === path);
        const action = previous?.action === 'created' ? 'created' : file.action;
        task.files = [...task.files.filter((f) => f.path !== path), { ...file, path, action, updatedAt: Date.now() }];
      },
      recordSource: (source) => {
        if (task.sources.some((s) => s.url === source.url && s.kind === source.kind)) return;
        task.sources = [...task.sources, { ...source, at: Date.now() }].slice(-100);
      },
      setTodos: (todos) => {
        task.todos = todos;
      },
      approvalMode: app.approvalMode,
      autoApprove: (request) => autoApproveAction(provider, entry, preset.load, request),
    };

    const callCounts = new Map<string, number>();
    let round = 0;
    let nudged = false;
    let browserSteps = 0;
    for (;;) {
      if (signal.aborted) throw signal.reason;
      if (task.steps >= task.maxSteps) {
        const where = run.chat ? '' : `, or raise the step limit in ${agentNoun(conversation.kind).settings}`;
        parts.push({ type: 'text', round, text: `*Paused after ${task.maxSteps} steps. Reply "continue" to keep going${where}.*` });
        stats.stopReason = 'step-limit';
        return;
      }
      if (browserSteps >= app.browserMaxSteps) {
        parts.push({ type: 'text', round, text: `*Paused after ${app.browserMaxSteps} built-in-browser actions. Reply "continue" to keep going, or raise the limit in the tools menu.*` });
        stats.stopReason = 'browser-step-limit';
        return;
      }
      // Mode changes during a run apply from the next step.
      const baseTools = run.chat
        ? chatBaseTools(app)
        : task.math
          ? MATH_TOOLS
          : task.design
            ? designToolsFor(app)
            : task.code
              ? codeToolsFor(task.code.mode, task.permissionMode, app)
              : toolsFor(task.permissionMode, app, { pdf: pdfAvailable() });
      const extras = await extraTools({
        settings: app,
        skills: customize.skills.length > 0,
        incognito: store.incognito,
        readOnly: task.permissionMode === 'plan' && !run.chat,
        browser: !task.math && !task.design,
        reminders: !task.math && !task.design,
      });
      const tools = [...baseTools, ...extras];
      const schemas = tools.map(toolSchema);
      const customSystemPrompt = conversation.settings.inference?.systemPrompt ?? preset.inference.systemPrompt;
      const textProtocol = protocol === 'text' ? textProtocolInstructions(schemas) : undefined;
      const system = run.chat
        ? buildSystemPrompt({
            modelName: entry.displayName,
            userName: app.userName,
            preferences: app.personalPreferences,
            projectName,
            projectInstructions,
            projectKnowledge: knowledge,
            customSystemPrompt,
            artifacts: app.artifacts && supportsArtifactInstructions(entry),
            inlineVisualizations: app.inlineVisualizations && supportsArtifactInstructions(entry),
            inlineImages: app.inlineImages,
            toolNames: tools.map((t) => t.name),
            extraSections: customize.sections,
            textProtocol,
          })
        : task.math
        ? buildMathPrompt({
            modelName: entry.displayName,
            userName: app.userName,
            preferences: app.personalPreferences,
            board: getBoard(task.math.boardId),
            selection: task.math.selection,
            toolNames: tools.map((t) => t.name),
            customSystemPrompt,
            textProtocol,
            extraSections: customize.sections,
            outlineChars: Math.round(Math.min(16_000, Math.max(2_000, contextLength * 0.2 * 3.2))),
          })
        : task.design
        ? buildDesignPrompt({
            modelName: entry.displayName,
            userName: app.userName,
            preferences: app.personalPreferences,
            design: getDesign(task.design.designId),
            selection: task.design.selection,
            images: branch.filter((m) => m.role === 'user').flatMap((m) => m.attachments.filter((a) => a.kind === 'image').map((a) => ({ id: a.id, name: a.name }))),
            toolNames: tools.map((t) => t.name),
            customSystemPrompt,
            textProtocol,
            extraSections: customize.sections,
            outlineChars: Math.round(Math.min(16_000, Math.max(2_000, contextLength * 0.2 * 3.2))),
          })
        : task.code
        ? buildCodePrompt({
            modelName: entry.displayName,
            userName: app.userName,
            preferences: app.personalPreferences,
            workDir: workspace.root,
            code: task.code,
            permissionMode: task.permissionMode,
            allowCommands: task.allowCommands,
            toolNames: tools.map((t) => t.name),
            shell: powershell.edition,
            memory,
            userMemory,
            customSystemPrompt,
            textProtocol,
            extraSections: customize.sections,
          })
        : buildAgentPrompt({
            modelName: entry.displayName,
            userName: app.userName,
            preferences: app.personalPreferences,
            workDir: workspace.root,
            folderChosen: task.folder !== null,
            mode: task.permissionMode,
            toolNames: tools.map((t) => t.name),
            projectName,
            projectInstructions,
            projectKnowledge: knowledge,
            customSystemPrompt,
            textProtocol,
            extraSections: customize.sections,
          });
      const toolTokens = protocol === 'native' ? estimateTokens(JSON.stringify(schemas)) : 0;
      const history = await this.fitHistory(run, input, { system, protocol, budget: budget - toolTokens, contextLength, provider, load: preset.load, round });
      if (nudged) history.push({ role: 'user', content: CONTINUE_NUDGE });

      task.steps++;
      run.emit();
      const result = await this.streamRound(run, {
        provider,
        entry,
        thinking,
        load: preset.load,
        params: protocol === 'text' ? { ...params, stop: [...params.stop, ...TEXT_PROTOCOL_STOPS] } : params,
        tools: protocol === 'native' ? schemas : undefined,
        messages: [{ role: 'system', content: system }, ...history],
        round,
        stats,
        onToken,
      });

      if (result.calls.length === 0) {
        if (result.text.trim()) return;
        if (!nudged) {
          nudged = true;
          round++;
          continue;
        }
        if (!joinText(parts)) throw new Error('The model returned an empty response.');
        return;
      }
      nudged = false;
      for (const call of result.calls) {
        if (signal.aborted) throw signal.reason;
        try {
          await this.executeCall(run, call, tools, ctx, callCounts);
        } catch (err) {
          if (!(err instanceof RepeatedCallLimitError)) throw err;
          parts.push({ type: 'text', round, text: `*Paused: ${err.message}. Reply "continue" to let it keep trying, ideally after rephrasing the request, or switch to a larger model first.*` });
          stats.stopReason = 'repeated-calls';
          this.persist(run);
          run.emit();
          return;
        }
        if (call.category === 'browser') browserSteps++;
        this.persist(run);
        run.emit();
      }
      round++;
    }
  }

  private branchWithLive(run: LiveRun, input: TaskRunInput): Message[] {
    const messages = input.store.listMessages(input.conversationId);
    const current = messages.find((m) => m.id === input.assistant.id) ?? input.assistant;
    const branch = branchPath(messages, input.assistant.parentId);
    return [...branch, { ...current, parts: run.parts }];
  }

  private async fitHistory(
    run: LiveRun,
    input: TaskRunInput,
    o: { system: string; protocol: ToolProtocol; budget: number; contextLength: number; provider: Provider; load: LoadConfig; round: number },
  ): Promise<ProviderMessage[]> {
    const vision = input.entry.capabilities.vision;
    const systemTokens = estimateTokens(o.system) + 6;
    const fits = (messages: ProviderMessage[]) => systemTokens + historyTokens(messages) <= o.budget;

    let messages = await buildTaskHistory(this.branchWithLive(run, input), { protocol: o.protocol, vision, trimOldResults: false });
    if (fits(messages)) return messages;
    messages = await buildTaskHistory(this.branchWithLive(run, input), { protocol: o.protocol, vision, trimOldResults: true });
    if (fits(messages)) return messages;
    if (messages.length > 2) {
      await this.compact(run, input, o);
      messages = await buildTaskHistory(this.branchWithLive(run, input), { protocol: o.protocol, vision, trimOldResults: true });
      if (fits(messages)) return messages;
    }
    for (const limit of [4000, 1500, 600]) {
      messages = await buildTaskHistory(this.branchWithLive(run, input), { protocol: o.protocol, vision, trimOldResults: true, hardResultLimit: limit });
      if (fits(messages)) return messages;
    }
    const context = o.contextLength.toLocaleString('en-US');
    const firstStep = o.round === 0 && this.branchWithLive(run, input).filter((m) => m.role === 'user').length <= 1;
    if (run.chat) {
      throw new Error(
        firstStep
          ? `The chat's tools need more room than the model's ${context}-token context window. Raise the context length in Load settings, or turn off web search and connectors for chats.`
          : `This chat no longer fits the model's ${context}-token context window, even after shortening earlier tool results. Raise the context length in Load settings, or start a new chat.`,
      );
    }
    throw new Error(
      firstStep
        ? `${agentNoun(input.store.getConversation(input.conversationId)?.kind).mode} needs more room than the model's ${context}-token context window: the instructions and tools alone nearly fill it. Raise the context length in Load settings (16K or more works best).`
        : `This task no longer fits the model's ${context}-token context window, even after shortening earlier steps. Raise the context length in Load settings, or start a new task.`,
    );
  }

  /** Summarize everything before the current round so the agent can keep going in a full context. */
  private async compact(run: LiveRun, input: TaskRunInput, o: { contextLength: number; provider: Provider; load: LoadConfig; round: number }): Promise<void> {
    const transcript = transcriptForSummary(this.branchWithLive(run, input), input.assistant.id, o.round, Math.floor(o.contextLength * 0.5 * 3.2));
    run.state.statusMessage = 'Compacting the conversation to free up context…';
    run.emit();
    let summary = '';
    for await (const event of o.provider.chat({
      entry: input.entry,
      messages: [
        { role: 'system', content: COMPACTION_SYSTEM },
        { role: 'user', content: compactionRequest(transcript) },
      ],
      params: { ...DEFAULT_INFERENCE_PARAMS, temperature: 0.2, maxTokens: 1200 },
      thinking: 'off',
      load: o.load,
      signal: run.controller.signal,
      onStatus: () => undefined,
    })) {
      if (event.type === 'text') summary += event.delta;
      if (event.type === 'error') throw new Error(event.message);
    }
    summary = summary.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    run.state.statusMessage = undefined;
    if (!summary) throw new Error('The context window is full and the model could not summarize the work so far.');
    run.parts.push({ type: 'compaction', round: o.round, summary, compactedRounds: o.round });
    this.persist(run);
    run.emit();
  }

  private async streamRound(run: LiveRun, o: RoundOptions): Promise<{ text: string; calls: ToolPart[] }> {
    const { parts } = run;
    const splitter = new ToolCallTagSplitter();
    const nativeCalls = new Map<string, ToolPart>();
    const textCalls: string[] = [];
    let text: TextPart | undefined;
    let reasoning: ReasoningPart | undefined;
    let reasoningStarted = 0;
    const round: GenerationStats = {};

    const addText = (delta: string) => {
      if (!text) {
        if (!delta.trim()) return;
        text = { type: 'text', round: o.round, text: '' };
        parts.push(text);
        delta = delta.replace(/^\s+/, '');
      }
      text.text += delta;
    };
    const endReasoning = () => {
      if (reasoning && reasoning.durationMs === undefined) reasoning.durationMs = Date.now() - reasoningStarted;
    };

    run.state.status = 'streaming';
    for await (const event of o.provider.chat({
      entry: o.entry,
      messages: o.messages,
      params: o.params,
      thinking: o.thinking,
      load: o.load,
      tools: o.tools,
      signal: run.controller.signal,
      onStatus: (message) => {
        run.state.status = message ? 'loading-model' : 'streaming';
        run.state.statusMessage = message || undefined;
        run.emit();
      },
    })) {
      if ((run.state.status as ChatStreamEvent['status']) === 'loading-model' && event.type !== 'status') {
        run.state.status = 'streaming';
        run.state.statusMessage = undefined;
      }
      switch (event.type) {
        case 'text':
          o.onToken();
          for (const piece of splitter.push(event.delta)) {
            if (piece.type === 'text') addText(piece.delta);
            else textCalls.push(piece.raw);
          }
          if (text) endReasoning();
          break;
        case 'reasoning':
          o.onToken();
          if (!reasoning) {
            reasoning = { type: 'reasoning', round: o.round, text: '' };
            reasoningStarted = Date.now();
            parts.push(reasoning);
          }
          reasoning.text += event.delta;
          break;
        case 'tool_call': {
          o.onToken();
          endReasoning();
          let call = nativeCalls.get(event.id);
          if (!call) {
            call = { type: 'tool', id: newToolCallId(), round: o.round, name: event.name, argsText: '', status: 'streaming' };
            nativeCalls.set(event.id, call);
            parts.push(call);
          }
          if (!call.name && event.name) call.name = event.name;
          call.argsText += event.argumentsDelta;
          break;
        }
        case 'usage':
          if (event.promptTokens) round.promptTokens = event.promptTokens;
          if (event.completionTokens) round.completionTokens = event.completionTokens;
          break;
        case 'stats':
          Object.assign(round, Object.fromEntries(Object.entries(event.stats).filter(([, v]) => v !== undefined)));
          break;
        case 'done':
          o.stats.stopReason = event.stopReason;
          break;
        case 'error':
          throw new Error(event.message);
        case 'status':
          run.state.statusMessage = event.message;
          break;
      }
      run.emit();
    }
    for (const piece of splitter.flush()) {
      if (piece.type === 'text') addText(piece.delta);
      else textCalls.push(piece.raw);
    }
    endReasoning();
    if (text) text.text = text.text.replace(/\s+$/, '');

    if (round.promptTokens) o.stats.promptTokens = round.promptTokens;
    o.stats.completionTokens = (o.stats.completionTokens ?? 0) + (round.completionTokens ?? estimateTokens((text?.text ?? '') + (reasoning?.text ?? '')));
    if (round.tokensPerSecond) o.stats.tokensPerSecond = round.tokensPerSecond;
    if (o.stats.ttftMs === undefined && round.ttftMs !== undefined) o.stats.ttftMs = round.ttftMs;

    let calls = [...nativeCalls.values()];
    for (const call of calls) {
      if (!call.argsText.trim()) {
        call.args = {};
        continue;
      }
      try {
        let value = parseLooseJson(call.argsText);
        if (typeof value === 'string') value = parseLooseJson(value);
        if (value && typeof value === 'object' && !Array.isArray(value)) call.args = value as Record<string, unknown>;
        else call.error = 'Tool arguments must be a JSON object.';
      } catch (err) {
        call.error = `The tool arguments are not valid JSON (${errorMessage(err)}).`;
      }
    }
    // Servers that do not parse a model's tool-call format leave the calls in the text.
    if (calls.length === 0 && textCalls.length) {
      calls = textCalls.map((raw) => {
        const parsed = parseTextToolCall(raw);
        const call: ToolPart = parsed
          ? { type: 'tool', id: newToolCallId(), round: o.round, name: parsed.name, argsText: JSON.stringify(parsed.arguments), args: parsed.arguments, status: 'streaming' }
          : {
              type: 'tool',
              id: newToolCallId(),
              round: o.round,
              name: 'invalid_tool_call',
              argsText: raw.trim().slice(0, 2000),
              status: 'streaming',
              error: 'The tool call could not be read. Write it as valid JSON: {"name": "tool_name", "arguments": {...}}',
            };
        parts.push(call);
        return call;
      });
    }
    return { text: text?.text ?? '', calls };
  }

  private async executeCall(run: LiveRun, call: ToolPart, tools: AgentTool[], ctx: ToolContext, counts: Map<string, number>): Promise<void> {
    const { task } = run;
    const signal = run.controller.signal;
    call.startedAt = Date.now();
    const fail = (message: string) => {
      call.status = 'error';
      call.error = message;
      call.result = `Error: ${message}`;
      call.finishedAt = Date.now();
    };
    if (call.error) return fail(call.error);

    const tool = findTool(tools, call.name);
    if (!tool) {
      const known = findTool(run.chat ? [] : ALL_TOOLS, call.name) ?? findTool(ASSISTANT_TOOLS, call.name);
      if (known && !run.chat && task.permissionMode === 'plan' && (known.category === 'edit' || known.category === 'command')) {
        if (task.code?.mode === 'ask') return fail(`${known.name} is not available in Ask mode. Answer from what the read-only tools show; the user can switch to Code mode for changes.`);
        return fail(`${known.name} is not available in plan mode. Investigate with the read-only tools and finish with a plan.`);
      }
      if (known?.category === 'browser') return fail('The built-in browser is turned off. The user can switch it on from the tools menu in the composer, or Settings → Capabilities.');
      if (findTool(ALL_TOOLS, call.name)?.category === 'web') return fail(run.chat ? 'Web search is turned off for chats (use the tools menu in the composer).' : 'Web access is turned off in Settings → Cowork.');
      if (known?.category === 'memory') return fail(run.store.incognito ? 'Nothing is remembered in incognito chats.' : 'Memory is turned off in Customize → Memory.');
      return fail(`There is no tool named "${call.name}". Available tools: ${tools.map((t) => t.name).join(', ')}.`);
    }
    call.name = tool.name;
    call.category = tool.category;
    if (tool.connector) call.connector = tool.connector;
    const parsed = tool.input.safeParse(normalizeArgs(tool, call.args ?? {}));
    if (!parsed.success) return fail(`Invalid arguments for ${tool.name}:\n${z.prettifyError(parsed.error)}`);
    const args = parsed.data;
    call.args = args as Record<string, unknown>;

    const key = `${tool.name}:${stableJson(args)}`;
    const repeats = counts.get(key) ?? 0;
    counts.set(key, repeats + 1);
    if (repeats >= MAX_IDENTICAL_CALLS && ctx.settings.pauseOnRepeatedCalls) {
      call.status = 'cancelled';
      call.finishedAt = Date.now();
      throw new RepeatedCallLimitError(`the model repeated the same ${tool.name} call ${MAX_IDENTICAL_CALLS + 1} times in a row`);
    }

    try {
      const request = tool.approval ? await tool.approval(args, ctx) : null;
      const mode = ctx.approvalMode ?? 'manual';
      const needsApprovalBase =
        !!request &&
        (tool.category === 'web' ||
          tool.category === 'browser' ||
          tool.category === 'connector' ||
          (tool.category === 'edit' && task.permissionMode !== 'auto-edits') ||
          (tool.category === 'command' && !task.allowCommands));
      const needsApproval = needsApprovalBase && mode !== 'bypass';
      if (request && needsApproval && mode === 'auto' && ctx.autoApprove) {
        call.approval = request;
        const verdict = await ctx.autoApprove(request);
        if (!verdict.allow) {
          call.status = 'denied';
          call.feedback = verdict.note;
          call.result = `An automatic reviewer denied this action.${verdict.note ? ` Reason: "${verdict.note}"` : ''} Do not retry it; continue another way or ask the user.`;
          call.finishedAt = Date.now();
          return;
        }
      } else if (request && needsApproval) {
        call.approval = request;
        call.status = 'awaiting-approval';
        const decision = await this.waitForApproval(run, call);
        if (decision.action === 'deny') {
          call.status = 'denied';
          call.feedback = decision.feedback?.trim() || undefined;
          call.result = `The user denied this action.${call.feedback ? ` Their note: "${call.feedback}"` : ''} Do not retry it; continue another way or ask the user.`;
          call.finishedAt = Date.now();
          return;
        }
        if (decision.action === 'allow-all') {
          if (tool.category === 'edit' && task.permissionMode === 'ask') task.permissionMode = 'auto-edits';
          if (tool.category === 'command') task.allowCommands = true;
          if ((tool.category === 'web' || tool.category === 'browser') && request.url) {
            const host = hostOf(request.url);
            if (host && !task.allowedDomains.includes(host)) task.allowedDomains = [...task.allowedDomains, host];
          }
          if (tool.category === 'connector') await tool.onAllowAll?.();
        }
      }
      call.status = 'running';
      // Time the work itself, not the wait for approval.
      call.startedAt = Date.now();
      run.emit();
      const output = await tool.run(args, {
        ...ctx,
        onOutput: (text) => {
          if (call.status !== 'running') return;
          call.result = text.length > LIVE_OUTPUT_CHARS ? text.slice(-LIVE_OUTPUT_CHARS) : text;
          run.emit();
        },
        recordResultImages: async (images) => {
          const refs = await Promise.all(images.map((img, i) => attachmentFromBytes(`${tool.name}-${i + 1}.${img.mime.split('/')[1] ?? 'png'}`, img.mime, Buffer.from(img.base64, 'base64'))));
          call.resultImages = [...(call.resultImages ?? []), ...refs.map((r) => r.id)];
        },
      });
      call.result = repeats > 0 ? `${output}\n\n[You already made this exact call earlier in this task. Use the result you have and move on to the next step.]` : output;
      call.status = 'done';
      call.finishedAt = Date.now();
      // After a change, reading or listing again is legitimate (for example to check the edit).
      if (tool.category === 'edit' || tool.category === 'command' || tool.category === 'design' || tool.category === 'math') counts.clear();
    } catch (err) {
      if (signal.aborted) {
        call.status = 'cancelled';
        call.finishedAt = Date.now();
        throw signal.reason ?? err;
      }
      if (!(err instanceof ToolError) && !(err instanceof PathAccessError)) log.warn(`${tool.name} failed`, errorMessage(err));
      fail(errorMessage(err));
    }
  }

  private waitForApproval(run: LiveRun, call: ToolPart): Promise<ApprovalDecision> {
    const { task, store, conversationId } = run;
    const signal = run.controller.signal;
    task.status = 'waiting';
    this.persist(run);
    bus.emit('chat:changed', { conversationId });
    run.emit();
    run.emit.flush();
    const conversation = store.getConversation(conversationId);
    const title = conversation?.title || agentNoun(conversation?.kind).fallback;
    bus.emit('tasks:notify', { conversationId, conversationKind: conversation?.kind ?? 'task', kind: 'approval', title: `${title} needs your approval`, body: call.approval?.title ?? call.name });
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        run.approvals.delete(call.id);
        reject(signal.reason ?? new Error('Stopped'));
      };
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
      run.approvals.set(call.id, (decision) => {
        signal.removeEventListener('abort', onAbort);
        task.status = 'running';
        this.persist(run);
        bus.emit('chat:changed', { conversationId });
        resolve(decision);
      });
    });
  }

  private finish(run: LiveRun, input: TaskRunInput, status: 'complete' | 'stopped' | 'error', stats: GenerationStats, startedAt: number, firstToken?: number): void {
    const { store, conversationId, assistant } = input;
    this.runs.delete(assistant.id);
    for (const part of run.parts) {
      if (part.type === 'tool' && (part.status === 'streaming' || part.status === 'running' || part.status === 'awaiting-approval')) {
        part.status = 'cancelled';
        part.finishedAt ??= Date.now();
      }
    }
    const text = joinText(run.parts);
    const end = Date.now();
    const final: GenerationStats = { ...stats, totalMs: end - startedAt };
    if (final.ttftMs === undefined && firstToken) final.ttftMs = firstToken - startedAt;
    if (!final.tokensPerSecond && final.completionTokens && firstToken && end > firstToken) final.tokensPerSecond = final.completionTokens / ((end - firstToken) / 1000);
    if (status === 'stopped') final.stopReason = 'stopped';
    const resumableStop = final.stopReason === 'step-limit' || final.stopReason === 'repeated-calls' || final.stopReason === 'browser-step-limit';
    run.task.status = status === 'error' ? 'error' : status === 'stopped' || resumableStop ? 'stopped' : 'done';

    store.updateMessage(assistant.id, {
      parts: run.parts,
      content: text,
      reasoning: joinReasoning(run.parts) || undefined,
      stats: final,
      status,
      ...(status === 'error' ? { error: run.state.error ?? 'Something went wrong.' } : {}),
    });
    if (!run.chat) store.updateConversation(conversationId, { task: run.task });
    else store.updateConversation(conversationId, {});
    const saved = store.getMessage(assistant.id);
    if (saved) store.indexMessage(saved);
    if (status === 'complete' || (run.chat && status === 'stopped')) {
      const lastRound = Math.max(-1, ...run.parts.map((p) => p.round));
      // Chats keep artifacts from any round; agent work only from its final answer.
      const finalText = run.chat ? text : run.parts.filter((p): p is TextPart => p.type === 'text' && p.round === lastRound).map((p) => p.text).join('\n\n');
      try {
        if (finalText) saveArtifactsFromMessage(conversationId, assistant.id, finalText, store.incognito);
      } catch (err) {
        log.warn('artifact extraction failed', err);
      }
    }
    run.state = { ...run.state, status, stats: final, statusMessage: undefined };
    run.emit.flush();
    bus.emit('chat:stream', this.snapshot(run));
    bus.emit('chat:changed', { conversationId });

    const conversation = store.getConversation(conversationId);
    const conversationKind = conversation?.kind ?? 'task';
    const title = conversation?.title || (conversationKind === 'code' ? 'Your session' : 'Your task');
    if (run.chat) {
      // Chats are interactive: no "done" or "failed" notifications.
    } else if (status === 'complete') {
      bus.emit('tasks:notify', { conversationId, conversationKind, kind: 'done', title: `${title} is done`, body: text.split('\n').find((l) => l.trim())?.slice(0, 180) ?? 'The work is finished.' });
    } else if (status === 'error') {
      bus.emit('tasks:notify', { conversationId, conversationKind, kind: 'error', title: `${title} failed`, body: run.state.error ?? 'Something went wrong.' });
    }
    this.hooks.onFinished?.(input, { status, text });
  }
}
