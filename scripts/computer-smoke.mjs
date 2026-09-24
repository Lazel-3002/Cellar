// Real-model computer-use smoke test in a throwaway profile. The model really drives the desktop:
// it is asked to open Calculator, work out a product and say the result. Cellar's window moves out
// of the way while it works, the bar is on screen, and nothing but Calculator is touched (it is
// closed at the end). Keep your hands off the mouse while it runs: moving it pauses the model.
// Usage: node scripts/computer-smoke.mjs [providerId] [modelId] [prompt]
// Env: SMOKE_TIMEOUT ms for the turn (default 6 minutes).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const [providerId = 'ollama', modelId = 'qwen3.5:9b', prompt = 'Open the Calculator app and work out 1234 × 5678 in it. Tell me the result the Calculator shows.'] = process.argv.slice(2);
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(project, 'test-results', 'screenshots');
mkdirSync(outDir, { recursive: true });

const profile = join(tmpdir(), 'cellar-computer-smoke-profile');
rmSync(profile, { recursive: true, force: true });
const app = await electron.launch({
  args: [project],
  cwd: project,
  env: { ...process.env, CELLAR_USER_DATA: join(profile, 'userdata'), CELLAR_HOME: join(profile, 'cellar-home') },
});
const logs = [];
app.process().stdout?.on('data', (d) => logs.push(String(d)));
app.process().stderr?.on('data', (d) => logs.push(String(d)));
const win = await app.firstWindow();
win.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.unmaximize();
  w.setSize(1400, 900);
  w.center();
});
await win.waitForSelector('[data-testid=composer-input]', { timeout: 30_000 });
const ipc = (channel, ...args) => win.evaluate(([c, a]) => window.cellar.invoke(c, ...a), [channel, args]);
await ipc('settings:update', { autoTitle: false, scanLmStudio: false, computerUse: true, approvalMode: 'manual', chatWebSearch: false });

// Watch the bar: every state change, with the time.
const started = Date.now();
const states = [];
const poll = setInterval(async () => {
  try {
    const s = await ipc('computer:state');
    const line = `${s.phase}${s.action ? ` · ${s.action}` : ''}${s.reason ? ` · ${s.reason}` : ''}${s.approval ? ` · approval: ${s.approval.title}` : ''}`;
    if (states.at(-1)?.line !== line) states.push({ t: ((Date.now() - started) / 1000).toFixed(1), line });
  } catch {
    // window busy
  }
}, 300);

await win.getByTestId('model-picker').first().click();
const option = win.locator(`[data-testid=model-option][data-provider="${providerId}"][data-model-id="${modelId}"]`);
await option.waitFor({ timeout: 60_000 });
await option.click();
await win.getByTestId('composer-input').fill(prompt);
await win.getByTestId('composer-send').click();

// The first step asks once for the task: allow it until done, as a person would.
const card = win.getByTestId('approval-card');
await card.waitFor({ timeout: 180_000 });
console.log(`approval: ${(await card.innerText()).split('\n').slice(0, 3).join(' | ')}`);
await win.screenshot({ path: join(outDir, 'computer-approval.png') });
await card.getByRole('button', { name: 'Allow until done' }).click();

// Risky steps (sending, deleting, closing a window) ask again, on the bar and in the chat: allow them here.
const deadline = Date.now() + Number(process.env.SMOKE_TIMEOUT ?? 360_000);
let status = '';
for (;;) {
  status = (await win.getByTestId('assistant-message').last().getAttribute('data-status').catch(() => '')) ?? '';
  if (['complete', 'error', 'stopped'].includes(status)) break;
  if (Date.now() > deadline) {
    console.log('timed out; stopping');
    await ipc('computer:stop');
    break;
  }
  const s = await ipc('computer:state').catch(() => null);
  if (s?.phase === 'approval' && s.approval) {
    console.log(`  allowing: ${s.approval.title}`);
    await ipc('tasks:approve', s.messageId, s.approval.toolCallId, { action: 'allow' });
  }
  await new Promise((r) => setTimeout(r, 500));
}
clearInterval(poll);
await new Promise((r) => setTimeout(r, 1500));

const last = win.getByTestId('assistant-message').last();
const steps = await win.locator('[data-testid=tool-step]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tool')}:${e.getAttribute('data-status')} — ${e.innerText.split('\n')[0]}`));
console.log(`\n=== ${status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`steps:\n  ${steps.join('\n  ') || '(none)'}`);
console.log(`bar:\n  ${states.map((s) => `${s.t}s ${s.line}`).join('\n  ')}`);
console.log(`reply:\n${(await last.innerText()).replace(/\n{2,}/g, '\n').slice(-1500)}`);
await win.screenshot({ path: join(outDir, 'computer-done.png') });

// Each tool result, as the model read it (first lines).
const conversations = await ipc('chat:list', {});
const convo = await ipc('chat:get', conversations[0].id);
for (const m of convo.messages.filter((m) => m.role === 'assistant')) {
  for (const p of m.parts ?? []) {
    if (p.type !== 'tool') continue;
    console.log(`\n--- ${p.name} ${JSON.stringify(p.args)} → ${p.status}${p.error ? ` (${p.error})` : ''}`);
    console.log((p.result ?? '').split('\n').slice(0, 14).join('\n'));
  }
}

await app.close();
// Leave the desktop as it was: close what the prompt opened (SMOKE_CLOSE lists more executables).
for (const exe of (process.env.SMOKE_CLOSE ?? 'CalculatorApp.exe').split(',')) {
  try {
    execFileSync('taskkill', ['/IM', exe.trim(), '/F'], { stdio: 'ignore' });
  } catch {
    // not running
  }
}
const errors = logs.join('').split('\n').filter((l) => /error|warn/i.test(l) && /computer/i.test(l));
if (errors.length) console.log(`\nlog:\n${errors.slice(-20).join('\n')}`);
rmSync(profile, { recursive: true, force: true });
