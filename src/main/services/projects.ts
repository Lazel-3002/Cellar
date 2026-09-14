import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Project, ProjectDetail, ProjectFile, ProjectSummary } from '@shared/types/chat';
import { all, ftsQuery, get, run, transaction } from '../db/client';
import { listConversations } from '../db/chat-store';
import { bus } from '../lib/events';
import { newId } from '../lib/util';
import { classifyFile, extractPdfText } from '../chat/attachments';
import { estimateTokens } from '../chat/context-window';
import { embeddingIndex, fuseRankings } from '../rag/embeddings';

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  instructions: string;
  starred: number;
  created_at: number;
  updated_at: number;
}

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  description: r.description,
  instructions: r.instructions,
  starred: r.starred === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const CHUNK_CHARS = 2800;

export function chunkText(text: string, size = CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n{2,}/);
  let current = '';
  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > size && current) {
      chunks.push(current);
      current = '';
    }
    if (para.length > size) {
      for (let i = 0; i < para.length; i += size) chunks.push(para.slice(i, i + size));
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

export function listProjects(): ProjectSummary[] {
  return all<ProjectRow & { file_count: number; conversation_count: number }>(
    `SELECT p.*, (SELECT COUNT(*) FROM project_files f WHERE f.project_id = p.id) AS file_count,
            (SELECT COUNT(*) FROM conversations c WHERE c.project_id = p.id) AS conversation_count
     FROM projects p ORDER BY p.starred DESC, p.updated_at DESC`,
  ).map((r) => ({ ...toProject(r), fileCount: r.file_count, conversationCount: r.conversation_count }));
}

export function getProject(id: string): Project {
  const row = get<ProjectRow>('SELECT * FROM projects WHERE id = ?', id);
  if (!row) throw new Error('Project not found');
  return toProject(row);
}

export function projectDetail(id: string): ProjectDetail {
  const project = getProject(id);
  const files = all<{ id: string; project_id: string; name: string; mime: string; size: number; tokens: number; created_at: number }>(
    'SELECT id, project_id, name, mime, size, tokens, created_at FROM project_files WHERE project_id = ? ORDER BY created_at',
    id,
  ).map((f): ProjectFile => ({ id: f.id, projectId: f.project_id, name: f.name, mime: f.mime, size: f.size, tokens: f.tokens, createdAt: f.created_at }));
  return { project, files, conversations: listConversations({ projectId: id }), index: embeddingIndex.status(id) };
}

export function createProject(input: { name: string; description: string }): Project {
  const name = input.name.trim();
  if (!name) throw new Error('Give your project a name.');
  const id = newId();
  const now = Date.now();
  run('INSERT INTO projects (id, name, description, instructions, starred, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)', id, name.slice(0, 120), input.description.trim().slice(0, 2000), '', now, now);
  bus.emit('projects:changed', { projectId: id });
  return getProject(id);
}

export function updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'instructions' | 'starred'>>): Project {
  const current = getProject(id);
  run(
    'UPDATE projects SET name = ?, description = ?, instructions = ?, starred = ?, updated_at = ? WHERE id = ?',
    (patch.name ?? current.name).trim().slice(0, 120) || current.name,
    (patch.description ?? current.description).slice(0, 2000),
    (patch.instructions ?? current.instructions).slice(0, 50_000),
    patch.starred ?? current.starred,
    Date.now(),
    id,
  );
  bus.emit('projects:changed', { projectId: id });
  return getProject(id);
}

export function deleteProject(id: string): void {
  transaction(() => {
    run('DELETE FROM project_chunks WHERE project_id = ?', id);
    run('DELETE FROM projects WHERE id = ?', id);
  });
  bus.emit('projects:changed', { projectId: id });
  bus.emit('chat:changed', {});
}

export async function addProjectFiles(projectId: string, filePaths: string[]): Promise<ProjectFile[]> {
  getProject(projectId);
  const added: ProjectFile[] = [];
  for (const file of filePaths) {
    const info = await stat(file);
    const name = basename(file);
    const type = classifyFile(name);
    if (!type || type.kind === 'image') throw new Error(`${name}: project knowledge supports text, code and PDF files.`);
    const bytes = await readFile(file);
    const content = type.kind === 'pdf' ? await extractPdfText(bytes) : bytes.toString('utf8');
    const id = newId();
    const tokens = estimateTokens(content);
    transaction(() => {
      run('INSERT INTO project_files (id, project_id, name, mime, size, content, tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, projectId, name, type.mime, info.size, content, tokens, Date.now());
      chunkText(content).forEach((chunk, ord) => {
        run('INSERT INTO project_chunks (content, file_id, project_id, ord) VALUES (?, ?, ?, ?)', chunk, id, projectId, ord);
      });
      run('UPDATE projects SET updated_at = ? WHERE id = ?', Date.now(), projectId);
    });
    added.push({ id, projectId, name, mime: type.mime, size: info.size, tokens, createdAt: Date.now() });
  }
  bus.emit('projects:changed', { projectId });
  if (added.length) void embeddingIndex.index(projectId);
  return added;
}

export function removeProjectFile(fileId: string): void {
  const row = get<{ project_id: string }>('SELECT project_id FROM project_files WHERE id = ?', fileId);
  if (!row) return;
  transaction(() => {
    run('DELETE FROM project_chunks WHERE file_id = ?', fileId);
    run('DELETE FROM project_vectors WHERE file_id = ?', fileId);
    run('DELETE FROM project_files WHERE id = ?', fileId);
  });
  bus.emit('projects:changed', { projectId: row.project_id });
}

/**
 * Project knowledge for the system prompt: every file when they fit the budget, otherwise the
 * best-matching chunks for the latest user message: BM25 via FTS5, fused with embedding similarity
 * when an embedding model is set.
 */
export async function projectKnowledge(projectId: string, query: string, budgetTokens: number): Promise<string> {
  const files = all<{ id: string; name: string; content: string; tokens: number }>('SELECT id, name, content, tokens FROM project_files WHERE project_id = ? ORDER BY created_at', projectId);
  if (files.length === 0) return '';
  const total = files.reduce((s, f) => s + f.tokens, 0);
  if (total <= budgetTokens) {
    return files.map((f) => `<document name="${f.name}">\n${f.content}\n</document>`).join('\n');
  }
  const names = new Map(files.map((f) => [f.id, f.name]));
  const match = ftsQuery(query);
  const keyword = match
    ? all<{ content: string; file_id: string; ord: number }>(
        'SELECT content, file_id, ord FROM project_chunks WHERE project_chunks MATCH ? AND project_id = ? ORDER BY bm25(project_chunks) LIMIT 40',
        match,
        projectId,
      )
    : [];
  const semantic = await embeddingIndex.search(projectId, query);
  let rows: Array<{ content: string; file_id: string }> = keyword;
  if (semantic.length) {
    const byKey = new Map(keyword.map((r) => [`${r.file_id}:${r.ord}`, r]));
    const missing = semantic.filter((key) => !byKey.has(key));
    for (const key of missing) {
      const [fileId, ord] = [key.slice(0, key.lastIndexOf(':')), Number(key.slice(key.lastIndexOf(':') + 1))];
      const row = get<{ content: string; file_id: string; ord: number }>('SELECT content, file_id, ord FROM project_chunks WHERE file_id = ? AND ord = ? AND project_id = ?', fileId, ord, projectId);
      if (row) byKey.set(key, row);
    }
    rows = fuseRankings([keyword.map((r) => `${r.file_id}:${r.ord}`), semantic])
      .map((key) => byKey.get(key))
      .filter((r): r is { content: string; file_id: string; ord: number } => !!r);
  }
  const picked: string[] = [];
  let used = 0;
  for (const row of rows) {
    const cost = estimateTokens(row.content);
    if (used + cost > budgetTokens) break;
    used += cost;
    picked.push(`<excerpt from="${names.get(row.file_id) ?? 'document'}">\n${row.content}\n</excerpt>`);
  }
  if (picked.length === 0) {
    return `Project files (too large to include in full): ${files.map((f) => f.name).join(', ')}.`;
  }
  return picked.join('\n');
}
