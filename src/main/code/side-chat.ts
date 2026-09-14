/**
 * Side chat: questions about a Code session that stay out of its transcript and the agent's
 * context. The session transcript is sent as context, no tools are offered and nothing is saved.
 */
import { z } from 'zod';
import { branchPath } from '@shared/message-tree';
import type { AgentPart, ToolPartStatus } from '@shared/types/agent';
import type { Conversation, Message } from '@shared/types/chat';
import type { SideChatEvent, SideChatMessage, SideChatRequest } from '@shared/types/code';
import type { ModelEntry, ModelRef } from '@shared/types/models';
import { transcriptForSummary } from '../agent/history';
import { truncateMiddle } from '../chat/context-window';
import { chat } from '../chat/orchestrator';
import { handle } from '../ipc/register';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage, throttle } from '../lib/util';
import { getPreset } from '../models/presets';
import { providers } from '../providers/registry';
import type { ProviderMessage } from '../providers/types';

const log = logger('side-chat');

/** Conservative for transcripts full of code, paths and JSON. */
const CHARS_PER_TOKEN = 3.2;
/** Share of the context window the session transcript may use. */
const TRANSCRIPT_SHARE = 0.4;
const MESSAGE_OVERHEAD_TOKENS = 6;
export const MAX_SIDE_MESSAGES = 60;
export const MAX_SIDE_MESSAGE_CHARS = 100_000;

const tokens = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD_TOKENS;

const FRIENDLY_ERRORS = {
  noQuestion: 'Ask a question first.',
  tooLong: 'Side chat messages can be at most 100,000 characters.',
  tooMany: 'This side chat is too long. Clear it and ask again.',
};

const requestSchema = z.object({
  requestId: z.string().min(1).max(200),
  conversationId: z.string().min(1).max(200),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(MAX_SIDE_MESSAGE_CHARS, FRIENDLY_ERRORS.tooLong) }))
    .min(1, FRIENDLY_ERRORS.noQuestion)
    .max(MAX_SIDE_MESSAGES, FRIENDLY_ERRORS.tooMany)
    .refine((messages) => messages[messages.length - 1]?.role === 'user' && messages[messages.length - 1].content.trim().length > 0, FRIENDLY_ERRORS.noQuestion),
  model: z.object({ providerId: z.string().min(1), modelId: z.string().min(1) }),
  thinking: z.enum(['off', 'on', 'low', 'medium', 'high']),
});

export function parseSideChatRequest(input: unknown): SideChatRequest {
  const parsed = requestSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  if (issue && Object.values(FRIENDLY_ERRORS).includes(issue.message)) throw new Error(issue.message);
  throw new Error(`The side chat request is invalid (${issue?.path.join('.') || 'request'}: ${issue?.message ?? 'unknown problem'}).`);
}

const PENDING_RESULTS: Partial<Record<ToolPartStatus, string>> = {
  streaming: '(The agent is still writing this call.)',
  'awaiting-approval': '(Waiting for the user to approve this call.)',
  running: '(Still running.)',
};

/** Live tool calls would otherwise read as stopped, and failed turns would be missing. */
function prepareBranch(branch: Message[]): Message[] {
  return branch.map((m) => {
    if (m.role !== 'assistant') return m;
    let parts: AgentPart[] | undefined = m.parts?.map((p) => (p.type === 'tool' && p.result === undefined && PENDING_RESULTS[p.status] ? { ...p, result: PENDING_RESULTS[p.status] } : p));
    if (m.status === 'error' && m.error) {
      const round = Math.max(0, ...(m.parts ?? []).map((p) => p.round)) + 1;
      const text = m.parts?.length || !m.content.trim() ? `[This turn failed: ${m.error}]` : `${m.content.trim()}\n\n[This turn failed: ${m.error}]`;
      parts = [...(parts ?? []), { type: 'text', round, text }];
    }
    return parts ? { ...m, parts } : m;
  });
}

/** Keep the start of the session and most of its recent work. */
export function clipTranscript(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const room = Math.max(0, maxChars - 90);
  const head = Math.floor(room * 0.25);
  const tail = room - head;
  const omitted = text.length - head - tail;
  return `${text.slice(0, head)}\n\n[… ${omitted.toLocaleString('en-US')} characters of the session omitted …]\n\n${text.slice(text.length - tail)}`;
}

export function sideChatSystemPrompt(conversation: Pick<Conversation, 'title' | 'task'>, transcript: string): string {
  const task = conversation.task;
  const session: string[] = [];
  if (conversation.title) session.push(`- Session: ${conversation.title}`);
  if (task?.code?.repoName) session.push(`- Repository: ${task.code.repoName}${task.code.branch ? ` (branch ${task.code.branch})` : ''}`);
  if (task?.workDir) session.push(`- Working folder: ${task.workDir}`);
  if (task?.code?.mode) session.push(`- Agent mode: ${task.code.mode}`);
  if (task?.status) session.push(`- Agent status: ${task.status}`);
  return [
    'You answer side questions about an ongoing coding session in Cellar, a desktop app for local AI models. In the session, a coding agent works in the user\'s project through tool calls (reading and editing files, running commands). The user is asking you separately: this conversation is not added to the session and the agent does not see it.',
    '',
    '- Answer briefly in Markdown. Point to the files, commands and output in the transcript when they matter.',
    '- You cannot run tools, open files or change anything. If the user wants changes made, suggest asking in the main session.',
    '- If the transcript does not show the answer, say so instead of guessing.',
    ...(session.length ? ['', 'Session details:', ...session] : []),
    '',
    '<session_transcript>',
    transcript,
    '</session_transcript>',
  ].join('\n');
}

export interface SideChatPromptInput {
  conversation: Pick<Conversation, 'title' | 'task' | 'currentLeafId'>;
  /** All messages of the session; the current branch is used. */
  messages: Message[];
  side: SideChatMessage[];
  contextLength: number;
  /** Tokens kept free for the reply. */
  replyTokens: number;
}

export interface SideChatPrompt {
  messages: ProviderMessage[];
  transcriptClipped: boolean;
  /** Older side messages left out to fit the context window. */
  dropped: number;
}

/** The side conversation within `budget` tokens: oldest turns go first, the latest question always stays. */
function fitSideMessages(side: SideChatMessage[], budget: number): ProviderMessage[] {
  let kept: ProviderMessage[] = side.map((m) => ({ role: m.role, content: m.content }));
  const cost = () => kept.reduce((sum, m) => sum + tokens(m.content), 0);
  while (kept.length > 1 && cost() > budget) {
    kept.shift();
    while (kept.length > 1 && kept[0].role === 'assistant') kept.shift();
  }
  if (cost() > budget) {
    const last = kept[kept.length - 1];
    const chars = Math.max(1000, Math.floor((budget - MESSAGE_OVERHEAD_TOKENS) * CHARS_PER_TOKEN));
    kept = [{ ...last, content: truncateMiddle(last.content, chars) }];
  }
  return kept;
}

export function buildSideChatPrompt(input: SideChatPromptInput): SideChatPrompt {
  const branch = prepareBranch(branchPath(input.messages, input.conversation.currentLeafId));
  const raw = transcriptForSummary(branch, '', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER).trim();
  const transcript = raw ? clipTranscript(raw, Math.floor(input.contextLength * TRANSCRIPT_SHARE * CHARS_PER_TOKEN)) : '(The session has no messages yet.)';
  const system = sideChatSystemPrompt(input.conversation, transcript);
  const side = fitSideMessages(input.side, input.contextLength - input.replyTokens - tokens(system));
  return {
    messages: [{ role: 'system', content: system }, ...side],
    transcriptClipped: !!raw && transcript.length !== raw.length,
    dropped: input.side.length - side.length,
  };
}

const active = new Map<string, AbortController>();

async function resolveModel(ref: ModelRef): Promise<ModelEntry> {
  const entry = await providers.findModel(ref);
  if (!entry) throw new Error('The selected model is not available. Check that its app is running, or pick another model.');
  if (entry.capabilities.embedding) throw new Error(`${entry.displayName} is an embedding model and cannot chat.`);
  return entry;
}

async function run(request: SideChatRequest, controller: AbortController): Promise<void> {
  const { requestId, conversationId } = request;
  let text = '';
  let pendingText = '';
  let pendingReasoning = '';
  let reasoning = '';
  const sendPending = () => {
    if (!pendingText && !pendingReasoning) return;
    const event: SideChatEvent = { requestId, conversationId };
    if (pendingText) event.delta = pendingText;
    if (pendingReasoning) event.reasoning = pendingReasoning;
    pendingText = '';
    pendingReasoning = '';
    bus.emit('code:side', event);
  };
  const emit = throttle(sendPending, 50);

  try {
    const entry = await resolveModel(request.model);
    const { conversation, messages } = chat.getConversation(conversationId);
    if (conversation.kind !== 'code' && conversation.kind !== 'task') throw new Error('Side chat is only available in Code sessions.');
    const preset = getPreset(entry.ref, entry.contextLength);
    const params = { ...preset.inference, ...conversation.settings.inference, stop: conversation.settings.inference?.stop ?? preset.inference.stop, jsonSchema: '' };
    const contextLength = entry.loadedContextLength ?? (typeof preset.load.contextLength === 'number' ? preset.load.contextLength : entry.contextLength ?? 8192);
    const replyTokens = params.maxTokens ?? Math.min(4096, Math.floor(contextLength * 0.25));
    const prompt = buildSideChatPrompt({ conversation, messages, side: request.messages, contextLength, replyTokens });
    if (prompt.dropped > 0) log.info(`dropped ${prompt.dropped} side chat messages to fit context`);
    if (controller.signal.aborted) throw new Error('Stopped');

    const provider = providers.get(entry.ref.providerId);
    for await (const event of provider.chat({
      entry,
      messages: prompt.messages,
      params,
      thinking: request.thinking,
      load: preset.load,
      signal: controller.signal,
      onStatus: () => undefined,
    })) {
      if (event.type === 'text') {
        text += event.delta;
        pendingText += event.delta;
        emit();
      } else if (event.type === 'reasoning') {
        reasoning += event.delta;
        pendingReasoning += event.delta;
        emit();
      } else if (event.type === 'error') {
        throw new Error(event.message);
      }
    }
    if (!text.trim() && !controller.signal.aborted) {
      throw new Error(reasoning.trim() ? 'The model stopped after thinking, without an answer. Try again or turn thinking off.' : 'The model returned an empty response.');
    }
    emit.flush();
    sendPending();
    bus.emit('code:side', { requestId, conversationId, done: true });
  } catch (err) {
    emit.flush();
    sendPending();
    if (controller.signal.aborted) {
      bus.emit('code:side', { requestId, conversationId, done: true });
    } else {
      log.warn('side chat failed', request.model, errorMessage(err));
      bus.emit('code:side', { requestId, conversationId, error: errorMessage(err) });
    }
  } finally {
    active.delete(requestId);
  }
}

/** Starts streaming an answer as `code:side` events and returns right away. */
export function startSideChat(input: SideChatRequest): void {
  const request = parseSideChatRequest(input);
  if (active.has(request.requestId)) throw new Error('This side chat request is already running.');
  const controller = new AbortController();
  active.set(request.requestId, controller);
  void run(request, controller);
}

export function stopSideChat(requestId: string): void {
  active.get(requestId)?.abort(new Error('Stopped by user'));
}

export function registerSideChatHandlers(): void {
  handle('code:sideChat', (request) => startSideChat(request));
  handle('code:sideChatStop', (requestId) => stopSideChat(z.string().max(200).parse(requestId)));
}

export function stopAllSideChats(): void {
  for (const controller of active.values()) controller.abort(new Error('Application closing'));
}
