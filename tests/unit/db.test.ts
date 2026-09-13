import { beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase } from '../../src/main/db/client';
import { deleteConversations, listConversations, MemoryChatStore, searchMessages, SqliteChatStore } from '../../src/main/db/chat-store';
import type { Conversation, Message } from '../../src/shared/types/chat';

const conversation = (id: string, title: string, updatedAt: number): Conversation => ({
  id,
  title,
  projectId: null,
  starred: false,
  currentLeafId: null,
  settings: {},
  incognito: false,
  createdAt: updatedAt,
  updatedAt,
});

const message = (id: string, conversationId: string, content: string, parentId: string | null = null): Message => ({
  id,
  conversationId,
  parentId,
  role: 'user',
  content,
  attachments: [],
  status: 'complete',
  createdAt: Date.now(),
});

describe('SqliteChatStore', () => {
  beforeAll(() => {
    closeDatabase();
    openDatabase(':memory:');
  });

  it('round-trips conversations, messages and patches', () => {
    const store = new SqliteChatStore();
    store.createConversation(conversation('c1', 'Chess engine in Python', 1));
    store.insertMessage(message('m1', 'c1', 'How do I write a minimax search?'));
    store.updateConversation('c1', { currentLeafId: 'm1', starred: true, model: { providerId: 'ollama', modelId: 'qwen3.5:9b' }, settings: { thinking: 'high' } });
    store.updateMessage('m1', { stats: { tokensPerSecond: 30 }, status: 'stopped' });

    const c = store.getConversation('c1');
    expect(c).toMatchObject({ currentLeafId: 'm1', starred: true, model: { providerId: 'ollama', modelId: 'qwen3.5:9b' }, settings: { thinking: 'high' } });
    expect(store.getMessage('m1')).toMatchObject({ status: 'stopped', stats: { tokensPerSecond: 30 } });
    expect(store.listMessages('c1')).toHaveLength(1);
  });

  it('lists, filters and searches with FTS5', () => {
    const store = new SqliteChatStore();
    store.createConversation(conversation('c2', 'Voxel engine', 5));
    const m = message('m2', 'c2', 'Chunked world generation with greedy meshing');
    store.insertMessage(m);
    store.indexMessage(m);
    store.indexMessage(message('m1', 'c1', 'How do I write a minimax search?'));

    // c1 was touched by updateConversation (updated_at = now), so it sorts first.
    expect(listConversations().map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(listConversations({ starred: true }).map((c) => c.id)).toEqual(['c1']);
    expect(listConversations({ query: 'greedy' }).map((c) => c.id)).toEqual(['c2']);
    const hits = searchMessages('minimax');
    expect(hits[0]).toMatchObject({ conversationId: 'c1' });
    expect(hits[0].snippet).toContain('[[minimax]]');

    deleteConversations(['c2']);
    expect(listConversations().map((c) => c.id)).toEqual(['c1']);
    expect(searchMessages('greedy')).toEqual([]);
  });
});

describe('MemoryChatStore', () => {
  it('keeps incognito chats out of the database', () => {
    const store = new MemoryChatStore();
    store.createConversation(conversation('ghost', '', 1));
    store.insertMessage(message('g1', 'ghost', 'secret'));
    expect(store.getConversation('ghost')?.incognito).toBe(true);
    expect(store.listMessages('ghost')).toHaveLength(1);
    store.discard('ghost');
    expect(store.has('ghost')).toBe(false);
    expect(listConversations().some((c) => c.id === 'ghost')).toBe(false);
  });
});
