import type { PermissionMode } from './agent';
import type { CodeMode } from './code';
import type { ModelRef } from './models';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ChatFont = 'default' | 'sans' | 'system';
export type WebSearchProvider = 'duckduckgo' | 'searxng';

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
}

export type TerminalShell = 'auto' | 'pwsh' | 'powershell' | 'cmd';

export type AppSettingsPatch = Partial<Omit<AppSettings, 'hasHfToken'>> & {
  /** undefined = keep, '' = clear. */
  hfToken?: string;
};
