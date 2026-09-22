import { z } from 'zod';
import { findText, placeAnswer, placeMark, placeNote, type TextMatch } from '@shared/study/anchor';
import { AI_INK, describeAnnotation, highlightColor, MARK_SYMBOL, nextAnnotationId, pageForModel } from '@shared/study/annotations';
import { formatPageList, parsePageList } from '@shared/study/pages';
import type { Book, MarkVerdict, PageLine, StudyAnnotation } from '@shared/types/study';
import { defineTool, clip, ToolError, type AgentTool, type ToolContext } from '../agent/tools/types';
import { bus } from '../lib/events';
import { calculateTool } from '../math/tools';
import { pageBlanks } from './glyphs';
import { requestPageImage } from './render';
import { searchBook } from './search';
import { getBook, pageLines, pagesLines, setLastPage, updateBook } from './store';

const pageArg = z.union([z.number(), z.string()]).optional().describe('Page number (default: the page the user is on)');

function session(ctx: ToolContext): { book: Book } {
  const id = ctx.task.study?.bookId;
  if (!id) throw new ToolError('Study tools only work in a Study chat.');
  return { book: getBook(id) };
}

function resolvePage(book: Book, value: unknown, ctx: ToolContext): number {
  if (value === undefined || value === null || value === '') return Math.min(book.pageCount, Math.max(1, ctx.task.study?.context?.page ?? book.lastPage));
  const [page] = parsePageList(typeof value === 'number' ? value : String(value), book.pageCount);
  if (!page) throw new ToolError(`There is no page ${String(value)}: the book has pages 1–${book.pageCount}.`);
  return page;
}

/** The line on the page, or an error that shows the model what the page does say. */
function locate(lines: PageLine[], page: number, query: string, book: Book): TextMatch {
  if (lines.length === 0) {
    const scanned = (book.pages[page - 1]?.chars ?? 0) < 20;
    throw new ToolError(`Page ${page} has no text layer${scanned ? ' (it is a scanned image)' : ''}, so nothing can be placed by its words. Use add_note without "near" to pin a note on it instead.`);
  }
  const match = findText(lines, query);
  if (match) return match;
  const starts = lines
    .slice(0, 40)
    .map((line) => line.text.slice(0, 60))
    .join(' | ');
  throw new ToolError(`"${query.slice(0, 80)}" is not on page ${page}. Quote words exactly as they appear on the page, or give the question number. The page's lines start: ${starts}`);
}

const VERDICT_WORDS = /^(correct|right|true|wrong|incorrect|false|partial|partly right|doğru|yanlış|kısmen doğru|kısmen)[.!]*$/i;

/**
 * A margin comment is a few words next to the mark: ticks and crosses the model adds are dropped (the
 * mark is already one), a comment that only repeats the verdict is dropped, and a sentence is cut at a
 * word boundary.
 */
export function shortComment(text: string): string {
  const clean = text.replace(/[✓✔✗✘❌✅☑️]/gu, '').replace(/\s+/g, ' ').trim().replace(/^[-–—:,]\s*|\s*[-–—:,]$/g, '');
  if (!clean || VERDICT_WORDS.test(clean)) return '';
  if (clean.length <= 48) return clean;
  const cut = clean.slice(0, 48);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 24)).replace(/[,;:.\s]+$/, '')}…`;
}

function wrote(annotation: StudyAnnotation, where: string): string {
  return `${describeAnnotation(annotation).replace(/^(\w+): you /, '$1: ')} — on p. ${annotation.page}, ${where}.`;
}

export const readPagesTool = defineTool({
  name: 'read_pages',
  description: 'Read pages of the book as text, with what is written on them. At most 10 pages at a time.',
  category: 'read',
  input: z.object({ pages: z.union([z.string(), z.number()]).describe('Pages, e.g. "12" or "45-48, 60"') }),
  async run(args, ctx) {
    const { book } = session(ctx);
    const pages = parsePageList(typeof args.pages === 'number' ? args.pages : String(args.pages), book.pageCount);
    if (pages.length === 0) throw new ToolError(`No such pages: the book has pages 1–${book.pageCount}.`);
    const taken = pages.slice(0, 10);
    const lines = pagesLines(book.id, taken);
    const text = taken.map((page) => pageForModel(page, lines.get(page) ?? [], book.annotations, { scanned: (book.pages[page - 1]?.chars ?? 0) < 20 })).join('\n\n');
    const more = pages.length > taken.length ? `\n\n(Only pages ${formatPageList(taken)} were read; ask for the rest separately.)` : '';
    return clip(text + more, ctx.maxResultChars, 'read fewer pages at a time');
  },
});

export const searchBookTool = defineTool({
  name: 'search_book',
  description: 'Find the pages of the book about something. Returns page numbers with a snippet of each.',
  category: 'read',
  input: z.object({ query: z.string().min(1).max(500).describe('What to look for, in the words the book would use'), limit: z.number().min(1).max(20).optional() }),
  async run(args, ctx) {
    const { book } = session(ctx);
    const hits = await searchBook(book.id, args.query, args.limit ?? 6);
    if (hits.length === 0) return `Nothing in the book matches "${args.query}". Try other words (the book's own terms), or a shorter query.`;
    return hits.map((hit) => `p. ${hit.page}: ${hit.snippet}`).join('\n');
  },
});

export const goToPageTool = defineTool({
  name: 'go_to_page',
  description: 'Turn the viewer to a page so the user sees it: a figure, the start of a section, where you wrote.',
  category: 'study',
  input: z.object({ page: z.union([z.number(), z.string()]) }),
  async run(args, ctx) {
    const { book } = session(ctx);
    const page = resolvePage(book, args.page, ctx);
    setLastPage(book.id, page);
    if (ctx.task.study) ctx.task.study.context = { ...(ctx.task.study.context ?? { scope: 'page' }), page };
    bus.emit('study:goto', { bookId: book.id, page });
    return `The viewer now shows page ${page}.`;
  },
});

export const highlightTool = defineTool({
  name: 'highlight',
  description: 'Highlight words on a page with a highlighter pen. Give the exact words from the page (a phrase or a sentence).',
  category: 'study',
  input: z.object({
    page: pageArg,
    text: z.string().min(1).max(1000).describe('The words to highlight, as they appear on the page'),
    color: z.enum(['yellow', 'green', 'blue', 'pink', 'orange']).optional(),
    note: z.string().max(1000).optional().describe('A short note shown with the highlight'),
  }),
  async run(args, ctx) {
    const { book } = session(ctx);
    const page = resolvePage(book, args.page, ctx);
    const match = locate(pageLines(book.id, page), page, args.text, book);
    const { result } = updateBook(book.id, (draft) => {
      const annotation: StudyAnnotation = {
        id: nextAnnotationId(draft.annotations),
        type: 'highlight',
        page,
        author: 'ai',
        createdAt: Date.now(),
        rects: match.rects,
        color: highlightColor(args.color ?? 'yellow'),
        text: match.text,
        ...(args.note?.trim() ? { note: args.note.trim() } : {}),
      };
      draft.annotations.push(annotation);
      return annotation;
    });
    return wrote(result, 'as asked');
  },
});

export const addNoteTool = defineTool({
  name: 'add_note',
  description: 'Pin a note in the margin of a page, next to a line: a hint, a reminder or a short explanation.',
  category: 'study',
  input: z.object({
    page: pageArg,
    text: z.string().min(1).max(2000),
    near: z.string().max(400).optional().describe('Words from the line the note belongs next to, or a question number'),
  }),
  async run(args, ctx) {
    const { book } = session(ctx);
    const page = resolvePage(book, args.page, ctx);
    const match = args.near?.trim() ? locate(pageLines(book.id, page), page, args.near, book) : null;
    const { result } = updateBook(book.id, (draft) => {
      const spot = placeNote(draft.pages[page - 1], match, draft.annotations.filter((a) => a.page === page));
      const annotation: StudyAnnotation = { id: nextAnnotationId(draft.annotations), type: 'note', page, author: 'ai', createdAt: Date.now(), x: spot.x, y: spot.y, text: args.text.trim(), ...(match ? { anchor: match.text.slice(0, 200) } : {}) };
      draft.annotations.push(annotation);
      return annotation;
    });
    return wrote(result, match ? 'in the margin next to that line' : 'in the margin');
  },
});

export const writeAnswerTool = defineTool({
  name: 'write_answer',
  description: 'Write an answer onto the page under its question, like a student filling in the book. Cellar finds the question and a free spot (a blank, the answer line, the space below).',
  category: 'study',
  input: z.object({
    page: pageArg,
    question: z.string().min(1).max(400).describe('The question number ("3") or the first words of the question, as printed'),
    answer: z.string().min(1).max(2000).describe('The answer, short, as a student would write it'),
  }),
  async run(args, ctx) {
    const { book } = session(ctx);
    if (ctx.task.study?.mode !== 'solve') throw new ToolError('Writing answers is off in Tutor mode. Give a hint in the chat instead, or ask the user to switch to Solve.');
    const page = resolvePage(book, args.page, ctx);
    const lines = pageLines(book.id, page);
    const match = locate(lines, page, args.question, book);
    const answer = args.answer.trim();
    const blanks = await pageBlanks(book.id, page);
    const { result } = updateBook(book.id, (draft) => {
      const others = draft.annotations.filter((a) => a.page === page);
      const spot = placeAnswer(lines, draft.pages[page - 1], match, answer, others, 11, blanks);
      const id = nextAnnotationId(draft.annotations);
      let annotation: StudyAnnotation;
      let where: string;
      if (spot) {
        annotation = { id, type: 'text', page, author: 'ai', createdAt: Date.now(), x: spot.x, y: spot.y, width: spot.width, size: spot.size, text: answer, color: AI_INK, anchor: match.text.slice(0, 200) };
        where = spot.where;
      } else {
        const note = placeNote(draft.pages[page - 1], match, others);
        annotation = { id, type: 'note', page, author: 'ai', createdAt: Date.now(), x: note.x, y: note.y, text: answer, anchor: match.text.slice(0, 200) };
        where = 'as a margin note, because there is no free space near the question';
      }
      draft.annotations.push(annotation);
      return { annotation, where };
    });
    return wrote(result.annotation, result.where);
  },
});

export const markAnswerTool = defineTool({
  name: 'mark_answer',
  description: "Mark the user's answer to a question like a teacher: correct ✓, wrong ✗ or partial ~, with an optional short comment next to it.",
  category: 'study',
  input: z.object({
    page: pageArg,
    question: z.string().min(1).max(400).describe('The question number or the first words of the question'),
    verdict: z.enum(['correct', 'wrong', 'partial']),
    comment: z.string().max(300).optional().describe('At most a few words, e.g. "units missing"'),
  }),
  async run(args, ctx) {
    const { book } = session(ctx);
    const page = resolvePage(book, args.page, ctx);
    const lines = pageLines(book.id, page);
    const match = locate(lines, page, args.question, book);
    const onPage = book.annotations.filter((a) => a.page === page);
    const probe = placeMark(lines, book.pages[page - 1], match, onPage);
    if (!probe.answered) {
      const own = placeMark(lines, book.pages[page - 1], match, onPage.map((a) => ({ ...a, author: 'user' as const })));
      throw new ToolError(
        own.answered
          ? `The only answer to "${match.text.slice(0, 60)}" is the one you wrote. mark_answer is for checking the user's work; your own answers are not marked. Nothing more to do for this question.`
          : `The user has not written an answer to "${match.text.slice(0, 60)}" on page ${page} yet, so there is nothing to mark.`,
      );
    }
    const { result } = updateBook(book.id, (draft) => {
      const others = draft.annotations.filter((a) => a.page === page);
      // A new verdict on the same question replaces the old one.
      const anchor = match.text.slice(0, 200);
      draft.annotations = draft.annotations.filter((a) => !(a.type === 'mark' && a.page === page && a.author === 'ai' && a.anchor === anchor));
      const spot = placeMark(lines, draft.pages[page - 1], match, others);
      const annotation: StudyAnnotation = {
        id: nextAnnotationId(draft.annotations),
        type: 'mark',
        page,
        author: 'ai',
        createdAt: Date.now(),
        x: spot.x,
        y: spot.y,
        verdict: args.verdict as MarkVerdict,
        anchor,
        ...(args.comment && shortComment(args.comment) ? { comment: shortComment(args.comment) } : {}),
      };
      draft.annotations.push(annotation);
      return { annotation, answered: spot.answered };
    });
    return `Marked ${MARK_SYMBOL[result.annotation.verdict]} ${result.annotation.verdict} on p. ${page} (${result.annotation.id}), ${result.answered ? "next to the user's answer" : 'next to the question (no answer written there yet)'}.`;
  },
});

export const eraseTool = defineTool({
  name: 'erase',
  description: 'Remove things you wrote on the book, by id (a1, a2, …). The user\'s own writing is theirs and cannot be removed.',
  category: 'study',
  input: z.object({ ids: z.union([z.string(), z.array(z.string()).max(50)]) }),
  async run(args, ctx) {
    const { book } = session(ctx);
    const ids = new Set((Array.isArray(args.ids) ? args.ids : args.ids.split(/[,\s]+/)).map((id) => id.trim()).filter(Boolean));
    const refused = book.annotations.filter((a) => ids.has(a.id) && a.author === 'user').map((a) => a.id);
    const { result } = updateBook(book.id, (draft) => {
      const before = draft.annotations.length;
      draft.annotations = draft.annotations.filter((a) => !(ids.has(a.id) && a.author === 'ai'));
      return before - draft.annotations.length;
    });
    const parts = [`Removed ${result} of your note${result === 1 ? '' : 's'}.`];
    if (refused.length) parts.push(`${refused.join(', ')} ${refused.length === 1 ? 'is' : 'are'} the user's and stayed.`);
    return parts.join(' ');
  },
});

export const lookAtPageTool = defineTool({
  name: 'look_at_page',
  description: 'See a page as a picture, with what is written on it: figures, tables, scanned pages and handwriting.',
  category: 'read',
  input: z.object({ page: pageArg }),
  async run(args, ctx) {
    const { book } = session(ctx);
    const page = resolvePage(book, args.page, ctx);
    if (!ctx.recordResultImages) throw new ToolError('Pictures cannot be passed to the model here.');
    const png = await requestPageImage(book.id, page);
    if (!png) throw new ToolError('The book is not open on screen, so the page cannot be seen right now. Read its text with read_pages instead.');
    await ctx.recordResultImages([{ mime: 'image/png', base64: png }]);
    return `Here is page ${page} as the user sees it.`;
  },
});

/** Tools for a Study chat: writing answers only in Solve mode, pictures only for vision models. */
export function studyTools(options: { mode: 'tutor' | 'solve'; vision: boolean }): AgentTool[] {
  return [
    readPagesTool,
    searchBookTool,
    goToPageTool,
    highlightTool,
    addNoteTool,
    ...(options.mode === 'solve' ? [writeAnswerTool] : []),
    markAnswerTool,
    eraseTool,
    ...(options.vision ? [lookAtPageTool] : []),
    calculateTool,
  ] as AgentTool[];
}
