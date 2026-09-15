import type { TextElement } from '../types/design';
import { isWideFont } from './theme';

/** Paragraphs of a text element, with inline **bold** spans. */
export interface TextRun {
  text: string;
  bold: boolean;
}

export function paragraphs(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

/** Splits "**bold** words" into runs; unmatched asterisks stay as text. */
export function inlineRuns(paragraph: string): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = pattern.exec(paragraph); m; m = pattern.exec(paragraph)) {
    if (m.index > last) runs.push({ text: paragraph.slice(last, m.index), bold: false });
    runs.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < paragraph.length || runs.length === 0) runs.push({ text: paragraph.slice(last), bold: false });
  return runs;
}

export const plainText = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1');

/** Average glyph width as a share of the font size; good enough to size boxes before a browser measures them. */
function glyphWidth(el: Pick<TextElement, 'size' | 'weight' | 'uppercase' | 'letterSpacing'>, fontName: string): number {
  let ratio = 0.5;
  if (isWideFont(fontName)) ratio = 0.58;
  if (/consolas|courier|mono/i.test(fontName)) ratio = 0.6;
  if ((el.weight ?? 400) >= 600) ratio += 0.03;
  if ((el.weight ?? 400) >= 800) ratio += 0.04;
  if (el.uppercase) ratio += 0.1;
  return el.size * (ratio + (el.letterSpacing ?? 0));
}

/** Estimated number of lines the text wraps to in its box. */
export function estimateLines(el: Pick<TextElement, 'text' | 'size' | 'weight' | 'uppercase' | 'letterSpacing' | 'w' | 'padding' | 'list'>, fontName: string): number {
  const inner = Math.max(el.size, el.w - 2 * (el.padding ?? 0) - (el.list ? el.size * 1.2 : 0));
  const charWidth = glyphWidth(el, fontName);
  let lines = 0;
  for (const paragraph of paragraphs(plainText(el.text))) {
    if (!paragraph.trim()) {
      lines += 1;
      continue;
    }
    // Greedy word wrap on estimated widths.
    let line = 0;
    let count = 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const width = word.length * charWidth;
      const space = line === 0 ? 0 : charWidth;
      if (line > 0 && line + space + width > inner) {
        count += 1;
        line = Math.min(width, inner);
        if (width > inner) count += Math.floor(width / inner);
      } else {
        line += space + width;
        if (line > inner) {
          count += Math.floor(line / inner);
          line %= inner;
        }
      }
    }
    lines += count;
  }
  return Math.max(1, lines);
}

/** Height a text box needs for its text, in pixels. */
export function estimateTextHeight(el: Pick<TextElement, 'text' | 'size' | 'weight' | 'uppercase' | 'letterSpacing' | 'w' | 'padding' | 'list' | 'lineHeight'>, fontName: string): number {
  const lines = estimateLines(el, fontName);
  const paragraphGap = el.list ? (paragraphs(el.text).length - 1) * el.size * 0.35 : 0;
  return Math.ceil(lines * el.size * (el.lineHeight ?? 1.25) + paragraphGap + 2 * (el.padding ?? 0));
}

/** Largest font size (down to `min`) at which the text fits its box. */
export function fitFontSize(el: Pick<TextElement, 'text' | 'size' | 'weight' | 'uppercase' | 'letterSpacing' | 'w' | 'h' | 'padding' | 'list' | 'lineHeight'>, fontName: string, min: number): number {
  let size = el.size;
  while (size > min && estimateTextHeight({ ...el, size }, fontName) > el.h) size = Math.max(min, Math.floor(size * 0.92));
  return size;
}
