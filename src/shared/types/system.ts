export interface GpuInfo {
  index: number;
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';
  name: string;
  vramTotalBytes: number;
  vramFreeBytes?: number;
  driverVersion?: string;
  computeCapability?: string;
}

export interface HardwareInfo {
  gpus: GpuInfo[];
  cpu: { brand: string; physicalCores: number; threads: number };
  ramTotalBytes: number;
  ramFreeBytes: number;
  os: string;
  detectedAt: number;
}

export type RuntimeVariant = 'cuda-13' | 'cuda-12' | 'vulkan' | 'cpu' | 'sycl' | 'rocm' | 'unknown';

export interface RuntimeDevice {
  id: string;
  name: string;
  totalMiB?: number;
  freeMiB?: number;
}

export interface RuntimeInfo {
  id: string;
  source: 'cellar' | 'unsloth' | 'path' | 'custom';
  label: string;
  dir: string;
  serverPath: string;
  version?: string;
  build?: number;
  variant: RuntimeVariant;
  backends: string[];
  devices: RuntimeDevice[];
  ok: boolean;
  error?: string;
}

export interface RuntimeRelease {
  tag: string;
  build: number;
  publishedAt: string;
  assets: Array<{ variant: RuntimeVariant; name: string; url: string; sizeBytes: number; cudartUrl?: string; cudartName?: string; cudartSizeBytes?: number }>;
  recommended: RuntimeVariant;
}

export interface RuntimeInstallProgress {
  variant: RuntimeVariant;
  stage: 'downloading' | 'extracting' | 'verifying' | 'done' | 'error';
  receivedBytes: number;
  totalBytes: number;
  message?: string;
}
