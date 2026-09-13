import type { StreamEvent, ThinkingLevel } from '@shared/types/chat';
import type { InferenceParams, LoadConfig, LoadedModelInfo, LoadProgressEvent, ModelEntry } from '@shared/types/models';
import type { ProviderKind, ProviderStatus } from '@shared/types/providers';

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: Array<{ mime: string; base64: string }>;
}

export interface ChatRequest {
  entry: ModelEntry;
  messages: ProviderMessage[];
  params: InferenceParams;
  thinking: ThinkingLevel;
  load: LoadConfig;
  signal: AbortSignal;
  onStatus: (message: string) => void;
}

export interface Provider {
  readonly id: string;
  readonly kind: ProviderKind;
  readonly name: string;
  readonly canManageModels: boolean;
  readonly canDownload: boolean;
  status(): Promise<ProviderStatus>;
  listModels(): Promise<ModelEntry[]>;
  chat(request: ChatRequest): AsyncGenerator<StreamEvent>;
  load?(entry: ModelEntry, config: LoadConfig, onProgress?: (event: LoadProgressEvent) => void): Promise<LoadedModelInfo>;
  unload?(entry: ModelEntry): Promise<void>;
  loadedModels?(): Promise<LoadedModelInfo[]>;
  deleteModel?(entry: ModelEntry): Promise<void>;
  dispose?(): Promise<void>;
}

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

export async function readErrorBody(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const json = JSON.parse(text) as { error?: string | { message?: string }; message?: string; detail?: string };
    if (typeof json.error === 'string') return json.error;
    if (json.error?.message) return json.error.message;
    if (json.message) return json.message;
    if (json.detail) return String(json.detail);
  } catch {
    // not JSON
  }
  return text.slice(0, 500) || `${res.status} ${res.statusText}`;
}

export function trimBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
}
