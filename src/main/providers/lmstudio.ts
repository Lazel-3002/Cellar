import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { StreamEvent } from '@shared/types/chat';
import type { LoadConfig, LoadedModelInfo, ModelEntry, ReasoningStyle } from '@shared/types/models';
import type { ProviderStatus } from '@shared/types/providers';
import type { StoredProviderConfig } from '../db/provider-configs';
import { fetchWithTimeout } from '../lib/util';
import { authHeaders, baseEntry, samplingBody, streamChatCompletion, thinkingBody, toOpenAIMessages, toolsBody } from './openai-compat';
import { ProviderHttpError, readErrorBody, trimBaseUrl, type ChatRequest, type Provider } from './types';

interface LmsModel {
  type: 'llm' | 'embedding';
  publisher: string;
  key: string;
  display_name: string;
  architecture?: string | null;
  quantization?: { name?: string | null; bits_per_weight?: number | null } | null;
  size_bytes: number;
  params_string?: string | null;
  loaded_instances: Array<{ id: string; config: { context_length: number } }>;
  max_context_length: number;
  format?: 'gguf' | 'mlx' | null;
  capabilities?: { vision?: boolean; trained_for_tool_use?: boolean; reasoning?: { allowed_options?: string[]; default?: string } };
}

export interface LmsDownloadStatus {
  job_id?: string;
  status: 'downloading' | 'paused' | 'completed' | 'failed' | 'already_downloaded';
  total_size_bytes?: number;
  downloaded_bytes?: number;
  bytes_per_second?: number;
}

function lmStudioInstalled(): boolean {
  const local = process.env.LOCALAPPDATA ?? '';
  return existsSync(join(homedir(), '.lmstudio')) || (local !== '' && existsSync(join(local, 'Programs', 'LM Studio', 'LM Studio.exe')));
}

export class LmStudioProvider implements Provider {
  readonly kind = 'lmstudio' as const;
  readonly canManageModels = true;
  readonly canDownload = true;

  constructor(private readonly config: () => StoredProviderConfig) {}

  get id() {
    return this.config().id;
  }

  get name() {
    return this.config().name;
  }

  private url(path: string) {
    return `${trimBaseUrl(this.config().baseUrl)}${path}`;
  }

  private headers(json = false): Record<string, string> {
    return { ...authHeaders(this.config().apiKey), ...(json ? { 'Content-Type': 'application/json' } : {}) };
  }

  async status(): Promise<ProviderStatus> {
    const cfg = this.config();
    const base = { id: cfg.id, kind: this.kind, name: cfg.name, baseUrl: cfg.baseUrl, canManageModels: true, canDownload: true };
    if (!cfg.enabled) return { ...base, state: 'disabled' };
    try {
      const res = await fetchWithTimeout(this.url('/api/v1/models'), { headers: this.headers(), timeoutMs: 2000 });
      if (res.status === 401 || res.status === 403) return { ...base, state: 'unauthorized', message: 'LM Studio requires an API token. Add it in Settings → Connections.' };
      if (!res.ok) return { ...base, state: 'error', message: `HTTP ${res.status}` };
      return { ...base, state: 'online' };
    } catch {
      return lmStudioInstalled()
        ? { ...base, state: 'offline', message: 'Start the LM Studio server (Developer tab → Start server).' }
        : { ...base, state: 'not-installed', message: 'LM Studio is not installed.' };
    }
  }

  private async models(): Promise<LmsModel[]> {
    const res = await fetchWithTimeout(this.url('/api/v1/models'), { headers: this.headers(), timeoutMs: 4000 });
    if (!res.ok) throw new ProviderHttpError(res.status, await readErrorBody(res));
    const json = (await res.json()) as { models?: LmsModel[]; data?: LmsModel[] } | LmsModel[];
    return Array.isArray(json) ? json : json.models ?? json.data ?? [];
  }

  async listModels(): Promise<ModelEntry[]> {
    const cfg = this.config();
    return (await this.models()).map((m) => {
      const options = m.capabilities?.reasoning?.allowed_options ?? [];
      const reasoningStyle: ReasoningStyle = options.some((o) => ['low', 'medium', 'high'].includes(o))
        ? 'effort'
        : options.includes('off')
          ? 'toggle'
          : options.length
            ? 'always'
            : 'none';
      const instance = m.loaded_instances?.[0];
      return baseEntry({
        ref: { providerId: cfg.id, modelId: m.key },
        providerKind: this.kind,
        providerName: cfg.name,
        displayName: m.display_name || m.key,
        publisher: m.publisher,
        architecture: m.architecture ?? undefined,
        paramsLabel: m.params_string ?? undefined,
        quant: m.quantization?.name ?? undefined,
        sizeBytes: m.size_bytes,
        format: m.format === 'mlx' ? 'mlx' : m.format === 'gguf' ? 'gguf' : 'unknown',
        contextLength: m.max_context_length,
        capabilities: {
          vision: !!m.capabilities?.vision,
          tools: !!m.capabilities?.trained_for_tool_use,
          reasoning: reasoningStyle !== 'none',
          embedding: m.type === 'embedding',
        },
        reasoningStyle,
        loaded: !!instance,
        loadedContextLength: instance?.config.context_length,
        source: 'remote',
      });
    });
  }

  async load(entry: ModelEntry, config: LoadConfig): Promise<LoadedModelInfo> {
    const body: Record<string, unknown> = { model: entry.ref.modelId, echo_load_config: true };
    if (typeof config.contextLength === 'number') body.context_length = config.contextLength;
    if (config.flashAttention !== 'auto') body.flash_attention = config.flashAttention === 'on';
    if (config.batchSize) body.eval_batch_size = config.batchSize;
    body.offload_kv_cache_to_gpu = config.kvOffload;
    const res = await fetch(this.url('/api/v1/models/load'), { method: 'POST', headers: this.headers(true), body: JSON.stringify(body) });
    if (!res.ok) throw new ProviderHttpError(res.status, await readErrorBody(res));
    const json = (await res.json()) as { load_config?: { context_length?: number } };
    return { ref: entry.ref, contextLength: json.load_config?.context_length, startedAt: Date.now(), config };
  }

  async unload(entry: ModelEntry): Promise<void> {
    const models = await this.models();
    const instances = models.find((m) => m.key === entry.ref.modelId)?.loaded_instances ?? [];
    for (const instance of instances) {
      const res = await fetch(this.url('/api/v1/models/unload'), { method: 'POST', headers: this.headers(true), body: JSON.stringify({ instance_id: instance.id }) });
      if (!res.ok) throw new ProviderHttpError(res.status, await readErrorBody(res));
    }
  }

  async loadedModels(): Promise<LoadedModelInfo[]> {
    const models = await this.models().catch(() => [] as LmsModel[]);
    return models
      .filter((m) => m.loaded_instances?.length)
      .map((m) => ({ ref: { providerId: this.id, modelId: m.key }, contextLength: m.loaded_instances[0]?.config.context_length, startedAt: Date.now() }));
  }

  async startDownload(repoId: string, quantization: string): Promise<LmsDownloadStatus> {
    const res = await fetch(this.url('/api/v1/models/download'), {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ model: `https://huggingface.co/${repoId}`, quantization }),
    });
    if (!res.ok) throw new ProviderHttpError(res.status, await readErrorBody(res));
    return (await res.json()) as LmsDownloadStatus;
  }

  async downloadStatus(jobId: string): Promise<LmsDownloadStatus> {
    const res = await fetchWithTimeout(this.url(`/api/v1/models/download/status/${encodeURIComponent(jobId)}`), { headers: this.headers(), timeoutMs: 5000 });
    if (!res.ok) throw new ProviderHttpError(res.status, await readErrorBody(res));
    return (await res.json()) as LmsDownloadStatus;
  }

  async *chat(req: ChatRequest): AsyncGenerator<StreamEvent> {
    if (!req.entry.loaded) req.onStatus('LM Studio is loading the model…');
    yield* streamChatCompletion({
      baseUrl: this.config().baseUrl,
      apiKey: this.config().apiKey,
      body: {
        model: req.entry.ref.modelId,
        messages: toOpenAIMessages(req.messages, 'lmstudio'),
        ...samplingBody(req.params, 'lmstudio'),
        ...thinkingBody(req.entry.reasoningStyle, req.thinking, 'lmstudio'),
        ...toolsBody(req.tools, 'lmstudio'),
      },
      signal: req.signal,
      reasoningStyle: req.entry.reasoningStyle,
    });
  }
}
