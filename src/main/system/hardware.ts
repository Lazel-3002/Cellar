import { execFile } from 'node:child_process';
import { cpus, freemem, release, totalmem, type as osType } from 'node:os';
import { promisify } from 'node:util';
import type { GpuInfo, HardwareInfo, RuntimeVariant } from '@shared/types/system';
import type { WhisperVariant } from '@shared/types/voice';
import { logger } from '../lib/log';

const exec = promisify(execFile);
const log = logger('hardware');

export function parseNvidiaSmi(csv: string): GpuInfo[] {
  const gpus: GpuInfo[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const cols = line.split(',').map((c) => c.trim());
    if (cols.length < 6 || !/^\d+$/.test(cols[0])) continue;
    const [index, name, total, free, driver, cap] = cols;
    const totalMiB = Number(total);
    const freeMiB = Number(free);
    gpus.push({
      index: Number(index),
      vendor: 'nvidia',
      name,
      vramTotalBytes: Number.isFinite(totalMiB) ? totalMiB * 1024 * 1024 : 0,
      vramFreeBytes: Number.isFinite(freeMiB) ? freeMiB * 1024 * 1024 : undefined,
      driverVersion: driver,
      computeCapability: cap && cap !== '[N/A]' ? cap : undefined,
    });
  }
  return gpus;
}

async function nvidiaGpus(): Promise<GpuInfo[]> {
  try {
    const { stdout } = await exec(
      'nvidia-smi',
      ['--query-gpu=index,name,memory.total,memory.free,driver_version,compute_cap', '--format=csv,noheader,nounits'],
      { timeout: 8000, windowsHide: true },
    );
    return parseNvidiaSmi(stdout);
  } catch {
    return [];
  }
}

async function otherGpus(): Promise<GpuInfo[]> {
  try {
    const si = await import('systeminformation');
    const graphics = await si.graphics();
    return graphics.controllers
      .filter((c) => !/nvidia/i.test(c.vendor) && !/microsoft basic|remote/i.test(c.model))
      .map((c, index) => ({
        index,
        vendor: /amd|advanced micro/i.test(c.vendor) ? 'amd' : /intel/i.test(c.vendor) ? 'intel' : /apple/i.test(c.vendor) ? 'apple' : 'unknown',
        name: c.model,
        vramTotalBytes: (c.vram ?? 0) * 1024 * 1024,
      }));
  } catch (err) {
    log.warn('graphics detection failed', err);
    return [];
  }
}

let cached: HardwareInfo | null = null;
let inflight: Promise<HardwareInfo> | null = null;

export async function detectHardware(refresh = false): Promise<HardwareInfo> {
  if (cached && !refresh && Date.now() - cached.detectedAt < 30_000) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    let gpus = await nvidiaGpus();
    if (gpus.length === 0) gpus = await otherGpus();
    const cpuList = cpus();
    let physicalCores = Math.max(1, Math.round(cpuList.length / 2));
    let brand = cpuList[0]?.model?.trim() ?? 'Unknown CPU';
    let ramFree = freemem();
    try {
      const si = await import('systeminformation');
      const [cpu, mem] = await Promise.all([si.cpu(), si.mem()]);
      physicalCores = cpu.physicalCores || physicalCores;
      brand = `${cpu.manufacturer} ${cpu.brand}`.trim() || brand;
      ramFree = mem.available || ramFree;
    } catch {
      // fall back to os module values
    }
    const info: HardwareInfo = {
      gpus,
      cpu: { brand, physicalCores, threads: cpuList.length },
      ramTotalBytes: totalmem(),
      ramFreeBytes: ramFree,
      os: `${osType()} ${release()}`,
      detectedAt: Date.now(),
    };
    cached = info;
    return info;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Pick the llama.cpp build that best matches the primary GPU. */
export function recommendedVariant(hw: HardwareInfo): RuntimeVariant {
  const gpu = hw.gpus[0];
  if (!gpu) return 'cpu';
  if (gpu.vendor === 'nvidia') {
    const cap = Number(gpu.computeCapability ?? '0');
    const driverMajor = Number((gpu.driverVersion ?? '0').split('.')[0]);
    // CUDA 13 needs an R580+ driver; Blackwell (compute 12.x) requires CUDA ≥ 12.8 so 13 is the safe pick.
    if (driverMajor >= 580 && (cap === 0 || cap >= 7.5)) return 'cuda-13';
    return 'cuda-12';
  }
  if (gpu.vendor === 'amd' || gpu.vendor === 'intel') return 'vulkan';
  return 'cpu';
}

/**
 * Pick the whisper.cpp build that best matches the primary GPU. Unlike llama.cpp, whisper.cpp's
 * official Windows x64 releases only ship a CUDA 12.4 build (no x64 CUDA 13 asset exists yet — only
 * an arm64 one), and that build's compiled kernels stop at compute capability 9.0. On a Blackwell
 * GPU (RTX 50 series, compute 10.0+/12.0) it still runs — the driver falls back to slow PTX JIT —
 * but measured on an RTX 5060 that made a 2s clip take ~34s (vs ~0.5s on the CPU build), a ~70x
 * regression that makes "GPU-accelerated" dictation worse than no GPU at all. Recommend CPU there
 * until whisper.cpp ships Blackwell SASS or a CUDA 13 x64 build (recheck VARIANT_ASSETS in voice/whisper.ts).
 */
export function recommendedWhisperVariant(hw: HardwareInfo): WhisperVariant {
  const gpu = hw.gpus[0];
  if (!gpu || gpu.vendor !== 'nvidia') return 'cpu';
  const cap = Number(gpu.computeCapability ?? '0');
  return cap > 0 && cap < 10 ? 'cuda-12' : 'cpu';
}

/** VRAM budget for fit badges: total VRAM minus what the desktop typically holds. */
export function vramBudgetBytes(hw: HardwareInfo): number {
  const gpu = hw.gpus[0];
  if (!gpu || gpu.vramTotalBytes === 0) return 0;
  return Math.max(0, gpu.vramTotalBytes - 700 * 1024 * 1024);
}
