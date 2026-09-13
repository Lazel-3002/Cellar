/// <reference lib="dom" />
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
    env: { ...process.env, CELLAR_USER_DATA: join(profile, 'userdata'), CELLAR_HOME: join(profile, 'home') },
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
