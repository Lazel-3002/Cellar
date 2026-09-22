import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { diagramStepCount } from '@shared/math/diagram';
import type { LineStyle, MathBlock, MathBoard, SketchTool } from '@shared/types/math';

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
  /**
   * Blocks the model just wrote, with how many of their steps were already on the board (0 for a new
   * block). Their new steps are drawn or written in one at a time instead of appearing all at once.
   */
  fresh: Record<string, number>;

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
  /** Takes a block's fresh mark (once), so the animation plays one time. */
  takeFresh: (blockId: string) => number | undefined;
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
  fresh: {},

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
      fresh: {},
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
      fresh: { ...s.fresh, ...freshSteps(s.board, board) },
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
  takeFresh: (blockId) => {
    const value = get().fresh[blockId];
    if (value !== undefined) {
      set((s) => {
        const fresh = { ...s.fresh };
        delete fresh[blockId];
        return { fresh };
      });
    }
    return value;
  },
}));

/** Step count of the blocks that play step by step. */
function stepsOf(block: MathBlock): number | null {
  if (block.type === 'diagram') return diagramStepCount(block.diagram);
  if (block.type === 'derivation') return block.steps.length + (block.result ? 1 : 0);
  return null;
}

/** Diagrams and derivations that are new or grew in a newer board, with the steps they had before. */
function freshSteps(before: MathBoard | null, after: MathBoard): Record<string, number> {
  const fresh: Record<string, number> = {};
  for (const block of after.blocks) {
    const now = stepsOf(block);
    if (now === null) continue;
    const old = before?.blocks.find((candidate) => candidate.id === block.id);
    const had = old && old.type === block.type ? (stepsOf(old) ?? 0) : 0;
    if (!old || now > had) fresh[block.id] = old ? had : 0;
  }
  return fresh;
}

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
  tool: SketchTool | 'eraser' | 'highlighter';
  color: string;
  penWidth: number;
  lineStyle: LineStyle;
  /** Pen transparency (alpha), 0.1–1. */
  penOpacity: number;
  calcHistory: Array<{ input: string; answer: string }>;
  setChatOpen: (open: boolean) => void;
  setPanelOpen: (open: boolean) => void;
  setChatWidth: (width: number) => void;
  setPanelTab: (tab: PanelTab) => void;
  setSidebar: (open: boolean) => void;
  setTool: (tool: SketchTool | 'eraser' | 'highlighter') => void;
  setColor: (color: string) => void;
  setPenWidth: (width: number) => void;
  setLineStyle: (style: LineStyle) => void;
  setPenOpacity: (opacity: number) => void;
  pushCalc: (entry: { input: string; answer: string }) => void;
  clearCalc: () => void;
}

/** The first is the theme's ink: dark on light paper, light on the dark theme (exports print it dark). */
export const PEN_COLORS = ['currentColor', '#d64545', '#d97757', '#d9a13c', '#3f9e63', '#2a9d99', '#3f7fd0', '#9b59d0', '#8a8984'];

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
      lineStyle: 'solid',
      penOpacity: 1,
      calcHistory: [],
      setChatOpen: (chatOpen) => set({ chatOpen }),
      setPanelOpen: (panelOpen) => set({ panelOpen }),
      setChatWidth: (chatWidth) => set({ chatWidth: Math.max(300, Math.min(640, chatWidth)) }),
      setPanelTab: (panelTab) => set({ panelTab }),
      setSidebar: (sidebar) => set({ sidebar }),
      setTool: (tool) => set({ tool }),
      setColor: (color) => set({ color }),
      setPenWidth: (penWidth) => set({ penWidth: Math.min(16, Math.max(1, penWidth)) }),
      setLineStyle: (lineStyle) => set({ lineStyle }),
      setPenOpacity: (penOpacity) => set({ penOpacity: Math.min(1, Math.max(0.1, Math.round(penOpacity * 100) / 100)) }),
      pushCalc: (entry) => set((s) => ({ calcHistory: [entry, ...s.calcHistory.filter((item) => item.input !== entry.input)].slice(0, 40) })),
      clearCalc: () => set({ calcHistory: [] }),
    }),
    {
      name: 'cellar-math-layout',
      version: 1,
      // Version 0 stored a fixed near-black ink, which disappears on the dark theme.
      migrate: (state, version) => {
        const saved = (state ?? {}) as Partial<MathLayoutState>;
        return (version < 1 && saved.color === '#141413' ? { ...saved, color: 'currentColor' } : saved) as MathLayoutState;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ chatOpen: s.chatOpen, panelOpen: s.panelOpen, chatWidth: s.chatWidth, panelTab: s.panelTab, tool: s.tool, color: s.color, penWidth: s.penWidth, lineStyle: s.lineStyle, penOpacity: s.penOpacity, calcHistory: s.calcHistory }),
    },
  ),
);
