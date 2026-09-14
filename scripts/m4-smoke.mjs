// Real-model smoke test for Milestone 4, in a throwaway profile:
//   1. a connector (the test MCP server) and web search used from a chat with a real model
//   2. project knowledge indexed with a real embedding model
//   3. voice dictation: whisper.cpp + a model are installed, and a spoken WAV (Windows TTS) is transcribed
// Usage: node scripts/m4-smoke.mjs <providerId> <chat model> [embedding model]
// Env: SMOKE_SKIP=chat,rag,voice to skip parts; SMOKE_TIMEOUT ms per chat turn.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const [providerId = 'ollama', modelId = 'qwen3.5:9b', embeddingId = 'nomic-embed-text:latest'] = process.argv.slice(2);
const skip = new Set((process.env.SMOKE_SKIP ?? '').split(',').filter(Boolean));
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(project, 'test-results', 'screenshots');
mkdirSync(outDir, { recursive: true });
const profile = join(tmpdir(), 'cellar-m4-smoke');

const app = await electron.launch({
  args: [project],
  cwd: project,
  env: { ...process.env, CELLAR_USER_DATA: join(profile, 'userdata'), CELLAR_HOME: join(profile, 'cellar-home'), CELLAR_NO_GLOBAL_SHORTCUT: '1' },
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
const ipc = (channel, ...args) => win.evaluate(([c, a]) => window.cellar.invoke(c, ...a), [channel, args]);
const results = [];
const check = (name, ok, detail) => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  console.log(results.at(-1));
};

async function chatTurn(prompt, shot) {
  await win.fill('[data-testid=composer-input]', prompt);
  const started = Date.now();
  await win.click('[data-testid=composer-send]');
  await win.waitForSelector('[data-testid=assistant-message]', { timeout: 30_000 });
  await win.waitForFunction(
    () => {
      const last = [...document.querySelectorAll('[data-testid=assistant-message]')].at(-1);
      return last && ['complete', 'error', 'stopped'].includes(last.getAttribute('data-status') ?? '');
    },
    null,
    { timeout: Number(process.env.SMOKE_TIMEOUT ?? 400_000) },
  );
  await win.waitForTimeout(1500);
  const last = win.locator('[data-testid=assistant-message]').last();
  const steps = await last.locator('[data-testid=tool-step]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tool')}:${e.getAttribute('data-status')}`));
  const text = await last.innerText();
  await win.screenshot({ path: join(outDir, `${shot}.png`) });
  return { status: await last.getAttribute('data-status'), steps, text, seconds: ((Date.now() - started) / 1000).toFixed(1) };
}

try {
  await ipc('settings:update', { scanHfCache: false, scanLmStudio: false, autoTitle: false, chatWebSearch: true, memoryEnabled: true });

  if (!skip.has('chat')) {
    const connector = await ipc('connectors:save', { name: 'Warehouse', transport: 'stdio', command: 'node', args: [join(project, 'tests', 'fixtures', 'mcp-server.mjs')], env: { TEST_TOKEN: 'smoke' }, url: '', headers: {}, enabled: true });
    check('connector connects', connector.state === 'connected', `${connector.tools.length} tools ${connector.message ?? ''}`);
    await win.reload();
    await win.waitForSelector('[data-testid=composer-input]', { timeout: 30_000 });
    await win.waitForTimeout(2000);
    await win.getByRole('button', { name: 'Chat', exact: true }).click();
    await win.click('[data-testid=model-picker]');
    await win.locator(`[data-testid=model-option][data-provider="${providerId}"][data-model-id="${modelId}"]`).click();

    const stock = await chatTurn('How many bolts does the test warehouse have in stock? Check with the warehouse tool.', 'm4-chat-connector');
    check('chat calls the connector tool', stock.steps.some((s) => s === 'warehouse__lookup:done') && /42/.test(stock.text), `${stock.status} in ${stock.seconds}s, steps ${stock.steps.join(', ')}`);

    const web = await chatTurn('Search the web: what is the latest release of the llama.cpp project on GitHub? Answer in one sentence with a link.', 'm4-chat-web');
    check('chat searches the web', web.steps.some((s) => s.startsWith('web_search:done')), `${web.status} in ${web.seconds}s, steps ${web.steps.join(', ')}`);
    console.log(`--- web answer ---\n${web.text.slice(-600)}`);

    const remember = await chatTurn('Please remember that my favorite programming language is Rust.', 'm4-chat-remember');
    const memories = await ipc('memory:list');
    check('chat saves a memory when asked', memories.some((m) => /rust/i.test(m.content)), `${remember.steps.join(', ')} → ${memories.map((m) => m.content).join(' | ')}`);
  }

  if (!skip.has('rag')) {
    await ipc('settings:update', { embeddingModel: { providerId, modelId: embeddingId } });
    const folder = join(profile, 'rag-files');
    mkdirSync(folder, { recursive: true });
    const filler = (topic) => Array.from({ length: 150 }, (_, i) => `${topic} note ${i}: routine details that repeat to make the file long enough.`).join('\n\n');
    writeFileSync(join(folder, 'garden.md'), `${filler('Garden')}\n\nTo keep aphids off the roses, spray diluted neem oil every ten days.`);
    writeFileSync(join(folder, 'finance.md'), filler('Budget'));
    const created = await ipc('projects:create', { name: `Smoke ${Date.now()}`, description: '' });
    await ipc('projects:addFiles', created.id, [join(folder, 'garden.md'), join(folder, 'finance.md')]);
    let status;
    for (let i = 0; i < 120; i++) {
      status = await ipc('projects:indexStatus', created.id);
      if (status.state === 'ready' || status.state === 'error') break;
      await win.waitForTimeout(1000);
    }
    check('project files are embedded', status?.state === 'ready', `${status?.embedded}/${status?.chunks} ${status?.message ?? ''}`);
  }

  if (!skip.has('voice')) {
    const wav = join(profile, 'speech.wav');
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice('Microsoft Zira Desktop'); $f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo 16000, ([System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen), ([System.Speech.AudioFormat.AudioChannel]::Mono); $s.SetOutputToWaveFile('${wav}', $f); $s.Speak('Please remind me to water the tomatoes tomorrow morning.'); $s.Dispose()`,
    ]);
    const t0 = Date.now();
    await ipc('voice:installRuntime', 'cpu');
    await ipc('voice:downloadModel', 'ggml-base.bin');
    const voice = await ipc('voice:status');
    check('whisper.cpp and a model install', voice.ready, `${voice.runtime?.tag} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    const bytes = [...readFileSync(wav)];
    const result = await win.evaluate(([data]) => window.cellar.invoke('voice:transcribe', new Uint8Array(data), 'en'), [bytes]);
    check('dictation transcribes speech', /water/i.test(result.text) && /tomato/i.test(result.text), `"${result.text}" in ${result.durationMs} ms`);
  }
} catch (err) {
  check('smoke run', false, err instanceof Error ? err.message : String(err));
} finally {
  await app.close();
}

console.log(`\n${results.join('\n')}`);
const problems = logs.filter((l) => /\[error\]|exception|pageerror/i.test(l));
if (problems.length) console.log('--- log problems ---\n' + problems.slice(-20).join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
