import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { normalizeAnnotations } from '@shared/study/annotations';
import { linesText } from '@shared/study/lines';
import type { Book, BookChat, BookOutlineItem, BookPageInfo, BookSummary, PageLine, StudyAnnotation } from '@shared/types/study';
import { all, get, run, transaction } from '../db/client';
import { bus } from '../lib/events';
import { newId, safeJsonParse } from '../lib/util';
import { paths } from '../system/paths';
import { extractPdf } from './extract';

/** Textbooks run to a few hundred megabytes at most; past this it is not a book. */
export const MAX_BOOK_BYTES = 600 * 1024 * 1024;

interface BookRow {
  id: string;
  title: string;
  file_name: string;
  hash: string;
  size: number;
  page_count: number;
  pages: string;
  outline: string;
  last_page: number;
  annotations: string;
  version: number;
  created_at: number;
  updated_at: number;
}

export class BookConflictError extends Error {
  constructor() {
    super('The book changed while you were writing on it (the tutor may have added something). Your view has been refreshed; try again.');
    this.name = 'BookConflictError';
  }
}

export const bookFile = (id: string) => join(paths().books, `${id}.pdf`);

function toBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    size: row.size,
    pageCount: row.page_count,
    pages: safeJsonParse<BookPageInfo[]>(row.pages, []),
    outline: safeJsonParse<BookOutlineItem[]>(row.outline, []),
    lastPage: Math.min(Math.max(1, row.last_page), Math.max(1, row.page_count)),
    annotations: safeJsonParse<StudyAnnotation[]>(row.annotations, []),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getBook(id: string): Book {
  const row = get<BookRow>('SELECT * FROM books WHERE id = ?', id);
  if (!row) throw new Error('This book is gone. It may have been removed from the shelf.');
  return toBook(row);
}

export function findBook(id: string): Book | undefined {
  const row = get<BookRow>('SELECT * FROM books WHERE id = ?', id);
  return row ? toBook(row) : undefined;
}

const titleFromFile = (name: string) => basename(name, extname(name)).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Untitled book';

/**
 * Adds a PDF to the shelf: a private copy of the file, its text by page and its outline. The same
 * file added twice opens the book already there.
 */
export async function importBook(filePath: string, onProgress?: (done: number, total: number) => void): Promise<{ book: Book; existing: boolean }> {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error(`${basename(filePath)} is not a file.`);
  if (info.size > MAX_BOOK_BYTES) throw new Error(`${basename(filePath)} is larger than ${MAX_BOOK_BYTES / 1024 / 1024} MB.`);
  const bytes = new Uint8Array(await readFile(filePath));
  return importBookBytes(basename(filePath), bytes, onProgress);
}

export async function importBookBytes(fileName: string, bytes: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<{ book: Book; existing: boolean }> {
  if (bytes.byteLength > MAX_BOOK_BYTES) throw new Error(`${fileName} is larger than ${MAX_BOOK_BYTES / 1024 / 1024} MB.`);
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('latin1');
  if (!head.includes('%PDF-')) throw new Error(`${fileName} is not a PDF.`);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const existing = get<BookRow>('SELECT * FROM books WHERE hash = ?', hash);
  if (existing) return { book: toBook(existing), existing: true };

  let extracted;
  try {
    extracted = await extractPdf(bytes, onProgress);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/password/i.test(message)) throw new Error(`${fileName} is password-protected. Remove the password and add it again.`);
    throw new Error(`${fileName} could not be read as a PDF: ${message}`);
  }
  if (extracted.pageCount === 0) throw new Error(`${fileName} has no pages.`);

  const id = newId();
  await mkdir(paths().books, { recursive: true });
  await writeFile(bookFile(id), bytes);
  const now = Date.now();
  const metaTitle = extracted.title && !/^(untitled|microsoft word|document)\b/i.test(extracted.title) && extracted.title.length <= 160 ? extracted.title : '';
  try {
    transaction(() => {
      run(
        'INSERT INTO books (id, title, file_name, hash, size, page_count, pages, outline, last_page, annotations, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?)',
        id,
        metaTitle || titleFromFile(fileName),
        fileName.slice(0, 260),
        hash,
        bytes.byteLength,
        extracted.pageCount,
        JSON.stringify(extracted.pages),
        JSON.stringify(extracted.outline),
        '[]',
        now,
        now,
      );
      extracted.lines.forEach((lines, index) => {
        const text = linesText(lines);
        run('INSERT INTO book_pages (book_id, page, text, lines) VALUES (?, ?, ?, ?)', id, index + 1, text, JSON.stringify(lines));
        if (text.trim()) run('INSERT INTO book_fts (content, book_id, page) VALUES (?, ?, ?)', text, id, index + 1);
      });
    });
  } catch (err) {
    await rm(bookFile(id), { force: true });
    throw err;
  }
  return { book: getBook(id), existing: false };
}

export function listBooks(): BookSummary[] {
  const rows = all<BookRow>('SELECT * FROM books ORDER BY updated_at DESC');
  const chats = all<{ book_id: string; id: string; n: number; rn: number }>(
    `SELECT json_extract(task, '$.study.bookId') AS book_id, id, COUNT(*) OVER (PARTITION BY json_extract(task, '$.study.bookId')) AS n,
            ROW_NUMBER() OVER (PARTITION BY json_extract(task, '$.study.bookId') ORDER BY updated_at DESC) AS rn
     FROM conversations WHERE kind = 'study'`,
  ).filter((row) => row.rn === 1);
  const byBook = new Map(chats.map((row) => [row.book_id, row]));
  return rows.map((row) => {
    const book = toBook(row);
    const chat = byBook.get(book.id);
    return {
      id: book.id,
      title: book.title,
      fileName: book.fileName,
      pageCount: book.pageCount,
      lastPage: book.lastPage,
      annotationCount: book.annotations.length,
      scannedPages: book.pages.filter((page) => page.chars < 20).length,
      conversationId: chat?.id ?? null,
      chats: chat?.n ?? 0,
      updatedAt: book.updatedAt,
    };
  });
}

export function bookChats(bookId: string): BookChat[] {
  return all<{ id: string; title: string; updated_at: number }>(
    "SELECT id, title, updated_at FROM conversations WHERE kind = 'study' AND json_extract(task, '$.study.bookId') = ? ORDER BY updated_at DESC",
    bookId,
  ).map((row) => ({ conversationId: row.id, title: row.title || 'New chat', updatedAt: row.updated_at }));
}

function write(book: Book, source: 'agent' | 'user'): Book {
  const next = { ...book, version: book.version + 1, updatedAt: Date.now() };
  run('UPDATE books SET annotations = ?, version = ?, updated_at = ? WHERE id = ?', JSON.stringify(next.annotations), next.version, next.updatedAt, next.id);
  bus.emit('study:changed', { bookId: next.id, version: next.version, source });
  return next;
}

/** Saves the annotation layer as edited in the viewer. */
export function saveAnnotations(bookId: string, annotations: unknown, baseVersion: number): Book {
  const current = getBook(bookId);
  if (current.version !== baseVersion) throw new BookConflictError();
  return write({ ...current, annotations: normalizeAnnotations(annotations, current.pages) }, 'user');
}

/** Changes a book's annotations from a tool: reads the latest version, applies the change, saves it. */
export function updateBook<T>(id: string, change: (book: Book) => T): { book: Book; result: T } {
  const draft = structuredClone(getBook(id));
  const result = change(draft);
  draft.annotations = normalizeAnnotations(draft.annotations, draft.pages);
  return { book: write(draft, 'agent'), result };
}

export function setLastPage(bookId: string, page: number): void {
  run('UPDATE books SET last_page = ? WHERE id = ? AND page_count >= ?', Math.max(1, Math.round(page)), bookId, Math.max(1, Math.round(page)));
}

export function renameBook(bookId: string, title: string): void {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!clean) throw new Error('Give the book a name.');
  run('UPDATE books SET title = ?, updated_at = ? WHERE id = ?', clean, Date.now(), bookId);
}

/** Conversations about a book, so removing the book can remove its chats too. */
export function bookConversationIds(bookId: string): string[] {
  return all<{ id: string }>("SELECT id FROM conversations WHERE kind = 'study' AND json_extract(task, '$.study.bookId') = ?", bookId).map((row) => row.id);
}

export async function deleteBook(bookId: string): Promise<void> {
  transaction(() => {
    run('DELETE FROM book_fts WHERE book_id = ?', bookId);
    run('DELETE FROM books WHERE id = ?', bookId);
  });
  await rm(bookFile(bookId), { force: true });
}

export async function bookBytes(bookId: string): Promise<Uint8Array> {
  getBook(bookId);
  return new Uint8Array(await readFile(bookFile(bookId)));
}

export function pageLines(bookId: string, page: number): PageLine[] {
  const row = get<{ lines: string }>('SELECT lines FROM book_pages WHERE book_id = ? AND page = ?', bookId, page);
  return row ? safeJsonParse<PageLine[]>(row.lines, []) : [];
}

export function pagesLines(bookId: string, pages: number[]): Map<number, PageLine[]> {
  const out = new Map<number, PageLine[]>();
  if (pages.length === 0) return out;
  for (let i = 0; i < pages.length; i += 400) {
    const chunk = pages.slice(i, i + 400);
    const rows = all<{ page: number; lines: string }>(`SELECT page, lines FROM book_pages WHERE book_id = ? AND page IN (${chunk.map(() => '?').join(',')})`, bookId, ...chunk);
    for (const row of rows) out.set(row.page, safeJsonParse<PageLine[]>(row.lines, []));
  }
  return out;
}

/** Characters of text per page, cheaply, for budgeting. */
export function pageSizes(book: Book): (page: number) => number {
  return (page) => Math.max(120, (book.pages[page - 1]?.chars ?? 0) + 80);
}

const STOP = new Set(
  'the a an and or of to in on at for is are was were be by with what which who how why when where does do did this that these those it its from as into than then there their your you our can could would should will about bir ve ile bu şu o da de mi mı mu mü ne nedir nasıl neden hangi için gibi daha çok en'.split(' '),
);

/** An FTS5 query that matches any of the meaningful words (a question rarely repeats a page word for word). */
export function bookFtsQuery(input: string): string | null {
  const terms = [...new Set(input.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1 && !STOP.has(term)))].slice(0, 16);
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term}"*`).join(' OR ');
}

/** Pages ranked by the words they share with the query. */
export function keywordSearch(bookId: string, query: string, limit = 12): Array<{ page: number; snippet: string }> {
  const match = bookFtsQuery(query);
  if (!match) return [];
  try {
    return all<{ page: number; snippet: string }>(
      "SELECT page, snippet(book_fts, 0, '«', '»', ' … ', 18) AS snippet FROM book_fts WHERE book_fts MATCH ? AND book_id = ? ORDER BY bm25(book_fts) LIMIT ?",
      match,
      bookId,
      limit,
    ).map((row) => ({ page: Number(row.page), snippet: row.snippet.replace(/\s+/g, ' ').trim() }));
  } catch {
    return [];
  }
}
