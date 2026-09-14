// Launches the unpacked packaged build and checks that the main-process dependencies work inside the asar.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(join(project, 'package.json'), 'utf8'))).version;
const exe = join(project, 'release', version, 'win-unpacked', 'Cellar.exe');
if (!existsSync(exe)) throw new Error(`Not found: ${exe}`);

const app = await electron.launch({ executablePath: exe, env: { ...process.env, CELLAR_USER_DATA: join(tmpdir(), 'cellar-packaged', 'u'), CELLAR_HOME: join(tmpdir(), 'cellar-packaged', 'h') } });
const win = await app.firstWindow();
await win.waitForSelector('[data-testid=composer-input]', { timeout: 30_000 });
const ipc = (c, ...a) => win.evaluate(([cc, aa]) => window.cellar.invoke(cc, ...aa), [c, a]);
const hardware = await ipc('system:hardware', true);
console.log('hardware:', hardware.gpus.map((g) => g.name).join(', ') || 'no gpu', `${Math.round(hardware.ramTotalBytes / 2 ** 30)}GB RAM`);
const models = await ipc('models:rescan');
const local = models.filter((m) => m.providerKind === 'llamacpp');
console.log('local GGUFs:', local.map((m) => `${m.displayName} (${m.architecture ?? 'no header'})`).join(', '));
const runtimes = await ipc('runtimes:list', true);
console.log('runtimes:', runtimes.map((r) => r.label).join(' | '));
const info = await ipc('app:info');
console.log('app:', info.version, info.isDev ? 'dev' : 'packaged');
// M4 dependencies inside the asar: croner (schedules) and the MCP SDK (connectors).
const cron = await ipc('scheduled:preview', '0 9 * * 1-5');
console.log('schedule preview:', cron.description, cron.next.length, 'next runs');
const connector = await ipc('connectors:save', { name: 'Packaged check', transport: 'stdio', command: 'node', args: [join(project, 'tests', 'fixtures', 'mcp-server.mjs')], env: {}, url: '', headers: {}, enabled: true });
console.log('connector:', connector.state, `${connector.tools.length} tools`, connector.message ?? '');
await ipc('connectors:delete', connector.config.id);
const tools = await ipc('tools:list', 'chat');
console.log('chat tools:', tools.tools.map((t) => t.name).join(', '));
await win.screenshot({ path: join(project, 'test-results', 'screenshots', 'packaged-home.png') });
await app.close();
