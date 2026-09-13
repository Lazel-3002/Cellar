import type { ModelRef } from './models';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ChatFont = 'default' | 'sans' | 'system';

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
}

export type AppSettingsPatch = Partial<Omit<AppSettings, 'hasHfToken'>> & {
  /** undefined = keep, '' = clear. */
  hfToken?: string;
};
