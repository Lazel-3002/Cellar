import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { z } from 'zod';
import type { TodoItem, TodoStatus } from '@shared/types/agent';
import { formatBytes } from '../../lib/util';
import { createPptx as buildPptx, createXlsx as buildXlsx, markdownToDocx, markdownToPdf } from '../documents';
import { defineTool, ToolError, type ToolContext } from './types';

const STATUS_ALIASES: Record<string, TodoStatus> = {
  pending: 'pending',
  todo: 'pending',
  'not started': 'pending',
  not_started: 'pending',
  open: 'pending',
  in_progress: 'in_progress',
  'in progress': 'in_progress',
  'in-progress': 'in_progress',
  inprogress: 'in_progress',
  active: 'in_progress',
  doing: 'in_progress',
  started: 'in_progress',
  completed: 'completed',
  complete: 'completed',
  done: 'completed',
  finished: 'completed',
};

export const todoWrite = defineTool({
  name: 'todo_write',
  description:
    'Create or update the task plan the user sees. Send the complete list each time. Keep one item in_progress while you work on it and mark items completed as soon as they are done.',
  category: 'plan',
  input: z.object({
    todos: z
      .array(
        z.object({
          content: z.string().min(1).describe('What this step does, in a few words.'),
          status: z.enum(['pending', 'in_progress', 'completed']),
        }),
      )
      .max(40),
  }),
  async run(args, ctx) {
    const todos: TodoItem[] = args.todos.map((t) => ({ content: t.content.trim().slice(0, 300), status: t.status }));
    ctx.setTodos(todos);
    const done = todos.filter((t) => t.status === 'completed').length;
    const current = todos.find((t) => t.status === 'in_progress');
    return `Plan updated: ${done} of ${todos.length} done${current ? `, now working on "${current.content}"` : ''}.`;
  },
});

/** Models sometimes send the list as a JSON string or use other words for the statuses. */
export function normalizeTodoArgs(raw: Record<string, unknown>): Record<string, unknown> {
  let todos = raw.todos ?? raw.items ?? raw.plan;
  if (typeof todos === 'string') {
    try {
      todos = JSON.parse(todos);
    } catch {
      // leave for validation to report
    }
  }
  if (!Array.isArray(todos)) return raw;
  return {
    todos: todos.map((item) => {
      if (typeof item === 'string') return { content: item, status: 'pending' };
      const obj = (item ?? {}) as Record<string, unknown>;
      const status = STATUS_ALIASES[String(obj.status ?? 'pending').trim().toLowerCase()] ?? obj.status;
      return { content: obj.content ?? obj.task ?? obj.title ?? obj.text ?? '', status };
    }),
  };
}

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.csv', '.tsv', '.json', '.html', '.htm', '.xml', '.yaml', '.yml', '.rtf']);
const DOCUMENT_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx', '.pdf', '.doc', '.xls', '.ppt', '.odt', '.ods', '.odp']);

/**
 * Where a document tool writes. A missing extension is added; a different known extension is
 * refused, so a model that picks the wrong tool is told which one to use instead.
 */
async function documentPath(ctx: ToolContext, rawPath: string, ext: string): Promise<{ abs: string; rel: string }> {
  const abs = await ctx.workspace.resolve(rawPath);
  const current = extname(abs).toLowerCase();
  if (current === `.${ext}`) return { abs, rel: ctx.workspace.relative(abs) };
  if (TEXT_EXTENSIONS.has(current)) throw new ToolError(`create_${ext} makes .${ext} files. To create ${ctx.workspace.relative(abs)}, use write_file.`);
  if (DOCUMENT_EXTENSIONS.has(current)) {
    const tool = ['.docx', '.xlsx', '.pptx', '.pdf'].includes(current) ? `create_${current.slice(1)}` : null;
    throw new ToolError(`create_${ext} makes .${ext} files, not ${current}.${tool ? ` Use ${tool} instead.` : ''}`);
  }
  const withExt = await ctx.workspace.resolve(`${ctx.workspace.relative(abs)}.${ext}`);
  return { abs: withExt, rel: ctx.workspace.relative(withExt) };
}

async function writeDocument(ctx: ToolContext, rawPath: string, ext: string, tool: string, make: () => Promise<Buffer>) {
  const { abs, rel } = await documentPath(ctx, rawPath, ext);
  const existing = await stat(abs).catch(() => null);
  if (existing?.isDirectory()) throw new ToolError(`${rel} is a folder.`);
  const bytes = await make();
  await mkdir(dirname(abs), { recursive: true });
  try {
    await writeFile(abs, bytes);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EBUSY' || (err as NodeJS.ErrnoException).code === 'EPERM') {
      throw new ToolError(`${rel} is open in another program. Ask the user to close it, or save under a different name.`);
    }
    throw err;
  }
  ctx.recordFile({ absolutePath: abs, action: existing ? 'modified' : 'created', tool, bytes: bytes.length });
  return `${existing ? 'Replaced' : 'Created'} ${rel} (${formatBytes(bytes.length)}).`;
}

async function documentTarget(ctx: ToolContext, rawPath: string, ext: string) {
  const { abs, rel } = await documentPath(ctx, rawPath, ext);
  return { rel, exists: !!(await stat(abs).catch(() => null)) };
}

const markdownInput = z.object({
  path: z.string().describe('Output file path relative to the working folder.'),
  markdown: z.string().describe('Document content in Markdown.'),
  title: z.string().optional().describe('Document title.'),
});

export const createDocx = defineTool({
  name: 'create_docx',
  description: 'Create a Word document (.docx) from Markdown. Supports headings, paragraphs, bold and italic text, bulleted and numbered lists, tables, links, quotes and code blocks.',
  category: 'edit',
  input: markdownInput,
  async approval(args, ctx) {
    const target = await documentTarget(ctx, args.path, 'docx');
    return { kind: 'document', title: `${target.exists ? 'Replace' : 'Create'} ${target.rel}`, path: target.rel, exists: target.exists, preview: args.markdown.slice(0, 8000) };
  },
  run: (args, ctx) => writeDocument(ctx, args.path, 'docx', 'create_docx', () => markdownToDocx(args.markdown, args.title)),
});

export const createPdf = defineTool({
  name: 'create_pdf',
  description: 'Create a PDF document from Markdown (headings, lists, tables, links, quotes and code blocks).',
  category: 'edit',
  input: markdownInput,
  async approval(args, ctx) {
    const target = await documentTarget(ctx, args.path, 'pdf');
    return { kind: 'document', title: `${target.exists ? 'Replace' : 'Create'} ${target.rel}`, path: target.rel, exists: target.exists, preview: args.markdown.slice(0, 8000) };
  },
  run: (args, ctx) => writeDocument(ctx, args.path, 'pdf', 'create_pdf', () => markdownToPdf(args.markdown, args.title)),
});

const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const sheetInput = z.object({
  name: z.string().optional().describe('Sheet name.'),
  columns: z.array(z.string()).optional().describe('Column headers, written as a bold, frozen first row.'),
  rows: z.array(z.array(cell)).describe('Data rows of cell values (without the headers).'),
});

/** Headers go in `columns`; without them the rows are written as they are. */
function toSheets(sheets: Array<z.output<typeof sheetInput>>) {
  return sheets.map((s) => (s.columns?.length ? { name: s.name, rows: [s.columns, ...s.rows], header: true } : { name: s.name, rows: s.rows, header: false }));
}

export const createXlsx = defineTool({
  name: 'create_xlsx',
  description: 'Create an Excel workbook (.xlsx) with one or more sheets. Put the column headers in columns and the data in rows. Strings starting with "=" become formulas, e.g. "=SUM(B2:B10)".',
  category: 'edit',
  input: z.object({
    path: z.string().describe('Output file path relative to the working folder.'),
    sheets: z.array(sheetInput).min(1),
  }),
  async approval(args, ctx) {
    const target = await documentTarget(ctx, args.path, 'xlsx');
    const preview = toSheets(args.sheets)
      .map((s, i) => {
        const width = Math.max(0, ...s.rows.map((r) => r.length));
        const sample = s.rows.slice(0, 7).map((r) => r.map((c) => String(c ?? '')).join(' | '));
        return [`Sheet "${s.name ?? `Sheet ${i + 1}`}": ${s.rows.length - (s.header ? 1 : 0)} rows × ${width} columns`, ...sample].join('\n');
      })
      .join('\n\n');
    return { kind: 'document', title: `${target.exists ? 'Replace' : 'Create'} ${target.rel}`, path: target.rel, exists: target.exists, preview };
  },
  run: (args, ctx) => writeDocument(ctx, args.path, 'xlsx', 'create_xlsx', () => buildXlsx(toSheets(args.sheets))),
});

export const createPptx = defineTool({
  name: 'create_pptx',
  description: 'Create a PowerPoint presentation (.pptx). Each slide has a title and optional subtitle, bullet points and speaker notes. A first slide without bullets becomes the title slide.',
  category: 'edit',
  input: z.object({
    path: z.string().describe('Output file path relative to the working folder.'),
    title: z.string().optional().describe('Presentation title.'),
    slides: z
      .array(
        z.object({
          title: z.string(),
          subtitle: z.string().optional(),
          bullets: z.array(z.string()).optional(),
          notes: z.string().optional().describe('Speaker notes.'),
        }),
      )
      .min(1),
  }),
  async approval(args, ctx) {
    const target = await documentTarget(ctx, args.path, 'pptx');
    const preview = args.slides.map((s, i) => [`${i + 1}. ${s.title}`, ...(s.bullets ?? []).map((b) => `   • ${b}`)].join('\n')).join('\n');
    return { kind: 'document', title: `${target.exists ? 'Replace' : 'Create'} ${target.rel}`, path: target.rel, exists: target.exists, preview };
  },
  run: (args, ctx) => writeDocument(ctx, args.path, 'pptx', 'create_pptx', () => buildPptx(args.slides, args.title)),
});
