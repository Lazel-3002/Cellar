import { normalizeDesign } from '@shared/design/normalize';
import { defaultTheme, FORMAT_DEFAULTS, themeById } from '@shared/design/theme';
import type { TaskStatus } from '@shared/types/agent';
import type { Artboard, Design, DesignFormat, DesignStartOptions, DesignSummary, DesignTheme } from '@shared/types/design';
import { all, get, run } from '../db/client';
import { bus } from '../lib/events';
import { newId, safeJsonParse } from '../lib/util';

interface DesignRow {
  id: string;
  conversation_id: string;
  format: string;
  data: string;
  version: number;
  created_at: number;
  updated_at: number;
  title: string;
}

interface StoredData {
  theme: DesignTheme;
  artboards: Artboard[];
}

const SELECT = 'SELECT d.*, c.title AS title FROM designs d JOIN conversations c ON c.id = d.conversation_id';

function toDesign(row: DesignRow): Design {
  const data = safeJsonParse<StoredData>(row.data, { theme: defaultTheme(), artboards: [] });
  return {
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title || 'Untitled design',
    format: row.format as DesignFormat,
    theme: data.theme,
    artboards: data.artboards,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class DesignConflictError extends Error {
  constructor() {
    super('The design changed while you were editing (the model may have updated it). Your view has been refreshed; try the change again.');
    this.name = 'DesignConflictError';
  }
}

/** A new, empty design for a conversation that already exists. */
export function createDesign(conversationId: string, options: DesignStartOptions, id = newId()): Design {
  const now = Date.now();
  const theme = structuredClone(themeById(options.themeId) ?? defaultTheme());
  const format: DesignFormat = options.format in FORMAT_DEFAULTS ? options.format : 'custom';
  run(
    'INSERT INTO designs (id, conversation_id, format, data, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    id,
    conversationId,
    format,
    JSON.stringify({ theme, artboards: [] } satisfies StoredData),
    now,
    now,
  );
  return getDesign(id);
}

export function getDesign(id: string): Design {
  const row = get<DesignRow>(`${SELECT} WHERE d.id = ?`, id);
  if (!row) throw new Error('Design not found');
  return toDesign(row);
}

export function designForConversation(conversationId: string): Design | undefined {
  const row = get<DesignRow>(`${SELECT} WHERE d.conversation_id = ?`, conversationId);
  return row ? toDesign(row) : undefined;
}

export function listDesigns(): DesignSummary[] {
  const rows = all<DesignRow & { starred: number; task_status: string | null }>(
    `SELECT d.*, c.title AS title, c.starred AS starred, json_extract(c.task, '$.status') AS task_status
     FROM designs d JOIN conversations c ON c.id = d.conversation_id ORDER BY MAX(d.updated_at, c.updated_at) DESC`,
  );
  return rows.map((row) => {
    const design = toDesign(row);
    return {
      id: design.id,
      conversationId: design.conversationId,
      title: design.title,
      format: design.format,
      theme: design.theme,
      artboardCount: design.artboards.length,
      cover: design.artboards[0] ?? null,
      starred: row.starred === 1,
      taskStatus: (row.task_status ?? undefined) as TaskStatus | undefined,
      updatedAt: Math.max(design.updatedAt, row.updated_at),
    };
  });
}

function write(design: Design, source: 'agent' | 'user'): Design {
  const next = { ...design, version: design.version + 1, updatedAt: Date.now() };
  run(
    'UPDATE designs SET format = ?, data = ?, version = ?, updated_at = ? WHERE id = ?',
    next.format,
    JSON.stringify({ theme: next.theme, artboards: next.artboards } satisfies StoredData),
    next.version,
    next.updatedAt,
    next.id,
  );
  bus.emit('design:changed', { designId: next.id, conversationId: next.conversationId, version: next.version, source });
  return next;
}

/** Saves a design edited in the canvas. */
export function saveDesign(input: Design, baseVersion: number): Design {
  const current = getDesign(input.id);
  if (current.version !== baseVersion) throw new DesignConflictError();
  const normalized = normalizeDesign({ ...input, format: input.format }, { id: current.id, conversationId: current.conversationId, createdAt: current.createdAt });
  return write({ ...normalized, title: current.title, version: current.version }, 'user');
}

/** Changes a design from a tool: reads the latest version, applies the change and saves it. */
export function updateDesign<T>(id: string, change: (design: Design) => T): { design: Design; result: T } {
  const design = getDesign(id);
  const draft = structuredClone(design);
  const result = change(draft);
  return { design: write(draft, 'agent'), result };
}

/** Copies a design into another conversation. */
export function copyDesign(sourceId: string, conversationId: string, id?: string): Design {
  const source = getDesign(sourceId);
  const created = createDesign(conversationId, { format: source.format, themeId: source.theme.id }, id);
  return write({ ...created, theme: structuredClone(source.theme), artboards: structuredClone(source.artboards) }, 'user');
}
