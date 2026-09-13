import { describe, expect, it } from 'vitest';
import { DEFAULT_LOAD_CONFIG, type GgufSummary } from '../../src/shared/types/models';
import { detectReasoningStyle, isEmbeddingModel, summarizeGguf, tensorBytes } from '../../src/main/models/gguf';
import { estimateMemory, kvBytesPerLayer } from '../../src/main/models/memory-estimate';
import { groupQuantFiles, preferredMmproj, quantBits, quantLabelForPath } from '../../src/main/hub/quants';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

/** A llama-3-8B-like model: 32 layers, 8 KV heads, head dim 128, ~4.6 GiB of Q4_K_M weights. */
function llama8b(overrides: Partial<GgufSummary> = {}): GgufSummary {
  const perLayer = new Array(32).fill(130 * MiB);
  return {
    architecture: 'llama',
    blockCount: 32,
    contextLength: 131072,
    embeddingLength: 4096,
    headCount: 32,
    headCountKv: 8,
    keyLength: 128,
    valueLength: 128,
    vocabSize: 128256,
    hasChatTemplate: true,
    supportsTools: true,
    reasoningStyle: 'none',
    tensorBytes: { total: 32 * 130 * MiB + 400 * MiB, nonLayer: 400 * MiB, outputLayer: 280 * MiB, perLayer, expertsPerLayer: new Array(32).fill(0) },
    ...overrides,
  };
}

describe('tensorBytes', () => {
  it('uses GGML block sizes', () => {
    expect(tensorBytes(0, [10n, 10n])).toBe(400); // F32
    expect(tensorBytes(12, [4096n, 4096n])).toBe(Math.ceil((4096 * 4096) / 256) * 144); // Q4_K
    expect(tensorBytes(8, [32n])).toBe(34); // Q8_0
  });
});

describe('summarizeGguf', () => {
  it('derives per-layer and expert weights from tensor names', () => {
    const summary = summarizeGguf([
      {
        metadata: {
          'general.architecture': 'qwen3moe',
          'qwen3moe.block_count': 2,
          'qwen3moe.context_length': 262144,
          'qwen3moe.embedding_length': 2048,
          'qwen3moe.attention.head_count': 32,
          'qwen3moe.attention.head_count_kv': 4,
          'qwen3moe.expert_count': 128,
          'tokenizer.chat_template': '{% if enable_thinking %}<think>{% endif %}{{ tools }}',
        },
        tensorInfos: [
          { name: 'token_embd.weight', shape: [2048n, 1000n], dtype: 1 },
          { name: 'output.weight', shape: [2048n, 1000n], dtype: 1 },
          { name: 'blk.0.attn_q.weight', shape: [2048n, 2048n], dtype: 1 },
          { name: 'blk.0.ffn_up_exps.weight', shape: [2048n, 768n, 128n], dtype: 1 },
          { name: 'blk.1.attn_q.weight', shape: [2048n, 2048n], dtype: 1 },
        ],
      },
    ]);
    expect(summary.blockCount).toBe(2);
    expect(summary.headCountKv).toBe(4);
    expect(summary.keyLength).toBe(64);
    expect(summary.expertCount).toBe(128);
    expect(summary.supportsTools).toBe(true);
    expect(summary.reasoningStyle).toBe('toggle');
    expect(summary.tensorBytes.nonLayer).toBe(2 * 2048 * 1000 * 2);
    expect(summary.tensorBytes.outputLayer).toBe(2048 * 1000 * 2);
    expect(summary.tensorBytes.expertsPerLayer[0]).toBe(2048 * 768 * 128 * 2);
    expect(summary.tensorBytes.perLayer[0]).toBe(2048 * 2048 * 2 + 2048 * 768 * 128 * 2);
    expect(summary.tensorBytes.perLayer[1]).toBe(2048 * 2048 * 2);
  });

  it('detects reasoning styles and embedding models', () => {
    expect(detectReasoningStyle('{{ reasoning_effort }}')).toBe('effort');
    expect(detectReasoningStyle('<think>\n')).toBe('always');
    expect(detectReasoningStyle('{{ messages }}')).toBe('none');
    expect(isEmbeddingModel(llama8b({ architecture: 'nomic-bert' }))).toBe(true);
    expect(isEmbeddingModel(llama8b())).toBe(false);
  });
});

describe('estimateMemory', () => {
  const budget = { vramBytes: 8 * GiB - 700 * MiB, ramBytes: 25 * GiB };

  it('computes a llama-style KV cache: layers × ctx × kv heads × (k+v) × bytes', () => {
    const kv = kvBytesPerLayer(llama8b(), 8192, 'f16', 'f16');
    expect(kv[0]).toBe(8192 * 8 * (128 * 2 + 128 * 2));
    expect(kv.reduce((a, b) => a + b, 0)).toBe(32 * 8192 * 8 * 512);
    const q8 = kvBytesPerLayer(llama8b(), 8192, 'q8_0', 'q8_0');
    expect(q8[0]).toBeLessThan(kv[0] * 0.55);
  });

  it('reports a full offload when weights and cache fit', () => {
    const est = estimateMemory({ summary: llama8b(), fileBytes: 4.6 * GiB, mmprojBytes: 0, contextLength: 8192, config: DEFAULT_LOAD_CONFIG }, budget);
    expect(est.fit).toBe('full');
    expect(est.gpuLayers).toBe(32);
    expect(est.gpuBytes).toBeLessThan(budget.vramBytes);
  });

  it('falls back to partial offload as context grows', () => {
    const est = estimateMemory({ summary: llama8b(), fileBytes: 4.6 * GiB, mmprojBytes: 0, contextLength: 65536, config: DEFAULT_LOAD_CONFIG }, budget);
    expect(est.fit).toBe('partial');
    expect(est.gpuLayers).toBeLessThan(32);
    expect(est.gpuBytes).toBeLessThanOrEqual(budget.vramBytes);
  });

  it('moves expert weights to the CPU for MoE offload', () => {
    const moe = llama8b({
      tensorBytes: { total: 32 * 600 * MiB, nonLayer: 400 * MiB, outputLayer: 280 * MiB, perLayer: new Array(32).fill(600 * MiB), expertsPerLayer: new Array(32).fill(520 * MiB) },
    });
    const allGpu = estimateMemory({ summary: moe, fileBytes: 19 * GiB, mmprojBytes: 0, contextLength: 8192, config: { ...DEFAULT_LOAD_CONFIG, gpuLayers: 'all' } }, budget);
    const cpuExperts = estimateMemory({ summary: moe, fileBytes: 19 * GiB, mmprojBytes: 0, contextLength: 8192, config: { ...DEFAULT_LOAD_CONFIG, gpuLayers: 'all', moeCpuLayers: 'all' } }, budget);
    expect(cpuExperts.gpuBytes).toBeLessThan(allGpu.gpuBytes - 30 * 520 * MiB);
    expect(cpuExperts.cpuBytes).toBeGreaterThan(32 * 520 * MiB);
    expect(cpuExperts.fit).not.toBe('too-large');
  });

  it('says too large when nothing fits', () => {
    const huge = llama8b({ tensorBytes: { total: 200 * GiB, nonLayer: GiB, outputLayer: GiB / 2, perLayer: new Array(32).fill(6 * GiB), expertsPerLayer: new Array(32).fill(0) } });
    expect(estimateMemory({ summary: huge, fileBytes: 200 * GiB, mmprojBytes: 0, contextLength: 4096, config: DEFAULT_LOAD_CONFIG }, budget).fit).toBe('too-large');
  });
});

describe('quant grouping', () => {
  const files = [
    { path: 'README.md', size: 10 },
    { path: 'gemma-4-E2B-it-UD-Q4_K_XL.gguf', size: 3 * GiB, sha256: 'a' },
    { path: 'gemma-4-E2B-it-Q8_0.gguf', size: 5 * GiB },
    { path: 'gemma-4-E2B-it-IQ2_XXS.gguf', size: GiB },
    { path: 'mmproj-BF16.gguf', size: 900 * MiB },
    { path: 'mmproj-F16.gguf', size: 850 * MiB },
    { path: 'MTP/mtp-gemma-4-E2B-it-BF16.gguf', size: 170 * MiB },
    { path: 'BF16/big-BF16-00001-of-00002.gguf', size: 40 * GiB },
    { path: 'BF16/big-BF16-00002-of-00002.gguf', size: 30 * GiB },
  ];

  it('groups shards, labels dynamic quants, and separates projectors and auxiliary files', () => {
    const grouped = groupQuantFiles(files);
    expect(grouped.quants.map((q) => q.label)).toEqual(['IQ2_XXS', 'UD-Q4_K_XL', 'Q8_0', 'BF16']);
    const bf16 = grouped.quants.find((q) => q.label === 'BF16');
    expect(bf16?.files).toHaveLength(2);
    expect(bf16?.sizeBytes).toBe(70 * GiB);
    expect(grouped.quants.find((q) => q.label === 'UD-Q4_K_XL')?.isDynamic).toBe(true);
    expect(grouped.mmproj.map((m) => m.path)).toEqual(['mmproj-F16.gguf', 'mmproj-BF16.gguf']);
    expect(grouped.other.some((f) => f.path.startsWith('MTP/'))).toBe(true);
    expect(preferredMmproj(grouped.mmproj)?.path).toBe('mmproj-F16.gguf');
  });

  it('orders quants by bits', () => {
    expect(quantBits('IQ2_XXS')).toBeLessThan(quantBits('Q3_K_M'));
    expect(quantBits('Q4_K_S')).toBeLessThan(quantBits('Q4_K_M'));
    expect(quantBits('Q4_K_M')).toBeLessThan(quantBits('UD-Q4_K_XL'));
    expect(quantBits('Q8_0')).toBeLessThan(quantBits('F16'));
    expect(quantLabelForPath('Q4_K_M/model-00001-of-00003.gguf')).toBe('Q4_K_M');
  });
});
