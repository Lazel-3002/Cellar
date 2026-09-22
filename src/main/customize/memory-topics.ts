/**
 * Memory topics: grouped, running summaries quietly built from conversations (Customize -> Memory),
 * shown like Claude's "You" / "Topics" / "Areas" sections. Distinct from the flat `memories` table,
 * which holds facts a user or model explicitly asked to remember.
 *
 * Enhanced with: deduplication via title normalisation + content similarity, merge-aware upserts,
 * history/audit logging, and deterministic sensitive-data filtering.
 */
import type { MemoryCategory, MemoryTopic } from '@shared/types/customize';
import { all, get, run, transaction } from '../db/client';
import { bus } from '../lib/events';
import { newId } from '../lib/util';
import { listMemories } from './memory';
import { embedTopicAsync } from '../rag/embeddings';

interface Row {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  project_id: string | null;
  confidence: number;
  last_confirmed_at: number | null;
  created_at: number;
  updated_at: number;
}

const MAX_CONTENT_CHARS = 600;
const MAX_TITLE_CHARS = 60;
/** How much of the system prompt memory topics may take, on top of the flat memory list's own budget. */
const PROMPT_BUDGET_CHARS = 4000;

function toItem(r: Row): MemoryTopic {
  let projectName: string | undefined;
  if (r.project_id) {
    try {
      const { getProject } = require('../services/projects');
      projectName = getProject(r.project_id).name;
    } catch {
      // project was deleted; keep the topic, just without a resolved name
    }
  }
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    content: r.content,
    projectId: r.project_id ?? undefined,
    projectName,
    confidence: r.confidence,
    lastConfirmedAt: r.last_confirmed_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function changed() {
  bus.emit('customize:changed', { kind: 'memory' });
}

/** Record an entry in the topic history table for audit/debug purposes. */
function recordHistory(topicId: string, category: MemoryCategory, title: string, content: string, operation: 'create' | 'update' | 'delete'): void {
  run(
    'INSERT INTO memory_topic_history (id, topic_id, category, title, content, operation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    newId(),
    topicId,
    category,
    title,
    content,
    operation,
    Date.now(),
  );
}

/** Normalise a title for comparison: lowercased, stripped of common synonyms and punctuation. */
function normaliseTitle(title: string): string {
  const t = title.toLowerCase();

  // Collapse synonym groups to canonical forms first
  const normalized = t
    .replace(/\b(artificial intelligence)\b/g, 'ai')
    .replace(/\b(machine learning|ml)\b/gi, 'machine-learning');

  // Remove category suffixes that don't add meaning (e.g., "AI Interests" → "ai")
  const fillers = /\b(interest(s?)|areas? of interest|topics?|background|knowledge|expertise|experience|skills|preferences)\b$/i;
  let coreWords = normalized.replace(fillers, '').trim();

  // Also remove trailing standalone filler words (with optional preceding space)
  const trailingFillers = /\s+(interest(s?)|topics?|background|knowledge|expertise|experience|skills|preferences)?\s*$/i;
  coreWords = coreWords.replace(trailingFillers, '').trim();

  // Strip slashes and hyphens that create false distinctions (AI/ML → ai/ml)
  const cleaned = coreWords.replace(/[\/\-]+/g, '/');

  // Collapse multiple spaces and trim
  return cleaned.replace(/[\s_.,;:]+/g, ' ').trim();
}

/**
 * Check if two normalised titles are essentially the same concept.
 * Handles cases like "ai" vs "ai/machine-learning" where one is a superset of the other.
 */
function titlesAreSameConcept(normA: string, normB: string): boolean {
  if (normA === normB) return true;
  // Check if one contains the other as a prefix or component (e.g., "ai" and "ai/machine-learning")
  const partsA = normA.split('/');
  const partsB = normB.split('/');
  // If they share at least one common meaningful part, consider them same concept
  const shared = partsA.some((p) => partsB.includes(p));
  return shared;
}

/**
 * Check if a string looks like a secret / credential that should never be stored in memory.
 * Deterministic — does not depend on the model.
 */
const SECRET_PATTERNS = [
  // API keys and tokens (with values of any reasonable length)
  /\b(api[_-]?key|apikey)\s*[=:]\s*["']?[a-zA-Z0-9_\-]{8,}/i,
  /\b(token|access[_-]?token|auth[_-]?token)\s*[=:]\s*["']?[a-zA-Z0-9_\-]{8,}/i,
  // Secret keys and passwords
  /\b(secret[_-]?(key|token)|secret_key)\s*[=:]\s*\S{6,}/i,
  /password\s*[=:]\s*\S{4,}/i,
  // Private keys
  /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/i,
  // Connection strings with credentials
  /(mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/i,
  // Generic secrets that look like values
  /\b(ghp_|ghs_|github_pat_)[a-zA-Z0-9]{12,}/i,
  /sk[-_]pro[-_][a-zA-Z0-9]{16,}/i,
  // Bearer tokens (Authorization: Bearer <token>)
  /\b(Bearer\s+[a-zA-Z0-9\-._~+\/]+=*)/i,
  // JWT-like tokens (eyJ...)
  /eyJ[a-zA-Z0-9\-_]+\.eyJ[a-zA-Z0-9\-_.]+\.[a-zA-Z0-9\-_.]{16,}/,
  // AWS access key IDs
  /\b(AKIA[0-9A-Z]{16})/i,
  // AWS secret access keys (when paired with a label)
  /(?:(aws[_-]?)?(secret[_-]?access[_-]?key)\s*[=:]\s*\S{32,})/i,
  // Slack/Gitlab tokens
  /\b(xox[baprs]-[0-9]{10,}-[a-zA-Z0-9\-_.]+)/i,
];

/** Return true if the text likely contains secrets or credentials. */
export function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

/** Check if content contains highly specific sensitive topic information (medical, religious, political, financial). */
export function isHighlySensitiveTopic(content: string): boolean {
  const lower = content.toLowerCase();

  // Medical/health — only when it looks like specific health info, not general mentions
  if (/\b(diagnosed with|has [a-z]+ cancer|terminal illness|hiv[+-]?\s*(positive|negative)|hepatitis\s*[bc]|alzheimer[s]?|parkinson['']?s)\b/i.test(lower)) return true;
  // Suicide/self-harm indicators
  if (/\b(self[-_]?harm|suicidal ideation|attempted suicide|self[-_]?injurious)\b/i.test(lower)) return true;

  // Political affiliation with specific party/government role
  if (/\b(member of congress|senator|representative|MP\s+\d+|cabinet member|minister of|president of [a-z]+)\b/i.test(lower)) return true;

  // Financial — specific accounts, balances, tax info
  if (/\b(account balance|bank account [0-9]|tax return|irs\s+(form|refund)|credit card number|ssn[=:\s]*\d)/i.test(lower)) return true;

  // Religious practice with specific ritual/observance details
  if (/\b(converted to (islam|judaism|buddhism)|keeps kosher|wears hijab|attends mosque\s+\w+)\b/i.test(lower)) return true;

  // Precise location of private residence
  if (/\b(lives at \d+ [a-z ]+(street|st|avenue|ave|road|rd)[,\s]?\w+[,\s]\w+[,\s]\d{5})\b/i.test(lower)) return true;

  // Drug use / substance abuse
  if (/\b(addicted to\s+\w+|substance abuse disorder|detox program|rehab facility)\b/i.test(lower)) return true;

  return false;
}

/** Strip content that contains highly sensitive topic information. Returns empty string if stripped completely. */
export function stripSensitiveContent(content: string): string {
  const lower = content.toLowerCase();
  // Check for medical/health specifics — replace with a generic placeholder
  let result = content.replace(
    /\b(diagnosed with [^.,;]+|has [a-z]+ cancer|terminal illness|hiv[+-]?\s*(positive|negative)|hepatitis\s*[bc]|alzheimer[s]?|parkinson['']?s)\b/gi,
    '[medical information redacted]',
  );
  result = result.replace(
    /\b(self[-_]?harm|suicidal ideation|attempted suicide|self[-_]?injurious)\b/gi,
    '[mental health information redacted]',
  );
  // Political specifics
  result = result.replace(
    /\b(member of congress|senator|representative|MP\s+\d+|cabinet member|minister of [a-z]+|president of [a-z]+)\b/gi,
    '[political role redacted]',
  );
  // Financial specifics
  result = result.replace(
    /\b(account balance|bank account [0-9]|tax return|irs\s+(form|refund)|credit card number|ssn[=:\s]*\d)\b/gi,
    '[financial information redacted]',
  );
  // Religious specifics
  result = result.replace(
    /\b(converted to (islam|judaism|buddhism)|keeps kosher|wears hijab|attends mosque\s+\w+)\b/gi,
    '[religious practice redacted]',
  );
  // Drug/substance abuse
  result = result.replace(
    /\b(addicted to [^.,;]+|substance abuse disorder|detox program|rehab facility)\b/gi,
    '[substance use information redacted]',
  );

  return result.trim();
}

/** Strip any secret-like substrings from content before storage. */
export function stripSecrets(content: string): string {
  let result = content;
  // Replace API key / token patterns with [REDACTED]
  result = result.replace(
    /\b(api[_-]?key|apikey|token|access_token|auth_token)\s*[=:]\s*["']?[a-zA-Z0-9_\-]{8,}/gi,
    '$1=[REDACTED]',
  );
  // Replace secret_key patterns
  result = result.replace(
    /\b(secret[_-]?(key|token))\s*[=:]\s*\S{6,}/gi,
    '$1=[REDACTED]',
  );
  result = result.replace(/password\s*[=:]\s*\S{4,}/gi, 'password=[REDACTED]');
  result = result.replace(/-----BEGIN (RSA |EC )?PRIVATE KEY-----/gi, '-----BEGIN PRIVATE KEY [REDACTED]');
  result = result.replace(/(mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/gi, '$1://[REDACTED]@');
  return result;
}

/** Simple token-based content similarity (Jaccard index on word sets). */
function contentSimilarity(a: string, b: string): number {
  const wordsA = new Set((a || '').toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set((b || '').toLowerCase().split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

export function listMemoryTopics(): MemoryTopic[] {
  return all<Row>('SELECT * FROM memory_topics ORDER BY updated_at DESC').map(toItem);
}

export interface MemoryTopicInput {
  category: MemoryCategory;
  title: string;
  content: string;
  projectId?: string | null;
  confidence?: number;
}

/**
 * Insert a topic, or update it in place when one already exists for the same normalised key.
 * When an exact match is found, merges new info into existing content (preserving compatible data).
 * When no exact match but high similarity, updates the most similar existing topic.
 * Only creates a brand-new entry when nothing close enough exists.
 */
export function upsertMemoryTopic(
  input: MemoryTopicInput & { sensitiveAllowed?: boolean },
): MemoryTopic {
  const category: MemoryCategory = ['you', 'topic', 'area'].includes(input.category) ? input.category : 'topic';
  const title = input.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS);
  let content = (input.content || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CONTENT_CHARS);

  // Deterministic sensitive-data / secret filter — always applied regardless of settings.
  if (looksLikeSecret(content)) {
    content = stripSecrets(content);
  } else if (/password|secret_key|private[_-]?key|api[_-]?secret|credentials?|access[_-]?token/i.test(content)) {
    content = stripSecrets(content);
  }

  // When sensitive topics are NOT allowed, also strip highly specific sensitive content.
  const sensitiveAllowed = input.sensitiveAllowed !== false; // default: allow (for manual edits)
  if (!sensitiveAllowed && isHighlySensitiveTopic(content)) {
    content = stripSensitiveContent(content);
  }

  if (!title || !content) throw new Error('A memory topic needs a title and content.');

  const now = Date.now();
  const normTitle = normaliseTitle(title);
  const existingExact = get<Row>('SELECT * FROM memory_topics WHERE category = ? AND lower(title) = lower(?)', category, title);

  // Case-insensitive exact match — update in place (preserve project_id if not overridden)
  if (existingExact) {
    return mergeTopic(existingExact.id, existingExact.category, existingExact.title, content, input.projectId ?? existingExact.project_id, now, input.confidence ?? 0.8);
  }

  // No exact match — look for a semantically similar topic to update instead of creating duplicates
  const candidates = all<Row>('SELECT * FROM memory_topics WHERE category = ?', category);
  let bestMatch: Row | null = null;
  let bestScore = 0;

  for (const c of candidates) {
    // Title normalisation match (exact)
    if (normaliseTitle(c.title) === normTitle) {
      bestMatch = c;
      break;
    }
    // Title concept match — same core topic even with different suffixes (e.g., "ai" vs "ai/machine-learning")
    if (!bestMatch && titlesAreSameConcept(normaliseTitle(c.title), normTitle)) {
      bestMatch = c;
      bestScore = 0.6; // High score for concept match
    } else {
      // Content similarity — only merge if the new content is essentially a superset or extension
      const sim = contentSimilarity(content, c.content);
      const titleSim = contentSimilarity(normaliseTitle(c.title), normTitle);
      const combined = sim * 0.5 + titleSim * 0.5;
      if (combined > bestScore && combined > 0.3) {
        bestScore = combined;
        bestMatch = c;
      }
    }
  }

  if (bestMatch) {
    // Merge into the existing topic rather than creating a duplicate
    return mergeTopic(bestMatch.id, category, title, content, input.projectId ?? bestMatch.project_id, now, input.confidence ?? 0.8);
  }

  // Truly new — create it
  const id = newId();
  run(
    'INSERT INTO memory_topics (id, category, title, content, project_id, confidence, last_confirmed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    category,
    title,
    content,
    input.projectId ?? null,
    input.confidence ?? 0.8,
    null,
    now,
    now,
  );
  recordHistory(id, category, title, content, 'create');
  changed();
  // Async: generate embedding for the new topic (non-blocking).
  void embedTopicAsync(id, title, content);
  return toItem(get<Row>('SELECT * FROM memory_topics WHERE id = ?', id)!);
}

/** Merge new content into an existing topic, preserving compatible information. */
function mergeTopic(topicId: string, category: MemoryCategory, title: string, newContent: string, projectId: string | null, now: number, confidence: number): MemoryTopic {
  const existing = get<Row>('SELECT * FROM memory_topics WHERE id = ?', topicId)!;

  // Conflict resolution: prefer an explicit current statement but preserve compatible info.
  let mergedContent = mergeContent(existing.content, newContent);

  run('UPDATE memory_topics SET title = ?, content = ?, project_id = ?, confidence = ?, updated_at = ? WHERE id = ?', title, mergedContent, projectId, confidence, now, topicId);
  recordHistory(topicId, category, existing.title, mergedContent, 'update');
  changed();
  // Async: regenerate embedding after merge (non-blocking).
  void embedTopicAsync(topicId, title, mergedContent);
  return toItem(get<Row>('SELECT * FROM memory_topics WHERE id = ?', topicId)!);
}

/**
 * Merge two content strings: prefer the new one but keep compatible parts from the old.
 * Avoids keeping contradictory statements in the final text.
 */
function mergeContent(oldContent: string, newContent: string): string {
  const trimmedOld = oldContent.trim();
  const trimmedNew = newContent.trim();

  if (!trimmedOld) return trimmedNew; // nothing to merge from — use new content
  if (!trimmedNew) return trimmedOld; // no new info — keep old

  const oldSentences = trimmedOld.split(/[.\n]+/).map((s) => s.trim()).filter(Boolean);
  const newSentences = trimmedNew.split(/[.\n]+/).map((s) => s.trim()).filter(Boolean);

  // If both are single sentences, prefer the newer one (it's likely more recent/explicit).
  if (oldSentences.length === 1 && newSentences.length === 1) {
    return newSentences[0];
  }

  // Multi-sentence merge: build a combined set keeping non-contradictory old sentences.
  const resultSentences = [...newSentences]; // start with all new content (authoritative)
  let hasContradiction = false;

  for (const os of oldSentences) {
    const osLower = os.toLowerCase();

    // Skip if this old sentence is already covered by a new sentence.
    const alreadyCovered = newSentences.some(
      (ns) => {
        const nsLower = ns.toLowerCase();
        // Check word-level overlap — if >60% of words are shared, it's the same idea.
        const oldWords = osLower.split(/\s+/);
        const newWords = nsLower.split(/\s+/);
        const common = oldWords.filter((w) => newWords.includes(w)).length;
        return common / Math.max(oldWords.length, 1) > 0.6;
      },
    );
    if (alreadyCovered) continue;

    // Check for explicit contradictions (prefer vs not prefer).
    let contradicts = false;
    for (const ns of newSentences) {
      const nsLower = ns.toLowerCase();
      if ((osLower.includes('prefer') && nsLower.includes('not prefer')) ||
          (osLower.includes('not prefer') && nsLower.includes('prefer'))) {
        contradicts = true;
        hasContradiction = true;
        break;
      }
    }

    // Check for semantic contradictions on the same topic.
    if (!contradicts) {
      const oldTopicWords = new Set(osLower.split(/\s+/).filter((w) => w.length > 3));
      const overlapWithNew = newSentences.some(
        (ns) => {
          const nsLower = ns.toLowerCase();
          // If the new sentence shares key topic words but says something different, flag it.
          const sharedWords = [...oldTopicWords].filter((w) => nsLower.includes(w));
          if (sharedWords.length < 2) return false;
          // Check for negation mismatch on the same topic.
          const hasNegationDiff = (osLower.includes('prefer') && !nsLower.includes('not prefer')) ||
                                  (!osLower.includes('prefer') && nsLower.includes('not prefer'));
          if (hasNegationDiff) {
            contradicts = true;
            return false; // skip this old sentence
          }
          return sharedWords.length >= 2 && !contradicts;
        },
      );

      if (!contradicts) {
        resultSentences.push(os); // keep this compatible old sentence
      }
    }
  }

  // If no contradictions were found and new content is shorter, the LLM likely just summarized —
  // prefer keeping both to preserve information.
  if (!hasContradiction && trimmedNew.length < trimmedOld.length * 0.7) {
    return [...newSentences, ...resultSentences.filter((s) => !newSentences.includes(s))].join('. ').replace(/\. /g, '. ') + '.';
  }

  // Default: return the combined result.
  if (resultSentences.length > newSentences.length) {
    return resultSentences.join('. ').replace(/\. /g, '. ') + '.';
  }
  return trimmedNew;
}

export function updateMemoryTopic(id: string, content: string): MemoryTopic {
  const text = content.replace(/\s+/g, ' ').trim().slice(0, MAX_CONTENT_CHARS);
  if (!text) throw new Error('A memory topic cannot be empty.');
  const existing = get<Row>('SELECT * FROM memory_topics WHERE id = ?', id);
  if (!existing) throw new Error('Memory topic not found.');

  // Sensitive-data filter on update too
  let cleanedText = text;
  if (looksLikeSecret(text)) {
    cleanedText = stripSecrets(text);
  } else {
    const hasSensitiveKeywords = /password|secret_key|private[_-]?key|api[_-]?secret|credentials?/i.test(text);
    if (hasSensitiveKeywords) {
      cleanedText = stripSecrets(text);
    }
  }

  run('UPDATE memory_topics SET content = ?, updated_at = ? WHERE id = ?', cleanedText, Date.now(), id);
  recordHistory(id, existing.category, existing.title, cleanedText, 'update');
  changed();
  // Async: regenerate embedding after update (non-blocking).
  void embedTopicAsync(id, existing.title, cleanedText);
  return toItem(get<Row>('SELECT * FROM memory_topics WHERE id = ?', id)!);
}

export function deleteMemoryTopic(id: string): void {
  const existing = get<Row>('SELECT * FROM memory_topics WHERE id = ?', id);
  if (!existing) return;
  recordHistory(id, existing.category, existing.title, existing.content, 'delete');
  run('DELETE FROM memory_topics WHERE id = ?', id);
  changed();
}

export function clearMemoryTopics(): void {
  const topics = listMemoryTopics();
  for (const t of topics) {
    recordHistory(t.id, t.category, t.title, t.content, 'delete');
  }
  run('DELETE FROM memory_topics');
  changed();
}

export function findMemoryTopicByTitle(title: string): MemoryTopic | undefined {
  const needle = title.trim().toLowerCase();
  if (!needle) return undefined;
  return listMemoryTopics().find((t) => t.title.toLowerCase() === needle);
}

/** Find a topic by normalised title within a category (for deduplication). */
export function findSimilarTopic(category: MemoryCategory, title: string): MemoryTopic | undefined {
  const norm = normaliseTitle(title);
  return listMemoryTopics().find((t) => t.category === category && normaliseTitle(t.title) === norm);
}

const CATEGORY_LABEL: Record<MemoryCategory, string> = { you: 'You', topic: 'Topics', area: 'Areas' };

/** The memory-topics block of a system prompt, grouped by category (within a character budget). */
export function memoryTopicsPrompt(items: MemoryTopic[]): string {
  if (items.length === 0) return '';
  const byCategory = new Map<MemoryCategory, MemoryTopic[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  const lines: string[] = [];
  let used = 0;
  outer: for (const category of ['you', 'topic', 'area'] as const) {
    const list = byCategory.get(category);
    if (!list?.length) continue;
    const header = `${CATEGORY_LABEL[category]}:`;
    if (used + header.length > PROMPT_BUDGET_CHARS) break;
    lines.push(header);
    used += header.length;
    for (const item of list) {
      const name = item.category === 'area' && item.projectName ? item.projectName : item.title;
      const line = `- ${name}: ${item.content}`;
      if (used + line.length > PROMPT_BUDGET_CHARS) break outer;
      lines.push(line);
      used += line.length;
    }
  }
  if (lines.length === 0) return '';
  return `<memory_profile>\nBuilt quietly from earlier conversations. Use it when relevant; do not recite it back or mention that it exists unless asked.\n${lines.join('\n')}\n</memory_profile>`;
}

/** History entries for debugging / audit purposes. */
export interface MemoryTopicHistoryEntry {
  id: string;
  topicId: string;
  category: MemoryCategory;
  title: string;
  content: string;
  operation: 'create' | 'update' | 'delete';
  createdAt: number;
}

/** Get history for a specific topic, or all topics. */
interface HistoryRow {
  id: string;
  topic_id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  operation: 'create' | 'update' | 'delete';
  created_at: number;
}

export function getMemoryTopicHistory(topicId?: string): MemoryTopicHistoryEntry[] {
  const sql = topicId
    ? 'SELECT * FROM memory_topic_history WHERE topic_id = ? ORDER BY created_at DESC'
    : 'SELECT * FROM memory_topic_history ORDER BY created_at DESC LIMIT 200';
  return all<HistoryRow>(sql, topicId ?? '').map((r) => ({
    id: r.id,
    topicId: r.topic_id,
    category: r.category,
    title: r.title,
    content: r.content,
    operation: r.operation,
    createdAt: r.created_at,
  }));
}

/** Export all memories and topics as structured JSON for portability. */
export function exportAllMemories(): string {
  const memories = listMemories();
  const topics = listMemoryTopics();

  return JSON.stringify({
    version: 1,
    profile: topics.filter((t) => t.category === 'you' && !['preferences'].some((kw) => t.title.toLowerCase().includes(kw))).map((t) => ({ title: t.title, content: t.content })),
    preferences: topics.filter((t) => t.category === 'you').filter((t) => ['preferences', 'profile'].every((kw) => !t.title.toLowerCase().includes(kw))).map((t) => ({ title: t.title, content: t.content })),
    topics: topics.filter((t) => t.category === 'topic').map((t) => ({ title: t.title, content: t.content })),
    areas: topics.filter((t) => t.category === 'area').map((t) => ({ title: t.projectName || t.title, content: t.content })),
    memories: memories.map((m) => ({ content: m.content, source: m.source, createdAt: m.createdAt })),
  }, null, 2);
}

/** Import memory data from exported JSON with deduplication and validation. */
export function importMemories(json: string): { created: number; updated: number; skippedDuplicates: number; rejected: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { created: 0, updated: 0, skippedDuplicates: 0, rejected: ['Invalid JSON'] };
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.version !== 'number') return { created: 0, updated: 0, skippedDuplicates: 0, rejected: ['Missing version field'] };

  const result = { created: 0, updated: 0, skippedDuplicates: 0, rejected: [] as string[] };
  const existingTopics = listMemoryTopics();

  // Helper to upsert a topic and track results
  const upsertTopic = (category: MemoryCategory, title: string, content: string): void => {
    if (!title || !content) return;
    // Check for duplicates by normalised title + category
    const normTitle = normaliseTitle(title);
    const existing = existingTopics.find((t) => t.category === category && normaliseTitle(t.title) === normTitle);
    if (existing) {
      result.skippedDuplicates++;
      return;
    }
    try {
      upsertMemoryTopic({ category, title, content });
      result.created++;
    } catch {
      result.rejected.push(`Failed to create: ${title}`);
    }
  };

  // Import profile (you category, non-preference)
  const profile = Array.isArray(obj.profile) ? obj.profile : [];
  for (const item of profile.slice(0, 20)) {
    if (typeof item.title === 'string' && typeof item.content === 'string') {
      upsertTopic('you', item.title, item.content);
    }
  }

  // Import preferences (you category, preference-like)
  const prefs = Array.isArray(obj.preferences) ? obj.preferences : [];
  for (const item of prefs.slice(0, 20)) {
    if (typeof item.title === 'string' && typeof item.content === 'string') {
      upsertTopic('you', item.title, item.content);
    }
  }

  // Import topics
  const topics = Array.isArray(obj.topics) ? obj.topics : [];
  for (const item of topics.slice(0, 100)) {
    if (typeof item.title === 'string' && typeof item.content === 'string') {
      upsertTopic('topic', item.title, item.content);
    }
  }

  // Import areas
  const areas = Array.isArray(obj.areas) ? obj.areas : [];
  for (const item of areas.slice(0, 100)) {
    if (typeof item.title === 'string' && typeof item.content === 'string') {
      upsertTopic('area', item.title, item.content);
    }
  }

  // Import flat memories (notes) — only create new ones, don't overwrite existing.
  const flatMemories = Array.isArray(obj.memories) ? obj.memories : [];
  for (const item of flatMemories.slice(0, 100)) {
    if (typeof item.content === 'string' && item.content.trim()) {
      try {
        const { addMemory } = require('./memory');
        // Check for exact duplicate in existing memories first.
        const existingFlat = require('./memory').listMemories();
        const isDuplicate = existingFlat.some((m: { content: string }) => m.content === item.content.trim());
        if (!isDuplicate) {
          addMemory(item.content.trim(), (item.source as 'user' | 'model') ?? 'user');
          result.created++; // reuse created counter for flat memories too
        } else {
          result.skippedDuplicates++;
        }
      } catch {
        result.rejected.push(`Failed to import memory: ${item.content.slice(0, 80)}`);
      }
    }
  }

  return result;
}
