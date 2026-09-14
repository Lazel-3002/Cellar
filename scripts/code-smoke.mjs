// Real-model Code smoke test: a session on a sample git repository through the UI, approving every request,
// then a tour of the Changes, Files, Terminal and Preview tabs with screenshots.
// Usage: node scripts/code-smoke.mjs <providerId> <modelId or name=…> ["<task>"] [shotPrefix]
// Env: SMOKE_MODE=ask|plan|code|code-auto (default code), SMOKE_WORKTREE=0 to work in the checkout,
//      SMOKE_TIMEOUT ms, SHOT_CELLAR_HOME to use real runtimes/models, SMOKE_EXE=path to a packaged Cellar.exe.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const [
  providerId = 'ollama',
  modelId = 'qwen3.5:9b',
  task = 'The tests fail. Run them with `node test.js`, find the bug in src/math.js, fix it, and run the tests again to confirm they pass.',
  shot = 'code',
] = process.argv.slice(2);
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(project, 'test-results', 'screenshots');
mkdirSync(outDir, { recursive: true });

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Cellar Smoke', '-c', 'user.email=smoke@cellar.local', ...args], { cwd, encoding: 'utf8', windowsHide: true });
const repo = mkdtempSync(join(tmpdir(), 'cellar-code-smoke-'));
mkdirSync(join(repo, 'src'));
writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'mini-math', version: '1.0.0', type: 'module', scripts: { test: 'node test.js' } }, null, 2) + '\n');
writeFileSync(
  join(repo, 'src', 'math.js'),
  `/** Sum of all numbers in a list. */
export function sum(values) {
  let total = 0;
  for (let i = 1; i < values.length; i++) total += values[i];
  return total;
}

/** Arithmetic mean; 0 for an empty list. */
export function mean(values) {
  return values.length === 0 ? 0 : sum(values) / values.length;
}
`,
);
writeFileSync(
  join(repo, 'test.js'),
  `import assert from 'node:assert/strict';
import { mean, sum } from './src/math.js';

assert.equal(sum([1, 2, 3]), 6);
assert.equal(sum([]), 0);
assert.equal(mean([2, 4, 6]), 4);
console.log('all tests passed');
`,
);
// Stray "\n" escapes written as code: the kind of syntax error editors underline (for get_diagnostics runs).
writeFileSync(join(repo, 'physics.py'), 'import math\\n\\ndef fall_time(height):\\n    return math.sqrt(2 * height / 9.81)\n\nprint(round(fall_time(20), 2))\n');
writeFileSync(join(repo, 'index.html'), '<!doctype html><html><body style="font-family:sans-serif"><h1>mini-math</h1><p>Preview check.</p></body></html>\n');
writeFileSync(join(repo, 'CELLAR.md'), '# mini-math\n\nRun the tests with `node test.js`. Plain ES modules, no dependencies.\n');
git(repo, 'init', '-q', '-b', 'main');
git(repo, 'add', '-A');
git(repo, 'commit', '-q', '-m', 'Initial commit');

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
win.on('console', (msg) => msg.type() === 'error' && logs.push(`[console] ${msg.text()}`));
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.unmaximize();
  w.setSize(1680, 980);
  w.center();
});
await win.waitForSelector('[data-testid=composer-input]', { timeout: 30_000 });
const modeKey = process.env.SMOKE_MODE ?? 'code';
await win.evaluate(
  ([dir, mode, auto, worktree]) => window.cellar.invoke('settings:update', { recentRepos: [dir], codeMode: mode, codeAutoAcceptEdits: auto, codeUseWorktrees: worktree, autoTitle: true }),
  [repo, modeKey === 'code-auto' ? 'code' : modeKey, modeKey === 'code-auto', process.env.SMOKE_WORKTREE !== '0'],
);
await win.waitForTimeout(1500);

await win.locator('button[aria-label="Code"]').click();
await win.waitForSelector('[data-testid=code-repo]');
await win.getByTestId('code-repo').click();
await win.getByRole('menuitem', { name: basename(repo) }).click();
await win.waitForTimeout(1200);
await win.screenshot({ path: join(outDir, `${shot}-new-session.png`) });
await win.click('[data-testid=model-picker]');
const option = modelId.startsWith('name=')
  ? win.locator(`[data-testid=model-option][data-provider="${providerId}"]`, { hasText: modelId.slice(5) }).first()
  : win.locator(`[data-testid=model-option][data-provider="${providerId}"][data-model-id="${modelId}"]`);
await option.waitFor({ timeout: 30_000 });
await option.click();
await win.fill('[data-testid=composer-input]', task);
const started = Date.now();
await win.click('[data-testid=composer-send]');
await win.waitForSelector('[data-testid=task-turn]', { timeout: 120_000 });

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
await win.waitForTimeout(2500);
const turn = win.locator('[data-testid=task-turn]').last();
const status = await turn.getAttribute('data-status');
const steps = await win.locator('[data-testid=tool-step]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tool')}:${e.getAttribute('data-status')} — ${e.innerText.split('\n')[0]}`));
const conversationId = await win.evaluate(() => location.hash.split('/').pop());
const session = await win.evaluate((id) => window.cellar.invoke('chat:get', id), conversationId);
const code = session.conversation.task.code;
const workDir = session.conversation.task.workDir;

await win.getByTestId('pane-tab-changes').click();
await win.waitForTimeout(2500);
await win.screenshot({ path: join(outDir, `${shot}-changes.png`) });
const changes = await win.evaluate((id) => window.cellar.invoke('code:changes', id), conversationId);

await win.getByTestId('pane-tab-files').click();
await win.waitForTimeout(800);
await win.waitForTimeout(2500);
await win.screenshot({ path: join(outDir, `${shot}-files.png`) });

await win.getByTestId('pane-tab-terminal').click();
await win.waitForTimeout(3500);
await win.keyboard.type('node test.js');
await win.keyboard.press('Enter');
await win.waitForTimeout(3500);
await win.screenshot({ path: join(outDir, `${shot}-terminal.png`) });
const terminals = await win.evaluate((id) => window.cellar.invoke('terminal:list', id), conversationId);
const buffer = terminals[0] ? await win.evaluate((tid) => window.cellar.invoke('terminal:buffer', tid), terminals[0].id) : '';

await win.getByTestId('pane-tab-preview').click();
await win.waitForTimeout(800);
const previewUrl = await win.evaluate((id) => window.cellar.invoke('code:previewUrl', id, 'index.html'), conversationId).catch((err) => `error: ${err.message}`);
const address = win.getByTestId('preview-pane').locator('input').first();
await address.fill('index.html');
await address.press('Enter');
await win.waitForTimeout(2500);
await win.screenshot({ path: join(outDir, `${shot}-preview.png`) });

let testRun = '';
try {
  testRun = execFileSync('node', ['test.js'], { cwd: workDir, encoding: 'utf8', windowsHide: true }).trim();
} catch (err) {
  testRun = `FAILED: ${String(err.stderr || err.message).split('\n').slice(0, 3).join(' ')}`;
}

console.log(`status=${status} elapsed=${elapsed}s repo=${repo}`);
console.log(`session: kind=${session.conversation.kind} mode=${code.mode} worktree=${code.worktree} branch=${code.branch} workDir=${workDir}`);
console.log(`approvals: ${approvals.join(' | ') || 'none'}`);
console.log(`steps:\n  ${steps.join('\n  ')}`);
console.log(`changes: ${changes.files.map((f) => `${f.status} ${f.path} +${f.additions} -${f.deletions}`).join(', ') || 'none'} (uncommitted ${changes.uncommitted})`);
console.log(`checkout untouched: ${git(repo, 'status', '--porcelain').trim() === '' ? 'yes' : 'NO'}`);
console.log(`tests in working folder: ${testRun}`);
console.log(`terminal: ${terminals.length} open; output tail: ${JSON.stringify(buffer.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').slice(-200))}`);
console.log(`preview url: ${previewUrl}`);
console.log(`--- final turn ---\n${(await turn.innerText()).slice(-1500)}`);
await app.close();
const problems = logs.filter((l) => /error|fail|exception/i.test(l));
if (problems.length) console.log('--- log problems ---\n' + problems.slice(-25).join('\n'));
