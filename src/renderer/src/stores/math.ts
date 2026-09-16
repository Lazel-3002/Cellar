import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { MathBlock, MathBoard, SketchTool } from '@shared/types/math';

const HISTORY_LIMIT = 100;

interface EditorState {
  conversationId: string | null;
  board: MathBoard | null;
  /** Server version the working copy is based on. */
  baseVersion: number;
  /** Bumps on every local change; saves compare it to know whether more edits arrived meanwhile. */
  revision: number;
  savedRevision: number;
  past: MathBoard[];
  future: MathBoard[];
  selectedId: string | null;
  /** The block being edited in place. */
  editingId: string | null;

  load: (conversationId: string, board: MathBoard) => void;
  /** A newer version from the model (or another window); the current state stays undoable. */
  applyRemote: (board: MathBoard) => void;
  markSaved: (version: number, revision: number) => void;
  /** Applies a change to a draft copy. `history: false` skips the undo stack (live drawing). */
  change: (mutate: (draft: MathBoard) => void, options?: { history?: boolean }) => void;
  /** Push the current state before a drag or a stroke, so it undoes in one step. */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  select: (blockId: string | null) => void;
  setEditing: (blockId: string | null) => void;
}

export const useMathEditor = create<EditorState>((set, get) => ({
  conversationId: null,
  board: null,
  baseVersion: 0,
  revision: 0,
  savedRevision: 0,
  past: [],
  future: [],
  selectedId: null,
  editingId: null,

  load: (conversationId, board) =>
    set((s) => ({
      conversationId,
      board,
      baseVersion: board.version,
      revision: 0,
      savedRevision: 0,
      past: s.conversationId === conversationId ? s.past : [],
      future: s.conversationId === conversationId ? s.future : [],
      selectedId: s.conversationId === conversationId ? keepSelection(s.selectedId, board) : null,
      editingId: null,
    })),

  applyRemote: (board) =>
    set((s) => ({
      board,
      baseVersion: board.version,
      savedRevision: s.revision,
      past: s.board ? [...s.past, s.board].slice(-HISTORY_LIMIT) : s.past,
      future: [],
      selectedId: keepSelection(s.selectedId, board),
      editingId: keepSelection(s.editingId, board),
    })),

  markSaved: (version, revision) =>
    set((s) => ({ baseVersion: version, savedRevision: Math.max(s.savedRevision, revision), board: s.board ? { ...s.board, version } : s.board })),

  change: (mutate, options = {}) => {
    const { board } = get();
    if (!board) return;
    const draft = structuredClone(board);
    mutate(draft);
    set((s) => ({
      board: draft,
      revision: s.revision + 1,
      ...(options.history === false ? {} : { past: [...s.past, board].slice(-HISTORY_LIMIT), future: [] }),
      selectedId: keepSelection(s.selectedId, draft),
    }));
  },

  checkpoint: () => set((s) => (s.board ? { past: [...s.past, s.board].slice(-HISTORY_LIMIT), future: [] } : {})),

  undo: () =>
    set((s) => {
      const previous = s.past[s.past.length - 1];
      if (!previous || !s.board) return {};
      const restored = { ...previous, version: s.board.version };
      return { board: restored, past: s.past.slice(0, -1), future: [s.board, ...s.future].slice(0, HISTORY_LIMIT), revision: s.revision + 1, selectedId: keepSelection(s.selectedId, restored), editingId: null };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next || !s.board) return {};
      const restored = { ...next, version: s.board.version };
      return { board: restored, future: s.future.slice(1), past: [...s.past, s.board].slice(-HISTORY_LIMIT), revision: s.revision + 1, selectedId: keepSelection(s.selectedId, restored), editingId: null };
    }),

  select: (selectedId) => set((s) => ({ selectedId, editingId: selectedId === s.editingId ? s.editingId : null })),
  setEditing: (editingId) => set((s) => ({ editingId, selectedId: editingId ?? s.selectedId })),
}));

function keepSelection(id: string | null, board: MathBoard): string | null {
  return id && board.blocks.some((block) => block.id === id) ? id : null;
}

export function selectedBlock(state: Pick<EditorState, 'board' | 'selectedId'>): MathBlock | undefined {
  return state.board?.blocks.find((block) => block.id === state.selectedId);
}

export type PanelTab = 'calculator' | 'insert' | 'properties';

/** Panel layout, drawing tools and calculator history, kept between sessions. */
interface MathLayoutState {
  chatOpen: boolean;
  panelOpen: boolean;
  chatWidth: number;
  panelTab: PanelTab;
  sidebar: boolean;
  /** Whiteboard tools. */
  tool: SketchTool | 'eraser';
  color: string;
  penWidth: number;
  calcHistory: Array<{ input: string; answer: string }>;
  setChatOpen: (open: boolean) => void;
  setPanelOpen: (open: boolean) => void;
  setChatWidth: (width: number) => void;
  setPanelTab: (tab: PanelTab) => void;
  setSidebar: (open: boolean) => void;
  setTool: (tool: SketchTool | 'eraser') => void;
  setColor: (color: string) => void;
  setPenWidth: (width: number) => void;
  pushCalc: (entry: { input: string; answer: string }) => void;
  clearCalc: () => void;
}

export const PEN_COLORS = ['#141413', '#d97757', '#3f7fd0', '#3f9e63', '#b45ad0'];

export const useMathLayout = create<MathLayoutState>()(
  persist(
    (set) => ({
      chatOpen: true,
      panelOpen: true,
      chatWidth: 380,
      panelTab: 'calculator',
      sidebar: false,
      tool: 'pen',
      color: PEN_COLORS[0],
      penWidth: 2.5,
      calcHistory: [],
      setChatOpen: (chatOpen) => set({ chatOpen }),
      setPanelOpen: (panelOpen) => set({ panelOpen }),
      setChatWidth: (chatWidth) => set({ chatWidth: Math.max(300, Math.min(640, chatWidth)) }),
      setPanelTab: (panelTab) => set({ panelTab }),
      setSidebar: (sidebar) => set({ sidebar }),
      setTool: (tool) => set({ tool }),
      setColor: (color) => set({ color }),
      setPenWidth: (penWidth) => set({ penWidth: Math.min(16, Math.max(1, penWidth)) }),
      pushCalc: (entry) => set((s) => ({ calcHistory: [entry, ...s.calcHistory.filter((item) => item.input !== entry.input)].slice(0, 40) })),
      clearCalc: () => set({ calcHistory: [] }),
    }),
    {
      name: 'cellar-math-layout',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ chatOpen: s.chatOpen, panelOpen: s.panelOpen, chatWidth: s.chatWidth, panelTab: s.panelTab, tool: s.tool, color: s.color, penWidth: s.penWidth, calcHistory: s.calcHistory }),
    },
  ),
);
