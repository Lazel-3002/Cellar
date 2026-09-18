import { readFile } from 'node:fs/promises';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { lexer, Marked, type Token, type Tokens } from 'marked';
import { chartSvg, escapeXml, normalizeChart } from '@shared/design/charts';
import { layoutContent, layoutName, type LayoutName } from '@shared/design/layouts';
import { LIMITS, normalizeElement } from '@shared/design/normalize';
import { buildLayout } from '@shared/design/ops';
import { contrastRatio, defaultTheme, fontStack, hex6, readableOn } from '@shared/design/theme';
import type { Artboard, ChartSpec, DesignTheme } from '@shared/types/design';
import { extractPdfText } from '../chat/attachments';
import type { ResolvedImage } from '../design/images';
import { artboardsToPptx } from '../design/pptx';
import { decodeEntities } from './html';
import { parseLooseJson } from './text-protocol';

/* ───────────────────────── Shared: themes, charts and images ───────────────────────── */

export type SvgRasterizer = (svg: string, width: number, height: number) => Promise<Buffer | null>;
export type GradientRasterizer = (css: string, width: number, height: number, radius: number, shape: 'rect' | 'ellipse') => Promise<Buffer | null>;

let svgRasterizer: SvgRasterizer | null = null;
let gradientRasterizer: GradientRasterizer | null = null;

/** Installed by the app: turns chart SVGs into PNGs for Word and PowerPoint. */
export function setSvgRasterizer(rasterizer: SvgRasterizer | null): void {
  svgRasterizer = rasterizer;
}

/** Installed by the app: turns a gradient into a real PNG for PowerPoint, which can't fill a shape with one. */
export function setGradientRasterizer(rasterizer: GradientRasterizer | null): void {
  gradientRasterizer = rasterizer;
}

export interface DocumentOptions {
  theme?: DesignTheme;
  /** Loads an image referenced by Markdown (a path in the working folder). */
  image?: (href: string) => Promise<ResolvedImage | null>;
}

/** A chart from a ```chart fenced block (JSON), or null when the block is not a readable chart. */
export function chartFromCode(code: Pick<Tokens.Code, 'lang' | 'text'>): ChartSpec | null {
  if ((code.lang ?? '').trim().toLowerCase() !== 'chart') return null;
  try {
    const spec = normalizeChart(parseLooseJson(code.text));
    return spec.series.length ? spec : null;
  } catch {
    return null;
  }
}

function walkTokens(tokens: Token[], visit: (token: Token) => void): void {
  for (const token of tokens) {
    visit(token);
    if ('tokens' in token && Array.isArray(token.tokens)) walkTokens(token.tokens, visit);
    if (token.type === 'list') for (const item of (token as Tokens.List).items) walkTokens(item.tokens, visit);
    if (token.type === 'table') {
      const table = token as Tokens.Table;
      for (const cell of [...table.header, ...table.rows.flat()]) walkTokens(cell.tokens, visit);
    }
  }
}

async function loadImages(tokens: Token[], options: DocumentOptions): Promise<Map<string, ResolvedImage>> {
  const images = new Map<string, ResolvedImage>();
  if (!options.image) return images;
  const hrefs = new Set<string>();
  walkTokens(tokens, (t) => {
    if (t.type === 'image') hrefs.add((t as Tokens.Image).href);
  });
  for (const href of hrefs) {
    const image = await options.image(href).catch(() => null);
    if (image) images.set(href, image);
  }
  return images;
}

/* ───────────────────────── Word (.docx) from Markdown ───────────────────────── */

type RunStyle = { bold?: boolean; italics?: boolean; strike?: boolean; code?: boolean };
type Inline = TextRun | ExternalHyperlink | ImageRun;

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const NUMBERING_REF = 'cellar-numbers';
const DOCX_CONTENT_WIDTH = 600;

interface DocxContext {
  listInstance: number;
  theme: DesignTheme;
  images: Map<string, ResolvedImage>;
  charts: Map<string, Buffer | null>;
}

function run(text: string, style: RunStyle, ctx: DocxContext, characterStyle?: string): TextRun {
  return new TextRun({
    text,
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    ...(style.code ? { font: 'Consolas', size: 20, shading: { type: ShadingType.CLEAR, fill: hex6(ctx.theme.colors.surface), color: 'auto' } } : {}),
    ...(characterStyle ? { style: characterStyle } : {}),
  });
}

function plainText(tokens: Token[] | undefined): string {
  return (tokens ?? []).map((t) => ('tokens' in t && t.tokens?.length ? plainText(t.tokens) : 'text' in t ? decodeEntities(String(t.text)) : '')).join('');
}

const DOCX_IMAGE_TYPES: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };

function imageRun(image: ResolvedImage, maxWidth = DOCX_CONTENT_WIDTH): ImageRun | null {
  const type = DOCX_IMAGE_TYPES[image.mime];
  if (!type) return null;
  const scale = Math.min(1, maxWidth / image.width);
  return new ImageRun({ type, data: image.bytes, transformation: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) } });
}

function inlineRuns(tokens: Token[] | undefined, ctx: DocxContext, style: RunStyle = {}): Inline[] {
  const out: Inline[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'strong':
        out.push(...inlineRuns(t.tokens, ctx, { ...style, bold: true }));
        break;
      case 'em':
        out.push(...inlineRuns(t.tokens, ctx, { ...style, italics: true }));
        break;
      case 'del':
        out.push(...inlineRuns(t.tokens, ctx, { ...style, strike: true }));
        break;
      case 'codespan':
        out.push(run(decodeEntities(t.text), { ...style, code: true }, ctx));
        break;
      case 'br':
        out.push(new TextRun({ text: '', break: 1 }));
        break;
      case 'link':
        out.push(new ExternalHyperlink({ link: t.href, children: [run(plainText(t.tokens) || t.href, style, ctx, 'Hyperlink')] }));
        break;
      case 'image': {
        const image = ctx.images.get((t as Tokens.Image).href);
        const picture = image ? imageRun(image) : null;
        out.push(picture ?? run(`[${t.text || 'image'}]`, style, ctx));
        break;
      }
      case 'html':
        out.push(run(decodeEntities(t.text.replace(/<[^>]*>/g, '')), style, ctx));
        break;
      default:
        if ('tokens' in t && t.tokens?.length) out.push(...inlineRuns(t.tokens, ctx, style));
        else if ('text' in t) out.push(run(decodeEntities(String(t.text)), style, ctx));
    }
  }
  return out;
}

function listParagraphs(list: Tokens.List, level: number, ctx: DocxContext): Paragraph[] {
  const out: Paragraph[] = [];
  const instance = ++ctx.listInstance;
  for (const item of list.items) {
    for (const tok of item.tokens) {
      if (tok.type === 'list') {
        out.push(...listParagraphs(tok as Tokens.List, Math.min(level + 1, 8), ctx));
        continue;
      }
      const inline = 'tokens' in tok && tok.tokens?.length ? inlineRuns(tok.tokens, ctx) : 'text' in tok ? [run(decodeEntities(String(tok.text)), {}, ctx)] : [];
      if (inline.length === 0) continue;
      if (item.task) inline.unshift(new TextRun(item.checked ? '☑ ' : '☐ '));
      out.push(
        new Paragraph({
          children: inline,
          ...(list.ordered ? { numbering: { reference: NUMBERING_REF, level, instance } } : { bullet: { level } }),
        }),
      );
    }
  }
  return out;
}

function tableBlock(table: Tokens.Table, ctx: DocxContext): Table {
  const headerFill = hex6(ctx.theme.colors.primary);
  const headerText = hex6(readableOn(ctx.theme.colors.primary));
  const border = { style: BorderStyle.SINGLE, size: 4, color: hex6(ctx.theme.colors.surface) };
  const cell = (c: Tokens.TableCell, header: boolean, zebra: boolean) =>
    new TableCell({
      children: [new Paragraph({ children: header ? [new TextRun({ text: plainText(c.tokens), bold: true, color: headerText })] : inlineRuns(c.tokens, ctx) })],
      ...(header ? { shading: { type: ShadingType.CLEAR, fill: headerFill, color: 'auto' } } : zebra ? { shading: { type: ShadingType.CLEAR, fill: hex6(ctx.theme.colors.surface), color: 'auto' } } : {}),
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      borders: { top: border, bottom: border, left: border, right: border },
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, children: table.header.map((c) => cell(c, true, false)) }), ...table.rows.map((row, i) => new TableRow({ children: row.map((c) => cell(c, false, i % 2 === 1)) }))],
  });
}

function chartTable(spec: ChartSpec, ctx: DocxContext): Table {
  const rows = spec.labels.map((label, i) => [label, ...spec.series.map((s) => String(s.values[i] ?? ''))]);
  const token = { header: ['', ...spec.series.map((s) => s.name)].map((text) => ({ text, tokens: [{ type: 'text', raw: text, text }] })), rows: rows.map((r) => r.map((text) => ({ text, tokens: [{ type: 'text', raw: text, text }] }))) } as unknown as Tokens.Table;
  return tableBlock(token, ctx);
}

function blockElements(tokens: Token[], ctx: DocxContext, quote = false): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  const quoteStyle = quote ? { indent: { left: 567 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: hex6(ctx.theme.colors.accent), space: 10 } } } : {};
  for (const t of tokens) {
    switch (t.type) {
      case 'heading':
        out.push(new Paragraph({ heading: HEADINGS[Math.min(5, t.depth - 1)], children: inlineRuns(t.tokens, ctx) }));
        break;
      case 'paragraph':
      case 'text':
        out.push(new Paragraph({ children: inlineRuns('tokens' in t && t.tokens?.length ? t.tokens : [t], ctx, quote ? { italics: true } : {}), ...quoteStyle }));
        break;
      case 'list':
        out.push(...listParagraphs(t as Tokens.List, 0, ctx));
        break;
      case 'code': {
        const code = t as Tokens.Code;
        const spec = chartFromCode(code);
        if (spec) {
          const png = ctx.charts.get(code.text);
          if (spec.title) out.push(new Paragraph({ children: [new TextRun({ text: spec.title, bold: true, color: hex6(ctx.theme.colors.text) })], spacing: { before: 160 } }));
          if (png) out.push(new Paragraph({ children: [new ImageRun({ type: 'png', data: png, transformation: { width: DOCX_CONTENT_WIDTH, height: Math.round(DOCX_CONTENT_WIDTH * 0.56) } })], alignment: AlignmentType.CENTER }));
          else out.push(chartTable(spec, ctx));
          out.push(new Paragraph({ children: [] }));
          break;
        }
        for (const line of code.text.split('\n')) {
          out.push(new Paragraph({ children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 19 })], shading: { type: ShadingType.CLEAR, fill: hex6(ctx.theme.colors.surface), color: 'auto' }, spacing: { after: 0 } }));
        }
        out.push(new Paragraph({ children: [] }));
        break;
      }
      case 'blockquote':
        out.push(...blockElements((t as Tokens.Blockquote).tokens, ctx, true));
        break;
      case 'table':
        out.push(tableBlock(t as Tokens.Table, ctx), new Paragraph({ children: [] }));
        break;
      case 'hr':
        out.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: hex6(ctx.theme.colors.accent), space: 1 } } }));
        break;
      case 'html': {
        const text = decodeEntities((t as Tokens.HTML).text.replace(/<[^>]*>/g, '')).trim();
        if (text) out.push(new Paragraph({ children: [run(text, {}, ctx)] }));
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export async function markdownToDocx(markdown: string, title?: string, options: DocumentOptions = {}): Promise<Buffer> {
  const theme = options.theme ?? defaultTheme();
  const tokens = lexer(markdown);
  const charts = new Map<string, Buffer | null>();
  walkTokens(tokens, (t) => {
    if (t.type === 'code' && chartFromCode(t as Tokens.Code)) charts.set((t as Tokens.Code).text, null);
  });
  if (svgRasterizer) {
    for (const code of charts.keys()) {
      const spec = chartFromCode({ lang: 'chart', text: code })!;
      charts.set(code, await svgRasterizer(chartSvg(spec, 1200, 672, { theme: { ...theme, colors: { ...theme.colors, background: '#FFFFFF' } } }), 1200, 672));
    }
  }
  const ctx: DocxContext = { listInstance: 0, theme, images: await loadImages(tokens, options), charts };
  const children = blockElements(tokens, ctx);
  const startsWithHeading = tokens.find((t) => t.type !== 'space')?.type === 'heading';
  if (title && !startsWithHeading) children.unshift(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }));
  const c = theme.colors;
  const white = contrastRatio(c.background, '#FFFFFF') < 1.08;
  const heading = (size: number, color: string) => ({ run: { font: theme.fonts.heading, size, bold: true, color: hex6(color) }, paragraph: { spacing: { before: Math.round(size * 9), after: 120 } } });
  const doc = new Document({
    creator: 'Cellar',
    title: title ?? '',
    ...(white ? {} : { background: { color: hex6(c.background) } }),
    styles: {
      default: {
        document: { run: { font: theme.fonts.body, size: 22, color: hex6(c.text) }, paragraph: { spacing: { after: 120, line: 288 } } },
        title: { run: { font: theme.fonts.heading, size: 60, bold: true, color: hex6(c.text) }, paragraph: { spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: hex6(c.accent), space: 8 } } } },
        heading1: heading(36, c.primary),
        heading2: heading(28, c.text),
        heading3: heading(24, c.primary),
        heading4: heading(22, c.text),
        heading5: heading(22, c.muted),
        heading6: heading(20, c.muted),
        hyperlink: { run: { color: hex6(c.primary), underline: { type: 'single' } } },
      },
    },
    numbering: {
      config: [
        {
          reference: NUMBERING_REF,
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: children.length ? children : [new Paragraph({ children: [] })] }],
  });
  return Packer.toBuffer(doc);
}

/* ───────────────────────── Excel (.xlsx) ───────────────────────── */

export interface SheetInput {
  name?: string;
  rows: unknown[][];
  /** Bold and freeze the first row (default true). */
  header?: boolean;
  column_widths?: number[];
}

function sheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    base = base.slice(0, 28);
    candidate = `${base} ${i}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function cellValue(value: unknown): ExcelJS.CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.startsWith('=') && value.length > 1 ? { formula: value.slice(1) } : value;
  return JSON.stringify(value);
}

export async function createXlsx(sheets: SheetInput[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Cellar';
  const used = new Set<string>();
  sheets.forEach((sheet, index) => {
    const ws = workbook.addWorksheet(sheetName(sheet.name ?? `Sheet ${index + 1}`, used));
    const rows = Array.isArray(sheet.rows) ? sheet.rows.map((r) => (Array.isArray(r) ? r : [r])) : [];
    for (const row of rows) ws.addRow(row.map(cellValue));
    if (sheet.header !== false && rows.length > 0) {
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    }
    const columns = Math.max(0, ...rows.map((r) => r.length));
    for (let c = 0; c < columns; c++) {
      const longest = Math.max(...rows.map((r) => String(r[c] ?? '').length));
      ws.getColumn(c + 1).width = sheet.column_widths?.[c] ?? Math.min(60, Math.max(8, longest + 2));
    }
  });
  if (sheets.length === 0) workbook.addWorksheet('Sheet 1');
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/* ───────────────────────── PowerPoint (.pptx) ───────────────────────── */

export interface SlideInput {
  title?: string;
  subtitle?: string;
  bullets?: string[];
  notes?: string;
  /** A layout name (see LAYOUTS); by default the first slide without bullets is a cover and the rest are bullet slides. */
  layout?: string;
  kicker?: string;
  body?: string;
  /** Path of an image in the working folder. */
  image?: string;
  chart?: unknown;
  quote?: string;
  author?: string;
  stats?: Array<{ value: string; label: string }>;
  columns?: Array<{ title?: string; body?: string; bullets?: string[] }>;
  items?: Array<{ title: string; body?: string }>;
  footer?: string;
  background?: string;
  /** Extra elements positioned in pixels on a 1920×1080 slide. */
  elements?: unknown[];
}

const SLIDE_SIZE = { width: 1920, height: 1080 };

/** Slides → artboards through the Design layouts, then PowerPoint through the Design exporter. */
export async function createPptx(slides: SlideInput[], title?: string, options: DocumentOptions = {}): Promise<Buffer> {
  const theme = options.theme ?? defaultTheme();
  const images = new Map<string, ResolvedImage>();
  const ids = new Set<string>();
  const artboards: Artboard[] = [];
  const notes: string[] = [];
  for (const [i, slide] of slides.entries()) {
    const bullets = (slide.bullets ?? []).map(String).filter((b) => b.trim());
    const fallback: LayoutName = i === 0 && bullets.length === 0 && !slide.chart && !slide.body ? 'title' : slide.chart && !bullets.length ? 'chart' : 'bullets';
    const layout = layoutName(slide.layout) ?? fallback;
    let imageSrc: string | undefined;
    if (slide.image && options.image) {
      const image = await options.image(slide.image).catch(() => null);
      if (image) {
        imageSrc = `asset:${images.size + 1}`;
        images.set(imageSrc, image);
      } else notes.push(`Slide ${i + 1}: image "${slide.image}" could not be read.`);
    }
    const content = layoutContent({ ...slide, bullets, image: imageSrc ?? (slide.image ? '' : undefined) } as Record<string, unknown>);
    const built = buildLayout(layout, content, SLIDE_SIZE, theme, ids);
    const artboard: Artboard = { id: `a${i + 1}`, name: slide.title || `Slide ${i + 1}`, ...SLIDE_SIZE, background: slide.background ?? built.background ?? 'background', elements: built.elements, ...(slide.notes ? { notes: slide.notes } : {}) };
    for (const raw of (slide.elements ?? []).slice(0, LIMITS.elements)) {
      const { element } = normalizeElement(raw, { ...SLIDE_SIZE, theme, ids });
      if (element) artboard.elements.push(element);
    }
    artboards.push(artboard);
  }
  return artboardsToPptx(artboards, theme, { title: title ?? slides[0]?.title ?? 'Presentation' }, {
    image: async (src) => images.get(src) ?? null,
    rasterize: svgRasterizer ?? undefined,
    gradient: gradientRasterizer ?? undefined,
  });
}

/* ───────────────────────── PDF (rendered by Chromium in the app) ───────────────────────── */

export type PdfRenderer = (html: string) => Promise<Buffer>;

let pdfRenderer: PdfRenderer | null = null;

export function setPdfRenderer(renderer: PdfRenderer | null): void {
  pdfRenderer = renderer;
}

export const pdfAvailable = (): boolean => pdfRenderer !== null;

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function themeCss(theme: DesignTheme): string {
  const c = theme.colors;
  return `
  /* Zero page margins let the theme background reach the edges; cloned body padding repeats the margins on every page. */
  @page { size: A4; margin: 0; }
  html { background: ${c.background}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: ${fontStack(theme.fonts.body)}; font-size: 11pt; line-height: 1.55; color: ${c.text}; background: ${c.background}; margin: 0; padding: 18mm 16mm; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  h1, h2, h3, h4 { font-family: ${fontStack(theme.fonts.heading)}; line-height: 1.2; margin: 1.3em 0 0.45em; page-break-after: avoid; }
  h1 { font-size: 24pt; color: ${c.text}; }
  body > h1:first-child, .doc-title { font-size: 30pt; margin-top: 0; padding-bottom: 10px; border-bottom: 3px solid ${c.accent}; }
  h2 { font-size: 16pt; color: ${c.primary}; }
  h3 { font-size: 13pt; color: ${c.text}; }
  h4 { font-size: 11.5pt; color: ${c.muted}; text-transform: uppercase; letter-spacing: 0.06em; }
  p, ul, ol, table, pre, blockquote, figure { margin: 0.55em 0; }
  li::marker { color: ${c.primary}; }
  table { border-collapse: collapse; width: 100%; page-break-inside: avoid; font-size: 10pt; }
  th, td { border-bottom: 1px solid ${c.surface}; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: ${c.primary}; color: ${readableOn(c.primary)}; font-weight: 600; }
  tr:nth-child(even) td { background: ${c.surface}; }
  code { font-family: Consolas, monospace; font-size: 9.5pt; background: ${c.surface}; padding: 0 3px; border-radius: 3px; }
  pre { background: ${c.surface}; padding: 9px 11px; border-radius: 6px; white-space: pre-wrap; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid ${c.accent}; padding: 2px 0 2px 12px; color: ${c.muted}; font-style: italic; }
  hr { border: 0; border-top: 2px solid ${c.accent}; margin: 1.4em 0; }
  a { color: ${c.primary}; }
  img { max-width: 100%; border-radius: 4px; }
  figure { page-break-inside: avoid; text-align: center; }
  figure svg { width: 100%; height: auto; display: block; }
  figcaption { font-size: 9pt; color: ${c.muted}; margin-top: 4px; }`;
}

export interface ResolvedDocumentAssets {
  images?: Map<string, ResolvedImage>;
}

export function markdownToHtmlPage(markdown: string, title?: string, options: DocumentOptions & ResolvedDocumentAssets = {}): string {
  const theme = options.theme ?? defaultTheme();
  const marked = new Marked({ gfm: true, async: false });
  marked.use({
    renderer: {
      code(token) {
        const spec = chartFromCode(token);
        if (!spec) return false;
        return `<figure>${chartSvg(spec, 680, 380, { theme })}</figure>`;
      },
      image(token) {
        const image = options.images?.get(token.href);
        if (!image) return `<span>[${escapeHtml(token.text || 'image')}]</span>`;
        const alt = escapeXml(token.text ?? '');
        return `<img src="data:${image.mime};base64,${image.bytes.toString('base64')}" alt="${alt}">`;
      },
    },
  });
  const body = marked.parse(markdown) as string;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title ?? 'Document')}</title>
<style>${themeCss(theme)}</style></head><body>${title && !/^\s*#\s/.test(markdown) ? `<h1 class="doc-title">${escapeHtml(title)}</h1>` : ''}${body}</body></html>`;
}

export async function markdownToPdf(markdown: string, title?: string, options: DocumentOptions = {}): Promise<Buffer> {
  if (!pdfRenderer) throw new Error('PDF export is not available in this environment.');
  const images = await loadImages(lexer(markdown), options);
  return pdfRenderer(markdownToHtmlPage(markdown, title, { ...options, images }));
}

/* ───────────────────────── Reading documents ───────────────────────── */

export const DOCUMENT_EXTENSIONS = new Set(['pdf', 'docx', 'pptx', 'xlsx']);

function xmlToText(xml: string, paragraphTag: string): string {
  return decodeEntities(
    xml
      .replace(new RegExp(`</${paragraphTag}>`, 'g'), '\n')
      .replace(/<w:tab\/>|<a:tab\/>/g, '\t')
      .replace(/<w:br\/>|<a:br\/>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function excelCellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined) return excelCellText(value.result as ExcelJS.CellValue);
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value) return String(value.text);
    if ('error' in value) return String(value.error);
    return '';
  }
  return String(value);
}

export async function extractDocumentText(path: string, maxRows = 2000): Promise<string> {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const bytes = await readFile(path);
  if (ext === 'pdf') return extractPdfText(bytes);
  if (ext === 'docx') {
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('word/document.xml')?.async('string');
    if (!xml) throw new Error('This .docx file has no document body.');
    return xmlToText(xml, 'w:p');
  }
  if (ext === 'pptx') {
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files)
      .map((name) => ({ name, n: Number(name.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]) }))
      .filter((s) => Number.isFinite(s.n))
      .sort((a, b) => a.n - b.n);
    const parts: string[] = [];
    for (const s of slides) parts.push(`--- Slide ${s.n} ---\n${xmlToText((await zip.file(s.name)?.async('string')) ?? '', 'a:p')}`);
    return parts.join('\n\n');
  }
  if (ext === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
    const parts: string[] = [];
    workbook.eachSheet((ws) => {
      const lines: string[] = [`--- Sheet: ${ws.name} (${ws.rowCount} rows) ---`];
      let count = 0;
      ws.eachRow({ includeEmpty: false }, (row) => {
        if (count++ >= maxRows) return;
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        lines.push(values.map((v) => excelCellText(v as ExcelJS.CellValue)).join(' | '));
      });
      if (ws.rowCount > maxRows) lines.push(`[… ${ws.rowCount - maxRows} more rows]`);
      parts.push(lines.join('\n'));
    });
    return parts.join('\n\n');
  }
  throw new Error(`Cannot read .${ext} files.`);
}
