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
// M5: a design rendered to PDF, PNG and PowerPoint (Chromium rendering and pptxgenjs inside the asar).
const { conversationId, designId } = await ipc('design:create', { format: 'slides', themeId: 'corporate', title: 'Packaged check' });
const blank = await ipc('design:get', conversationId);
await ipc('design:save', { ...blank, artboards: [{ id: 'a1', name: 'Check', width: 1920, height: 1080, background: 'background', elements: [{ id: 't1', type: 'text', text: 'Packaged', x: 120, y: 120, w: 900, h: 120, size: 96, color: 'primary' }, { id: 'c1', type: 'chart', x: 120, y: 400, w: 1000, h: 560, chart: { kind: 'bar', labels: ['A', 'B'], series: [{ name: 'x', values: [1, 2] }] } }] }] }, blank.version);
const exportDir = join(tmpdir(), 'cellar-packaged', 'exports');
const { mkdirSync, statSync } = await import('node:fs');
mkdirSync(exportDir, { recursive: true });
for (const format of ['pdf', 'png', 'pptx']) {
  const target = join(exportDir, `check.${format}`);
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, target);
  const written = await ipc('design:export', { designId, format });
  console.log(`design ${format}:`, written ? `${statSync(written).size} bytes` : 'cancelled');
}
await ipc('chat:delete', [conversationId]);

// M6: a board with a figure, worked steps and a generated test, exported to PDF and Markdown.
const { conversationId: boardConversation, boardId } = await ipc('math:create', { topic: 'Packaged check', paper: 'grid' });
const blankBoard = await ipc('math:get', boardConversation);
const quiz = await ipc('math:quiz', { topic: 'pythagoras', count: 2, seed: 'packaged' });
const solution = await ipc('math:solve', { sides: { b: '√3', c: 2 } });
console.log('solver:', solution.steps.map((step) => step.math).join(' → '));
console.log('calculator:', (await ipc('math:calculate', '12/13 + 5/13')).answer, '·', (await ipc('math:calculate', 'cos(30)')).answer);
await ipc(
  'math:save',
  {
    ...blankBoard,
    blocks: [
      { id: 'b1', type: 'formula', title: 'Pythagorean theorem', formula: 'a^2 + b^2 = c^2' },
      { id: 'b2', type: 'figure', figure: { kind: 'right-triangle', labels: ['A', 'B', 'C'], sides: [3, 4], rightAngleAt: 1 } },
      { id: 'b3', type: 'derivation', title: solution.title, steps: solution.steps, result: solution.result },
      { id: 'b4', type: 'quiz', title: quiz.title, instructions: quiz.instructions, questions: quiz.questions },
    ],
  },
  blankBoard.version,
);
for (const [format, answers] of [['pdf', true], ['pdf', false], ['md', true]]) {
  const target = join(exportDir, `board-${format}-${answers ? 'answers' : 'test'}.${format}`);
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, target);
  const written = await ipc('math:export', { boardId, format, answers });
  console.log(`board ${format}${answers ? '' : ' (test paper)'}:`, written ? `${statSync(written).size} bytes` : 'cancelled');
}
await ipc('chat:delete', [boardConversation]);

// M9: a PDF on the shelf, opened in the packaged viewer (the pdf.js worker from file://, its data files
// from the asar), a note written on it and a copy exported with the note drawn in (pdf-lib + fontkit).
const { PDFDocument, StandardFonts } = await import('pdf-lib');
const { writeFileSync } = await import('node:fs');
const worksheet = await PDFDocument.create();
const helvetica = await worksheet.embedFont(StandardFonts.Helvetica);
worksheet.addPage([595, 842]).drawText('1. Photosynthesis happens in the ________ of the cell.', { x: 60, y: 740, size: 12, font: helvetica });
const pdfFile = join(tmpdir(), 'cellar-packaged', 'worksheet.pdf');
writeFileSync(pdfFile, await worksheet.save());
const [book] = await ipc('study:import', [pdfFile]);
for (const [kind, file] of [['standardFontDataUrl', 'LiberationSans-Regular.ttf'], ['wasmUrl', 'openjpeg.wasm'], ['cMapUrl', '78-H.bcmap']]) {
  const bytes = await ipc('study:pdfAsset', kind, file).catch((err) => err);
  console.log(`pdf.js ${file}:`, bytes instanceof Error ? bytes.message : `${bytes.length} bytes`);
}
await win.evaluate((id) => (location.hash = `#/study/${id}`), book.conversationId);
await win.waitForSelector('.page[data-page-number="1"] .textLayer span', { timeout: 30_000 });
console.log('study viewer text layer:', (await win.locator('.page[data-page-number="1"] .textLayer').innerText()).replace(/\s+/g, ' ').trim());
const session = await ipc('study:get', book.conversationId);
await ipc('study:save', book.bookId, [{ id: 'a1', type: 'text', page: 1, author: 'user', createdAt: Date.now(), x: 250, y: 90, width: 120, size: 11, text: 'chloroplasts', color: '#2459c4' }], session.book.version);
const studyExport = join(exportDir, 'worksheet-with-notes.pdf');
await app.evaluate(({ dialog }, file) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
}, studyExport);
const studyWritten = await ipc('study:export', book.bookId);
console.log('study export:', studyWritten ? `${statSync(studyWritten).size} bytes` : 'cancelled');
await win.screenshot({ path: join(project, 'test-results', 'screenshots', 'packaged-study.png') });
await ipc('study:delete', book.bookId);
await win.evaluate(() => (location.hash = '#/'));
await win.waitForSelector('[data-testid=composer-input]', { timeout: 30_000 });
await win.screenshot({ path: join(project, 'test-results', 'screenshots', 'packaged-home.png') });
await app.close();
