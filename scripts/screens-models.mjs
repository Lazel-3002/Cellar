// Screenshots of model management UI: Load settings sheet and Discover fit badges.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(project, 'test-results', 'screenshots');
mkdirSync(outDir, { recursive: true });
const app = await electron.launch({
  args: [project],
  cwd: project,
  env: { ...process.env, CELLAR_USER_DATA: process.env.SHOT_USER_DATA ?? join(tmpdir(), 'cellar-ipc', 'userdata'), CELLAR_HOME: process.env.SHOT_CELLAR_HOME ?? join(tmpdir(), 'cellar-ipc', 'home') },
});
const win = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.unmaximize();
  w.setSize(1600, 950);
});
await win.waitForSelector('[data-testid=composer-input]', { timeout: 30_000 });
await win.waitForTimeout(3000);

// Load settings for the MoE model.
await win.getByTestId('model-picker').click();
await win.locator('[data-testid=model-option]', { hasText: process.env.SHOT_MODEL ?? 'Qwen3.6-35B-A3B' }).first().click();
await win.getByTestId('model-picker').click();
await win.getByRole('button', { name: 'Load settings' }).click();
await win.waitForTimeout(2500);
await win.screenshot({ path: join(outDir, 'load-settings.png') });
await win.keyboard.press('Escape');

await win.evaluate(() => {
  window.location.hash = '/discover?repo=unsloth/Qwen3.5-9B-GGUF';
});
await win.waitForTimeout(Number(process.env.SHOT_FIT_WAIT ?? 25_000));
await win.screenshot({ path: join(outDir, 'discover-fits.png') });
await app.close();
console.log('done');
