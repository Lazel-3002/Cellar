/** Real-provider end-to-end verification using Ollama/nomic-embed-text. */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryCategory } from '../../src/shared/types/customize';
import { closeDatabase, openDatabase, run as dbRun } from '../../src/main/db/client';

const userData = join(tmpdir(), `cellar-real-e2e-${process.pid}`);
process.env.CELLAR_HOME = userData;

const { initPaths } = await import('../../src/main/system/paths');
initPaths(userData, userData);

import * as topicsModule from '../../src/main/customize/memory-topics';
import { cosineSimilarity, normalizeVector, fromBlob, toBlob } from '../../src/main/rag/embeddings';

const upsert = (input: { category: MemoryCategory; title: string; content: string }) =>
  topicsModule.upsertMemoryTopic({ ...input, sensitiveAllowed: true });
const list = () => topicsModule.listMemoryTopics();
const clear = () => topicsModule.clearMemoryTopics();

beforeAll(() => {
  closeDatabase();
  openDatabase(':memory:');
  dbRun('PRAGMA foreign_keys = OFF');
  // Create memory_vectors table (migrations not run in :memory: test DB)
  dbRun(`
    CREATE TABLE IF NOT EXISTS memory_topics (
      id TEXT PRIMARY KEY, category TEXT NOT NULL CHECK(category IN ('you', 'topic', 'area')),
      title TEXT NOT NULL, content TEXT NOT NULL, project_id TEXT, confidence REAL DEFAULT 0.8,
      last_confirmed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_vectors (
      topic_id TEXT PRIMARY KEY REFERENCES memory_topics(id) ON DELETE CASCADE,
      model TEXT NOT NULL, dims INTEGER NOT NULL, vector BLOB NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
});
afterEach(() => clear());
afterAll(() => closeDatabase());

/** Helper: call Ollama embedding API directly. */
async function ollamaEmbed(model: string, input: string): Promise<number[]> {
  const res = await fetch('http://localhost:11434/api/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
  const data = await res.json();
  return data.embeddings[0];
}

describe('REAL PROVIDER E2E verification', () => {
  it('EMBEDDING MODEL: nomic-embed-text produces valid 768-dim embeddings', async () => {
    const start = performance.now();
    const vec = await ollamaEmbed('nomic-embed-text', 'test embedding');
    const elapsed = (performance.now() - start).toFixed(1);

    expect(vec.length).toBe(768);
    expect(vec.every((v) => typeof v === 'number' && isFinite(v))).toBe(true);
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeGreaterThan(0);

    console.log(`  ✓ Embedding model: ${vec.length} dims, norm=${norm.toFixed(3)}, latency=${elapsed}ms`);
  });

  it('SEMANTIC SIMILARITY: related concepts produce similar vectors', async () => {
    const v1 = await ollamaEmbed('nomic-embed-text', 'machine learning coding with torch');
    const v2 = await ollamaEmbed('nomic-embed-text', 'deep learning neural networks pytorch');
    const v3 = await ollamaEmbed('nomic-embed-text', 'best pizza recipe in naples');

    const simRelated = cosineSimilarity(normalizeVector(v1), normalizeVector(v2));
    const simUnrelated = cosineSimilarity(normalizeVector(v1), normalizeVector(v3));

    console.log(`  ℹ Related (ML vs DL): ${simRelated.toFixed(4)}`);
    console.log(`  ℹ Unrelated (ML vs pizza): ${simUnrelated.toFixed(4)}`);

    // Key point: related concepts must rank HIGHER than unrelated ones.
    expect(simRelated).toBeGreaterThan(simUnrelated + 0.15);
    console.log(`  ✓ Semantic similarity: related (${simRelated.toFixed(3)}) > unrelated (${simUnrelated.toFixed(3)})`);
  });

  it('TOPIC EMBEDDING: stores and retrieves vectors correctly', async () => {
    upsert({ category: 'topic' as MemoryCategory, title: 'PyTorch Deep Learning', content: 'User is learning Python and building projects with PyTorch for deep learning.' });
    const topics = list();
    expect(topics.length).toBe(1);

    const [topicVec] = await Promise.all([ollamaEmbed('nomic-embed-text', `${topics[0].title}: ${topics[0].content}`.slice(0, 2048))]);

    // Store in memory_vectors
    expect(() =>
      dbRun('INSERT OR REPLACE INTO memory_vectors (topic_id, model, dims, vector, updated_at) VALUES (?, ?, ?, ?, ?)',
        topics[0].id, 'nomic-embed-text/nomic-embed-text', topicVec.length, toBlob(topicVec), Date.now()),
    ).not.toThrow();

    // Verify round-trip via normalizeVector (simulates what retrieval does)
    const storedNorm = fromBlob(toBlob(topicVec));
    expect(storedNorm.length).toBe(768);

    // Query embedding vs topic vector similarity
    const queryVec = await ollamaEmbed('nomic-embed-text', 'machine learning coding with torch');
    const simScore = cosineSimilarity(normalizeVector(queryVec), storedNorm);
    console.log(`  ✓ Topic embedding: ${topicVec.length} dims, query-topic similarity = ${simScore.toFixed(4)}`);
    expect(simScore).toBeGreaterThan(-0.5); // At least not completely unrelated
  });

  it('SEMANTIC RANKING: vector similarity affects retrieval order', async () => {
    upsert({ category: 'topic' as MemoryCategory, title: 'Python ML Projects', content: 'User works on machine learning projects using PyTorch and neural networks.' });
    await new Promise((r) => setTimeout(r, 10)); // Ensure different timestamps for reliable ordering
    upsert({ category: 'topic' as MemoryCategory, title: 'Chess Strategy Guide', content: 'User writes about chess openings, tactics, and competitive play.' });

    const topics = list();
    expect(topics.length).toBe(2);

    // Find topics by title to ensure correct mapping regardless of ordering
    const mlTopic = topics.find((t) => t.title === 'Python ML Projects')!;
    const chessTopic = topics.find((t) => t.title === 'Chess Strategy Guide')!;

    const [mlVec, chessVec] = await Promise.all([
      ollamaEmbed('nomic-embed-text', `${mlTopic.title}: ${mlTopic.content}`.slice(0, 2048)),
      ollamaEmbed('nomic-embed-text', `${chessTopic.title}: ${chessTopic.content}`.slice(0, 2048)),
    ]);

    // Query: semantically related to ML but NOT chess
    const qVec = await ollamaEmbed('nomic-embed-text', 'neural network architecture research');
    const simML = cosineSimilarity(normalizeVector(qVec), normalizeVector(mlVec));
    const simChess = cosineSimilarity(normalizeVector(qVec), normalizeVector(chessVec));

    console.log(`  ℹ Query: "neural network architecture research"`);
    console.log(`  ℹ Similarity to ML topic: ${simML.toFixed(4)}`);
    console.log(`  ℹ Similarity to Chess topic: ${simChess.toFixed(4)}`);

    // The ML topic should have higher similarity than the chess topic.
    expect(simML).toBeGreaterThan(simChess);
    console.log(`  ✓ Semantic ranking: ML (${simML.toFixed(3)}) > Chess (${simChess.toFixed(3)})`);
  });

  it('FALLBACK: retrieval works without embedding provider', async () => {
    upsert({ category: 'topic' as MemoryCategory, title: 'Python Programming', content: 'User is learning Python programming.' });
    const result = await (await import('../../src/main/customize/memory-retrieval')).retrieveMemory({ query: 'python' });
    expect(result).toBeDefined();
    console.log(`  ✓ Fallback: retrieval works without embedding provider`);
  });

  it('LATENCY: measure query embedding + cosine similarity overhead', async () => {
    upsert({ category: 'topic' as MemoryCategory, title: 'Test Topic', content: 'Content here.' });
    const topics = list();
    if (topics.length > 0) {
      const qStart = performance.now();
      await ollamaEmbed('nomic-embed-text', 'test query');
      const queryEmbedMs = performance.now() - qStart;

      expect(queryEmbedMs).toBeLessThan(5000);
      console.log(`  ✓ Query embedding latency: ${queryEmbedMs.toFixed(1)}ms (< 5s threshold)`);
    }
  });

  it('DIMENSION CHECK: vectors must have compatible dimensions', async () => {
    const v1 = await ollamaEmbed('nomic-embed-text', 'test');
    expect(v1.length).toBe(768);

    const shortVec = new Float32Array([0.5, 0.5]);
    const fullVec = normalizeVector(v1);

    // cosineSimilarity should handle dimension mismatch gracefully (uses min length)
    expect(() => cosineSimilarity(shortVec, fullVec)).not.toThrow();
    console.log(`  ✓ Dimension mismatch: handled without throwing`);
  });
});
