import type { FitLevel, GgufSummary, MemoryEstimate } from './models';

export type HfSort = 'trendingScore' | 'downloads' | 'likes' | 'lastModified';

export interface HfSearchQuery {
  search: string;
  author?: string;
  sort: HfSort;
  limit?: number;
}

export interface HfModelSummary {
  id: string;
  author: string;
  name: string;
  downloads: number;
  likes: number;
  lastModified?: string;
  pipelineTag?: string;
  tags: string[];
  gated: boolean;
}

export interface HfFile {
  path: string;
  size: number;
  sha256?: string;
}

export interface QuantOption {
  /** e.g. "Q4_K_M" or "UD-Q4_K_XL" */
  label: string;
  bits: number;
  /** Relative paths inside the repo (all shards, in order). */
  files: string[];
  sizeBytes: number;
  isDynamic: boolean;
  sha256: Array<string | undefined>;
}

export interface HfRepoDetail {
  id: string;
  author: string;
  name: string;
  downloads: number;
  likes: number;
  lastModified?: string;
  gated: boolean;
  tags: string[];
  license?: string;
  baseModel?: string;
  architecture?: string;
  contextLength?: number;
  quants: QuantOption[];
  mmproj: HfFile[];
  otherFiles: HfFile[];
}

export interface QuantFit {
  repoId: string;
  label: string;
  fit: FitLevel;
  estimate?: MemoryEstimate;
  summary?: Pick<GgufSummary, 'architecture' | 'contextLength' | 'blockCount' | 'expertCount' | 'sizeLabel'>;
  error?: string;
}

export type DownloadTarget = 'cellar' | 'ollama' | 'lmstudio';
export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'verifying' | 'completed' | 'error' | 'canceled';

export interface DownloadFileState {
  path: string;
  sizeBytes: number;
  receivedBytes: number;
  sha256?: string;
  done: boolean;
}

export interface DownloadJob {
  id: string;
  repoId: string;
  label: string;
  target: DownloadTarget;
  files: DownloadFileState[];
  status: DownloadStatus;
  totalBytes: number;
  receivedBytes: number;
  speedBps: number;
  etaSeconds?: number;
  error?: string;
  destDir?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StartDownloadInput {
  repoId: string;
  quantLabel: string;
  target: DownloadTarget;
  includeMmproj: boolean;
}
