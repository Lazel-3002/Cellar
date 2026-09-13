import type { ModelEntry, ModelRef } from '@shared/types/models';
import type { ProviderStatus } from '@shared/types/providers';
import { listProviderConfigs, seedBuiltinProviders, type StoredProviderConfig } from '../db/provider-configs';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage } from '../lib/util';
import { LlamaCppProvider } from './llamacpp/engine';
import { LmStudioProvider } from './lmstudio';
import { OllamaProvider } from './ollama';
import { OpenAIServerProvider } from './openai-server';
import type { Provider } from './types';

const log = logger('providers');

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

class ProviderRegistry {
  readonly llamacpp = new LlamaCppProvider();
  private providers = new Map<string, Provider>();
  private configs = new Map<string, StoredProviderConfig>();
  private statuses = new Map<string, ProviderStatus>();
  private models: ModelEntry[] = [];
  private modelsFetchedAt = 0;
  private modelsInflight: Promise<ModelEntry[]> | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  init(): void {
    seedBuiltinProviders();
    this.rebuild();
    bus.on('models:changed', (e) => {
      if (e.reason !== 'provider-list') this.modelsFetchedAt = 0;
    });
    this.pollTimer = setInterval(() => void this.statusAll(true), 20_000);
    this.pollTimer.unref();
  }

  rebuild(): void {
    const configs = listProviderConfigs();
    this.configs = new Map(configs.map((c) => [c.id, c]));
    const next = new Map<string, Provider>([[this.llamacpp.id, this.llamacpp]]);
    for (const cfg of configs) {
      const existing = this.providers.get(cfg.id);
      if (existing) {
        next.set(cfg.id, existing);
        continue;
      }
      const getter = () => this.configs.get(cfg.id) ?? cfg;
      if (cfg.kind === 'ollama') next.set(cfg.id, new OllamaProvider(getter));
      else if (cfg.kind === 'lmstudio') next.set(cfg.id, new LmStudioProvider(getter));
      else if (cfg.kind === 'unsloth' || cfg.kind === 'openai') next.set(cfg.id, new OpenAIServerProvider(getter, cfg.kind));
    }
    this.providers = next;
    for (const id of [...this.statuses.keys()]) if (!next.has(id)) this.statuses.delete(id);
    this.modelsFetchedAt = 0;
  }

  get(id: string): Provider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown connection: ${id}`);
    return provider;
  }

  all(): Provider[] {
    return [...this.providers.values()];
  }

  config(id: string): StoredProviderConfig | undefined {
    return this.configs.get(id);
  }

  async statusAll(refresh = false): Promise<ProviderStatus[]> {
    if (!refresh && this.statuses.size === this.providers.size) return this.orderedStatuses();
    const results = await Promise.all(
      this.all().map((p) =>
        withTimeout(
          p.status().catch((err): ProviderStatus => ({
            id: p.id,
            kind: p.kind,
            name: p.name,
            baseUrl: '',
            state: 'error',
            message: errorMessage(err),
            canManageModels: p.canManageModels,
            canDownload: p.canDownload,
          })),
          6000,
          { id: p.id, kind: p.kind, name: p.name, baseUrl: '', state: 'offline', message: 'Timed out', canManageModels: p.canManageModels, canDownload: p.canDownload } as ProviderStatus,
        ),
      ),
    );
    let changed = false;
    let availabilityChanged = false;
    for (const status of results) {
      const prev = this.statuses.get(status.id);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(status)) changed = true;
      if (!prev || (prev.state === 'online') !== (status.state === 'online')) availabilityChanged = true;
      this.statuses.set(status.id, status);
    }
    const ordered = this.orderedStatuses();
    if (changed) bus.emit('providers:status', ordered);
    if (availabilityChanged) {
      this.modelsFetchedAt = 0;
      bus.emit('models:changed', { reason: 'provider-status' });
    }
    return ordered;
  }

  private orderedStatuses(): ProviderStatus[] {
    return this.all()
      .map((p) => this.statuses.get(p.id))
      .filter((s): s is ProviderStatus => !!s);
  }

  async listModels(refresh = false): Promise<ModelEntry[]> {
    if (!refresh && this.modelsFetchedAt && Date.now() - this.modelsFetchedAt < 15_000) return this.models;
    if (this.modelsInflight) return this.modelsInflight;
    this.modelsInflight = (async () => {
      if (this.statuses.size < this.providers.size) await this.statusAll(true);
      const lists = await Promise.all(
        this.all().map(async (p) => {
          const status = this.statuses.get(p.id);
          if (p.id !== this.llamacpp.id && status?.state !== 'online') return [];
          try {
            return await withTimeout(p.listModels(), 10_000, [] as ModelEntry[]);
          } catch (err) {
            log.warn('listModels failed', p.id, err);
            return [];
          }
        }),
      );
      this.models = lists.flatMap((list) => list.sort((a, b) => a.displayName.localeCompare(b.displayName)));
      this.modelsFetchedAt = Date.now();
      return this.models;
    })().finally(() => {
      this.modelsInflight = null;
    });
    return this.modelsInflight;
  }

  async findModel(ref: ModelRef): Promise<ModelEntry | undefined> {
    const match = (list: ModelEntry[]) => list.find((m) => m.ref.providerId === ref.providerId && m.ref.modelId === ref.modelId);
    return match(await this.listModels()) ?? match(await this.listModels(true));
  }

  async dispose(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    await Promise.all(this.all().map((p) => p.dispose?.()));
  }
}

export const providers = new ProviderRegistry();
