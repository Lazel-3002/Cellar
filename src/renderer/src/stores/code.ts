import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SideChatMessage, TranscriptView } from '@shared/types/code';

export type CodePane = 'changes' | 'files' | 'preview' | 'terminal';

export interface EditorRequest {
  conversationId: string;
  path: string;
  line?: number;
  /** Changes on every request so the same file can be re-opened. */
  nonce: number;
}

export interface PreviewRequest {
  conversationId: string;
  url: string;
  nonce: number;
}

interface CodeUiState {
  /** Right-hand pane of a session: open, width and active tab. */
  paneOpen: boolean;
  paneWidth: number;
  pane: CodePane;
  view: TranscriptView;
  sideChatOpen: boolean;
  /** Side conversations per session; kept in memory only. */
  sideChats: Record<string, SideChatMessage[]>;
  /** A question to ask as soon as the side chat opens (from /btw). */
  sideChatDrafts: Record<string, string>;
  editorRequest: EditorRequest | null;
  previewRequest: PreviewRequest | null;
  /** New-session screen. */
  repo: string | null;
  baseBranch: string | null;
  setPaneOpen: (open: boolean) => void;
  setPaneWidth: (width: number) => void;
  setPane: (pane: CodePane) => void;
  setView: (view: TranscriptView) => void;
  setSideChatOpen: (open: boolean) => void;
  setSideChat: (conversationId: string, messages: SideChatMessage[]) => void;
  setSideChatDraft: (conversationId: string, text: string | null) => void;
  /** Show a file in the Files tab (opening the pane). */
  openFile: (conversationId: string, path: string, line?: number) => void;
  /** Show a URL in the Preview tab (opening the pane). */
  openPreview: (conversationId: string, url: string) => void;
  setRepo: (repo: string | null) => void;
  setBaseBranch: (branch: string | null) => void;
}

export const useCodeUi = create<CodeUiState>()(
  persist(
    (set) => ({
      paneOpen: true,
      paneWidth: 560,
      pane: 'changes',
      view: 'normal',
      sideChatOpen: false,
      sideChats: {},
      sideChatDrafts: {},
      editorRequest: null,
      previewRequest: null,
      repo: null,
      baseBranch: null,
      setPaneOpen: (paneOpen) => set({ paneOpen }),
      setPaneWidth: (paneWidth) => set({ paneWidth: Math.max(360, Math.min(1400, Math.round(paneWidth))) }),
      setPane: (pane) => set({ pane, paneOpen: true }),
      setView: (view) => set({ view }),
      setSideChatOpen: (sideChatOpen) => set({ sideChatOpen }),
      setSideChat: (conversationId, messages) => set((s) => ({ sideChats: { ...s.sideChats, [conversationId]: messages } })),
      setSideChatDraft: (conversationId, text) =>
        set((s) => {
          const sideChatDrafts = { ...s.sideChatDrafts };
          if (text) sideChatDrafts[conversationId] = text;
          else delete sideChatDrafts[conversationId];
          return { sideChatDrafts };
        }),
      openFile: (conversationId, path, line) => set({ pane: 'files', paneOpen: true, editorRequest: { conversationId, path, line, nonce: Date.now() } }),
      openPreview: (conversationId, url) => set({ pane: 'preview', paneOpen: true, previewRequest: { conversationId, url, nonce: Date.now() } }),
      setRepo: (repo) => set({ repo, baseBranch: null }),
      setBaseBranch: (baseBranch) => set({ baseBranch }),
    }),
    {
      name: 'cellar-code-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ paneOpen: s.paneOpen, paneWidth: s.paneWidth, pane: s.pane, view: s.view, repo: s.repo }),
    },
  ),
);
