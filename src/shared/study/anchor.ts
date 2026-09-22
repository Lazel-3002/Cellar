/**
 * Where on a page something goes. The model says *what* to write and *which question or line* it
 * belongs to; Cellar finds that line in the page's own text and works out a free spot next to it.
 * A small local model cannot be trusted with page coordinates any more than with arithmetic.
 */
import type { BookPageInfo, PageLine, StudyAnnotation, StudyRect } from '../types/study';

/** Case, accents, Turkish dotted/dotless i and punctuation do not matter when matching. */
export function foldChar(c: string): string {
  const lower = c.toLowerCase();
  // Dotless ı, and İ (which lower-cases to i plus a combining dot).
  if (lower === 'ı' || lower === 'i̇') return 'i';
  const base = lower.normalize('NFD').replace(/\p{M}/gu, '');
  if (/^[\p{L}\p{N}]+$/u.test(base)) return base;
  return /\s/.test(c) ? ' ' : '';
}

export function fold(text: string): string {
  let out = '';
  for (const c of text) out += foldChar(c);
  return out.replace(/\s+/g, ' ').trim();
}

interface Folded {
  text: string;
  /** For each character of `text`: the line and the character offset in that line. */
  map: Array<{ line: number; offset: number }>;
}

function foldLines(lines: PageLine[]): Folded {
  let text = '';
  const map: Folded['map'] = [];
  lines.forEach((line, index) => {
    if (text && !text.endsWith(' ')) {
      text += ' ';
      map.push({ line: index, offset: 0 });
    }
    let offset = 0;
    for (const c of line.text) {
      let folded = foldChar(c);
      if (folded === ' ' && text.endsWith(' ')) folded = '';
      for (const f of folded) {
        text += f;
        map.push({ line: index, offset });
      }
      offset += c.length;
    }
  });
  return { text, map };
}

export interface TextMatch {
  line: number;
  endLine: number;
  rects: StudyRect[];
  /** The page text that matched. */
  text: string;
}

const QUESTION_NUMBER = /^(?:(?:question|q|soru|exercise|problem|alistirma|madde|no)\s*)?#?\s*(\d{1,3}[a-z]?)\s*[.):-]?$/i;
const QUESTION_START = /^\s*(?:\(?\d{1,3}[a-z]?[.)]|\(?[a-h][.)]|\d{1,3}\s*-)\s*/i;

/**
 * Helvetica/Arial advance widths (thousandths of an em) for ASCII 32–126. Close enough for any sans or
 * serif text to tell where a word or a printed blank sits inside a line: underscores and capitals are
 * wide, i, l and dots narrow, which counting characters gets badly wrong.
 */
const ASCII_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778,
  722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Width of one character in thousandths of an em. */
export function charWidth(c: string): number {
  const code = c.charCodeAt(0);
  if (code >= 32 && code <= 126) return ASCII_WIDTHS[code - 32];
  if (c === '\u0131') return 222;
  if (c === '…' || c === '—') return 1000;
  if (c === '–') return 556;
  const base = c.normalize('NFD').charCodeAt(0);
  return base >= 32 && base <= 126 ? ASCII_WIDTHS[base - 32] : 556;
}

/** Running widths: `[0, w(c0), w(c0)+w(c1), …]`, one entry per UTF-16 unit plus one. */
function runningWidths(text: string): number[] {
  const out = [0];
  for (let i = 0; i < text.length; i++) out.push(out[i] + charWidth(text[i]));
  return out;
}

/** Part of a line, sized by the widths of its characters. */
function subRect(line: PageLine, from: number, to: number): StudyRect {
  const widths = runningWidths(line.text);
  const total = widths[widths.length - 1] || 1;
  const length = line.text.length;
  const start = Math.max(0, Math.min(from, length));
  const end = Math.max(start, Math.min(to, length));
  return { x: line.x + (line.w * widths[start]) / total, y: line.y, w: Math.max(2, (line.w * (widths[end] - widths[start])) / total), h: line.h };
}

function rangeMatch(lines: PageLine[], folded: Folded, start: number, end: number): TextMatch {
  const first = folded.map[start];
  const last = folded.map[Math.max(start, end - 1)];
  const rects: StudyRect[] = [];
  for (let index = first.line; index <= last.line; index++) {
    const line = lines[index];
    const from = index === first.line ? first.offset : 0;
    const to = index === last.line ? last.offset + 1 : line.text.length;
    rects.push(subRect(line, from, to));
  }
  const text = lines
    .slice(first.line, last.line + 1)
    .map((line, i, all) => line.text.slice(i === 0 ? first.offset : 0, i === all.length - 1 ? last.offset + 1 : undefined))
    .join(' ');
  return { line: first.line, endLine: last.line, rects, text };
}

function wholeLines(lines: PageLine[], line: number, endLine = line): TextMatch {
  return { line, endLine, rects: lines.slice(line, endLine + 1).map(({ x, y, w, h }) => ({ x, y, w, h })), text: lines.slice(line, endLine + 1).map((l) => l.text).join(' ') };
}

/**
 * Finds text on a page: an exact (folded) phrase, a question number ("3", "Question 3", "Soru 3"),
 * or failing both the line sharing the most words with the query.
 */
export function findText(lines: PageLine[], query: string): TextMatch | null {
  const wanted = fold(query);
  if (!wanted || lines.length === 0) return null;

  const number = QUESTION_NUMBER.exec(query.trim());
  if (number) {
    const n = number[1].toLowerCase();
    const pattern = new RegExp(`^\\s*\\(?${n.replace(/[^\da-z]/g, '')}\\s*[.):-]`, 'i');
    const index = lines.findIndex((line) => pattern.test(line.text));
    if (index >= 0) return wholeLines(lines, index);
  }

  const folded = foldLines(lines);
  const at = folded.text.indexOf(wanted);
  if (at >= 0) return rangeMatch(lines, folded, at, at + wanted.length);

  // The start of a long question is usually quoted right even when the rest is paraphrased.
  const words = wanted.split(' ').filter(Boolean);
  for (let take = Math.min(words.length - 1, 8); take >= 4; take--) {
    const prefix = words.slice(0, take).join(' ');
    const found = folded.text.indexOf(prefix);
    if (found >= 0) return rangeMatch(lines, folded, found, found + prefix.length);
  }

  // Best single line by shared words, then a question wrapped over two lines.
  const meaningful = words.filter((word) => word.length > 2 || /\d/.test(word));
  if (meaningful.length === 0) return null;
  const score = (text: string) => {
    const have = new Set(text.split(' '));
    return meaningful.filter((word) => have.has(word)).length / meaningful.length;
  };
  const foldedLines = lines.map((line) => fold(line.text));
  let best: { line: number; endLine: number; score: number } | null = null;
  foldedLines.forEach((text, index) => {
    const s = score(text);
    if (!best || s > best.score) best = { line: index, endLine: index, score: s };
  });
  if (!best || (best as { score: number }).score < 0.6) {
    for (let index = 0; index + 1 < lines.length; index++) {
      const s = score(`${foldedLines[index]} ${foldedLines[index + 1]}`);
      if (!best || s > best.score + 0.001) best = { line: index, endLine: index + 1, score: s };
    }
  }
  const found = best as { line: number; endLine: number; score: number } | null;
  return found && found.score >= 0.6 ? wholeLines(lines, found.line, found.endLine) : null;
}

/** Only dots, underscores or dashes: an answer line printed in the book. */
export const isBlankLine = (text: string) => /^[\s._…\-–—]{3,}$/.test(text) && /[._…]{3,}|[-–—_]{4,}/.test(text);

/** Where a printed blank (`____` or `.....`) starts and ends in a line, after `from`. */
function blankIn(text: string, from: number): { start: number; end: number } | null {
  const match = /[_]{3,}|[.…]{4,}/.exec(text.slice(from));
  return match ? { start: from + match.index, end: from + match.index + match[0].length } : null;
}

export const isQuestionStart = (text: string) => QUESTION_START.test(text);

/** "3" for "3. What is…", "b" for "b) …". */
export function questionLabel(text: string): string | null {
  const match = /^\s*\(?(\d{1,3}[a-z]?|[a-h])\s*[.):-]/i.exec(text);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Which numbered questions on a page the user has written an answer to (typed or by hand, anywhere
 * between the question and the next one). Cellar works this out so a tutor does not have to guess
 * what is still open, and does not give away an answer the user has not tried yet.
 */
export function answeredQuestions(lines: PageLine[], annotations: StudyAnnotation[]): { answered: string[]; open: string[] } {
  const questions = lines.map((line, index) => ({ line, index, label: questionLabel(line.text) })).filter((q): q is { line: PageLine; index: number; label: string } => !!q.label);
  const answered: string[] = [];
  const open: string[] = [];
  const mine = annotations.filter((a) => a.author === 'user' && (a.type === 'text' || a.type === 'ink')).map(annotationBox);
  questions.forEach((q, i) => {
    const top = q.line.y - 2;
    const bottom = questions[i + 1]?.line.y ?? Infinity;
    const has = mine.some((box) => box.y + box.h / 2 >= top && box.y + box.h / 2 < bottom);
    (has ? answered : open).push(q.label);
  });
  return { answered, open };
}

/** Width a line of text takes at a font size, in points. */
export const textWidth = (text: string, size: number) => (runningWidths(text)[text.length] * size) / 1000;

/** Height of text wrapped into a width. */
export function textHeight(text: string, size: number, width: number): number {
  const rows = text.split('\n').reduce((sum, paragraph) => sum + Math.max(1, Math.ceil((textWidth(paragraph, size) * 1.08) / Math.max(1, width))), 0);
  return rows * size * 1.3;
}

export function annotationBox(annotation: StudyAnnotation): StudyRect {
  switch (annotation.type) {
    case 'highlight': {
      const xs = annotation.rects.flatMap((r) => [r.x, r.x + r.w]);
      const ys = annotation.rects.flatMap((r) => [r.y, r.y + r.h]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    case 'text':
      return { x: annotation.x, y: annotation.y, w: annotation.width, h: textHeight(annotation.text, annotation.size, annotation.width) };
    case 'ink': {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const stroke of annotation.strokes) {
        for (let i = 0; i + 1 < stroke.points.length; i += 2) {
          xs.push(stroke.points[i]);
          ys.push(stroke.points[i + 1]);
        }
      }
      if (xs.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    case 'note':
      return { x: annotation.x - 9, y: annotation.y, w: 18, h: 18 };
    case 'mark':
      return { x: annotation.x, y: annotation.y, w: 16 + (annotation.comment ? textWidth(annotation.comment, 9) : 0), h: 16 };
  }
}

const overlaps = (a: StudyRect, b: StudyRect, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

export interface Placement {
  x: number;
  y: number;
  width: number;
  size: number;
  /** How it was placed, for the tool result. */
  where: string;
}

const MARGIN = 14;

/** The exactly measured blank (from the page's glyphs) that an estimated one stands for, if any. */
function exactBlank(estimate: StudyRect, blanks: StudyRect[]): StudyRect | undefined {
  let best: { rect: StudyRect; distance: number } | undefined;
  for (const rect of blanks) {
    const sameLine = rect.y < estimate.y + estimate.h && estimate.y < rect.y + rect.h;
    if (!sameLine) continue;
    const distance = Math.abs(rect.x + rect.w / 2 - (estimate.x + estimate.w / 2));
    if (distance < Math.max(40, estimate.w) && (!best || distance < best.distance)) best = { rect, distance };
  }
  return best?.rect;
}

/**
 * A free spot for an answer to the matched question: on a printed blank in the same line, on
 * the dotted answer line under it, in the empty space below it, or to its right. Null when the
 * page has no room near the question (the caller pins a note instead). `blanks` are the page's
 * blanks measured from its glyphs; without them a blank's position is estimated from the text.
 */
export function placeAnswer(lines: PageLine[], page: BookPageInfo, match: TextMatch, text: string, others: StudyAnnotation[], preferredSize = 11, blanks: StudyRect[] = []): Placement | null {
  const taken = others.map(annotationBox);
  const free = (rect: StudyRect) => !taken.some((box) => overlaps(box, rect, 1)) && !lines.some((line, index) => (index < match.line || index > match.endLine) && !isBlankLine(line.text) && overlaps(line, rect, -1));
  const last = lines[match.endLine];

  // A blank printed in the question's line (after the matched words if there are several): write on it.
  const matchStart = match.line === match.endLine ? Math.round(((match.rects[0].x - last.x) / Math.max(1, last.w)) * last.text.length) : 0;
  const blank = blankIn(last.text, Math.max(0, matchStart)) ?? blankIn(last.text, 0);
  if (blank && !text.includes('\n')) {
    const estimate = subRect(last, blank.start, blank.end);
    const measured = exactBlank(estimate, blanks);
    const rect = measured ? { ...measured, y: last.y, h: last.h } : estimate;
    // A little under the exact fit: the page may draw the answer in a slightly wider font than the estimate.
    const size = Math.min(preferredSize, last.h * 0.85, ((rect.w + 4) * 1000 * 0.92) / Math.max(1, runningWidths(text)[text.length]));
    if (size >= 6.5) return { x: rect.x, y: rect.y + rect.h - size * 1.25, width: rect.w + 4, size: Math.round(size * 10) / 10, where: 'on the blank in the question' };
  }

  const bottom = Math.max(...lines.slice(match.line, match.endLine + 1).map((line) => line.y + line.h));
  const left = Math.max(MARGIN, Math.min(...lines.slice(match.line, match.endLine + 1).map((line) => line.x)));
  const right = page.width - MARGIN;
  const columnRight = Math.max(left + 160, ...lines.slice(match.line, match.endLine + 1).map((line) => line.x + line.w));
  const width = Math.max(80, Math.min(columnRight, right) - left);

  // A dotted answer line under the question.
  for (let index = match.endLine + 1; index < Math.min(lines.length, match.endLine + 4); index++) {
    const line = lines[index];
    if (line.y < bottom - 1) continue;
    if (!isBlankLine(line.text)) break;
    const size = Math.min(preferredSize, Math.max(7, line.h * 1.6));
    const measured = exactBlank({ x: line.x, y: line.y, w: line.w, h: line.h }, blanks);
    const spot = { x: measured?.x ?? line.x, y: line.y + line.h - size * 1.3, width: Math.max(measured?.w ?? line.w, 80), size, where: 'on the answer line under the question' };
    if (free({ x: spot.x, y: spot.y, w: spot.width, h: textHeight(text, size, spot.width) * 0.6 })) return spot;
  }

  // Empty space below the question, down to the next line in the same column.
  const below = lines.filter((line, index) => index > match.endLine && line.y >= bottom - 1 && line.x < left + width && line.x + line.w > left && !isBlankLine(line.text));
  const nextTop = below.length ? Math.min(...below.map((line) => line.y)) : page.height - MARGIN;
  for (let size = preferredSize; size >= 7; size -= 1) {
    const height = textHeight(text, size, width);
    let y = bottom + 3;
    // Step past anything already written there (an earlier answer, the user's own writing).
    for (let tries = 0; tries < 12 && y + height <= nextTop - 1; tries++) {
      const rect = { x: left, y, w: width, h: height };
      const blocking = taken.find((box) => overlaps(box, rect, 1));
      if (!blocking) return { x: left, y, width, size, where: 'in the space under the question' };
      y = blocking.y + blocking.h + 3;
    }
  }

  // To the right of the question's last line.
  const roomRight = right - (last.x + last.w) - 10;
  if (roomRight >= 70) {
    const size = Math.min(preferredSize, Math.max(7, last.h * 0.9));
    const w = roomRight;
    const spot = { x: last.x + last.w + 10, y: last.y, width: w, size, where: 'next to the question' };
    if (textHeight(text, size, w) <= Math.max(last.h * 2.5, nextTop - last.y) && free({ x: spot.x, y: spot.y, w, h: textHeight(text, size, w) })) return spot;
  }
  return null;
}

/** A note pinned in the right margin level with the line, moved down past other notes there. */
export function placeNote(page: BookPageInfo, match: TextMatch | null, others: StudyAnnotation[]): { x: number; y: number } {
  const x = page.width - MARGIN - 4;
  let y = match ? Math.min(...match.rects.map((r) => r.y)) : MARGIN;
  const notes = others.filter((a) => a.type === 'note').map(annotationBox);
  for (let tries = 0; tries < 40 && notes.some((box) => overlaps(box, { x: x - 9, y, w: 18, h: 18 }, 2)); tries++) y += 22;
  return { x, y: Math.min(y, page.height - 24) };
}

/**
 * Where a ✓/✗ goes: after the user's own answer to the question (typed or handwritten, anywhere
 * between the question and the next one), otherwise at the end of the question line.
 */
export function placeMark(lines: PageLine[], page: BookPageInfo, match: TextMatch, others: StudyAnnotation[]): { x: number; y: number; answered: boolean } {
  const top = Math.min(...match.rects.map((r) => r.y));
  const next = lines.findIndex((line, index) => index > match.endLine && isQuestionStart(line.text) && line.y > top);
  const regionBottom = next >= 0 ? lines[next].y : page.height;
  const answers = others
    .filter((a) => a.author === 'user' && (a.type === 'text' || a.type === 'ink'))
    .map((a) => ({ a, box: annotationBox(a) }))
    .filter(({ box }) => box.y + box.h >= top - 2 && box.y < regionBottom)
    .sort((p, q) => p.box.y - q.box.y);
  const answer = answers.at(-1);
  if (answer) {
    const a = answer.a;
    // Typed text is only as wide as its longest line, whatever width its box was given.
    const right = a.type === 'text' ? a.x + Math.min(a.width, Math.max(...a.text.split('\n').map((line) => textWidth(line, a.size)))) : answer.box.x + answer.box.w;
    return { x: Math.min(page.width - 30, right + 8), y: answer.box.y, answered: true };
  }
  const line = lines[match.endLine];
  return { x: Math.min(page.width - 30, line.x + line.w + 8), y: line.y, answered: false };
}
