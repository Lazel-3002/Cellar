import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AgentPart, ToolPart } from '../../src/shared/types/agent';
import type { StreamEvent } from '../../src/shared/types/chat';
import type { ModelEntry } from '../../src/shared/types/models';
import type { ProviderStatus } from '../../src/shared/types/providers';

process.env.CELLAR_HOME = join(tmpdir(), `cellar-runner-home-${process.pid}`);

const { initPaths } = await import('../../src/main/system/paths');
const { closeDatabase, openDatabase } = await import('../../src/main/db/client');
const { settings } = await import('../../src/main/services/settings');
const { providers } = await import('../../src/main/providers/registry');
const { chat } = await import('../../src/main/chat/orchestrator');
const { COMPACTION_SYSTEM } = await import('../../src/main/agent/prompt');
type ChatRequest = import('../../src/main/providers/types').ChatRequest;
type Provider = import('../../src/main/providers/types').Provider;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Script = (req: ChatRequest) => StreamEvent[];

class FakeProvider implements Provider {
  readonly id = 'fake';
  readonly kind = 'openai' as const;
  readonly name = 'Fake';
  readonly canManageModels = false;
  readonly canDownload = false;
  requests: ChatRequest[] = [];
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
      await sleep(1);
      yield event;
    }
    yield { type: 'done', stopReason: 'stop' };
  }
}

const fake = new FakeProvider();
let root: string;
let userData: string;

function entry(overrides: Partial<ModelEntry> = {}): ModelEntry {
  return {
    ref: { providerId: 'fake', modelId: 'agent' },
    providerKind: 'openai',
    providerName: 'Fake',
    displayName: 'Fake Agent',
    contextLength: 32768,
    capabilities: { vision: false, tools: true, reasoning: false, embedding: false },
    reasoningStyle: 'none',
    loaded: true,
    ...overrides,
  };
}

let currentEntry = entry();
const call = (name: string, args: unknown, id = `c${Math.random()}`): StreamEvent => ({ type: 'tool_call', id, name, argumentsDelta: JSON.stringify(args) });
const toolTurns = (req: ChatRequest) => req.messages.filter((m) => m.role === 'tool').length;
const lastTool = (req: ChatRequest) => [...req.messages].reverse().find((m) => m.role === 'tool');

async function waitFor<T>(fn: () => T | undefined | false, timeout = 10_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error('Timed out waiting');
    await sleep(20);
  }
}

async function startTask(content: string, permissionMode: 'ask' | 'auto-edits' | 'plan', folder: string | null = root) {
  const result = await chat.send({ content, attachmentIds: [], model: currentEntry.ref, thinking: 'off', task: { folder, permissionMode } });
  return result;
}

function message(conversationId: string, messageId: string) {
  return chat.getConversation(conversationId).messages.find((m) => m.id === messageId)!;
}

async function finished(conversationId: string, messageId: string) {
  return waitFor(() => {
    const m = message(conversationId, messageId);
    return m.status !== 'streaming' ? m : undefined;
  });
}

const tools = (parts: AgentPart[] | undefined) => (parts ?? []).filter((p): p is ToolPart => p.type === 'tool');

beforeAll(async () => {
  userData = await mkdtemp(join(tmpdir(), 'cellar-runner-data-'));
  root = await mkdtemp(join(tmpdir(), 'cellar-runner-ws-'));
  initPaths(userData, userData);
  closeDatabase();
  openDatabase(':memory:');
  settings.update({ autoTitle: false, coworkNotifications: false });
  (providers as unknown as { get: (id: string) => Provider }).get = () => fake;
  (providers as unknown as { findModel: () => Promise<ModelEntry> }).findModel = async () => currentEntry;
});

afterAll(async () => {
  chat.stopAll();
  await rm(root, { recursive: true, force: true });
  await rm(userData, { recursive: true, force: true }).catch(() => undefined);
  await rm(process.env.CELLAR_HOME!, { recursive: true, force: true }).catch(() => undefined);
});

beforeEach(() => {
  fake.requests = [];
  currentEntry = entry();
  settings.update({ coworkMaxSteps: 40, coworkWebAccess: true });
});

describe('TaskRunner', () => {
  it('plans, reads, writes and reports back with native tool calls', async () => {
    await writeFile(join(root, 'notes.md'), '- milk\n- bread\n');
    fake.script = (req) => {
      switch (toolTurns(req)) {
        case 0:
          return [{ type: 'text', delta: "I'll read your notes." }, call('todo_write', { todos: [{ content: 'Read notes', status: 'in_progress' }, { content: 'Write list', status: 'pending' }] }), call('read_file', { path: 'notes.md' })];
        case 2:
          return [call('write_file', { path: 'shopping/list.md', content: '# Shopping\n- milk\n- bread\n' })];
        default:
          return [{ type: 'text', delta: 'Created shopping/list.md with 2 items.' }];
      }
    };
    const { conversationId, assistantMessageId } = await startTask('Make a shopping list from my notes', 'auto-edits');
    const done = await finished(conversationId, assistantMessageId);
    expect(done.status).toBe('complete');
    expect(await readFile(join(root, 'shopping', 'list.md'), 'utf8')).toContain('- bread');
    expect(tools(done.parts).map((t) => [t.name, t.status])).toEqual([
      ['todo_write', 'done'],
      ['read_file', 'done'],
      ['write_file', 'done'],
    ]);
    expect(done.content).toBe("I'll read your notes.\n\nCreated shopping/list.md with 2 items.");
    const conversation = chat.getConversation(conversationId).conversation;
    expect(conversation.kind).toBe('task');
    expect(conversation.task).toMatchObject({ status: 'done', files: [{ path: 'shopping/list.md', action: 'created' }], todos: [{ content: 'Read notes' }, { content: 'Write list' }] });

    // Second request: the read result went back to the model as a tool message with the file content.
    const second = fake.requests[1];
    expect(second.tools?.map((t) => t.name)).toContain('write_file');
    expect(second.messages[0].content).toContain(`Working folder: ${root}`);
    expect(second.messages.find((m) => m.role === 'tool' && m.toolName === 'read_file')?.content).toContain('- milk');
  });

  it('waits for approval in ask mode and passes a denial back to the model', async () => {
    fake.script = (req) =>
      toolTurns(req) === 0 ? [call('write_file', { path: 'denied.txt', content: 'nope' })] : [{ type: 'text', delta: `Understood: ${lastTool(req)?.content}` }];
    const { conversationId, assistantMessageId } = await startTask('Write a file', 'ask');
    const pending = await waitFor(() => tools(message(conversationId, assistantMessageId).parts).find((t) => t.status === 'awaiting-approval'));
    expect(pending.approval).toMatchObject({ kind: 'write', title: 'Create denied.txt' });
    expect(chat.getConversation(conversationId).conversation.task?.status).toBe('waiting');
    chat.approve(assistantMessageId, pending.id, { action: 'deny', feedback: 'Put it in notes instead' });
    const done = await finished(conversationId, assistantMessageId);
    expect(tools(done.parts)[0]).toMatchObject({ status: 'denied', feedback: 'Put it in notes instead' });
    expect(done.content).toContain('The user denied this action. Their note: "Put it in notes instead"');
    await expect(readFile(join(root, 'denied.txt'))).rejects.toThrow();
  });

  it('switches to auto-accept edits after "allow all" and stops cleanly while waiting', async () => {
    fake.script = (req) => {
      const n = toolTurns(req);
      if (n === 0) return [call('write_file', { path: 'one.txt', content: '1' })];
      if (n === 1) return [call('write_file', { path: 'two.txt', content: '2' })];
      return [call('run_command', { command: 'Get-ChildItem' })];
    };
    const { conversationId, assistantMessageId } = await startTask('Write two files then list', 'ask');
    const first = await waitFor(() => tools(message(conversationId, assistantMessageId).parts).find((t) => t.status === 'awaiting-approval'));
    chat.approve(assistantMessageId, first.id, { action: 'allow-all' });
    const command = await waitFor(() => tools(message(conversationId, assistantMessageId).parts).find((t) => t.name === 'run_command' && t.status === 'awaiting-approval'));
    expect(await readFile(join(root, 'two.txt'), 'utf8')).toBe('2');
    expect(command.approval).toMatchObject({ kind: 'command', preview: 'Get-ChildItem' });
    chat.stop(assistantMessageId);
    const done = await finished(conversationId, assistantMessageId);
    expect(done.status).toBe('stopped');
    expect(tools(done.parts).map((t) => t.status)).toEqual(['done', 'done', 'cancelled']);
    expect(chat.getConversation(conversationId).conversation.task).toMatchObject({ permissionMode: 'auto-edits', status: 'stopped' });

    chat.setTaskPermissionMode(conversationId, 'plan');
    expect(chat.getConversation(conversationId).conversation.task?.permissionMode).toBe('plan');
    expect(settings.get().coworkPermissionMode).toBe('ask');
  });

  it('keeps plan mode read-only', async () => {
    fake.script = (req) => (toolTurns(req) === 0 ? [call('write_file', { path: 'plan.txt', content: 'x' })] : [{ type: 'text', delta: 'Here is the plan.' }]);
    const { conversationId, assistantMessageId } = await startTask('Plan a cleanup', 'plan');
    const done = await finished(conversationId, assistantMessageId);
    expect(fake.requests[0].tools?.map((t) => t.name)).not.toContain('write_file');
    expect(fake.requests[0].messages[0].content).toContain('You are in plan mode');
    expect(tools(done.parts)[0]).toMatchObject({ status: 'error', error: expect.stringContaining('not available in plan mode') });
  });

  it('uses the text protocol for models without native tools', async () => {
    currentEntry = entry({ capabilities: { vision: false, tools: false, reasoning: false, embedding: false } });
    fake.script = (req) =>
      req.messages.some((m) => m.role === 'user' && m.content.includes('<tool_response name="list_dir">'))
        ? [{ type: 'text', delta: 'The folder has notes.md.' }]
        : [{ type: 'text', delta: 'Checking.\n<tool_call>\n{"name": "list_dir", "arguments": {}}' }];
    const { conversationId, assistantMessageId } = await startTask('What is in the folder?', 'ask');
    const done = await finished(conversationId, assistantMessageId);
    expect(fake.requests[0].tools).toBeUndefined();
    expect(fake.requests[0].params.stop).toContain('</tool_call>');
    expect(fake.requests[0].messages[0].content).toContain('- list_dir(');
    expect(tools(done.parts)[0]).toMatchObject({ name: 'list_dir', status: 'done' });
    expect(done.content).toBe('Checking.\n\nThe folder has notes.md.');
  });

  it('salvages <tool_call> text from native models whose server did not parse it', async () => {
    fake.script = (req) => (toolTurns(req) === 0 ? [{ type: 'text', delta: '<tool_call>{"name":"glob","arguments":{"pattern":"*.md"}}</tool_call>' }] : [{ type: 'text', delta: 'Found them.' }]);
    const { conversationId, assistantMessageId } = await startTask('Find markdown', 'ask');
    const done = await finished(conversationId, assistantMessageId);
    expect(tools(done.parts)[0]).toMatchObject({ name: 'glob', status: 'done' });
    expect(done.content).toBe('Found them.');
  });

  it('pauses at the step limit and stops models that repeat themselves', async () => {
    settings.update({ coworkMaxSteps: 5 });
    let n = 0;
    fake.script = () => [call('list_dir', { depth: 1 + ((n++ % 3) as number) })];
    const limited = await startTask('Loop forever', 'ask');
    const paused = await finished(limited.conversationId, limited.assistantMessageId);
    expect(paused.status).toBe('complete');
    expect(paused.content).toContain('Paused after 5 steps');
    expect(chat.getConversation(limited.conversationId).conversation.task?.status).toBe('stopped');

    settings.update({ coworkMaxSteps: 40 });
    fake.script = () => [call('list_dir', {})];
    const looping = await startTask('Repeat', 'ask');
    const paused2 = await finished(looping.conversationId, looping.assistantMessageId);
    expect(paused2.status).toBe('complete');
    expect(paused2.content).toContain('repeated the same list_dir call');
    expect(paused2.content).toContain('Reply "continue"');
    expect(chat.getConversation(looping.conversationId).conversation.task?.status).toBe('stopped');
    expect(tools(paused2.parts)[1].result).toContain('You already made this exact call');
  });

  it('allows reading a file again after changing it', async () => {
    await writeFile(join(root, 'check.txt'), 'old');
    const script = [
      call('read_file', { path: 'check.txt' }),
      call('write_file', { path: 'check.txt', content: 'new' }),
      call('read_file', { path: 'check.txt' }),
    ];
    fake.script = (req) => (toolTurns(req) < script.length ? [script[toolTurns(req)]] : [{ type: 'text', delta: 'Verified.' }]);
    const { conversationId, assistantMessageId } = await startTask('Update and verify', 'auto-edits');
    const done = await finished(conversationId, assistantMessageId);
    const reads = tools(done.parts).filter((t) => t.name === 'read_file');
    expect(reads[1].result).toBe('new');
  });

  it('explains when the context window is too small for Cowork at all', async () => {
    currentEntry = entry({ contextLength: 2048 });
    fake.script = () => [{ type: 'text', delta: 'never called' }];
    const { conversationId, assistantMessageId } = await startTask('Anything', 'ask');
    const failed = await finished(conversationId, assistantMessageId);
    expect(failed.error).toContain('Cowork needs more room than the model');
    expect(fake.requests).toHaveLength(0);
  });

  it('compacts the history when the context window fills up', async () => {
    currentEntry = entry({ contextLength: 8192 });
    for (const name of ['a', 'b', 'c']) await writeFile(join(root, `${name}.txt`), Array.from({ length: 110 }, (_, i) => `${name.repeat(64)} ${i}`).join('\n'));
    fake.script = (req) => {
      if (req.messages[0].content === COMPACTION_SYSTEM) return [{ type: 'text', delta: 'Read a.txt, b.txt and c.txt; they only repeat letters.' }];
      if (req.messages.some((m) => m.content.includes('<context_summary>'))) return [{ type: 'text', delta: 'All three files are filler.' }];
      const n = toolTurns(req);
      if (n < 3) return [call('read_file', { path: `${'abc'[n]}.txt` })];
      return [{ type: 'text', delta: 'All three files are filler.' }];
    };
    const { conversationId, assistantMessageId } = await startTask('Read the three files', 'ask');
    const done = await finished(conversationId, assistantMessageId);
    expect(done.status).toBe('complete');
    const compaction = done.parts?.find((p) => p.type === 'compaction');
    expect(compaction).toMatchObject({ summary: expect.stringContaining('b.txt') });
    const last = fake.requests.at(-1)!;
    expect(last.messages[1].content).toContain('<context_summary>');
    expect(last.messages.filter((m) => m.role === 'tool')).toHaveLength(0);
  });

  it('creates a scratch folder when the user skips choosing one, and continues in follow-ups', async () => {
    fake.script = (req) => (toolTurns(req) === 0 && !req.messages.some((m) => m.role === 'assistant') ? [call('write_file', { path: 'draft.md', content: 'v1' })] : [{ type: 'text', delta: 'Done.' }]);
    const { conversationId, assistantMessageId } = await startTask('Draft something', 'auto-edits', null);
    await finished(conversationId, assistantMessageId);
    const task = chat.getConversation(conversationId).conversation.task!;
    expect(task.folder).toBeNull();
    expect(task.workDir.startsWith(join(process.env.CELLAR_HOME!, 'tasks'))).toBe(true);
    expect(await readFile(join(task.workDir, 'draft.md'), 'utf8')).toBe('v1');

    const followUp = await chat.send({ conversationId, content: 'Thanks', attachmentIds: [], model: currentEntry.ref, thinking: 'off' });
    const reply = await finished(conversationId, followUp.assistantMessageId);
    expect(reply.content).toBe('Done.');
    const history = fake.requests.at(-1)!.messages.map((m) => m.role);
    expect(history).toEqual(['system', 'user', 'assistant', 'tool', 'assistant', 'user']);
  });
});
