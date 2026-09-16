import { normalizeBoard } from '@shared/math/normalize';
import type { MathAngleMode, MathBlock, MathBoard, MathBoardSummary, MathPaper, MathStartOptions } from '@shared/types/math';
import { mathToPlain } from '@shared/math/mathtext';
import type { TaskStatus } from '@shared/types/agent';
import { all, get, run } from '../db/client';
import { bus } from '../lib/events';
import { newId, safeJsonParse } from '../lib/util';

interface BoardRow {
  id: string;
  conversation_id: string;
  topic: string;
  paper: string;
  angle_mode: string;
  data: string;
  version: number;
  created_at: number;
  updated_at: number;
  title: string;
}

interface StoredData {
  blocks: MathBlock[];
}

const SELECT = 'SELECT b.*, c.title AS title FROM boards b JOIN conversations c ON c.id = b.conversation_id';

function toBoard(row: BoardRow): MathBoard {
  const data = safeJsonParse<StoredData>(row.data, { blocks: [] });
  return {
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title || 'Untitled board',
    topic: row.topic,
    paper: (row.paper as MathPaper) || 'grid',
    angleMode: row.angle_mode === 'rad' ? 'rad' : 'deg',
    blocks: Array.isArray(data.blocks) ? data.blocks : [],
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BoardConflictError extends Error {
  constructor() {
    super('The board changed while you were editing (the model may have updated it). Your view has been refreshed; try the change again.');
    this.name = 'BoardConflictError';
  }
}

/** A new, empty board for a conversation that already exists. */
export function createBoard(conversationId: string, options: MathStartOptions = {}, id = newId()): MathBoard {
  const now = Date.now();
  const paper: MathPaper = options.paper && ['grid', 'dots', 'lined', 'plain'].includes(options.paper) ? options.paper : 'grid';
  const angleMode: MathAngleMode = options.angleMode === 'rad' ? 'rad' : 'deg';
  run(
    'INSERT INTO boards (id, conversation_id, topic, paper, angle_mode, data, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)',
    id,
    conversationId,
    (options.topic ?? '').slice(0, 400),
    paper,
    angleMode,
    JSON.stringify({ blocks: [] } satisfies StoredData),
    now,
    now,
  );
  return getBoard(id);
}

export function getBoard(id: string): MathBoard {
  const row = get<BoardRow>(`${SELECT} WHERE b.id = ?`, id);
  if (!row) throw new Error('Board not found');
  return toBoard(row);
}

export function boardForConversation(conversationId: string): MathBoard | undefined {
  const row = get<BoardRow>(`${SELECT} WHERE b.conversation_id = ?`, conversationId);
  return row ? toBoard(row) : undefined;
}

/** The first line of maths on the board, for a card. */
function previewOf(board: MathBoard): string {
  for (const block of board.blocks) {
    if (block.type === 'formula') return mathToPlain(block.formula.split('\n')[0]);
    if (block.type === 'derivation') return mathToPlain(block.result ?? block.steps[0]?.math ?? '');
    if (block.type === 'text' && block.body.trim()) return mathToPlain(block.body.split('\n')[0]).slice(0, 120);
    if (block.type === 'quiz') return `${block.questions.length} question${block.questions.length === 1 ? '' : 's'}`;
  }
  return '';
}

export function listBoards(): MathBoardSummary[] {
  const rows = all<BoardRow & { starred: number; task_status: string | null }>(
    `SELECT b.*, c.title AS title, c.starred AS starred, json_extract(c.task, '$.status') AS task_status
     FROM boards b JOIN conversations c ON c.id = b.conversation_id ORDER BY MAX(b.updated_at, c.updated_at) DESC`,
  );
  return rows.map((row) => {
    const board = toBoard(row);
    return {
      id: board.id,
      conversationId: board.conversationId,
      title: board.title,
      topic: board.topic,
      blockCount: board.blocks.length,
      preview: previewOf(board),
      counts: {
        derivations: board.blocks.filter((block) => block.type === 'derivation').length,
        figures: board.blocks.filter((block) => block.type === 'figure' || block.type === 'plot').length,
        quizzes: board.blocks.filter((block) => block.type === 'quiz').length,
        sketches: board.blocks.filter((block) => block.type === 'sketch').length,
      },
      starred: row.starred === 1,
      taskStatus: (row.task_status ?? undefined) as TaskStatus | undefined,
      updatedAt: Math.max(board.updatedAt, row.updated_at),
    };
  });
}

function write(board: MathBoard, source: 'agent' | 'user'): MathBoard {
  const next = { ...board, version: board.version + 1, updatedAt: Date.now() };
  run(
    'UPDATE boards SET topic = ?, paper = ?, angle_mode = ?, data = ?, version = ?, updated_at = ? WHERE id = ?',
    next.topic,
    next.paper,
    next.angleMode,
    JSON.stringify({ blocks: next.blocks } satisfies StoredData),
    next.version,
    next.updatedAt,
    next.id,
  );
  bus.emit('math:changed', { boardId: next.id, conversationId: next.conversationId, version: next.version, source });
  return next;
}

/** Saves a board edited in the editor. */
export function saveBoard(input: MathBoard, baseVersion: number): MathBoard {
  const current = getBoard(input.id);
  if (current.version !== baseVersion) throw new BoardConflictError();
  const normalized = normalizeBoard(input, { id: current.id, conversationId: current.conversationId, createdAt: current.createdAt });
  return write({ ...normalized, title: current.title, version: current.version }, 'user');
}

/** Changes a board from a tool: reads the latest version, applies the change and saves it. */
export function updateBoard<T>(id: string, change: (board: MathBoard) => T): { board: MathBoard; result: T } {
  const board = getBoard(id);
  const draft = structuredClone(board);
  const result = change(draft);
  draft.blocks = draft.blocks.slice(0, 200);
  return { board: write(draft, 'agent'), result };
}

/** Copies a board into another conversation. */
export function copyBoard(sourceId: string, conversationId: string, id?: string): MathBoard {
  const source = getBoard(sourceId);
  const created = createBoard(conversationId, { topic: source.topic, paper: source.paper, angleMode: source.angleMode }, id);
  return write({ ...created, blocks: structuredClone(source.blocks) }, 'user');
}
