import type { GgufSummary, ReasoningStyle } from '@shared/types/models';

/** [block size, bytes per block] for each GGML tensor type id. */
const TYPE_SIZES: Record<number, [number, number]> = {
  0: [1, 4], // F32
  1: [1, 2], // F16
  2: [32, 18], // Q4_0
  3: [32, 20], // Q4_1
  6: [32, 22], // Q5_0
  7: [32, 24], // Q5_1
  8: [32, 34], // Q8_0
  9: [32, 36], // Q8_1
  10: [256, 84], // Q2_K
  11: [256, 110], // Q3_K
  12: [256, 144], // Q4_K
  13: [256, 176], // Q5_K
  14: [256, 210], // Q6_K
  15: [256, 292], // Q8_K
  16: [256, 66], // IQ2_XXS
  17: [256, 74], // IQ2_XS
  18: [256, 98], // IQ3_XXS
  19: [256, 50], // IQ1_S
  20: [32, 18], // IQ4_NL
  21: [256, 110], // IQ3_S
  22: [256, 82], // IQ2_S
  23: [256, 136], // IQ4_XS
  24: [1, 1], // I8
  25: [1, 2], // I16
  26: [1, 4], // I32
  27: [1, 8], // I64
  28: [1, 8], // F64
  29: [256, 56], // IQ1_M
  30: [1, 2], // BF16
  34: [256, 54], // TQ1_0
  35: [256, 66], // TQ2_0
  39: [32, 17], // MXFP4
  40: [16, 9], // NVFP4
  41: [32, 6], // Q1_0 (approx.)
  42: [32, 10], // Q2_0 (approx.)
};

const FILE_TYPE_NAMES: Record<number, string> = {
  0: 'F32', 1: 'F16', 2: 'Q4_0', 3: 'Q4_1', 7: 'Q8_0', 8: 'Q5_0', 9: 'Q5_1', 10: 'Q2_K', 11: 'Q3_K_S', 12: 'Q3_K_M',
  13: 'Q3_K_L', 14: 'Q4_K_S', 15: 'Q4_K_M', 16: 'Q5_K_S', 17: 'Q5_K_M', 18: 'Q6_K', 19: 'IQ2_XXS', 20: 'IQ2_XS',
  21: 'Q2_K_S', 22: 'IQ3_XS', 23: 'IQ3_XXS', 24: 'IQ1_S', 25: 'IQ4_NL', 26: 'IQ3_S', 27: 'IQ3_M', 28: 'IQ2_S',
  29: 'IQ2_M', 30: 'IQ4_XS', 31: 'IQ1_M', 32: 'BF16', 36: 'TQ1_0', 37: 'TQ2_0', 38: 'MXFP4_MOE', 39: 'NVFP4',
};

const EMBEDDING_ARCHES = new Set(['bert', 'nomic-bert', 'nomic-bert-moe', 'jina-bert-v2', 'jina-bert-v3', 'xlm-roberta', 't5encoder', 'modern-bert', 'neo-bert']);

export interface TensorLike {
  name: string;
  shape: Array<bigint | number>;
  dtype: number;
}

export interface ParsedShard {
  metadata: Record<string, unknown>;
  tensorInfos: TensorLike[];
}

export function tensorBytes(dtype: number, shape: Array<bigint | number>): number {
  const elements = shape.reduce<number>((acc, dim) => acc * Number(dim), 1);
  const [block, size] = TYPE_SIZES[dtype] ?? [1, 1];
  return Math.ceil(elements / block) * size;
}

export function detectReasoningStyle(template: string | undefined): ReasoningStyle {
  if (!template) return 'none';
  if (/reasoning_effort/.test(template)) return 'effort';
  if (/enable_thinking/.test(template)) return 'toggle';
  if (/<think>|<\|think\|>|\[THINK\]|<seed:think>|<\|channel\|>analysis/.test(template)) return 'always';
  return 'none';
}

function num(md: Record<string, unknown>, key: string): number | undefined {
  const v = md[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return undefined;
}

function numOrArray(md: Record<string, unknown>, key: string): { value?: number; perLayer?: number[] } {
  const v = md[key];
  if (Array.isArray(v)) {
    const perLayer = v.map((x) => Number(x));
    return { value: Math.max(0, ...perLayer), perLayer };
  }
  return { value: num(md, key) };
}

export function summarizeGguf(shards: ParsedShard[], parameterCount?: number): GgufSummary {
  const md = shards[0]?.metadata ?? {};
  const arch = String(md['general.architecture'] ?? 'unknown');
  const k = (suffix: string) => `${arch}.${suffix}`;
  const blockCount = num(md, k('block_count')) ?? 0;
  const embeddingLength = num(md, k('embedding_length'));
  const heads = numOrArray(md, k('attention.head_count'));
  const kvHeads = numOrArray(md, k('attention.head_count_kv'));
  const headCount = heads.value;
  const headDim = embeddingLength && headCount ? Math.floor(embeddingLength / headCount) : undefined;
  const template = typeof md['tokenizer.chat_template'] === 'string' ? (md['tokenizer.chat_template'] as string) : undefined;
  const tokens = md['tokenizer.ggml.tokens'];
  const fileTypeId = num(md, 'general.file_type');

  const perLayer = new Array<number>(blockCount).fill(0);
  const expertsPerLayer = new Array<number>(blockCount).fill(0);
  let total = 0;
  let nonLayer = 0;
  let outputLayer = 0;
  for (const shard of shards) {
    for (const t of shard.tensorInfos) {
      const bytes = tensorBytes(t.dtype, t.shape);
      total += bytes;
      const layer = t.name.match(/^blk\.(\d+)\./);
      if (layer) {
        const i = Number(layer[1]);
        if (i >= perLayer.length) {
          const previous = perLayer.length;
          perLayer.length = i + 1;
          expertsPerLayer.length = i + 1;
          perLayer.fill(0, previous);
          expertsPerLayer.fill(0, previous);
        }
        perLayer[i] = (perLayer[i] ?? 0) + bytes;
        if (/_exps(\.|$)/.test(t.name)) expertsPerLayer[i] = (expertsPerLayer[i] ?? 0) + bytes;
      } else {
        nonLayer += bytes;
        if (/^output(_norm)?\.weight$/.test(t.name)) outputLayer += bytes;
      }
    }
  }

  const poolingType = num(md, k('pooling_type'));
  return {
    architecture: arch,
    name: typeof md['general.name'] === 'string' ? (md['general.name'] as string) : undefined,
    sizeLabel: typeof md['general.size_label'] === 'string' ? (md['general.size_label'] as string) : undefined,
    fileType: fileTypeId !== undefined ? FILE_TYPE_NAMES[fileTypeId] : undefined,
    quantizedBy: typeof md['general.quantized_by'] === 'string' ? (md['general.quantized_by'] as string) : undefined,
    contextLength: num(md, k('context_length')),
    blockCount,
    embeddingLength,
    headCount,
    headCountKv: kvHeads.value ?? headCount,
    headCountKvPerLayer: kvHeads.perLayer,
    keyLength: num(md, k('attention.key_length')) ?? headDim,
    valueLength: num(md, k('attention.value_length')) ?? headDim,
    expertCount: num(md, k('expert_count')),
    expertUsedCount: num(md, k('expert_used_count')),
    slidingWindow: num(md, k('attention.sliding_window')),
    fullAttentionInterval: num(md, k('full_attention_interval')),
    vocabSize: num(md, k('vocab_size')) ?? (Array.isArray(tokens) ? tokens.length : undefined),
    poolingType,
    parameterCount,
    hasChatTemplate: !!template,
    supportsTools: !!template && /\btools\b/.test(template),
    reasoningStyle: detectReasoningStyle(template),
    tensorBytes: { total, nonLayer, outputLayer, perLayer, expertsPerLayer },
  };
}

export function isEmbeddingModel(summary: GgufSummary): boolean {
  if (EMBEDDING_ARCHES.has(summary.architecture)) return true;
  return summary.poolingType !== undefined && summary.poolingType > 0 && !summary.hasChatTemplate;
}

/** Drop huge arrays (vocab) from metadata before it crosses into summarization. */
export function slimMetadata(md: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(md)) {
    if (key.startsWith('tokenizer.ggml.') && Array.isArray(value)) {
      if (key === 'tokenizer.ggml.tokens') out[key] = { length: value.length };
      continue;
    }
    out[key] = value;
  }
  const tokens = out['tokenizer.ggml.tokens'] as { length: number } | undefined;
  if (tokens) out['tokenizer.ggml.tokens'] = new Array(tokens.length);
  return out;
}
