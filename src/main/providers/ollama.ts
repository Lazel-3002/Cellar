import type { StreamEvent } from '@shared/types/chat';
import type { InferenceParams, LoadConfig, LoadedModelInfo, ModelEntry, ReasoningStyle } from '@shared/types/models';
import type { ProviderStatus } from '@shared/types/providers';
import type { StoredProviderConfig } from '../db/provider-configs';
import { errorMessage, fetchWithTimeout } from '../lib/util';
import { baseEntry } from './openai-compat';
import { parseNDJSON } from './stream-parsers';
import { ProviderHttpError, readErrorBody, trimBaseUrl, type ChatRequest, type Provider, type ProviderMessage } from './types';

interface OllamaTag {
  name: string;
  model: string;
  size: number;
  digest: string;
  details?: { family?: string; parameter_size?: string; quantization_level?: string; format?: string };
}

interface OllamaShow {
  capabilities?: string[];
  model_info?: Record<string, unknown>;
  details?: { family?: string };
}

interface OllamaPs {
  models?: Array<{ name: string; model: string; size: number; size_vram?: number; context_length?: number; expires_at?: string }>;
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

export function ollamaOptions(params: InferenceParams, load: LoadConfig): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)) options[key] = value;
  };
  if (typeof load.contextLength === 'number') set('num_ctx', load.contextLength);
  if (load.gpuLayers === 'all') set('num_gpu', 999);
  else if (typeof load.gpuLayers === 'number') set('num_gpu', load.gpuLayers);
  set('num_thread', load.threads);
  set('num_batch', load.batchSize);
  set('temperature', params.temperature);
  set('top_k', params.topK);
  set('top_p', params.topP);
  set('min_p', params.minP);
  set('repeat_penalty', params.repeatPenalty);
  set('presence_penalty', params.presencePenalty);
  set('frequency_penalty', params.frequencyPenalty);
  set('seed', params.seed);
  set('num_predict', params.maxTokens);
  set('stop', params.stop);
  return options;
}

export function ollamaThink(style: ReasoningStyle, level: string): boolean | string | undefined {
  if (style === 'none' || style === 'always') return style === 'always' ? true : undefined;
  if (style === 'effort') return level === 'off' ? 'low' : level === 'on' ? 'medium' : level;
  return level !== 'off';
}

function argumentsObject(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Ollama's native chat format: object arguments, `tool_name` on results, `thinking` on assistant turns. */
export function toOllamaMessages(messages: ProviderMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', content: m.content, tool_name: m.toolName, tool_call_id: m.toolCallId };
    const out: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.images?.length) out.images = m.images.map((i) => i.base64);
    if (m.role === 'assistant' && m.toolCalls?.length) {
      out.tool_calls = m.toolCalls.map((c) => ({ id: c.id, function: { name: c.name, arguments: argumentsObject(c.arguments) } }));
      if (m.reasoning) out.thinking = m.reasoning;
    }
    return out;
  });
}

export class OllamaProvider implements Provider {
  readonly kind = 'ollama' as const;
  readonly canManageModels = true;
  readonly canDownload = true;
  private showCache = new Map<string, OllamaShow>();

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

  async status(): Promise<ProviderStatus> {
    const cfg = this.config();
    const base = { id: cfg.id, kind: this.kind, name: cfg.name, baseUrl: cfg.baseUrl, canManageModels: true, canDownload: true };
    if (!cfg.enabled) return { ...base, state: 'disabled' };
    try {
      const res = await fetchWithTimeout(this.url('/api/version'), { timeoutMs: 2000 });
      if (!res.ok) return { ...base, state: 'error', message: `HTTP ${res.status}` };
      const json = (await res.json()) as { version?: string };
      return { ...base, state: 'online', version: json.version ? `v${json.version}` : undefined };
    } catch {
      return { ...base, state: 'offline', message: 'Ollama is not running. Start the Ollama app or run `ollama serve`.' };
    }
  }

  private async show(model: string, digest: string): Promise<OllamaShow> {
    const cached = this.showCache.get(digest);
    if (cached) return cached;
    const res = await fetchWithTimeout(this.url('/api/show'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      timeoutMs: 8000,
    });
    if (!res.ok) throw new ProviderHttpError(res.status, await readErrorBody(res));
    const json = (await res.json()) as OllamaShow;
    const slim: OllamaShow = { capabilities: json.capabilities, details: json.details, model_info: {} };
    for (const [key, value] of Object.entries(json.model_info ?? {})) {
      if (key === 'general.architecture' || key.endsWith('.context_length')) slim.model_info![key] = value;
    }
    this.showCache.set(digest, slim);
    return slim;
  }

  private async ps(): Promise<OllamaPs> {
    try {
      const res = await fetchWithTimeout(this.url('/api/ps'), { timeoutMs: 3000 });
      return res.ok ? ((await res.json()) as OllamaPs) : {};
    } catch {
      return {};
    }
  }

  async listModels(): Promise<ModelEntry[]> {
    const cfg = this.config();
    const res = await fetchWithTimeout(this.url('/api/tags'), { timeoutMs: 4000 });
    if (!res.ok) throw new ProviderHttpError(res.status, await readErrorBody(res));
    const tags = ((await res.json()) as { models?: OllamaTag[] }).models ?? [];
    const running = await this.ps();
    const entries = await Promise.all(
      tags.map(async (tag) => {
        let show: OllamaShow = {};
        try {
          show = await this.show(tag.name, tag.digest);
        } catch {
          // capabilities unknown
        }
        const caps = show.capabilities ?? ['completion'];
        const arch = String(show.model_info?.['general.architecture'] ?? tag.details?.family ?? '');
        const ctxKey = Object.keys(show.model_info ?? {}).find((k) => k.endsWith('.context_length'));
        const loaded = running.models?.find((m) => m.name === tag.name || m.model === tag.model);
        const thinking = caps.includes('thinking');
        const reasoningStyle: ReasoningStyle = thinking ? (/gpt-oss/i.test(tag.name) || arch === 'gptoss' ? 'effort' : 'toggle') : 'none';
        const [repoPart, tagPart] = tag.name.split(':');
        return baseEntry({
          ref: { providerId: cfg.id, modelId: tag.name },
          providerKind: this.kind,
          providerName: cfg.name,
          displayName: tagPart && tagPart !== 'latest' ? `${repoPart.replace(/^hf\.co\//, '')}:${tagPart}` : repoPart,
          architecture: arch || undefined,
          paramsLabel: tag.details?.parameter_size,
          quant: tag.details?.quantization_level,
          sizeBytes: tag.size,
          format: tag.details?.format === 'gguf' ? 'gguf' : 'unknown',
          contextLength: ctxKey ? Number(show.model_info?.[ctxKey]) : undefined,
          capabilities: {
            vision: caps.includes('vision'),
            tools: caps.includes('tools'),
            reasoning: thinking,
            embedding: caps.includes('embedding') && !caps.includes('completion'),
          },
          reasoningStyle,
          loaded: !!loaded,
          loadedContextLength: loaded?.context_length,
          source: 'remote',
        });
      }),
    );
    return entries;
  }

  async load(entry: ModelEntry, config: LoadConfig): Promise<LoadedModelInfo> {
    const res = await fetch(this.url('/api/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: entry.ref.modelId,
        prompt: '',
        stream: false,
        keep_alive: `${config.keepAliveMinutes}m`,
        options: ollamaOptions({ temperature: null } as InferenceParams, config),
      }),
    });
    if (!res.ok) throw new ProviderHttpError(res.status, await readErrorBody(res));
    await res.json().catch(() => undefined);
    const running = await this.ps();
    const loaded = running.models?.find((m) => m.name === entry.ref.modelId);
    return { ref: entry.ref, contextLength: loaded?.context_length, startedAt: Date.now(), config };
  }

  async unload(entry: ModelEntry): Promise<void> {
    const res = await fetch(this.url('/api/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: entry.ref.modelId, keep_alive: 0, stream: false }),
    });
    if (!res.ok) throw new ProviderHttpError(res.status, await readErrorBody(res));
  }

  async loadedModels(): Promise<LoadedModelInfo[]> {
    const running = await this.ps();
    return (running.models ?? []).map((m) => ({
      ref: { providerId: this.id, modelId: m.name },
      contextLength: m.context_length,
      gpuBufferMiB: m.size_vram ? Math.round(m.size_vram / 1048576) : undefined,
      startedAt: Date.now(),
    }));
  }

  async deleteModel(entry: ModelEntry): Promise<void> {
    const res = await fetch(this.url('/api/delete'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: entry.ref.modelId }),
    });
    if (!res.ok) throw new ProviderHttpError(res.status, await readErrorBody(res));
  }

  async *pull(model: string, signal: AbortSignal): AsyncGenerator<OllamaPullProgress> {
    const res = await fetch(this.url('/api/pull'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
      signal,
    });
    if (!res.ok || !res.body) throw new ProviderHttpError(res.status, await readErrorBody(res));
    for await (const progress of parseNDJSON<OllamaPullProgress>(res.body)) {
      if (progress.error) throw new Error(progress.error);
      yield progress;
    }
  }

  async embed(entry: ModelEntry, input: string[], signal?: AbortSignal): Promise<number[][]> {
    const res = await fetch(this.url('/api/embed'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: entry.ref.modelId, input, keep_alive: '10m', truncate: true }),
      signal,
    });
    if (!res.ok) throw new ProviderHttpError(res.status, await readErrorBody(res));
    const json = (await res.json()) as { embeddings?: number[][] };
    if (!json.embeddings || json.embeddings.length !== input.length) throw new Error('Ollama returned no embeddings.');
    return json.embeddings;
  }

  async *chat(req: ChatRequest): AsyncGenerator<StreamEvent> {
    const think = ollamaThink(req.entry.reasoningStyle, req.thinking);
    const body: Record<string, unknown> = {
      model: req.entry.ref.modelId,
      messages: toOllamaMessages(req.messages),
      stream: true,
      keep_alive: `${req.load.keepAliveMinutes}m`,
      options: ollamaOptions(req.params, req.load),
    };
    if (think !== undefined) body.think = think;
    if (req.tools?.length) body.tools = req.tools.map((t) => ({ type: 'function', function: t }));
    if (req.params.jsonSchema.trim()) {
      try {
        body.format = JSON.parse(req.params.jsonSchema);
      } catch {
        // ignore invalid schema
      }
    }
    if (!req.entry.loaded) req.onStatus('Loading model…');

    let res: Response;
    try {
      res = await fetch(this.url('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (err) {
      if (req.signal.aborted) throw err;
      throw new Error(`Could not reach Ollama at ${this.config().baseUrl}: ${errorMessage(err)}`);
    }
    if (!res.ok || !res.body) throw new ProviderHttpError(res.status, await readErrorBody(res));

    for await (const event of parseOllamaChatStream(res.body)) yield event;
  }
}

type OllamaChatLine = {
  error?: string;
  message?: {
    content?: string;
    thinking?: string;
    tool_calls?: Array<{ id?: string; function?: { index?: number; name?: string; arguments?: unknown } }>;
  };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
};

/** Ollama streams each tool call whole, with object arguments. */
export async function* parseOllamaChatStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  let callCount = 0;
  for await (const line of parseNDJSON<OllamaChatLine>(body)) {
    if (line.error) throw new Error(line.error);
    if (line.message?.thinking) yield { type: 'reasoning', delta: line.message.thinking };
    if (line.message?.content) yield { type: 'text', delta: line.message.content };
    for (const call of line.message?.tool_calls ?? []) {
      const args = call.function?.arguments;
      yield {
        type: 'tool_call',
        id: call.id || `call_${callCount}`,
        name: call.function?.name ?? '',
        argumentsDelta: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
      };
      callCount++;
    }
    if (line.done) {
      yield {
        type: 'stats',
        stats: {
          promptTokens: line.prompt_eval_count,
          completionTokens: line.eval_count,
          tokensPerSecond: line.eval_count && line.eval_duration ? line.eval_count / (line.eval_duration / 1e9) : undefined,
          // Prompt processing time, excluding model load: the closest equivalent of time-to-first-token.
          ttftMs: line.prompt_eval_duration ? line.prompt_eval_duration / 1e6 : undefined,
        },
      };
      yield { type: 'done', stopReason: line.done_reason };
      return;
    }
  }
  yield { type: 'done' };
}
