import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import type { StreamEvent } from '@shared/types/chat';
import type { LoadConfig, LoadedModelInfo, LoadProgressEvent, ModelEntry } from '@shared/types/models';
import type { ProviderStatus } from '@shared/types/providers';
import { bus } from '../../lib/events';
import { logger } from '../../lib/log';
import { fetchWithTimeout, sleep } from '../../lib/util';
import { isEmbeddingModel } from '../../models/gguf';
import { localModels, type LocalModel } from '../../models/local-index';
import { getPreset } from '../../models/presets';
import { runtimes } from '../../runtimes/llamacpp-runtimes';
import { settings } from '../../services/settings';
import { fetchEmbeddings, samplingBody, streamChatCompletion, thinkingBody, toOpenAIMessages, toolsBody } from '../openai-compat';
import type { ChatRequest, Provider } from '../types';
import { buildServerArgs, validateLoadConfig } from './args';
import { describeStage, emptyLoadInfo, failureHint, parseLogLine, type LoadInfo } from './log-parser';

const log = logger('llamacpp');
const MAX_LOG_LINES = 4000;

interface Instance {
  modelId: string;
  child: ChildProcess;
  port: number;
  apiKey: string;
  config: LoadConfig;
  logs: string[];
  info: LoadInfo;
  state: 'loading' | 'ready' | 'error' | 'stopped';
  ready: Promise<void>;
  startedAt: number;
  lastUsed: number;
  activeRequests: number;
  contextLength?: number;
  exited: boolean;
  /** Embedding servers are small and do not count toward the loaded-models limit. */
  embedding: boolean;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export function prettyModelName(model: Pick<LocalModel, 'repo' | 'fileName' | 'quant'>): string {
  if (model.repo) return model.repo.replace(/[-_.]GGUF$/i, '');
  let name = model.fileName.replace(/\.gguf$/i, '').replace(/-\d{5}-of-\d{5}$/, '');
  if (model.quant) name = name.replace(new RegExp(`[-_.]${model.quant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '');
  return name;
}

export function formatParamCount(count?: number): string | undefined {
  if (!count) return undefined;
  if (count >= 1e9) return `${(count / 1e9).toFixed(count >= 1e10 ? 0 : 1)}B`;
  return `${Math.round(count / 1e6)}M`;
}

const sameConfig = (a: LoadConfig, b: LoadConfig) => JSON.stringify(a) === JSON.stringify(b);

export class LlamaCppProvider implements Provider {
  readonly id = 'llamacpp';
  readonly kind = 'llamacpp' as const;
  readonly name = 'llama.cpp';
  readonly canManageModels = true;
  readonly canDownload = true;

  private instances = new Map<string, Instance>();
  private lastLogs = new Map<string, string[]>();
  private idleTimer: NodeJS.Timeout;

  constructor() {
    this.idleTimer = setInterval(() => void this.unloadIdle(), 60_000);
    this.idleTimer.unref();
  }

  async status(): Promise<ProviderStatus> {
    const runtime = await runtimes.active();
    const base = { id: this.id, kind: this.kind, name: this.name, baseUrl: 'built-in', canManageModels: true, canDownload: true, modelCount: localModels.list().length };
    if (!runtime) {
      return { ...base, state: 'not-installed', message: 'No llama.cpp runtime found. Install one in Settings → Engines & runtimes.' };
    }
    return {
      ...base,
      state: 'online',
      version: runtime.label,
      message: runtime.devices.length ? runtime.devices.map((d) => d.name).join(', ') : 'CPU only',
    };
  }

  toEntry(model: LocalModel): ModelEntry {
    const g = model.gguf;
    const inst = this.instances.get(model.id);
    const reasoningStyle = g?.reasoningStyle ?? 'none';
    return {
      ref: { providerId: this.id, modelId: model.id },
      providerKind: this.kind,
      providerName: this.name,
      displayName: prettyModelName(model),
      publisher: model.publisher,
      repo: model.repo,
      architecture: g?.architecture,
      paramsLabel: g?.sizeLabel ?? formatParamCount(g?.parameterCount),
      quant: model.quant ?? g?.fileType,
      sizeBytes: model.sizeBytes,
      format: 'gguf',
      contextLength: g?.contextLength,
      capabilities: {
        vision: !!model.mmprojPath,
        tools: g?.supportsTools ?? false,
        reasoning: reasoningStyle !== 'none',
        embedding: g ? isEmbeddingModel(g) : false,
      },
      reasoningStyle,
      loaded: inst?.state === 'ready',
      loading: inst?.state === 'loading',
      loadedContextLength: inst?.contextLength,
      path: model.path,
      mmprojPath: model.mmprojPath,
      source: model.source,
    };
  }

  async listModels(): Promise<ModelEntry[]> {
    return localModels.list().map((m) => this.toEntry(m));
  }

  private emitProgress(modelId: string, info: LoadInfo, onProgress?: (e: LoadProgressEvent) => void, stage?: LoadProgressEvent['stage']) {
    const event: LoadProgressEvent = {
      ref: { providerId: this.id, modelId },
      stage: stage ?? (info.stage === 'warming' ? 'allocating' : info.stage),
      message: describeStage(info),
      offloadedLayers: info.offloadedLayers,
      totalLayers: info.totalLayers,
    };
    onProgress?.(event);
    bus.emit('models:loadProgress', event);
  }

  async load(entry: ModelEntry, config: LoadConfig, onProgress?: (e: LoadProgressEvent) => void): Promise<LoadedModelInfo> {
    const model = localModels.get(entry.ref.modelId);
    if (!model) throw new Error('The model file is no longer in your library. Rescan your models folder.');

    const existing = this.instances.get(model.id);
    if (existing && (existing.state === 'loading' || existing.state === 'ready')) {
      if (sameConfig(existing.config, config)) {
        await existing.ready;
        return this.describe(existing);
      }
      await this.stop(existing);
    }

    const problems = validateLoadConfig(config);
    if (problems.length) throw new Error(problems.join(' '));
    const runtime = await runtimes.active();
    if (!runtime) throw new Error('No llama.cpp runtime is installed. Open Settings → Engines & runtimes to install one.');

    const embedding = entry.capabilities.embedding;
    if (!embedding) await this.evictFor(model.id);
    const port = await freePort();
    const apiKey = randomBytes(24).toString('hex');
    const args = buildServerArgs({ modelPath: model.path, mmprojPath: model.mmprojPath, port, alias: model.id, embedding }, config);
    log.info('starting llama-server', runtime.serverPath, args.join(' '));

    const child = spawn(runtime.serverPath, args, {
      cwd: runtime.dir,
      env: { ...process.env, LLAMA_API_KEY: apiKey },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const inst: Instance = {
      modelId: model.id,
      child,
      port,
      apiKey,
      config,
      logs: [`$ ${runtime.serverPath} ${args.join(' ')}`],
      info: emptyLoadInfo(),
      state: 'loading',
      ready: Promise.resolve(),
      startedAt: Date.now(),
      lastUsed: Date.now(),
      activeRequests: 0,
      exited: false,
      embedding,
    };
    this.instances.set(model.id, inst);
    this.emitProgress(model.id, inst.info, onProgress, 'starting');
    bus.emit('models:changed', { reason: 'loading' });

    const onChunk = (() => {
      let partial = '';
      return (chunk: Buffer) => {
        const text = partial + chunk.toString('utf8');
        const lines = text.split(/\r?\n/);
        partial = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          inst.logs.push(line);
          if (inst.logs.length > MAX_LOG_LINES) inst.logs.splice(0, inst.logs.length - MAX_LOG_LINES);
          const before = inst.info;
          inst.info = parseLogLine(inst.info, line);
          if (inst.state === 'loading' && (before.stage !== inst.info.stage || before.offloadedLayers !== inst.info.offloadedLayers)) {
            this.emitProgress(model.id, inst.info, onProgress);
          }
        }
      };
    })();
    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', onChunk);
    child.on('error', (err) => {
      inst.logs.push(`spawn error: ${err.message}`);
      inst.info = { ...inst.info, error: err.message };
      inst.exited = true;
    });
    child.on('exit', (code) => {
      inst.exited = true;
      inst.logs.push(`llama-server exited with code ${code}`);
      this.lastLogs.set(model.id, inst.logs);
      if (inst.state === 'ready') {
        inst.state = 'stopped';
        if (this.instances.get(model.id) === inst) this.instances.delete(model.id);
        log.warn('llama-server stopped unexpectedly', model.id, code);
        this.emitProgress(model.id, { ...inst.info, stage: 'error', error: `llama.cpp stopped (exit code ${code})` }, undefined, 'error');
        bus.emit('models:changed', { reason: 'crashed' });
      }
    });

    inst.ready = this.waitUntilReady(inst);
    try {
      await inst.ready;
    } catch (err) {
      inst.state = 'error';
      if (this.instances.get(model.id) === inst) this.instances.delete(model.id);
      this.lastLogs.set(model.id, inst.logs);
      if (!inst.exited) child.kill();
      const hint = failureHint(inst.info);
      const detail = inst.info.error ?? (err instanceof Error ? err.message : String(err));
      this.emitProgress(model.id, { ...inst.info, stage: 'error', error: detail }, onProgress, 'error');
      bus.emit('models:changed', { reason: 'load-failed' });
      throw new Error(hint ? `${detail}\n\n${hint}` : detail);
    }

    inst.state = 'ready';
    this.emitProgress(model.id, { ...inst.info, stage: 'ready' }, onProgress, 'ready');
    bus.emit('models:changed', { reason: 'loaded' });
    return this.describe(inst);
  }

  private async waitUntilReady(inst: Instance): Promise<void> {
    const deadline = Date.now() + 30 * 60_000;
    const headers = { Authorization: `Bearer ${inst.apiKey}` };
    for (;;) {
      if (inst.exited) throw new Error(inst.info.error ?? 'llama-server exited while loading the model.');
      if (inst.state === 'stopped') throw new Error('Loading was cancelled.');
      if (Date.now() > deadline) throw new Error('Timed out waiting for the model to load.');
      try {
        const res = await fetchWithTimeout(`http://127.0.0.1:${inst.port}/health`, { headers, timeoutMs: 1500 });
        if (res.ok) break;
      } catch {
        // server not listening yet
      }
      await sleep(350);
    }
    try {
      const res = await fetchWithTimeout(`http://127.0.0.1:${inst.port}/props`, { headers, timeoutMs: 4000 });
      if (res.ok) {
        const props = (await res.json()) as { n_ctx?: number; default_generation_settings?: { n_ctx?: number } };
        inst.contextLength = props.default_generation_settings?.n_ctx ?? props.n_ctx ?? inst.info.contextLength;
      }
    } catch {
      inst.contextLength = inst.info.contextLength;
    }
    inst.contextLength ??= inst.info.contextLength;
  }

  private describe(inst: Instance): LoadedModelInfo {
    return {
      ref: { providerId: this.id, modelId: inst.modelId },
      contextLength: inst.contextLength,
      offloadedLayers: inst.info.offloadedLayers,
      totalLayers: inst.info.totalLayers,
      gpuBufferMiB: Math.round(inst.info.gpuModelMiB),
      cpuBufferMiB: Math.round(inst.info.cpuModelMiB),
      kvBufferMiB: Math.round(inst.info.kvMiB),
      port: inst.port,
      startedAt: inst.startedAt,
      config: inst.config,
    };
  }

  private async stop(inst: Instance): Promise<void> {
    inst.state = 'stopped';
    if (this.instances.get(inst.modelId) === inst) this.instances.delete(inst.modelId);
    if (!inst.exited) {
      const exited = new Promise<void>((resolve) => inst.child.once('exit', () => resolve()));
      inst.child.kill();
      await Promise.race([exited, sleep(5000)]);
      if (!inst.exited && inst.child.pid && process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(inst.child.pid), '/T', '/F'], { windowsHide: true });
      }
    }
    bus.emit('models:loadProgress', { ref: { providerId: this.id, modelId: inst.modelId }, stage: 'unloaded', message: 'Unloaded' });
    bus.emit('models:changed', { reason: 'unloaded' });
  }

  private async evictFor(modelId: string): Promise<void> {
    const max = settings.get().maxLoadedModels;
    const others = [...this.instances.values()].filter((i) => i.modelId !== modelId && !i.embedding).sort((a, b) => a.lastUsed - b.lastUsed);
    while (others.length >= max) {
      const victim = others.shift();
      if (!victim) break;
      log.info('evicting model to make room', victim.modelId);
      await this.stop(victim);
    }
  }

  private async unloadIdle(): Promise<void> {
    const minutes = settings.get().idleUnloadMinutes;
    if (!minutes) return;
    for (const inst of [...this.instances.values()]) {
      if (inst.state === 'ready' && inst.activeRequests === 0 && Date.now() - inst.lastUsed > minutes * 60_000) {
        log.info('unloading idle model', inst.modelId);
        await this.stop(inst);
      }
    }
  }

  async unload(entry: ModelEntry): Promise<void> {
    const inst = this.instances.get(entry.ref.modelId);
    if (inst) await this.stop(inst);
  }

  async loadedModels(): Promise<LoadedModelInfo[]> {
    return [...this.instances.values()].filter((i) => i.state === 'ready').map((i) => this.describe(i));
  }

  logs(modelId: string): string[] {
    return this.instances.get(modelId)?.logs ?? this.lastLogs.get(modelId) ?? [];
  }

  async *chat(req: ChatRequest): AsyncGenerator<StreamEvent> {
    let inst = this.instances.get(req.entry.ref.modelId);
    if (!inst || inst.state === 'error' || inst.state === 'stopped') {
      if (!settings.get().jitLoad) throw new Error('This model is not loaded. Load it from the model picker first.');
      req.onStatus('Loading model…');
      await this.load(req.entry, req.load, (e) => req.onStatus(e.message));
      inst = this.instances.get(req.entry.ref.modelId);
      req.onStatus('');
    } else if (inst.state === 'loading') {
      req.onStatus('Loading model…');
      await inst.ready;
      req.onStatus('');
    }
    if (!inst) throw new Error('The model failed to load.');

    const body = {
      model: inst.modelId,
      messages: toOpenAIMessages(req.messages, 'llamacpp'),
      cache_prompt: true,
      ...samplingBody(req.params, 'llamacpp'),
      ...thinkingBody(req.entry.reasoningStyle, req.thinking, 'llamacpp'),
      ...toolsBody(req.tools, 'llamacpp'),
    };
    inst.activeRequests++;
    inst.lastUsed = Date.now();
    try {
      yield* streamChatCompletion({
        baseUrl: `http://127.0.0.1:${inst.port}`,
        apiKey: inst.apiKey,
        body,
        signal: req.signal,
        reasoningStyle: req.entry.reasoningStyle,
      });
    } finally {
      inst.activeRequests--;
      inst.lastUsed = Date.now();
    }
  }

  async embed(entry: ModelEntry, input: string[], signal?: AbortSignal): Promise<number[][]> {
    if (!entry.capabilities.embedding) throw new Error(`${entry.displayName} is not an embedding model.`);
    let inst = this.instances.get(entry.ref.modelId);
    if (!inst || inst.state === 'error' || inst.state === 'stopped') {
      await this.load(entry, getPreset(entry.ref, entry.contextLength).load);
      inst = this.instances.get(entry.ref.modelId);
    } else if (inst.state === 'loading') {
      await inst.ready;
    }
    if (!inst) throw new Error('The embedding model failed to load.');
    inst.activeRequests++;
    inst.lastUsed = Date.now();
    try {
      return await fetchEmbeddings({ baseUrl: `http://127.0.0.1:${inst.port}`, apiKey: inst.apiKey, model: inst.modelId, input, signal });
    } finally {
      inst.activeRequests--;
      inst.lastUsed = Date.now();
    }
  }

  async deleteModel(entry: ModelEntry): Promise<void> {
    await this.unload(entry);
    await localModels.deleteFiles(entry.ref.modelId);
  }

  async dispose(): Promise<void> {
    clearInterval(this.idleTimer);
    for (const inst of this.instances.values()) {
      inst.state = 'stopped';
      if (!inst.exited) inst.child.kill();
    }
    this.instances.clear();
  }
}
