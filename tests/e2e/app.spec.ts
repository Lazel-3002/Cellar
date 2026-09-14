/// <reference lib="dom" />
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { startMockServer, type MockServer } from './mock-server';

const project = resolve(__dirname, '..', '..');
let app: ElectronApplication;
let win: Page;
let mock: MockServer;
let profile: string;

async function ipc<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return win.evaluate(([c, a]) => (window as unknown as { cellar: { invoke: (c: string, ...a: unknown[]) => Promise<unknown> } }).cellar.invoke(c as string, ...(a as unknown[])), [channel, args] as const) as Promise<T>;
}

async function goHome() {
  await win.getByRole('link', { name: 'New', exact: true }).click();
  await expect(win.getByTestId('composer-input')).toBeVisible();
}

async function selectModel(name: string) {
  await win.getByTestId('model-picker').first().click();
  await win.locator('[data-testid=model-option]', { hasText: name }).first().click();
}

async function send(text: string) {
  await win.getByTestId('composer-input').last().fill(text);
  await win.getByTestId('composer-send').last().click();
}

const lastAssistant = () => win.getByTestId('assistant-message').last();

test.beforeAll(async () => {
  mock = await startMockServer();
  profile = mkdtempSync(join(tmpdir(), 'cellar-e2e-'));
  app = await electron.launch({
    args: [project],
    cwd: project,
    env: { ...process.env, CELLAR_USER_DATA: join(profile, 'userdata'), CELLAR_HOME: join(profile, 'home'), CELLAR_NO_GLOBAL_SHORTCUT: '1' },
  });
  win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.unmaximize();
    w.setSize(1500, 950);
  });
  await expect(win.getByTestId('composer-input')).toBeVisible({ timeout: 30_000 });

  // Isolate the app from whatever runs on this machine: only the mock server is enabled.
  await ipc('settings:update', { scanHfCache: false, scanLmStudio: false, userName: 'Tester' });
  for (const [id, kind, name, baseUrl] of [
    ['ollama', 'ollama', 'Ollama', 'http://127.0.0.1:11434'],
    ['lmstudio', 'lmstudio', 'LM Studio', 'http://127.0.0.1:1234'],
    ['unsloth', 'unsloth', 'Unsloth Studio', 'http://127.0.0.1:8888'],
  ]) {
    await ipc('providers:save', { id, kind, name, baseUrl, enabled: false });
  }
  await ipc('providers:save', { kind: 'openai', name: 'Mock server', baseUrl: mock.url, enabled: true });
  await ipc('models:rescan');
  await ipc('providers:status', true);
  await win.reload();
  await expect(win.getByTestId('composer-input')).toBeVisible({ timeout: 30_000 });
});

test.afterAll(async () => {
  await app?.close();
  await mock?.close();
  rmSync(profile, { recursive: true, force: true });
});

test('home screen mirrors the Claude layout', async () => {
  for (const label of ['New', 'Projects', 'Artifacts', 'Scheduled', 'Customize', 'Design']) {
    await expect(win.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  await expect(win.getByText('Chats and tasks')).toBeVisible();
  await expect(win.getByPlaceholder('How can I help you today?')).toBeVisible();
  await expect(win.getByRole('button', { name: 'Incognito chat' })).toBeVisible();
  await expect(win.getByRole('button', { name: 'Chat', exact: true })).toBeVisible();
  await expect(win.getByRole('button', { name: 'Cowork', exact: true })).toBeVisible();
  await win.screenshot({ path: join(project, 'test-results', 'e2e-home.png') });
});

test('streams a reply, records stats and names the chat', async () => {
  await selectModel('mock-echo');
  await send('Hello Cellar');
  await expect(lastAssistant()).toHaveAttribute('data-status', 'complete', { timeout: 20_000 });
  await expect(lastAssistant()).toContainText('Echo: Hello Cellar');
  await expect(lastAssistant()).toContainText('tok/s');
  await expect(win.locator('aside').getByText('Mock conversation title')).toBeVisible({ timeout: 10_000 });
  const system = mock.requests.find((r) => JSON.stringify(r.messages).includes('Hello Cellar'))?.messages[0];
  expect(String(system?.content)).toContain("The user's name is Tester");
});

test('stop ends a generation early', async () => {
  await send('slow reply please');
  await expect(lastAssistant()).toHaveAttribute('data-status', 'streaming', { timeout: 10_000 });
  await expect(lastAssistant()).toContainText('word5', { timeout: 10_000 });
  await win.getByRole('button', { name: 'Stop' }).click();
  await expect(lastAssistant()).toHaveAttribute('data-status', 'stopped', { timeout: 10_000 });
  await expect(lastAssistant()).not.toContainText('word399');
});

test('retry and edit create switchable branches', async () => {
  await goHome();
  await send('Branch me');
  await expect(lastAssistant()).toHaveAttribute('data-status', 'complete', { timeout: 20_000 });
  await lastAssistant().hover();
  await win.getByRole('button', { name: 'Retry' }).last().click();
  await expect(win.getByText('2 / 2')).toBeVisible({ timeout: 10_000 });
  await expect(lastAssistant()).toHaveAttribute('data-status', 'complete', { timeout: 20_000 });
  await win.getByRole('button', { name: 'Previous version' }).last().click();
  await expect(win.getByText('1 / 2')).toBeVisible();

  const userBubble = win.getByText('Branch me', { exact: true });
  await userBubble.hover();
  await win.getByRole('button', { name: 'Edit' }).click();
  await win.locator('textarea').first().fill('Branch me differently');
  await win.getByRole('button', { name: 'Save & send' }).click();
  await expect(lastAssistant()).toContainText('Echo: Branch me differently', { timeout: 20_000 });
});

test('reasoning models show a collapsible thinking block', async () => {
  await goHome();
  await selectModel('mock-thinker-r1');
  await send('Think first');
  await expect(lastAssistant()).toHaveAttribute('data-status', 'complete', { timeout: 20_000 });
  await expect(lastAssistant()).toContainText(/Thought for|Thoughts/);
  await expect(lastAssistant()).toContainText('Echo: Think first');
  await selectModel('mock-echo');
});

test('incognito chats are never saved', async () => {
  await goHome();
  await win.getByRole('button', { name: 'Incognito chat' }).click();
  await expect(win.getByRole('heading', { name: 'Incognito chat' })).toBeVisible();
  await send('secret incognito message');
  await expect(lastAssistant()).toContainText('Echo: secret incognito message', { timeout: 20_000 });
  await expect(win.getByText('Incognito', { exact: true })).toBeVisible();
  await goHome();
  const chats = await ipc<Array<{ title: string }>>('chat:list', { query: 'secret incognito' });
  expect(chats).toHaveLength(0);
  await expect(win.locator('aside').getByText(/secret incognito/i)).toHaveCount(0);
});

test('project instructions reach the model', async () => {
  const created = await ipc<{ id: string }>('projects:create', { name: 'Pirate project', description: 'Arr' });
  await ipc('projects:update', created.id, { instructions: 'Always answer like a pirate.' });
  await win.evaluate((id) => {
    window.location.hash = `/projects/${id}`;
  }, created.id);
  await expect(win.getByRole('heading', { name: 'Pirate project' })).toBeVisible();
  await send('What should I eat?');
  await expect(lastAssistant()).toContainText('Echo: What should I eat?', { timeout: 20_000 });
  const isTitleRequest = (r: { messages: Array<{ content: unknown }> }) => String(r.messages[0]?.content).includes('You name chat conversations');
  const request = [...mock.requests].reverse().find((r) => !isTitleRequest(r) && JSON.stringify(r.messages).includes('What should I eat?'));
  expect(String(request?.messages[0].content)).toContain('Always answer like a pirate.');
  expect(String(request?.messages[0].content)).toContain('This conversation belongs to the project "Pirate project"');
});

test('artifacts render in the sandboxed side panel', async () => {
  await goHome();
  await send('Please make an artifact');
  await expect(lastAssistant()).toHaveAttribute('data-status', 'complete', { timeout: 20_000 });
  await win.getByText('Click to open').last().click();
  const frame = win.frameLocator('iframe[title="Mock page"]');
  await expect(frame.locator('#hello')).toHaveText('Hello from an artifact', { timeout: 15_000 });
  await win.screenshot({ path: join(project, 'test-results', 'e2e-artifact.png') });
  await win.getByRole('button', { name: 'Close' }).last().click();

  await win.getByRole('link', { name: 'Artifacts', exact: true }).click();
  await expect(win.getByText('Mock page').first()).toBeVisible();
});

test('search finds earlier chats', async () => {
  await goHome();
  await win.getByRole('button', { name: /^Search/ }).click();
  await win.getByPlaceholder('Search chats, projects and models…').fill('Hello Cellar');
  await win.locator('[cmdk-item]', { hasText: 'Mock conversation title' }).first().click();
  await expect(win.getByText('Echo: Hello Cellar')).toBeVisible({ timeout: 10_000 });
});

test('cowork works through a task in a chosen folder, asking before it writes', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'cellar-cowork-'));
  try {
    writeFileSync(join(folder, 'notes.md'), '# Notes\n- ship milestone two\n');
    await ipc('settings:update', { recentFolders: [folder], coworkPermissionMode: 'ask' });
    await goHome();
    await win.getByRole('button', { name: 'Cowork', exact: true }).click();
    await win.getByTestId('cowork-folder').click();
    await win.getByRole('menuitem', { name: basename(folder) }).click();
    await expect(win.getByTitle(folder)).toBeVisible();
    await expect(win.getByTestId('permission-mode')).toContainText('Ask');
    await selectModel('mock-agent');
    await win.waitForTimeout(300);
    await win.screenshot({ path: join(project, 'test-results', 'e2e-cowork-home.png') });
    await send('Turn my notes into a report');

    const approval = win.getByTestId('approval-card');
    await expect(approval).toBeVisible({ timeout: 20_000 });
    await expect(approval).toContainText('Cellar wants to create report.md');
    await expect(win.locator('aside').getByTestId('task-waiting')).toBeVisible();
    await expect(win.getByTestId('tool-step').filter({ hasText: 'notes.md' })).toBeVisible();
    await win.waitForTimeout(400);
    await win.screenshot({ path: join(project, 'test-results', 'e2e-cowork-approval.png') });
    await win.getByTestId('approve').click();

    await expect(win.getByTestId('task-turn').last()).toHaveAttribute('data-status', 'complete', { timeout: 20_000 });
    await expect(win.getByTestId('task-turn').last()).toContainText('Done. I wrote report.md from your notes.');
    expect(readFileSync(join(folder, 'report.md'), 'utf8')).toContain('ship milestone two');
    await expect(win.getByTestId('task-file')).toContainText('report.md');
    await expect(win.getByTestId('task-panel')).toContainText('Write report');
    await expect(win.getByText('Done', { exact: true })).toBeVisible();

    const agentRequest = mock.requests.find((r) => r.model === 'mock-agent' && r.tools?.length);
    expect(agentRequest?.tools?.map((t) => t.function.name)).toContain('write_file');
    expect(String(agentRequest?.messages[0].content)).toContain(`Working folder: ${folder}`);
    await win.screenshot({ path: join(project, 'test-results', 'e2e-cowork-done.png') });

    const tasks = await ipc<Array<{ kind: string; taskStatus?: string }>>('chat:list', { kind: 'task' });
    expect(tasks[0]).toMatchObject({ kind: 'task', taskStatus: 'done' });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('code fixes a bug in its own worktree, with changes, terminal, side chat and cleanup', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'cellar-e2e-repo-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=E2E', '-c', 'user.email=e2e@cellar.local', ...args], { cwd: repo, encoding: 'utf8', windowsHide: true });
  let workDir = '';
  try {
    writeFileSync(join(repo, 'app.js'), 'export function add(a, b) {\n  return a - b;\n}\n');
    writeFileSync(join(repo, 'index.html'), '<!doctype html><h1 id="hi">Preview works</h1>\n');
    writeFileSync(join(repo, 'CELLAR.md'), '# Memory\nTests: node test.js\n');
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'initial');
    await ipc('settings:update', { recentRepos: [repo], codeMode: 'code', codeAutoAcceptEdits: false, codeUseWorktrees: true });

    await win.locator('button[aria-label="Code"]').click();
    await expect(win.getByTestId('code-sidebar')).toBeVisible();
    await win.getByTestId('code-repo').click();
    await win.getByRole('menuitem', { name: basename(repo) }).click();
    await expect(win.getByTestId('code-worktree')).toBeVisible();
    await expect(win.getByText('Project memory: CELLAR.md.')).toBeVisible();
    await expect(win.getByTestId('code-mode')).toHaveAttribute('data-mode', 'code');
    await selectModel('mock-coder');
    await win.screenshot({ path: join(project, 'test-results', 'e2e-code-home.png') });
    await send('Fix the add function');

    const approval = win.getByTestId('approval-card');
    await expect(approval).toBeVisible({ timeout: 30_000 });
    await expect(approval).toContainText('Cellar wants to edit app.js');
    await win.getByTestId('approve').click();
    await expect(win.getByTestId('task-turn').last()).toHaveAttribute('data-status', 'complete', { timeout: 20_000 });
    await expect(win.getByTestId('task-turn').last()).toContainText('Fixed add in app.js');

    const conversationId = await win.evaluate(() => location.hash.split('/').pop()!);
    const session = await ipc<{ conversation: { kind: string; task: { workDir: string; code: { worktree: boolean; branch: string } } } }>('chat:get', conversationId);
    expect(session.conversation.kind).toBe('code');
    expect(session.conversation.task.code.worktree).toBe(true);
    workDir = session.conversation.task.workDir;
    expect(readFileSync(join(workDir, 'app.js'), 'utf8')).toContain('return a + b;');
    expect(readFileSync(join(repo, 'app.js'), 'utf8')).toContain('return a - b;');
    const coderRequest = mock.requests.find((r) => r.model === 'mock-coder' && r.tools?.length);
    expect(String(coderRequest?.messages[0].content)).toContain('Tests: node test.js');
    await expect(win.getByTestId('code-session-row').first()).toContainText(session.conversation.task.code.branch);

    // Changes tab lists the edit.
    await win.getByTestId('pane-tab-changes').click();
    await expect(win.getByTestId('changes-pane')).toContainText('app.js', { timeout: 10_000 });
    await expect(win.getByTestId('pane-tab-changes')).toContainText('1');
    await win.waitForTimeout(1500);
    await win.screenshot({ path: join(project, 'test-results', 'e2e-code-changes.png') });

    // Terminal runs in the worktree.
    await win.getByTestId('pane-tab-terminal').click();
    await expect.poll(async () => (await ipc<unknown[]>('terminal:list', conversationId)).length, { timeout: 20_000 }).toBe(1);
    const [terminal] = await ipc<Array<{ id: string; cwd: string }>>('terminal:list', conversationId);
    expect(terminal.cwd).toBe(workDir);
    await ipc('terminal:write', terminal.id, 'echo cellar-e2e-terminal\r');
    await expect.poll(async () => ipc<string>('terminal:buffer', terminal.id), { timeout: 20_000 }).toContain('cellar-e2e-terminal');
    await win.waitForTimeout(500);
    await win.screenshot({ path: join(project, 'test-results', 'e2e-code-terminal.png') });

    // Transcript views.
    await win.getByTestId('transcript-view').click();
    await win.getByRole('menuitem', { name: /Summary/ }).click();
    await expect(win.getByTestId('turn-summary')).toBeVisible();
    await expect(win.getByTestId('tool-step')).toHaveCount(0);
    await win.getByTestId('transcript-view').click();
    await win.getByRole('menuitem', { name: /Normal/ }).click();

    // A side question stays out of the session.
    const before = (await ipc<{ messages: unknown[] }>('chat:get', conversationId)).messages.length;
    await win.getByTestId('side-chat-toggle').click();
    await win.getByTestId('side-chat-input').fill('what changed?');
    await win.getByTestId('side-chat-input').press('Enter');
    await expect(win.getByTestId('side-chat')).toContainText('Echo: what changed?', { timeout: 20_000 });
    expect((await ipc<{ messages: unknown[] }>('chat:get', conversationId)).messages.length).toBe(before);
    await win.getByTestId('side-chat-toggle').click();

    // Delete the session together with its worktree and branch.
    await win.getByTestId('code-session-row').first().hover();
    await win.getByRole('button', { name: 'Session options' }).first().click();
    await win.getByRole('menuitem', { name: 'Delete' }).click();
    // The edit is uncommitted, so removing the worktree is opt-in and warned about.
    await expect(win.getByText(/uncommitted change/)).toBeVisible();
    await win.getByLabel(/Also remove the worktree/).check();
    await win.getByTestId('confirm-delete-session').click();
    await expect(win.getByTestId('code-session-row')).toHaveCount(0, { timeout: 20_000 });
    await expect.poll(() => existsSync(workDir), { timeout: 20_000 }).toBe(false);
    expect(git('branch', '--list', 'cellar/*').trim()).toBe('');
  } finally {
    await win.getByRole('button', { name: 'Chat and Cowork' }).click().catch(() => undefined);
    rmSync(repo, { recursive: true, force: true });
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  }
});

test('attached images show in the conversation, /tools lists tools, and chats use connector tools', async () => {
  await goHome();
  await win.getByRole('button', { name: 'Chat', exact: true }).click();
  await selectModel('mock-echo');
  // Drop a PNG onto the composer, as if dragged from the desktop.
  await win.evaluate(() => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([png], 'fan-game.png', { type: 'image/png' }));
    const target = document.querySelector('[data-testid="composer-input"]')!.parentElement!;
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await expect(win.getByTestId('attachment-chip').locator('img')).toBeVisible({ timeout: 10_000 });
  await send('try find this fan game');
  await expect(lastAssistant()).toHaveAttribute('data-status', 'complete', { timeout: 20_000 });
  const image = win.getByTestId('message-attachments').locator('img').first();
  await expect(image).toBeVisible();
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2);
  await image.click();
  await expect(win.getByRole('dialog').locator('img')).toBeVisible();
  await win.keyboard.press('Escape');

  // /tools shows what the model can use in this chat.
  await win.getByTestId('composer-input').last().fill('/to');
  await expect(win.getByTestId('slash-commands')).toContainText('/tools');
  await send('/tools');
  await expect(win.getByTestId('tools-dialog')).toContainText('web_search', { timeout: 10_000 });
  await win.keyboard.press('Escape');

  // Add an MCP server in Customize → Connectors.
  await win.getByRole('link', { name: 'Customize', exact: true }).click();
  await win.getByRole('link', { name: 'Connectors' }).click();
  await win.getByTestId('add-connector').click();
  await win.getByTestId('connector-name').fill('Warehouse');
  await win.getByTestId('connector-command').fill('node');
  await win.getByTestId('connector-args').fill(`"${join(project, 'tests', 'fixtures', 'mcp-server.mjs')}"`);
  await win.getByTestId('save-connector').click();
  await expect(win.getByTestId('connector-row')).toContainText('3 tools', { timeout: 60_000 });
  await win.screenshot({ path: join(project, 'test-results', 'e2e-connectors.png') });

  // A chat calls the connector's read-only tool without asking and answers from its result.
  await goHome();
  await selectModel('mock-tools');
  await send('How many bolts are in stock?');
  await expect(lastAssistant()).toHaveAttribute('data-status', 'complete', { timeout: 30_000 });
  await expect(lastAssistant()).toContainText('The warehouse says: bolts: 42 in stock');
  await expect(lastAssistant().getByTestId('tool-step')).toContainText('Warehouse');
  const toolRequest = mock.requests.find((r) => r.model === 'mock-tools' && r.tools?.length);
  expect(toolRequest?.tools?.map((t) => t.function.name)).toEqual(expect.arrayContaining(['warehouse__lookup', 'web_search']));
  await win.screenshot({ path: join(project, 'test-results', 'e2e-chat-connector.png') });
  await selectModel('mock-echo');
});

test('skills, memory and scheduled tasks from their pages', async () => {
  // A skill made in Customize → Skills.
  await win.getByRole('link', { name: 'Customize', exact: true }).click();
  await win.getByRole('link', { name: 'Skills' }).click();
  await win.getByTestId('new-skill').click();
  await win.getByTestId('skill-name').fill('haiku-writer');
  await win.getByTestId('skill-description').fill('Write haiku when the user asks for a poem.');
  await win.getByTestId('skill-body').fill('Write three lines: 5, 7 and 5 syllables.');
  await win.getByTestId('save-skill').click();
  await expect(win.getByTestId('skill-row').filter({ hasText: 'haiku-writer' })).toBeVisible();

  // /remember saves to memory without sending anything to the model.
  await goHome();
  const before = mock.requests.length;
  await send('/remember I prefer answers in metric units');
  await win.getByRole('link', { name: 'Customize', exact: true }).click();
  await win.getByRole('link', { name: 'Memory' }).click();
  await expect(win.getByTestId('memory-row')).toContainText('I prefer answers in metric units');
  expect(mock.requests.length).toBe(before);

  // A scheduled chat, run now from the Scheduled page.
  const providerId = (await ipc<Array<{ id: string; kind: string }>>('providers:configs')).find((c) => c.kind === 'openai')!.id;
  await ipc('scheduled:save', { name: 'Daily hello', prompt: 'Say hello from the schedule', kind: 'chat', cron: '0 9 * * 1-5', model: { providerId, modelId: 'mock-echo' }, folder: null, permissionMode: 'auto-edits', allowCommands: false, projectId: null, enabled: true });
  await win.getByRole('link', { name: 'Scheduled', exact: true }).click();
  await expect(win.getByTestId('scheduled-row')).toContainText('Every weekday at 09:00');
  await win.getByTestId('run-now').click();
  await expect(win.getByTestId('scheduled-run').first()).toContainText('Daily hello', { timeout: 20_000 });
  await expect.poll(async () => (await ipc<Array<{ status: string }>>('scheduled:runs'))[0]?.status, { timeout: 20_000 }).toBe('done');
  await win.screenshot({ path: join(project, 'test-results', 'e2e-scheduled.png') });
  await win.getByTestId('scheduled-run').first().click();
  await expect(lastAssistant()).toContainText('Echo: Say hello from the schedule');
  const system = String([...mock.requests].reverse().find((r) => JSON.stringify(r.messages).includes('Say hello from the schedule'))?.messages[0].content);
  expect(system).toContain('I prefer answers in metric units');
  expect(system).toContain('haiku-writer');
});

test('a task keeps working in the background and says when it is done', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'cellar-cowork-bg-'));
  try {
    writeFileSync(join(folder, 'notes.md'), '# Notes\n- background run\n');
    const started = await ipc<{ conversationId: string; assistantMessageId: string }>('chat:send', {
      content: 'Turn my notes into a report',
      attachmentIds: [],
      model: { providerId: (await ipc<Array<{ id: string; kind: string }>>('providers:configs')).find((c) => c.kind === 'openai')!.id, modelId: 'mock-agent' },
      thinking: 'off',
      task: { folder, permissionMode: 'ask' },
    });
    await goHome();
    const pendingApproval = async () => {
      const data = await ipc<{ messages: Array<{ id: string; parts?: Array<{ id: string; status: string }> }> }>('chat:get', started.conversationId);
      return data.messages.find((m) => m.id === started.assistantMessageId)?.parts?.find((p) => p.status === 'awaiting-approval')?.id;
    };
    await expect.poll(pendingApproval, { timeout: 20_000 }).toBeTruthy();
    const pending = (await pendingApproval())!;
    await expect(win.getByText(/needs your approval/).first()).toBeVisible({ timeout: 10_000 });
    await ipc('tasks:approve', started.assistantMessageId, pending, { action: 'allow' });
    const toast = win.locator('[data-sonner-toast]').filter({ hasText: 'Turn my notes into a report is done' });
    await expect(toast).toBeVisible({ timeout: 20_000 });
    await toast.getByRole('button', { name: 'Open' }).click();
    await expect(win.getByTestId('task-turn').last()).toHaveAttribute('data-status', 'complete');
    expect(readFileSync(join(folder, 'report.md'), 'utf8')).toContain('background run');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
