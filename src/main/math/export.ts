import { writeFile } from 'node:fs/promises';
import { BrowserWindow, dialog } from 'electron';
import { boardHtml, boardMarkdown, estimateBoardHeight } from '@shared/math/render';
import type { MathExportRequest } from '@shared/types/math';
import { renderPdf, renderPng } from '../design/export';
import { getBoard } from './store';

/** A4 width at 96 dpi, so a PNG of the board matches the printed page. */
const PAGE_WIDTH = 794;

const fileSafe = (name: string) =>
  [...name]
    .filter((c) => c.charCodeAt(0) >= 32)
    .join('')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Board';

export interface ExportTarget {
  /** Where to write; when omitted the user is asked. */
  path?: string;
  window?: BrowserWindow;
}

/** Renders a board to PDF, PNG or Markdown. Returns the written file, or null when cancelled. */
export async function exportBoard(request: MathExportRequest, target: ExportTarget = {}): Promise<string | null> {
  const board = getBoard(request.boardId);
  if (board.blocks.length === 0) throw new Error('There is nothing to export yet: the board is empty.');
  const answers = request.answers !== false;
  const title = fileSafe(board.title);
  const suffix = answers ? '' : ' - test';
  const ask = async (defaultName: string, filters: Electron.FileFilter[]) => {
    if (target.path) return target.path;
    const options = { defaultPath: defaultName, filters };
    const result = target.window ? await dialog.showSaveDialog(target.window, options) : await dialog.showSaveDialog(options);
    return result.canceled || !result.filePath ? null : result.filePath;
  };

  if (request.format === 'md') {
    const path = await ask(`${title}${suffix}.md`, [{ name: 'Markdown', extensions: ['md'] }]);
    if (!path) return null;
    await writeFile(path, boardMarkdown(board, { answers }), 'utf8');
    return path;
  }

  if (request.format === 'pdf') {
    const path = await ask(`${title}${suffix}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }]);
    if (!path) return null;
    await writeFile(path, await renderPdf(boardHtml(board, { answers })));
    return path;
  }

  const path = await ask(`${title}${suffix}.png`, [{ name: 'PNG image', extensions: ['png'] }]);
  if (!path) return null;
  const html = boardHtml(board, { answers, width: PAGE_WIDTH });
  const scale = Math.min(4, Math.max(0.25, request.scale ?? 2));
  await writeFile(path, await renderPng(html, PAGE_WIDTH, estimateBoardHeight(board, PAGE_WIDTH, { answers }), scale));
  return path;
}
