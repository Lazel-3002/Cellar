/**
 * The free-text box under Customize -> Memory ("Tell Cellar what to change or remove"). Sends the
 * instruction plus the current memory to whatever model is loaded and applies the edits it proposes.
 *
 * Upgraded with a stronger prompt that understands topic relationships, merge behavior, and
 * avoids unrelated modifications.
 */
import type { MemoryCategory } from '@shared/types/customize';
import { DEFAULT_INFERENCE_PARAMS } from '@shared/types/models';
import { errorMessage } from '../lib/util';
import { logger } from '../lib/log';
import { getPreset } from '../models/presets';
import { providers } from '../providers/registry';
import { deleteMemory, listMemories } from './memory';
import { pickBackgroundModel } from './memory-auto';
import { deleteMemoryTopic, listMemoryTopics, upsertMemoryTopic } from './memory-topics';
import { getMemorySummary } from './memory-retrieval';

const log = logger('memory-edit');

function parse(raw: string): { upsertTopics: { category: MemoryCategory; title: string; content: string }[]; removeTopics: string[]; removeMemories: string[]; reply: string } {
  const match = raw.match(/\{[\s\S]*\}/);
  const empty = { upsertTopics: [], removeTopics: [], removeMemories: [], reply: '' };
  if (!match) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return empty;
  }
  const obj = parsed as Record<string, unknown>;
  const upsertTopics = Array.isArray(obj.upsertTopics)
    ? obj.upsertTopics
        .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
        .map((i) => ({
          category: (['you', 'topic', 'area'] as const).includes(i.category as MemoryCategory) ? (i.category as MemoryCategory) : 'topic',
          title: typeof i.title === 'string' ? i.title.trim() : '',
          content: typeof i.content === 'string' ? i.content.trim() : '',
        }))
        .filter((i) => i.title && i.content)
        .slice(0, 10)
    : [];
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 10) : []);
  return { upsertTopics, removeTopics: strings(obj.removeTopics), removeMemories: strings(obj.removeMemories), reply: typeof obj.reply === 'string' ? obj.reply.slice(0, 300) : '' };
}

/** Applies a natural-language memory edit; returns a short confirmation to show the user. */
export async function editMemoryWithText(instruction: string): Promise<string> {
  const text = instruction.trim();
  if (!text) throw new Error('Type what you want to change or remove.');
  const entry = await pickBackgroundModel();
  if (!entry) throw new Error('No model is available. Download one or start Ollama, LM Studio or Unsloth Studio.');

  const topics = listMemoryTopics();
  const memories = listMemories();
  // Use the compact summary from memory-retrieval rather than raw dump
  const topicSummary = getMemorySummary();
  const memoryLines = memories.map((m) => `- [note ${m.id.slice(0, 8)}] ${m.content}`).join('\n') || '(none)';

  const system = `You manage the user's saved memory in this app. Current memory:

Topics (grouped by category):
${topicSummary}

Manual notes:
${memoryLines}

RULES:
- Only touch what the instruction asks for. Leave everything else untouched.
- When updating a topic, provide the FULL updated content (merge old + new info), not just the change.
- Use "you" category for profile/preferences, "topic" for interests/skills, "area" for projects.
- Do NOT create duplicate topics — update existing ones when appropriate.
- Never include passwords, API keys, tokens, or credentials in any output.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('memory edit timeout')), 45_000);
  let raw = '';
  try {
    const preset = getPreset(entry.ref, entry.contextLength);
    const provider = providers.get(entry.ref.providerId);
    for await (const event of provider.chat({
      entry,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
      params: { ...DEFAULT_INFERENCE_PARAMS, temperature: 0.2, maxTokens: 400 },
      thinking: 'off',
      load: preset.load,
      signal: controller.signal,
      onStatus: () => undefined,
    })) {
      if (event.type === 'text') raw += event.delta;
    }
  } finally {
    clearTimeout(timer);
  }

  const { upsertTopics, removeTopics, removeMemories, reply } = parse(raw);
  for (const title of removeTopics) {
    const found = topics.find((t) => t.title.toLowerCase() === title.trim().toLowerCase());
    if (found) deleteMemoryTopic(found.id);
  }
  for (const needle of removeMemories) {
    const found = memories.find((m) => m.id.startsWith(needle.trim()) || m.content.toLowerCase().includes(needle.trim().toLowerCase()));
    if (found) deleteMemory(found.id);
  }
  for (const item of upsertTopics) {
    try {
      // The enhanced upsertMemoryTopic handles dedup/merge internally
      upsertMemoryTopic(item);
    } catch (err) {
      log.warn('could not save memory topic', errorMessage(err));
    }
  }
  return reply || 'Done.';
}
