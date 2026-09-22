/**
 * Semantic search for project knowledge. With an embedding model chosen in Settings → Models, every chunk
 * of a project's files is embedded (llama.cpp `--embedding`, Ollama `/api/embed`, or an OpenAI-compatible
 * `/v1/embeddings`), and retrieval fuses vector similarity with the BM25 keyword ranking.
 */
import type { ProjectIndexStatus } from '@shared/types/chat';
import { modelKey, type ModelEntry, type ModelRef } from '@shared/types/models';
import { all, get, run, transaction } from '../db/client';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage } from '../lib/util';
import { providers } from '../providers/registry';
import { settings } from '../services/settings';

const log = logger('rag');
const BATCH = 16;
/** Characters sent per chunk; longer chunks are cut (models truncate anyway). */
const MAX_CHUNK_CHARS = 6000;

export function toBlob(vector: number[]): Uint8Array {
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] / norm;
  return new Uint8Array(out.buffer);
}

export function fromBlob(blob: Uint8Array): Float32Array {
  const copy = new Uint8Array(blob.byteLength);
  copy.set(blob);
  return new Float32Array(copy.buffer);
}

export function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

/** Compute cosine similarity between two vectors (assumes same length, no null checks). */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** L2-normalize a vector in-place and return it. Returns a new array if one is not available. */
export function normalizeVector(vector: number[]): Float32Array {
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] / norm;
  return out;
}

/** Task prefixes some embedding models are trained with. */
export function embeddingPrefixes(modelId: string): { document: string; query: string } {
  const id = modelId.toLowerCase();
  if (id.includes('nomic')) return { document: 'search_document: ', query: 'search_query: ' };
  if (/(^|[^a-z])e5[-_]/.test(id)) return { document: 'passage: ', query: 'query: ' };
  if (id.includes('mxbai') || id.includes('bge')) return { document: '', query: 'Represent this sentence for searching relevant passages: ' };
  return { document: '', query: '' };
}

/** Reciprocal rank fusion of several rankings (lists of keys, best first). */
export function fuseRankings(rankings: string[][], k = 60): string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) ranking.forEach((key, i) => scores.set(key, (scores.get(key) ?? 0) + 1 / (k + i + 1)));
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
}

interface ChunkRow {
  rowid: number;
  content: string;
  file_id: string;
  ord: number;
}

class EmbeddingIndex {
  private jobs = new Map<string, Promise<void>>();
  private errors = new Map<string, string>();

  private async model(): Promise<ModelEntry | null> {
    const ref = settings.get().embeddingModel;
    if (!ref) return null;
    const entry = await providers.findModel(ref);
    if (!entry) throw new Error('The embedding model is not available. Check that its app is running, or choose another one in Settings → Models.');
    if (!entry.capabilities.embedding) throw new Error(`${entry.displayName} is not an embedding model.`);
    return entry;
  }

  private async embed(entry: ModelEntry, texts: string[], signal?: AbortSignal): Promise<number[][]> {
    const provider = providers.get(entry.ref.providerId);
    if (!provider.embed) throw new Error(`${provider.name} cannot create embeddings.`);
    return provider.embed(entry, texts, signal);
  }

  status(projectId: string): ProjectIndexStatus {
    const ref: ModelRef | null = settings.get().embeddingModel;
    const chunks = get<{ n: number }>('SELECT COUNT(*) AS n FROM project_chunks WHERE project_id = ?', projectId)?.n ?? 0;
    if (!ref) return { projectId, model: null, chunks, embedded: 0, state: 'off' };
    const embedded = get<{ n: number }>('SELECT COUNT(*) AS n FROM project_vectors WHERE project_id = ? AND model = ?', projectId, modelKey(ref))?.n ?? 0;
    const error = this.errors.get(projectId);
    const state: ProjectIndexStatus['state'] = this.jobs.has(projectId) ? 'indexing' : error ? 'error' : embedded >= chunks ? 'ready' : 'partial';
    return { projectId, model: ref, chunks, embedded: Math.min(embedded, chunks), state, message: error };
  }

  private emit(projectId: string): void {
    bus.emit('projects:index', this.status(projectId));
  }

  /** Embed the chunks that have no vector for the current model yet (runs once per project at a time). */
  index(projectId: string): Promise<void> {
    const running = this.jobs.get(projectId);
    if (running) return running;
    const job = (async () => {
      this.errors.delete(projectId);
      try {
        const entry = await this.model();
        if (!entry) return;
        const key = modelKey(entry.ref);
        const prefix = embeddingPrefixes(entry.ref.modelId).document;
        run('DELETE FROM project_vectors WHERE project_id = ? AND model = ? AND file_id NOT IN (SELECT id FROM project_files WHERE project_id = ?)', projectId, key, projectId);
        const missing = all<ChunkRow>(
          `SELECT c.rowid, c.content, c.file_id, c.ord FROM project_chunks c
           WHERE c.project_id = ? AND NOT EXISTS (SELECT 1 FROM project_vectors v WHERE v.file_id = c.file_id AND v.ord = c.ord AND v.model = ?)`,
          projectId,
          key,
        );
        for (let i = 0; i < missing.length; i += BATCH) {
          const batch = missing.slice(i, i + BATCH);
          const vectors = await this.embed(entry, batch.map((c) => `${prefix}${c.content.slice(0, MAX_CHUNK_CHARS)}`));
          transaction(() => {
            batch.forEach((chunk, j) => {
              run('INSERT OR REPLACE INTO project_vectors (file_id, project_id, ord, model, dims, vector) VALUES (?, ?, ?, ?, ?, ?)', chunk.file_id, projectId, chunk.ord, key, vectors[j].length, toBlob(vectors[j]));
            });
          });
          this.emit(projectId);
        }
      } catch (err) {
        this.errors.set(projectId, errorMessage(err));
        log.warn('indexing failed', projectId, errorMessage(err));
      } finally {
        this.jobs.delete(projectId);
        this.emit(projectId);
      }
    })();
    this.jobs.set(projectId, job);
    this.emit(projectId);
    return job;
  }

  /** Re-embed everything (after changing the model, or to recover from errors). */
  reindex(projectId: string): Promise<void> {
    const ref = settings.get().embeddingModel;
    if (ref && !this.jobs.has(projectId)) run('DELETE FROM project_vectors WHERE project_id = ? AND model = ?', projectId, modelKey(ref));
    return this.index(projectId);
  }

  /**
   * Chunk ids (`file_id:ord`) ranked by meaning. Empty when no embedding model is set or nothing is
   * indexed yet (missing chunks are indexed in the background for next time).
   */
  async search(projectId: string, query: string, limit = 40): Promise<string[]> {
    const ref = settings.get().embeddingModel;
    if (!ref || !query.trim()) return [];
    const key = modelKey(ref);
    const rows = all<{ file_id: string; ord: number; vector: Uint8Array }>('SELECT file_id, ord, vector FROM project_vectors WHERE project_id = ? AND model = ?', projectId, key);
    const status = this.status(projectId);
    if (status.embedded < status.chunks && !this.jobs.has(projectId)) void this.index(projectId);
    if (rows.length === 0) return [];
    try {
      const entry = await this.model();
      if (!entry) return [];
      const [vector] = await this.embed(entry, [`${embeddingPrefixes(entry.ref.modelId).query}${query.slice(0, MAX_CHUNK_CHARS)}`]);
      const q = fromBlob(toBlob(vector));
      return rows
        .map((r) => ({ key: `${r.file_id}:${r.ord}`, score: dot(q, fromBlob(r.vector)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((r) => r.key);
    } catch (err) {
      log.warn('semantic search failed', errorMessage(err));
      return [];
    }
  }
}

export const embeddingIndex = new EmbeddingIndex();

/**
 * Generate an embedding for a memory topic (called asynchronously, never blocks).
 * Stores the vector in memory_vectors table. Used when topics are created/updated.
 */
export async function embedTopicAsync(topicId: string, title: string, content: string): Promise<void> {
  const ref = settings.get().embeddingModel;
  if (!ref) return;

  try {
    const entry = await providers.findModel(ref);
    if (!entry || !entry.capabilities.embedding || !entry.loaded) return;

    const provider = providers.get(entry.ref.providerId);
    if (!provider.embed) return;

    const prefix = embeddingPrefixes(entry.ref.modelId).document;
    const textToEmbed = `${prefix}${title}: ${content}`.slice(0, 2048);

    const vectors = await provider.embed(entry, [textToEmbed]);
    if (!vectors.length || !vectors[0].length) return;

    const vector = vectors[0];
    const key = modelKey(ref);
    const now = Date.now();

    run(
      'INSERT OR REPLACE INTO memory_vectors (topic_id, model, dims, vector, updated_at) VALUES (?, ?, ?, ?, ?)',
      topicId, key, vector.length, toBlob(vector), now,
    );
  } catch (err) {
    log.warn('embedding generation failed for topic', topicId, String(err));
  }
}
