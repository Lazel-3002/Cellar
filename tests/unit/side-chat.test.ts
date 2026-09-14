import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentPart, ConversationKind, TaskState } from '../../src/shared/types/agent';
import type { Conversation, Message, StreamEvent } from '../../src/shared/types/chat';
import type { SideChatEvent, SideChatMessage } from '../../src/shared/types/code';
import type { ModelEntry } from '../../src/shared/types/models';
import type { ProviderStatus } from '../../src/shared/types/providers';

// The IPC layer needs Electron; the side chat only uses it to register handlers.
vi.mock('../../src/main/ipc/register', () => ({ handle: () => undefined }));

process.env.CELLAR_HOME = join(tmpdir(), `cellar-side-chat-home-${process.pid}`);

const { initPaths } = await import('../../src/main/system/paths');
const { closeDatabase, openDatabase } = await import('../../src/main/db/client');
const { SqliteChatStore } = await import('../../src/main/db/chat-store');
const { settings } = await import('../../src/main/services/settings');
const { providers } = await import('../../src/main/providers/registry');
const { bus } = await import('../../src/main/lib/events');
const sideChat = await import('../../src/main/code/side-chat');
type ChatRequest = import('../../src/main/providers/types').ChatRequest;
type Provider = import('../../src/main/providers/types').Provider;

const { buildSideChatPrompt, clipTranscript, parseSideChatRequest, startSideChat, stopSideChat, stopAllSideChats } = sideChat;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function task(overrides: Partial<TaskState> = {}): TaskState {
  return {
    folder: 'C:/work/shop',
    workDir: 'C:/Users/me/.cellar/worktrees/shop-fix-login',
    permissionMode: 'auto-edits',
    status: 'done',
    todos: [],
    files: [],
    sources: [],
    allowCommands: false,
    allowedDomains: [],
    steps: 3,
    maxSteps: 40,
    code: { repoRoot: 'C:/work/shop', repoName: 'shop', isGit: true, worktree: true, branch: 'cellar/fix-login', baseBranch: 'main', mode: 'code' },
    ...overrides,
  };
}

let seq = 0;
function msg(role: Message['role'], parentId: string | null, fields: Partial<Message> = {}): Message {
  seq += 1;
  return { id: `m${seq}`, conversationId: 'c1', parentId, role, content: '', attachments: [], status: 'complete', createdAt: seq, ...fields };
}

/** A small session: the user asks for a fix, the agent reads and edits auth.ts. */
function session(extraParts: AgentPart[] = []) {
  const user = msg('user', null, { content: 'Fix the login bug' });
  const parts: AgentPart[] = [
    { type: 'text', round: 0, text: "I'll look at the auth code." },
    { type: 'tool', id: 't1', round: 0, name: 'read_file', argsText: '', args: { path: 'src/auth.ts' }, status: 'done', result: 'export function login(token) { return true; }' },
    { type: 'tool', id: 't2', round: 1, name: 'edit_file', argsText: '', args: { path: 'src/auth.ts' }, status: 'done', result: 'Edited src/auth.ts' },
    { type: 'text', round: 2, text: 'Changed auth.ts to validate the token expiry.' },
    ...extraParts,
  ];
  const assistant = msg('assistant', user.id, { content: 'done', parts });
  const conversation: Pick<Conversation, 'title' | 'task' | 'currentLeafId'> = { title: 'Fix login', task: task(), currentLeafId: assistant.id };
  return { conversation, messages: [user, assistant] };
}

const question = (content: string): SideChatMessage => ({ role: 'user', content });
const systemOf = (messages: { role: string; content: string }[]) => messages[0].content;
const transcriptOf = (system: string) => system.slice(system.indexOf('<session_transcript>\n') + 21, system.indexOf('\n</session_transcript>'));

describe('buildSideChatPrompt', () => {
  it('includes the session details, the transcript and the question', () => {
    const { conversation, messages } = session();
    const prompt = buildSideChatPrompt({ conversation, messages, side: [question('Why did it change auth.ts?')], contextLength: 16384, replyTokens: 2048 });
    const system = systemOf(prompt.messages);
    expect(prompt.messages[0].role).toBe('system');
    expect(system).toContain('cannot run tools');
    expect(system).toContain('Repository: shop (branch cellar/fix-login)');
    expect(system).toContain('Working folder: C:/Users/me/.cellar/worktrees/shop-fix-login');
    expect(system).toContain('Session: Fix login');
    const transcript = transcriptOf(system);
    expect(transcript).toContain('User: Fix the login bug');
    expect(transcript).toContain('Tool read_file({"path":"src/auth.ts"})');
    expect(transcript).toContain('Assistant: Changed auth.ts to validate the token expiry.');
    expect(prompt.messages.slice(1)).toEqual([{ role: 'user', content: 'Why did it change auth.ts?' }]);
    expect(prompt.transcriptClipped).toBe(false);
    expect(prompt.dropped).toBe(0);
  });

  it('follows the current branch only', () => {
    const { conversation, messages } = session();
    const other = msg('user', null, { content: 'An abandoned request' });
    const prompt = buildSideChatPrompt({ conversation, messages: [...messages, other], side: [question('Hi')], contextLength: 16384, replyTokens: 2048 });
    expect(systemOf(prompt.messages)).not.toContain('An abandoned request');
  });

  it('describes calls that are still running and turns that failed', () => {
    const { conversation, messages } = session([{ type: 'tool', id: 't3', round: 3, name: 'run_command', argsText: '', args: { command: 'npm test' }, status: 'running' }]);
    const failed = msg('assistant', messages[1].id, { status: 'error', error: 'The model is not loaded.' });
    const prompt = buildSideChatPrompt({ conversation: { ...conversation, currentLeafId: failed.id }, messages: [...messages, failed], side: [question('What happened?')], contextLength: 16384, replyTokens: 2048 });
    const transcript = transcriptOf(systemOf(prompt.messages));
    expect(transcript).toContain('run_command({"command":"npm test"}) → (Still running.)');
    expect(transcript).toContain('[This turn failed: The model is not loaded.]');
  });

  it('clips a long transcript to its share of the context window, keeping recent work', () => {
    const user = msg('user', null, { content: `START ${'a'.repeat(120_000)}` });
    const assistant = msg('assistant', user.id, { content: 'x', parts: [{ type: 'text', round: 0, text: 'LATEST WORK' }] });
    const prompt = buildSideChatPrompt({
      conversation: { title: 'Big', task: task(), currentLeafId: assistant.id },
      messages: [user, assistant],
      side: [question('Summarize')],
      contextLength: 8192,
      replyTokens: 2048,
    });
    const transcript = transcriptOf(systemOf(prompt.messages));
    expect(prompt.transcriptClipped).toBe(true);
    expect(transcript.length).toBeLessThanOrEqual(Math.floor(8192 * 0.4 * 3.2));
    expect(transcript.length).toBeGreaterThan(8000);
    expect(transcript).toContain('characters of the session omitted');
    expect(transcript.startsWith('User: START')).toBe(true);
    expect(transcript.endsWith('Assistant: LATEST WORK')).toBe(true);
  });

  it('drops the oldest side messages when they do not fit, keeping the latest question', () => {
    const { conversation, messages } = session();
    const side: SideChatMessage[] = [];
    for (let i = 0; i < 10; i++) side.push({ role: 'user', content: `question ${i} ${'q'.repeat(2000)}` }, { role: 'assistant', content: `answer ${i} ${'r'.repeat(2000)}` });
    side.push(question('What does the error mean?'));
    const prompt = buildSideChatPrompt({ conversation, messages, side, contextLength: 4096, replyTokens: 1024 });
    const kept = prompt.messages.slice(1);
    expect(prompt.dropped).toBeGreaterThan(0);
    expect(prompt.dropped).toBe(side.length - kept.length);
    expect(kept.at(-1)).toEqual({ role: 'user', content: 'What does the error mean?' });
    expect(kept[0].role).toBe('user');
    const tokens = prompt.messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 3.2) + 6, 0);
    expect(tokens).toBeLessThanOrEqual(4096 - 1024);
  });

  it('shortens a latest question that is too long on its own', () => {
    const { conversation, messages } = session();
    const prompt = buildSideChatPrompt({ conversation, messages, side: [question(`BEGIN ${'z'.repeat(90_000)} END`)], contextLength: 4096, replyTokens: 1024 });
    const last = prompt.messages.at(-1)!;
    expect(prompt.messages).toHaveLength(2);
    expect(last.role).toBe('user');
    expect(last.content.length).toBeLessThan(20_000);
    expect(last.content.startsWith('BEGIN')).toBe(true);
    expect(last.content.endsWith('END')).toBe(true);
  });

  it('handles an empty session', () => {
    const prompt = buildSideChatPrompt({ conversation: { title: '', task: undefined, currentLeafId: null }, messages: [], side: [question('Hello?')], contextLength: 8192, replyTokens: 2048 });
    expect(systemOf(prompt.messages)).toContain('(The session has no messages yet.)');
  });
});

describe('clipTranscript', () => {
  it('leaves short text alone and never exceeds the limit', () => {
    expect(clipTranscript('short', 100)).toBe('short');
    const text = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n');
    const clipped = clipTranscript(text, 2000);
    expect(clipped.length).toBeLessThanOrEqual(2000);
    expect(clipped).toContain('line 4999');
    expect(clipped).toContain('line 0');
  });
});

describe('parseSideChatRequest', () => {
  const valid = { requestId: 'r1', conversationId: 'c1', messages: [question('Why?')], model: { providerId: 'fake', modelId: 'm' }, thinking: 'off' };

  it('accepts a valid request', () => {
    expect(parseSideChatRequest(valid)).toEqual(valid);
  });

  it('rejects bad input with plain messages', () => {
    expect(() => parseSideChatRequest({ ...valid, messages: [] })).toThrow('Ask a question first.');
    expect(() => parseSideChatRequest({ ...valid, messages: [question('Why?'), { role: 'assistant', content: 'Because' }] })).toThrow('Ask a question first.');
    expect(() => parseSideChatRequest({ ...valid, messages: [question('   ')] })).toThrow('Ask a question first.');
    expect(() => parseSideChatRequest({ ...valid, messages: [question('x'.repeat(100_001))] })).toThrow('at most 100,000 characters');
    expect(() => parseSideChatRequest({ ...valid, messages: Array.from({ length: 61 }, () => question('q')) })).toThrow('too long');
    expect(() => parseSideChatRequest({ ...valid, messages: [{ role: 'system', content: 'x' }] })).toThrow('invalid');
    expect(() => parseSideChatRequest({ ...valid, thinking: 'max' })).toThrow('invalid');
    expect(() => parseSideChatRequest({ ...valid, requestId: '' })).toThrow('invalid');
  });
});

type Script = (req: ChatRequest) => StreamEvent[];

class FakeProvider implements Provider {
  readonly id = 'fake';
  readonly kind = 'openai' as const;
  readonly name = 'Fake';
  readonly canManageModels = false;
  readonly canDownload = false;
  requests: ChatRequest[] = [];
  delayMs = 1;
  script: Script = () => [{ type: 'text', delta: 'ok' }];

  async status(): Promise<ProviderStatus> {
    return { id: this.id, kind: this.kind, name: this.name, baseUrl: '', state: 'online', canManageModels: false, canDownload: false };
  }
  async listModels(): Promise<ModelEntry[]> {
    return [];
  }
  async *chat(req: ChatRequest): AsyncGenerator<StreamEvent> {
    this.requests.push(req);
    for (const event of this.script(req)) {
      if (req.signal.aborted) throw req.signal.reason;
      await sleep(this.delayMs);
      yield event;
    }
    yield { type: 'done', stopReason: 'stop' };
  }
}

describe('side chat streaming', () => {
  const fake = new FakeProvider();
  const store = new SqliteChatStore();
  let userData: string;
  let currentEntry: ModelEntry;
  let conversationId = '';

  const entry = (overrides: Partial<ModelEntry> = {}): ModelEntry => ({
    ref: { providerId: 'fake', modelId: 'side' },
    providerKind: 'openai',
    providerName: 'Fake',
    displayName: 'Fake Model',
    contextLength: 16384,
    capabilities: { vision: false, tools: true, reasoning: true, embedding: false },
    reasoningStyle: 'toggle',
    loaded: true,
    ...overrides,
  });

  function createSession(kind: ConversationKind): string {
    const { messages } = session();
    const id = `conv-${kind}-${Math.random().toString(36).slice(2)}`;
    const now = Date.now();
    store.createConversation({ id, kind, title: 'Fix login', projectId: null, starred: false, currentLeafId: null, settings: {}, task: kind === 'chat' ? undefined : task(), incognito: false, createdAt: now, updatedAt: now });
    for (const m of messages) store.insertMessage({ ...m, id: `${id}-${m.id}`, parentId: m.parentId ? `${id}-${m.parentId}` : null, conversationId: id });
    store.updateConversation(id, { currentLeafId: `${id}-${messages[1].id}` });
    return id;
  }

  async function ask(requestId: string, convId = conversationId, onEvent?: (event: SideChatEvent) => void) {
    const events: SideChatEvent[] = [];
    const finished = new Promise<void>((resolve) => {
      const off = bus.on('code:side', (event) => {
        if (event.requestId !== requestId) return;
        events.push(event);
        onEvent?.(event);
        if (event.done || event.error) {
          off();
          resolve();
        }
      });
    });
    startSideChat({ requestId, conversationId: convId, messages: [question('Why did it change auth.ts?')], model: currentEntry.ref, thinking: 'on' });
    await Promise.race([finished, sleep(10_000).then(() => Promise.reject(new Error('Timed out waiting')))]);
    return events;
  }

  beforeAll(async () => {
    userData = await mkdtemp(join(tmpdir(), 'cellar-side-chat-data-'));
    initPaths(userData, userData);
    closeDatabase();
    openDatabase(':memory:');
    settings.update({ autoTitle: false });
    (providers as unknown as { get: (id: string) => Provider }).get = () => fake;
    (providers as unknown as { findModel: () => Promise<ModelEntry> }).findModel = async () => currentEntry;
    conversationId = createSession('code');
  });

  afterAll(async () => {
    stopAllSideChats();
    await rm(userData, { recursive: true, force: true }).catch(() => undefined);
    await rm(process.env.CELLAR_HOME!, { recursive: true, force: true }).catch(() => undefined);
  });

  beforeEach(() => {
    fake.requests = [];
    fake.delayMs = 1;
    currentEntry = entry();
  });

  it('streams batched deltas without tools and ends with done', async () => {
    const words = Array.from({ length: 60 }, (_, i) => `w${i} `);
    fake.script = () => [{ type: 'reasoning', delta: 'Looking at the edit. ' }, ...words.map((delta): StreamEvent => ({ type: 'text', delta }))];
    const events = await ask('stream-1');
    expect(events.at(-1)).toEqual({ requestId: 'stream-1', conversationId, done: true });
    expect(events.map((e) => e.delta ?? '').join('')).toBe(words.join(''));
    expect(events.map((e) => e.reasoning ?? '').join('')).toBe('Looking at the edit. ');
    expect(events.length).toBeLessThan(words.length);
    expect(events.every((e) => e.conversationId === conversationId && !e.error)).toBe(true);

    const req = fake.requests[0];
    expect(req.tools).toBeUndefined();
    expect(req.thinking).toBe('on');
    expect(req.messages[0].role).toBe('system');
    expect(req.messages[0].content).toContain('User: Fix the login bug');
    expect(req.messages[0].content).toContain('Repository: shop (branch cellar/fix-login)');
    expect(req.messages.at(-1)).toEqual({ role: 'user', content: 'Why did it change auth.ts?' });
  });

  it('adds nothing to the session', async () => {
    const before = store.listMessages(conversationId).length;
    fake.script = () => [{ type: 'text', delta: 'Because the token was never checked.' }];
    await ask('stream-2');
    expect(store.listMessages(conversationId)).toHaveLength(before);
  });

  it('stops quietly', async () => {
    fake.delayMs = 20;
    fake.script = () => Array.from({ length: 200 }, (): StreamEvent => ({ type: 'text', delta: 'more ' }));
    let stopped = false;
    const events = await ask('stream-stop', conversationId, (event) => {
      if (event.delta && !stopped) {
        stopped = true;
        stopSideChat('stream-stop');
      }
    });
    expect(events.at(-1)?.done).toBe(true);
    expect(events.some((e) => e.error)).toBe(false);
  });

  it('reports provider errors and empty replies', async () => {
    fake.script = () => [{ type: 'text', delta: 'Partial' }, { type: 'error', message: 'Server crashed' }];
    expect((await ask('err-1')).at(-1)?.error).toBe('Server crashed');
    fake.script = () => [];
    expect((await ask('err-2')).at(-1)?.error).toBe('The model returned an empty response.');
  });

  it('refuses embedding models and non-code conversations', async () => {
    currentEntry = entry({ displayName: 'Nomic Embed', capabilities: { vision: false, tools: false, reasoning: false, embedding: true } });
    expect((await ask('embed')).at(-1)?.error).toBe('Nomic Embed is an embedding model and cannot chat.');
    currentEntry = entry();
    const chatId = createSession('chat');
    expect((await ask('plain-chat', chatId)).at(-1)?.error).toBe('Side chat is only available in Code sessions.');
    expect(fake.requests).toHaveLength(0);
  });

  it('rejects an invalid request before streaming', () => {
    expect(() => startSideChat({ requestId: 'bad', conversationId, messages: [], model: currentEntry.ref, thinking: 'off' })).toThrow('Ask a question first.');
  });
});
