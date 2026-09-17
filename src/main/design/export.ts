import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserWindow, dialog, nativeImage, screen, session } from 'electron';
import { artboardSvg, designHtml } from '@shared/design/render';
import type { Design, DesignExportRequest } from '@shared/types/design';
import { newId } from '../lib/util';
import { paths } from '../system/paths';
import { resolveImage, toDataUrl } from './images';
import { artboardsToPptx } from './pptx';
import { getDesign } from './store';

/** Offline, script-free rendering: only file: and data: URLs load. */
export const RENDER_PARTITION = 'cellar-pdf';

function renderSession() {
  return session.fromPartition(RENDER_PARTITION);
}

let sessionReady = false;
function ensureSession(): void {
  if (sessionReady) return;
  sessionReady = true;
  renderSession().webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(file|data|devtools):/i.test(details.url) }));
}

async function withPage<T>(html: string, size: { width: number; height: number }, use: (win: BrowserWindow) => Promise<T>): Promise<T> {
  ensureSession();
  const file = join(paths().tmp, `render-${newId()}.html`);
  await writeFile(file, html, 'utf8');
  const win = new BrowserWindow({
    show: false,
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
    useContentSize: true,
    frame: false,
    webPreferences: { sandbox: true, javascript: false, partition: RENDER_PARTITION, backgroundThrottling: false },
  });
  try {
    await win.loadFile(file);
    // System fonts and data-URL images finish decoding shortly after load.
    await new Promise((resolve) => setTimeout(resolve, 150));
    return await use(win);
  } finally {
    win.destroy();
    await rm(file, { force: true });
  }
}

/**
 * PNG of a page exactly `width`×`height` CSS pixels, at `scale`. Windows never grow past the screen (hidden
 * or not), so large images are captured tile by tile: injected CSS shifts and scales the page (scripts stay
 * off) and the tiles are stitched into one bitmap.
 */
export async function renderPng(html: string, width: number, height: number, scale = 2): Promise<Buffer> {
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));
  const area = screen.getPrimaryDisplay().workAreaSize;
  const tile = { width: Math.min(targetW, Math.max(320, area.width - 40)), height: Math.min(targetH, Math.max(240, area.height - 40)) };
  // The body keeps the full page size so content past the first tile is not clipped before it is shifted into view.
  return withPage(`${html}<style>html{overflow:hidden!important}body{overflow:visible!important;width:${width}px;height:${height}px}</style>`, tile, async (win) => {
    const [viewW, viewH] = win.getContentSize();
    const out = Buffer.alloc(targetW * targetH * 4);
    for (let ty = 0; ty < targetH; ty += viewH) {
      for (let tx = 0; tx < targetW; tx += viewW) {
        const key = await win.webContents.insertCSS(`body{transform:translate(${-tx}px,${-ty}px) scale(${scale});transform-origin:0 0}`);
        await new Promise((resolve) => setTimeout(resolve, 60));
        const w = Math.min(viewW, targetW - tx);
        const h = Math.min(viewH, targetH - ty);
        let image = await win.webContents.capturePage();
        const size = image.getSize();
        // High-DPI screens capture more pixels than CSS pixels.
        if (size.width !== viewW || size.height !== viewH) image = image.resize({ width: viewW, height: viewH, quality: 'best' });
        if (w !== viewW || h !== viewH) image = image.crop({ x: 0, y: 0, width: w, height: h });
        const bitmap = image.toBitmap();
        for (let row = 0; row < h; row++) bitmap.copy(out, ((ty + row) * targetW + tx) * 4, row * w * 4, (row + 1) * w * 4);
        await win.webContents.removeInsertedCSS(key);
      }
    }
    return nativeImage.createFromBitmap(out, { width: targetW, height: targetH }).toPNG();
  });
}

export async function renderPdf(html: string): Promise<Buffer> {
  return withPage(html, { width: 1200, height: 900 }, (win) => win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } }));
}

/** An SVG as a PNG (for PowerPoint and Word). */
export async function rasterizeSvg(svg: string, width: number, height: number): Promise<Buffer | null> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}img{display:block;width:${w}px;height:${h}px}</style></head><body><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`;
  try {
    return await renderPng(html, w, h, 1);
  } catch {
    return null;
  }
}

async function imageUrls(design: Design, artboardIds: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for (const artboard of design.artboards) {
    if (!artboardIds.includes(artboard.id)) continue;
    for (const el of artboard.elements) {
      if (el.type !== 'image' || !el.src || urls.has(el.src)) continue;
      const image = await resolveImage(el.src);
      urls.set(el.src, image ? toDataUrl(image) : '');
    }
  }
  return urls;
}

const fileSafe = (name: string) => [...name].filter((c) => c.charCodeAt(0) >= 32).join('').replace(/[<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Design';

export interface ExportTarget {
  /** Where to write; when omitted the user is asked. */
  path?: string;
  window?: BrowserWindow;
}

/** Renders a design to PNG, PDF or PowerPoint. Returns the written file or folder, or null when cancelled. */
export async function exportDesign(request: DesignExportRequest, target: ExportTarget = {}): Promise<string | null> {
  const design = getDesign(request.designId);
  const boards = design.artboards.filter((a) => !request.artboardIds?.length || request.artboardIds.includes(a.id));
  if (boards.length === 0) throw new Error('There is nothing to export yet: the design has no artboards.');
  const ids = boards.map((a) => a.id);
  const title = fileSafe(design.title);
  const ask = async (defaultName: string, filters: Electron.FileFilter[]) => {
    if (target.path) return target.path;
    const options = { defaultPath: defaultName, filters };
    const result = target.window ? await dialog.showSaveDialog(target.window, options) : await dialog.showSaveDialog(options);
    return result.canceled || !result.filePath ? null : result.filePath;
  };

  if (request.format === 'pptx') {
    const path = await ask(`${title}.pptx`, [{ name: 'PowerPoint', extensions: ['pptx'] }]);
    if (!path) return null;
    const bytes = await artboardsToPptx(boards, design.theme, { title: design.title }, { image: resolveImage, rasterize: rasterizeSvg });
    await writeFile(path, bytes);
    return path;
  }

  const urls = await imageUrls(design, ids);
  const imageUrl = (src: string) => urls.get(src) ?? '';
  if (request.format === 'pdf') {
    const path = await ask(`${title}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }]);
    if (!path) return null;
    await writeFile(path, await renderPdf(designHtml(design, ids, { mode: 'pdf', imageUrl })));
    return path;
  }

  if (request.format === 'html') {
    const path = await ask(`${title}.html`, [{ name: 'HTML page', extensions: ['html'] }]);
    if (!path) return null;
    await writeFile(path, designHtml(design, ids, { mode: 'html', imageUrl }), 'utf8');
    return path;
  }

  const askFolder = async (dialogTitle: string) => {
    if (target.path) return target.path;
    const options = { title: dialogTitle, properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'> };
    const result = target.window ? await dialog.showOpenDialog(target.window, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  };

  if (request.format === 'svg') {
    if (boards.length === 1) {
      const board = boards[0];
      const path = await ask(`${title} - ${fileSafe(board.name)}.svg`, [{ name: 'SVG image', extensions: ['svg'] }]);
      if (!path) return null;
      await writeFile(path, artboardSvg(board, design.theme, { imageUrl }), 'utf8');
      return path;
    }
    const folder = await askFolder('Choose a folder for the SVG files');
    if (!folder) return null;
    await mkdir(folder, { recursive: true });
    for (const [i, board] of boards.entries()) {
      const name = `${String(i + 1).padStart(2, '0')} ${fileSafe(board.name)}.svg`;
      await writeFile(join(folder, name), artboardSvg(board, design.theme, { imageUrl }), 'utf8');
    }
    return folder;
  }

  const scale = Math.min(4, Math.max(0.25, request.scale ?? 2));
  if (boards.length === 1) {
    const board = boards[0];
    const path = await ask(`${title} - ${fileSafe(board.name)}.png`, [{ name: 'PNG image', extensions: ['png'] }]);
    if (!path) return null;
    await writeFile(path, await renderPng(designHtml(design, [board.id], { mode: 'png', imageUrl }), board.width, board.height, scale));
    return path;
  }
  const folder = await askFolder('Choose a folder for the PNG files');
  if (!folder) return null;
  await mkdir(folder, { recursive: true });
  for (const [i, board] of boards.entries()) {
    const name = `${String(i + 1).padStart(2, '0')} ${fileSafe(board.name)}.png`;
    await writeFile(join(folder, name), await renderPng(designHtml(design, [board.id], { mode: 'png', imageUrl }), board.width, board.height, scale));
  }
  return folder;
}
