/**
 * "Export with my notes": a copy of the PDF with the annotation layer drawn into it. Highlights,
 * typed answers, handwriting and marks become page content; notes become real PDF comments that
 * any viewer shows as a sticky-note icon. The original file is never touched.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BlendMode, degrees, LineCapStyle, PDFDocument, PDFHexString, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { BrowserWindow, dialog } from 'electron';
import { MARK_COLORS } from '@shared/study/annotations';
import type { Book, StudyAnnotation } from '@shared/types/study';
import { pageTransforms } from './extract';
import { bookFile, getBook } from './store';

type Matrix = [number, number, number, number, number, number];

function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2] || 1;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

const apply = (m: Matrix, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

function color(hex: string): RGB {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return rgb(0.12, 0.12, 0.12);
  const n = parseInt(match[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** A Unicode font from Windows (Turkish, Greek and maths symbols included), else Helvetica. */
async function loadFont(doc: PDFDocument): Promise<{ font: PDFFont; unicode: boolean }> {
  const dir = join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts');
  for (const name of ['segoeui.ttf', 'arial.ttf', 'calibri.ttf']) {
    try {
      const bytes = await readFile(join(dir, name));
      return { font: await doc.embedFont(bytes, { subset: true }), unicode: true };
    } catch {
      // Try the next one.
    }
  }
  return { font: await doc.embedFont(StandardFonts.Helvetica), unicode: false };
}

/** Words wrapped into lines no wider than `width`. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > width) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

interface PageSpace {
  page: PDFPage;
  /** Page points (top-left, as shown) → PDF user space. */
  toPdf: Matrix;
  /** Angle of the page's "right" direction in PDF space, for text on rotated pages. */
  angle: number;
}

function drawAnnotation(doc: PDFDocument, space: PageSpace, annotation: StudyAnnotation, font: PDFFont, clean: (text: string) => string): void {
  const { page, toPdf, angle } = space;
  const at = (x: number, y: number) => apply(toPdf, x, y);
  const text = (value: string, x: number, y: number, size: number, rgbColor: RGB) => {
    const p = at(x, y);
    page.drawText(clean(value), { x: p.x, y: p.y, size, font, color: rgbColor, rotate: degrees(angle) });
  };
  const line = (x1: number, y1: number, x2: number, y2: number, thickness: number, rgbColor: RGB, opacity = 1) => {
    page.drawLine({ start: at(x1, y1), end: at(x2, y2), thickness, color: rgbColor, opacity, lineCap: LineCapStyle.Round });
  };

  switch (annotation.type) {
    case 'highlight':
      for (const r of annotation.rects) {
        const a = at(r.x, r.y);
        const b = at(r.x + r.w, r.y + r.h);
        page.drawRectangle({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), color: color(annotation.color), opacity: 0.4, blendMode: BlendMode.Multiply });
      }
      return;
    case 'text': {
      const rows = wrap(annotation.text, font, annotation.size, annotation.width);
      rows.forEach((row, index) => text(row, annotation.x, annotation.y + annotation.size * (1.05 + index * 1.3), annotation.size, color(annotation.color)));
      return;
    }
    case 'ink':
      for (const stroke of annotation.strokes) {
        const c = color(stroke.color);
        for (let i = 0; i + 3 < stroke.points.length; i += 2) line(stroke.points[i], stroke.points[i + 1], stroke.points[i + 2], stroke.points[i + 3], stroke.width, c, stroke.opacity ?? 1);
        if (stroke.points.length === 2) line(stroke.points[0], stroke.points[1], stroke.points[0] + 0.1, stroke.points[1], stroke.width, c, stroke.opacity ?? 1);
      }
      return;
    case 'mark': {
      const c = color(MARK_COLORS[annotation.verdict]);
      const { x, y } = annotation;
      if (annotation.verdict === 'correct') {
        line(x + 1, y + 7, x + 5, y + 11, 1.8, c);
        line(x + 5, y + 11, x + 12, y + 1, 1.8, c);
      } else if (annotation.verdict === 'wrong') {
        line(x + 2, y + 2, x + 11, y + 11, 1.8, c);
        line(x + 11, y + 2, x + 2, y + 11, 1.8, c);
      } else {
        line(x + 1, y + 8, x + 4, y + 4, 1.6, c);
        line(x + 4, y + 4, x + 8, y + 8, 1.6, c);
        line(x + 8, y + 8, x + 12, y + 4, 1.6, c);
      }
      if (annotation.comment) text(annotation.comment, x + 16, y + 10, 9, c);
      return;
    }
    case 'note': {
      // A real PDF comment: an icon that opens to the note in every PDF viewer.
      const p = at(annotation.x, annotation.y);
      const q = at(annotation.x + 18, annotation.y + 18);
      const annot = doc.context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Rect: [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)],
        Contents: PDFHexString.fromText(annotation.text),
        T: PDFHexString.fromText(annotation.author === 'ai' ? 'Cellar' : 'Me'),
        Name: 'Comment',
        C: [0.96, 0.78, 0.26],
        F: 4,
        Open: false,
      });
      page.node.addAnnot(doc.context.register(annot));
      return;
    }
  }
}

/** The book with its annotation layer drawn in, as PDF bytes. */
export async function renderAnnotatedPdf(book: Book): Promise<Uint8Array> {
  const bytes = new Uint8Array(await readFile(bookFile(book.id)));
  const transforms = await pageTransforms(bytes);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  doc.registerFontkit(fontkit);
  const { font, unicode } = await loadFont(doc);
  // Helvetica only has Latin-1; anything else would stop the export.
  const clean = (value: string) => (unicode ? value : value.replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, '?'));
  const pages = doc.getPages();
  for (const annotation of book.annotations) {
    const page = pages[annotation.page - 1];
    const transform = transforms[annotation.page - 1];
    if (!page || !transform) continue;
    const toPdf = invert(transform.transform);
    const angle = (Math.atan2(toPdf[1], toPdf[0]) * 180) / Math.PI;
    drawAnnotation(doc, { page, toPdf, angle }, annotation, font, clean);
  }
  return doc.save();
}

const fileSafe = (name: string) => [...name].filter((c) => c.charCodeAt(0) >= 32).join('').replace(/[<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Book';

export async function exportBook(bookId: string, target: { path?: string; window?: BrowserWindow } = {}): Promise<string | null> {
  const book = getBook(bookId);
  let path = target.path;
  if (!path) {
    const options = { defaultPath: `${fileSafe(book.title)} (with notes).pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] };
    const result = target.window ? await dialog.showSaveDialog(target.window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    path = result.filePath;
  }
  await writeFile(path, await renderAnnotatedPdf(book));
  return path;
}
