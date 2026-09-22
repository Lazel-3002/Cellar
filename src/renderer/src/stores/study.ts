import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { HIGHLIGHT_COLORS, PEN_COLORS } from '@shared/study/annotations';
import type { Book, StudyAnnotation, StudyScope } from '@shared/types/study';

const HISTORY_LIMIT = 100;

interface StudyEditorState {
  bookId: string | null;
  book: Book | null;
  /** Server version the working copy is based on. */
  baseVersion: number;
  /** Bumps on every local change; saves compare it to know whether more edits arrived meanwhile. */
  revision: number;
  savedRevision: number;
  past: StudyAnnotation[][];
  future: StudyAnnotation[][];
  selectedId: string | null;
  editingId: string | null;
  /** Annotations the model just wrote: they flash once where they land. */
  fresh: Record<string, true>;
  /** The page on screen (1-based). */
  page: number;
  /** Text selected in the viewer, offered as context for the next message. */
  selection: { page: number; text: string } | null;
  /** Pages the model wrote on that the user has not turned to yet. */
  unseen: number[];
  /** The zoom on screen (1 = 100%). */
  scale: number;

  load: (book: Book) => void;
  /** A newer version from the model (or another window); the current state stays undoable. */
  applyRemote: (book: Book) => void;
  markSaved: (version: number, revision: number) => void;
  /** `history: false` skips the undo stack (a stroke still being drawn). */
  change: (mutate: (annotations: StudyAnnotation[]) => StudyAnnotation[] | void, options?: { history?: boolean }) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  setPage: (page: number) => void;
  clearUnseen: () => void;
  setScale: (scale: number) => void;
  setSelection: (selection: { page: number; text: string } | null) => void;
  takeFresh: (id: string) => boolean;
}

const keep = (id: string | null, annotations: StudyAnnotation[]) => (id && annotations.some((a) => a.id === id) ? id : null);

export const useStudyEditor = create<StudyEditorState>((set, get) => ({
  bookId: null,
  book: null,
  baseVersion: 0,
  revision: 0,
  savedRevision: 0,
  past: [],
  future: [],
  selectedId: null,
  editingId: null,
  fresh: {},
  page: 1,
  selection: null,
  unseen: [],
  scale: 1,

  load: (book) =>
    set((s) => ({
      bookId: book.id,
      book,
      baseVersion: book.version,
      revision: 0,
      savedRevision: 0,
      past: s.bookId === book.id ? s.past : [],
      future: s.bookId === book.id ? s.future : [],
      selectedId: null,
      editingId: null,
      fresh: {},
      page: s.bookId === book.id ? s.page : book.lastPage,
      selection: s.bookId === book.id ? s.selection : null,
      unseen: s.bookId === book.id ? s.unseen : [],
    })),

  applyRemote: (book) =>
    set((s) => {
      const before = new Set((s.book?.annotations ?? []).map((a) => a.id));
      const fresh: Record<string, true> = { ...s.fresh };
      const unseen = new Set(s.unseen);
      for (const a of book.annotations) {
        if (a.author !== 'ai' || before.has(a.id)) continue;
        fresh[a.id] = true;
        if (a.page !== s.page) unseen.add(a.page);
      }
      return {
        unseen: [...unseen].sort((a, b) => a - b),
        book,
        baseVersion: book.version,
        savedRevision: s.revision,
        past: s.book ? [...s.past, s.book.annotations].slice(-HISTORY_LIMIT) : s.past,
        future: [],
        selectedId: keep(s.selectedId, book.annotations),
        editingId: keep(s.editingId, book.annotations),
        fresh,
      };
    }),

  markSaved: (version, revision) => set((s) => ({ baseVersion: version, savedRevision: Math.max(s.savedRevision, revision), book: s.book ? { ...s.book, version } : s.book })),

  change: (mutate, options = {}) => {
    const { book } = get();
    if (!book) return;
    const draft = structuredClone(book.annotations);
    const result = mutate(draft) ?? draft;
    set((s) => ({
      book: { ...book, annotations: result },
      revision: s.revision + 1,
      ...(options.history === false ? {} : { past: [...s.past, book.annotations].slice(-HISTORY_LIMIT), future: [] }),
      selectedId: keep(s.selectedId, result),
    }));
  },

  checkpoint: () => set((s) => (s.book ? { past: [...s.past, s.book.annotations].slice(-HISTORY_LIMIT), future: [] } : {})),

  undo: () =>
    set((s) => {
      const previous = s.past[s.past.length - 1];
      if (!previous || !s.book) return {};
      return { book: { ...s.book, annotations: previous }, past: s.past.slice(0, -1), future: [s.book.annotations, ...s.future].slice(0, HISTORY_LIMIT), revision: s.revision + 1, selectedId: keep(s.selectedId, previous), editingId: null };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next || !s.book) return {};
      return { book: { ...s.book, annotations: next }, future: s.future.slice(1), past: [...s.past, s.book.annotations].slice(-HISTORY_LIMIT), revision: s.revision + 1, selectedId: keep(s.selectedId, next), editingId: null };
    }),

  select: (selectedId) => set((s) => ({ selectedId, editingId: selectedId === s.editingId ? s.editingId : null })),
  setEditing: (editingId) => set((s) => ({ editingId, selectedId: editingId ?? s.selectedId })),
  setPage: (page) => set((s) => ({ page, unseen: s.unseen.includes(page) ? s.unseen.filter((p) => p !== page) : s.unseen })),
  clearUnseen: () => set({ unseen: [] }),
  setScale: (scale) => set({ scale }),
  setSelection: (selection) => set({ selection }),
  takeFresh: (id) => {
    if (!get().fresh[id]) return false;
    set((s) => {
      const fresh = { ...s.fresh };
      delete fresh[id];
      return { fresh };
    });
    return true;
  },
}));

export type StudyTool = 'select' | 'highlight' | 'pen' | 'marker' | 'text' | 'note' | 'eraser';

export type PicturesMode = 'auto' | 'always' | 'never';

/** A whole page in view, the page's width, or a fixed zoom (1 = 100%). */
export type StudyZoom = 'page-fit' | 'page-width' | number;

export interface BookScope {
  scope: StudyScope;
  pages: string;
  /** Start page for "from … to here"; unset means the chapter start. */
  from?: number;
}

/** Tools, colours, panel sizes and each book's context choice, kept between sessions. */
interface StudyLayoutState {
  /** The app's sidebar while reading (closed unless opened here, so the page gets the room). */
  sidebar: boolean;
  chatOpen: boolean;
  chatWidth: number;
  tool: StudyTool;
  penColor: string;
  penWidth: number;
  highlightColor: string;
  /** Pictures of the page for vision models: auto sends one when the page is scanned or has handwriting. */
  pictures: PicturesMode;
  zoom: StudyZoom;
  scopes: Record<string, BookScope>;
  setSidebar: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
  setChatWidth: (width: number) => void;
  setTool: (tool: StudyTool) => void;
  setPenColor: (color: string) => void;
  setPenWidth: (width: number) => void;
  setHighlightColor: (color: string) => void;
  setPictures: (mode: PicturesMode) => void;
  setZoom: (zoom: StudyZoom) => void;
  setScope: (bookId: string, scope: Partial<BookScope>) => void;
}

export const DEFAULT_SCOPE: BookScope = { scope: 'page', pages: '' };

export const useStudyLayout = create<StudyLayoutState>()(
  persist(
    (set) => ({
      sidebar: false,
      chatOpen: true,
      chatWidth: 400,
      tool: 'select',
      penColor: PEN_COLORS.blue,
      penWidth: 1.6,
      highlightColor: HIGHLIGHT_COLORS.yellow,
      pictures: 'auto',
      zoom: 'page-fit',
      scopes: {},
      setSidebar: (sidebar) => set({ sidebar }),
      setChatOpen: (chatOpen) => set({ chatOpen }),
      setChatWidth: (chatWidth) => set({ chatWidth: Math.max(300, Math.min(680, chatWidth)) }),
      setTool: (tool) => set({ tool }),
      setPenColor: (penColor) => set({ penColor }),
      setPenWidth: (penWidth) => set({ penWidth: Math.min(8, Math.max(0.6, penWidth)) }),
      setHighlightColor: (highlightColor) => set({ highlightColor }),
      setPictures: (pictures) => set({ pictures }),
      setZoom: (zoom) => set({ zoom: typeof zoom === 'number' ? Math.min(5, Math.max(0.25, Math.round(zoom * 100) / 100)) : zoom }),
      setScope: (bookId, scope) => set((s) => ({ scopes: { ...s.scopes, [bookId]: { ...DEFAULT_SCOPE, ...s.scopes[bookId], ...scope } } })),
    }),
    {
      name: 'cellar-study-layout',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sidebar: s.sidebar, chatOpen: s.chatOpen, chatWidth: s.chatWidth, tool: s.tool, penColor: s.penColor, penWidth: s.penWidth, highlightColor: s.highlightColor, pictures: s.pictures, zoom: s.zoom, scopes: s.scopes }),
    },
  ),
);
