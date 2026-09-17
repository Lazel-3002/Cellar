/**
 * Generates memory from conversations, either without being asked (Customize -> Memory -> "Generate
 * memory from chats") or on demand with /update-memory. Mirrors the auto-title pattern in the chat
 * orchestrator: a short, non-streaming call to whatever model is already loaded, run once a
 * conversation goes idle, folded into the existing `memory_topics` grouped summaries (see
 * memory-topics.ts) rather than the flat /remember list.
 */
import { branchPath } from '@shared/message-tree';
import type { MemoryCategory, MemoryUpdateResult } from '@shared/types/customize';
import { DEFAULT_INFERENCE_PARAMS, type ModelEntry } from '@shared/types/models';
import { chat, type TurnFinished } from '../chat/orchestrator';
import { get, run } from '../db/client';
import { errorMessage } from '../lib/util';
import { logger } from '../lib/log';
import { getPreset } from '../models/presets';
import { providers } from '../providers/registry';
import { getProject } from '../services/projects';
import { settings } from '../services/settings';
import { deleteMemoryTopic, listMemoryTopics, upsertMemoryTopic } from './memory-topics';

const log = logger('memory-auto');

/** Wait this long after the last turn on a conversation before summarizing it. */
const IDLE_DELAY_MS = 90_000;
/** Never let a busy conversation postpone summarization forever. */
const MAX_WAIT_MS = 10 * 60_000;
const TRANSCRIPT_BUDGET_CHARS = 6000;
const MAX_TOPICS = 200;

const pending = new Map<string, { timer: NodeJS.Timeout; firstScheduledAt: number }>();

export function initAutoMemory(): void {
  chat.onTurnFinished((event) => scheduleAutoMemory(event));
}

function scheduleAutoMemory(event: TurnFinished): void {
  if (event.status !== 'complete') return;
  if (!settings.get().generateMemoryFromChats) return;
  const conversationId = event.conversationId;
  const existing = pending.get(conversationId);
  if (existing) clearTimeout(existing.timer);
  const firstScheduledAt = existing?.firstScheduledAt ?? Date.now();
  const overdue = Date.now() - firstScheduledAt > MAX_WAIT_MS;
  const delay = overdue ? 1000 : IDLE_DELAY_MS;
  const timer = setTimeout(() => {
    pending.delete(conversationId);
    void runAutoMemory(conversationId).catch((err) => log.warn('auto memory failed', conversationId, errorMessage(err)));
  }, delay);
  pending.set(conversationId, { timer, firstScheduledAt });
}

export async function pickBackgroundModel(): Promise<ModelEntry | undefined> {
  const wanted = settings.get().defaultModel;
  if (wanted) {
    const entry = await providers.findModel(wanted);
    if (entry && !entry.capabilities.embedding) return entry;
  }
  const models = (await providers.listModels()).filter((m) => !m.capabilities.embedding);
  return models.find((m) => m.loaded) ?? models[0];
}

interface ExtractedTopic {
  category: MemoryCategory;
  title: string;
  content: string;
}

function parseExtraction(raw: string): { upsert: ExtractedTopic[]; remove: string[] } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { upsert: [], remove: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return { upsert: [], remove: [] };
  }
  const obj = parsed as { upsert?: unknown; remove?: unknown };
  const upsert: ExtractedTopic[] = Array.isArray(obj.upsert)
    ? obj.upsert
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          category: (['you', 'topic', 'area'] as const).includes(item.category as MemoryCategory) ? (item.category as MemoryCategory) : 'topic',
          title: typeof item.title === 'string' ? item.title : '',
          content: typeof item.content === 'string' ? item.content : '',
        }))
        .filter((item) => item.title.trim() && item.content.trim())
        .slice(0, 6)
    : [];
  const remove: string[] = Array.isArray(obj.remove) ? obj.remove.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 6) : [];
  return { upsert, remove };
}

const nothing = (reason: MemoryUpdateResult['reason']): MemoryUpdateResult => ({ saved: [], removed: [], reason });

/**
 * Look at a conversation and fold anything durable into the memory topics, saving nothing when
 * there is nothing worth keeping. `force` is the /update-memory path: the user asked for it, so it
 * runs whether or not automatic memory is on and even if the conversation has not changed since the
 * last pass. Incognito is never remembered either way.
 */
async function runAutoMemory(conversationId: string, options: { force?: boolean } = {}): Promise<MemoryUpdateResult> {
  if (!options.force && !settings.get().generateMemoryFromChats) return nothing('turned-off');
  let conversation, messages;
  try {
    ({ conversation, messages } = chat.getConversation(conversationId));
  } catch {
    return nothing('nothing-useful'); // conversation was deleted
  }
  if (conversation.incognito) return nothing('incognito');

  const path = branchPath(messages, conversation.currentLeafId).filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim());
  if (path.length < 2) return nothing('too-short');

  const marker = get<{ message_count: number }>('SELECT message_count FROM memory_processed WHERE conversation_id = ?', conversationId);
  if (!options.force && marker && marker.message_count === path.length) return nothing('nothing-useful'); // nothing new since last pass

  const entry = await pickBackgroundModel();
  if (!entry) return nothing('no-model');

  let projectName: string | undefined;
  if (conversation.projectId) {
    try {
      projectName = getProject(conversation.projectId).name;
    } catch {
      // deleted project; fall through without a name
    }
  }

  const existingTopics = listMemoryTopics();
  const atCapacity = existingTopics.length >= MAX_TOPICS;
  const existingSummary = existingTopics
    .slice(0, 25)
    .map((t) => `- [${t.category}] ${t.category === 'area' && t.projectName ? t.projectName : t.title}: ${t.content}`)
    .join('\n');

  let transcript = '';
  for (let i = path.length - 1; i >= 0 && transcript.length < TRANSCRIPT_BUDGET_CHARS; i--) {
    const m = path[i];
    const line = `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 1200)}\n`;
    transcript = line + transcript;
  }
  transcript = transcript.slice(-TRANSCRIPT_BUDGET_CHARS);

  const sensitiveLine = settings.get().memorySensitiveTopics
    ? ''
    : '\nDo not record health, medical, religious, political, or other sensitive personal details, even if the user mentioned them.';
  const areaHint = projectName ? ` This conversation belongs to the project "${projectName}" — if you record anything under "area", use exactly that title.` : '';
  const capacityLine = atCapacity ? '\nMemory is full; only include "upsert" items that update a title already listed above, not new ones.' : '';

  const system = `You maintain a private memory profile about the user, built quietly from their conversations in this app. Decide what is worth remembering beyond this one exchange: stated preferences, background, ongoing interests, projects. Skip one-off task details that will not matter later.

What you already remember:
${existingSummary || '(nothing yet)'}

Reply with ONLY a JSON object shaped like {"upsert": [{"category": "you"|"topic"|"area", "title": "short label", "content": "one or two sentences"}], "remove": ["title", ...]}.
- "you": who the user is, or how they want you to respond (title like "Profile" or "Preferences").
- "topic": a recurring interest or subject (title like "Programming background" or "Interests").
- "area": a specific project or piece of ongoing work.${areaHint}
- Each "upsert" item's content should be the full updated text for that title, merged with what you already remember about it — not just the new detail on its own.
- "remove" lists titles that are now outdated or wrong.${sensitiveLine}${capacityLine}
Reply with {"upsert": [], "remove": []} if nothing durable came up in this exchange.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('memory timeout')), 60_000);
  let raw = '';
  try {
    const preset = getPreset(entry.ref, entry.contextLength);
    const provider = providers.get(entry.ref.providerId);
    for await (const event of provider.chat({
      entry,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Conversation:\n${transcript}` },
      ],
      params: { ...DEFAULT_INFERENCE_PARAMS, temperature: 0.2, maxTokens: 500 },
      thinking: 'off',
      load: preset.load,
      signal: controller.signal,
      onStatus: () => undefined,
    })) {
      if (event.type === 'text') raw += event.delta;
    }
  } catch (err) {
    log.warn('memory extraction failed', errorMessage(err));
    if (options.force) throw err;
    return nothing('nothing-useful');
  } finally {
    clearTimeout(timer);
  }

  const { upsert, remove } = parseExtraction(raw);
  const removed: string[] = [];
  const saved: string[] = [];
  for (const title of remove) {
    const found = existingTopics.find((t) => t.title.toLowerCase() === title.trim().toLowerCase());
    if (found) {
      deleteMemoryTopic(found.id);
      removed.push(found.title);
    }
  }
  for (const item of upsert) {
    const isNew = !existingTopics.some((t) => t.category === item.category && t.title.toLowerCase() === item.title.trim().toLowerCase());
    if (atCapacity && isNew) continue;
    try {
      const topic = upsertMemoryTopic({ category: item.category, title: item.title, content: item.content, projectId: item.category === 'area' ? conversation.projectId : undefined });
      saved.push(topic.title);
    } catch (err) {
      log.warn('could not save memory topic', errorMessage(err));
    }
  }

  const now = Date.now();
  run('INSERT INTO memory_processed (conversation_id, message_count, updated_at) VALUES (?, ?, ?) ON CONFLICT(conversation_id) DO UPDATE SET message_count = excluded.message_count, updated_at = excluded.updated_at', conversationId, path.length, now);
  return saved.length === 0 && removed.length === 0 ? nothing('nothing-useful') : { saved, removed };
}

/** /update-memory: read this conversation now and keep whatever is worth keeping. */
export function updateMemoryFromConversation(conversationId: string): Promise<MemoryUpdateResult> {
  return runAutoMemory(conversationId, { force: true });
}
