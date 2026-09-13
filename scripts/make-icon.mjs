// Renders Cellar's arch mark to build/icon.png (512px) and resources/icon.png using Electron's renderer.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2A2826"/>
      <stop offset="1" stop-color="#171615"/>
    </linearGradient>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="104" fill="url(#bg)"/>
  <rect x="24.5" y="24.5" width="463" height="463" rx="103.5" fill="none" stroke="#3A3835" stroke-width="1"/>
  <g transform="translate(96 88) scale(10)" fill="none" stroke="#D97757" stroke-linecap="round">
    <path d="M4.5 27.5V15.5C4.5 9.15 9.65 4 16 4s11.5 5.15 11.5 11.5v12" stroke-width="2.6"/>
    <path d="M10.5 27.5v-10a5.5 5.5 0 0 1 11 0v10" stroke-width="2.6"/>
    <path d="M16 12v15.5" stroke-width="1.95"/>
    <path d="M2.5 27.5h27" stroke-width="2.6"/>
  </g>
</svg>`;

const app = await electron.launch({ args: [project], cwd: project, env: { ...process.env, CELLAR_USER_DATA: join(tmpdir(), 'cellar-icon') } });
const win = await app.firstWindow();
await win.waitForLoadState('domcontentloaded');
const dataUrl = await win.evaluate(async (markup) => {
  const img = new Image();
  img.src = `data:image/svg+xml;base64,${btoa(markup)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  canvas.getContext('2d').drawImage(img, 0, 0, 512, 512);
  return canvas.toDataURL('image/png');
}, svg);
await app.close();

const png = Buffer.from(dataUrl.split(',')[1], 'base64');
for (const dir of ['build', 'resources']) {
  mkdirSync(join(project, dir), { recursive: true });
  writeFileSync(join(project, dir, 'icon.png'), png);
}
writeFileSync(join(project, 'build', 'icon.svg'), svg);
console.log(`icon written (${png.length} bytes)`);
