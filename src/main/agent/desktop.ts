import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserWindow, Notification, session } from 'electron';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { newId } from '../lib/util';
import { settings } from '../services/settings';
import { paths } from '../system/paths';
import { rasterizeGradient, rasterizeSvg } from '../design/export';
import { setGradientRasterizer, setPdfRenderer, setSvgRasterizer } from './documents';

const log = logger('cowork');
const PDF_PARTITION = 'cellar-pdf';

/** Render generated HTML to PDF with Chromium in an offline, script-free hidden window. */
export function installPdfRenderer(): void {
  const pdfSession = session.fromPartition(PDF_PARTITION);
  pdfSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(file|data|devtools):/i.test(details.url) }));
  setPdfRenderer(async (html) => {
    const file = join(paths().tmp, `document-${newId()}.html`);
    await writeFile(file, html, 'utf8');
    const win = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { sandbox: true, javascript: false, partition: PDF_PARTITION } });
    try {
      await win.loadFile(file);
      // Page size and margins come from the document's @page rule, so themed backgrounds reach the page edges.
      return await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    } finally {
      win.destroy();
      await rm(file, { force: true });
    }
  });
  setSvgRasterizer(rasterizeSvg);
  setGradientRasterizer(rasterizeGradient);
}

/**
 * Desktop notifications when a task or Code session finishes or waits for approval while Cellar is in the
 * background. With the window focused, the renderer shows a toast instead (unless the task is open).
 */
export function installTaskNotifications(getWindow: () => BrowserWindow | null): void {
  bus.on('tasks:notify', (notice) => {
    const win = getWindow();
    if ((win && win.isFocused()) || !settings.get().coworkNotifications) return;
    if (notice.kind === 'approval' && win) win.flashFrame(true);
    if (!Notification.isSupported()) return;
    try {
      const notification = new Notification({ title: notice.title, body: notice.body });
      notification.on('click', () => {
        const target = getWindow();
        if (target) {
          if (target.isMinimized()) target.restore();
          target.show();
          target.focus();
        }
        bus.emit('app:open', { conversationId: notice.conversationId, kind: notice.conversationKind });
      });
      notification.show();
    } catch (err) {
      log.warn('notification failed', err);
    }
  });
}
