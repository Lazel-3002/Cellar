/**
 * Generates memory from conversations, either without being asked (Customize -> Memory -> "Generate
 * memory from chats") or on demand with /update-memory. Mirrors the auto-title pattern in the chat
 * orchestrator: a short, non-streaming call to whatever model is already loaded, run once a
 * conversation goes idle, folded into the existing `memory_topics` grouped summaries (see
 * memory-topics.ts) rather than the flat /remember list.
 *
 * Upgraded with a stronger extraction prompt, structured JSON schema (upserts/removals), and
 * confidence-aware handling. The extractor distinguishes durable memories from temporary info and
 * aggressively avoids storing one-off task details.
 */
import { branchPath } from '@shared/message-tree';
import type { MemoryCategory, MemoryRemoval, MemoryUpdateResult, MemoryUpsert } from '@shared/types/customize';
import { DEFAULT_INFERENCE_PARAMS, type ModelEntry } from '@shared/types/models';
import { chat, type TurnFinished } from '../chat/orchestrator';
import { get, run } from '../db/client';
import { errorMessage } from '../lib/util';
import { logger } from '../lib/log';
import { getPreset } from '../models/presets';
import { providers } from '../providers/registry';
import { settings } from '../services/settings';
import { deleteMemoryTopic, isHighlySensitiveTopic, listMemoryTopics, stripSensitiveContent, upsertMemoryTopic } from './memory-topics';

const log = logger('memory-auto');

/** Wait this long after the last turn on a conversation before summarizing it. */
const IDLE_DELAY_MS = 90_000;
/** Never let a busy conversation postpone summarization forever. */
const MAX_WAIT_MS = 10 * 60_000;
const TRANSCRIPT_BUDGET_CHARS = 6000;
/** Max topics before we start refusing new ones (soft cap — old topics can still be updated). */
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

function parseExtraction(raw: string): { upserts: MemoryUpsert[]; removals: MemoryRemoval[] } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { upserts: [], removals: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return { upserts: [], removals: [] };
  }
  const obj = parsed as Record<string, unknown>;

  // Parse upserts — handle both old format (upsert) and new format (upserts)
  const rawUpserts = Array.isArray(obj.upserts) ? obj.upserts : Array.isArray(obj.upsert) ? obj.upsert : [];
  const upserts: MemoryUpsert[] = rawUpserts
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const category = (['you', 'topic', 'area'] as const).includes(item.category as MemoryCategory) ? (item.category as MemoryCategory) : 'topic';
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const content = typeof item.content === 'string' ? item.content.trim() : '';
      // Confidence is model metadata — clamp to [0,1] but don't use it as permission gate
      let confidence = 0.8;
      if (typeof item.confidence === 'number') {
        confidence = Math.max(0, Math.min(1, item.confidence));
      }
      return { category, title, content, projectId: item.category === 'area' ? (typeof item.projectId === 'string' ? item.projectId : null) : null, confidence };
    })
    .filter((item) => item.title && item.content);

  // Parse removals — handle both old format (remove: ["Title"]) and new format (removals: [{category, title, reason}])
  const rawRemovals = Array.isArray(obj.removals) ? obj.removals : Array.isArray(obj.remove) ? obj.remove : [];
  const removals: MemoryRemoval[] = rawRemovals
    .flatMap((r) => {
      // Old format: array of string titles like ["Profile"]
      if (typeof r === 'string') return [{ category: 'topic' as MemoryCategory, title: r.trim(), reason: 'obsolete' as const }];
      // New format: object with category/title/reason
      if (typeof r !== 'object' || !r) return [];
      const category = (['you', 'topic', 'area'] as const).includes(r.category as MemoryCategory) ? (r.category as MemoryCategory) : 'topic';
      const title = typeof r.title === 'string' ? r.title.trim() : '';
      const reason: 'obsolete' | 'duplicate' | 'incorrect' =
        typeof r.reason === 'string' && ['obsolete', 'duplicate', 'incorrect'].includes(r.reason)
          ? (r.reason as 'obsolete' | 'duplicate' | 'incorrect')
          : 'obsolete';
      return title ? [{ category, title, reason }] : [];
    });

  // Cap at reasonable limits to avoid overwhelming the DB
  return { upserts: upserts.slice(0, 8), removals: removals.slice(0, 4) };
}

const nothing = (reason: MemoryUpdateResult['reason']): MemoryUpdateResult => ({ saved: [], removed: [], reason });

/**
 * Look at a conversation and fold anything durable into the memory topics. `force` is the /update-memory path.
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
      const { getProject } = require('../services/projects');
      projectName = getProject(conversation.projectId).name;
    } catch {
      // deleted project; fall through without a name
    }
  }

  const existingTopics = listMemoryTopics();
  const atCapacity = existingTopics.length >= MAX_TOPICS;

  // Show only the most relevant existing topics (not the entire DB) — top 20 by recency + confidence
  const existingSummary = existingTopics
    .slice(0, 20)
    .map((t) => `- [${t.category}] ${t.title}: ${t.content}`)
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
    : '\nDo not record health, medical, religious, political, or other sensitive personal details. Never store passwords, API keys, tokens, or credentials.';
  const areaHint = projectName ? ` This conversation belongs to the project "${projectName}" — if you create an "area" entry, use exactly that title for the project.` : '';
  const capacityLine = atCapacity ? '\nMemory is near capacity. Only upsert entries that update existing topics, or add genuinely new durable information.' : '';

  const system = `You are a memory manager maintaining the user's long-term profile in this app. You are NOT summarising the conversation — you are deciding what to keep in their permanent memory.

RULES:
1. Only store durable information that will remain useful in future conversations.
2. Prefer: stated preferences, stable background info, recurring interests, active projects, meaningful changes.
3. Do NOT store one-off tasks, temporary details, or things already covered by existing memory.
4. When existing memory covers the same concept, UPDATE and MERGE it — do not create a duplicate topic.
5. If new information conflicts with old, replace only the conflicting part; keep compatible info.
6. Never store passwords, API keys, tokens, credentials, or private keys.

Categories:
- "you": who the user is, their preferences, communication style, response preferences (titles like "Profile", "Preferences").
- "topic": recurring interests, hobbies, knowledge areas, technical skills (titles like "AI Interests", "Programming Background").
- "area": specific projects or ongoing work. Use the project name as title when applicable.${areaHint}

What you already remember:
${existingSummary || '(nothing yet)'}

Conversation:
${transcript}

Reply with ONLY a JSON object (no markdown, no explanation):
{"upserts": [{"category": "you"|"topic"|"area", "title": "short label", "content": "one or two sentences — full updated text for that topic", "confidence": 0.5-1.0}], "removals": [{"category": "you"|"topic"|"area", "title": "exact title to remove", "reason": "obsolete"|"duplicate"|"incorrect"}]}

Return {"upserts": [], "removals": []} if nothing durable came up.${sensitiveLine}${capacityLine}`;

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
        { role: 'user', content: `Extract memory from this conversation. Reply with JSON only.` },
      ],
      params: { ...DEFAULT_INFERENCE_PARAMS, temperature: 0.2, maxTokens: 600 },
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

  const { upserts, removals } = parseExtraction(raw);
  const removed: string[] = [];
  const saved: string[] = [];

  // Process removals first
  for (const rem of removals) {
    const found = existingTopics.find((t) => t.title.toLowerCase() === rem.title.trim().toLowerCase());
    if (found) {
      deleteMemoryTopic(found.id);
      removed.push(found.title);
    }
  }

  // Process upserts — the enhanced upsertMemoryTopic handles dedup/merge internally.
  // When sensitive topics are disallowed, also filter out extraction results that contain
  // highly specific sensitive content (as a deterministic safety net beyond the LLM prompt).
  const sensitiveAllowed = settings.get().memorySensitiveTopics;

  for (const item of upserts) {
    let contentToSave = item.content;
    if (!sensitiveAllowed && isHighlySensitiveTopic(item.content)) {
      log.info('auto-extraction: filtered out highly sensitive content');
      contentToSave = stripSensitiveContent(item.content);
      if (!contentToSave.trim()) continue; // skip entirely if stripped to empty
    }

    const isNew = !existingTopics.some((t) => t.category === item.category && t.title.toLowerCase() === item.title.trim().toLowerCase());
    if (atCapacity && isNew) continue; // skip new topics when at capacity
    try {
      const topic = upsertMemoryTopic({
        category: item.category,
        title: item.title,
        content: contentToSave,
        projectId: item.category === 'area' ? conversation.projectId : undefined,
        confidence: item.confidence,
        sensitiveAllowed, // pass through so upsertMemoryTopic can apply its own filters
      });
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
