// Launches the built app and runs IPC calls, printing results. Handy for verifying backend behaviour.
// Usage: node scripts/ipc-run.mjs '[["runtimes:list", true], ["system:hardware"]]'
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const calls = JSON.parse(process.argv[2] ?? '[]');
const profile = join(tmpdir(), 'cellar-ipc');

const app = await electron.launch({
  args: [project],
  cwd: project,
  env: {
    ...process.env,
    CELLAR_USER_DATA: process.env.IPC_USER_DATA ?? join(profile, 'userdata'),
    ...(process.env.IPC_CELLAR_HOME ? { CELLAR_HOME: process.env.IPC_CELLAR_HOME } : { CELLAR_HOME: join(profile, 'home') }),
  },
});
const win = await app.firstWindow();
await win.waitForLoadState('domcontentloaded');
await win.waitForFunction(() => !!window.cellar, null, { timeout: 30_000 });
if (process.env.IPC_EVENTS) {
  await win.evaluate((channels) => {
    for (const ch of channels.split(',')) window.cellar.on(ch, (p) => console.log(`[event ${ch}] ${JSON.stringify(p).slice(0, 300)}`));
  }, process.env.IPC_EVENTS);
  win.on('console', (m) => m.text().startsWith('[event') && console.log(m.text()));
}
for (const [channel, ...args] of calls) {
  const started = Date.now();
  try {
    const result = await win.evaluate(([c, a]) => window.cellar.invoke(c, ...a), [channel, args]);
    console.log(`=== ${channel} (${((Date.now() - started) / 1000).toFixed(1)}s)\n${JSON.stringify(result, null, 2).slice(0, Number(process.env.IPC_MAX ?? 4000))}`);
  } catch (err) {
    console.log(`=== ${channel} FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}
await app.close();
