// Exercises the model hub end to end against Hugging Face: repo parsing, fit estimate, download with
// pause/resume + checksum into a throwaway models folder, library rescan, and an Ollama pull.
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = process.argv[2] ?? 'unsloth/SmolLM2-135M-Instruct-GGUF';
const profile = join(tmpdir(), 'cellar-downloads');
rmSync(profile, { recursive: true, force: true });

const app = await electron.launch({ args: [project], cwd: project, env: { ...process.env, CELLAR_USER_DATA: join(profile, 'u'), CELLAR_HOME: join(profile, 'h') } });
const win = await app.firstWindow();
await win.waitForFunction(() => !!window.cellar, null, { timeout: 30_000 });
const ipc = (channel, ...args) => win.evaluate(([c, a]) => window.cellar.invoke(c, ...a), [channel, args]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (label, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);

async function waitFor(jobId, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = (await ipc('downloads:list')).find((j) => j.id === jobId);
    if (job && predicate(job)) return job;
    if (Date.now() > deadline) return job;
    await sleep(250);
  }
}

try {
  const detail = await ipc('hub:repo', repo);
  check('repo parsed', detail.quants.length > 0, detail.quants.map((q) => `${q.label}:${Math.round(q.sizeBytes / 1e6)}MB`).join(', '));
  const quant = detail.quants.find((q) => q.label === 'Q4_K_M') ?? detail.quants[0];
  const fit = await ipc('hub:quantFit', repo, quant.label);
  check('fit estimated from remote GGUF header', fit.fit !== 'unknown', `${fit.fit}, arch ${fit.summary?.architecture}, ${fit.summary?.blockCount} layers`);

  const job = await ipc('downloads:start', { repoId: repo, quantLabel: quant.label, target: 'cellar', includeMmproj: true });
  const running = await waitFor(job.id, (j) => j.receivedBytes > 5_000_000, 60_000);
  check('download progressing', running?.receivedBytes > 0, `${Math.round((running?.receivedBytes ?? 0) / 1e6)}MB`);
  await ipc('downloads:pause', job.id);
  const paused = await waitFor(job.id, (j) => j.status === 'paused', 5_000);
  const pausedBytes = paused?.receivedBytes ?? 0;
  check('paused', paused?.status === 'paused', `${Math.round(pausedBytes / 1e6)}MB kept`);
  await sleep(1000);
  await ipc('downloads:resume', job.id);
  const done = await waitFor(job.id, (j) => j.status === 'completed' || j.status === 'error', 180_000);
  check('resumed and verified sha256', done?.status === 'completed', done?.error ?? `${done?.files.length} file(s)`);

  await sleep(1500);
  const models = await ipc('models:rescan');
  const local = models.find((m) => m.providerKind === 'llamacpp' && m.repo === repo.split('/')[1]);
  check('appears in My Models', !!local, local ? `${local.displayName} ${local.quant} source=${local.source}` : '');

  const ollamaStatus = (await ipc('providers:status', true)).find((p) => p.id === 'ollama');
  if (ollamaStatus?.state === 'online') {
    const small = detail.quants.find((q) => q.label === 'Q2_K') ?? quant;
    const pull = await ipc('downloads:start', { repoId: repo, quantLabel: small.label, target: 'ollama', includeMmproj: false });
    const pulled = await waitFor(pull.id, (j) => j.status === 'completed' || j.status === 'error', 180_000);
    check('pulled into Ollama', pulled?.status === 'completed', pulled?.error ?? '');
    const list = await ipc('models:list', true);
    const ollamaModel = list.find((m) => m.providerKind === 'ollama' && m.ref.modelId.toLowerCase().includes('smollm2-135m'));
    check('Ollama lists the pulled model', !!ollamaModel, ollamaModel?.ref.modelId ?? '');
    if (ollamaModel) {
      await ipc('models:delete', ollamaModel.ref);
      check('removed test model from Ollama', true);
    }
  } else {
    console.log('SKIP Ollama pull — Ollama is not running');
  }
} finally {
  await app.close();
  rmSync(profile, { recursive: true, force: true });
}
