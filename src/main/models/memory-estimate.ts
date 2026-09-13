import type { FitLevel, GgufSummary, KvCacheType, LoadConfig, MemoryEstimate } from '@shared/types/models';

const MiB = 1024 * 1024;

const KV_BYTES_PER_ELEMENT: Record<KvCacheType, number> = {
  f32: 4,
  f16: 2,
  bf16: 2,
  q8_0: 34 / 32,
  q5_1: 24 / 32,
  q5_0: 22 / 32,
  q4_1: 20 / 32,
  q4_0: 18 / 32,
  iq4_nl: 18 / 32,
};

export interface EstimateInput {
  summary: GgufSummary;
  fileBytes: number;
  mmprojBytes: number;
  config: Pick<LoadConfig, 'gpuLayers' | 'cacheTypeK' | 'cacheTypeV' | 'moeCpuLayers' | 'kvOffload' | 'useMmproj' | 'mmprojOffload' | 'flashAttention' | 'ubatchSize'>;
  contextLength: number;
}

export interface MemoryBudget {
  vramBytes: number;
  ramBytes: number;
}

/** Whether layer i uses sliding-window attention, per the conventions of common architectures. */
function isSlidingLayer(arch: string, i: number): boolean {
  if (arch.startsWith('gemma')) return (i + 1) % 6 !== 0;
  if (arch === 'gpt-oss') return i % 2 === 0;
  if (arch === 'cohere2') return (i + 1) % 4 !== 0;
  return false;
}

export function kvBytesPerLayer(s: GgufSummary, contextLength: number, k: KvCacheType, v: KvCacheType): number[] {
  const layers = Math.max(s.blockCount, s.tensorBytes.perLayer.length);
  const keyDim = s.keyLength ?? 128;
  const valueDim = s.valueLength ?? 128;
  const out: number[] = [];
  for (let i = 0; i < layers; i++) {
    const kvHeads = s.headCountKvPerLayer?.[i] ?? s.headCountKv ?? 8;
    if (kvHeads === 0) {
      out.push(0);
      continue;
    }
    if (s.fullAttentionInterval && (i + 1) % s.fullAttentionInterval !== 0) {
      // Linear-attention / recurrent layer: small fixed-size state instead of a KV cache.
      out.push(0);
      continue;
    }
    const ctx = s.slidingWindow && isSlidingLayer(s.architecture, i) ? Math.min(contextLength, s.slidingWindow) : contextLength;
    out.push(ctx * kvHeads * (keyDim * KV_BYTES_PER_ELEMENT[k] + valueDim * KV_BYTES_PER_ELEMENT[v]));
  }
  return out;
}

export function estimateMemory(input: EstimateInput, budget: MemoryBudget): MemoryEstimate {
  const s = input.summary;
  const cfg = input.config;
  const haveTensors = s.tensorBytes.total > 0;
  const layers = Math.max(1, s.blockCount || s.tensorBytes.perLayer.length);
  const weightsBytes = haveTensors ? s.tensorBytes.total : input.fileBytes;
  const perLayer = haveTensors && s.tensorBytes.perLayer.length ? s.tensorBytes.perLayer : new Array<number>(layers).fill((input.fileBytes * 0.92) / layers);
  const experts = haveTensors ? s.tensorBytes.expertsPerLayer : new Array<number>(layers).fill(0);
  const nonLayer = haveTensors ? s.tensorBytes.nonLayer : input.fileBytes * 0.08;
  const outputLayer = haveTensors ? s.tensorBytes.outputLayer || nonLayer / 2 : nonLayer / 2;

  const kv = kvBytesPerLayer(s, input.contextLength, cfg.cacheTypeK, cfg.cacheTypeV);
  const kvBytes = kv.reduce((a, b) => a + b, 0);

  const ubatch = cfg.ubatchSize ?? 512;
  const vocab = s.vocabSize ?? 32_000;
  const embd = s.embeddingLength ?? 4096;
  const computeBytes =
    192 * MiB + vocab * Math.min(ubatch, input.contextLength) * 4 * 0.5 + embd * ubatch * 4 * 4 +
    (cfg.flashAttention === 'off' ? input.contextLength * ubatch * 4 * 2 : 0);

  const mmprojBytes = cfg.useMmproj ? input.mmprojBytes : 0;
  const expertsOnCpu = (i: number) => cfg.moeCpuLayers === 'all' || (typeof cfg.moeCpuLayers === 'number' && i < cfg.moeCpuLayers);
  const layerGpuCost = (i: number) => (perLayer[i] ?? 0) - (expertsOnCpu(i) ? experts[i] ?? 0 : 0) + (cfg.kvOffload ? kv[i] ?? 0 : 0);
  const fixedGpu = computeBytes + (cfg.mmprojOffload ? mmprojBytes : 0);

  let gpuLayers: number;
  if (budget.vramBytes <= 0) gpuLayers = 0;
  else if (cfg.gpuLayers === 'all') gpuLayers = layers;
  else if (typeof cfg.gpuLayers === 'number') gpuLayers = Math.min(layers, Math.max(0, Math.round(cfg.gpuLayers)));
  else {
    // llama.cpp offloads the last N layers; walk down from the top until the budget runs out.
    let remaining = budget.vramBytes - fixedGpu;
    gpuLayers = 0;
    for (let i = layers - 1; i >= 0; i--) {
      const cost = layerGpuCost(i);
      if (cost > remaining) break;
      remaining -= cost;
      gpuLayers++;
    }
    if (gpuLayers === layers && remaining < outputLayer) gpuLayers = layers - 1;
  }

  let gpuBytes = gpuLayers > 0 ? fixedGpu : 0;
  let cpuBytes = nonLayer + (cfg.mmprojOffload && gpuLayers > 0 ? 0 : mmprojBytes);
  for (let i = 0; i < layers; i++) {
    const offloaded = i >= layers - gpuLayers;
    if (offloaded) {
      gpuBytes += layerGpuCost(i);
      if (expertsOnCpu(i)) cpuBytes += experts[i] ?? 0;
      if (!cfg.kvOffload) cpuBytes += kv[i] ?? 0;
    } else {
      cpuBytes += (perLayer[i] ?? 0) + (kv[i] ?? 0);
    }
  }
  if (gpuLayers === layers) {
    gpuBytes += outputLayer;
    cpuBytes -= outputLayer;
  }
  if (gpuLayers === 0) cpuBytes += computeBytes;

  let fit: FitLevel;
  if (budget.vramBytes > 0 && gpuLayers === layers && gpuBytes <= budget.vramBytes) fit = 'full';
  else if (gpuBytes <= Math.max(budget.vramBytes, 0) * 1.02 && cpuBytes <= budget.ramBytes) fit = 'partial';
  else if (gpuBytes + cpuBytes <= budget.vramBytes + budget.ramBytes) fit = 'partial';
  else fit = 'too-large';

  return {
    fit,
    totalLayers: layers,
    gpuLayers,
    contextLength: input.contextLength,
    weightsBytes,
    kvBytes,
    computeBytes,
    mmprojBytes,
    gpuBytes: Math.round(gpuBytes),
    cpuBytes: Math.round(Math.max(0, cpuBytes)),
    vramBudgetBytes: budget.vramBytes,
    ramBudgetBytes: budget.ramBytes,
  };
}
