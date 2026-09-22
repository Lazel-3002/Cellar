import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { z } from 'zod';
import type { StudySession } from '@shared/types/study';
import { chat } from '../chat/orchestrator';
import { deleteConversations } from '../db/chat-store';
import { bus } from '../lib/events';
import { handle } from '../ipc/register';
import { exportBook } from './export';
import { deliverPageImage } from './render';
import { indexBook, searchBook } from './search';
import { bookBytes, bookChats, bookConversationIds, deleteBook, getBook, importBook, listBooks, renameBook, saveAnnotations, setLastPage } from './store';

const id = z.string().min(1).max(80);

const PDFJS_DIRS = { cMapUrl: 'cmaps', standardFontDataUrl: 'standard_fonts', wasmUrl: 'wasm' } as const;

/** The latest chat about a book, or a new one. */
async function openBook(bookId: string): Promise<{ conversationId: string }> {
  getBook(bookId);
  const [latest] = bookChats(bookId);
  return latest ? { conversationId: latest.conversationId } : chat.createStudyChat(bookId);
}

export function registerStudyHandlers(): void {
  handle('study:list', () => listBooks());

  handle('study:import', async (paths) => {
    const files = z.array(z.string().min(1).max(4096)).min(1).max(20).parse(paths);
    const out: Array<{ bookId: string; conversationId: string; title: string; existing: boolean }> = [];
    for (const file of files) {
      const name = file.split(/[\\/]/).pop() ?? file;
      const { book, existing } = await importBook(file, (done, total) => bus.emit('study:progress', { fileName: name, done, total }));
      const { conversationId } = await openBook(book.id);
      out.push({ bookId: book.id, conversationId, title: book.title, existing });
      if (!existing) void indexBook(book.id);
    }
    bus.emit('chat:changed', {});
    return out;
  });

  handle('study:open', (bookId) => openBook(id.parse(bookId)));

  handle('study:get', (conversationId): StudySession => {
    const conversation = chat.getConversation(id.parse(conversationId)).conversation;
    const study = conversation.task?.study;
    if (conversation.kind !== 'study' || !study) throw new Error('This is not a Study chat.');
    return { conversationId: conversation.id, book: getBook(study.bookId), mode: study.mode };
  });

  handle('study:bytes', (bookId) => bookBytes(id.parse(bookId)));

  handle('study:save', (bookId, annotations, baseVersion) => {
    if (!Array.isArray(annotations)) throw new Error('The notes could not be read.');
    if (JSON.stringify(annotations).length > 30_000_000) throw new Error('Too much is written on this book to save.');
    const book = saveAnnotations(id.parse(bookId), annotations, z.number().int().parse(baseVersion));
    return { version: book.version };
  });

  handle('study:setPage', (bookId, page) => setLastPage(id.parse(bookId), z.number().int().min(1).parse(page)));
  handle('study:rename', (bookId, title) => {
    renameBook(id.parse(bookId), z.string().max(400).parse(title));
    bus.emit('chat:changed', {});
  });

  handle('study:delete', async (bookId) => {
    const book = id.parse(bookId);
    const conversations = bookConversationIds(book);
    for (const conversationId of conversations) chat.stopConversation(conversationId);
    deleteConversations(conversations);
    await deleteBook(book);
    bus.emit('chat:changed', {});
  });

  handle('study:chats', (bookId) => bookChats(id.parse(bookId)));
  handle('study:newChat', async (bookId) => {
    const book = id.parse(bookId);
    getBook(book);
    const [latest] = bookChats(book);
    const mode = latest ? chat.getConversation(latest.conversationId).conversation.task?.study?.mode : undefined;
    return chat.createStudyChat(book, mode ?? 'tutor');
  });
  handle('study:setMode', (conversationId, mode) => chat.setStudyMode(id.parse(conversationId), z.enum(['tutor', 'solve']).parse(mode)));

  handle('study:export', (bookId) => exportBook(id.parse(bookId), { window: BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] }));
  handle('study:search', (bookId, query) => searchBook(id.parse(bookId), z.string().max(500).parse(query), 12));
  handle('study:pdfAsset', async (kind, filename) => {
    const dir = PDFJS_DIRS[z.enum(['cMapUrl', 'standardFontDataUrl', 'wasmUrl']).parse(kind)];
    const name = z
      .string()
      .regex(/^[\w.-]{1,120}$/)
      .refine((value) => !value.includes('..'))
      .parse(filename);
    return new Uint8Array(await readFile(join(app.getAppPath(), 'node_modules', 'pdfjs-dist', dir, name)));
  });
  handle('study:rendered', (requestId, png) => deliverPageImage(id.parse(requestId), png === null ? null : z.string().parse(png)));
}
