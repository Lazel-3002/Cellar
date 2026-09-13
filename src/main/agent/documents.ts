import { readFile } from 'node:fs/promises';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
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
import { lexer, parse as parseMarkdown, type Token, type Tokens } from 'marked';
import PptxGenJS from 'pptxgenjs';
import { extractPdfText } from '../chat/attachments';
import { decodeEntities } from './html';

/* ───────────────────────── Word (.docx) from Markdown ───────────────────────── */

type RunStyle = { bold?: boolean; italics?: boolean; strike?: boolean; code?: boolean };
type Inline = TextRun | ExternalHyperlink;

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const NUMBERING_REF = 'cellar-numbers';

function run(text: string, style: RunStyle, characterStyle?: string): TextRun {
  return new TextRun({
    text,
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    ...(style.code ? { font: 'Consolas', size: 20, shading: { type: ShadingType.CLEAR, fill: 'F1F1F1', color: 'auto' } } : {}),
    ...(characterStyle ? { style: characterStyle } : {}),
  });
}

function plainText(tokens: Token[] | undefined): string {
  return (tokens ?? []).map((t) => ('tokens' in t && t.tokens?.length ? plainText(t.tokens) : 'text' in t ? decodeEntities(String(t.text)) : '')).join('');
}

function inlineRuns(tokens: Token[] | undefined, style: RunStyle = {}): Inline[] {
  const out: Inline[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'strong':
        out.push(...inlineRuns(t.tokens, { ...style, bold: true }));
        break;
      case 'em':
        out.push(...inlineRuns(t.tokens, { ...style, italics: true }));
        break;
      case 'del':
        out.push(...inlineRuns(t.tokens, { ...style, strike: true }));
        break;
      case 'codespan':
        out.push(run(decodeEntities(t.text), { ...style, code: true }));
        break;
      case 'br':
        out.push(new TextRun({ text: '', break: 1 }));
        break;
      case 'link':
        out.push(new ExternalHyperlink({ link: t.href, children: [run(plainText(t.tokens) || t.href, style, 'Hyperlink')] }));
        break;
      case 'image':
        out.push(run(`[${t.text || 'image'}]`, style));
        break;
      case 'html':
        out.push(run(decodeEntities(t.text.replace(/<[^>]*>/g, '')), style));
        break;
      default:
        if ('tokens' in t && t.tokens?.length) out.push(...inlineRuns(t.tokens, style));
        else if ('text' in t) out.push(run(decodeEntities(String(t.text)), style));
    }
  }
  return out;
}

interface DocxContext {
  listInstance: number;
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
      const inline = 'tokens' in tok && tok.tokens?.length ? inlineRuns(tok.tokens) : 'text' in tok ? [run(decodeEntities(String(tok.text)), {})] : [];
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

function tableBlock(table: Tokens.Table): Table {
  const cell = (c: Tokens.TableCell, header: boolean) =>
    new TableCell({
      children: [new Paragraph({ children: inlineRuns(c.tokens, header ? { bold: true } : {}) })],
      ...(header ? { shading: { type: ShadingType.CLEAR, fill: 'EDEDED', color: 'auto' } } : {}),
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, children: table.header.map((c) => cell(c, true)) }), ...table.rows.map((row) => new TableRow({ children: row.map((c) => cell(c, false)) }))],
  });
}

function blockElements(tokens: Token[], ctx: DocxContext, quote = false): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  const quoteStyle = quote ? { indent: { left: 567 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'BBBBBB', space: 10 } } } : {};
  for (const t of tokens) {
    switch (t.type) {
      case 'heading':
        out.push(new Paragraph({ heading: HEADINGS[Math.min(5, t.depth - 1)], children: inlineRuns(t.tokens) }));
        break;
      case 'paragraph':
      case 'text':
        out.push(new Paragraph({ children: inlineRuns('tokens' in t && t.tokens?.length ? t.tokens : [t], quote ? { italics: true } : {}), ...quoteStyle }));
        break;
      case 'list':
        out.push(...listParagraphs(t as Tokens.List, 0, ctx));
        break;
      case 'code':
        for (const line of (t as Tokens.Code).text.split('\n')) {
          out.push(new Paragraph({ children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 19 })], shading: { type: ShadingType.CLEAR, fill: 'F3F3F3', color: 'auto' }, spacing: { after: 0 } }));
        }
        out.push(new Paragraph({ children: [] }));
        break;
      case 'blockquote':
        out.push(...blockElements((t as Tokens.Blockquote).tokens, ctx, true));
        break;
      case 'table':
        out.push(tableBlock(t as Tokens.Table), new Paragraph({ children: [] }));
        break;
      case 'hr':
        out.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } } }));
        break;
      case 'html': {
        const text = decodeEntities((t as Tokens.HTML).text.replace(/<[^>]*>/g, '')).trim();
        if (text) out.push(new Paragraph({ children: [run(text, {})] }));
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export async function markdownToDocx(markdown: string, title?: string): Promise<Buffer> {
  const tokens = lexer(markdown);
  const ctx: DocxContext = { listInstance: 0 };
  const children = blockElements(tokens, ctx);
  const startsWithHeading = tokens.find((t) => t.type !== 'space')?.type === 'heading';
  if (title && !startsWithHeading) children.unshift(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }));
  const doc = new Document({
    creator: 'Cellar',
    title: title ?? '',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { after: 120, line: 276 } } } } },
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
  title: string;
  subtitle?: string;
  bullets?: string[];
  notes?: string;
}

export async function createPptx(slides: SlideInput[], title?: string): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Cellar';
  pptx.title = title ?? slides[0]?.title ?? 'Presentation';
  const font = 'Segoe UI';
  slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: 'D97757' }, line: { color: 'D97757' } });
    const bullets = (s.bullets ?? []).map(String).filter((b) => b.trim());
    if (i === 0 && bullets.length === 0) {
      slide.addText(s.title, { x: 0.9, y: 2.3, w: 11.5, h: 1.5, fontSize: 40, bold: true, color: '1F1F1F', fontFace: font, valign: 'bottom' });
      if (s.subtitle) slide.addText(s.subtitle, { x: 0.9, y: 3.9, w: 11.5, h: 0.9, fontSize: 20, color: '666666', fontFace: font, valign: 'top' });
    } else {
      slide.addText(s.title, { x: 0.7, y: 0.4, w: 12, h: 0.9, fontSize: 30, bold: true, color: '1F1F1F', fontFace: font });
      if (s.subtitle) slide.addText(s.subtitle, { x: 0.7, y: 1.25, w: 12, h: 0.5, fontSize: 16, color: '777777', fontFace: font });
      if (bullets.length) {
        slide.addText(
          bullets.map((text, n) => ({ text, options: { bullet: true, breakLine: n < bullets.length - 1 } })),
          { x: 0.8, y: s.subtitle ? 1.9 : 1.5, w: 11.8, h: 5.3, fontSize: bullets.length > 7 ? 16 : 20, color: '333333', fontFace: font, valign: 'top', paraSpaceAfter: 8 },
        );
      }
    }
    if (s.notes) slide.addNotes(s.notes);
  });
  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.from(out as Uint8Array);
}

/* ───────────────────────── PDF (rendered by Chromium in the app) ───────────────────────── */

export type PdfRenderer = (html: string) => Promise<Buffer>;

let pdfRenderer: PdfRenderer | null = null;

export function setPdfRenderer(renderer: PdfRenderer | null): void {
  pdfRenderer = renderer;
}

export const pdfAvailable = (): boolean => pdfRenderer !== null;

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function markdownToHtmlPage(markdown: string, title?: string): string {
  const body = parseMarkdown(markdown, { async: false, gfm: true }) as string;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title ?? 'Document')}</title>
<style>
  @page { margin: 18mm 16mm; }
  body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1f1f1f; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.2em 0 0.4em; page-break-after: avoid; }
  h1 { font-size: 22pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }
  p, ul, ol, table, pre, blockquote { margin: 0.5em 0; }
  table { border-collapse: collapse; width: 100%; page-break-inside: avoid; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; vertical-align: top; }
  th { background: #efefef; }
  code { font-family: Consolas, monospace; font-size: 9.5pt; background: #f2f2f2; padding: 0 3px; border-radius: 3px; }
  pre { background: #f5f5f5; padding: 8px 10px; border-radius: 4px; white-space: pre-wrap; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #ccc; padding-left: 10px; color: #555; }
  a { color: #b5532f; }
  img { max-width: 100%; }
</style></head><body>${title && !/^\s*#\s/.test(markdown) ? `<h1>${escapeHtml(title)}</h1>` : ''}${body}</body></html>`;
}

export async function markdownToPdf(markdown: string, title?: string): Promise<Buffer> {
  if (!pdfRenderer) throw new Error('PDF export is not available in this environment.');
  return pdfRenderer(markdownToHtmlPage(markdown, title));
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
