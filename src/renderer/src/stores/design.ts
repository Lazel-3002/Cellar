import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Artboard, Design, DesignElement } from '@shared/types/design';

export type DesignTool = 'select' | 'hand' | 'text' | 'rect' | 'ellipse' | 'line';

export interface Selection {
  artboardId: string | null;
  elementIds: string[];
}

const HISTORY_LIMIT = 100;
export const ARTBOARD_GAP = 160;

/** Where each artboard sits on the canvas (left to right). */
export function artboardOffsets(design: Pick<Design, 'artboards'>): Map<string, number> {
  const offsets = new Map<string, number>();
  let x = 0;
  for (const a of design.artboards) {
    offsets.set(a.id, x);
    x += a.width + ARTBOARD_GAP;
  }
  return offsets;
}

interface EditorState {
  conversationId: string | null;
  design: Design | null;
  /** Server version the working copy is based on. */
  baseVersion: number;
  /** Bumps on every local change; saves compare it to know whether more edits arrived meanwhile. */
  revision: number;
  savedRevision: number;
  past: Design[];
  future: Design[];
  selection: Selection;
  editingTextId: string | null;
  tool: DesignTool;
  zoom: number;
  panX: number;
  panY: number;
  clipboard: DesignElement[];

  load: (conversationId: string, design: Design) => void;
  /** A newer version from the model (or another window); the current state stays undoable. */
  applyRemote: (design: Design) => void;
  markSaved: (version: number, revision: number) => void;
  /** Applies a change to a draft copy. `history: false` skips the undo stack (live drags). */
  change: (mutate: (draft: Design) => void, options?: { history?: boolean }) => void;
  /** Changes some elements of one artboard, sharing everything else (cheap enough for live drags). */
  patchElements: (artboardId: string, patches: Record<string, Partial<DesignElement>>, options?: { history?: boolean }) => void;
  /** Push the current state before a drag so the whole drag undoes in one step. */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  select: (selection: Partial<Selection>) => void;
  setEditingText: (id: string | null) => void;
  setTool: (tool: DesignTool) => void;
  setView: (view: Partial<Pick<EditorState, 'zoom' | 'panX' | 'panY'>>) => void;
  setClipboard: (elements: DesignElement[]) => void;
}

export const useDesignEditor = create<EditorState>((set, get) => ({
  conversationId: null,
  design: null,
  baseVersion: 0,
  revision: 0,
  savedRevision: 0,
  past: [],
  future: [],
  selection: { artboardId: null, elementIds: [] },
  editingTextId: null,
  tool: 'select',
  zoom: 0.4,
  panX: 40,
  panY: 60,
  clipboard: [],

  load: (conversationId, design) =>
    set((s) => ({
      conversationId,
      design,
      baseVersion: design.version,
      revision: 0,
      savedRevision: 0,
      past: s.conversationId === conversationId ? s.past : [],
      future: s.conversationId === conversationId ? s.future : [],
      selection: s.conversationId === conversationId ? keepSelection(s.selection, design) : { artboardId: design.artboards[0]?.id ?? null, elementIds: [] },
      editingTextId: null,
    })),

  applyRemote: (design) =>
    set((s) => ({
      design,
      baseVersion: design.version,
      savedRevision: s.revision,
      past: s.design ? [...s.past, s.design].slice(-HISTORY_LIMIT) : s.past,
      future: [],
      selection: keepSelection(s.selection, design),
      editingTextId: s.editingTextId && design.artboards.some((a) => a.elements.some((e) => e.id === s.editingTextId)) ? s.editingTextId : null,
    })),

  markSaved: (version, revision) => set((s) => ({ baseVersion: version, savedRevision: Math.max(s.savedRevision, revision), design: s.design ? { ...s.design, version } : s.design })),

  change: (mutate, options = {}) => {
    const { design } = get();
    if (!design) return;
    const draft = structuredClone(design);
    mutate(draft);
    set((s) => ({
      design: draft,
      revision: s.revision + 1,
      ...(options.history === false ? {} : { past: [...s.past, design].slice(-HISTORY_LIMIT), future: [] }),
      selection: keepSelection(s.selection, draft),
    }));
  },

  patchElements: (artboardId, patches, options = {}) => {
    const { design } = get();
    if (!design) return;
    const next: Design = {
      ...design,
      artboards: design.artboards.map((a) => (a.id !== artboardId ? a : { ...a, elements: a.elements.map((e) => (patches[e.id] ? ({ ...e, ...patches[e.id] } as DesignElement) : e)) })),
    };
    set((s) => ({ design: next, revision: s.revision + 1, ...(options.history === false ? {} : { past: [...s.past, design].slice(-HISTORY_LIMIT), future: [] }) }));
  },

  checkpoint: () => set((s) => (s.design ? { past: [...s.past, s.design].slice(-HISTORY_LIMIT), future: [] } : {})),

  undo: () =>
    set((s) => {
      const previous = s.past[s.past.length - 1];
      if (!previous || !s.design) return {};
      const restored = { ...previous, version: s.design.version };
      return { design: restored, past: s.past.slice(0, -1), future: [s.design, ...s.future].slice(0, HISTORY_LIMIT), revision: s.revision + 1, selection: keepSelection(s.selection, restored), editingTextId: null };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next || !s.design) return {};
      const restored = { ...next, version: s.design.version };
      return { design: restored, future: s.future.slice(1), past: [...s.past, s.design].slice(-HISTORY_LIMIT), revision: s.revision + 1, selection: keepSelection(s.selection, restored), editingTextId: null };
    }),

  select: (selection) => set((s) => ({ selection: { ...s.selection, ...selection }, editingTextId: selection.elementIds && !selection.elementIds.includes(s.editingTextId ?? '') ? null : s.editingTextId })),
  setEditingText: (editingTextId) => set({ editingTextId }),
  setTool: (tool) => set({ tool }),
  setView: (view) => set((s) => ({ zoom: Math.min(8, Math.max(0.02, view.zoom ?? s.zoom)), panX: view.panX ?? s.panX, panY: view.panY ?? s.panY })),
  setClipboard: (clipboard) => set({ clipboard }),
}));

function keepSelection(selection: Selection, design: Design): Selection {
  const artboard = design.artboards.find((a) => a.id === selection.artboardId) ?? design.artboards[0] ?? null;
  return { artboardId: artboard?.id ?? null, elementIds: artboard ? selection.elementIds.filter((id) => artboard.elements.some((e) => e.id === id)) : [] };
}

export function selectedArtboard(state: Pick<EditorState, 'design' | 'selection'>): Artboard | undefined {
  return state.design?.artboards.find((a) => a.id === state.selection.artboardId);
}

export function selectedElements(state: Pick<EditorState, 'design' | 'selection'>): DesignElement[] {
  const artboard = selectedArtboard(state);
  if (!artboard) return [];
  return artboard.elements.filter((e) => state.selection.elementIds.includes(e.id));
}

/** Panel layout preferences for the design editor. */
interface DesignLayoutState {
  chatOpen: boolean;
  inspectorOpen: boolean;
  chatWidth: number;
  inspectorTab: 'properties' | 'layers';
  sidebar: boolean;
  setChatOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setChatWidth: (width: number) => void;
  setInspectorTab: (tab: 'properties' | 'layers') => void;
  setSidebar: (open: boolean) => void;
}

export const useDesignLayout = create<DesignLayoutState>()(
  persist(
    (set) => ({
      chatOpen: true,
      inspectorOpen: true,
      chatWidth: 380,
      inspectorTab: 'properties',
      sidebar: false,
      setChatOpen: (chatOpen) => set({ chatOpen }),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
      setChatWidth: (chatWidth) => set({ chatWidth: Math.max(300, Math.min(640, chatWidth)) }),
      setInspectorTab: (inspectorTab) => set({ inspectorTab }),
      setSidebar: (sidebar) => set({ sidebar }),
    }),
    { name: 'cellar-design-layout', storage: createJSONStorage(() => localStorage), partialize: (s) => ({ chatOpen: s.chatOpen, inspectorOpen: s.inspectorOpen, chatWidth: s.chatWidth, inspectorTab: s.inspectorTab }) },
  ),
);
