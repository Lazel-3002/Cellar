import type { AgentPart, ConversationKind, TaskState } from '@shared/types/agent';
import type {
  AttachmentRef,
  Conversation,
  ConversationFilter,
  ConversationSettings,
  ConversationSummary,
  GenerationStats,
  Message,
  MessageModelInfo,
  MessageStatus,
  SearchHit,
} from '@shared/types/chat';
import type { ModelRef } from '@shared/types/models';
import { safeJsonParse } from '../lib/util';
import { all, ftsQuery, get, run, transaction } from './client';

export type ConversationPatch = Partial<Pick<Conversation, 'title' | 'currentLeafId' | 'model' | 'settings' | 'starred' | 'projectId' | 'task'>>;
export type MessagePatch = Partial<Pick<Message, 'content' | 'reasoning' | 'stats' | 'status' | 'error' | 'model' | 'parts'>>;

/** Persistence for a conversation tree. Incognito chats use the in-memory implementation. */
export interface ChatStore {
  readonly incognito: boolean;
  createConversation(conversation: Conversation): void;
  getConversation(id: string): Conversation | undefined;
  updateConversation(id: string, patch: ConversationPatch): void;
  insertMessage(message: Message): void;
  updateMessage(id: string, patch: MessagePatch): void;
  getMessage(id: string): Message | undefined;
  listMessages(conversationId: string): Message[];
  indexMessage(message: Message): void;
}

interface ConversationRow {
  id: string;
  kind: ConversationKind;
  title: string;
  project_id: string | null;
  starred: number;
  current_leaf_id: string | null;
  model_provider: string | null;
  model_id: string | null;
  settings: string;
  task: string | null;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: Message['role'];
  content: string;
  reasoning: string | null;
  attachments: string;
  model: string | null;
  stats: string | null;
  status: MessageStatus;
  error: string | null;
  parts: string | null;
  created_at: number;
}

const kindOf = (kind: string): ConversationKind => (kind === 'task' || kind === 'code' ? kind : 'chat');

const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  kind: kindOf(r.kind),
  title: r.title,
  projectId: r.project_id,
  starred: r.starred === 1,
  currentLeafId: r.current_leaf_id,
  model: r.model_provider && r.model_id ? { providerId: r.model_provider, modelId: r.model_id } : undefined,
  settings: safeJsonParse<ConversationSettings>(r.settings, {}),
  task: safeJsonParse<TaskState | undefined>(r.task, undefined),
  incognito: false,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  parentId: r.parent_id,
  role: r.role,
  content: r.content,
  reasoning: r.reasoning ?? undefined,
  attachments: safeJsonParse<AttachmentRef[]>(r.attachments, []),
  model: safeJsonParse<MessageModelInfo | undefined>(r.model, undefined),
  stats: safeJsonParse<GenerationStats | undefined>(r.stats, undefined),
  status: r.status,
  error: r.error ?? undefined,
  parts: safeJsonParse<AgentPart[] | undefined>(r.parts, undefined),
  createdAt: r.created_at,
});

export class SqliteChatStore implements ChatStore {
  readonly incognito = false;

  createConversation(c: Conversation): void {
    run(
      `INSERT INTO conversations (id, kind, title, project_id, starred, current_leaf_id, model_provider, model_id, settings, task, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      c.id,
      c.kind,
      c.title,
      c.projectId,
      c.starred,
      c.currentLeafId,
      c.model?.providerId,
      c.model?.modelId,
      JSON.stringify(c.settings ?? {}),
      c.task ? JSON.stringify(c.task) : null,
      c.createdAt,
      c.updatedAt,
    );
  }

  getConversation(id: string): Conversation | undefined {
    const row = get<ConversationRow>('SELECT * FROM conversations WHERE id = ?', id);
    return row ? toConversation(row) : undefined;
  }

  updateConversation(id: string, patch: ConversationPatch): void {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.title !== undefined) {
      sets.push('title = ?');
      params.push(patch.title);
    }
    if (patch.currentLeafId !== undefined) {
      sets.push('current_leaf_id = ?');
      params.push(patch.currentLeafId);
    }
    if (patch.model !== undefined) {
      sets.push('model_provider = ?', 'model_id = ?');
      params.push(patch.model?.providerId, patch.model?.modelId);
    }
    if (patch.settings !== undefined) {
      sets.push('settings = ?');
      params.push(JSON.stringify(patch.settings));
    }
    if (patch.starred !== undefined) {
      sets.push('starred = ?');
      params.push(patch.starred);
    }
    if (patch.projectId !== undefined) {
      sets.push('project_id = ?');
      params.push(patch.projectId);
    }
    if (patch.task !== undefined) {
      sets.push('task = ?');
      params.push(JSON.stringify(patch.task));
    }
    sets.push('updated_at = ?');
    params.push(Date.now());
    run(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  }

  insertMessage(m: Message): void {
    run(
      `INSERT INTO messages (id, conversation_id, parent_id, role, content, reasoning, attachments, model, stats, status, error, parts, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      m.id,
      m.conversationId,
      m.parentId,
      m.role,
      m.content,
      m.reasoning,
      JSON.stringify(m.attachments ?? []),
      m.model ? JSON.stringify(m.model) : null,
      m.stats ? JSON.stringify(m.stats) : null,
      m.status,
      m.error,
      m.parts ? JSON.stringify(m.parts) : null,
      m.createdAt,
    );
  }

  updateMessage(id: string, patch: MessagePatch): void {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.content !== undefined) {
      sets.push('content = ?');
      params.push(patch.content);
    }
    if (patch.reasoning !== undefined) {
      sets.push('reasoning = ?');
      params.push(patch.reasoning);
    }
    if (patch.stats !== undefined) {
      sets.push('stats = ?');
      params.push(JSON.stringify(patch.stats));
    }
    if (patch.status !== undefined) {
      sets.push('status = ?');
      params.push(patch.status);
    }
    if (patch.error !== undefined) {
      sets.push('error = ?');
      params.push(patch.error);
    }
    if (patch.model !== undefined) {
      sets.push('model = ?');
      params.push(JSON.stringify(patch.model));
    }
    if (patch.parts !== undefined) {
      sets.push('parts = ?');
      params.push(JSON.stringify(patch.parts));
    }
    if (sets.length === 0) return;
    run(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  }

  getMessage(id: string): Message | undefined {
    const row = get<MessageRow>('SELECT * FROM messages WHERE id = ?', id);
    return row ? toMessage(row) : undefined;
  }

  listMessages(conversationId: string): Message[] {
    return all<MessageRow>('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid', conversationId).map(toMessage);
  }

  indexMessage(m: Message): void {
    if (!m.content.trim()) return;
    transaction(() => {
      run('DELETE FROM messages_fts WHERE message_id = ?', m.id);
      run('INSERT INTO messages_fts (content, conversation_id, message_id) VALUES (?, ?, ?)', m.content, m.conversationId, m.id);
    });
  }
}

export class MemoryChatStore implements ChatStore {
  readonly incognito = true;
  private conversations = new Map<string, Conversation>();
  private messages = new Map<string, Message>();

  has(conversationId: string): boolean {
    return this.conversations.has(conversationId);
  }

  discard(conversationId: string): void {
    this.conversations.delete(conversationId);
    for (const [id, m] of this.messages) if (m.conversationId === conversationId) this.messages.delete(id);
  }

  createConversation(c: Conversation): void {
    this.conversations.set(c.id, { ...c, incognito: true });
  }

  getConversation(id: string): Conversation | undefined {
    const c = this.conversations.get(id);
    return c ? { ...c } : undefined;
  }

  updateConversation(id: string, patch: ConversationPatch): void {
    const c = this.conversations.get(id);
    if (c) this.conversations.set(id, { ...c, ...patch, updatedAt: Date.now() });
  }

  insertMessage(m: Message): void {
    this.messages.set(m.id, { ...m });
  }

  updateMessage(id: string, patch: MessagePatch): void {
    const m = this.messages.get(id);
    if (m) this.messages.set(id, { ...m, ...patch });
  }

  getMessage(id: string): Message | undefined {
    const m = this.messages.get(id);
    return m ? { ...m } : undefined;
  }

  listMessages(conversationId: string): Message[] {
    return [...this.messages.values()].filter((m) => m.conversationId === conversationId).sort((a, b) => a.createdAt - b.createdAt);
  }

  indexMessage(): void {
    // Incognito chats are never indexed.
  }
}

export function listConversations(filter: ConversationFilter = {}): ConversationSummary[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.starred) where.push('c.starred = 1');
  if (filter.kind) {
    where.push('c.kind = ?');
    params.push(filter.kind);
  } else if (filter.kinds?.length) {
    where.push(`c.kind IN (${filter.kinds.map(() => '?').join(', ')})`);
    params.push(...filter.kinds);
  }
  if (filter.projectId !== undefined) {
    if (filter.projectId === null) where.push('c.project_id IS NULL');
    else {
      where.push('c.project_id = ?');
      params.push(filter.projectId);
    }
  }
  const match = filter.query ? ftsQuery(filter.query) : null;
  if (filter.query && match) {
    where.push(`(c.title LIKE ? OR c.id IN (SELECT conversation_id FROM messages_fts WHERE messages_fts MATCH ?))`);
    params.push(`%${filter.query}%`, match);
  }
  const sql = `
    SELECT c.id, c.kind, c.title, c.project_id, c.starred, c.updated_at, json_extract(c.task, '$.status') AS task_status, p.name AS project_name,
      json_extract(c.task, '$.code.repoName') AS repo_name, json_extract(c.task, '$.code.repoRoot') AS repo_root,
      json_extract(c.task, '$.code.branch') AS branch, json_extract(c.task, '$.code.mode') AS code_mode
    FROM conversations c LEFT JOIN projects p ON p.id = c.project_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY c.updated_at DESC
    LIMIT ?`;
  params.push(filter.limit ?? 500);
  type Row = {
    id: string;
    kind: ConversationKind;
    title: string;
    project_id: string | null;
    starred: number;
    updated_at: number;
    task_status: string | null;
    project_name: string | null;
    repo_name: string | null;
    repo_root: string | null;
    branch: string | null;
    code_mode: string | null;
  };
  return all<Row>(sql, ...params).map((r) => ({
    id: r.id,
    kind: kindOf(r.kind),
    title: r.title,
    projectId: r.project_id,
    projectName: r.project_name ?? undefined,
    starred: r.starred === 1,
    updatedAt: r.updated_at,
    taskStatus: (r.task_status ?? undefined) as ConversationSummary['taskStatus'],
    repoName: r.repo_name ?? undefined,
    repoRoot: r.repo_root ?? undefined,
    branch: r.branch ?? undefined,
    codeMode: (r.code_mode ?? undefined) as ConversationSummary['codeMode'],
  }));
}

export function searchMessages(query: string, limit = 20): SearchHit[] {
  const match = ftsQuery(query);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const titleRows = all<{ id: string; kind: string; title: string; updated_at: number }>(
    'SELECT id, kind, title, updated_at FROM conversations WHERE title LIKE ? ORDER BY updated_at DESC LIMIT ?',
    `%${query}%`,
    limit,
  );
  for (const r of titleRows) {
    seen.add(r.id);
    hits.push({ conversationId: r.id, kind: kindOf(r.kind), title: r.title || 'Untitled', snippet: '', updatedAt: r.updated_at });
  }
  if (match) {
    const rows = all<{ conversation_id: string; message_id: string; snippet: string; kind: string; title: string; updated_at: number }>(
      `SELECT f.conversation_id, f.message_id, snippet(messages_fts, 0, '[[', ']]', '…', 12) AS snippet, c.kind, c.title, c.updated_at
       FROM messages_fts f JOIN conversations c ON c.id = f.conversation_id
       WHERE messages_fts MATCH ?
       ORDER BY bm25(messages_fts) LIMIT ?`,
      match,
      limit * 3,
    );
    for (const r of rows) {
      if (seen.has(r.conversation_id)) continue;
      seen.add(r.conversation_id);
      hits.push({ conversationId: r.conversation_id, kind: kindOf(r.kind), messageId: r.message_id, title: r.title || 'Untitled', snippet: r.snippet, updatedAt: r.updated_at });
      if (hits.length >= limit) break;
    }
  }
  return hits.slice(0, limit);
}

export function deleteConversations(ids: string[]): void {
  transaction(() => {
    for (const id of ids) {
      run('DELETE FROM messages_fts WHERE conversation_id = ?', id);
      run('DELETE FROM conversations WHERE id = ?', id);
    }
  });
}

export function modelRefEquals(a?: ModelRef, b?: ModelRef): boolean {
  return !!a && !!b && a.providerId === b.providerId && a.modelId === b.modelId;
}
