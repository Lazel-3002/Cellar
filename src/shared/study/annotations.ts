/**
 * The annotation layer: checking what the editor saves, ids, and turning a page plus what is
 * written on it into the text the model reads (answers appear under the question they answer).
 */
import type { AnnotationAuthor, BookPageInfo, InkStroke, MarkVerdict, PageLine, StudyAnnotation, StudyRect } from '../types/study';
import { resolveColor } from '../math/linestyle';
import { annotationBox, answeredQuestions, isBlankLine } from './anchor';

export const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: '#f5d547',
  green: '#8bd49a',
  blue: '#8cc4f5',
  pink: '#f4a3c8',
  orange: '#f7b267',
};

export const PEN_COLORS: Record<string, string> = {
  black: '#1f1f1f',
  blue: '#2459c4',
  red: '#d23c3c',
  green: '#2f8f4e',
  purple: '#7b45c2',
};

/** Cellar writes in its own colour, so its answers are never mistaken for the user's. */
export const AI_INK = '#c2562f';

export const MARK_COLORS: Record<MarkVerdict, string> = { correct: '#2f8f4e', wrong: '#d23c3c', partial: '#d9861c' };

export const MARK_SYMBOL: Record<MarkVerdict, string> = { correct: '✓', wrong: '✗', partial: '~' };

export const LIMITS = { annotations: 3000, text: 4000, strokes: 400, points: 20_000, rects: 60 };

export function highlightColor(value: unknown): string {
  if (typeof value === 'string' && HIGHLIGHT_COLORS[value.toLowerCase()]) return HIGHLIGHT_COLORS[value.toLowerCase()];
  return resolveColor(value, HIGHLIGHT_COLORS.yellow);
}

export function penColor(value: unknown, fallback = PEN_COLORS.black): string {
  if (typeof value === 'string' && PEN_COLORS[value.toLowerCase()]) return PEN_COLORS[value.toLowerCase()];
  const color = resolveColor(value, fallback);
  return color === 'currentColor' ? fallback : color;
}

/** Next free id: a1, a2, … */
export function nextAnnotationId(existing: Iterable<{ id: string }>): string {
  let max = 0;
  for (const { id } of existing) {
    const n = /^a(\d+)$/.exec(id);
    if (n) max = Math.max(max, Number(n[1]));
  }
  return `a${max + 1}`;
}

const num = (value: unknown, min: number, max: number, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : fallback;
};
const str = (value: unknown, max = LIMITS.text) => (typeof value === 'string' ? value.slice(0, max) : '');

function rect(value: unknown, page: BookPageInfo): StudyRect | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const x = num(r.x, 0, page.width);
  const y = num(r.y, 0, page.height);
  const w = num(r.w, 0, page.width - x);
  const h = num(r.h, 0, page.height - y);
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

function stroke(value: unknown, page: BookPageInfo): InkStroke | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Record<string, unknown>;
  if (!Array.isArray(s.points)) return null;
  const points: number[] = [];
  for (let i = 0; i + 1 < Math.min(s.points.length, LIMITS.points); i += 2) {
    points.push(num(s.points[i], -20, page.width + 20), num(s.points[i + 1], -20, page.height + 20));
  }
  if (points.length < 2) return null;
  const opacity = typeof s.opacity === 'number' ? num(s.opacity, 0.05, 1, 1) : undefined;
  return { points, color: penColor(s.color), width: num(s.width, 0.3, 40, 1.6), ...(opacity !== undefined && opacity < 1 ? { opacity } : {}) };
}

/**
 * An annotation from the editor (or anywhere untrusted), checked and clamped to its page.
 * Null when it cannot be used.
 */
export function normalizeAnnotation(value: unknown, pages: BookPageInfo[]): StudyAnnotation | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  const pageNumber = Math.round(Number(a.page));
  const page = pages[pageNumber - 1];
  if (!page) return null;
  const id = typeof a.id === 'string' && /^[\w-]{1,40}$/.test(a.id) ? a.id : '';
  if (!id) return null;
  const author: AnnotationAuthor = a.author === 'ai' ? 'ai' : 'user';
  const base = { id, page: pageNumber, author, createdAt: num(a.createdAt, 0, 8.64e15, Date.now()) };
  switch (a.type) {
    case 'highlight': {
      const rects = (Array.isArray(a.rects) ? a.rects : []).slice(0, LIMITS.rects).map((r) => rect(r, page)).filter((r): r is StudyRect => !!r);
      if (rects.length === 0) return null;
      return { ...base, type: 'highlight', rects, color: highlightColor(a.color), ...(str(a.text) ? { text: str(a.text) } : {}), ...(str(a.note) ? { note: str(a.note) } : {}) };
    }
    case 'text': {
      const text = str(a.text);
      if (!text.trim()) return null;
      const x = num(a.x, 0, page.width - 4);
      return {
        ...base,
        type: 'text',
        x,
        y: num(a.y, 0, page.height - 4),
        width: num(a.width, 12, page.width - x, 160),
        text,
        color: penColor(a.color, author === 'ai' ? AI_INK : PEN_COLORS.black),
        size: num(a.size, 5, 72, 11),
        ...(str(a.anchor, 400) ? { anchor: str(a.anchor, 400) } : {}),
      };
    }
    case 'ink': {
      const strokes = (Array.isArray(a.strokes) ? a.strokes : []).slice(0, LIMITS.strokes).map((s) => stroke(s, page)).filter((s): s is InkStroke => !!s);
      return strokes.length ? { ...base, type: 'ink', strokes } : null;
    }
    case 'note': {
      const text = str(a.text);
      if (!text.trim()) return null;
      return { ...base, type: 'note', x: num(a.x, 0, page.width), y: num(a.y, 0, page.height), text, ...(str(a.anchor, 400) ? { anchor: str(a.anchor, 400) } : {}) };
    }
    case 'mark': {
      const verdict: MarkVerdict = a.verdict === 'wrong' || a.verdict === 'partial' ? a.verdict : 'correct';
      return {
        ...base,
        type: 'mark',
        x: num(a.x, 0, page.width),
        y: num(a.y, 0, page.height),
        verdict,
        ...(str(a.comment, 400) ? { comment: str(a.comment, 400) } : {}),
        ...(str(a.anchor, 400) ? { anchor: str(a.anchor, 400) } : {}),
      };
    }
    default:
      return null;
  }
}

/** Every usable annotation, ids made unique. */
export function normalizeAnnotations(values: unknown, pages: BookPageInfo[]): StudyAnnotation[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: StudyAnnotation[] = [];
  for (const value of values.slice(0, LIMITS.annotations)) {
    const annotation = normalizeAnnotation(value, pages);
    if (!annotation) continue;
    if (seen.has(annotation.id)) annotation.id = nextAnnotationId([...out, { id: annotation.id }]);
    seen.add(annotation.id);
    out.push(annotation);
  }
  return out;
}

const quote = (text: string, max = 300) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return `"${flat.length > max ? `${flat.slice(0, max - 1)}…` : flat}"`;
};

/** One line about an annotation, for a tool result or the prompt. */
export function describeAnnotation(annotation: StudyAnnotation): string {
  const who = annotation.author === 'ai' ? 'you' : 'the user';
  switch (annotation.type) {
    case 'highlight':
      return `${annotation.id}: ${who} highlighted ${annotation.text ? quote(annotation.text, 160) : 'part of the page'}${annotation.note ? ` with the note ${quote(annotation.note, 160)}` : ''}`;
    case 'text':
      return `${annotation.id}: ${who} wrote ${quote(annotation.text)}`;
    case 'ink':
      return `${annotation.id}: ${who} drew or wrote by hand (${annotation.strokes.length} stroke${annotation.strokes.length === 1 ? '' : 's'}; look at the page to read it)`;
    case 'note':
      return `${annotation.id}: note from ${who}: ${quote(annotation.text)}`;
    case 'mark':
      return `${annotation.id}: ${who} marked it ${MARK_SYMBOL[annotation.verdict]} ${annotation.verdict}${annotation.comment ? ` — ${quote(annotation.comment, 160)}` : ''}`;
  }
}

/**
 * A page as the model reads it: the page's lines in order, with what the user (or the model)
 * wrote placed after the line it sits under, so an answer shows up under its question.
 */
export function pageForModel(page: number, lines: PageLine[], annotations: StudyAnnotation[], options: { scanned?: boolean } = {}): string {
  const onPage = annotations.filter((a) => a.page === page);
  const after = new Map<number, string[]>();
  const before: string[] = [];
  for (const annotation of onPage) {
    const box = annotationBox(annotation);
    let index = -1;
    for (let i = 0; i < lines.length; i++) if (lines[i].y <= box.y + 1) index = i;
    const text = `  [${describeAnnotation(annotation)}]`;
    if (index < 0) before.push(text);
    else after.set(index, [...(after.get(index) ?? []), text]);
  }
  const body: string[] = [...before];
  lines.forEach((line, index) => {
    if (!isBlankLine(line.text)) body.push(line.text);
    else body.push('……………… (answer line)');
    body.push(...(after.get(index) ?? []));
  });
  if (lines.length === 0) body.unshift(options.scanned ? '(This page has no text layer: it is a scanned image. Look at the page to read it.)' : '(No text on this page.)');
  const { answered, open } = answeredQuestions(lines, onPage);
  if (answered.length + open.length > 1) {
    body.push(`[Questions the user has answered on this page: ${answered.length ? answered.join(', ') : 'none yet'}. Not answered yet: ${open.length ? open.join(', ') : 'none'}.]`);
  }
  return `<page number="${page}">\n${body.join('\n')}\n</page>`;
}
