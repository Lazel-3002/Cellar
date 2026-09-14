import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { StreamEvent } from '@shared/types/chat';
import type { ModelEntry } from '@shared/types/models';
import type { ProviderKind, ProviderStatus } from '@shared/types/providers';
import type { StoredProviderConfig } from '../db/provider-configs';
import { paths } from '../system/paths';
import {
  baseEntry,
  fetchEmbeddings,
  fetchOpenAIModels,
  guessCapabilitiesFromName,
  samplingBody,
  streamChatCompletion,
  thinkingBody,
  toOpenAIMessages,
  toolsBody,
  type OpenAIFlavor,
} from './openai-compat';
import { ProviderHttpError, type ChatRequest, type Provider } from './types';

/**
 * Any server that speaks the OpenAI Chat Completions API. Unsloth Studio uses this with a
 * Bearer key; custom connections (vLLM, KoboldCpp, Jan…) use it as-is.
 */
export class OpenAIServerProvider implements Provider {
  readonly canManageModels = false;
  readonly canDownload = false;

  constructor(
    private readonly config: () => StoredProviderConfig,
    readonly kind: Extract<ProviderKind, 'unsloth' | 'openai'>,
  ) {}

  get id() {
    return this.config().id;
  }

  get name() {
    return this.config().name;
  }

  private get flavor(): OpenAIFlavor {
    return this.kind === 'unsloth' ? 'unsloth' : 'generic';
  }

  async status(): Promise<ProviderStatus> {
    const cfg = this.config();
    const base = { id: cfg.id, kind: this.kind, name: cfg.name, baseUrl: cfg.baseUrl, canManageModels: false, canDownload: false };
    if (!cfg.enabled) return { ...base, state: 'disabled' };
    try {
      const list = await fetchOpenAIModels(cfg.baseUrl, cfg.apiKey, 2000);
      return { ...base, state: 'online', modelCount: list.data?.length ?? 0 };
    } catch (err) {
      if (err instanceof ProviderHttpError && (err.status === 401 || err.status === 403)) {
        return {
          ...base,
          state: 'unauthorized',
          message: this.kind === 'unsloth' ? 'Create an API key in Unsloth Studio → Settings → API and paste it here.' : 'The server rejected the API key.',
        };
      }
      if (this.kind === 'unsloth') {
        const installed = existsSync(paths().unslothCli);
        return installed
          ? { ...base, state: 'offline', message: 'Unsloth Studio is not running.' }
          : { ...base, state: 'not-installed', message: 'Unsloth Studio is not installed.' };
      }
      return { ...base, state: 'offline', message: err instanceof Error ? err.message : String(err) };
    }
  }

  async listModels(): Promise<ModelEntry[]> {
    const cfg = this.config();
    const list = await fetchOpenAIModels(cfg.baseUrl, cfg.apiKey, 4000);
    return (list.data ?? []).map((m) => {
      const guess = guessCapabilitiesFromName(m.id);
      return baseEntry({
        ref: { providerId: cfg.id, modelId: m.id },
        providerKind: this.kind,
        providerName: cfg.name,
        displayName: m.id.split('/').pop() ?? m.id,
        publisher: m.id.includes('/') ? m.id.split('/')[0] : undefined,
        contextLength: m.max_model_len ?? m.context_length,
        capabilities: guess.capabilities,
        reasoningStyle: guess.reasoningStyle,
        // These servers only list models they can serve right now.
        loaded: true,
        source: 'remote',
      });
    });
  }

  async *chat(req: ChatRequest): AsyncGenerator<StreamEvent> {
    const cfg = this.config();
    yield* streamChatCompletion({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      body: {
        model: req.entry.ref.modelId,
        messages: toOpenAIMessages(req.messages, this.flavor),
        ...samplingBody(req.params, this.flavor),
        ...thinkingBody(req.entry.reasoningStyle, req.thinking, this.flavor),
        ...toolsBody(req.tools, this.flavor),
      },
      signal: req.signal,
      reasoningStyle: req.entry.reasoningStyle,
    });
  }

  embed(entry: ModelEntry, input: string[], signal?: AbortSignal): Promise<number[][]> {
    const cfg = this.config();
    return fetchEmbeddings({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: entry.ref.modelId, input, signal });
  }

  /** Launch Unsloth Studio in the background via its CLI shim. */
  startUnslothStudio(): void {
    if (this.kind !== 'unsloth') return;
    const cli = paths().unslothCli;
    if (!existsSync(cli)) throw new Error('Unsloth Studio is not installed.');
    const port = new URL(this.config().baseUrl).port || '8888';
    const child = spawn(cli, ['studio', '-p', port], { detached: true, stdio: 'ignore', windowsHide: true, shell: process.platform === 'win32' });
    child.unref();
  }
}
