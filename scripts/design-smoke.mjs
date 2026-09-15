// Real-model Design smoke test in a throwaway profile: a model builds a design on the canvas from a prompt,
// then a follow-up edits the selected title; the design is exported to PDF, PowerPoint and PNG.
// Usage: node scripts/design-smoke.mjs <providerId> <modelId or name=…> ["<prompt>"] [shotPrefix]
// Env: SMOKE_FORMAT=slides|document|social|poster|web|mobile, SMOKE_THEME=<theme id>, SMOKE_TIMEOUT ms per turn,
//      SMOKE_FOLLOWUP="<text>" (empty skips the follow-up), SHOT_CELLAR_HOME to use real runtimes/models.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const [
  providerId = 'ollama',
  modelId = 'qwen3.5:9b',
  prompt = 'Create a 5-slide pitch deck for "Bean Club", a neighborhood coffee subscription: a cover, the problem, how it works, growth in members (Jan 120, Feb 180, Mar 260, Apr 410) as a chart, and a closing slide.',
  shot = 'design',
] = process.argv.slice(2);
const format = process.env.SMOKE_FORMAT ?? 'slides';
const followUp = process.env.SMOKE_FOLLOWUP ?? 'Make this title shorter and use the accent color for it.';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(project, 'test-results', 'screenshots');
const exportDir = join(project, 'test-results', `${shot}-exports`);
rmSync(exportDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(exportDir, { recursive: true });

const profile = join(tmpdir(), 'cellar-design-smoke');
const app = await electron.launch({
  args: [project],
  cwd: project,
  env: { ...process.env, CELLAR_USER_DATA: join(profile, 'userdata'), CELLAR_HOME: process.env.SHOT_CELLAR_HOME ?? join(profile, 'cellar-home'), CELLAR_NO_GLOBAL_SHORTCUT: '1' },
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
const ipc = (channel, ...args) => win.evaluate(([c, a]) => window.cellar.invoke(c, ...a), [channel, args]);
await ipc('settings:update', { autoTitle: true, scanLmStudio: false });

async function waitForTurn(label) {
  const started = Date.now();
  await win.waitForFunction((n) => document.querySelectorAll('[data-testid=task-turn]').length >= n, label === 'first' ? 1 : 2, { timeout: 120_000 });
  await win.waitForFunction(
    () => ['complete', 'error', 'stopped'].includes([...document.querySelectorAll('[data-testid=task-turn]')].at(-1)?.getAttribute('data-status') ?? ''),
    null,
    { timeout: Number(process.env.SMOKE_TIMEOUT ?? 900_000), polling: 1000 },
  );
  await win.waitForTimeout(2000);
  const turn = win.locator('[data-testid=task-turn]').last();
  const steps = await turn.locator('[data-testid=tool-step]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tool')}:${e.getAttribute('data-status')} — ${e.innerText.split('\n')[0]}`));
  return { status: await turn.getAttribute('data-status'), elapsed: ((Date.now() - started) / 1000).toFixed(1), steps, text: (await turn.innerText()).slice(-800) };
}

await win.getByRole('link', { name: 'Design', exact: true }).click();
await win.waitForSelector('[data-testid=design-formats]');
const formatLabels = { slides: 'Slides', document: 'Document', social: 'Social post', poster: 'Poster', web: 'Web page', mobile: 'App screen' };
await win.getByTestId('design-formats').getByRole('button', { name: formatLabels[format] ?? 'Slides' }).click();
if (process.env.SMOKE_THEME) {
  await win.getByTestId('design-theme').click();
  await win.getByRole('menuitem').filter({ hasText: new RegExp(process.env.SMOKE_THEME, 'i') }).first().click();
}
await win.click('[data-testid=model-picker]');
const option = modelId.startsWith('name=')
  ? win.locator(`[data-testid=model-option][data-provider="${providerId}"]`, { hasText: modelId.slice(5) }).first()
  : win.locator(`[data-testid=model-option][data-provider="${providerId}"][data-model-id="${modelId}"]`);
await option.waitFor({ timeout: 60_000 });
await option.click();
await win.fill('[data-testid=composer-input]', prompt);
await win.click('[data-testid=composer-send]');
await win.waitForSelector('[data-testid=design-editor]', { timeout: 60_000 });
const first = await waitForTurn('first');
const conversationId = await win.evaluate(() => location.hash.split('/').pop());
let design = await ipc('design:get', conversationId);
await win.keyboard.press('Shift+Digit1');
await win.waitForTimeout(1200);
await win.screenshot({ path: join(outDir, `${shot}-editor.png`) });

console.log(`first turn: status=${first.status} elapsed=${first.elapsed}s`);
console.log(`steps:\n  ${first.steps.join('\n  ')}`);
console.log(`theme: ${design.theme.name} (${design.theme.fonts.heading} / ${design.theme.fonts.body})`);
console.log(`artboards: ${design.artboards.map((a) => `${a.name} [${a.width}×${a.height}, ${a.elements.length} elements]`).join(' | ')}`);
const overflowing = await win.locator('[data-overflow]').count();
console.log(`text boxes flagged as overflowing on the canvas: ${overflowing}`);

// Follow-up on the largest text of the first artboard, selected on the canvas.
if (followUp && design.artboards.length) {
  const board = design.artboards[0];
  const title = board.elements.filter((e) => e.type === 'text').sort((a, b) => b.size - a.size)[0];
  if (title) {
    await win.locator(`[data-artboard-id="${board.id}"] [data-element-id="${title.id}"]`).click({ force: true });
    await win.getByTestId('design-chat').getByTestId('composer-input').fill(followUp);
    await win.getByTestId('design-chat').getByTestId('composer-send').click();
    const second = await waitForTurn('second');
    design = await ipc('design:get', conversationId);
    const after = design.artboards[0]?.elements.find((e) => e.id === title.id);
    console.log(`follow-up: status=${second.status} elapsed=${second.elapsed}s steps=${second.steps.map((s) => s.split(' — ')[0]).join(', ')}`);
    console.log(`title before: "${title.text}" color=${title.color ?? 'text'} → after: "${after?.text}" color=${after?.color ?? 'text'}`);
    await win.screenshot({ path: join(outDir, `${shot}-followup.png`) });
  }
}

for (const [label, file] of [
  ['PDF (all artboards)', join(exportDir, 'design.pdf')],
  ['PowerPoint (.pptx)', join(exportDir, 'design.pptx')],
  ['PNG (every artboard)', join(exportDir, 'png')],
]) {
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, file);
  await win.getByTestId('design-export').click();
  await win.getByRole('menuitem', { name: label }).click();
  const started = Date.now();
  while (!existsSync(file) || (statSync(file).isDirectory() && readdirSync(file).length < design.artboards.length)) {
    if (Date.now() - started > 120_000) break;
    await win.waitForTimeout(500);
  }
  await win.waitForTimeout(1000);
  const size = existsSync(file) ? (statSync(file).isDirectory() ? `${readdirSync(file).length} files` : `${statSync(file).size} bytes`) : 'missing';
  console.log(`export ${label}: ${size} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

// Present mode, first artboard.
await win.keyboard.press('F5');
await win.waitForTimeout(1500);
await win.screenshot({ path: join(outDir, `${shot}-present.png`) });
await win.keyboard.press('Escape');

console.log(`exports: ${exportDir}`);
await app.close();
const problems = logs.filter((l) => /error|fail|exception/i.test(l));
if (problems.length) console.log('--- log problems ---\n' + problems.slice(-25).join('\n'));
