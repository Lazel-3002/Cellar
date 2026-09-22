import { branchPath, latestLeaf } from '@shared/message-tree';
import type { ApprovalDecision, ConversationKind, PermissionMode } from '@shared/types/agent';
import type { CodeMode } from '@shared/types/code';
import type { DesignStartOptions } from '@shared/types/design';
import type { MathStartOptions } from '@shared/types/math';
import type {
  ChatStreamEvent,
  Conversation,
  ContextInfo,
  ConversationWithMessages,
  GenerationStats,
  Message,
  SendMessageInput,
  SendMessageResult,
  ThinkingLevel,
} from '@shared/types/chat';
import { DEFAULT_INFERENCE_PARAMS, type ModelEntry, type ModelRef } from '@shared/types/models';
import { TaskRunner } from '../agent/runner';
import { prepareCodeSession } from '../code/session';
import { prepareDesignSession } from '../design/session';
import { copyDesign, createDesign, designForConversation } from '../design/store';
import { prepareMathSession } from '../math/session';
import { boardForConversation, copyBoard, createBoard } from '../math/store';
import { connectors } from '../connectors/manager';
import { assistantContext } from '../customize/context';
import { activeSkills } from '../customize/skills';
import { MemoryChatStore, SqliteChatStore, type ChatStore } from '../db/chat-store';
import { run } from '../db/client';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage, newId, throttle } from '../lib/util';
import { getPreset } from '../models/presets';
import { providers } from '../providers/registry';
import type { ProviderMessage } from '../providers/types';
import { discardIncognitoArtifacts, saveArtifactsFromMessage } from '../services/artifacts';
import { getProject, projectKnowledge } from '../services/projects';
import { settings } from '../services/settings';
import { attachmentRefs, withAttachments } from './attachments';
import { estimateTokens, fitToContext } from './context-window';
import { buildSystemPrompt, chatToolGuidance, cleanTitle, fallbackTitle, supportsArtifactInstructions } from './prompts';

const log = logger('chat');

interface ActiveGeneration {
  controller: AbortController;
  state: ChatStreamEvent;
}

export interface TurnFinished {
  conversationId: string;
  messageId: string;
  status: 'complete' | 'stopped' | 'error';
  error?: string;
}

class ChatOrchestrator {
  private readonly memory = new MemoryChatStore();
  private readonly sqlite = new SqliteChatStore();
  private readonly active = new Map<string, ActiveGeneration>();
  private readonly finishedListeners = new Set<(event: TurnFinished) => void>();
  readonly tasks = new TaskRunner({
    onFinished: (input, result) => {
      if (result.status === 'complete' && input.assistant.parentId && settings.get().autoTitle && this.needsTitle.delete(input.conversationId)) {
        void this.autoTitle(input.store, input.conversationId, input.entry, input.assistant.parentId, result.text);
      }
      this.turnFinished({ conversationId: input.conversationId, messageId: input.assistant.id, status: result.status, error: input.store.getMessage(input.assistant.id)?.error });
    },
  });

  /** Called when any assistant turn (chat, task or session) ends. */
  onTurnFinished(listener: (event: TurnFinished) => void): () => void {
    this.finishedListeners.add(listener);
    return () => this.finishedListeners.delete(listener);
  }

  private turnFinished(event: TurnFinished): void {
    for (const listener of this.finishedListeners) {
      try {
        listener(event);
      } catch (err) {
        log.warn('turn listener failed', errorMessage(err));
      }
    }
  }
  /** Tasks whose first turn is still running and that should get a generated title. */
  private readonly needsTitle = new Set<string>();

  init(): void {
    run("UPDATE messages SET status = 'stopped' WHERE status = 'streaming'");
    run("UPDATE conversations SET task = json_set(task, '$.status', 'stopped') WHERE kind IN ('task', 'code', 'design', 'math') AND json_extract(task, '$.status') IN ('running', 'waiting')");
  }

  private store(conversationId: string): ChatStore {
    return this.memory.has(conversationId) ? this.memory : this.sqlite;
  }

  private notify(conversationId: string) {
    bus.emit('chat:changed', { conversationId });
  }

  getConversation(id: string): ConversationWithMessages {
    const store = this.store(id);
    const conversation = store.getConversation(id);
    if (!conversation) throw new Error('Conversation not found');
    const messages = store.listMessages(id).map((m) => {
      const live = this.active.get(m.id);
      if (live) return { ...m, content: live.state.content, reasoning: live.state.reasoning, status: 'streaming' as const };
      const task = this.tasks.liveMessage(m.id);
      return task ? { ...m, ...task, status: 'streaming' as const } : m;
    });
    const liveTask = this.tasks.liveTask(id);
    return { conversation: liveTask ? { ...conversation, task: liveTask } : conversation, messages };
  }

  activeStreams(): ChatStreamEvent[] {
    return [...[...this.active.values()].map((a) => ({ ...a.state })), ...this.tasks.activeStreams()];
  }

  private async resolveModel(ref: ModelRef): Promise<ModelEntry> {
    const entry = await providers.findModel(ref);
    if (!entry) throw new Error('The selected model is not available. Check that its app is running, or pick another model.');
    if (entry.capabilities.embedding) throw new Error(`${entry.displayName} is an embedding model and cannot chat.`);
    return entry;
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const content = input.content.trim();
    if (!content && input.attachmentIds.length === 0) throw new Error('Type a message first.');
    const entry = await this.resolveModel(input.model);

    let store: ChatStore = input.incognito ? this.memory : this.sqlite;
    let conversation: Conversation | undefined;
    if (input.conversationId) {
      store = this.store(input.conversationId);
      conversation = store.getConversation(input.conversationId);
    }
    const kind: ConversationKind = conversation ? conversation.kind : input.math ? 'math' : input.design ? 'design' : input.code ? 'code' : input.task ? 'task' : 'chat';
    const isTask = kind !== 'chat';
    if (isTask && store.incognito) {
      throw new Error(
        kind === 'code' ? 'Code sessions cannot be incognito.' : kind === 'design' ? 'Designs cannot be incognito.' : kind === 'math' ? 'Math boards cannot be incognito.' : 'Cowork tasks cannot run in an incognito chat.',
      );
    }
    if (conversation && isTask && this.tasks.isRunningIn(conversation.id)) {
      throw new Error(`This ${kind === 'code' ? 'session' : kind === 'design' ? 'design' : kind === 'math' ? 'board' : 'task'} is still working. Stop it or wait for it to finish first.`);
    }
    if (!conversation) {
      const id = newId();
      const task = input.math
        ? await prepareMathSession()
        : input.design
          ? await prepareDesignSession()
          : input.code
            ? await prepareCodeSession(id, input.code, content)
            : input.task
              ? await this.tasks.prepare(id, input.task)
              : undefined;
      const created = Date.now();
      conversation = {
        id,
        kind,
        title: input.title?.trim().slice(0, 120) ?? '',
        projectId: input.projectId ?? null,
        starred: false,
        currentLeafId: null,
        model: input.model,
        settings: { thinking: input.thinking },
        task,
        incognito: store.incognito,
        createdAt: created,
        updatedAt: created,
      };
      store.createConversation(conversation);
      if (input.design && task?.design) createDesign(id, input.design, task.design.designId);
      if (input.math && task?.math) createBoard(id, input.math, task.math.boardId);
    }
    if (kind === 'design' && input.designSelection !== undefined && conversation.task?.design) {
      const task = { ...conversation.task, design: { ...conversation.task.design, selection: input.designSelection ?? undefined } };
      store.updateConversation(conversation.id, { task });
      conversation = { ...conversation, task };
    }
    if (kind === 'math' && input.mathSelection !== undefined && conversation.task?.math) {
      const task = { ...conversation.task, math: { ...conversation.task.math, selection: input.mathSelection ?? undefined } };
      store.updateConversation(conversation.id, { task });
      conversation = { ...conversation, task };
    }
    const now = Date.now();

    const user: Message = {
      id: newId(),
      conversationId: conversation.id,
      parentId: conversation.currentLeafId,
      role: 'user',
      content,
      attachments: attachmentRefs(input.attachmentIds),
      status: 'complete',
      createdAt: now,
    };
    store.insertMessage(user);
    store.indexMessage(user);

    const assistant = this.newAssistant(conversation.id, user.id, entry, isTask);
    store.insertMessage(assistant);
    store.updateConversation(conversation.id, {
      currentLeafId: assistant.id,
      model: input.model,
      settings: { ...conversation.settings, thinking: input.thinking },
      ...(conversation.title
        ? {}
        : { title: fallbackTitle(content || user.attachments[0]?.name || (kind === 'code' ? 'New session' : kind === 'design' ? 'New design' : kind === 'math' ? 'New board' : isTask ? 'New task' : 'New chat')) }),
    });
    this.notify(conversation.id);
    if (isTask) {
      if (!conversation.title) this.needsTitle.add(conversation.id);
      void this.runTask(store, conversation.id, assistant, entry, input.thinking);
    } else {
      void this.generate(store, conversation.id, assistant, entry, input.thinking, !conversation.title);
    }
    return { conversationId: conversation.id, userMessageId: user.id, assistantMessageId: assistant.id };
  }

  private async runTask(store: ChatStore, conversationId: string, assistant: Message, entry: ModelEntry, thinking: ThinkingLevel): Promise<void> {
    try {
      await this.tasks.run({ store, conversationId, assistant, entry, thinking });
    } catch (err) {
      log.error('task could not start', err);
      store.updateMessage(assistant.id, { status: 'error', error: errorMessage(err), parts: [] });
      this.notify(conversationId);
      this.turnFinished({ conversationId, messageId: assistant.id, status: 'error', error: errorMessage(err) });
    }
  }

  /** A design with no messages yet (a blank canvas). */
  async createDesign(options: DesignStartOptions & { title?: string }): Promise<{ conversationId: string; designId: string }> {
    const id = newId();
    const task = await prepareDesignSession('done');
    const now = Date.now();
    this.sqlite.createConversation({
      id,
      kind: 'design',
      title: options.title?.trim().slice(0, 120) || 'Untitled design',
      projectId: null,
      starred: false,
      currentLeafId: null,
      settings: {},
      task,
      incognito: false,
      createdAt: now,
      updatedAt: now,
    });
    const design = createDesign(id, options, task.design!.designId);
    this.notify(id);
    return { conversationId: id, designId: design.id };
  }

  /** A copy of a design's canvas in a new conversation (without the chat). */
  async duplicateDesign(conversationId: string): Promise<{ conversationId: string }> {
    const source = designForConversation(conversationId);
    if (!source) throw new Error('Design not found');
    const id = newId();
    const task = await prepareDesignSession('done');
    const now = Date.now();
    this.sqlite.createConversation({ id, kind: 'design', title: `${source.title} (copy)`.slice(0, 120), projectId: null, starred: false, currentLeafId: null, settings: {}, task, incognito: false, createdAt: now, updatedAt: now });
    const copy = copyDesign(source.id, id, task.design!.designId);
    this.notify(id);
    return { conversationId: copy.conversationId };
  }

  /** A board with no messages yet (an empty page). */
  async createBoard(options: MathStartOptions & { title?: string }): Promise<{ conversationId: string; boardId: string }> {
    const id = newId();
    const task = await prepareMathSession('done');
    const now = Date.now();
    this.sqlite.createConversation({
      id,
      kind: 'math',
      title: options.title?.trim().slice(0, 120) || 'Untitled board',
      projectId: null,
      starred: false,
      currentLeafId: null,
      settings: {},
      task,
      incognito: false,
      createdAt: now,
      updatedAt: now,
    });
    const board = createBoard(id, options, task.math!.boardId);
    this.notify(id);
    return { conversationId: id, boardId: board.id };
  }

  /** A copy of a board in a new conversation (without the chat). */
  async duplicateBoard(conversationId: string): Promise<{ conversationId: string }> {
    const source = boardForConversation(conversationId);
    if (!source) throw new Error('Board not found');
    const id = newId();
    const task = await prepareMathSession('done');
    const now = Date.now();
    this.sqlite.createConversation({ id, kind: 'math', title: `${source.title} (copy)`.slice(0, 120), projectId: null, starred: false, currentLeafId: null, settings: {}, task, incognito: false, createdAt: now, updatedAt: now });
    const copy = copyBoard(source.id, id, task.math!.boardId);
    this.notify(id);
    return { conversationId: copy.conversationId };
  }

  conversationExists(conversationId: string): boolean {
    return !!this.store(conversationId).getConversation(conversationId);
  }

  /**
   * Append a note from Cellar itself to a conversation (a fired reminder). It is written as an
   * assistant message so it reads in place and stays in the branch the model sees next turn.
   */
  postNote(conversationId: string, text: string): Message {
    const store = this.store(conversationId);
    const conversation = store.getConversation(conversationId);
    if (!conversation) throw new Error('Conversation not found');
    const note: Message = {
      id: newId(),
      conversationId,
      parentId: conversation.currentLeafId,
      role: 'assistant',
      content: text.trim(),
      attachments: [],
      status: 'complete',
      createdAt: Date.now(),
    };
    store.insertMessage(note);
    store.indexMessage(note);
    store.updateConversation(conversationId, { currentLeafId: note.id });
    this.notify(conversationId);
    return note;
  }

  approve(messageId: string, toolCallId: string, decision: ApprovalDecision): void {
    this.tasks.approve(messageId, toolCallId, decision);
  }

  setTaskPermissionMode(conversationId: string, mode: PermissionMode): void {
    this.tasks.setPermissionMode(this.store(conversationId), conversationId, mode);
  }

  setCodeMode(conversationId: string, mode: CodeMode, autoAcceptEdits: boolean): void {
    this.tasks.setCodeMode(this.store(conversationId), conversationId, mode, autoAcceptEdits);
  }

  isRunning(conversationId: string): boolean {
    return this.tasks.isRunningIn(conversationId) || [...this.active.values()].some((a) => a.state.conversationId === conversationId);
  }

  /** Full output of a tool step (stream events carry a shortened copy). */
  toolResult(messageId: string, toolCallId: string): string {
    return this.tasks.toolResult(this.memory.getMessage(messageId) ? this.memory : this.sqlite, messageId, toolCallId);
  }

  /** The folder a task works in, for opening and saving its files. */
  taskWorkDir(conversationId: string): string {
    const task = this.tasks.liveTask(conversationId) ?? this.store(conversationId).getConversation(conversationId)?.task;
    if (!task) throw new Error('Task not found');
    return task.workDir;
  }

  stopConversation(conversationId: string): void {
    this.tasks.stopConversation(conversationId);
    for (const a of this.active.values()) if (a.state.conversationId === conversationId) a.controller.abort(new Error('Stopped'));
  }

  async regenerate(conversationId: string, assistantMessageId: string, model?: ModelRef, thinking?: ThinkingLevel): Promise<SendMessageResult> {
    const store = this.store(conversationId);
    const conversation = store.getConversation(conversationId);
    const previous = store.getMessage(assistantMessageId);
    if (!conversation || !previous || previous.role !== 'assistant' || !previous.parentId) throw new Error('Message not found');
    const ref = model ?? previous.model ?? conversation.model;
    if (!ref) throw new Error('Pick a model first.');
    const isTask = conversation.kind !== 'chat';
    if (isTask && this.tasks.isRunningIn(conversationId)) throw new Error('This task is still working. Stop it first.');
    const entry = await this.resolveModel({ providerId: ref.providerId, modelId: ref.modelId });
    const assistant = this.newAssistant(conversationId, previous.parentId, entry, isTask);
    store.insertMessage(assistant);
    const level = thinking ?? conversation.settings.thinking ?? 'on';
    store.updateConversation(conversationId, { currentLeafId: assistant.id, model: entry.ref, settings: { ...conversation.settings, thinking: level } });
    this.notify(conversationId);
    if (isTask) void this.runTask(store, conversationId, assistant, entry, level);
    else void this.generate(store, conversationId, assistant, entry, level, false);
    return { conversationId, userMessageId: previous.parentId, assistantMessageId: assistant.id };
  }

  async edit(conversationId: string, userMessageId: string, content: string, model: ModelRef, thinking: ThinkingLevel): Promise<SendMessageResult> {
    const store = this.store(conversationId);
    const conversation = store.getConversation(conversationId);
    const previous = store.getMessage(userMessageId);
    if (!conversation || !previous || previous.role !== 'user') throw new Error('Message not found');
    const isTask = conversation.kind !== 'chat';
    if (isTask && this.tasks.isRunningIn(conversationId)) throw new Error('This task is still working. Stop it first.');
    const entry = await this.resolveModel(model);
    const now = Date.now();
    const user: Message = { ...previous, id: newId(), content: content.trim(), createdAt: now, status: 'complete' };
    store.insertMessage(user);
    store.indexMessage(user);
    const assistant = this.newAssistant(conversationId, user.id, entry, isTask);
    store.insertMessage(assistant);
    store.updateConversation(conversationId, { currentLeafId: assistant.id, model, settings: { ...conversation.settings, thinking } });
    this.notify(conversationId);
    if (isTask) void this.runTask(store, conversationId, assistant, entry, thinking);
    else void this.generate(store, conversationId, assistant, entry, thinking, false);
    return { conversationId, userMessageId: user.id, assistantMessageId: assistant.id };
  }

  switchBranch(conversationId: string, messageId: string): ConversationWithMessages {
    const store = this.store(conversationId);
    const leaf = latestLeaf(store.listMessages(conversationId), messageId);
    store.updateConversation(conversationId, { currentLeafId: leaf });
    this.notify(conversationId);
    return this.getConversation(conversationId);
  }

  rename(conversationId: string, title: string): void {
    this.store(conversationId).updateConversation(conversationId, { title: title.trim().slice(0, 120) || 'Untitled' });
    this.notify(conversationId);
  }

  setStarred(conversationId: string, starred: boolean): void {
    this.store(conversationId).updateConversation(conversationId, { starred });
    this.notify(conversationId);
  }

  moveToProject(conversationId: string, projectId: string | null): void {
    this.store(conversationId).updateConversation(conversationId, { projectId });
    this.notify(conversationId);
    bus.emit('projects:changed', { projectId: projectId ?? undefined });
  }

  updateSettings(conversationId: string, next: Conversation['settings']): void {
    this.store(conversationId).updateConversation(conversationId, { settings: next });
  }

  stop(messageId: string): void {
    this.active.get(messageId)?.controller.abort(new Error('Stopped by user'));
    this.tasks.stop(messageId);
  }

  stopAll(): void {
    for (const a of this.active.values()) a.controller.abort(new Error('Application closing'));
    this.tasks.stopAll();
  }

  discardIncognito(conversationId: string): void {
    if (!this.memory.has(conversationId)) return;
    for (const m of this.memory.listMessages(conversationId)) this.stop(m.id);
    this.memory.discard(conversationId);
    discardIncognitoArtifacts(conversationId);
  }

  private newAssistant(conversationId: string, parentId: string, entry: ModelEntry, task = false): Message {
    return {
      id: newId(),
      conversationId,
      parentId,
      role: 'assistant',
      content: '',
      attachments: [],
      model: { ...entry.ref, displayName: entry.displayName },
      status: 'streaming',
      ...(task ? { parts: [] } : {}),
      createdAt: Date.now() + 1,
    };
  }

  private async buildMessages(store: ChatStore, conversation: Conversation, parentId: string, entry: ModelEntry): Promise<{ messages: ProviderMessage[]; system: string }> {
    const history = branchPath(store.listMessages(conversation.id), parentId).filter(
      (m) => m.role === 'user' || (m.role === 'assistant' && m.content.trim() && m.status !== 'error'),
    );
    const out: ProviderMessage[] = [];
    for (const m of history) {
      if (m.role === 'user') out.push({ role: 'user', ...(await withAttachments(m.content, m.attachments, entry.capabilities.vision)) });
      else out.push({ role: 'assistant', content: m.content });
    }
    const app = settings.get();
    let projectName: string | undefined;
    let projectInstructions: string | undefined;
    let knowledge: string | undefined;
    const lastUser = [...history].reverse().find((m) => m.role === 'user');
    if (conversation.projectId) {
      try {
        const project = getProject(conversation.projectId);
        projectName = project.name;
        projectInstructions = project.instructions;
        knowledge = await projectKnowledge(project.id, lastUser?.content ?? '', 6000);
      } catch {
        // project deleted
      }
    }
    const preset = getPreset(entry.ref, entry.contextLength);
    const customize = await assistantContext({ settings: app, incognito: store.incognito, tools: false, query: lastUser?.content ?? '', projectId: conversation.projectId });
    const system = buildSystemPrompt({
      modelName: entry.displayName,
      userName: app.userName,
      preferences: app.personalPreferences,
      projectName,
      projectInstructions,
      projectKnowledge: knowledge,
      customSystemPrompt: conversation.settings.inference?.systemPrompt ?? preset.inference.systemPrompt,
      artifacts: app.artifacts && supportsArtifactInstructions(entry),
      inlineVisualizations: app.inlineVisualizations && supportsArtifactInstructions(entry),
      inlineImages: app.inlineImages,
      extraSections: customize.sections,
    });
    return { messages: out, system };
  }

  /** Chats go through the agent loop when the model calls tools natively and any chat tool is on. */
  private async chatUsesTools(store: ChatStore, entry: ModelEntry): Promise<boolean> {
    if (!entry.capabilities.tools) return false;
    const app = settings.get();
    if (app.chatWebSearch || app.browserEnabled) return true;
    const hasChatRef = app.chatReferenceEnabled || app.searchPastChats;
    if (!store.incognito && (app.memoryEnabled || hasChatRef)) return true;
    if (connectors.available().length > 0) return true;
    return (await activeSkills()).length > 0;
  }

  private async generate(store: ChatStore, conversationId: string, assistant: Message, entry: ModelEntry, thinking: ThinkingLevel, autoTitle: boolean): Promise<void> {
    if (await this.chatUsesTools(store, entry).catch(() => false)) {
      if (autoTitle) this.needsTitle.add(conversationId);
      await this.runTask(store, conversationId, assistant, entry, thinking);
      return;
    }
    const controller = new AbortController();
    const state: ChatStreamEvent = { conversationId, messageId: assistant.id, content: '', reasoning: '', status: 'streaming' };
    this.active.set(assistant.id, { controller, state });
    const emit = throttle(() => bus.emit('chat:stream', { ...state }), 40);
    let requestStart = Date.now();
    let firstToken: number | undefined;
    let firstText: number | undefined;
    let firstReasoning: number | undefined;
    let stats: GenerationStats = {};
    let lastPersist = Date.now();

    try {
      const conversation = store.getConversation(conversationId);
      if (!conversation || !assistant.parentId) throw new Error('Conversation not found');
      const preset = getPreset(entry.ref, entry.contextLength);
      const params = { ...preset.inference, ...conversation.settings.inference, stop: conversation.settings.inference?.stop ?? preset.inference.stop };
      const { messages, system } = await this.buildMessages(store, conversation, assistant.parentId, entry);

      const contextLength =
        entry.loadedContextLength ?? (typeof preset.load.contextLength === 'number' ? preset.load.contextLength : entry.contextLength ?? 8192);
      const reserve = params.maxTokens ?? Math.min(4096, Math.floor(contextLength * 0.25));
      const fitted = fitToContext({ role: 'system', content: system }, messages, Math.max(512, contextLength - reserve), params.contextOverflow);
      if (fitted.overflow) {
        throw new Error(
          `This conversation (~${fitted.estimatedTokens.toLocaleString('en-US')} tokens) no longer fits the ${contextLength.toLocaleString('en-US')}-token context window. Start a new chat, raise the context length in Load settings, or choose a different overflow policy.`,
        );
      }
      if (fitted.dropped > 0) log.info(`dropped ${fitted.dropped} messages to fit context`);

      const provider = providers.get(entry.ref.providerId);
      emit();
      for await (const event of provider.chat({
        entry,
        messages: fitted.messages,
        params,
        thinking,
        load: preset.load,
        signal: controller.signal,
        onStatus: (message) => {
          if (message) {
            state.status = 'loading-model';
            state.statusMessage = message;
          } else {
            state.status = 'streaming';
            state.statusMessage = undefined;
            requestStart = Date.now();
          }
          emit();
        },
      })) {
        if (state.status === 'loading-model' && event.type !== 'status') {
          state.status = 'streaming';
          state.statusMessage = undefined;
        }
        switch (event.type) {
          case 'text':
            firstToken ??= Date.now();
            firstText ??= Date.now();
            state.content += event.delta;
            break;
          case 'reasoning':
            firstToken ??= Date.now();
            firstReasoning ??= Date.now();
            state.reasoning += event.delta;
            break;
          case 'usage':
            if (event.promptTokens) stats.promptTokens = event.promptTokens;
            if (event.completionTokens) stats.completionTokens = event.completionTokens;
            break;
          case 'stats':
            stats = { ...stats, ...Object.fromEntries(Object.entries(event.stats).filter(([, v]) => v !== undefined)) };
            break;
          case 'done':
            stats.stopReason = event.stopReason;
            break;
          case 'error':
            throw new Error(event.message);
          case 'status':
            state.statusMessage = event.message;
            break;
          case 'tool_call':
            break;
        }
        emit();
        if (Date.now() - lastPersist > 1500) {
          lastPersist = Date.now();
          store.updateMessage(assistant.id, { content: state.content, reasoning: state.reasoning || undefined });
        }
      }
      if (!state.content.trim() && !state.reasoning.trim()) throw new Error('The model returned an empty response.');
      this.finish(store, assistant, state, stats, 'complete', { requestStart, firstToken, firstText, firstReasoning });
      if (autoTitle && settings.get().autoTitle) void this.autoTitle(store, conversationId, entry, assistant.parentId, state.content);
    } catch (err) {
      if (controller.signal.aborted) {
        this.finish(store, assistant, state, stats, 'stopped', { requestStart, firstToken, firstText, firstReasoning });
      } else {
        log.error('generation failed', entry.ref, err);
        state.status = 'error';
        state.error = errorMessage(err);
        store.updateMessage(assistant.id, { content: state.content, reasoning: state.reasoning || undefined, status: 'error', error: state.error });
      }
    } finally {
      emit();
      emit.flush();
      this.active.delete(assistant.id);
      store.updateConversation(conversationId, {});
      this.notify(conversationId);
      const status = state.status === 'complete' || state.status === 'stopped' ? state.status : 'error';
      this.turnFinished({ conversationId, messageId: assistant.id, status, error: state.error });
    }
  }

  private finish(
    store: ChatStore,
    assistant: Message,
    state: ChatStreamEvent,
    stats: GenerationStats,
    status: 'complete' | 'stopped',
    timing: { requestStart: number; firstToken?: number; firstText?: number; firstReasoning?: number },
  ) {
    const end = Date.now();
    const final: GenerationStats = { ...stats };
    if (timing.firstToken && final.ttftMs === undefined) final.ttftMs = timing.firstToken - timing.requestStart;
    final.totalMs = end - timing.requestStart;
    if (timing.firstReasoning) final.reasoningMs = (timing.firstText ?? end) - timing.firstReasoning;
    final.completionTokens ??= estimateTokens(state.content + state.reasoning);
    if (!final.tokensPerSecond && timing.firstToken && end > timing.firstToken) {
      final.tokensPerSecond = final.completionTokens / ((end - timing.firstToken) / 1000);
    }
    if (status === 'stopped') final.stopReason = 'stopped';
    state.status = status;
    state.stats = final;
    store.updateMessage(assistant.id, { content: state.content, reasoning: state.reasoning || undefined, stats: final, status });
    const message = store.getMessage(assistant.id);
    if (message) store.indexMessage(message);
    try {
      saveArtifactsFromMessage(assistant.conversationId, assistant.id, state.content, store.incognito);
    } catch (err) {
      log.warn('artifact extraction failed', err);
    }
  }

  private async autoTitle(store: ChatStore, conversationId: string, entry: ModelEntry, userMessageId: string, answer: string): Promise<void> {
    const user = store.getMessage(userMessageId);
    if (!user) return;
    if (entry.reasoningStyle === 'always') return; // would think at length just to name the chat
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('title timeout')), 45_000);
    let title = '';
    try {
      const preset = getPreset(entry.ref, entry.contextLength);
      const provider = providers.get(entry.ref.providerId);
      for await (const event of provider.chat({
        entry,
        messages: [
          { role: 'system', content: 'You name chat conversations. Reply with only a title of 2 to 6 words in sentence case. No quotes, no emoji, no trailing punctuation.' },
          { role: 'user', content: `User message:\n${user.content.slice(0, 1500)}\n\nAssistant reply (start):\n${answer.slice(0, 500)}\n\nTitle:` },
        ],
        params: { ...DEFAULT_INFERENCE_PARAMS, temperature: 0.3, maxTokens: 32 },
        thinking: 'off',
        load: preset.load,
        signal: controller.signal,
        onStatus: () => undefined,
      })) {
        if (event.type === 'text') title += event.delta;
      }
    } catch (err) {
      log.warn('auto title failed', errorMessage(err));
    } finally {
      clearTimeout(timer);
    }
    const cleaned = cleanTitle(title);
    if (cleaned && store.getConversation(conversationId)) {
      store.updateConversation(conversationId, { title: cleaned });
      this.notify(conversationId);
    }
  }

  /** Build a /context breakdown for a conversation. */
  async contextInfo(conversationId?: string): Promise<ContextInfo | null> {
    const app = settings.get();
    const conversation = conversationId ? this.store(conversationId).getConversation(conversationId) : undefined;

    // Resolve the model actually bound to this conversation; only fall back to
    // "whatever's loaded" when the conversation has no model chosen yet.
    let entry: ModelEntry | undefined = conversation?.model ? await providers.findModel(conversation.model) : undefined;
    if (!entry) {
      const allModels = await providers.listModels(true);
      entry = allModels.find((m) => m.loadedContextLength != null);
    }
    if (!entry) return null;
    const preset = getPreset(entry.ref, entry.contextLength);
    const contextLength = entry.loadedContextLength ?? (typeof preset.load.contextLength === 'number' ? preset.load.contextLength : entry.contextLength ?? 8192);

    // Get real token counts + reasoning time from the last assistant message with stats.
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    let reasoningMs: number | undefined;
    let completionMessageId: string | undefined;
    if (conversationId && conversation?.currentLeafId) {
      const store = this.store(conversationId);
      const history = branchPath(store.listMessages(conversationId), conversation.currentLeafId);
      for (let i = history.length - 1; i >= 0; i--) {
        const m = history[i];
        if (m.role === 'assistant' && m.stats?.promptTokens != null) {
          promptTokens = m.stats.promptTokens;
          completionTokens = m.stats.completionTokens;
          reasoningMs = m.stats.reasoningMs;
          completionMessageId = m.id;
          break;
        }
      }
    }

    // Use provider-reported numbers as ground truth; fall back to estimation if no stats yet.
    const realTotal = (promptTokens ?? 0) + (completionTokens ?? 0);
    let estimatedTokens: number;
    let messagesCount: number | undefined;

    // Build a rough breakdown of what's inside promptTokens for display purposes.
    let systemContent = '';
    let toolNames: string[] = [];
    if (conversationId) {
      const store = this.store(conversationId);
      const conversation = store.getConversation(conversationId);
      if (!conversation || !conversation.currentLeafId) return null;

      // Gather active tools.
      const activeConnectors = connectors.available();
      const skills = await activeSkills();
      toolNames = [];
      if (app.chatWebSearch) toolNames.push('web_search');
      for (const conn of activeConnectors) {
        if (conn.policy !== 'off') toolNames.push(`${conn.config.id ?? conn.tool.name}__*`);
      }
      if (skills.length > 0) toolNames.push(...skills.map((s) => s.name));

      const history = branchPath(store.listMessages(conversationId), conversation.currentLeafId).filter(
        (m) => m.id !== completionMessageId && (m.role === 'user' || (m.role === 'assistant' && m.content.trim() && m.status !== 'error')),
      );

      let projectName: string | undefined;
      let projectInstructions: string | undefined;
      let knowledge: string | undefined;
      const lastUser = [...history].reverse().find((m) => m.role === 'user');
      if (conversation.projectId) {
        try {
          const proj = getProject(conversation.projectId);
          projectName = proj.name;
          projectInstructions = proj.instructions;
          knowledge = await projectKnowledge(proj.id, lastUser?.content ?? '', 6000);
        } catch { /* deleted */ }
      }

      const customize = await assistantContext({ settings: app, incognito: store.incognito, tools: false, query: lastUser?.content ?? '', projectId: conversation.projectId });
      systemContent = buildSystemPrompt({
        modelName: entry.displayName,
        userName: app.userName,
        preferences: app.personalPreferences,
        projectName,
        projectInstructions,
        projectKnowledge: knowledge,
        customSystemPrompt: conversation.settings.inference?.systemPrompt ?? preset.inference.systemPrompt,
        artifacts: app.artifacts && supportsArtifactInstructions(entry),
        inlineVisualizations: app.inlineVisualizations && supportsArtifactInstructions(entry),
        inlineImages: app.inlineImages,
        toolNames,
        extraSections: customize.sections,
      });

      messagesCount = history.length;
    } else {
      systemContent = buildSystemPrompt({ modelName: entry.displayName, userName: app.userName, preferences: app.personalPreferences, artifacts: true });
    }

    // Estimate breakdown proportions (for display only — total comes from real stats).
    let sysTokens = estimateTokens(systemContent);
    const skillInstructions = (systemContent.match(/<skill>/g) || []).reduce((sum, _m) => sum + 200, 0);

    let toolsTokens = 0;
    if (conversationId && toolNames.length > 0) {
      toolsTokens = estimateTokens(chatToolGuidance(toolNames));
    }

    let skillsTokens = skillInstructions;
    let projectTokens = 0;
    if (conversationId) {
      try {
        const store = this.store(conversationId);
        const conv = store.getConversation(conversationId);
        if (conv?.projectId) {
          const proj = getProject(conv.projectId);
          projectTokens += estimateTokens(`This conversation belongs to the project "${proj.name}".`);
          if (proj.instructions?.trim()) projectTokens += estimateTokens(`<project_instructions>\n${proj.instructions.trim()}\n</project_instructions>`);
        }
      } catch { /* deleted */ }
    }

    let messagesTokens = 0;
    if (conversationId) {
      const store = this.store(conversationId);
      const conv = store.getConversation(conversationId);
      if (conv?.currentLeafId) {
        const history = branchPath(store.listMessages(conversationId), conv.currentLeafId).filter(
          (m) => m.id !== completionMessageId && (m.role === 'user' || (m.role === 'assistant' && m.content.trim() && m.status !== 'error')),
        );
        for (const m of history) {
          messagesTokens += estimateTokens(m.content);
          if (m.attachments?.length) {
            for (const a of m.attachments) messagesTokens += a.tokens ?? 0;
          }
        }
      }
    }

    const rawBreakdown = sysTokens + toolsTokens + skillsTokens + projectTokens + messagesTokens;

    // If we have real provider stats, scale the breakdown proportionally.
    if (realTotal > 0 && rawBreakdown > 0) {
      const ratio = promptTokens! / rawBreakdown;
      sysTokens = Math.round(sysTokens * ratio);
      toolsTokens = Math.round(toolsTokens * ratio);
      skillsTokens = Math.round(skillsTokens * ratio);
      projectTokens = Math.round(projectTokens * ratio);
      messagesTokens = Math.round(messagesTokens * ratio);
      // The latest reply isn't part of the prompt we just scaled to — fold its real
      // completion tokens into Messages so the breakdown adds up to the real total.
      if (completionMessageId) {
        messagesTokens += completionTokens ?? 0;
        messagesCount = (messagesCount ?? 0) + 1;
      }
      estimatedTokens = realTotal;
    } else {
      // No stats yet — use our estimates.
      estimatedTokens = rawBreakdown;
    }

    const freeTokens = Math.max(0, contextLength - estimatedTokens);
    const usagePercent = Math.min(100, Math.round((estimatedTokens / contextLength) * 100));

    return {
      contextLength,
      estimatedTokens,
      freeTokens,
      usagePercent,
      systemPrompt: { tokens: sysTokens, percent: Math.round((sysTokens / contextLength) * 100) },
      tools: { tokens: toolsTokens, percent: Math.round((toolsTokens / contextLength) * 100) },
      skills: { tokens: skillsTokens, percent: Math.round((skillsTokens / contextLength) * 100) },
      projectContext: { tokens: projectTokens, percent: Math.round((projectTokens / contextLength) * 100) },
      messages: { tokens: messagesTokens, percent: Math.round((messagesTokens / contextLength) * 100), count: messagesCount ?? 0 },
      reasoningMs,
      currentLeafId: conversationId ? (this.store(conversationId).getConversation(conversationId)?.currentLeafId ?? null) : null,
    };
  }
}

export const chat = new ChatOrchestrator();
