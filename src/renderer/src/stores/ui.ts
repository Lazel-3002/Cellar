import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ThinkingLevel } from '@shared/types/chat';
import type { ModelRef } from '@shared/types/models';

export type ComposerMode = 'chat' | 'cowork';

export interface ArtifactPanelState {
  conversationId: string;
  identifier: string;
  artifactId?: string;
}

interface UiState {
  sidebarOpen: boolean;
  model: ModelRef | null;
  thinking: ThinkingLevel;
  mode: ComposerMode;
  incognito: boolean;
  searchOpen: boolean;
  loadSettingsFor: ModelRef | null;
  artifact: ArtifactPanelState | null;
  artifactWidth: number;
  /** The built-in browser panel is showing. */
  browserOpen: boolean;
  browserWidth: number;
  drafts: Record<string, string>;
  pendingPrompt: string | null;
  /** Cowork home: the chosen folder, or null with `coworkSkipped` when the user chose no folder. */
  coworkFolder: string | null;
  coworkSkipped: boolean;
  coworkProjectId: string | null;
  taskPanelOpen: boolean;
  setCoworkFolder: (folder: string | null) => void;
  setCoworkSkipped: (skipped: boolean) => void;
  setCoworkProject: (projectId: string | null) => void;
  setTaskPanelOpen: (open: boolean) => void;
  setPendingPrompt: (text: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setModel: (model: ModelRef | null) => void;
  setThinking: (level: ThinkingLevel) => void;
  setMode: (mode: ComposerMode) => void;
  setIncognito: (on: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  openLoadSettings: (ref: ModelRef | null) => void;
  openArtifact: (state: ArtifactPanelState | null) => void;
  setArtifactWidth: (width: number) => void;
  setBrowserOpen: (open: boolean) => void;
  setBrowserWidth: (width: number) => void;
  setDraft: (key: string, text: string) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      model: null,
      thinking: 'on',
      mode: 'chat',
      incognito: false,
      searchOpen: false,
      loadSettingsFor: null,
      artifact: null,
      artifactWidth: 560,
      browserOpen: false,
      browserWidth: 620,
      drafts: {},
      pendingPrompt: null,
      coworkFolder: null,
      coworkSkipped: false,
      coworkProjectId: null,
      taskPanelOpen: true,
      setCoworkFolder: (coworkFolder) => set({ coworkFolder, coworkSkipped: false }),
      setCoworkSkipped: (coworkSkipped) => set(coworkSkipped ? { coworkSkipped, coworkFolder: null } : { coworkSkipped }),
      setCoworkProject: (coworkProjectId) => set({ coworkProjectId }),
      setTaskPanelOpen: (taskPanelOpen) => set({ taskPanelOpen }),
      setPendingPrompt: (pendingPrompt) => set({ pendingPrompt }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setModel: (model) => set({ model }),
      setThinking: (thinking) => set({ thinking }),
      setMode: (mode) => set({ mode }),
      setIncognito: (incognito) => set({ incognito }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      openLoadSettings: (loadSettingsFor) => set({ loadSettingsFor }),
      openArtifact: (artifact) => set(artifact ? { artifact, browserOpen: false } : { artifact }),
      setArtifactWidth: (artifactWidth) => set({ artifactWidth: Math.max(380, Math.min(1400, artifactWidth)) }),
      // Only one right-hand panel at a time: the native browser view would cover the artifact anyway.
      setBrowserOpen: (browserOpen) => set(browserOpen ? { browserOpen, artifact: null } : { browserOpen }),
      setBrowserWidth: (browserWidth) => set({ browserWidth: Math.max(380, Math.min(1400, browserWidth)) }),
      setDraft: (key, text) =>
        set((s) => {
          const drafts = { ...s.drafts };
          if (text) drafts[key] = text;
          else delete drafts[key];
          return { drafts };
        }),
    }),
    {
      name: 'cellar-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sidebarOpen: s.sidebarOpen,
        model: s.model,
        thinking: s.thinking,
        mode: s.mode,
        artifactWidth: s.artifactWidth,
        browserWidth: s.browserWidth,
        drafts: s.drafts,
        coworkFolder: s.coworkFolder,
        coworkSkipped: s.coworkSkipped,
        taskPanelOpen: s.taskPanelOpen,
      }),
    },
  ),
);
