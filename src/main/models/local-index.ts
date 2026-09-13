import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import { gguf, ggufAllShards, parseGGUFQuantLabel, parseGgufShardFilename } from '@huggingface/gguf';
import type { GgufSummary, ModelSource } from '@shared/types/models';
import { all, get, run, transaction } from '../db/client';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage, safeJsonParse } from '../lib/util';
import { settings } from '../services/settings';
import { paths } from '../system/paths';
import { summarizeGguf, type ParsedShard } from './gguf';

const log = logger('local-index');

export interface LocalModel {
  id: string;
  path: string;
  source: ModelSource;
  publisher?: string;
  repo?: string;
  fileName: string;
  shards: string[];
  mmprojPath?: string;
  sizeBytes: number;
  mtime: number;
  gguf?: GgufSummary;
  ggufError?: string;
  quant?: string;
}

interface Row {
  id: string;
  path: string;
  source: ModelSource;
  publisher: string | null;
  repo: string | null;
  file_name: string;
  shards: string;
  mmproj_path: string | null;
  size_bytes: number;
  mtime: number;
  gguf: string | null;
  gguf_error: string | null;
}

const toModel = (r: Row): LocalModel => ({
  id: r.id,
  path: r.path,
  source: r.source,
  publisher: r.publisher ?? undefined,
  repo: r.repo ?? undefined,
  fileName: r.file_name,
  shards: safeJsonParse<string[]>(r.shards, []),
  mmprojPath: r.mmproj_path ?? undefined,
  sizeBytes: r.size_bytes,
  mtime: r.mtime,
  gguf: safeJsonParse<GgufSummary | undefined>(r.gguf, undefined),
  ggufError: r.gguf_error ?? undefined,
  quant: quantLabelFromName(r.file_name),
});

export const localModelId = (path: string) => createHash('sha1').update(path.toLowerCase()).digest('hex').slice(0, 16);

export function quantLabelFromName(fileName: string): string | undefined {
  const label = parseGGUFQuantLabel(fileName);
  if (!label) return undefined;
  return /(^|[-_.])UD-/i.test(fileName) && !/^UD-/i.test(label) ? `UD-${label}` : label;
}

const AUX_FILE = /(^|[-_.])(mmproj|mtp)([-_.]|$)|^mtp-|^mmproj/i;

interface Root {
  dir: string;
  source: ModelSource;
  layout: 'hf' | 'publisher-repo' | 'flat';
}

interface FoundGroup {
  path: string;
  shards: string[];
  dir: string;
  root: Root;
}

async function walk(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth < 0) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'blobs' || entry.name.startsWith('.')) continue;
      await walk(full, depth - 1, out);
    } else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.toLowerCase().endsWith('.gguf')) {
      out.push(full);
    }
  }
}

function describeLocation(root: Root, file: string): { publisher?: string; repo?: string } {
  const rel = relative(root.dir, file).split(sep);
  if (root.layout === 'hf') {
    const m = rel[0]?.match(/^models--([^-]+(?:-[^-]+)*?)--(.+)$/);
    if (m) return { publisher: m[1], repo: m[2] };
    return {};
  }
  if (root.layout === 'publisher-repo' && rel.length >= 3) return { publisher: rel[0], repo: rel[1] };
  return {};
}

class LocalModelIndex {
  private scanning: Promise<LocalModel[]> | null = null;

  list(): LocalModel[] {
    return all<Row>('SELECT * FROM local_models ORDER BY publisher, repo, file_name').map(toModel);
  }

  get(id: string): LocalModel | undefined {
    const row = get<Row>('SELECT * FROM local_models WHERE id = ?', id);
    return row ? toModel(row) : undefined;
  }

  private roots(): Root[] {
    const s = settings.get();
    const roots: Root[] = [{ dir: s.modelsDir, source: 'cellar', layout: 'publisher-repo' }];
    for (const dir of s.extraModelDirs) roots.push({ dir, source: 'folder', layout: 'flat' });
    if (s.scanHfCache) roots.push({ dir: paths().hfCache, source: 'hf-cache', layout: 'hf' });
    if (s.scanLmStudio) roots.push({ dir: paths().lmStudioModels, source: 'lmstudio', layout: 'publisher-repo' });
    return roots.filter((r) => existsSync(r.dir));
  }

  scan(): Promise<LocalModel[]> {
    if (!this.scanning) {
      this.scanning = this.doScan().finally(() => {
        this.scanning = null;
      });
    }
    return this.scanning;
  }

  private async doScan(): Promise<LocalModel[]> {
    const groups: FoundGroup[] = [];
    const mmprojByDir = new Map<string, string[]>();

    for (const root of this.roots()) {
      const files: string[] = [];
      await walk(root.dir, root.layout === 'hf' ? 5 : 6, files);
      const byPrefix = new Map<string, FoundGroup>();
      for (const file of files) {
        const name = basename(file);
        const dir = dirname(file);
        if (/mmproj/i.test(name)) {
          mmprojByDir.set(dir, [...(mmprojByDir.get(dir) ?? []), file]);
          continue;
        }
        if (AUX_FILE.test(name)) continue;
        const shard = parseGgufShardFilename(name);
        if (shard) {
          const key = join(dir, shard.prefix);
          const group = byPrefix.get(key) ?? { path: '', shards: [], dir, root };
          group.shards.push(file);
          if (Number(shard.shard) === 1) group.path = file;
          byPrefix.set(key, group);
        } else {
          groups.push({ path: file, shards: [file], dir, root });
        }
      }
      for (const group of byPrefix.values()) {
        if (!group.path) continue;
        group.shards.sort();
        groups.push(group);
      }
    }

    // The HF cache can hold the same file in several snapshots; keep the newest copy.
    const unique = new Map<string, FoundGroup & { size: number; mtime: number }>();
    for (const group of groups) {
      let size = 0;
      let mtime = 0;
      for (const shard of group.shards) {
        try {
          const st = await stat(shard);
          size += st.size;
          mtime = Math.max(mtime, Math.round(st.mtimeMs));
        } catch {
          // vanished mid-scan
        }
      }
      if (size === 0) continue;
      const loc = describeLocation(group.root, group.path);
      const key = group.root.layout === 'hf' ? `${loc.publisher}/${loc.repo}/${basename(group.path)}` : group.path.toLowerCase();
      const existing = unique.get(key);
      if (!existing || existing.mtime < mtime) unique.set(key, { ...group, size, mtime });
    }

    const previous = new Map(all<Row>('SELECT * FROM local_models').map((r) => [r.path, r]));
    const toInspect: Array<{ id: string; group: FoundGroup }> = [];
    const seen = new Set<string>();

    transaction(() => {
      for (const group of unique.values()) {
        const id = localModelId(group.path);
        seen.add(id);
        const loc = describeLocation(group.root, group.path);
        const mmproj = pickMmproj(mmprojByDir.get(group.dir) ?? []);
        const prior = previous.get(group.path);
        const unchanged = prior && prior.size_bytes === group.size && prior.mtime === group.mtime && (prior.gguf || prior.gguf_error);
        run(
          `INSERT INTO local_models (id, path, source, publisher, repo, file_name, shards, mmproj_path, size_bytes, mtime, gguf, gguf_error, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET path = excluded.path, source = excluded.source, publisher = excluded.publisher, repo = excluded.repo,
             file_name = excluded.file_name, shards = excluded.shards, mmproj_path = excluded.mmproj_path, size_bytes = excluded.size_bytes,
             mtime = excluded.mtime, gguf = excluded.gguf, gguf_error = excluded.gguf_error, updated_at = excluded.updated_at`,
          id,
          group.path,
          group.root.source,
          loc.publisher,
          loc.repo,
          basename(group.path),
          JSON.stringify(group.shards),
          mmproj,
          group.size,
          group.mtime,
          unchanged ? prior.gguf : null,
          unchanged ? prior.gguf_error : null,
          Date.now(),
        );
        if (!unchanged) toInspect.push({ id, group });
      }
      for (const row of previous.values()) {
        if (!seen.has(row.id)) run('DELETE FROM local_models WHERE id = ?', row.id);
      }
    });

    bus.emit('models:changed', { reason: 'scan' });

    // Header inspection is slower; do it after publishing the file list.
    const queue = [...toInspect];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const { summary, error } = await inspectLocalGguf(item.group.path, item.group.shards.length > 1);
        run('UPDATE local_models SET gguf = ?, gguf_error = ? WHERE id = ?', summary ? JSON.stringify(summary) : null, error ?? null, item.id);
      }
    };
    if (queue.length) {
      await Promise.all([worker(), worker()]);
      bus.emit('models:changed', { reason: 'inspect' });
    }
    return this.list();
  }

  async deleteFiles(id: string): Promise<void> {
    const model = this.get(id);
    if (!model) return;
    if (model.source !== 'cellar' && model.source !== 'folder') {
      throw new Error(model.source === 'hf-cache' ? 'This file lives in the Hugging Face cache. Remove it with `hf cache` instead.' : 'This file is managed by LM Studio.');
    }
    for (const shard of model.shards) await rm(shard, { force: true });
    const siblings = this.list().filter((m) => m.id !== id && m.mmprojPath === model.mmprojPath);
    if (model.mmprojPath && siblings.length === 0) await rm(model.mmprojPath, { force: true });
    run('DELETE FROM local_models WHERE id = ?', id);
    bus.emit('models:changed', { reason: 'delete' });
  }
}

/** Prefer an F16 projector, then the smallest name (usually Q8_0). */
function pickMmproj(files: string[]): string | null {
  if (files.length === 0) return null;
  const sorted = [...files].sort((a, b) => {
    const score = (f: string) => (/f16/i.test(f) ? 0 : /bf16/i.test(f) ? 1 : /q8/i.test(f) ? 2 : 3);
    return score(a) - score(b) || a.length - b.length;
  });
  return sorted[0];
}

export async function inspectLocalGguf(path: string, sharded: boolean): Promise<{ summary?: GgufSummary; error?: string }> {
  try {
    if (sharded) {
      const out = await ggufAllShards(path, { allowLocalFile: true });
      const shards: ParsedShard[] = out.shards.map((s) => ({
        metadata: s.metadata as unknown as Record<string, unknown>,
        tensorInfos: s.tensorInfos.map((t) => ({ name: t.name, shape: t.shape, dtype: t.dtype })),
      }));
      return { summary: summarizeGguf(shards, out.parameterCount) };
    }
    const out = await gguf(path, { allowLocalFile: true, computeParametersCount: true });
    return {
      summary: summarizeGguf(
        [{ metadata: out.metadata as unknown as Record<string, unknown>, tensorInfos: out.tensorInfos.map((t) => ({ name: t.name, shape: t.shape, dtype: t.dtype })) }],
        out.parameterCount,
      ),
    };
  } catch (err) {
    log.warn('gguf inspect failed', path, err);
    return { error: errorMessage(err) };
  }
}

export const localModels = new LocalModelIndex();
