import { gguf, ggufAllShards } from '@huggingface/gguf';
import type { HfFile, HfModelSummary, HfRepoDetail, HfSearchQuery, QuantFit } from '@shared/types/hub';
import { DEFAULT_LOAD_CONFIG } from '@shared/types/models';
import { errorMessage, fetchWithTimeout } from '../lib/util';
import { summarizeGguf, type ParsedShard } from '../models/gguf';
import { estimateMemory } from '../models/memory-estimate';
import { settings } from '../services/settings';
import { detectHardware, vramBudgetBytes } from '../system/hardware';
import { groupQuantFiles, preferredMmproj } from './quants';

export const HF_BASE = 'https://huggingface.co';

export function hfHeaders(): Record<string, string> {
  const token = settings.hfToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function resolveUrl(repoId: string, path: string, revision = 'main'): string {
  return `${HF_BASE}/${repoId}/resolve/${encodeURIComponent(revision)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function hfJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', ...hfHeaders() }, timeoutMs });
  if (res.status === 401 || res.status === 403) throw new Error('This repository is gated or private. Add a Hugging Face token in Settings → Models and accept the license on huggingface.co.');
  if (res.status === 404) throw new Error('Repository not found on Hugging Face.');
  if (!res.ok) throw new Error(`Hugging Face API error ${res.status}`);
  return (await res.json()) as T;
}

export async function searchModels(query: HfSearchQuery): Promise<HfModelSummary[]> {
  const params = new URLSearchParams({ filter: 'gguf', sort: query.sort, direction: '-1', limit: String(query.limit ?? 40) });
  if (query.search.trim()) params.set('search', query.search.trim());
  if (query.author) params.set('author', query.author);
  const rows = await hfJson<Array<{ id: string; likes?: number; downloads?: number; tags?: string[]; pipeline_tag?: string; lastModified?: string; createdAt?: string; gated?: boolean | string }>>(
    `${HF_BASE}/api/models?${params}`,
  );
  return rows.map((r) => ({
    id: r.id,
    author: r.id.split('/')[0],
    name: r.id.split('/').slice(1).join('/'),
    downloads: r.downloads ?? 0,
    likes: r.likes ?? 0,
    lastModified: r.lastModified ?? r.createdAt,
    pipelineTag: r.pipeline_tag,
    tags: r.tags ?? [],
    gated: !!r.gated,
  }));
}

interface RepoInfo {
  id: string;
  downloads?: number;
  likes?: number;
  lastModified?: string;
  gated?: boolean | string;
  tags?: string[];
  cardData?: { license?: string; base_model?: string | string[] };
  gguf?: { architecture?: string; context_length?: number };
}

interface TreeEntry {
  type: 'file' | 'directory';
  path: string;
  size: number;
  lfs?: { oid: string; size: number };
}

const repoCache = new Map<string, { at: number; detail: HfRepoDetail; files: HfFile[] }>();

export async function repoDetail(repoId: string, refresh = false): Promise<HfRepoDetail> {
  return (await repoWithFiles(repoId, refresh)).detail;
}

export async function repoWithFiles(repoId: string, refresh = false): Promise<{ detail: HfRepoDetail; files: HfFile[] }> {
  const cached = repoCache.get(repoId);
  if (cached && !refresh && Date.now() - cached.at < 10 * 60_000) return cached;
  const [info, tree] = await Promise.all([
    hfJson<RepoInfo>(`${HF_BASE}/api/models/${repoId}`),
    hfJson<TreeEntry[]>(`${HF_BASE}/api/models/${repoId}/tree/main?recursive=true`),
  ]);
  const files: HfFile[] = tree.filter((e) => e.type === 'file').map((e) => ({ path: e.path, size: e.lfs?.size ?? e.size, sha256: e.lfs?.oid }));
  const grouped = groupQuantFiles(files);
  const baseModel = info.cardData?.base_model;
  const detail: HfRepoDetail = {
    id: info.id,
    author: info.id.split('/')[0],
    name: info.id.split('/').slice(1).join('/'),
    downloads: info.downloads ?? 0,
    likes: info.likes ?? 0,
    lastModified: info.lastModified,
    gated: !!info.gated,
    tags: info.tags ?? [],
    license: info.cardData?.license,
    baseModel: Array.isArray(baseModel) ? baseModel[0] : baseModel,
    architecture: info.gguf?.architecture,
    contextLength: info.gguf?.context_length,
    quants: grouped.quants,
    mmproj: grouped.mmproj,
    otherFiles: grouped.other.filter((f) => !f.path.startsWith('.')),
  };
  const entry = { at: Date.now(), detail, files };
  repoCache.set(repoId, entry);
  return entry;
}

export async function readme(repoId: string): Promise<string> {
  const res = await fetchWithTimeout(`${HF_BASE}/${repoId}/raw/main/README.md`, { headers: hfHeaders(), timeoutMs: 20_000 });
  if (!res.ok) return '';
  const text = await res.text();
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
}

const fitCache = new Map<string, QuantFit>();
const fitInflight = new Map<string, Promise<QuantFit>>();
let fitSlots = 3;
const fitWaiters: Array<() => void> = [];

async function withFitSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (fitSlots === 0) await new Promise<void>((resolve) => fitWaiters.push(resolve));
  fitSlots--;
  try {
    return await fn();
  } finally {
    fitSlots++;
    fitWaiters.shift()?.();
  }
}

/** Estimate how a quant fits this machine by reading its GGUF header over HTTP range requests. */
export function quantFit(repoId: string, label: string): Promise<QuantFit> {
  const key = `${repoId}::${label}`;
  const cached = fitCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = fitInflight.get(key);
  if (pending) return pending;
  const promise = withFitSlot(() => computeQuantFit(repoId, label, key)).finally(() => fitInflight.delete(key));
  fitInflight.set(key, promise);
  return promise;
}

async function computeQuantFit(repoId: string, label: string, key: string): Promise<QuantFit> {
  const { detail } = await repoWithFiles(repoId);
  const quant = detail.quants.find((q) => q.label === label);
  if (!quant) return { repoId, label, fit: 'unknown', error: 'Quant not found' };
  try {
    const authFetch: typeof fetch = (input, init) => fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), ...hfHeaders() } });
    const url = resolveUrl(repoId, quant.files[0]);
    let shards: ParsedShard[];
    if (quant.files.length > 1) {
      const out = await ggufAllShards(url, { fetch: authFetch });
      shards = out.shards.map((s) => ({ metadata: s.metadata as unknown as Record<string, unknown>, tensorInfos: s.tensorInfos }));
    } else {
      const out = await gguf(url, { fetch: authFetch });
      shards = [{ metadata: out.metadata as unknown as Record<string, unknown>, tensorInfos: out.tensorInfos }];
    }
    const summary = summarizeGguf(shards);
    const hw = await detectHardware();
    const projector = preferredMmproj(detail.mmproj);
    const contextLength = Math.min(summary.contextLength ?? 4096, settings.get().defaultContextLength);
    const estimate = estimateMemory(
      { summary, fileBytes: quant.sizeBytes, mmprojBytes: projector?.size ?? 0, contextLength, config: DEFAULT_LOAD_CONFIG },
      { vramBytes: vramBudgetBytes(hw), ramBytes: hw.ramTotalBytes * 0.8 },
    );
    const result: QuantFit = {
      repoId,
      label,
      fit: estimate.fit,
      estimate,
      summary: { architecture: summary.architecture, contextLength: summary.contextLength, blockCount: summary.blockCount, expertCount: summary.expertCount, sizeLabel: summary.sizeLabel },
    };
    fitCache.set(key, result);
    return result;
  } catch (err) {
    return { repoId, label, fit: 'unknown', error: errorMessage(err) };
  }
}
