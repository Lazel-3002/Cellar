/**
 * Finding pages in a book: BM25 over the page text, fused with meaning-based search when an
 * embedding model is chosen in Settings → Models (the same model project knowledge uses).
 * Pages are embedded in the background, once, the first time a book is searched.
 */
import { modelKey } from '@shared/types/models';
import type { StudyPageHit } from '@shared/types/study';
import { all, get, run, transaction } from '../db/client';
import { logger } from '../lib/log';
import { errorMessage } from '../lib/util';
import { providers } from '../providers/registry';
import { dot, embeddingPrefixes, fromBlob, fuseRankings, toBlob } from '../rag/embeddings';
import { settings } from '../services/settings';
import { keywordSearch } from './store';

const log = logger('study');
const BATCH = 8;
const MAX_PAGE_CHARS = 4000;
const jobs = new Map<string, Promise<void>>();

async function embeddingModel() {
  const ref = settings.get().embeddingModel;
  if (!ref) return null;
  const entry = await providers.findModel(ref);
  if (!entry || !entry.capabilities.embedding) return null;
  const provider = providers.get(entry.ref.providerId);
  return provider.embed ? { entry, provider, key: modelKey(entry.ref) } : null;
}

/** Embeds the pages that have no vector for the current model yet (one job per book at a time). */
export function indexBook(bookId: string): Promise<void> {
  const running = jobs.get(bookId);
  if (running) return running;
  const job = (async () => {
    try {
      const model = await embeddingModel();
      if (!model) return;
      const prefix = embeddingPrefixes(model.entry.ref.modelId).document;
      const missing = all<{ page: number; text: string }>(
        `SELECT p.page, p.text FROM book_pages p
         WHERE p.book_id = ? AND length(trim(p.text)) > 0 AND NOT EXISTS (SELECT 1 FROM book_vectors v WHERE v.book_id = p.book_id AND v.page = p.page AND v.model = ?)
         ORDER BY p.page`,
        bookId,
        model.key,
      );
      for (let i = 0; i < missing.length; i += BATCH) {
        const batch = missing.slice(i, i + BATCH);
        const vectors = await model.provider.embed!(model.entry, batch.map((row) => `${prefix}${row.text.slice(0, MAX_PAGE_CHARS)}`));
        if (!get('SELECT 1 FROM books WHERE id = ?', bookId)) return;
        transaction(() => {
          batch.forEach((row, j) => {
            if (vectors[j]?.length) run('INSERT OR REPLACE INTO book_vectors (book_id, page, model, dims, vector) VALUES (?, ?, ?, ?, ?)', bookId, row.page, model.key, vectors[j].length, toBlob(vectors[j]));
          });
        });
      }
    } catch (err) {
      log.warn('book indexing failed', bookId, errorMessage(err));
    } finally {
      jobs.delete(bookId);
    }
  })();
  jobs.set(bookId, job);
  return job;
}

async function semanticSearch(bookId: string, query: string, limit: number): Promise<number[]> {
  const model = await embeddingModel().catch(() => null);
  if (!model || !query.trim()) return [];
  const rows = all<{ page: number; vector: Uint8Array }>('SELECT page, vector FROM book_vectors WHERE book_id = ? AND model = ?', bookId, model.key);
  const pages = get<{ n: number }>("SELECT COUNT(*) AS n FROM book_pages WHERE book_id = ? AND length(trim(text)) > 0", bookId)?.n ?? 0;
  if (rows.length < pages) void indexBook(bookId);
  if (rows.length === 0) return [];
  try {
    const [vector] = await model.provider.embed!(model.entry, [`${embeddingPrefixes(model.entry.ref.modelId).query}${query.slice(0, 2000)}`]);
    const q = fromBlob(toBlob(vector));
    return rows
      .map((row) => ({ page: Number(row.page), score: dot(q, fromBlob(row.vector)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((row) => row.page);
  } catch (err) {
    log.warn('semantic book search failed', errorMessage(err));
    return [];
  }
}

/** Pages that best answer a query, best first. */
export async function searchBook(bookId: string, query: string, limit = 8): Promise<StudyPageHit[]> {
  const keyword = keywordSearch(bookId, query, 30);
  const semantic = await semanticSearch(bookId, query, 30);
  const snippets = new Map(keyword.map((hit) => [hit.page, hit.snippet]));
  const ranked = semantic.length ? fuseRankings([keyword.map((hit) => String(hit.page)), semantic.map(String)]).map(Number) : keyword.map((hit) => hit.page);
  return ranked.slice(0, limit).map((page) => {
    let snippet = snippets.get(page);
    if (!snippet) {
      const text = get<{ text: string }>('SELECT text FROM book_pages WHERE book_id = ? AND page = ?', bookId, page)?.text ?? '';
      snippet = text.replace(/\s+/g, ' ').trim().slice(0, 180);
    }
    return { page, snippet };
  });
}
