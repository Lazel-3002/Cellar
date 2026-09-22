/**
 * The part of the book a message comes with. The user picks the scope next to the composer (this
 * page, some pages, from the chapter start to here, the whole book); a range too long for the
 * model's context keeps the page on screen and its neighbours, and "whole book" on a real
 * textbook becomes a search for the question.
 */
import { pageForModel } from '@shared/study/annotations';
import { fitPages, formatPageList, scopePages, sectionOf } from '@shared/study/pages';
import type { Book, StudyContext } from '@shared/types/study';
import { searchBook } from './search';
import { pageSizes, pagesLines } from './store';

export interface PagePick {
  context: StudyContext;
  included: number[];
  omitted: number[];
  /** Whole-book scope that did not fit: the pages were found by searching for the question. */
  searched: boolean;
}

export function defaultContext(book: Book, context?: StudyContext): StudyContext {
  const page = Math.min(Math.max(1, Math.round(context?.page ?? book.lastPage)), book.pageCount);
  return { scope: 'page', ...context, page };
}

/** Which pages go into the prompt (decided once per turn; searching may call the embedding model). */
export async function pickPages(book: Book, contextInput: StudyContext | undefined, query: string, budgetChars: number): Promise<PagePick> {
  const context = defaultContext(book, contextInput);
  const cost = pageSizes(book);
  if (context.scope === 'book') {
    const all = scopePages(context, book.pageCount);
    const total = all.reduce((sum, page) => sum + cost(page), 0);
    if (total <= budgetChars) return { context, included: all, omitted: [], searched: false };
    const hits = query.trim() ? await searchBook(book.id, query, 10) : [];
    const wanted = [...new Set([context.page, ...hits.map((hit) => hit.page)])];
    const { included } = fitPages(wanted, context.page, cost, budgetChars);
    return { context, included, omitted: [], searched: true };
  }
  const wanted = scopePages(context, book.pageCount);
  return { context, ...fitPages(wanted, context.page, cost, budgetChars), searched: false };
}

/** The picked pages as the model reads them, with what is written on them (re-read every round). */
export function pagesText(book: Book, pick: PagePick): string {
  const lines = pagesLines(book.id, pick.included);
  const parts = pick.included.map((page) => pageForModel(page, lines.get(page) ?? [], book.annotations, { scanned: (book.pages[page - 1]?.chars ?? 0) < 20 }));
  const notes: string[] = [];
  if (pick.searched) notes.push(`These pages were found by searching the book for the user's message (the whole book, ${book.pageCount} pages, is too long to include). Call search_book or read_pages for anything else.`);
  if (pick.omitted.length) notes.push(`Left out for space: pages ${formatPageList(pick.omitted)}. Call read_pages to read them.`);
  return `${parts.join('\n\n')}${notes.length ? `\n\n${notes.join('\n')}` : ''}`;
}

/** "page 12 (in "Photosynthesis")" for the prompt. */
export function whereLabel(book: Book, page: number): string {
  const section = sectionOf(book.outline, page);
  return `page ${page}${section ? ` (in "${section.title}")` : ''}`;
}
