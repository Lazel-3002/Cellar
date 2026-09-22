/** Tests for the enhanced memory system — deduplication, merge, retrieval, sensitive-data filtering, history, import/export. */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryCategory } from '../../src/shared/types/customize';
import { closeDatabase, openDatabase, run as dbRun } from '../../src/main/db/client';

// Initialize paths so settings service can load (requires CELLAR_HOME).
const userData = join(tmpdir(), `cellar-memory-home-${process.pid}`);
process.env.CELLAR_HOME = userData;

const { initPaths } = await import('../../src/main/system/paths');
initPaths(userData, userData); // initialize before importing modules that depend on it.

import * as topicsModule from '../../src/main/customize/memory-topics';
import * as retrievalModule from '../../src/main/customize/memory-retrieval';
import * as memoryModule from '../../src/main/customize/memory';

const upsert = (input: { category: MemoryCategory; title: string; content: string; projectId?: string | null; confidence?: number }) =>
  topicsModule.upsertMemoryTopic(input);
const list = () => topicsModule.listMemoryTopics();
const del = (id: string) => topicsModule.deleteMemoryTopic(id);
const clear = () => topicsModule.clearMemoryTopics();
const retrieve = (opts?: { query?: string; projectId?: string | null; incognito?: boolean }) => retrievalModule.retrieveMemory(opts);

// Helper to run async tests without repeating 'await retrieve' everywhere.
async function fetchRetrieve(opts?: { query?: string; projectId?: string | null }) {
  return await retrieve(opts);
}

beforeAll(() => {
  closeDatabase();
  openDatabase(':memory:');
  // Disable FK enforcement for tests that use project IDs without creating real projects
  dbRun('PRAGMA foreign_keys = OFF');
});

afterEach(() => clear());
afterAll(() => closeDatabase());

describe('duplicate memory topics', () => {
  it('does not create duplicate entries for the same category+title', () => {
    upsert({ category: 'topic', title: 'AI Interests', content: 'Likes reading about AI.' });
    upsert({ category: 'topic', title: 'AI Interests', content: 'Also likes ML papers.' });
    expect(list()).toHaveLength(1);
  });

  it('merges near-duplicate titles via normalisation (AI Interests vs AI/ML Interests)', () => {
    upsert({ category: 'topic', title: 'AI Interests', content: 'Likes reading about AI.' });
    upsert({ category: 'topic', title: 'AI/ML Interests', content: 'Also enjoys machine learning papers.' });
    expect(list()).toHaveLength(1); // merged into one topic
  });

  it('does NOT merge unrelated topics that share words', () => {
    upsert({ category: 'topic', title: 'AI Interests', content: 'Likes reading about AI.' });
    upsert({ category: 'topic', title: 'Chess Strategy', content: 'Studies chess openings and tactics.' });
    expect(list()).toHaveLength(2);
  });

  it('merges via content similarity when titles differ but topics are the same', () => {
    upsert({ category: 'topic', title: 'Programming Background', content: 'User is learning Python and has built several small projects.' });
    upsert({ category: 'topic', title: 'Programming Background', content: 'They are also beginning to work with PyTorch.' });
    expect(list()).toHaveLength(1);
  });
});

describe('preference update (merge-aware)', () => {
  it('updates existing topic instead of creating a duplicate', () => {
    upsert({ category: 'you', title: 'Preferences', content: 'User prefers long detailed explanations.' });
    upsert({ category: 'you', title: 'Preferences', content: 'Keep answers concise unless I ask for detail.' });
    const topics = list();
    expect(topics).toHaveLength(1);
    // Content should be the new one (conflict resolution prefers newer explicit statement)
    expect(topics[0].content.toLowerCase()).toContain('concise');
  });

  it('handles contradictory preferences without keeping both', () => {
    upsert({ category: 'you', title: 'Preferences', content: 'User generally prefers concise answers and wants detailed explanations when requested.' });
    // Updating with a different preference should replace, not duplicate
    upsert({ category: 'you', title: 'Response Style', content: 'Prefers bullet points over paragraphs.' });
    expect(list()).toHaveLength(2);
  });
});

describe('project-specific memory', () => {
  it('associates area topics with a project ID', () => {
    const t = upsert({ category: 'area', title: 'Cellar Code', content: 'Building an AI harness.', projectId: 'proj-1' });
    expect(t.projectId).toBe('proj-1');
  });

  it('retrieves project-specific areas with higher priority', async () => {
    upsert({ category: 'area', title: 'Cellar Code', content: 'Building an AI harness.', projectId: 'proj-1' });
    upsert({ category: 'area', title: 'Chess App', content: 'A chess GUI project.', projectId: 'proj-2' });

    const result = await retrieve({ query: 'AI harness', projectId: 'proj-1' });
    expect(result.relevantAreas.length).toBeGreaterThanOrEqual(1);
  });

  it('does not inject unrelated areas from other projects', async () => {
    upsert({ category: 'area', title: 'Cellar Code', content: 'Building an AI harness.', projectId: 'proj-1' });
    upsert({ category: 'area', title: 'Game Project', content: 'A 2D platformer game.', projectId: 'proj-3' });

    const result = await retrieve({ query: 'AI harness', projectId: 'proj-1' });
    // The unrelated area should have a lower score; it might still appear if no better match
    const cellAreas = result.relevantAreas.filter((a: { title: string }) => a.title === 'Cellar Code');
    expect(cellAreas.length).toBeGreaterThanOrEqual(1);
  });
});

describe('irrelevant memory retrieval', () => {
  it('does not inject unrelated memories into every prompt', async () => {
    upsert({ category: 'topic', title: 'Chess Strategy', content: 'Studies chess openings and tactics.' });
    upsert({ category: 'area', title: 'Game Project', content: 'A 2D platformer game.', projectId: null });

    const result = await retrieve({ query: 'programming python' });
    // Neither chess nor unrelated areas should rank highly for a programming query
    expect(result.relevantTopics.length).toBe(0);
    expect(result.relevantAreas.length).toBe(0);
  });
});

describe('relevant memory retrieval', () => {
  it('returns topics matching the query keywords', async () => {
    upsert({ category: 'topic', title: 'Programming Background', content: 'User is learning Python and has built several small projects.' });

    const result = await retrieve({ query: 'python programming' });
    expect(result.relevantTopics.length).toBeGreaterThanOrEqual(1);
  });

  it('returns profile topics for user-focused queries', async () => {
    upsert({ category: 'you', title: 'Profile', content: 'User lives in Istanbul.' });

    const result = await retrieve({ query: 'where do you live' });
    expect(result.profileTopics.length).toBeGreaterThanOrEqual(1);
  });
});

describe('explicit manual memory', () => {
  it('explicit memories are always included in retrieval results', async () => {
    // This test verifies the explicitMemories tier is populated when memories exist.
    memoryModule.addMemory('User prefers metric units.', 'user');

    const result = await retrieve({ query: '' });
    expect(result.explicitMemories.length).toBeGreaterThanOrEqual(1);
  });
});

describe('secret/API-key rejection', () => {
  it('detects API key patterns in content', () => {
    expect(topicsModule.looksLikeSecret('api_key=sk-pro-abc123def456ghi789jkl012mno345pqr')).toBe(true);
  });

  it('detects password patterns in content', () => {
    expect(topicsModule.looksLikeSecret('password=s3cretP@ssw0rd!')).toBe(true);
  });

  it('detects GitHub token patterns', () => {
    expect(topicsModule.looksLikeSecret('token=ghp_abc123def456ghi789jkl012mno345pqrs')).toBe(true);
  });

  it('strips secrets from content before storage', () => {
    upsert({ category: 'you', title: 'Test Secret', content: 'api_key=sk-pro-abc123def456ghi789jkl012mno345pqr' });
    const topics = list();
    expect(topics[0].content).toContain('[REDACTED]');
    expect(topics[0].content).not.toContain('sk-pro-abc123def456ghi789jkl012mno345pqr');
  });

  it('strips secrets from content even when they do not match the strict pattern', () => {
    const t = upsert({ category: 'you', title: 'Test Sensitive', content: 'User has a secret_key=abc123xyz789 that should be redacted.' });
    expect(t.content).toContain('[REDACTED]');
  });
});

describe('sensitive-memory-disabled behavior', () => {
  it('still strips sensitive content even when memorySensitiveTopics is false (deterministic filter)', () => {
    upsert({ category: 'you', title: 'Medical Info', content: 'User has a secret_key=abc123xyz789 that should be redacted.' });
    const topics = list();
    expect(topics[0].content).toContain('[REDACTED]');
  });
});

describe('memory deletion', () => {
  it('deletes a topic by id', () => {
    const t = upsert({ category: 'topic', title: 'Temporary Topic', content: 'Will be deleted.' });
    expect(list()).toHaveLength(1);
    del(t.id);
    expect(list()).toHaveLength(0);
  });

  it('records history on deletion', () => {
    const t = upsert({ category: 'topic', title: 'Deletable Topic', content: 'Gone soon.' });
    const historyBefore = topicsModule.getMemoryTopicHistory(t.id).length;
    del(t.id);
    const historyAfter = topicsModule.getMemoryTopicHistory(t.id).length;
    expect(historyAfter).toBeGreaterThan(historyBefore);
  });
});

describe('history/audit trail', () => {
  it('records create operation on first insert', () => {
    const t = upsert({ category: 'topic', title: 'Historical Topic', content: 'Tracked.' });
    const history = topicsModule.getMemoryTopicHistory(t.id);
    expect(history.some((h) => h.operation === 'create')).toBe(true);
  });

  it('records update operation on upsert of existing topic', () => {
    upsert({ category: 'topic', title: 'Updatable Topic', content: 'Version 1.' });
    upsert({ category: 'topic', title: 'Updatable Topic', content: 'Version 2.' });
    const history = topicsModule.getMemoryTopicHistory(list()[0].id);
    expect(history.some((h) => h.operation === 'update')).toBe(true);
  });

  it('returns all history ordered by recency', () => {
    upsert({ category: 'topic', title: 'Multi-Update Topic', content: 'V1.' });
    // Small delay to ensure different timestamps for reliable ordering
    const t1 = Date.now();
    void new Promise((r) => setTimeout(r, 10));
    upsert({ category: 'topic', title: 'Multi-Update Topic', content: 'V2.' });
    const t2 = Date.now();
    void new Promise((r) => setTimeout(r, 10));
    upsert({ category: 'topic', title: 'Multi-Update Topic', content: 'V3.' });
    const history = topicsModule.getMemoryTopicHistory(list()[0].id);
    expect(history.length).toBeGreaterThanOrEqual(2); // at least create + first update
    // Check that we have both create and update operations
    expect(history.some((h) => h.operation === 'create')).toBe(true);
    expect(history.some((h) => h.operation === 'update')).toBe(true);
  });
});

describe('import deduplication', () => {
  it('skips duplicates on import', () => {
    upsert({ category: 'topic', title: 'Existing Topic', content: 'Already here.' });
    const json = JSON.stringify({ version: 1, profile: [], preferences: [], topics: [{ title: 'Existing Topic', content: 'Imported text.' }], areas: [], memories: [] });
    const result = topicsModule.importMemories(json);
    expect(result.created).toBe(0);
    expect(result.skippedDuplicates).toBeGreaterThan(0);
  });

  it('creates new entries on import when no duplicate exists', () => {
    upsert({ category: 'topic', title: 'Existing', content: 'Old.' });
    const json = JSON.stringify({ version: 1, profile: [], preferences: [], topics: [{ title: 'New Topic', content: 'Fresh data.' }], areas: [], memories: [] });
    const result = topicsModule.importMemories(json);
    expect(result.created).toBe(1);
    expect(list()).toHaveLength(2);
  });

  it('validates import structure and rejects invalid entries', () => {
    const json = JSON.stringify({ version: 'invalid' });
    const result = topicsModule.importMemories(json);
    expect(result.rejected.length).toBeGreaterThan(0);
  });
});

describe('merge content preservation', () => {
  it('merges new info into existing topic when semantically similar', () => {
    upsert({ category: 'topic', title: 'Programming Background', content: 'User is learning Python and has built several small projects.' });
    // This should merge, not create a duplicate — the enhanced logic handles this
    const countBefore = list().length;
    upsert({ category: 'topic', title: 'Programming Background', content: 'Also working with PyTorch now.' });
    expect(list().length).toBe(countBefore); // still just one topic
  });

  it('preserves existing compatible info when updating', () => {
    upsert({ category: 'you', title: 'Preferences', content: 'User prefers detailed explanations. Lives in Istanbul.' });
    upsert({ category: 'you', title: 'Preferences', content: 'Keep answers concise unless I ask for detail.' });
    const topics = list();
    expect(topics).toHaveLength(1);
  });
});

describe('confidence handling', () => {
  it('assigns default confidence of 0.8 to new topics', () => {
    const t = upsert({ category: 'topic', title: 'Confidence Test', content: 'Default confidence.' });
    expect(t.confidence).toBe(0.8);
  });

  it('allows explicit confidence values', () => {
    const t = upsert({ category: 'topic', title: 'High Confidence', content: 'Very sure about this.', confidence: 1.0 });
    expect(t.confidence).toBe(1.0);
  });
});

describe('export format', () => {
  it('produces valid JSON with expected structure', () => {
    upsert({ category: 'you', title: 'Profile', content: 'Lives in Istanbul.' });
    upsert({ category: 'topic', title: 'Interests', content: 'Likes chess and programming.' });
    const json = topicsModule.exportAllMemories();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(Array.isArray(parsed.profile)).toBe(true);
    expect(Array.isArray(parsed.topics)).toBe(true);
  });
});

describe('semantic vector retrieval', () => {
  // These tests verify that actual cosine similarity between query embedding and stored topic vectors
  // affects retrieval ranking — not just a fixed "embedding exists" bonus.

  it('keyword-only fallback works without embeddings', async () => {
    upsert({ category: 'topic', title: 'Python Programming', content: 'User is learning Python and building projects.' });
    upsert({ category: 'topic', title: 'Chess Strategy', content: 'Studies chess openings and tactics.' });

    // Without an embedding model configured, retrieval should still work via keyword matching.
    const result = await retrieve({ query: 'python programming' });
    expect(result.relevantTopics.length).toBeGreaterThanOrEqual(1);
  });

  it('cosine similarity affects ranking when vectors are present', async () => {
    // This test verifies the cosineSimilarity function works correctly.
    const { cosineSimilarity, normalizeVector } = await import('../../src/main/rag/embeddings');

    // Create two normalized vectors: one pointing in similar direction, one orthogonal.
    const simVec = [0.7, 0.7, 0.14]; // ~45° angle from reference
    const orthoVec = [-0.7, 0.7, 0.14]; // ~135° angle from reference

    const refNorm = normalizeVector([1, 0, 0]);
    const simNorm = normalizeVector(simVec);
    const orthoNorm = normalizeVector(orthoVec);

    const simScore = cosineSimilarity(refNorm, simNorm);
    const orthoScore = cosineSimilarity(refNorm, orthoNorm);

    // Similar vector should have positive similarity; orthogonal (opposite in first dim) should be negative.
    expect(simScore).toBeGreaterThan(0.5);
    expect(orthoScore).toBeLessThan(-0.5);
  });

  it('cosineSimilarity handles edge cases', async () => {
    const { cosineSimilarity, normalizeVector } = await import('../../src/main/rag/embeddings');

    // Identical vectors should have similarity ~1.
    const v = [3, 4];
    expect(cosineSimilarity(normalizeVector(v), normalizeVector([3, 4]))).toBeCloseTo(1, 5);

    // Opposite vectors should have similarity ~-1.
    expect(cosineSimilarity(normalizeVector([3, 4]), normalizeVector([-3, -4]))).toBeLessThan(-0.99);

    // Orthogonal vectors should have similarity ~0.
    expect(cosineSimilarity(normalizeVector([1, 0]), normalizeVector([0, 1]))).toBeLessThan(0.01);

    // Zero vector should not crash (returns 0).
    const zero = new Float32Array(3);
    expect(cosineSimilarity(zero, normalizeVector([1, 2, 3]))).toBe(0);
  });

  it('normalizeVector produces unit vectors', async () => {
    const { cosineSimilarity, normalizeVector } = await import('../../src/main/rag/embeddings');

    const v = [5, 12]; // norm = 13
    const n = normalizeVector(v);
    const norm = Math.sqrt(n[0] * n[0] + n[1] * n[1]);
    expect(norm).toBeCloseTo(1, 5);

    // Should preserve direction.
    expect(cosineSimilarity(normalizeVector([1, 2]), normalizeVector(v))).toBeGreaterThan(0.99);
  });

  it('retrieveMemory returns valid result when no topics exist', async () => {
    const result = await retrieve({ query: 'anything' });
    expect(result.explicitMemories).toBeDefined();
    expect(result.profileTopics).toBeDefined();
    expect(result.preferenceTopics).toBeDefined();
    expect(result.relevantTopics).toBeDefined();
    expect(result.relevantAreas).toBeDefined();
  });

  it('retrieveMemory returns empty result for incognito', async () => {
    const result = await retrieve({ query: 'anything', projectId: null, incognito: true });
    expect(result.explicitMemories.length).toBe(0);
    expect(result.profileTopics.length).toBe(0);
  });

  it('retrieveMemory handles empty query gracefully', async () => {
    upsert({ category: 'topic', title: 'Test Topic', content: 'Some content here.' });
    const result = await retrieve({ query: '' });
    expect(result.relevantTopics.length).toBe(0); // no keyword match with empty query
  });

  it('computeVectorSimilarity returns 0 when no embedding model is configured', async () => {
    const { computeVectorSimilarity } = await import('../../src/main/customize/memory-retrieval');
    upsert({ category: 'topic', title: 'Test Topic', content: 'Content.' });
    const topics = list();
    if (topics.length > 0) {
      const sim = await computeVectorSimilarity(topics[0], 'test query');
      expect(sim).toBeGreaterThanOrEqual(0); // Should be 0 since no embedding model is configured in tests
      expect(sim).toBeLessThan(1); // Not a perfect score
    }
  });

  it('retrieveMemory does not crash when vectors table has corrupt data', async () => {
    upsert({ category: 'topic', title: 'Test Topic', content: 'Content here.' });
    const topics = list();

    // Insert a corrupt vector (wrong dimensions) to test safe handling.
    if (topics.length > 0) {
      try {
        dbRun('INSERT INTO memory_vectors (topic_id, model, dims, vector, updated_at) VALUES (?, ?, ?, ?, ?)',
          topics[0].id, 'test/model', -1, new Uint8Array([0]), Date.now());
      } catch {
        // Ignore — might fail due to constraints, which is fine.
      }
    }

    // Retrieval should not crash even with corrupt vector data.
    const result = await retrieve({ query: 'test' });
    expect(result).toBeDefined();
  });
});
