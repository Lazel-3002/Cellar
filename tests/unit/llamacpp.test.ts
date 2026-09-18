import { describe, expect, it } from 'vitest';
import { DEFAULT_LOAD_CONFIG } from '../../src/shared/types/models';
import { buildServerArgs, splitArgs, validateLoadConfig } from '../../src/main/providers/llamacpp/args';
import { emptyLoadInfo, failureHint, parseLogLine } from '../../src/main/providers/llamacpp/log-parser';
import { bestRuntime, parseDevicesOutput, parseReleaseAssets, parseVersionOutput } from '../../src/main/runtimes/llamacpp-runtimes';

const launch = { modelPath: 'C:\\models\\m.gguf', port: 5123, alias: 'abc' };

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

describe('buildServerArgs', () => {
  it('passes explicit choices and leaves auto values to llama.cpp', () => {
    const args = buildServerArgs(launch, DEFAULT_LOAD_CONFIG);
    expect(flag(args, '-m')).toBe(launch.modelPath);
    expect(flag(args, '--port')).toBe('5123');
    expect(flag(args, '-c')).toBe('16384');
    expect(args).not.toContain('-ngl');
    expect(flag(args, '--fit')).toBe('on');
    expect(flag(args, '-fa')).toBe('auto');
    expect(args).not.toContain('-ctk');
    expect(args).toContain('--no-webui');
    expect(flag(args, '--reasoning-format')).toBe('deepseek');
  });

  it('maps advanced options to llama-server flags', () => {
    const args = buildServerArgs(
      { ...launch, mmprojPath: 'C:\\models\\mmproj-F16.gguf' },
      {
        ...DEFAULT_LOAD_CONFIG,
        contextLength: 'auto',
        gpuLayers: 'all',
        cacheTypeK: 'q8_0',
        cacheTypeV: 'q8_0',
        moeCpuLayers: 12,
        threads: 6,
        ubatchSize: 1024,
        loadMode: 'mlock',
        kvOffload: false,
        mmprojOffload: false,
        reasoningBudget: 0,
        extraArgs: '--temp 0.5 --chat-template-kwargs "{\\"x\\":1}"',
      },
    );
    expect(args).not.toContain('-c');
    expect(flag(args, '-ngl')).toBe('all');
    expect(flag(args, '-ctk')).toBe('q8_0');
    expect(flag(args, '-ctv')).toBe('q8_0');
    expect(flag(args, '--n-cpu-moe')).toBe('12');
    expect(flag(args, '-t')).toBe('6');
    expect(flag(args, '-ub')).toBe('1024');
    expect(flag(args, '--load-mode')).toBe('mlock');
    expect(args).toContain('--no-kv-offload');
    expect(flag(args, '--mmproj')).toBe('C:\\models\\mmproj-F16.gguf');
    expect(args).toContain('--no-mmproj-offload');
    expect(flag(args, '--reasoning-budget')).toBe('0');
    expect(flag(args, '--temp')).toBe('0.5');
  });

  it('keeps all MoE experts on CPU with --cpu-moe and reads weights fully', () => {
    const args = buildServerArgs(launch, { ...DEFAULT_LOAD_CONFIG, moeCpuLayers: 'all' });
    expect(args).toContain('--cpu-moe');
    expect(flag(args, '--load-mode')).toBe('none');
    expect(buildServerArgs(launch, DEFAULT_LOAD_CONFIG)).not.toContain('--load-mode');
  });
});

describe('splitArgs / validateLoadConfig', () => {
  it('respects quotes', () => {
    expect(splitArgs(`--a 1 --b "two words" --c 'x y'`)).toEqual(['--a', '1', '--b', 'two words', '--c', 'x y']);
  });

  it('flags a quantized V cache without flash attention', () => {
    expect(validateLoadConfig({ ...DEFAULT_LOAD_CONFIG, flashAttention: 'off', cacheTypeV: 'q4_0' })).toHaveLength(1);
    expect(validateLoadConfig({ ...DEFAULT_LOAD_CONFIG, flashAttention: 'auto', cacheTypeV: 'q4_0' })).toHaveLength(0);
  });
});

describe('parseLogLine', () => {
  const lines = [
    'print_info: n_ctx_train      = 131072',
    'print_info: n_layer          = 28',
    'load_tensors: loading model tensors, this can take a while... (mmap = true)',
    'load_tensors: offloaded 29/29 layers to GPU',
    'load_tensors:        CUDA0 model buffer size =  4403.49 MiB',
    'load_tensors:   CPU_Mapped model buffer size =   292.36 MiB',
    'llama_context: n_ctx         = 16384',
    'llama_kv_cache:      CUDA0 KV buffer size =  1792.00 MiB',
    'llama_context:      CUDA0 compute buffer size =   304.00 MiB',
    'main: model loaded',
  ];

  it('extracts layers, buffers and context from a successful load', () => {
    const info = lines.reduce(parseLogLine, emptyLoadInfo());
    expect(info.stage).toBe('ready');
    expect(info.offloadedLayers).toBe(29);
    expect(info.totalLayers).toBe(29);
    expect(info.gpuModelMiB).toBeCloseTo(4403.49);
    expect(info.cpuModelMiB).toBeCloseTo(292.36);
    expect(info.contextLength).toBe(16384);
    expect(info.trainedContext).toBe(131072);
    expect(info.kvMiB).toBe(1792);
    expect(info.computeMiB).toBe(304);
    expect(info.outOfMemory).toBe(false);
  });

  it('understands the timestamped log format of newer builds', () => {
    const info = [
      '0.01.714.343 I print_info: n_ctx_train           = 131072',
      '0.02.426.496 I load_tensors: offloaded 36/36 layers to GPU',
      '0.02.426.499 I load_tensors:   CPU_Mapped model buffer size =  1804.00 MiB',
      '0.02.426.500 I load_tensors:        CUDA0 model buffer size =  1481.89 MiB',
      '0.02.964.451 I llama_context: n_ctx                 = 8192',
      '0.02.965.397 I llama_kv_cache:      CUDA0 KV buffer size =    48.00 MiB',
      '0.02.967.065 I llama_kv_cache:      CUDA0 KV buffer size =    30.00 MiB',
      '0.02.975.917 I sched_reserve:      CUDA0 compute buffer size =   124.02 MiB',
      '0.03.076.026 I srv  llama_server: model loaded',
    ].reduce(parseLogLine, emptyLoadInfo());
    expect(info).toMatchObject({ stage: 'ready', offloadedLayers: 36, totalLayers: 36, contextLength: 8192, trainedContext: 131072, kvMiB: 78 });
    expect(info.gpuModelMiB).toBeCloseTo(1481.89);
    expect(info.cpuModelMiB).toBeCloseTo(1804);
  });

  it('detects out-of-memory failures and suggests a fix', () => {
    const info = [
      'load_tensors: loading model tensors, this can take a while... (mmap = true)',
      'ggml_backend_cuda_buffer_type_alloc_buffer: allocating 9000.00 MiB on device 0: cudaMalloc failed: out of memory',
      'llama_model_load: error loading model: unable to allocate CUDA0 buffer',
    ].reduce(parseLogLine, emptyLoadInfo());
    expect(info.outOfMemory).toBe(true);
    expect(info.error).toContain('out of memory');
    expect(failureHint(info)).toMatch(/context length/);
  });

  it('hints at a vendor-specific quant when the generic loader rejects the GGUF', () => {
    const info = [
      '0.00.235.242 E llama_model_load: error loading model: llama_model_loader: failed to load model from C:\\models\\Ternary-Bonsai-2-27B-PTQ1_0.gguf',
    ].reduce(parseLogLine, emptyLoadInfo());
    expect(info.outOfMemory).toBe(false);
    expect(failureHint(info)).toMatch(/non-standard tensor or quantization format/);
  });
});

describe('runtime parsing', () => {
  it('reads both official and Unsloth version formats', () => {
    expect(parseVersionOutput('version: 10236 (1464c62d8)\nbuilt with Clang')).toEqual({ version: '10236 (1464c62d8)', build: 10236 });
    expect(parseVersionOutput('version: 0.1.1-dev (build 10472, commit 7a556b8f9)').build).toBe(10472);
  });

  it('parses --list-devices output', () => {
    const out = 'Available devices:\n  Vulkan0: NVIDIA GeForce RTX 5060 (7895 MiB, 7127 MiB free)\n  CUDA0: NVIDIA GeForce RTX 5060 (8151 MiB, 7000 MiB free)';
    expect(parseDevicesOutput(out)).toEqual([
      { id: 'Vulkan0', name: 'NVIDIA GeForce RTX 5060', totalMiB: 7895, freeMiB: 7127 },
      { id: 'CUDA0', name: 'NVIDIA GeForce RTX 5060', totalMiB: 8151, freeMiB: 7000 },
    ]);
    expect(parseDevicesOutput('Available devices:\n  (none)')).toEqual([]);
  });

  it('maps release assets to variants with matching CUDA runtimes', () => {
    const asset = (name: string) => ({ name, browser_download_url: `https://x/${name}`, size: 100 });
    const parsed = parseReleaseAssets([
      asset('llama-b10941-bin-win-cpu-x64.zip'),
      asset('llama-b10941-bin-win-cuda-12.4-x64.zip'),
      asset('llama-b10941-bin-win-cuda-13.3-x64.zip'),
      asset('llama-b10941-bin-win-cuda-13.4-arm64.zip'),
      asset('llama-b10941-bin-win-vulkan-x64.zip'),
      asset('cudart-llama-bin-win-cuda-12.4-x64.zip'),
      asset('cudart-llama-bin-win-cuda-13.3-x64.zip'),
    ]);
    const cuda13 = parsed.find((a) => a.variant === 'cuda-13');
    expect(cuda13?.name).toBe('llama-b10941-bin-win-cuda-13.3-x64.zip');
    expect(cuda13?.cudartName).toBe('cudart-llama-bin-win-cuda-13.3-x64.zip');
    expect(parsed.find((a) => a.variant === 'cuda-12')?.cudartName).toBe('cudart-llama-bin-win-cuda-12.4-x64.zip');
    expect(parsed.map((a) => a.variant).sort()).toEqual(['cpu', 'cuda-12', 'cuda-13', 'vulkan']);
  });

  it('prefers runtimes that can see a GPU', () => {
    const base = { label: '', dir: '', serverPath: '', backends: ['CPU'], ok: true, variant: 'cpu' as const };
    const best = bestRuntime([
      { ...base, id: 'unsloth', source: 'unsloth', build: 10472, backends: ['CUDA', 'CPU'], devices: [] },
      { ...base, id: 'winget', source: 'path', build: 10236, backends: ['Vulkan', 'CPU'], devices: [{ id: 'Vulkan0', name: 'RTX 5060' }] },
    ]);
    expect(best?.id).toBe('winget');
  });
});
