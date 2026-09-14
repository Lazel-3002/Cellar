/**
 * Memory: short facts about the user that every chat, task and session can see (when memory is on).
 * You add them in Customize → Memory or with /remember; tool-capable models save them with the
 * `remember` tool when you ask, and remove them with `forget`.
 */
import type { MemoryItem } from '@shared/types/customize';
import { all, get, run } from '../db/client';
import { bus } from '../lib/events';
import { newId } from '../lib/util';

interface Row {
  id: string;
  content: string;
  source: MemoryItem['source'];
  conversation_id: string | null;
  created_at: number;
  updated_at: number;
}

const MAX_MEMORY_CHARS = 1000;
/** How much of the system prompt memories may take. */
const PROMPT_BUDGET_CHARS = 6000;

const toItem = (r: Row): MemoryItem => ({ id: r.id, content: r.content, source: r.source, conversationId: r.conversation_id ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at });

function changed() {
  bus.emit('customize:changed', { kind: 'memory' });
}

export function listMemories(): MemoryItem[] {
  return all<Row>('SELECT * FROM memories ORDER BY updated_at DESC').map(toItem);
}

function clean(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('A memory cannot be empty.');
  return text.slice(0, MAX_MEMORY_CHARS);
}

export function addMemory(content: string, source: MemoryItem['source'] = 'user', conversationId?: string): MemoryItem {
  const text = clean(content);
  const duplicate = get<Row>('SELECT * FROM memories WHERE lower(content) = lower(?)', text);
  if (duplicate) return toItem(duplicate);
  const now = Date.now();
  const id = newId();
  run('INSERT INTO memories (id, content, source, conversation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', id, text, source, conversationId ?? null, now, now);
  changed();
  return toItem(get<Row>('SELECT * FROM memories WHERE id = ?', id)!);
}

export function updateMemory(id: string, content: string): MemoryItem {
  const { changes } = run('UPDATE memories SET content = ?, updated_at = ? WHERE id = ?', clean(content), Date.now(), id);
  if (!changes) throw new Error('Memory not found.');
  changed();
  return toItem(get<Row>('SELECT * FROM memories WHERE id = ?', id)!);
}

export function deleteMemory(id: string): void {
  run('DELETE FROM memories WHERE id = ?', id);
  changed();
}

export function clearMemories(): void {
  run('DELETE FROM memories');
  changed();
}

/** Short ids the model uses to refer to memories (first 8 characters of the id). */
export const memoryHandle = (id: string) => id.slice(0, 8);

export function findMemory(handleOrText: string): MemoryItem | undefined {
  const needle = handleOrText.trim().toLowerCase();
  if (!needle) return undefined;
  const items = listMemories();
  return items.find((m) => memoryHandle(m.id) === needle || m.id === needle) ?? items.find((m) => m.content.toLowerCase() === needle) ?? items.find((m) => m.content.toLowerCase().includes(needle));
}

/** The memory block of a system prompt (newest first, within a character budget). */
export function memoryPrompt(items: MemoryItem[], canEdit: boolean): string {
  const lines: string[] = [];
  let used = 0;
  for (const item of items) {
    const line = `- [${memoryHandle(item.id)}] ${item.content}`;
    if (used + line.length > PROMPT_BUDGET_CHARS) break;
    lines.push(line);
    used += line.length;
  }
  const guidance = canEdit
    ? 'When the user asks you to remember something (or to forget or change something you remember), use the remember and forget tools. Do not save things they did not ask you to remember.'
    : 'Use these memories when they are relevant.';
  if (lines.length === 0) return canEdit ? `<memory>\nNothing saved yet.\n</memory>\n${guidance}` : '';
  return `<memory>\nWhat the user asked you to remember across conversations:\n${lines.join('\n')}\n</memory>\n${guidance}`;
}
