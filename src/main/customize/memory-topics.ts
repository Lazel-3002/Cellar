/**
 * Memory topics: grouped, running summaries quietly built from conversations (Customize -> Memory),
 * shown like Claude's "You" / "Topics" / "Areas" sections. Distinct from the flat `memories` table,
 * which holds facts a user or model explicitly asked to remember.
 */
import type { MemoryCategory, MemoryTopic } from '@shared/types/customize';
import { all, get, run } from '../db/client';
import { bus } from '../lib/events';
import { newId } from '../lib/util';
import { getProject } from '../services/projects';

interface Row {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  project_id: string | null;
  created_at: number;
  updated_at: number;
}

const MAX_CONTENT_CHARS = 600;
const MAX_TITLE_CHARS = 60;
/** How much of the system prompt memory topics may take, on top of the flat memory list's own budget. */
const PROMPT_BUDGET_CHARS = 4000;

function toItem(r: Row): MemoryTopic {
  let projectName: string | undefined;
  if (r.project_id) {
    try {
      projectName = getProject(r.project_id).name;
    } catch {
      // project was deleted; keep the topic, just without a resolved name
    }
  }
  return { id: r.id, category: r.category, title: r.title, content: r.content, projectId: r.project_id ?? undefined, projectName, createdAt: r.created_at, updatedAt: r.updated_at };
}

function changed() {
  bus.emit('customize:changed', { kind: 'memory' });
}

export function listMemoryTopics(): MemoryTopic[] {
  return all<Row>('SELECT * FROM memory_topics ORDER BY updated_at DESC').map(toItem);
}

export interface MemoryTopicInput {
  category: MemoryCategory;
  title: string;
  content: string;
  projectId?: string | null;
}

/** Insert a topic, or update it in place when one already exists for the same category (title matched case-insensitively). */
export function upsertMemoryTopic(input: MemoryTopicInput): MemoryTopic {
  const category: MemoryCategory = ['you', 'topic', 'area'].includes(input.category) ? input.category : 'topic';
  const title = input.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS);
  const content = input.content.replace(/\s+/g, ' ').trim().slice(0, MAX_CONTENT_CHARS);
  if (!title || !content) throw new Error('A memory topic needs a title and content.');
  const now = Date.now();
  const existing = get<Row>('SELECT * FROM memory_topics WHERE category = ? AND lower(title) = lower(?)', category, title);
  if (existing) {
    run('UPDATE memory_topics SET content = ?, project_id = ?, updated_at = ? WHERE id = ?', content, input.projectId ?? existing.project_id, now, existing.id);
    changed();
    return toItem(get<Row>('SELECT * FROM memory_topics WHERE id = ?', existing.id)!);
  }
  const id = newId();
  run('INSERT INTO memory_topics (id, category, title, content, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, category, title, content, input.projectId ?? null, now, now);
  changed();
  return toItem(get<Row>('SELECT * FROM memory_topics WHERE id = ?', id)!);
}

export function updateMemoryTopic(id: string, content: string): MemoryTopic {
  const text = content.replace(/\s+/g, ' ').trim().slice(0, MAX_CONTENT_CHARS);
  if (!text) throw new Error('A memory topic cannot be empty.');
  const { changes } = run('UPDATE memory_topics SET content = ?, updated_at = ? WHERE id = ?', text, Date.now(), id);
  if (!changes) throw new Error('Memory topic not found.');
  changed();
  return toItem(get<Row>('SELECT * FROM memory_topics WHERE id = ?', id)!);
}

export function deleteMemoryTopic(id: string): void {
  run('DELETE FROM memory_topics WHERE id = ?', id);
  changed();
}

export function clearMemoryTopics(): void {
  run('DELETE FROM memory_topics');
  changed();
}

export function findMemoryTopicByTitle(title: string): MemoryTopic | undefined {
  const needle = title.trim().toLowerCase();
  if (!needle) return undefined;
  return listMemoryTopics().find((t) => t.title.toLowerCase() === needle);
}

const CATEGORY_LABEL: Record<MemoryCategory, string> = { you: 'You', topic: 'Topics', area: 'Areas' };

/** The memory-topics block of a system prompt, grouped by category (within a character budget). */
export function memoryTopicsPrompt(items: MemoryTopic[]): string {
  if (items.length === 0) return '';
  const byCategory = new Map<MemoryCategory, MemoryTopic[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  const lines: string[] = [];
  let used = 0;
  outer: for (const category of ['you', 'topic', 'area'] as const) {
    const list = byCategory.get(category);
    if (!list?.length) continue;
    const header = `${CATEGORY_LABEL[category]}:`;
    if (used + header.length > PROMPT_BUDGET_CHARS) break;
    lines.push(header);
    used += header.length;
    for (const item of list) {
      const name = item.category === 'area' && item.projectName ? item.projectName : item.title;
      const line = `- ${name}: ${item.content}`;
      if (used + line.length > PROMPT_BUDGET_CHARS) break outer;
      lines.push(line);
      used += line.length;
    }
  }
  if (lines.length === 0) return '';
  return `<memory_profile>\nBuilt quietly from earlier conversations. Use it when relevant; do not recite it back or mention that it exists unless asked.\n${lines.join('\n')}\n</memory_profile>`;
}
