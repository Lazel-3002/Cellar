/** Page lists and the pages a message's context covers. */
import type { BookOutlineItem, StudyContext } from '../types/study';

const clampPage = (page: number, count: number) => Math.min(Math.max(1, Math.round(page)), Math.max(1, count));

/**
 * "45-52, 60", "12–14", "3 5 7", "p. 10 to 12" → sorted, unique page numbers inside the book.
 * Ranges written backwards are turned around; anything outside the book is dropped.
 */
export function parsePageList(input: string | number | number[] | undefined | null, pageCount: number, max = 2000): number[] {
  if (input === undefined || input === null) return [];
  if (typeof input === 'number') return Number.isFinite(input) && input >= 1 && input <= pageCount ? [Math.round(input)] : [];
  if (Array.isArray(input)) return parsePageList(input.join(','), pageCount, max);
  const pages = new Set<number>();
  const text = input
    .toLowerCase()
    .replace(/\b(pages?|pp?|sayfa(lar)?|s)\.?/g, ' ')
    .replace(/\s*(?:–|—|\bto\b|\.\.)\s*/g, '-')
    .replace(/\s*-\s*/g, '-');
  for (const part of text.split(/[,;\s]+/)) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      let [from, to] = [Number(range[1]), Number(range[2])];
      if (from > to) [from, to] = [to, from];
      from = Math.max(1, from);
      to = Math.min(pageCount, to);
      for (let page = from; page <= to && pages.size < max; page++) pages.add(page);
      continue;
    }
    const single = /^(\d+)$/.exec(part);
    if (single) {
      const page = Number(single[1]);
      if (page >= 1 && page <= pageCount) pages.add(page);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

/** [45, 46, 47, 48, 60] → "45–48, 60". */
export function formatPageList(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return parts.join(', ');
}

/** The first page of the outline section the page is in (the chapter start), or 1. */
export function sectionStart(outline: BookOutlineItem[], page: number): number {
  let start = 1;
  for (const item of outline) {
    if (item.page <= page && item.page > start) start = item.page;
  }
  return start;
}

/** The outline section a page is in, for a label. */
export function sectionOf(outline: BookOutlineItem[], page: number): BookOutlineItem | undefined {
  let found: BookOutlineItem | undefined;
  for (const item of outline) {
    if (item.page <= page && (!found || item.page >= found.page)) found = item;
  }
  return found;
}

/**
 * The pages a context asks for, current page first where it belongs. 'book' returns every page —
 * the caller decides whether they fit or whether to search instead.
 */
export function scopePages(context: StudyContext, pageCount: number): number[] {
  const page = clampPage(context.page, pageCount);
  switch (context.scope) {
    case 'pages': {
      const listed = parsePageList(context.pages ?? '', pageCount);
      return listed.length ? listed : [page];
    }
    case 'upto': {
      const from = clampPage(context.from ?? 1, pageCount);
      const [a, b] = from <= page ? [from, page] : [page, from];
      return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    }
    case 'book':
      return Array.from({ length: Math.max(1, pageCount) }, (_, i) => i + 1);
    default:
      return [page];
  }
}

/** Label for the scope picker and the prompt: "Page 12", "Pages 45–52", "Pages 1–12". */
export function scopeLabel(context: StudyContext, pageCount: number): string {
  if (context.scope === 'book') return 'Whole book';
  const pages = scopePages(context, pageCount);
  return pages.length === 1 ? `Page ${pages[0]}` : `Pages ${formatPageList(pages)}`;
}

/**
 * Which of the wanted pages fit in a character budget. The current page goes in first, then the
 * pages nearest to it, so a long range loses its far end rather than the page on screen.
 */
export function fitPages(wanted: number[], current: number, cost: (page: number) => number, budget: number): { included: number[]; omitted: number[] } {
  const order = [...wanted].sort((a, b) => Math.abs(a - current) - Math.abs(b - current) || a - b);
  const included: number[] = [];
  let used = 0;
  for (const page of order) {
    const size = cost(page);
    if (used + size > budget && included.length > 0) continue;
    included.push(page);
    used += size;
  }
  const set = new Set(included);
  return { included: included.sort((a, b) => a - b), omitted: wanted.filter((page) => !set.has(page)) };
}
