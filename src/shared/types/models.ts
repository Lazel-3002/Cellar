import type { ProviderKind } from './providers';

export interface ModelRef {
  providerId: string;
  modelId: string;
}

export const modelKey = (ref: ModelRef): string => `${ref.providerId}::${ref.modelId}`;

export interface ModelCapabilities {
  vision: boolean;
  tools: boolean;
  reasoning: boolean;
  embedding: boolean;
}

/**
 * How a model's thinking can be controlled.
 * - toggle: chat template accepts enable_thinking
 * - effort: chat template accepts reasoning_effort (low/medium/high)
 * - always: model always thinks (e.g. <think> baked into the template)
 * - none: no reasoning support detected
 */
export type ReasoningStyle = 'none' | 'toggle' | 'effort' | 'always';

export type ModelSource = 'cellar' | 'hf-cache' | 'lmstudio' | 'folder' | 'remote';

export interface ModelEntry {
  ref: ModelRef;
  providerKind: ProviderKind;
  providerName: string;
  displayName: string;
  publisher?: string;
  repo?: string;
  architecture?: string;
  paramsLabel?: string;
  quant?: string;
  sizeBytes?: number;
  format?: 'gguf' | 'mlx' | 'safetensors' | 'unknown';
  /** Trained / maximum context length. */
  contextLength?: number;
  capabilities: ModelCapabilities;
  reasoningStyle: ReasoningStyle;
  loaded: boolean;
  loading?: boolean;
  loadedContextLength?: number;
  path?: string;
  mmprojPath?: string;
  source?: ModelSource;
}

export type KvCacheType = 'f16' | 'bf16' | 'f32' | 'q8_0' | 'q5_1' | 'q5_0' | 'q4_1' | 'q4_0' | 'iq4_nl';
export const KV_CACHE_TYPES: KvCacheType[] = ['f16', 'bf16', 'f32', 'q8_0', 'q5_1', 'q5_0', 'q4_1', 'q4_0', 'iq4_nl'];

export type LoadMode = 'mmap' | 'mlock' | 'mmap+mlock' | 'none';

export interface LoadConfig {
  /** Tokens, or 'auto' to let llama.cpp fit the context to memory. */
  contextLength: number | 'auto';
  gpuLayers: 'auto' | 'all' | number;
  fit: boolean;
  fitTargetMiB: number;
  flashAttention: 'auto' | 'on' | 'off';
  cacheTypeK: KvCacheType;
  cacheTypeV: KvCacheType;
  /** Number of layers whose MoE expert weights stay on CPU; 'all' keeps every expert on CPU. */
  moeCpuLayers: number | 'all';
  threads: number | null;
  batchSize: number | null;
  ubatchSize: number | null;
  loadMode: LoadMode;
  kvOffload: boolean;
  parallel: number | null;
  ropeScaling: 'default' | 'none' | 'linear' | 'yarn';
  seed: number | null;
  useMmproj: boolean;
  mmprojOffload: boolean;
  draftModelPath: string | null;
  reasoningBudget: number | null;
  chatTemplateFile: string | null;
  extraArgs: string;
  /** Ollama keep_alive in minutes. */
  keepAliveMinutes: number;
}

export const DEFAULT_LOAD_CONFIG: LoadConfig = {
  contextLength: 16384,
  gpuLayers: 'auto',
  fit: true,
  fitTargetMiB: 1024,
  flashAttention: 'auto',
  cacheTypeK: 'f16',
  cacheTypeV: 'f16',
  moeCpuLayers: 0,
  threads: null,
  batchSize: null,
  ubatchSize: null,
  loadMode: 'mmap',
  kvOffload: true,
  parallel: 1,
  ropeScaling: 'default',
  seed: null,
  useMmproj: true,
  mmprojOffload: true,
  draftModelPath: null,
  reasoningBudget: null,
  chatTemplateFile: null,
  extraArgs: '',
  keepAliveMinutes: 30,
};

export type ContextOverflowPolicy = 'stop' | 'truncate-middle' | 'rolling';

export interface InferenceParams {
  systemPrompt: string;
  temperature: number | null;
  topK: number | null;
  topP: number | null;
  minP: number | null;
  repeatPenalty: number | null;
  presencePenalty: number | null;
  frequencyPenalty: number | null;
  dryMultiplier: number | null;
  xtcProbability: number | null;
  xtcThreshold: number | null;
  maxTokens: number | null;
  stop: string[];
  seed: number | null;
  jsonSchema: string;
  contextOverflow: ContextOverflowPolicy;
}

export const DEFAULT_INFERENCE_PARAMS: InferenceParams = {
  systemPrompt: '',
  temperature: null,
  topK: null,
  topP: null,
  minP: null,
  repeatPenalty: null,
  presencePenalty: null,
  frequencyPenalty: null,
  dryMultiplier: null,
  xtcProbability: null,
  xtcThreshold: null,
  maxTokens: null,
  stop: [],
  seed: null,
  jsonSchema: '',
  contextOverflow: 'truncate-middle',
};

export interface ModelPreset {
  load: LoadConfig;
  inference: InferenceParams;
}

export interface GgufSummary {
  architecture: string;
  name?: string;
  sizeLabel?: string;
  fileType?: string;
  quantizedBy?: string;
  contextLength?: number;
  blockCount: number;
  embeddingLength?: number;
  headCount?: number;
  headCountKv?: number;
  /** Per-layer KV head counts when the model varies them (0 = recurrent/no attention). */
  headCountKvPerLayer?: number[];
  keyLength?: number;
  valueLength?: number;
  expertCount?: number;
  expertUsedCount?: number;
  slidingWindow?: number;
  fullAttentionInterval?: number;
  vocabSize?: number;
  poolingType?: number;
  parameterCount?: number;
  hasChatTemplate: boolean;
  supportsTools: boolean;
  reasoningStyle: ReasoningStyle;
  /** Byte totals derived from tensor infos. */
  tensorBytes: {
    total: number;
    nonLayer: number;
    outputLayer: number;
    perLayer: number[];
    expertsPerLayer: number[];
  };
}

export type FitLevel = 'full' | 'partial' | 'too-large' | 'unknown';

export interface MemoryEstimate {
  fit: FitLevel;
  totalLayers: number;
  gpuLayers: number;
  contextLength: number;
  weightsBytes: number;
  kvBytes: number;
  computeBytes: number;
  mmprojBytes: number;
  gpuBytes: number;
  cpuBytes: number;
  vramBudgetBytes: number;
  ramBudgetBytes: number;
}

export interface LoadProgressEvent {
  ref: ModelRef;
  stage: 'starting' | 'loading' | 'allocating' | 'ready' | 'error' | 'unloaded';
  message: string;
  progress?: number;
  offloadedLayers?: number;
  totalLayers?: number;
}

export interface LoadedModelInfo {
  ref: ModelRef;
  contextLength?: number;
  offloadedLayers?: number;
  totalLayers?: number;
  gpuBufferMiB?: number;
  cpuBufferMiB?: number;
  kvBufferMiB?: number;
  port?: number;
  startedAt: number;
  config?: LoadConfig;
}

export interface ModelDetail {
  entry: ModelEntry;
  gguf?: GgufSummary;
  preset: ModelPreset;
  loaded?: LoadedModelInfo;
  shards?: string[];
}
