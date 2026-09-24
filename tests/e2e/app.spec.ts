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

/** The Design and Math pages hide the sidebar, so open it before using its links. */
async function openSidebar() {
  if (!(await win.getByRole('link', { name: 'Projects', exact: true }).isVisible())) await win.getByRole('button', { name: 'Toggle sidebar  Ctrl+B' }).click();
  await expect(win.getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
}

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
  for (const label of ['New', 'Projects', 'Artifacts', 'Scheduled', 'Customize', 'Design', 'Math', 'Playground']) {
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

test('inline visualizations render seamlessly in the message: a chart, an SVG and a live frame', async () => {
  await goHome();
  await selectModel('mock-echo');
  await send('Show me a viz of my week');
  await expect(lastAssistant()).toHaveAttribute('data-status', 'complete', { timeout: 30_000 });
  const message = lastAssistant();

  // The chart block is drawn by Cellar itself: a themed SVG with one rect per stacked segment.
  const chart = message.locator('[data-viz="chart"] svg:not(.lucide)');
  await expect(chart).toBeVisible();
  expect(await chart.locator('rect').count()).toBeGreaterThanOrEqual(12);

  // The SVG block is mounted in the message DOM (not an iframe), so its text is real page text.
  const drawing = message.locator('[data-viz="svg"] svg:not(.lucide)');
  await expect(drawing).toBeVisible();
  await expect(drawing.locator('text', { hasText: 'You (max)' })).toBeVisible();

  // Nothing is boxed: no visualization draws a border of its own.
  for (const kind of ['chart', 'svg', 'html']) {
    const border = await message.locator(`[data-viz="${kind}"]`).evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(border).toBe('0px');
  }

  // The html block runs in the sandboxed frame, and the frame is exactly as tall as its content.
  const frame = message.frameLocator('iframe[title="Inline visualization"]');
  await expect(frame.locator('#out')).toHaveText('$1,967', { timeout: 20_000 });
  const iframe = message.locator('iframe[title="Inline visualization"]');
  await iframe.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => (await iframe.boundingBox())?.height ?? 0, { timeout: 15_000 })
    .toBeGreaterThan(240);
  const [outer, inner] = await Promise.all([
    iframe.boundingBox().then((b) => Math.round(b?.height ?? 0)),
    frame.locator('body').evaluate((el) => el.scrollHeight),
  ]);
  expect(Math.abs(outer - inner)).toBeLessThanOrEqual(6);

  // It is live: moving the slider recomputes the number inside the frame.
  await frame.locator('#years').fill('30');
  await expect(frame.locator('#out')).toHaveText('$7,612', { timeout: 10_000 });

  await expect(iframe).toHaveCSS('opacity', '1');
  await win.screenshot({ path: join(project, 'test-results', 'e2e-inline-viz.png'), fullPage: true });
});

test('search finds earlier chats', async () => {
  await goHome();
  await win.getByRole('button', { name: /^Search/ }).click();
  await win.getByPlaceholder('Search chats, projects and models…').fill('Hello Cellar');
  await win.locator('[cmdk-item]', { hasText: 'Mock conversation title' }).first().click();
  await expect(win.getByText('Echo: Hello Cellar')).toBeVisible({ timeout: 10_000 });
});

test('the built-in browser opens a real page, and the model reads and clicks it', async () => {
  await ipc('settings:update', { browserEnabled: true });
  try {
    await goHome();
    await selectModel('mock-browser');
    await send(`Read ${mock.url}/page and tell me about weekends`);

    // Opening a host the user did not name asks first, like web_fetch.
    const approval = win.getByTestId('approval-card');
    await expect(approval).toBeVisible({ timeout: 20_000 });
    await expect(approval).toContainText('built-in browser');
    await win.getByTestId('approve').click();

    // The panel opens by itself so the user can watch, and the tab shows the real page title.
    const panel = win.getByTestId('browser-panel');
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByRole('button', { name: /Cellar test page/ })).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByLabel('Address')).toHaveValue(`${mock.url}/page`);
    await win.screenshot({ path: join(project, 'test-results', 'e2e-browser.png') });

    // browse_read parsed the page, and browse_click ran in it: the answer only exists after the click.
    await expect(lastAssistant()).toContainText('Weekends: 10:00 to 16:00.', { timeout: 30_000 });

    const state = await ipc<{ tabs: Array<{ id: string; url: string; title: string }> }>('browser:state');
    expect(state.tabs[0]).toMatchObject({ url: `${mock.url}/page`, title: 'Cellar test page' });

    await ipc('browser:close', state.tabs[0].id);
    await panel.getByRole('button', { name: 'Close browser' }).click();
    await expect(panel).toBeHidden();
    expect((await ipc<{ tabs: unknown[] }>('browser:state')).tabs).toHaveLength(0);
  } finally {
    await ipc('settings:update', { browserEnabled: false });
    await ipc('browser:setVisible', false);
  }
});

test('computer use: Settings shows what the model sees, and a model asks once, then looks with the bar on screen', async () => {
  // Only screenshots here: nothing in this test moves the mouse or types.
  await ipc('settings:update', { computerUse: true, computerHideWindow: false, computerPauseOnMouse: false });
  try {
    await win.evaluate(() => {
      window.location.hash = '#/settings/general';
    });
    await win.getByTestId('computer-test').click();
    await expect(win.getByAltText('What the model sees')).toBeVisible({ timeout: 60_000 });
    await expect(win.getByText(/controls · \d+ windows ·/)).toBeVisible();
    await win.getByText('Show the description the model reads').click();
    await expect(win.getByText(/Screenshot: \d+×\d+ of a \d+×\d+ screen/)).toBeVisible();
    await win.screenshot({ path: join(project, 'test-results', 'e2e-computer-settings.png') });

    await goHome();
    await selectModel('mock-computer-vision');
    await send('What is on my screen?');
    const approval = win.getByTestId('approval-card');
    await expect(approval).toBeVisible({ timeout: 20_000 });
    await expect(approval).toContainText('Let Cellar use your computer');
    await expect(approval).toContainText('First step: look at the screen');
    await approval.getByRole('button', { name: 'Allow until done' }).click();

    // The bar at the top of the screen is its own window, hidden from screen capture.
    const pill = await app.waitForEvent('window', { predicate: (p) => p.url().includes('#/computer'), timeout: 20_000 });
    await expect(pill.getByTestId('computer-pill')).toBeVisible({ timeout: 20_000 });

    await expect(lastAssistant()).toContainText('I looked at the screen. Screenshot:', { timeout: 30_000 });
    const step = win.getByTestId('tool-step').filter({ hasText: 'Looked at the screen' });
    await step.getByRole('button').first().click();
    await expect(step.getByAltText('The screen after this step')).toBeVisible();
    await win.screenshot({ path: join(project, 'test-results', 'e2e-computer-step.png') });

    // The vision model got the screenshot, and the bar goes away when the reply ends.
    const request = mock.requests.filter((r) => r.model === 'mock-computer-vision' && r.tools?.length).at(-1);
    expect(JSON.stringify(request?.messages)).toContain('image_url');
    await expect.poll(() => app.windows().some((p) => p.url().includes('#/computer') && !p.isClosed()), { timeout: 10_000 }).toBe(false);
    expect(await ipc<{ phase: string }>('computer:state')).toMatchObject({ phase: 'idle' });

    // A step that deletes asks again, on the bar too (Cellar's window may be out of the way); Deny there.
    await send('Now delete the selected file');
    await expect(win.getByTestId('approval-card').last()).toContainText('Let Cellar use your computer', { timeout: 20_000 });
    await win.getByTestId('approval-card').last().getByRole('button', { name: 'Allow until done' }).click();
    const bar = await app.waitForEvent('window', { predicate: (p) => p.url().includes('#/computer'), timeout: 20_000 });
    await expect(bar.getByTestId('computer-pill')).toContainText('Cellar wants to press shift+delete', { timeout: 20_000 });
    await expect(bar.getByTestId('computer-pill')).toContainText('This deletes permanently');
    await expect(bar.getByRole('button', { name: 'Allow until done' })).toHaveCount(0);
    await bar.screenshot({ path: join(project, 'test-results', 'e2e-computer-bar.png') });
    await bar.getByRole('button', { name: 'Deny' }).click();
    await expect(lastAssistant()).toContainText('Understood. The user denied this action', { timeout: 20_000 });
    await expect(win.getByTestId('tool-step').filter({ hasText: 'shift+delete' }).last()).toHaveAttribute('data-status', 'denied');
  } finally {
    await ipc('settings:update', { computerUse: false, computerHideWindow: true, computerPauseOnMouse: true });
  }
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

    // The Changes section lists what the task changed, shows its diff, and can undo it.
    const panel = win.getByTestId('task-panel');
    const change = panel.getByTestId('task-change');
    await expect(change).toHaveAttribute('data-path', 'report.md', { timeout: 10_000 });
    await change.getByRole('button').first().click();
    await expect(panel.getByText('ship milestone two')).toBeVisible();
    await win.screenshot({ path: join(project, 'test-results', 'e2e-cowork-changes.png') });
    await change.getByRole('button', { name: 'Undo this change' }).click();
    await change.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(() => existsSync(join(folder, 'report.md')), { timeout: 10_000 }).toBe(false);
    await expect(panel.getByTestId('task-change')).toHaveCount(0);

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

test('code pushes its branch to a remote and resolves a merge conflict by hand', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'cellar-e2e-push-'));
  const origin = mkdtempSync(join(tmpdir(), 'cellar-e2e-origin-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  let workDir = '';
  try {
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { windowsHide: true });
    writeFileSync(join(repo, 'app.js'), 'export function add(a, b) {\n  return a - b;\n}\n');
    git('init', '-q', '-b', 'main');
    // Cellar runs git itself, so the identity has to live in the repository's own config.
    git('config', 'user.name', 'E2E');
    git('config', 'user.email', 'e2e@cellar.local');
    git('config', 'commit.gpgsign', 'false');
    git('remote', 'add', 'origin', origin);
    git('add', '-A');
    git('commit', '-q', '-m', 'initial');
    await ipc('settings:update', { recentRepos: [repo], codeMode: 'code', codeAutoAcceptEdits: true, codeUseWorktrees: true });

    await win.locator('button[aria-label="Code"]').click();
    await expect(win.getByTestId('code-sidebar')).toBeVisible();
    await win.getByTestId('code-repo').click();
    await win.getByRole('menuitem', { name: basename(repo) }).click();
    await expect(win.getByTestId('code-worktree')).toBeVisible();
    await selectModel('mock-coder');
    await send('Fix the add function');
    await expect(win.getByTestId('task-turn').last()).toHaveAttribute('data-status', 'complete', { timeout: 30_000 });

    const conversationId = await win.evaluate(() => location.hash.split('/').pop()!);
    const session = await ipc<{ conversation: { task: { workDir: string; code: { branch: string } } } }>('chat:get', conversationId);
    workDir = session.conversation.task.workDir;
    const branch = session.conversation.task.code.branch;

    // Commit the session's work, then push it to the remote.
    const pane = win.getByTestId('changes-pane');
    await win.getByTestId('pane-tab-changes').click();
    await expect(pane).toContainText('app.js', { timeout: 10_000 });
    await pane.getByLabel('Commit message').fill('Fix add');
    await pane.getByRole('button', { name: 'Commit' }).click();
    await expect(pane).toContainText('1 commit', { timeout: 15_000 });

    await pane.getByRole('button', { name: 'Push' }).click();
    await expect.poll(() => execFileSync('git', ['branch', '--list', branch], { cwd: origin, encoding: 'utf8', windowsHide: true }).trim(), { timeout: 30_000 }).toContain(branch);
    // A remote that is not GitHub offers no pull request button.
    await expect(pane.getByRole('button', { name: 'Create pull request' })).toHaveCount(0);

    // Someone else changes the same line on main, so merging conflicts.
    writeFileSync(join(repo, 'app.js'), 'export function add(a, b) {\n  return a * b;\n}\n');
    git('commit', '-q', '-am', 'Main edit');
    await pane.getByRole('button', { name: /Merge into main/ }).click();
    await pane.getByRole('button', { name: 'Merge', exact: true }).click();

    // The conflict dialog opens on the conflicted file, still holding git's markers.
    const dialog = win.getByRole('dialog').filter({ hasText: 'Resolve merge conflicts' });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toContainText('app.js');
    await expect(dialog.getByRole('button', { name: 'Continue merge' })).toBeDisabled();
    await expect(dialog.locator('.monaco-editor')).toContainText('<<<<<<<', { timeout: 20_000 });

    // Resolve it the way a person would: edit the markers away in the editor, save, continue.
    await dialog.locator('.monaco-editor .view-lines').click();
    await win.keyboard.press('Control+A');
    await win.keyboard.type('export function add(a, b) {\n  return a + b;\n');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('button', { name: 'Continue merge' })).toBeEnabled({ timeout: 15_000 });
    await win.screenshot({ path: join(project, 'test-results', 'e2e-code-conflicts.png') });
    await dialog.getByRole('button', { name: 'Continue merge' }).click();

    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(() => readFileSync(join(repo, 'app.js'), 'utf8'), { timeout: 15_000 }).toContain('return a + b;');
    expect(readFileSync(join(repo, 'app.js'), 'utf8')).not.toContain('<<<<<<<');
    expect(existsSync(join(repo, '.git', 'MERGE_HEAD'))).toBe(false);
    expect(git('log', '-1', '--format=%s').trim()).toMatch(/Merge/i);
  } finally {
    await win.getByRole('button', { name: 'Chat and Cowork' }).click().catch(() => undefined);
    // The session stays open, so Windows may still hold its worktree; cleaning up must not fail the test.
    for (const dir of [repo, origin, workDir]) {
      if (dir) try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
      } catch {
        // a temp folder the OS will reclaim
      }
    }
  }
});

test('code IntelliSense: real language servers give completion, diagnostics and go-to-definition', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'cellar-e2e-lsp-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=E2E', '-c', 'user.email=e2e@cellar.local', ...args], { cwd: repo, encoding: 'utf8', windowsHide: true });
  let workDir = '';
  try {
    writeFileSync(join(repo, 'app.js'), 'export function add(a, b) {\n  return a - b;\n}\n'); // satisfies the scripted mock-coder flow below
    // prettier-ignore
    const mathTs = [
      'function double(n: number): number {',
      '  return n * 2;',
      '}',
      '',
      'function quadruple(n: number): number {',
      '  return double(double(n));',
      '}',
      '',
      'const bad: number = double("x");',
      '',
    ].join('\n');
    writeFileSync(join(repo, 'math.ts'), mathTs);
    writeFileSync(join(repo, 'main.py'), 'def add(a: int, b: int) -> int:\n    return a + b\n\nadd(1, "x")\n');
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'initial');
    await ipc('settings:update', { recentRepos: [repo], codeMode: 'code', codeAutoAcceptEdits: true, codeUseWorktrees: false });

    await win.locator('button[aria-label="Code"]').click();
    await expect(win.getByTestId('code-sidebar')).toBeVisible();
    await win.getByTestId('code-repo').click();
    await win.getByRole('menuitem', { name: basename(repo) }).click();
    await expect(win.getByTestId('code-worktree')).toBeVisible();
    await selectModel('mock-coder');
    await send('Fix the add function');
    await expect(win.getByTestId('task-turn').last()).toHaveAttribute('data-status', 'complete', { timeout: 20_000 });

    const conversationId = await win.evaluate(() => location.hash.split('/').pop()!);
    const session = await ipc<{ conversation: { task: { workDir: string } } }>('chat:get', conversationId);
    workDir = session.conversation.task.workDir;

    // Capture diagnostics pushed to the renderer, the same way MonacoEditor/lsp.ts would consume them.
    await win.evaluate(() => {
      (window as unknown as { __lspDiag: unknown[] }).__lspDiag = [];
      (window as unknown as { cellar: { on: (c: string, l: (p: unknown) => void) => void } }).cellar.on('code:lspDiagnostics', (p) => (window as unknown as { __lspDiag: unknown[] }).__lspDiag.push(p));
    });

    const tsLanguage = await ipc<string | null>('code:lspOpen', conversationId, 'math.ts', mathTs);
    expect(tsLanguage).toBe('typescript');

    // Column 24 lands inside "double" on `const bad: number = double("x");` (line 9).
    const completions = await ipc<Array<{ label: string }>>('code:lspCompletion', conversationId, 'math.ts', { line: 9, column: 24 });
    expect(completions.some((c) => c.label === 'double')).toBe(true);
    expect(completions.some((c) => c.label === 'quadruple')).toBe(true);

    // Column 13 lands inside the outer "double(" call on line 6, inside quadruple's body.
    const definitions = await ipc<Array<{ path: string; line: number }>>('code:lspDefinition', conversationId, 'math.ts', { line: 6, column: 13 });
    expect(definitions.some((d) => d.path === 'math.ts' && d.line === 1)).toBe(true);

    // Column 13 lands inside "double" on its declaration (line 1); both calls on line 6 use it.
    const references = await ipc<Array<{ path: string; line: number }>>('code:lspReferences', conversationId, 'math.ts', { line: 1, column: 13 });
    expect(references.filter((r) => r.path === 'math.ts' && r.line === 6)).toHaveLength(2);

    // `double("x")` on line 9 passes a string where a number is expected.
    await expect
      .poll(
        async () =>
          win.evaluate(() => (window as unknown as { __lspDiag: Array<{ path: string; diagnostics: unknown[] }> }).__lspDiag.some((e) => e.path === 'math.ts' && e.diagnostics.length > 0)),
        { timeout: 20_000 },
      )
      .toBe(true);

    // Python: pyright catches the string-where-int type mismatch.
    const pyLanguage = await ipc<string | null>('code:lspOpen', conversationId, 'main.py', readFileSync(join(repo, 'main.py'), 'utf8'));
    expect(pyLanguage).toBe('python');
    await expect
      .poll(
        async () =>
          win.evaluate(() => (window as unknown as { __lspDiag: Array<{ path: string; diagnostics: unknown[] }> }).__lspDiag.some((e) => e.path === 'main.py' && e.diagnostics.length > 0)),
        { timeout: 20_000 },
      )
      .toBe(true);

    for (const path of ['math.ts', 'main.py']) await ipc('code:lspClose', conversationId, path);
    // Waits for the language server child processes to actually exit, so the folder is free to delete below.
    await ipc('code:deleteSession', conversationId, false);
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

  // /update-memory reads the chat itself and keeps only what is worth keeping.
  await goHome();
  await selectModel('mock-echo');
  await send('I bake sourdough bread every weekend.');
  await expect(lastAssistant()).toContainText('Echo:', { timeout: 20_000 });
  await win.getByTestId('composer-input').last().fill('/update');
  await expect(win.getByText('Look through this chat and remember anything worth keeping')).toBeVisible();
  await win.screenshot({ path: join(project, 'test-results', 'e2e-update-memory.png') });
  await send('/update-memory');
  await expect(win.getByText('Memory updated')).toBeVisible({ timeout: 30_000 });
  await win.getByRole('link', { name: 'Customize', exact: true }).click();
  await win.getByRole('link', { name: 'Memory' }).click();
  await expect(win.getByText('Bakes sourdough bread at the weekend.')).toBeVisible();

  // Nothing durable in the chat means nothing is saved.
  await goHome();
  await selectModel('mock-echo');
  await send('What is 2 + 2?');
  await expect(lastAssistant()).toContainText('Echo:', { timeout: 20_000 });
  await send('/update-memory');
  await expect(win.getByText('Nothing saved')).toBeVisible({ timeout: 30_000 });

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

test('design: a model builds slides on the canvas, the user edits them and exports PDF, PowerPoint and PNG', async () => {
  const out = mkdtempSync(join(tmpdir(), 'cellar-design-export-'));
  try {
    await win.getByRole('link', { name: 'Design', exact: true }).click();
    await expect(win.getByText('What should we design?')).toBeVisible();
    await selectModel('mock-designer');
    await send('A pitch deck for Bean Club');
    await expect(win.getByTestId('design-editor')).toBeVisible({ timeout: 20_000 });
    await expect(win.getByTestId('artboard-label')).toHaveCount(2, { timeout: 20_000 });
    await expect(win.getByTestId('design-chat')).toContainText('Made a two-slide deck.', { timeout: 20_000 });
    const canvas = win.getByTestId('design-canvas');
    await expect(canvas.locator('[data-element-type="chart"] svg')).toBeVisible();
    await expect(canvas.getByText('Bean Club', { exact: true })).toBeVisible();

    // Select the title on the canvas, change its size in the inspector, then undo.
    const title = canvas.locator('[data-element-type="text"]', { hasText: /^Bean Club$/ });
    await title.click();
    await expect(win.getByTestId('selection-box')).toHaveCount(1);
    const size = win.getByTestId('prop-size');
    const before = await size.inputValue();
    await size.fill('150');
    await size.press('Enter');
    await expect(title).toHaveCSS('font-size', '150px');
    await win.getByTestId('design-undo').click();
    await expect(title).toHaveCSS('font-size', `${before}px`);

    // Move it with the keyboard and edit its text in place.
    await title.click();
    const box = (await title.boundingBox())!;
    await win.keyboard.press('Shift+ArrowRight');
    await expect.poll(async () => (await title.boundingBox())!.x).toBeGreaterThan(box.x);
    await title.dblclick();
    await win.getByTestId('text-editor').fill('Bean Club Co.');
    await win.keyboard.press('Escape');
    await expect(canvas.getByText('Bean Club Co.', { exact: true })).toBeVisible();

    // A follow-up with the title selected: the model sees the selection and recolors it.
    const edited = canvas.locator('[data-element-type="text"]', { hasText: /^Bean Club Co\.$/ });
    await edited.click();
    await win.getByTestId('design-chat').getByTestId('composer-input').fill('Make this red');
    await win.getByTestId('design-chat').getByTestId('composer-send').click();
    await expect(win.getByTestId('design-chat')).toContainText('Recolored it.', { timeout: 20_000 });
    await expect(edited).toHaveCSS('color', 'rgb(217, 45, 32)');
    await win.screenshot({ path: join(project, 'test-results', 'e2e-design.png') });

    // The grid toggle is canvas-only: it does not touch the saved design.
    const gridButton = win.getByRole('button', { name: 'Grid  G' });
    await gridButton.click();
    await expect(gridButton).toHaveClass(/bg-selected/);
    await win.keyboard.press('g');
    await expect(gridButton).not.toHaveClass(/bg-selected/);

    // A Present transition on the artboard, set from the Inspector.
    await win.getByTestId('artboard-label').first().click();
    await win.getByRole('combobox').filter({ hasText: 'No transition' }).click();
    await win.getByRole('option', { name: 'Fade' }).click();
    await win.keyboard.press('F5');
    await expect(win.getByTestId('present')).toBeVisible();
    await win.keyboard.press('Escape');
    await expect(win.getByTestId('present')).toBeHidden();

    // Version history lists both the model's and the user's saves.
    await win.getByTestId('design-title').click();
    await win.getByRole('menuitem', { name: 'Version history' }).click();
    await expect(win.getByText('by the model').first()).toBeVisible({ timeout: 10_000 });
    await expect(win.getByText('by you').first()).toBeVisible();
    await win.keyboard.press('Escape');

    // A hotspot: link the title to the other artboard, then click it in Present to jump there.
    await edited.click();
    await win.getByTestId('link-kind').click();
    await win.getByRole('option', { name: 'Jump to artboard' }).click();
    await win.getByTestId('link-artboard').click();
    await win.getByRole('option', { name: 'Growth' }).click();
    await win.keyboard.press('F5');
    const present = win.getByTestId('present');
    await expect(present).toBeVisible();
    await present.getByText('Bean Club Co.').click();
    await expect(present.getByText('Members per month')).toBeVisible();
    await win.keyboard.press('Escape');
    await expect(present).toBeHidden();

    // Exports go through the save dialog.
    const pdf = join(out, 'deck.pdf');
    const pptx = join(out, 'deck.pptx');
    const png = join(out, 'cover.png');
    const html = join(out, 'deck.html');
    for (const [label, file] of [['PDF (all artboards)', pdf], ['PowerPoint (.pptx)', pptx], ['PNG (selected artboard)', png], ['HTML page (every artboard)', html]] as const) {
      await app.evaluate(({ dialog }, target) => {
        dialog.showSaveDialog = (async () => ({ canceled: false, filePath: target })) as unknown as typeof dialog.showSaveDialog;
      }, file);
      await win.getByTestId('design-export').click();
      await win.getByRole('menuitem', { name: label }).click();
      await expect.poll(() => existsSync(file), { timeout: 30_000 }).toBe(true);
    }
    await expect.poll(() => readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    const pngBytes = readFileSync(png);
    expect(pngBytes.readUInt32BE(16)).toBeGreaterThan(1000);
    expect(pngBytes.readUInt32BE(16) / pngBytes.readUInt32BE(20)).toBeCloseTo(16 / 9, 1);
    expect(readFileSync(pptx).subarray(0, 2).toString()).toBe('PK');
    expect(readFileSync(html, 'utf8')).toContain('<a href="#a2"');
    const conversationId = (await win.evaluate(() => location.hash)).split('/').pop()!;
    const saved = await ipc<{ artboards: Array<{ elements: Array<{ type: string; text?: string; color?: string }> }> }>('design:get', conversationId);
    expect(saved.artboards[0].elements.find((e) => e.text === 'Bean Club Co.')?.color).toBe('#D92D20');

    // The design is listed on the Design page.
    await win.getByRole('button', { name: 'Toggle sidebar  Ctrl+B' }).click();
    await win.getByRole('link', { name: 'Design', exact: true }).click();
    await expect(win.getByTestId('design-list')).toContainText('A pitch deck for Bean Club');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('math: a tutor fills a board, the calculator and whiteboard work, and a test paper exports', async () => {
  const out = mkdtempSync(join(tmpdir(), 'cellar-math-export-'));
  try {
    await openSidebar();
    await win.getByRole('link', { name: 'Math', exact: true }).click();
    await expect(win.getByText('What are we studying?')).toBeVisible();
    await selectModel('mock-tutor');
    await send('Teach me the Pythagorean theorem');
    await expect(win.getByTestId('math-board')).toBeVisible({ timeout: 20_000 });
    await expect(win.getByTestId('math-chat')).toContainText('three questions', { timeout: 30_000 });

    // The rule, a drawn triangle, the worked steps and a test are all on the board.
    const board = win.getByTestId('math-board');
    await expect(board.locator('[data-block-type="formula"]')).toContainText('a');
    await expect(board.locator('[data-block-type="figure"] svg.m-figure')).toBeVisible();
    const steps = board.locator('[data-block-type="derivation"]');
    // Cellar worked the arithmetic out, so the notebook lines are exact.
    await expect(steps).toContainText('4 - 3');
    await expect(steps).toContainText('a = 1');
    await expect(board.locator('[data-block-type="quiz"] [data-testid^="question-"]')).toHaveCount(3);

    // The unit circle is drawn step by step: it plays through on its own, then steps back and forth.
    const diagram = board.locator('[data-block-type="diagram"]');
    await expect(diagram.locator('svg.m-diagram')).toBeVisible();
    const stepCounter = diagram.getByTestId(/^diagram-step-/);
    await expect(stepCounter).toHaveText('Step 5 of 5', { timeout: 30_000 });
    await expect(diagram).toContainText('tan 135° = −1');
    await diagram.getByRole('button', { name: 'Previous step' }).click();
    await expect(stepCounter).toHaveText('Step 4 of 5');
    await expect(diagram.locator('.dg-el.dg-hidden')).not.toHaveCount(0);
    await diagram.getByTestId(/^diagram-next-/).click();
    await expect(stepCounter).toHaveText('Step 5 of 5');
    await expect(diagram.locator('.dg-el.dg-hidden')).toHaveCount(0);
    await win.waitForTimeout(2000); // let the last step finish drawing in
    await diagram.screenshot({ path: join(project, 'test-results', 'e2e-math-diagram.png') });

    // Answering a question is checked against the generated answer.
    const question = board.locator('[data-block-type="quiz"] [data-testid^="question-"]').first();
    await question.getByTestId(/^answer-/).fill('1');
    await question.getByRole('button', { name: 'Check' }).click();
    await expect(question).toContainText('Not quite.');
    await question.getByRole('button', { name: 'Show the answer' }).click();
    await expect(question).toContainText('Answer:');

    // The calculator keeps fractions exact and can drop its working onto the board.
    await win.getByTestId('calc-input').fill('12/13 + 5/13');
    await expect(win.getByTestId('calc-result')).toContainText('17');
    await win.getByTestId('calc-insert').click();
    await expect(board.locator('[data-block-type="derivation"]')).toHaveCount(2);

    // A whiteboard block takes freehand strokes.
    await win.getByTestId('board-insert').click();
    await win.getByTestId('insert-whiteboard').click();
    const canvas = win.getByTestId('sketch-canvas').last();
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await win.mouse.move(box.x + 60, box.y + 60);
    await win.mouse.down();
    await win.mouse.move(box.x + 160, box.y + 120, { steps: 8 });
    await win.mouse.move(box.x + 260, box.y + 70, { steps: 8 });
    await win.mouse.up();
    await expect(canvas.locator('path')).toHaveCount(1);
    // A dashed line, and text where Greek names become letters.
    await win.getByTestId('sketch-line').last().click();
    await win.getByTestId('sketch-line-dashed').last().click();
    await win.mouse.move(box.x + 60, box.y + 200);
    await win.mouse.down();
    await win.mouse.move(box.x + 300, box.y + 200, { steps: 6 });
    await win.mouse.up();
    await expect(canvas.locator('path[stroke-dasharray]')).toHaveCount(1);
    await win.getByTestId('sketch-text').last().click();
    await win.mouse.click(box.x + 320, box.y + 60);
    await win.getByTestId('sketch-text-input').fill('alpha = 30°');
    await win.getByTestId('sketch-text-input').press('Enter');
    await expect(canvas.locator('text')).toHaveText('α = 30°');
    await board.locator('[data-block-type="sketch"]').last().screenshot({ path: join(project, 'test-results', 'e2e-math-whiteboard.png') });
    await win.getByTestId('sketch-line-solid').last().click();
    await win.getByTestId('sketch-pen').last().click();

    // A follow-up with a block selected: the model is told which one.
    await board.locator('[data-block-type="formula"]').click();
    await win.getByTestId('math-chat').getByTestId('composer-input').fill('Add a reminder to this');
    await win.getByTestId('math-chat').getByTestId('composer-send').click();
    await expect(win.getByTestId('math-chat')).toContainText('Added a reminder.', { timeout: 20_000 });
    await expect(board.locator('[data-block-type="formula"]')).toContainText('longest side');
    await win.screenshot({ path: join(project, 'test-results', 'e2e-math.png') });

    // Exports: the study sheet with answers, and a test paper with the key at the end.
    const pdf = join(out, 'board.pdf');
    const md = join(out, 'board.md');
    for (const [label, file] of [
      ['Test paper (answer key at the end)', pdf],
      ['Markdown study sheet', md],
    ] as const) {
      await app.evaluate(({ dialog }, target) => {
        dialog.showSaveDialog = (async () => ({ canceled: false, filePath: target })) as unknown as typeof dialog.showSaveDialog;
      }, file);
      await win.getByTestId('board-export').click();
      await win.getByRole('menuitem', { name: label }).click();
      await expect.poll(() => existsSync(file), { timeout: 40_000 }).toBe(true);
    }
    expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    const sheet = readFileSync(md, 'utf8');
    expect(sheet).toContain('a² + b² = c²');
    // The study sheet keeps the answers inline; the test paper PDF is the one with the key at the end.
    expect(sheet).toContain('**Answer:**');
    expect(sheet).toContain('a² = 4 - 3');

    const conversationId = (await win.evaluate(() => location.hash)).split('/').pop()!;
    const saved = await ipc<{ topic: string; blocks: Array<{ type: string }> }>('math:get', conversationId);
    expect(saved.topic).toBe('Right triangles');
    expect(saved.blocks.map((block) => block.type)).toContain('sketch');

    await openSidebar();
    await win.getByRole('link', { name: 'Math', exact: true }).click();
    // The card shows the board's topic and the first line of maths on it.
    await expect(win.getByTestId('board-list')).toContainText('Right triangles');
    await expect(win.getByTestId('board-list')).toContainText('a² + b² = c²');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

/** A two-page worksheet like a textbook's exercise page, drawn with pdf-lib. */
async function worksheetPdf(file: string): Promise<void> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle('Science Workbook');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const first = doc.addPage([595, 842]);
  const lines: Array<[string, number]> = [
    ['Chapter 3 Exercises', 780],
    ['1. What is the unit of force?', 740],
    ['..............................................', 718],
    ['2. Photosynthesis happens in the ________ of the cell.', 680],
    ['3. Explain why leaves are green.', 640],
    ['4. A car travels 120 km in 2 hours. What is its speed?', 520],
  ];
  for (const [text, y] of lines) first.drawText(text, { x: 60, y, size: 12, font });
  const second = doc.addPage([595, 842]);
  second.drawText('Light travels at about 300000 km per second.', { x: 60, y: 780, size: 12, font });
  writeFileSync(file, await doc.save());
}

test('study: a PDF opens beside a tutor that checks the page, writes answers and turns pages', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cellar-study-'));
  try {
    const pdf = join(dir, 'Science Workbook.pdf');
    await worksheetPdf(pdf);
    await openSidebar();
    await win.getByRole('link', { name: 'Study', exact: true }).click();
    await expect(win.getByTestId('study-home')).toBeVisible();
    await expect(win.getByText('Study with your book')).toBeVisible();

    // Adding the PDF (the file dialog cannot be driven, so through the same IPC the button uses).
    const [added] = await ipc<Array<{ bookId: string; conversationId: string; title: string; existing: boolean }>>('study:import', [pdf]);
    expect(added).toMatchObject({ title: 'Science Workbook', existing: false });
    await win.evaluate((id) => (location.hash = `#/study/${id}`), added.conversationId);
    await expect(win.getByTestId('study-reader')).toBeVisible({ timeout: 20_000 });
    const page1 = win.locator('.page[data-page-number="1"]');
    await expect(page1.locator('.textLayer')).toContainText('What is the unit of force?', { timeout: 20_000 });
    await expect(win.getByTestId('study-toolbar')).toContainText('/ 2');

    // Typing an answer on the page, under question 1.
    const box = (await page1.locator('.cellar-study-overlay').boundingBox())!;
    const at = (x: number, y: number) => ({ x: box.x + (x / 595) * box.width, y: box.y + (y / 842) * box.height });
    await win.getByTestId('study-tool-text').click();
    const spot = at(64, 120);
    await win.mouse.click(spot.x, spot.y);
    await win.getByTestId('study-text-editor').fill('Newton');
    await win.getByTestId('study-text-editor').press('Escape');
    await expect(page1.getByTestId('study-text')).toHaveText('Newton');
    await expect
      .poll(async () => (await ipc<{ book: { annotations: Array<{ type: string; text?: string }> } }>('study:get', added.conversationId)).book.annotations.map((a) => a.text), { timeout: 10_000 })
      .toContain('Newton');

    // Tutor mode: the page is checked, marked and annotated, but no answer is written.
    await win.getByTestId('study-tool-select').click();
    await selectModel('mock-reader');
    const chat = win.getByTestId('study-chat');
    await expect(chat.getByTestId('study-context')).toContainText('This page (p. 1)');
    await chat.getByTestId('composer-input').fill('Check my answers');
    await chat.getByTestId('composer-send').click();
    await expect(chat).toContainText('Question 1 is right', { timeout: 30_000 });
    await expect(page1.getByTestId('study-highlight')).toHaveCount(1);
    await expect(page1.getByTestId('study-mark')).toContainText('✓');
    await expect(page1.getByTestId('study-note')).toHaveCount(1);
    const tutorRequest = mock.requests.filter((r) => r.model === 'mock-reader' && r.tools?.length).at(-1)!;
    expect(tutorRequest.tools?.map((t) => t.function.name)).not.toContain('write_answer');
    const system = String(tutorRequest.messages[0].content);
    expect(system).toContain('Tutor mode');
    expect(system).toContain('the user wrote "Newton"');
    await page1.getByTestId('study-note').click();
    await expect(page1.getByTestId('study-note-card')).toContainText('chlorophyll reflects');
    await win.screenshot({ path: join(project, 'test-results', 'e2e-study-tutor.png') });

    // The reply cites p. 2: clicking it turns the page.
    await chat.getByTestId('page-link').last().click();
    await expect(win.getByTestId('study-page-input')).toHaveValue('2');

    // Solve mode: the answer goes onto the blank in question 2.
    await chat.getByRole('button', { name: 'Solve', exact: true }).click();
    await win.getByTestId('study-page-input').fill('1');
    await win.getByTestId('study-page-input').press('Enter');
    await expect(win.getByTestId('study-page-input')).toHaveValue('1');
    await chat.getByTestId('composer-input').fill('Fill in question 2');
    await chat.getByTestId('composer-send').click();
    await expect(chat).toContainText('Wrote chloroplasts', { timeout: 30_000 });
    await expect(page1.getByTestId('study-text').filter({ hasText: 'chloroplasts' })).toBeVisible();

    // The pen draws on the page, and undo takes the stroke back.
    await win.getByTestId('study-tool-pen').click();
    const a = at(380, 110);
    const b = at(460, 130);
    await win.mouse.move(a.x, a.y);
    await win.mouse.down();
    await win.mouse.move(b.x, b.y, { steps: 10 });
    await win.mouse.up();
    await expect(page1.locator('svg [data-annotation] path')).toHaveCount(1);
    await win.getByTestId('study-undo').click();
    await expect(page1.locator('svg [data-annotation] path')).toHaveCount(0);
    await win.getByTestId('study-tool-select').click();

    // Choosing pages sends them along: page 2's text reaches the model.
    await chat.getByRole('button', { name: 'Tutor', exact: true }).click();
    await chat.getByTestId('study-scope').click();
    await win.getByRole('menuitem', { name: 'Pages I choose…' }).click();
    await chat.getByTestId('study-pages-input').fill('1-2');
    await expect(chat.getByTestId('study-context')).toContainText('Pages 1–2');
    await chat.getByTestId('composer-input').fill('How fast is light?');
    await chat.getByTestId('composer-send').click();
    await expect(chat).toContainText('300000 km per second', { timeout: 30_000 });
    await win.screenshot({ path: join(project, 'test-results', 'e2e-study.png') });

    // The page opens fitted to the view; the zoom menu and Ctrl + wheel resize it, and the choice is kept.
    const widthAtFit = (await page1.boundingBox())!.width;
    const viewer = (await win.getByTestId('study-viewer').boundingBox())!;
    expect(widthAtFit).toBeLessThan(viewer.width * 0.8);
    await win.getByTestId('study-zoom').click();
    await win.getByRole('menuitem', { name: '150%' }).click();
    await expect(win.getByTestId('study-zoom')).toContainText('150%');
    await expect.poll(async () => (await page1.boundingBox())!.width).toBeGreaterThan(widthAtFit * 1.2);
    await win.mouse.move(viewer.x + viewer.width / 2, viewer.y + viewer.height / 2);
    await win.keyboard.down('Control');
    await win.mouse.wheel(0, 240);
    await win.keyboard.up('Control');
    await expect(win.getByTestId('study-zoom')).not.toContainText('150%');
    expect(await win.evaluate(() => JSON.parse(localStorage.getItem('cellar-study-layout') ?? '{}').state?.zoom)).toBeLessThan(1.5);
    await win.getByTestId('study-zoom').click();
    await win.getByRole('menuitem', { name: 'Fit the page' }).click();
    await expect.poll(async () => Math.abs((await page1.boundingBox())!.width - widthAtFit)).toBeLessThan(3);

    // Export: a copy of the PDF with the notes drawn in.
    const exported = join(dir, 'with-notes.pdf');
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: target })) as unknown as typeof dialog.showSaveDialog;
    }, exported);
    await win.getByTestId('study-export').click();
    await expect.poll(() => existsSync(exported), { timeout: 30_000 }).toBe(true);
    expect(readFileSync(exported).subarray(0, 5).toString()).toBe('%PDF-');

    // The shelf shows the book with its notes.
    await openSidebar();
    await win.getByRole('link', { name: 'Study', exact: true }).click();
    await expect(win.getByTestId('book-list')).toContainText('Science Workbook');
    await expect(win.getByTestId('book-list')).toContainText('notes');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('playground: two models answer the same prompt, one after the other', async () => {
  await openSidebar();
  await win.getByRole('link', { name: 'Playground', exact: true }).click();
  await expect(win.getByTestId('playground-input')).toBeVisible();

  const pickSide = async (index: number, name: string) => {
    await win.getByTestId('model-picker').nth(index).click();
    await win.locator('[data-testid=model-option]', { hasText: name }).first().click();
  };
  await pickSide(0, 'mock-echo');
  await pickSide(1, 'mock-thinker-r1');

  const ask = async (text: string) => {
    await win.getByTestId('playground-input').fill(text);
    await win.getByTestId('playground-send').click();
  };
  const answers = (round: number) => win.getByTestId('playground-round').nth(round).getByTestId('playground-answer');

  // The second model holds off until the first one is done: they share the GPU.
  await ask('slow compare please');
  await expect(answers(0).first()).toHaveAttribute('data-side-status', 'streaming', { timeout: 15_000 });
  await expect(win.getByTestId('playground-round').first()).toContainText('Waiting for mock-echo to finish');
  await expect(answers(0)).toHaveCount(1);

  // Stopping ends the round rather than handing the prompt on to the second model.
  await win.getByTestId('playground-stop').click();
  await expect(answers(0).first()).toHaveAttribute('data-side-status', 'stopped', { timeout: 15_000 });
  await expect(win.getByTestId('playground-round').first()).toContainText('Never ran');

  await ask('Compare yourselves');
  await expect(answers(1)).toHaveCount(2, { timeout: 30_000 });
  for (const cell of [answers(1).first(), answers(1).last()]) {
    await expect(cell).toHaveAttribute('data-side-status', 'complete', { timeout: 30_000 });
    await expect(cell).toContainText('Echo: Compare yourselves');
    await expect(cell).toContainText('tok/s');
  }
  // Each side keeps its own model's behaviour: only the reasoning model thinks first.
  await expect(answers(1).last()).toContainText(/Thought for|Thoughts/);
  await expect(answers(1).first()).not.toContainText(/Thought for|Thoughts/);
  await win.screenshot({ path: join(project, 'test-results', 'e2e-playground.png') });

  // Both sides are incognito, so none of it is saved.
  expect(await ipc<unknown[]>('chat:list', { query: 'Compare yourselves' })).toHaveLength(0);

  // A follow-up goes to one model only; the other sits the round out.
  await answers(1).last().getByTestId('playground-follow-up').click();
  await expect(win.getByTestId('playground-target')).toContainText('Model 2 only');
  await ask('and again');
  await expect(answers(2)).toHaveCount(1, { timeout: 30_000 });
  await expect(win.getByTestId('playground-round').nth(2)).toContainText('→ Model 2 only');
  await expect(win.getByTestId('playground-round').nth(2)).toContainText('Not asked');
  await expect(answers(2).first()).toContainText('Echo: and again', { timeout: 30_000 });

  // A turn the agent loop paused can be picked up from the answer itself.
  await win.getByTestId('playground-target').click();
  await win.getByRole('menuitem', { name: 'Both models' }).click();
  await ask('loop forever please');
  await expect(answers(3)).toHaveCount(2, { timeout: 60_000 });
  await expect(answers(3).last()).toHaveAttribute('data-side-status', 'complete', { timeout: 60_000 });
  await expect(answers(3).first()).toContainText('Paused');
  await answers(3).first().getByTestId('playground-continue').click();
  await expect(win.getByTestId('playground-round').nth(4)).toContainText('→ Model 1 only', { timeout: 30_000 });
  await expect(answers(4).first()).toContainText('Echo: continue', { timeout: 30_000 });
  await win.screenshot({ path: join(project, 'test-results', 'e2e-playground-followup.png') });

  await win.getByRole('button', { name: 'Clear' }).click();
  await expect(win.getByText('Ask both models the same thing')).toBeVisible();
});
