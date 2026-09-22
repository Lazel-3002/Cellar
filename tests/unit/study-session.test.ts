import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamEvent } from '../../src/shared/types/chat';
import type { ModelEntry } from '../../src/shared/types/models';
import type { ProviderStatus } from '../../src/shared/types/providers';
import type { StudyAnnotation } from '../../src/shared/types/study';

process.env.CELLAR_HOME = join(tmpdir(), `cellar-study-home-${process.pid}`);

const { initPaths } = await import('../../src/main/system/paths');
const { closeDatabase, openDatabase } = await import('../../src/main/db/client');
const { settings } = await import('../../src/main/services/settings');
const { providers } = await import('../../src/main/providers/registry');
const { chat } = await import('../../src/main/chat/orchestrator');
const store = await import('../../src/main/study/store');
const { pickPages, pagesText } = await import('../../src/main/study/context');
const { renderAnnotatedPdf } = await import('../../src/main/study/export');
const { blanksInPdf } = await import('../../src/main/study/glyphs');
const { shortComment } = await import('../../src/main/study/tools');
type ChatRequest = import('../../src/main/providers/types').ChatRequest;

/** A two-page worksheet, drawn with pdf-lib the way a textbook's exercise page is laid out. */
async function worksheet(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Science Workbook');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const first = doc.addPage([595, 842]);
  const lines: Array<[string, number]> = [
    ['Chapter 3 Exercises', 780],
    ['1. What is the unit of force?', 740],
    ['..............................................', 718],
    ['2. Photosynthesis happens in the ________ of the cell.', 680],
    ['3. Explain why leaves are green.', 640],
    ['4. A car travels 120 km in 2 hours. What is its speed?', 520],
  ];
  for (const [text, y] of lines) first.drawText(text, { x: 60, y, size: 12, font });
  const second = doc.addPage([595, 842]);
  second.drawText('Light travels at about 300000 km per second.', { x: 60, y: 780, size: 12, font });
  second.drawText('Chlorophyll absorbs red and blue light and reflects green.', { x: 60, y: 760, size: 12, font });
  return doc.save();
}

describe('study', () => {
  class FakeProvider {
    readonly id = 'fake';
    readonly kind = 'openai' as const;
    readonly name = 'Fake';
    readonly canManageModels = false;
    readonly canDownload = false;
    requests: ChatRequest[] = [];
    script: (req: ChatRequest) => StreamEvent[] = () => [{ type: 'text', delta: 'ok' }];
    async status(): Promise<ProviderStatus> {
      return { id: this.id, kind: this.kind, name: this.name, baseUrl: '', state: 'online', canManageModels: false, canDownload: false };
    }
    async listModels(): Promise<ModelEntry[]> {
      return [];
    }
    async *chat(req: ChatRequest): AsyncGenerator<StreamEvent> {
      this.requests.push(req);
      for (const event of this.script(req)) yield event;
      yield { type: 'done', stopReason: 'stop' };
    }
  }
  const fake = new FakeProvider();
  const entry: ModelEntry = {
    ref: { providerId: 'fake', modelId: 'tutor' },
    providerKind: 'openai',
    providerName: 'Fake',
    displayName: 'Fake Tutor',
    contextLength: 32768,
    capabilities: { vision: false, tools: true, reasoning: false, embedding: false },
    reasoningStyle: 'none',
    loaded: true,
  };
  let userData: string;
  let bookId = '';
  let conversationId = '';
  const call = (name: string, args: unknown): StreamEvent => ({ type: 'tool_call', id: `c${Math.random()}`, name, argumentsDelta: JSON.stringify(args) });
  const toolResults = (req: ChatRequest) =>
    req.messages
      .slice(req.messages.map((m) => m.role).lastIndexOf('user'))
      .filter((m) => m.role === 'tool')
      .map((m) => m.content);

  async function finished(id: string, messageId: string) {
    for (let i = 0; i < 500; i++) {
      const message = chat.getConversation(id).messages.find((candidate) => candidate.id === messageId)!;
      if (message.status !== 'streaming') return message;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('timed out');
  }

  beforeAll(async () => {
    userData = await mkdtemp(join(tmpdir(), 'cellar-study-data-'));
    initPaths(userData, userData);
    closeDatabase();
    openDatabase(':memory:');
    settings.update({ autoTitle: false, coworkNotifications: false });
    (providers as unknown as { get: () => FakeProvider }).get = () => fake;
    (providers as unknown as { findModel: () => Promise<ModelEntry> }).findModel = async () => entry;
  });

  afterAll(async () => {
    chat.stopAll();
    await rm(userData, { recursive: true, force: true }).catch(() => undefined);
    await rm(process.env.CELLAR_HOME!, { recursive: true, force: true }).catch(() => undefined);
  });

  it('reads a PDF onto the shelf once, with its text as positioned lines', async () => {
    const bytes = await worksheet();
    const { book, existing } = await store.importBookBytes('science-workbook.pdf', bytes);
    expect(existing).toBe(false);
    bookId = book.id;
    expect(book).toMatchObject({ title: 'Science Workbook', pageCount: 2, lastPage: 1, annotations: [] });
    expect(book.pages[0]).toMatchObject({ width: 595, height: 842 });
    const lines = store.pageLines(book.id, 1);
    expect(lines.map((line) => line.text)).toEqual([
      'Chapter 3 Exercises',
      '1. What is the unit of force?',
      '..............................................',
      '2. Photosynthesis happens in the ________ of the cell.',
      '3. Explain why leaves are green.',
      '4. A car travels 120 km in 2 hours. What is its speed?',
    ]);
    // Top-left page coordinates: pdf-lib drew the question at y = 740 from the bottom.
    expect(lines[1].x).toBeCloseTo(60, 0);
    expect(lines[1].y + lines[1].h).toBeGreaterThan(842 - 740);
    expect(lines[1].y).toBeLessThan(842 - 740);

    const again = await store.importBookBytes('copy.pdf', bytes);
    expect(again).toMatchObject({ existing: true, book: { id: book.id } });
    await expect(store.importBookBytes('notes.txt', new TextEncoder().encode('hello'))).rejects.toThrow(/not a PDF/);
    expect(store.keywordSearch(book.id, 'how fast does light travel')[0]?.page).toBe(2);
    expect(store.listBooks()[0]).toMatchObject({ id: book.id, pageCount: 2, scannedPages: 0, chats: 0 });
  });

  it('picks the pages that go with a message', async () => {
    const book = store.getBook(bookId);
    const page = await pickPages(book, { page: 1, scope: 'page' }, '', 10_000);
    expect(page.included).toEqual([1]);
    const whole = await pickPages(book, { page: 1, scope: 'book' }, 'light', 10_000);
    expect(whole).toMatchObject({ included: [1, 2], searched: false });
    // Too small a budget for the whole book: search for the question instead.
    const searched = await pickPages(book, { page: 1, scope: 'book' }, 'how fast is light', 200);
    expect(searched.searched).toBe(true);
    expect(searched.included).toContain(1);
    expect(pagesText(book, searched)).toContain('found by searching');
  });

  it('tutors on the page: highlights, notes and marks, but never writes the answer', async () => {
    ({ conversationId } = await chat.createStudyChat(bookId));
    // The user's own answer to question 1, on the dotted line.
    const book = store.getBook(bookId);
    const mine: StudyAnnotation = { id: 'a1', type: 'text', page: 1, author: 'user', createdAt: 1, x: 60, y: 110, width: 200, size: 11, text: 'Newton', color: '#1f1f1f' };
    store.saveAnnotations(bookId, [mine], book.version);

    let results: string[] = [];
    fake.requests = [];
    fake.script = (req) => {
      const done = toolResults(req);
      if (done.length === 0) {
        return [
          call('highlight', { page: 1, text: 'photosynthesis happens in the', color: 'green' }),
          call('add_note', { near: '3', text: 'Think about which colours chlorophyll absorbs (p. 2).' }),
          call('mark_answer', { question: '1', verdict: 'correct', comment: 'yes, N' }),
          call('write_answer', { question: '2', answer: 'chloroplasts' }),
        ];
      }
      results = done;
      return [{ type: 'text', delta: 'Question 1 is right. For question 2, look at p. 2.' }];
    };
    const sent = await chat.send({ conversationId, content: 'Check my answers', attachmentIds: [], model: entry.ref, thinking: 'off', studyContext: { page: 1, scope: 'page' } });
    const message = await finished(conversationId, sent.assistantMessageId);
    expect(message.status).toBe('complete');

    const system = fake.requests[0].messages[0].content;
    expect(system).toContain('Tutor mode');
    expect(system).toContain('<page number="1">');
    expect(system).toContain('the user wrote "Newton"');
    expect(system).not.toContain('Light travels');
    const offered = (fake.requests[0].tools ?? []).map((tool) => tool.name);
    expect(offered).toEqual(expect.arrayContaining(['read_pages', 'search_book', 'highlight', 'add_note', 'mark_answer', 'calculate']));
    expect(offered).not.toContain('write_answer');
    expect(offered).not.toContain('look_at_page');

    const after = store.getBook(bookId).annotations;
    expect(after.map((a) => `${a.type}:${a.author}`)).toEqual(['text:user', 'highlight:ai', 'note:ai', 'mark:ai']);
    const highlight = after[1] as Extract<StudyAnnotation, { type: 'highlight' }>;
    expect(highlight.text).toBe('Photosynthesis happens in the');
    const mark = after[3] as Extract<StudyAnnotation, { type: 'mark' }>;
    expect(mark.verdict).toBe('correct');
    // The ✓ goes right after the user's answer ("Newton" at x = 60), not after the question.
    expect(mark.x).toBeGreaterThan(90);
    expect(mark.x).toBeLessThan(130);
    expect(mark.y).toBeCloseTo(110, 0);
    expect(results[2]).toMatch(/next to the user's answer/);
    // write_answer was not offered in Tutor mode, so the call was refused.
    expect(results[3]).toMatch(/write_answer|not available|unknown/i);
    expect(chat.getConversation(conversationId).conversation.title).toBe('Check my answers');
  });

  it('writes answers onto the page in Solve mode', async () => {
    chat.setStudyMode(conversationId, 'solve');
    let results: string[] = [];
    fake.requests = [];
    fake.script = (req) => {
      const done = toolResults(req);
      if (done.length === 0) {
        return [
          call('write_answer', { question: '2', answer: 'chloroplasts' }),
          call('write_answer', { question: 'Explain why leaves are green', answer: 'Chlorophyll reflects green light.' }),
          call('write_answer', { question: 'the capital of France', answer: 'Paris' }),
          call('erase', { ids: ['a1', 'a3'] }),
        ];
      }
      results = done;
      return [{ type: 'text', delta: 'Done.' }];
    };
    const sent = await chat.send({ conversationId, content: 'Fill in 2 and 3', attachmentIds: [], model: entry.ref, thinking: 'off', studyContext: { page: 1, scope: 'page' } });
    await finished(conversationId, sent.assistantMessageId);
    expect(fake.requests[0].messages[0].content).toContain('Solve mode');

    const book = store.getBook(bookId);
    const answers = book.annotations.filter((a): a is Extract<StudyAnnotation, { type: 'text' }> => a.type === 'text' && a.author === 'ai');
    expect(answers.map((a) => a.text)).toEqual(['chloroplasts', 'Chlorophyll reflects green light.']);
    const lines = store.pageLines(bookId, 1);
    // On the printed blank in question 2, exactly where its underscores start …
    const [blank] = (await blanksInPdf(await store.bookBytes(bookId), 1)).filter((b) => b.y < lines[3].y + lines[3].h && b.y + b.h > lines[3].y);
    expect(answers[0].x).toBeCloseTo(blank.x, 1);
    expect(answers[0].y).toBeGreaterThan(lines[3].y - 4);
    expect(answers[0].y).toBeLessThan(lines[3].y + lines[3].h);
    // … and in the space under question 3, above question 4.
    expect(answers[1].y).toBeGreaterThan(lines[4].y + lines[4].h);
    expect(answers[1].y).toBeLessThan(lines[5].y);
    expect(results[0]).toMatch(/on the blank/);
    expect(results[2]).toMatch(/not on page 1/);
    // The user's own answer (a1) stays; the model's note (a3) goes.
    expect(results[3]).toMatch(/Removed 1/);
    expect(book.annotations.some((a) => a.id === 'a1')).toBe(true);
    expect(book.annotations.some((a) => a.id === 'a3')).toBe(false);
  });

  it('measures a blank exactly from the glyphs, whatever the font', async () => {
    // Segoe UI draws underscores far narrower than Arial, so no width table finds this blank.
    const fontFile = join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts', 'segoeui.ttf');
    if (!existsSync(fontFile)) return;
    const fontkit = (await import('@pdf-lib/fontkit')).default;
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const bytes = readFileSync(fontFile);
    const font = await doc.embedFont(bytes, { subset: true });
    const page = doc.addPage([595, 842]);
    const before = '3. Fotosentezde havaya verilen gaz ';
    page.drawText(`${before}__________ gazıdır.`, { x: 60, y: 610, size: 12, font });
    page.drawText('...................................', { x: 80, y: 560, size: 12, font });
    const [inline, dotted] = await blanksInPdf(await doc.save(), 1);
    const metrics = fontkit.create(bytes);
    const width = (text: string) => (metrics.layout(text).advanceWidth / metrics.unitsPerEm) * 12;
    expect(inline.x).toBeCloseTo(60 + width(before), 1);
    expect(inline.w).toBeCloseTo(width('__________'), 1);
    expect(inline.y).toBeLessThan(842 - 610);
    expect(inline.y + inline.h).toBeGreaterThan(842 - 610);
    expect(dotted.x).toBeCloseTo(80, 1);
  });

  it('keeps margin comments to a few words', () => {
    expect(shortComment('doğru ✓')).toBe('');
    expect(shortComment('✗ Correct!')).toBe('');
    expect(shortComment('150÷3=50, 45 yanlış ✗')).toBe('150÷3=50, 45 yanlış');
    expect(shortComment('Chlorophyll reflects green light and absorbs red and blue light, so leaves look green')).toMatch(/^Chlorophyll reflects green light and absorbs…$/);
  });

  it('keeps viewer saves and the tutor from overwriting each other', () => {
    const book = store.getBook(bookId);
    store.saveAnnotations(bookId, book.annotations, book.version);
    expect(() => store.saveAnnotations(bookId, book.annotations, book.version)).toThrow(/changed while you were writing/);
  });

  it('exports a copy of the PDF with the notes drawn in, leaving the original alone', async () => {
    const book = store.getBook(bookId);
    const bytes = await renderAnnotatedPdf(book);
    const exported = await PDFDocument.load(bytes);
    expect(exported.getPageCount()).toBe(2);
    const { extractText, getDocumentProxy } = await import('unpdf');
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false });
    expect(text[0]).toContain('chloroplasts');
    expect(text[0]).toContain('Newton');
    const { text: original } = await extractText(await getDocumentProxy(await store.bookBytes(bookId)), { mergePages: false });
    expect(original[0]).not.toContain('chloroplasts');
  });

  it('removes a book with its chats', async () => {
    const { conversationId: second } = await chat.createStudyChat(bookId);
    expect(store.bookChats(bookId)).toHaveLength(2);
    expect(store.listBooks()[0]).toMatchObject({ chats: 2, conversationId: second });
    const { deleteConversations } = await import('../../src/main/db/chat-store');
    deleteConversations(store.bookConversationIds(bookId));
    await store.deleteBook(bookId);
    expect(store.listBooks()).toHaveLength(0);
    expect(chat.conversationExists(conversationId)).toBe(false);
    expect(store.keywordSearch(bookId, 'light')).toEqual([]);
  });
});
