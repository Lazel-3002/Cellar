export type LoadStage = 'starting' | 'loading' | 'allocating' | 'warming' | 'ready' | 'error';

export interface LoadInfo {
  stage: LoadStage;
  totalLayers?: number;
  offloadedLayers?: number;
  gpuModelMiB: number;
  cpuModelMiB: number;
  kvMiB: number;
  computeMiB: number;
  contextLength?: number;
  trainedContext?: number;
  error?: string;
  outOfMemory: boolean;
}

export function emptyLoadInfo(): LoadInfo {
  return { stage: 'starting', gpuModelMiB: 0, cpuModelMiB: 0, kvMiB: 0, computeMiB: 0, outOfMemory: false };
}

const GPU_BUFFER = /(?:CUDA\d*|Vulkan\d*|ROCm\d*|SYCL\d*|MTL\d*|Metal|OpenCL\d*)(?:_Split)?\s+model buffer size\s*=\s*([\d.]+)\s*MiB/;
const CPU_BUFFER = /CPU(?:_Mapped|_REPACK|_AARCH64)?\s+model buffer size\s*=\s*([\d.]+)\s*MiB/;
const OOM = /out of memory|failed to allocate|unable to allocate|cudaMalloc failed|ErrorOutOfDeviceMemory|not enough memory/i;
const FATAL = /error loading model|failed to load model|unknown model architecture|exiting due to|invalid argument|error: |failed to open|GGML_ASSERT|terminate called|unsupported model/i;

/** Incrementally folds llama-server log lines into structured load information. */
export function parseLogLine(info: LoadInfo, raw: string): LoadInfo {
  const line = raw.trim();
  if (!line) return info;
  const next: LoadInfo = { ...info };

  let m: RegExpMatchArray | null;
  if ((m = line.match(/n_layer\s*=\s*(\d+)/))) next.totalLayers ??= Number(m[1]);
  if ((m = line.match(/n_ctx_train\s*=\s*(\d+)/))) next.trainedContext = Number(m[1]);
  if ((m = line.match(/offloaded (\d+)\/(\d+) layers to GPU/))) {
    next.offloadedLayers = Number(m[1]);
    next.totalLayers = Number(m[2]);
  }
  if ((m = line.match(GPU_BUFFER))) next.gpuModelMiB += Number(m[1]);
  else if ((m = line.match(CPU_BUFFER))) next.cpuModelMiB += Number(m[1]);
  if ((m = line.match(/llama_context:\s+n_ctx\s*=\s*(\d+)/))) next.contextLength = Number(m[1]);
  else if ((m = line.match(/n_ctx_slot\s*=\s*(\d+)/))) next.contextLength ??= Number(m[1]);
  if ((m = line.match(/KV buffer size\s*=\s*([\d.]+)\s*MiB/))) next.kvMiB += Number(m[1]);
  if ((m = line.match(/compute buffer size\s*=\s*([\d.]+)\s*MiB/))) next.computeMiB += Number(m[1]);

  if (next.stage !== 'error' && next.stage !== 'ready') {
    if (/load_tensors:|llama_model_loader:|loading model/.test(line)) next.stage = 'loading';
    if (/constructing llama_context|llama_kv_cache|llama_context:/.test(line)) next.stage = 'allocating';
    if (/warming up the model/.test(line)) next.stage = 'warming';
    if (/model loaded|listening on http|starting the main loop/.test(line)) next.stage = 'ready';
  }

  if (OOM.test(line)) {
    next.outOfMemory = true;
    next.error ??= line;
  } else if (FATAL.test(line) && !/warn|W /.test(line.slice(0, 12))) {
    next.error ??= line;
  }
  return next;
}

export function describeStage(info: LoadInfo): string {
  switch (info.stage) {
    case 'starting':
      return 'Starting llama.cpp…';
    case 'loading':
      return info.offloadedLayers !== undefined
        ? `Loading weights (${info.offloadedLayers}/${info.totalLayers} layers on GPU)…`
        : 'Loading weights…';
    case 'allocating':
      return 'Allocating context…';
    case 'warming':
      return 'Warming up…';
    case 'ready':
      return 'Ready';
    case 'error':
      return info.error ?? 'Failed to load';
  }
}

/** Human-friendly advice for common load failures. */
export function failureHint(info: LoadInfo): string | undefined {
  if (info.outOfMemory) {
    return 'The model did not fit in memory. Try a smaller context length, a quantized KV cache (q8_0), fewer GPU layers, or keeping MoE experts on the CPU.';
  }
  if (info.error && /unknown model architecture|unsupported model/i.test(info.error)) {
    return 'This llama.cpp build does not support the model architecture. Update the runtime in Settings → Engines & runtimes.';
  }
  return undefined;
}
