import type { LoadConfig } from '@shared/types/models';

export interface ServerLaunch {
  modelPath: string;
  mmprojPath?: string;
  port: number;
  alias: string;
  /** Serve /v1/embeddings (embedding models). */
  embedding?: boolean;
}

/** Split a user-supplied argument string, honouring double and single quotes. */
export function splitArgs(input: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let hasToken = false;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasToken) {
        out.push(current);
        current = '';
        hasToken = false;
      }
      continue;
    }
    current += ch;
    hasToken = true;
  }
  if (hasToken) out.push(current);
  return out;
}

/**
 * Translate a LoadConfig into llama-server flags. Anything left at its default is omitted so
 * llama.cpp's own `--fit` logic can size it; explicit user choices are always passed.
 */
export function buildServerArgs(launch: ServerLaunch, cfg: LoadConfig): string[] {
  const args: string[] = [
    '--host', '127.0.0.1',
    '--port', String(launch.port),
    '-m', launch.modelPath,
    '--alias', launch.alias,
    '--no-webui',
    '--jinja',
    '--reasoning-format', 'deepseek',
    // Verbosity 4 includes the offloaded-layer and buffer-size lines Cellar parses for load progress.
    '-lv', '4',
  ];

  if (typeof cfg.contextLength === 'number') args.push('-c', String(cfg.contextLength));

  if (cfg.gpuLayers === 'all') args.push('-ngl', 'all');
  else if (typeof cfg.gpuLayers === 'number') args.push('-ngl', String(Math.max(0, Math.round(cfg.gpuLayers))));

  args.push('--fit', cfg.fit ? 'on' : 'off');
  if (cfg.fit && cfg.fitTargetMiB !== 1024) args.push('--fit-target', String(cfg.fitTargetMiB));

  args.push('-fa', cfg.flashAttention);
  if (cfg.cacheTypeK !== 'f16') args.push('-ctk', cfg.cacheTypeK);
  if (cfg.cacheTypeV !== 'f16') args.push('-ctv', cfg.cacheTypeV);

  const moeOffload = cfg.moeCpuLayers === 'all' || cfg.moeCpuLayers > 0;
  if (cfg.moeCpuLayers === 'all') args.push('--cpu-moe');
  else if (cfg.moeCpuLayers > 0) args.push('--n-cpu-moe', String(cfg.moeCpuLayers));

  if (cfg.threads) args.push('-t', String(cfg.threads));
  // Embedding requests are processed in one physical batch, so it must hold a whole chunk.
  if (cfg.batchSize || launch.embedding) args.push('-b', String(cfg.batchSize ?? 4096));
  if (cfg.ubatchSize || launch.embedding) args.push('-ub', String(cfg.ubatchSize ?? 4096));
  if (launch.embedding) args.push('--embedding');
  // llama.cpp warns that CPU tensor overrides are slow with mmap; read weights fully instead.
  const loadMode = moeOffload && cfg.loadMode === 'mmap' ? 'none' : cfg.loadMode;
  if (loadMode !== 'mmap') args.push('--load-mode', loadMode);
  if (!cfg.kvOffload) args.push('--no-kv-offload');
  if (cfg.parallel) args.push('-np', String(cfg.parallel));
  if (cfg.ropeScaling !== 'default') args.push('--rope-scaling', cfg.ropeScaling);
  if (cfg.seed !== null) args.push('-s', String(cfg.seed));

  if (launch.mmprojPath && cfg.useMmproj) {
    args.push('--mmproj', launch.mmprojPath);
    if (!cfg.mmprojOffload) args.push('--no-mmproj-offload');
  }
  if (cfg.draftModelPath) args.push('-md', cfg.draftModelPath);
  if (cfg.reasoningBudget !== null) args.push('--reasoning-budget', String(cfg.reasoningBudget));
  if (cfg.chatTemplateFile) args.push('--chat-template-file', cfg.chatTemplateFile);
  if (cfg.extraArgs.trim()) args.push(...splitArgs(cfg.extraArgs));
  return args;
}

/** Quantized V cache needs flash attention; surface the conflict before llama.cpp fails. */
export function validateLoadConfig(cfg: LoadConfig): string[] {
  const problems: string[] = [];
  if (cfg.flashAttention === 'off' && cfg.cacheTypeV !== 'f16' && cfg.cacheTypeV !== 'f32' && cfg.cacheTypeV !== 'bf16') {
    problems.push('A quantized V cache requires flash attention. Set Flash attention to Auto or On.');
  }
  if (typeof cfg.contextLength === 'number' && cfg.contextLength < 256) problems.push('Context length must be at least 256 tokens.');
  return problems;
}
