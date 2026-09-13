// Real-model smoke test: picks a model in the UI, sends a prompt, waits for the reply and screenshots it.
// Usage: node scripts/chat-smoke.mjs <providerId> <modelId> "<prompt>" [shotName]
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const [providerId = 'ollama', modelId = 'qwen3:0.6b', prompt = 'Say hello in five words.', shot = 'chat'] = process.argv.slice(2);
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(project, 'test-results', 'screenshots');
mkdirSync(outDir, { recursive: true });
const profile = join(tmpdir(), 'cellar-smoke');

const app = await electron.launch({
  args: [project],
  cwd: project,
  env: { ...process.env, CELLAR_USER_DATA: process.env.SHOT_USER_DATA ?? join(profile, 'userdata'), CELLAR_HOME: process.env.SHOT_CELLAR_HOME ?? join(profile, 'cellar-home') },
});
const logs = [];
app.process().stdout?.on('data', (d) => logs.push(String(d)));
app.process().stderr?.on('data', (d) => logs.push(String(d)));
const win = await app.firstWindow();
win.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.unmaximize();
  w.setSize(1600, 950);
  w.center();
});
await win.waitForSelector('[data-testid=composer-input]', { timeout: 30_000 });
await win.waitForTimeout(3000);

await win.click('[data-testid=model-picker]');
// modelId can be an exact id or "name=<text>" to match the model's display name.
const option = modelId.startsWith('name=')
  ? win.locator(`[data-testid=model-option][data-provider="${providerId}"]`, { hasText: modelId.slice(5) }).first()
  : win.locator(`[data-testid=model-option][data-provider="${providerId}"][data-model-id="${modelId}"]`);
await option.waitFor({ timeout: 30_000 });
await option.click();
await win.fill('[data-testid=composer-input]', prompt);
const started = Date.now();
await win.click('[data-testid=composer-send]');
await win.waitForSelector('[data-testid=assistant-message]', { timeout: 30_000 });
await win.waitForSelector('[data-testid=assistant-message][data-status=complete], [data-testid=assistant-message][data-status=error]', { timeout: Number(process.env.SMOKE_TIMEOUT ?? 300_000) });
const elapsed = ((Date.now() - started) / 1000).toFixed(1);
await win.waitForTimeout(2500);
const status = await win.locator('[data-testid=assistant-message]').last().getAttribute('data-status');
const text = await win.locator('[data-testid=assistant-message]').last().innerText();
await win.screenshot({ path: join(outDir, `${shot}.png`) });
console.log(`status=${status} elapsed=${elapsed}s`);
if (process.env.SMOKE_OPEN_ARTIFACT) {
  const card = win.getByText('Click to open').first();
  if (await card.count()) {
    await card.click();
    await win.waitForTimeout(4000);
    await win.screenshot({ path: join(outDir, `${shot}-artifact.png`) });
    console.log('artifact panel screenshot saved');
  } else {
    console.log('no artifact card found');
  }
}
console.log('--- assistant ---\n' + text.slice(0, 1500));
if (process.env.SMOKE_KEEP_OPEN) await win.waitForTimeout(Number(process.env.SMOKE_KEEP_OPEN));
await app.close();
const problems = logs.filter((l) => /error|fail|exception/i.test(l));
if (problems.length) console.log('--- log problems ---\n' + problems.slice(-30).join('\n'));
