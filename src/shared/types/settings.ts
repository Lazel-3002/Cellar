import type { PermissionMode } from './agent';
import type { CodeMode } from './code';
import type { ModelRef } from './models';
import type { TtsEngine } from './voice';

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
  /** Quietly extract durable facts from conversations in the background, without being asked. */
  generateMemoryFromChats: boolean;
  /** Let generated memory include sensitive topics (health, religion, politics, etc.). */
  memorySensitiveTopics: boolean;
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
  /** Which engine speaks: Chromium's own voices, or a downloaded piper voice. */
  ttsEngine: TtsEngine;
  /** The piper voice to speak with, e.g. en_US-amy-medium. */
  piperVoice: string;
  /** Re-transcribe while the mic is still open, committing settled text at pauses. */
  voiceStreaming: boolean;
  /** Let models open, read and click pages in Cellar's built-in browser. The panel itself is always available to the user. */
  browserEnabled: boolean;
  /**
   * How any tool call that would normally ask first (opening a web page, filling a field, editing
   * a file, running a command, calling a connector, …) gets approved.
   * manual: the user approves each one, as today. auto: a quick, context-free model call reviews
   * and allows or denies it on its own. bypass: it runs without asking.
   */
  approvalMode: 'manual' | 'auto' | 'bypass';
  /** Built-in-browser tool calls per task turn before Cellar pauses the agent, separate from the overall step limit. */
  browserMaxSteps: number;
  /** Let chats run terminal/PowerShell commands with run_command, sandboxed to ~/.cellar/chat. Off by default. */
  chatCommands: boolean;
  /** Offer the `call(module, task)` tool in chats, so a chat can hand work to Code, Math, Design, Cowork or Voice. */
  moduleCalls: boolean;
  /** How many `call` requests each module accepts per minute. */
  moduleCallsPerMinute: number;
  /** Let models set their own reminders with `create_reminder`; they fire through the scheduled-task machinery. */
  selfScheduling: boolean;
  /** Pause a run when the model repeats one identical tool call 4 times in a row. Off lets it keep retrying unattended. */
  pauseOnRepeatedCalls: boolean;
}

export type TerminalShell = 'auto' | 'pwsh' | 'powershell' | 'cmd';

export type AppSettingsPatch = Partial<Omit<AppSettings, 'hasHfToken'>> & {
  /** undefined = keep, '' = clear. */
  hfToken?: string;
};
