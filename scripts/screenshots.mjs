// Launches the built app with Playwright and captures screenshots of the given routes.
// Usage: node scripts/screenshots.mjs "/,/models,/discover" [outDir]
// Uses a throwaway profile unless SHOT_USER_DATA / SHOT_CELLAR_HOME are set.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const routes = (process.argv[2] ?? '/').split(',');
const outDir = resolve(process.argv[3] ?? join(project, 'test-results', 'screenshots'));
mkdirSync(outDir, { recursive: true });
const profile = join(tmpdir(), 'cellar-screenshots');

const app = await electron.launch({
  args: [project],
  cwd: project,
  env: {
    ...process.env,
    CELLAR_USER_DATA: process.env.SHOT_USER_DATA ?? join(profile, 'userdata'),
    CELLAR_HOME: process.env.SHOT_CELLAR_HOME ?? join(profile, 'cellar-home'),
  },
});
const logs = [];
app.process().stdout?.on('data', (d) => logs.push(String(d)));
app.process().stderr?.on('data', (d) => logs.push(String(d)));
const win = await app.firstWindow();
win.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') logs.push(`[renderer ${msg.type()}] ${msg.text()}`);
});
win.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
await app.evaluate(({ BrowserWindow }, size) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.unmaximize();
  w.setSize(size.width, size.height);
  w.center();
}, { width: Number(process.env.SHOT_WIDTH ?? 1600), height: Number(process.env.SHOT_HEIGHT ?? 900) });
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(Number(process.env.SHOT_WAIT ?? 4000));

for (const route of routes) {
  await win.evaluate((r) => {
    window.location.hash = r;
  }, route);
  await win.waitForTimeout(Number(process.env.SHOT_ROUTE_WAIT ?? 2500));
  const name = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home';
  await win.screenshot({ path: join(outDir, `${name}.png`) });
  console.log('saved', join(outDir, `${name}.png`));
}
await app.close();
const problems = logs.filter((l) => /error|warn|fail|exception/i.test(l));
if (problems.length) console.log('--- log problems ---\n' + problems.slice(-40).join('\n'));
