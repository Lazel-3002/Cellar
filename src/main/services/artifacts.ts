import { parseArtifacts } from '@shared/artifacts';
import type { Artifact, ArtifactSummary, ArtifactType } from '@shared/types/chat';
import { all, get, run } from '../db/client';
import { newId } from '../lib/util';

interface Row {
  id: string;
  conversation_id: string;
  message_id: string;
  identifier: string;
  type: ArtifactType;
  title: string;
  language: string | null;
  content: string;
  version: number;
  created_at: number;
}

const toArtifact = (r: Row): Artifact => ({
  id: r.id,
  conversationId: r.conversation_id,
  messageId: r.message_id,
  identifier: r.identifier,
  type: r.type,
  title: r.title,
  language: r.language ?? undefined,
  content: r.content,
  version: r.version,
  createdAt: r.created_at,
});

/** Artifacts from incognito chats never touch the database. */
const memory = new Map<string, Artifact[]>();

export function saveArtifactsFromMessage(conversationId: string, messageId: string, content: string, incognito: boolean): Artifact[] {
  const parsed = parseArtifacts(content).filter((a) => !a.open && a.content.trim());
  const saved: Artifact[] = [];
  for (const item of parsed) {
    const existing = incognito
      ? (memory.get(conversationId) ?? []).filter((a) => a.identifier === item.identifier).sort((a, b) => b.version - a.version)[0]
      : (() => {
          const row = get<Row>('SELECT * FROM artifacts WHERE conversation_id = ? AND identifier = ? ORDER BY version DESC LIMIT 1', conversationId, item.identifier);
          return row ? toArtifact(row) : undefined;
        })();
    if (existing && existing.content === item.content) continue;
    const artifact: Artifact = {
      id: newId(),
      conversationId,
      messageId,
      identifier: item.identifier,
      type: item.type,
      title: item.title,
      language: item.language,
      content: item.content,
      version: (existing?.version ?? 0) + 1,
      createdAt: Date.now(),
    };
    if (incognito) memory.set(conversationId, [...(memory.get(conversationId) ?? []), artifact]);
    else {
      run(
        'INSERT INTO artifacts (id, conversation_id, message_id, identifier, type, title, language, content, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        artifact.id,
        conversationId,
        messageId,
        artifact.identifier,
        artifact.type,
        artifact.title,
        artifact.language,
        artifact.content,
        artifact.version,
        artifact.createdAt,
      );
    }
    saved.push(artifact);
  }
  return saved;
}

export function listArtifacts(): ArtifactSummary[] {
  return all<Row & { conversation_title: string }>(
    `SELECT a.*, c.title AS conversation_title FROM artifacts a
     JOIN conversations c ON c.id = a.conversation_id
     WHERE a.version = (SELECT MAX(version) FROM artifacts b WHERE b.conversation_id = a.conversation_id AND b.identifier = a.identifier)
     ORDER BY a.created_at DESC LIMIT 500`,
  ).map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    conversationTitle: r.conversation_title || 'Untitled',
    identifier: r.identifier,
    type: r.type,
    title: r.title,
    version: r.version,
    createdAt: r.created_at,
  }));
}

export function getArtifact(id: string): Artifact {
  for (const list of memory.values()) {
    const found = list.find((a) => a.id === id);
    if (found) return found;
  }
  const row = get<Row>('SELECT * FROM artifacts WHERE id = ?', id);
  if (!row) throw new Error('Artifact not found');
  return toArtifact(row);
}

export function artifactsForConversation(conversationId: string): Artifact[] {
  const inMemory = memory.get(conversationId);
  if (inMemory) return [...inMemory];
  return all<Row>('SELECT * FROM artifacts WHERE conversation_id = ? ORDER BY created_at', conversationId).map(toArtifact);
}

export function discardIncognitoArtifacts(conversationId: string): void {
  memory.delete(conversationId);
}
