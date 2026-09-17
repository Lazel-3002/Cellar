import type { PermissionMode } from './agent';
import type { CodeMode } from './code';
import type { ModelRef } from './models';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ChatFont = 'default' | 'sans' | 'system';
/** duckduckgo falls back to Brave Search when DuckDuckGo refuses automated searches. */
export type WebSearchProvider = 'duckduckgo' | 'brave' | 'searxng';

export interface AppSettings {
  userName: string;
  personalPreferences: string;
  theme: ThemePreference;
  accent: string;
  chatFont: ChatFont;
  sendWithEnter: boolean;
  showGenerationStats: boolean;
  autoTitle: boolean;
  /** Ask models to put substantial HTML/SVG/React/diagram output into artifacts. */
  artifacts: boolean;
  /** Let models render a self-contained HTML chart/diagram/widget inline in the chat. */
  inlineVisualizations: boolean;
  /** Let models request an inline photo with a [[image: query]] tag (DuckDuckGo image search). */
  inlineImages: boolean;
  defaultModel: ModelRef | null;
  defaultContextLength: number;
  jitLoad: boolean;
  idleUnloadMinutes: number;
  maxLoadedModels: number;
  modelsDir: string;
  extraModelDirs: string[];
  scanHfCache: boolean;
  scanLmStudio: boolean;
  /** Only a flag reaches the renderer; the token stays in main. */
  hasHfToken: boolean;
  activeRuntimeId: string | null;
  concurrentDownloads: number;
  onboardingDone: boolean;
  /** Permission mode for new Cowork tasks (the last one picked). */
  coworkPermissionMode: PermissionMode;
  /** Model calls per task turn before Cellar pauses the agent. */
  coworkMaxSteps: number;
  /** Let Cowork tasks search the web and open web pages. */
  coworkWebAccess: boolean;
  coworkNotifications: boolean;
  webSearchProvider: WebSearchProvider;
  searxngUrl: string;
  recentFolders: string[];
  /** Mode for new Code sessions (the last one picked). */
  codeMode: CodeMode;
  codeAutoAcceptEdits: boolean;
  /** New sessions in git repositories get their own worktree. */
  codeUseWorktrees: boolean;
  /** Model calls per Code turn before Cellar pauses the agent. */
  codeMaxSteps: number;
  /** Shell for the integrated terminal and run_command. */
  terminalShell: TerminalShell;
  recentRepos: string[];
  /** Chats with tool-capable models can search the web and read pages. */
  chatWebSearch: boolean;
  /** Skills turned off (by skill id). */
  disabledSkills: string[];
  /** Plugins turned off (by plugin id). */
  disabledPlugins: string[];
  /** Models see saved memories and can remember things when asked. */
  memoryEnabled: boolean;
  /** Models can search earlier chats (tool-capable models only). */
  searchPastChats: boolean;
  /** Closing the window keeps Cellar in the notification area so scheduled tasks keep running. */
  runInBackground: boolean;
  /** Global shortcut for the quick entry window ('' turns it off). Electron accelerator syntax. */
  quickEntryShortcut: string;
  /** whisper.cpp model file used for dictation. */
  voiceModel: string;
  /** Dictation language: 'auto' or an ISO 639-1 code. */
  voiceLanguage: string;
  /** Embedding model for project knowledge search; null keeps keyword search only. */
  embeddingModel: ModelRef | null;
  /** Automatic background update checks (every few hours). "Check for updates" in Settings always runs regardless. */
  autoUpdateCheck: boolean;
  /** Read finished assistant replies aloud. */
  voiceReplies: boolean;
  /** SpeechSynthesisVoice.name; '' uses the system default voice. */
  voiceReplyVoice: string;
  /** Let models open, read and click pages in Cellar's built-in browser. The panel itself is always available to the user. */
  browserEnabled: boolean;
}

export type TerminalShell = 'auto' | 'pwsh' | 'powershell' | 'cmd';

export type AppSettingsPatch = Partial<Omit<AppSettings, 'hasHfToken'>> & {
  /** undefined = keep, '' = clear. */
  hfToken?: string;
};
