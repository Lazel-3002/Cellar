import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { z } from 'zod';
import { LAYOUT_NAMES } from '@shared/design/layouts';
import { customizeTheme, defaultTheme, themeById, THEMES } from '@shared/design/theme';
import type { TodoItem, TodoStatus } from '@shared/types/agent';
import type { DesignTheme } from '@shared/types/design';
import { formatBytes } from '../../lib/util';
import { imageDimensions, type ResolvedImage } from '../../design/images';
import { createPptx as buildPptx, createXlsx as buildXlsx, markdownToDocx, markdownToPdf, type DocumentOptions } from '../documents';
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

const themeInput = z
  .union([
    z.string(),
    z.looseObject({
      preset: z.string().optional(),
      colors: z.looseObject({ background: z.string().optional(), surface: z.string().optional(), text: z.string().optional(), muted: z.string().optional(), primary: z.string().optional(), accent: z.string().optional() }).optional(),
      fonts: z.object({ heading: z.string().optional(), body: z.string().optional() }).optional(),
    }),
  ])
  .optional()
  .describe(`Visual style: a preset (${THEMES.map((t) => `${t.id} = ${t.name}`).join(', ')}), or {"preset": "corporate", "colors": {"primary": "#0F766E"}, "fonts": {"heading": "Georgia"}}. Pick one that fits the purpose and mood.`);

/** A theme from a tool argument; unknown presets fall back to the default look. */
export function documentTheme(value: unknown): DesignTheme {
  if (typeof value === 'string') return structuredClone(themeById(value) ?? defaultTheme());
  if (value && typeof value === 'object') {
    const v = value as { preset?: string; colors?: Record<string, unknown>; fonts?: Record<string, unknown> };
    return customizeTheme(themeById(v.preset) ?? defaultTheme(), { colors: v.colors, fonts: v.fonts });
  }
  return defaultTheme();
}

const IMAGE_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml' };
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** Images referenced by documents: files inside the working folder (or data URLs), never web addresses. */
function documentOptions(ctx: ToolContext, theme: unknown): DocumentOptions {
  return {
    theme: documentTheme(theme),
    image: async (href: string): Promise<ResolvedImage | null> => {
      const data = /^data:(image\/[\w.+-]+);base64,(.+)$/i.exec(href.trim());
      if (data) {
        const bytes = Buffer.from(data[2], 'base64');
        const size = imageDimensions(bytes);
        return size ? { mime: data[1].toLowerCase(), bytes, ...size } : null;
      }
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href) && !/^file:/i.test(href)) return null;
      const abs = await ctx.workspace.resolve(decodeURIComponent(href.replace(/^file:\/\/\/?/i, '')));
      const mime = IMAGE_MIME[extname(abs).toLowerCase()];
      const info = await stat(abs).catch(() => null);
      if (!mime || !info?.isFile() || info.size > MAX_IMAGE_BYTES) return null;
      const bytes = await readFile(abs);
      const size = mime === 'image/svg+xml' ? { width: 800, height: 600 } : imageDimensions(bytes);
      return size ? { mime, bytes, ...size } : null;
    },
  };
}

const DOCUMENT_EXTRAS =
  ' Style it with theme. Charts: a fenced block with language "chart" holding JSON, e.g. ```chart\n{"type": "bar", "title": "Revenue", "labels": ["Q1", "Q2"], "series": [{"name": "2026", "values": [120, 180]}]}\n``` (types: bar, hbar, line, area, pie, donut). Images: ![caption](path/in/working/folder.png).';

const markdownInput = z.object({
  path: z.string().describe('Output file path relative to the working folder.'),
  markdown: z.string().describe('Document content in Markdown.'),
  title: z.string().optional().describe('Document title.'),
  theme: themeInput,
});

export const createDocx = defineTool({
  name: 'create_docx',
  description: `Create a Word document (.docx) from Markdown: headings, paragraphs, bold and italic text, lists, tables, links, quotes and code blocks.${DOCUMENT_EXTRAS}`,
  category: 'edit',
  input: markdownInput,
  async approval(args, ctx) {
    const target = await documentTarget(ctx, args.path, 'docx');
    return { kind: 'document', title: `${target.exists ? 'Replace' : 'Create'} ${target.rel}`, path: target.rel, exists: target.exists, preview: args.markdown.slice(0, 8000) };
  },
  run: (args, ctx) => writeDocument(ctx, args.path, 'docx', 'create_docx', () => markdownToDocx(args.markdown, args.title, documentOptions(ctx, args.theme))),
});

export const createPdf = defineTool({
  name: 'create_pdf',
  description: `Create a designed PDF document from Markdown (headings, lists, tables, links, quotes and code blocks).${DOCUMENT_EXTRAS}`,
  category: 'edit',
  input: markdownInput,
  async approval(args, ctx) {
    const target = await documentTarget(ctx, args.path, 'pdf');
    return { kind: 'document', title: `${target.exists ? 'Replace' : 'Create'} ${target.rel}`, path: target.rel, exists: target.exists, preview: args.markdown.slice(0, 8000) };
  },
  run: (args, ctx) => writeDocument(ctx, args.path, 'pdf', 'create_pdf', () => markdownToPdf(args.markdown, args.title, documentOptions(ctx, args.theme))),
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
  description: `Create a designed PowerPoint presentation (.pptx) with editable text and native charts. Give each slide a layout (${LAYOUT_NAMES.filter((l) => !['article', 'hero', 'app-screen', 'poster'].includes(l)).join(', ')}) and its content; without one, the first slide is a cover and the others are bullet slides. Keep slides short and put detail in notes.`,
  category: 'edit',
  input: z.object({
    path: z.string().describe('Output file path relative to the working folder.'),
    title: z.string().optional().describe('Presentation title.'),
    theme: themeInput,
    slides: z
      .array(
        z.looseObject({
          layout: z.string().optional(),
          title: z.string().optional(),
          subtitle: z.string().optional(),
          kicker: z.string().optional().describe('Short label above the title'),
          bullets: z.array(z.string()).optional(),
          body: z.string().optional(),
          image: z.string().optional().describe('Image file in the working folder'),
          chart: z.looseObject({ type: z.string().optional().describe('bar, hbar, line, area, pie or donut'), labels: z.array(z.string()), series: z.array(z.object({ name: z.string(), values: z.array(z.union([z.number(), z.string()])) })), title: z.string().optional() }).optional(),
          quote: z.string().optional(),
          author: z.string().optional(),
          stats: z.array(z.object({ value: z.string(), label: z.string() })).optional().describe('stats layout: big numbers'),
          columns: z.array(z.looseObject({ title: z.string().optional(), bullets: z.array(z.string()).optional(), body: z.string().optional() })).optional(),
          items: z.array(z.looseObject({ title: z.string(), body: z.string().optional() })).optional().describe('cards layout'),
          notes: z.string().optional().describe('Speaker notes.'),
          elements: z.array(z.looseObject({ type: z.string() })).optional().describe('Extra shapes/text/images placed absolutely in px on a 1920×1080 slide: {"type": "text", "x": 1500, "y": 960, "w": 300, "text": "Confidential", "size": 22, "color": "muted"}'),
        }),
      )
      .min(1),
  }),
  async approval(args, ctx) {
    const target = await documentTarget(ctx, args.path, 'pptx');
    const preview = args.slides.map((s, i) => [`${i + 1}. ${s.title ?? s.quote ?? s.layout ?? 'Slide'}${s.layout ? ` (${s.layout})` : ''}`, ...(s.bullets ?? []).map((b) => `   • ${b}`)].join('\n')).join('\n');
    return { kind: 'document', title: `${target.exists ? 'Replace' : 'Create'} ${target.rel}`, path: target.rel, exists: target.exists, preview };
  },
  run: (args, ctx) => writeDocument(ctx, args.path, 'pptx', 'create_pptx', () => buildPptx(args.slides, args.title, documentOptions(ctx, args.theme))),
});
