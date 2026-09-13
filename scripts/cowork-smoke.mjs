// Real-model Cowork smoke test: runs a task in a sample folder through the UI, approving every request.
// Usage: node scripts/cowork-smoke.mjs <providerId> <modelId or name=…> ["<task>"] [shotName]
// Env: SMOKE_MODE=ask|auto-edits|plan (default ask), SMOKE_TIMEOUT ms, SHOT_CELLAR_HOME to use real runtimes/models,
//      SMOKE_EXE=path to a packaged Cellar.exe to test the installer build instead of the dev build.
import { mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const [providerId = 'ollama', modelId = 'qwen3.5:9b', task = 'Read the meeting notes in this folder. Create summary.md with the decisions and action items, then create action-items.xlsx with columns Action, Owner and Due date.', shot = 'cowork'] =
  process.argv.slice(2);
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(project, 'test-results', 'screenshots');
mkdirSync(outDir, { recursive: true });

const folder = mkdtempSync(join(tmpdir(), 'cellar-cowork-smoke-'));
mkdirSync(join(folder, 'notes'));
writeFileSync(
  join(folder, 'notes', 'meeting-2026-09-10.md'),
  `# Product sync — 10 September 2026

Attendees: Ayşe, Mert, Jonas

## Discussion
- The Cowork beta slips one week because approvals need more testing.
- Pricing page: keep the free tier, drop the "Team" plan for now.

## Decisions
- Ship Cowork beta on 24 September.
- Use DuckDuckGo as the default search provider.

## Action items
- Ayşe: write the approval test plan by 15 September.
- Mert: update the pricing page by 17 September.
- Jonas: record the demo video by 22 September.
`,
);
writeFileSync(join(folder, 'notes', 'ideas.txt'), 'Maybe add a dark mode toggle to the task panel.\nConsider SearXNG for privacy-minded users.\n');

const profile = join(tmpdir(), 'cellar-smoke');
const app = await electron.launch({
  ...(process.env.SMOKE_EXE ? { executablePath: process.env.SMOKE_EXE } : { args: [project], cwd: project }),
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
await win.evaluate(
  ([dir, mode]) => window.cellar.invoke('settings:update', { recentFolders: [dir], coworkPermissionMode: mode, autoTitle: true }),
  [folder, process.env.SMOKE_MODE ?? 'ask'],
);
await win.waitForTimeout(2500);

await win.getByRole('button', { name: 'Cowork', exact: true }).click();
// The home screen remembers the last folder or project; clear it so this run picks its own.
const chips = win.locator('button[aria-label^="Remove "]');
while (await chips.count()) await chips.first().click();
await win.getByTestId('cowork-folder').click();
await win.getByRole('menuitem', { name: basename(folder) }).click();
await win.click('[data-testid=model-picker]');
const option = modelId.startsWith('name=')
  ? win.locator(`[data-testid=model-option][data-provider="${providerId}"]`, { hasText: modelId.slice(5) }).first()
  : win.locator(`[data-testid=model-option][data-provider="${providerId}"][data-model-id="${modelId}"]`);
await option.waitFor({ timeout: 30_000 });
await option.click();
await win.fill('[data-testid=composer-input]', task);
const started = Date.now();
await win.click('[data-testid=composer-send]');
await win.waitForSelector('[data-testid=task-turn]', { timeout: 30_000 });

const deadline = started + Number(process.env.SMOKE_TIMEOUT ?? 900_000);
const approvals = [];
for (;;) {
  const status = await win.locator('[data-testid=task-turn]').last().getAttribute('data-status');
  if (status === 'complete' || status === 'error' || status === 'stopped') break;
  const card = win.getByTestId('approval-card').first();
  if (await card.isVisible().catch(() => false)) {
    approvals.push((await card.locator('span.font-medium').first().innerText().catch(() => '?')).trim());
    await card.getByTestId('approve').click().catch(() => undefined);
  }
  if (Date.now() > deadline) {
    console.log('TIMEOUT');
    break;
  }
  await win.waitForTimeout(700);
}
const elapsed = ((Date.now() - started) / 1000).toFixed(1);
await win.waitForTimeout(2000);
const turn = win.locator('[data-testid=task-turn]').last();
const status = await turn.getAttribute('data-status');
const steps = await win.locator('[data-testid=tool-step]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tool')}:${e.getAttribute('data-status')} — ${e.innerText.split('\n')[0]}`));
await win.screenshot({ path: join(outDir, `${shot}.png`) });

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(`${relative(folder, full)} (${statSync(full).size} B)`);
  }
};
walk(folder);

console.log(`status=${status} elapsed=${elapsed}s folder=${folder}`);
console.log(`approvals: ${approvals.join(' | ') || 'none'}`);
console.log(`steps:\n  ${steps.join('\n  ')}`);
console.log(`files:\n  ${files.join('\n  ')}`);
console.log(`--- final turn ---\n${(await turn.innerText()).slice(-1500)}`);
await app.close();
const problems = logs.filter((l) => /error|fail|exception/i.test(l));
if (problems.length) console.log('--- log problems ---\n' + problems.slice(-20).join('\n'));
