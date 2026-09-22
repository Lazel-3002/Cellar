// Real-model Study smoke test in a throwaway profile. A small Turkish science chapter is written as a
// PDF (Segoe UI embedded, so ç ğ ı ö ş ü are real text), the "student" has already answered the
// exercises on page 3 (two of them wrong), and the model is asked to check them in Tutor mode, to
// answer from the whole book, and to fill in a blank in Solve mode. Screenshots and the annotations
// it placed are printed so a person can judge them.
// Usage: node scripts/study-smoke.mjs [providerId] [modelId] [shotPrefix]
// Env: SMOKE_TIMEOUT ms per turn.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';

const [providerId = 'ollama', modelId = 'qwen3.5:9b', shot = 'study'] = process.argv.slice(2);
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(project, 'test-results', 'screenshots');
mkdirSync(outDir, { recursive: true });
const work = join(tmpdir(), 'cellar-study-smoke');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

// --- The book --------------------------------------------------------------------------------
const H = 842;
async function makeBook(file) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle('Fen Bilimleri 7 — Ünite 3');
  const font = await doc.embedFont(readFileSync(join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts', 'segoeui.ttf')), { subset: true });
  const bold = await doc.embedFont(readFileSync(join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts', 'segoeuib.ttf')), { subset: true });
  const write = (page, text, y, size = 12, f = font) => page.drawText(text, { x: 60, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  const para = (page, text, top, size = 12) => {
    const words = text.split(' ');
    let line = '';
    let y = top;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > 470) {
        write(page, line, y, size);
        y -= size * 1.6;
        line = word;
      } else line = next;
    }
    if (line) write(page, line, y, size);
    return y - size * 2.2;
  };

  const p1 = doc.addPage([595, H]);
  write(p1, 'Ünite 3: Bitkilerde Fotosentez', 770, 20, bold);
  let y = para(p1, 'Bitkiler, güneş ışığının enerjisini kullanarak kendi besinlerini üretir. Bu olaya fotosentez denir. Fotosentez, yaprak hücrelerindeki kloroplast adlı organellerde gerçekleşir.', 730);
  y = para(p1, 'Kloroplastların içinde klorofil adı verilen yeşil bir pigment bulunur. Klorofil, ışığın kırmızı ve mavi renklerini soğurur, yeşil rengini ise yansıtır. Bu yüzden yapraklar yeşil görünür.', y);
  y = para(p1, 'Fotosentezde karbondioksit ve su kullanılır. Işık enerjisiyle glikoz (besin) ve oksijen üretilir. Oksijen gazı yapraklardaki gözeneklerden havaya verilir.', y);

  const p2 = doc.addPage([595, H]);
  write(p2, 'Ünite 3: Kuvvet ve Hareket', 770, 20, bold);
  y = para(p2, 'Birim zamanda alınan yola sürat denir. Sürat, alınan yolun geçen süreye bölünmesiyle bulunur: sürat = yol / zaman.', 730);
  y = para(p2, 'Örneğin 100 km yolu 2 saatte alan bir aracın sürati 100 / 2 = 50 km/sa olur. Kuvvetin birimi newton (N) dur.', y);

  const p3 = doc.addPage([595, H]);
  write(p3, 'Alıştırmalar', 770, 20, bold);
  write(p3, '1. Fotosentez hücrenin hangi organelinde gerçekleşir?', 730);
  write(p3, '........................................................................', 705);
  write(p3, '2. Yapraklar neden yeşil görünür?', 670);
  write(p3, '........................................................................', 645);
  write(p3, '3. Fotosentezde havaya verilen gaz __________ gazıdır.', 610);
  write(p3, '4. Bir araç 150 km yolu 3 saatte alıyor. Aracın sürati kaç km/sa olur?', 570);
  write(p3, '........................................................................', 545);
  writeFileSync(file, await doc.save());
}
const bookFile = join(work, 'Fen Bilimleri 7.pdf');
await makeBook(bookFile);

// --- The app ---------------------------------------------------------------------------------
const profile = join(tmpdir(), 'cellar-study-smoke-profile');
rmSync(profile, { recursive: true, force: true });
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
win.on('console', (msg) => msg.type() === 'error' && logs.push(`[console] ${msg.text()}`));
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.unmaximize();
  w.setSize(1680, 1000);
  w.center();
});
await win.waitForSelector('[data-testid=composer-input]', { timeout: 30_000 });
const ipc = (channel, ...args) => win.evaluate(([c, a]) => window.cellar.invoke(c, ...a), [channel, args]);
await ipc('settings:update', { autoTitle: true, scanLmStudio: false });

const [added] = await ipc('study:import', [bookFile]);
console.log(`imported "${added.title}"`);

// The student's own answers on page 3, as if typed with the text tool: 1 right, 2 and 4 wrong.
const session = await ipc('study:get', added.conversationId);
const answer = (id, text, pdfY) => ({ id, type: 'text', page: 3, author: 'user', createdAt: Date.now(), x: 66, y: H - pdfY - 13, width: 300, size: 11, text, color: '#2459c4' });
await ipc(
  'study:save',
  added.bookId,
  [answer('a1', 'Kloroplastta', 705), answer('a2', 'Çünkü klorofil yeşil ışığı soğurur.', 645), answer('a3', '45 km/sa', 545)],
  session.book.version,
);
await ipc('study:setPage', added.bookId, 3);

await win.evaluate((id) => (location.hash = `#/study/${id}`), added.conversationId);
await win.waitForSelector('[data-testid=study-reader]', { timeout: 30_000 });
await win.waitForSelector('.page[data-page-number="3"] .textLayer', { timeout: 30_000 });
await win.waitForTimeout(1500);

const chat = win.getByTestId('study-chat');
await chat.getByTestId('model-picker').click();
const option = win.locator(`[data-testid=model-option][data-provider="${providerId}"][data-model-id="${modelId}"]`);
await option.waitFor({ timeout: 60_000 });
await option.click();

async function turn(text, label) {
  const before = await win.locator('[data-testid=task-turn]').count();
  const started = Date.now();
  await chat.getByTestId('composer-input').fill(text);
  await chat.getByTestId('composer-send').click();
  await win.waitForFunction((n) => document.querySelectorAll('[data-testid=task-turn]').length > n, before, { timeout: 120_000 });
  await win.waitForFunction(
    () => ['complete', 'error', 'stopped'].includes([...document.querySelectorAll('[data-testid=task-turn]')].at(-1)?.getAttribute('data-status') ?? ''),
    null,
    { timeout: Number(process.env.SMOKE_TIMEOUT ?? 600_000), polling: 1000 },
  );
  await win.waitForTimeout(1200);
  const last = win.locator('[data-testid=task-turn]').last();
  const steps = await last.locator('[data-testid=tool-step]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tool')}:${e.getAttribute('data-status')} — ${e.innerText.split('\n')[0]}`));
  const reply = (await last.innerText()).replace(/\n{2,}/g, '\n');
  const book = (await ipc('study:get', added.conversationId)).book;
  console.log(`\n=== ${label}: ${await last.getAttribute('data-status')} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`steps:\n  ${steps.join('\n  ') || '(none)'}`);
  console.log(`reply (end): ${reply.slice(-700)}`);
  console.log(`annotations: ${book.annotations.map((a) => `${a.id}:${a.type}:${a.author}${a.type === 'mark' ? `:${a.verdict}${a.comment ? ` "${a.comment}"` : ''}` : a.type === 'text' || a.type === 'note' ? ` "${a.text.slice(0, 50)}"` : ''} p${a.page}`).join(' | ')}`);
  await win.screenshot({ path: join(outDir, `${shot}-${label}.png`) });
  return book;
}

// 1. Tutor mode, this page: check the answers.
await turn('Cevaplarımı kontrol eder misin?', 'check');

// 2. The whole book: a question answered from another page, with a page citation.
await chat.getByTestId('study-scope').click();
await win.getByRole('menuitem', { name: 'The whole book' }).click();
await turn('Fotosentez nerede gerçekleşir ve hangi gaz açığa çıkar? Kısaca açıkla.', 'book');

// 3. Solve mode: fill in the blank in question 3.
await chat.getByRole('button', { name: 'Solve', exact: true }).click();
await chat.getByTestId('study-scope').click();
await win.getByRole('menuitem', { name: 'This page' }).click();
const solved = await turn('3. sorudaki boşluğu doldur.', 'solve');
const blank = solved.annotations.find((a) => a.author === 'ai' && a.type === 'text');
console.log(`\nblank filled with: ${blank ? `"${blank.text}" at (${blank.x.toFixed(0)}, ${blank.y.toFixed(0)}) size ${blank.size}` : 'nothing'}`);

const exported = join(work, 'with-notes.pdf');
await app.evaluate(({ dialog }, target) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
}, exported);
await win.getByTestId('study-export').click();
for (let i = 0; i < 60 && !existsSync(exported); i++) await win.waitForTimeout(500);
console.log(`export: ${existsSync(exported) ? exported : 'missing'}`);

await app.close();
const problems = logs.filter((l) => /error|fail|exception/i.test(l));
if (problems.length) console.log('--- log problems ---\n' + problems.slice(-25).join('\n'));
