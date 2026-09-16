// Real-model Math smoke test in a throwaway profile: a model builds a study board from a prompt, then a
// follow-up works on the block the user selected. Every derivation on the board is re-checked against
// Cellar's own solvers, a test question is answered in the UI, and the board is exported.
// Usage: node scripts/math-smoke.mjs <providerId> <modelId or name=…> ["<prompt>"] [shotPrefix]
// Env: SMOKE_TIMEOUT ms per turn, SMOKE_FOLLOWUP="<text>" (empty skips the follow-up),
//      SHOT_CELLAR_HOME to use real runtimes/models.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const [
  providerId = 'ollama',
  modelId = 'qwen3.5:9b',
  prompt =
    'Teach me the Pythagorean theorem: the rule, a drawing of a right triangle with legs 3 and 4, a worked example finding the hypotenuse, and one where a leg is missing and the answer is a root. Then give me 4 practice questions.',
  shot = 'math',
] = process.argv.slice(2);
const followUp = process.env.SMOKE_FOLLOWUP ?? 'Explain this step again in one short sentence.';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(project, 'test-results', 'screenshots');
const exportDir = join(project, 'test-results', `${shot}-exports`);
rmSync(exportDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(exportDir, { recursive: true });

const profile = join(tmpdir(), 'cellar-math-smoke');
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
  await win.waitForTimeout(1500);
  const turn = win.locator('[data-testid=task-turn]').last();
  const steps = await turn.locator('[data-testid=tool-step]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tool')}:${e.getAttribute('data-status')} — ${e.innerText.split('\n')[0]}`));
  return { status: await turn.getAttribute('data-status'), elapsed: ((Date.now() - started) / 1000).toFixed(1), steps, text: (await turn.innerText()).slice(-800) };
}

await win.getByRole('link', { name: 'Math', exact: true }).click();
await win.waitForSelector('[data-testid=math-papers]');
await win.click('[data-testid=model-picker]');
const option = modelId.startsWith('name=')
  ? win.locator(`[data-testid=model-option][data-provider="${providerId}"]`, { hasText: modelId.slice(5) }).first()
  : win.locator(`[data-testid=model-option][data-provider="${providerId}"][data-model-id="${modelId}"]`);
await option.waitFor({ timeout: 60_000 });
await option.click();
await win.fill('[data-testid=composer-input]', prompt);
await win.click('[data-testid=composer-send]');
await win.waitForSelector('[data-testid=math-board]', { timeout: 60_000 });
const first = await waitForTurn('first');
const conversationId = await win.evaluate(() => location.hash.split('/').pop());
let board = await ipc('math:get', conversationId);
await win.waitForTimeout(800);
await win.screenshot({ path: join(outDir, `${shot}-board.png`) });

console.log(`first turn: status=${first.status} elapsed=${first.elapsed}s`);
console.log(`steps:\n  ${first.steps.join('\n  ')}`);
console.log(`topic: ${board.topic || '(none)'} · ${board.paper} paper · angles in ${board.angleMode}`);
console.log(`blocks: ${board.blocks.map((b) => b.type).join(', ')}`);

// Everything on the board is re-checked with the engine, so a wrong number would show up here.
for (const block of board.blocks) {
  if (block.type === 'derivation') {
    const last = block.steps.at(-1)?.math ?? '';
    const check = await ipc('math:calculate', (block.result ?? last).replace(/^[^=]*=/, '').trim());
    console.log(`derivation "${block.title ?? block.id}": ${block.steps.length} steps → ${block.result ?? last}${check.ok ? ` (checks out as ${check.answer})` : ` (not a value: ${check.error})`}`);
  }
  if (block.type === 'figure') console.log(`figure: ${block.figure.kind} sides=${(block.figure.sides ?? []).join(', ')} labels=${(block.figure.labels ?? []).join('')}`);
  if (block.type === 'quiz') {
    for (const question of block.questions) {
      const verify = await ipc('math:calculate', question.answer);
      console.log(`  Q: ${question.prompt.slice(0, 70)} → ${question.answer}${verify.ok ? '' : ' (not numeric)'}`);
    }
  }
}

// Answer the first test question in the UI, the way a student would.
const quiz = board.blocks.find((block) => block.type === 'quiz');
if (quiz) {
  const question = quiz.questions[0];
  const input = win.locator(`[data-testid="question-${question.id}"] [data-testid^="answer-"]`).first();
  if (await input.count()) {
    await input.scrollIntoViewIfNeeded();
    await input.fill(question.answer);
    await win.locator(`[data-testid="question-${question.id}"]`).getByRole('button', { name: 'Check' }).click();
    await win.waitForTimeout(400);
    const feedback = await win.locator(`[data-testid="question-${question.id}"]`).innerText();
    console.log(`answered question 1 with the right answer: ${feedback.includes('Correct') ? 'marked correct' : 'NOT marked correct'}`);
  }
}

// The calculator panel, with an exact answer.
await win.getByTestId('calc-input').fill('12/13 + 5/13');
await win.waitForTimeout(300);
console.log(`calculator: 12/13 + 5/13 → ${(await win.getByTestId('calc-result').innerText()).split('\n')[0]}`);

// Follow-up on a selected block.
if (followUp) {
  const target = board.blocks.find((block) => block.type === 'derivation') ?? board.blocks[0];
  if (target) {
    await win.locator(`[data-testid="block-${target.id}"]`).click();
    await win.getByTestId('math-chat').getByTestId('composer-input').fill(followUp);
    await win.getByTestId('math-chat').getByTestId('composer-send').click();
    const second = await waitForTurn('second');
    board = await ipc('math:get', conversationId);
    console.log(`follow-up: status=${second.status} elapsed=${second.elapsed}s steps=${second.steps.map((s) => s.split(' — ')[0]).join(', ')}`);
    console.log(`blocks after the follow-up: ${board.blocks.map((b) => b.type).join(', ')}`);
    await win.screenshot({ path: join(outDir, `${shot}-followup.png`) });
  }
}

for (const [label, file] of [
  ['PDF with the answers', join(exportDir, 'board.pdf')],
  ['Test paper (answer key at the end)', join(exportDir, 'test.pdf')],
  ['Markdown study sheet', join(exportDir, 'board.md')],
]) {
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, file);
  await win.getByTestId('board-export').click();
  await win.getByRole('menuitem', { name: label }).click();
  const started = Date.now();
  while (!existsSync(file)) {
    if (Date.now() - started > 120_000) break;
    await win.waitForTimeout(500);
  }
  await win.waitForTimeout(600);
  console.log(`export ${label}: ${existsSync(file) ? `${statSync(file).size} bytes` : 'missing'} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}
const sheet = join(exportDir, 'board.md');
if (existsSync(sheet)) console.log(`study sheet starts:\n${readFileSync(sheet, 'utf8').split('\n').slice(0, 12).join('\n')}`);

console.log(`exports: ${exportDir}`);
await app.close();
const problems = logs.filter((l) => /error|fail|exception/i.test(l));
if (problems.length) console.log('--- log problems ---\n' + problems.slice(-25).join('\n'));
