import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AgentPart, ToolPart } from '../../src/shared/types/agent';
import type { CodeSessionInfo } from '../../src/shared/types/code';
import type { StreamEvent } from '../../src/shared/types/chat';
import type { ModelEntry } from '../../src/shared/types/models';
import type { ProviderStatus } from '../../src/shared/types/providers';

process.env.CELLAR_HOME = join(tmpdir(), `cellar-code-home-${process.pid}`);

const { initPaths } = await import('../../src/main/system/paths');
const { closeDatabase, openDatabase } = await import('../../src/main/db/client');
const { settings } = await import('../../src/main/services/settings');
const { providers } = await import('../../src/main/providers/registry');
const { chat } = await import('../../src/main/chat/orchestrator');
const git = await import('../../src/main/code/git');
const { buildCodePrompt } = await import('../../src/main/code/prompt');
const { codeToolsFor, findTool, ALL_TOOLS } = await import('../../src/main/agent/tools');
const { readManifest } = await import('../../src/main/code/snapshots');
const { codePermissionMode } = await import('../../src/shared/code-commands');
type ChatRequest = import('../../src/main/providers/types').ChatRequest;
type Provider = import('../../src/main/providers/types').Provider;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Cellar Test', '-c', 'user.email=test@cellar.local', ...args], { cwd, encoding: 'utf8', windowsHide: true });
}

async function makeRepo(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  sh(dir, 'init', '-q', '-b', 'main');
  await writeFile(join(dir, 'app.js'), 'export function add(a, b) {\n  return a - b;\n}\n');
  await writeFile(join(dir, 'CELLAR.md'), '# Memory\nRun tests with `node test.js`.\n');
  await writeFile(join(dir, '.gitignore'), '.env\n');
  await writeFile(join(dir, '.env'), 'SECRET=1\n');
  await writeFile(join(dir, '.worktreeinclude'), '.env\n');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'initial');
  return dir;
}

class FakeProvider implements Provider {
  readonly id = 'fake';
  readonly kind = 'openai' as const;
  readonly name = 'Fake';
  readonly canManageModels = false;
  readonly canDownload = false;
  requests: ChatRequest[] = [];
  script: (req: ChatRequest) => StreamEvent[] = () => [{ type: 'text', delta: 'ok' }];

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
const entry: ModelEntry = {
  ref: { providerId: 'fake', modelId: 'coder' },
  providerKind: 'openai',
  providerName: 'Fake',
  displayName: 'Fake Coder',
  contextLength: 32768,
  capabilities: { vision: false, tools: true, reasoning: false, embedding: false },
  reasoningStyle: 'none',
  loaded: true,
};
const call = (name: string, args: unknown): StreamEvent => ({ type: 'tool_call', id: `c${Math.random()}`, name, argumentsDelta: JSON.stringify(args) });
const toolTurns = (req: ChatRequest) => req.messages.filter((m) => m.role === 'tool').length;
const tools = (parts: AgentPart[] | undefined) => (parts ?? []).filter((p): p is ToolPart => p.type === 'tool');

async function waitFor<T>(fn: () => T | undefined | false, timeout = 15_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error('Timed out waiting');
    await sleep(20);
  }
}

async function finished(conversationId: string, messageId: string) {
  return waitFor(() => {
    const m = chat.getConversation(conversationId).messages.find((x) => x.id === messageId);
    return m && m.status !== 'streaming' ? m : undefined;
  });
}

let userData: string;
const cleanup: string[] = [];

beforeAll(async () => {
  userData = await mkdtemp(join(tmpdir(), 'cellar-code-data-'));
  initPaths(userData, userData);
  closeDatabase();
  openDatabase(':memory:');
  settings.update({ autoTitle: false, coworkNotifications: false });
  (providers as unknown as { get: (id: string) => Provider }).get = () => fake;
  (providers as unknown as { findModel: () => Promise<ModelEntry> }).findModel = async () => entry;
});

afterAll(async () => {
  chat.stopAll();
  await sleep(200);
  for (const dir of [...cleanup, userData, process.env.CELLAR_HOME!]) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

beforeEach(() => {
  fake.requests = [];
  settings.update({ codeMaxSteps: 40 });
});

describe('git helpers', () => {
  it('makes branch slugs from requests', () => {
    expect(git.branchSlug('Fix the login bug!')).toBe('fix-the-login-bug');
    expect(git.branchSlug('Ünïcode çharacters and more words here')).toBe('unicode-characters-and-more-words');
    expect(git.branchSlug('???')).toBe('session');
  });

  it('describes repositories and plain folders', async () => {
    const repo = await makeRepo('cellar-git-info-');
    cleanup.push(repo);
    await mkdir(join(repo, 'src'));
    const info = await git.repoInfo(join(repo, 'src'));
    expect(info.isGit).toBe(true);
    expect(info.branch).toBe('main');
    expect(info.branches).toEqual(['main']);
    expect(info.dirty).toBe(false);
    expect(info.memoryFile).toBe('CELLAR.md');
    await writeFile(join(repo, 'app.js'), 'changed\n');
    expect((await git.repoInfo(repo)).dirty).toBe(true);

    const plain = await mkdtemp(join(tmpdir(), 'cellar-plain-'));
    cleanup.push(plain);
    const plainInfo = await git.repoInfo(plain);
    expect(plainInfo.isGit).toBe(false);
    expect(plainInfo.memoryFile).toBeUndefined();
  });

  it('creates worktrees with included ignored files and removes them', async () => {
    const repo = await makeRepo('cellar-git-wt-');
    cleanup.push(repo);
    const dir = join(process.env.CELLAR_HOME!, 'worktrees', 'test-wt');
    const { commit } = await git.createWorktree({ repoRoot: repo, dir, branch: 'cellar/test', base: 'main' });
    expect(commit).toMatch(/^[0-9a-f]{40}$/);
    expect(await readFile(join(dir, '.env'), 'utf8')).toBe('SECRET=1\n');
    expect(await git.currentBranch(dir)).toBe('cellar/test');
    expect(await git.branchExists(repo, 'cellar/test')).toBe(true);
    await git.removeWorktree(repo, dir, 'cellar/test', true);
    expect(await stat(dir).catch(() => null)).toBeNull();
    expect(await git.branchExists(repo, 'cellar/test')).toBe(false);
  });
});

describe('code prompt and tools', () => {
  const code: CodeSessionInfo = { repoRoot: 'C:\\repo', repoName: 'repo', isGit: true, worktree: true, branch: 'cellar/x', baseBranch: 'main', baseCommit: 'abc', mode: 'code' };
  const base = { modelName: 'M', userName: '', preferences: '', workDir: 'C:\\wt', allowCommands: false, toolNames: ['read_file', 'edit_file', 'run_command', 'todo_write'], shell: 'powershell' as const };

  it('describes the worktree, memory and mode', () => {
    const prompt = buildCodePrompt({ ...base, code, permissionMode: 'ask', memory: { path: 'CELLAR.md', content: 'Use pnpm.' }, userMemory: 'Prefer tabs.' });
    expect(prompt).toContain('own git worktree on branch cellar/x, created from main');
    expect(prompt).toContain('<project_memory file="CELLAR.md">\nUse pnpm.');
    expect(prompt).toContain('<user_memory>');
    expect(prompt).toContain('approves each file change');
    expect(prompt).toContain('";" (not "&&")');
    expect(buildCodePrompt({ ...base, code: { ...code, mode: 'ask' }, permissionMode: 'plan' })).toContain('You are in Ask mode');
    expect(buildCodePrompt({ ...base, code: { ...code, mode: 'plan' }, permissionMode: 'plan' })).toContain('You are in Plan mode');
    expect(buildCodePrompt({ ...base, code, permissionMode: 'auto-edits', shell: 'pwsh' })).toContain('PowerShell 7');
  });

  it('offers code tools per mode', () => {
    const names = (mode: 'ask' | 'plan' | 'code', auto = false) => codeToolsFor(mode, codePermissionMode(mode, auto), { coworkWebAccess: false }).map((t) => t.name);
    expect(names('code')).toEqual(['list_dir', 'read_file', 'glob', 'grep', 'todo_write', 'write_file', 'edit_file', 'run_command']);
    expect(names('plan')).toEqual(['list_dir', 'read_file', 'glob', 'grep', 'todo_write']);
    expect(names('ask')).toEqual(['list_dir', 'read_file', 'glob', 'grep']);
    expect(codeToolsFor('code', 'ask', { coworkWebAccess: true }).map((t) => t.name)).toContain('web_fetch');
  });

  it('maps tool names from other agents', () => {
    expect(findTool(ALL_TOOLS, 'Read')?.name).toBe('read_file');
    expect(findTool(ALL_TOOLS, 'Bash')?.name).toBe('run_command');
    expect(findTool(ALL_TOOLS, 'str_replace')?.name).toBe('edit_file');
    expect(findTool(ALL_TOOLS, 'TodoWrite')?.name).toBe('todo_write');
    expect(findTool(ALL_TOOLS, 'LS')?.name).toBe('list_dir');
  });
});

describe('Code sessions', () => {
  it('works in a new worktree and leaves the checkout untouched', async () => {
    const repo = await makeRepo('cellar-code-run-');
    cleanup.push(repo);
    fake.script = (req) => {
      switch (toolTurns(req)) {
        case 0:
          return [call('Read', { file_path: 'app.js' })];
        case 1:
          return [call('edit_file', { path: 'app.js', old_string: 'return a - b;', new_string: 'return a + b;' })];
        default:
          return [{ type: 'text', delta: 'Fixed add() in app.js.' }];
      }
    };
    const { conversationId, assistantMessageId } = await chat.send({
      content: 'Fix the add function',
      attachmentIds: [],
      model: entry.ref,
      thinking: 'off',
      code: { folder: repo, mode: 'code', autoAcceptEdits: true, worktree: true },
    });
    const done = await finished(conversationId, assistantMessageId);
    expect(done.status).toBe('complete');
    const { conversation } = chat.getConversation(conversationId);
    expect(conversation.kind).toBe('code');
    const task = conversation.task!;
    expect(task.code?.worktree).toBe(true);
    expect(task.code?.branch).toMatch(/^cellar\/fix-the-add-function-[0-9a-f]{6}$/);
    expect(task.code?.baseBranch).toBe('main');
    expect(task.workDir).not.toBe(repo);
    cleanup.push(task.workDir);

    expect(await readFile(join(task.workDir, 'app.js'), 'utf8')).toContain('return a + b;');
    expect(await readFile(join(repo, 'app.js'), 'utf8')).toContain('return a - b;');
    expect(tools(done.parts).map((t) => [t.name, t.status])).toEqual([
      ['read_file', 'done'],
      ['edit_file', 'done'],
    ]);

    const system = String(fake.requests[0].messages[0].content);
    expect(system).toContain("Cellar's Code mode");
    expect(system).toContain('Run tests with `node test.js`.');
    expect(fake.requests[0].tools?.map((t) => t.name)).not.toContain('create_docx');

    const summaries = (await import('../../src/main/db/chat-store')).listConversations({ kind: 'code' });
    expect(summaries.find((s) => s.id === conversationId)).toMatchObject({ repoName: conversation.task!.code!.repoName, branch: task.code!.branch, codeMode: 'code' });
    expect((await import('../../src/main/db/chat-store')).listConversations({ kinds: ['chat', 'task'] }).some((s) => s.id === conversationId)).toBe(false);
  });

  it('keeps Ask mode read-only and lets the mode change for the next turn', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'cellar-code-ask-'));
    cleanup.push(plain);
    await writeFile(join(plain, 'notes.txt'), 'hello\n');
    fake.script = (req) => (toolTurns(req) === 0 ? [call('write_file', { path: 'notes.txt', content: 'bye\n' })] : [{ type: 'text', delta: 'I cannot change files in Ask mode.' }]);
    const first = await chat.send({ content: 'Change notes', attachmentIds: [], model: entry.ref, thinking: 'off', code: { folder: plain, mode: 'ask', autoAcceptEdits: false, worktree: true } });
    const done = await finished(first.conversationId, first.assistantMessageId);
    const step = tools(done.parts)[0];
    expect(step.status).toBe('error');
    expect(step.error).toContain('not available in Ask mode');
    expect(await readFile(join(plain, 'notes.txt'), 'utf8')).toBe('hello\n');
    expect(chat.getConversation(first.conversationId).conversation.task?.code?.isGit).toBe(false);

    chat.setCodeMode(first.conversationId, 'code', true);
    const task = chat.getConversation(first.conversationId).conversation.task!;
    expect(task.permissionMode).toBe('auto-edits');
    expect(task.code?.mode).toBe('code');

    fake.script = (req) => (toolTurns(req) === 1 ? [call('write_file', { path: 'notes.txt', content: 'bye\n' })] : [{ type: 'text', delta: 'Done.' }]);
    const second = await chat.send({ conversationId: first.conversationId, content: 'Now change it', attachmentIds: [], model: entry.ref, thinking: 'off' });
    await finished(first.conversationId, second.assistantMessageId);
    expect(await readFile(join(plain, 'notes.txt'), 'utf8')).toBe('bye\n');
    // Outside git, the original is kept for the Changes panel.
    const manifest = await readManifest(first.conversationId);
    expect(manifest['notes.txt']).toMatchObject({ existed: true });
  });

  it('streams command output while it runs', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'cellar-code-cmd-'));
    cleanup.push(plain);
    let sawLive = false;
    const off = (await import('../../src/main/lib/events')).bus.on('chat:stream', (event) => {
      const running = tools(event.parts).find((t) => t.name === 'run_command' && t.status === 'running');
      if (running?.result?.includes('first')) sawLive = true;
    });
    fake.script = (req) =>
      toolTurns(req) === 0 ? [call('run_command', { command: "Write-Output 'first'; Start-Sleep -Milliseconds 1500; Write-Output 'second'" })] : [{ type: 'text', delta: 'Ran it.' }];
    const started = await chat.send({ content: 'Run it', attachmentIds: [], model: entry.ref, thinking: 'off', code: { folder: plain, mode: 'code', autoAcceptEdits: true, worktree: false } });
    const convo = started.conversationId;
    // Commands still ask in auto-accept mode.
    const approval = await waitFor(() => tools(chat.getConversation(convo).messages.find((m) => m.id === started.assistantMessageId)?.parts).find((t) => t.status === 'awaiting-approval'));
    chat.approve(started.assistantMessageId, approval.id, { action: 'allow' });
    const done = await finished(convo, started.assistantMessageId);
    off();
    const step = tools(done.parts)[0];
    expect(step.status).toBe('done');
    expect(step.result).toContain('second');
    expect(sawLive).toBe(true);
  }, 30_000);
});
