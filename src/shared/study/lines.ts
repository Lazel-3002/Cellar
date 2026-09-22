/**
 * A page's text as lines with positions. pdf.js hands out text in runs (a word, a phrase, a
 * glyph run in one font); runs on the same baseline and close together become one line, and a
 * wide gap starts a new one so two columns side by side stay apart.
 */
import type { PageLine } from '../types/study';

export interface TextRun {
  text: string;
  /** Left edge, in page points from the left. */
  x: number;
  /** Top edge, in page points from the top. */
  y: number;
  w: number;
  h: number;
  /** pdf.js marked the end of a line after this run. */
  eol?: boolean;
}

const round = (value: number) => Math.round(value * 10) / 10;

export function groupLines(runs: TextRun[]): PageLine[] {
  const lines: PageLine[] = [];
  let current: PageLine | null = null;
  let breakNext = false;
  const flush = () => {
    if (current) {
      current.text = current.text.replace(/\s+/g, ' ').trim();
      if (current.text) lines.push({ text: current.text, x: round(current.x), y: round(current.y), w: round(current.w), h: round(current.h) });
    }
    current = null;
  };
  for (const run of runs) {
    if (!Number.isFinite(run.x) || !Number.isFinite(run.y)) continue;
    const blank = !run.text.trim();
    if (blank && !current) {
      breakNext = breakNext || !!run.eol;
      continue;
    }
    if (current && !blank) {
      const line: PageLine = current;
      const h = Math.max(1, Math.min(line.h, run.h || line.h));
      const bottom = line.y + line.h;
      const runBottom = run.y + (run.h || line.h);
      const sameBaseline = Math.abs(bottom - runBottom) < h * 0.6;
      const gap = run.x - (line.x + line.w);
      const close = gap < Math.max(line.h, run.h) * 2.2 && gap > -Math.max(line.h, run.h) * 1.5;
      if (breakNext || !sameBaseline || !close) flush();
    }
    breakNext = false;
    if (blank) {
      if (current) (current as PageLine).text += ' ';
      if (run.eol) breakNext = true;
      continue;
    }
    if (!current) {
      current = { text: run.text, x: run.x, y: run.y, w: Math.max(0, run.w), h: Math.max(1, run.h) };
    } else {
      const line: PageLine = current;
      const gap = run.x - (line.x + line.w);
      const needsSpace = gap > Math.max(line.h, run.h) * 0.15 && !/\s$/.test(line.text) && !/^\s/.test(run.text);
      line.text += (needsSpace ? ' ' : '') + run.text;
      const right = Math.max(line.x + line.w, run.x + run.w);
      const top = Math.min(line.y, run.y);
      const bottom = Math.max(line.y + line.h, run.y + run.h);
      line.x = Math.min(line.x, run.x);
      line.w = right - line.x;
      line.y = top;
      line.h = bottom - top;
    }
    if (run.eol) breakNext = true;
  }
  flush();
  return lines;
}

/** The lines as plain text, one per line. */
export function linesText(lines: PageLine[]): string {
  return lines.map((line) => line.text).join('\n');
}
