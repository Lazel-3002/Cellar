/**
 * Exact positions of the printed blanks on a page (`________`, `..........`), from the glyphs pdf.js
 * draws. Character widths differ too much between fonts (an underscore is 0.42 em in Segoe UI and
 * 0.56 em in Arial) for an estimate to put an answer on the blank rather than on the word before it,
 * so the page's own text operators are replayed: font size, character and word spacing, horizontal
 * scaling, the text matrix and the transformation matrix, with each glyph's real advance.
 *
 * Only the page being written on is read, when an answer is placed; importing a book stays fast.
 */
import type { StudyRect } from '@shared/types/study';
import { logger } from '../lib/log';
import { errorMessage } from '../lib/util';
import { bookBytes } from './store';

const log = logger('study');

type Matrix = [number, number, number, number, number, number];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

interface Glyph {
  unicode: string;
  width: number;
  isSpace?: boolean;
}

interface PlacedGlyph {
  ch: string;
  /** Left and right edge and baseline, in page points (top-left origin). */
  x0: number;
  x1: number;
  y: number;
  size: number;
}

/** A blank is at least three underscores, or four dots or ellipses, in a row on one baseline. */
function blanksFrom(glyphs: PlacedGlyph[]): StudyRect[] {
  const out: StudyRect[] = [];
  let run: PlacedGlyph[] = [];
  const flush = () => {
    const chars = run.map((g) => g.ch).join('');
    if (/^_{3,}$/.test(chars) || /^[.…]{4,}$/.test(chars)) {
      const size = Math.max(...run.map((g) => g.size));
      const x0 = Math.min(...run.map((g) => g.x0));
      const x1 = Math.max(...run.map((g) => g.x1));
      const baseline = run[0].y;
      out.push({ x: x0, y: baseline - size * 0.88, w: x1 - x0, h: size * 1.08 });
    }
    run = [];
  };
  for (const glyph of glyphs) {
    const kind = glyph.ch === '_' ? '_' : glyph.ch === '.' || glyph.ch === '…' ? '.' : '';
    const last = run[run.length - 1];
    const lastKind = last ? (last.ch === '_' ? '_' : '.') : '';
    const continues = last && kind === lastKind && Math.abs(last.y - glyph.y) < glyph.size * 0.3 && glyph.x0 - last.x1 < glyph.size * 0.6;
    if (!continues) flush();
    if (kind) run.push(glyph);
  }
  flush();
  return out;
}

interface TextState {
  ctm: Matrix;
  fontSize: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  leading: number;
  rise: number;
}

/** Every glyph on a page with its position, by replaying the text operators. */
async function placedGlyphs(bytes: Uint8Array, pageNumber: number): Promise<PlacedGlyph[]> {
  const { getDocumentProxy, getResolvedPDFJS } = await import('unpdf');
  const { OPS } = (await getResolvedPDFJS()) as unknown as { OPS: Record<string, number> };
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 }).transform as Matrix;
    const ops = await page.getOperatorList();
    const out: PlacedGlyph[] = [];
    let state: TextState = { ctm: IDENTITY, fontSize: 12, charSpacing: 0, wordSpacing: 0, hScale: 1, leading: 0, rise: 0 };
    const stack: TextState[] = [];
    let textMatrix: Matrix = IDENTITY;
    let lineMatrix: Matrix = IDENTITY;
    const moveText = (tx: number, ty: number) => {
      lineMatrix = multiply(lineMatrix, [1, 0, 0, 1, tx, ty]);
      textMatrix = lineMatrix;
    };
    const show = (glyphs: Array<Glyph | number>) => {
      const { fontSize, charSpacing, wordSpacing, hScale, rise } = state;
      let x = 0;
      const toPage = multiply(viewport, multiply(state.ctm, textMatrix));
      for (const glyph of glyphs) {
        if (typeof glyph === 'number') {
          x -= (glyph * fontSize * hScale) / 1000;
          continue;
        }
        const advance = ((glyph.width * fontSize) / 1000 + charSpacing + (glyph.isSpace ? wordSpacing : 0)) * hScale;
        const start = apply(toPage, x, rise);
        const end = apply(toPage, x + ((glyph.width * fontSize) / 1000) * hScale, rise);
        // The size on the page: the text matrix and the CTM may scale it.
        const size = Math.abs(apply(toPage, 0, fontSize).y - apply(toPage, 0, 0).y) || fontSize;
        const chars = [...(glyph.unicode ?? '')];
        chars.forEach((ch, i) => {
          const f0 = i / chars.length;
          const f1 = (i + 1) / chars.length;
          out.push({ ch, x0: Math.min(start.x + (end.x - start.x) * f0, start.x + (end.x - start.x) * f1), x1: Math.max(start.x + (end.x - start.x) * f0, start.x + (end.x - start.x) * f1), y: start.y, size });
        });
        x += advance;
      }
      textMatrix = multiply(textMatrix, [1, 0, 0, 1, x, 0]);
    };

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i] as unknown[];
      switch (fn) {
        case OPS.save:
          stack.push({ ...state });
          break;
        case OPS.restore:
          state = stack.pop() ?? state;
          break;
        case OPS.transform:
          state.ctm = multiply(state.ctm, args as Matrix);
          break;
        case OPS.paintFormXObjectBegin: {
          stack.push({ ...state });
          const matrix = args[0] as Matrix | null;
          if (Array.isArray(matrix) && matrix.length === 6) state.ctm = multiply(state.ctm, matrix as Matrix);
          break;
        }
        case OPS.paintFormXObjectEnd:
          state = stack.pop() ?? state;
          break;
        case OPS.beginText:
          textMatrix = IDENTITY;
          lineMatrix = IDENTITY;
          break;
        case OPS.setFont:
          state.fontSize = Number(args[1]) || state.fontSize;
          break;
        case OPS.setCharSpacing:
          state.charSpacing = Number(args[0]) || 0;
          break;
        case OPS.setWordSpacing:
          state.wordSpacing = Number(args[0]) || 0;
          break;
        case OPS.setHScale:
          state.hScale = (Number(args[0]) || 100) / 100;
          break;
        case OPS.setLeading:
          state.leading = Number(args[0]) || 0;
          break;
        case OPS.setTextRise:
          state.rise = Number(args[0]) || 0;
          break;
        case OPS.setTextMatrix: {
          const m = (Array.isArray(args[0]) || ArrayBuffer.isView(args[0]) ? Array.from(args[0] as ArrayLike<number>) : args) as number[];
          textMatrix = lineMatrix = [m[0], m[1], m[2], m[3], m[4], m[5]];
          break;
        }
        case OPS.moveText:
          moveText(Number(args[0]), Number(args[1]));
          break;
        case OPS.setLeadingMoveText:
          state.leading = -Number(args[1]);
          moveText(Number(args[0]), Number(args[1]));
          break;
        case OPS.nextLine:
          moveText(0, -state.leading);
          break;
        case OPS.nextLineShowText:
          moveText(0, -state.leading);
          show(args[0] as Array<Glyph | number>);
          break;
        case OPS.nextLineSetSpacingShowText:
          state.wordSpacing = Number(args[0]) || 0;
          state.charSpacing = Number(args[1]) || 0;
          moveText(0, -state.leading);
          show(args[2] as Array<Glyph | number>);
          break;
        case OPS.showText:
        case OPS.showSpacedText:
          show(args[0] as Array<Glyph | number>);
          break;
      }
    }
    page.cleanup();
    return out;
  } finally {
    await pdf.loadingTask.destroy();
  }
}

const cache = new Map<string, StudyRect[]>();

/** The page's printed blanks, exactly where they are drawn. Empty when the page cannot be read. */
export async function pageBlanks(bookId: string, page: number): Promise<StudyRect[]> {
  const key = `${bookId}:${page}`;
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const blanks = blanksFrom(await placedGlyphs(await bookBytes(bookId), page));
    cache.set(key, blanks);
    while (cache.size > 200) cache.delete(cache.keys().next().value as string);
    return blanks;
  } catch (err) {
    log.warn('could not read the blanks on a page', bookId, page, errorMessage(err));
    return [];
  }
}

/** For tests: blanks straight from a PDF's bytes. */
export async function blanksInPdf(bytes: Uint8Array, page: number): Promise<StudyRect[]> {
  return blanksFrom(await placedGlyphs(bytes, page));
}
