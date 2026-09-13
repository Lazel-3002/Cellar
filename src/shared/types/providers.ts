export type ProviderKind = 'llamacpp' | 'ollama' | 'lmstudio' | 'unsloth' | 'openai';

export const BUILTIN_PROVIDER_IDS = {
  llamacpp: 'llamacpp',
  ollama: 'ollama',
  lmstudio: 'lmstudio',
  unsloth: 'unsloth',
} as const;

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  /** Present only as a boolean flag in the renderer; the key itself never leaves main. */
  hasApiKey: boolean;
  enabled: boolean;
  builtin: boolean;
}

export interface ProviderConfigInput {
  id?: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  /** undefined = keep existing key, '' = clear it. */
  apiKey?: string;
  enabled: boolean;
}

export type ProviderState = 'online' | 'offline' | 'unauthorized' | 'not-installed' | 'disabled' | 'error';

export interface ProviderStatus {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  state: ProviderState;
  version?: string;
  message?: string;
  /** Whether Cellar can load/unload models on this provider. */
  canManageModels: boolean;
  canDownload: boolean;
  modelCount?: number;
}
