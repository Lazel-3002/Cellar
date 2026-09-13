import type { PermissionMode } from './agent';
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
}

export type AppSettingsPatch = Partial<Omit<AppSettings, 'hasHfToken'>> & {
  /** undefined = keep, '' = clear. */
  hfToken?: string;
};
