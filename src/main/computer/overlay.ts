/**
 * What the user sees while the model has the mouse: a soft glow around the screen, a ripple where it
 * clicks, and a small pill at the top with what it is doing and a Stop button (Allow/Deny when a
 * step needs approval, Resume when paused). Both windows are excluded from screen capture, so the
 * model never sees them, never take focus, and the glow lets every click through.
 */
import { join } from 'node:path';
import { BrowserWindow, screen, type Display, type Rectangle } from 'electron';
import type { ScreenRect } from '@shared/types/computer';
import { logger } from '../lib/log';
import { errorMessage } from '../lib/util';

const log = logger('computer');

const GLOW_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent}
#g{position:fixed;inset:0;box-shadow:inset 0 0 0 2px rgba(217,119,87,.85),inset 0 0 26px 4px rgba(217,119,87,.38);animation:p 2.6s ease-in-out infinite}
@keyframes p{0%,100%{opacity:.7}50%{opacity:1}}
.r{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:2.5px solid rgba(217,119,87,.95);box-shadow:0 0 12px rgba(217,119,87,.5);animation:r .65s ease-out forwards}
.r.k{border-style:dashed}
@keyframes r{from{transform:scale(.25);opacity:1}to{transform:scale(1.5);opacity:0}}
</style></head><body><div id="g"></div><script>
window.ripple=function(x,y,kind){var d=document.createElement('div');d.className='r'+(kind==='right'?' k':'');d.style.left=x+'px';d.style.top=y+'px';document.body.appendChild(d);setTimeout(function(){d.remove()},700)};
</script></body></html>`;

function physicalRect(display: Display): Rectangle {
  return process.platform === 'win32' ? screen.dipToScreenRect(null, display.bounds) : display.bounds;
}

/** The Electron display showing a rectangle the helper reported in physical pixels. */
export function displayFor(rect: ScreenRect): Display {
  const displays = screen.getAllDisplays();
  let best = screen.getPrimaryDisplay();
  let bestOverlap = -1;
  for (const d of displays) {
    const p = physicalRect(d);
    const w = Math.min(p.x + p.width, rect.x + rect.w) - Math.max(p.x, rect.x);
    const h = Math.min(p.y + p.height, rect.y + rect.h) - Math.max(p.y, rect.y);
    const overlap = Math.max(0, w) * Math.max(0, h);
    if (overlap > bestOverlap) {
      best = d;
      bestOverlap = overlap;
    }
  }
  return best;
}

const PILL_WIDTH = 460;

export class ComputerOverlay {
  private glow: BrowserWindow | null = null;
  private pill: BrowserWindow | null = null;
  private display: Display | null = null;
  private pillHeight = 56;

  show(displayRect: ScreenRect): void {
    const display = displayFor(displayRect);
    this.display = display;
    try {
      if (!this.glow || this.glow.isDestroyed()) this.glow = this.createGlow(display);
      else this.glow.setBounds(display.bounds);
      if (!this.pill || this.pill.isDestroyed()) this.pill = this.createPill();
      this.placePill();
      this.glow.showInactive();
      this.pill.showInactive();
      this.glow.moveTop();
      this.pill.moveTop();
    } catch (err) {
      log.warn('could not show the computer-use overlay', errorMessage(err));
    }
  }

  hide(): void {
    for (const win of [this.glow, this.pill]) if (win && !win.isDestroyed()) win.destroy();
    this.glow = null;
    this.pill = null;
  }

  /** The pill grows for approvals and shrinks back; the renderer reports its height. */
  setPillHeight(height: number): void {
    this.pillHeight = Math.max(40, Math.min(260, Math.round(height)));
    this.placePill();
  }

  /** Keep the overlay above windows the model just opened. */
  raise(): void {
    for (const win of [this.glow, this.pill]) if (win && !win.isDestroyed() && win.isVisible()) win.moveTop();
  }

  /** The pill's rectangle in physical pixels, so a click aimed underneath it can move it out of the way. */
  pillScreenRect(): ScreenRect | null {
    if (!this.pill || this.pill.isDestroyed() || !this.pill.isVisible()) return null;
    const b = process.platform === 'win32' ? screen.dipToScreenRect(this.pill, this.pill.getBounds()) : this.pill.getBounds();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  /** Hide the pill while `work` runs (a click, drag or scroll aimed under it). */
  async without<T>(work: () => Promise<T>): Promise<T> {
    const pill = this.pill && !this.pill.isDestroyed() && this.pill.isVisible() ? this.pill : null;
    pill?.hide();
    if (pill) await new Promise((r) => setTimeout(r, 40));
    try {
      return await work();
    } finally {
      setTimeout(() => {
        if (pill && !pill.isDestroyed() && this.pill === pill) pill.showInactive();
      }, 250);
    }
  }

  /** A ripple at a physical screen point. */
  ripple(x: number, y: number, kind: 'left' | 'right' = 'left'): void {
    const glow = this.glow;
    if (!glow || glow.isDestroyed() || !this.display) return;
    const dip = process.platform === 'win32' ? screen.screenToDipPoint({ x, y }) : { x, y };
    const px = Math.round(dip.x - this.display.bounds.x);
    const py = Math.round(dip.y - this.display.bounds.y);
    void glow.webContents.executeJavaScript(`window.ripple && window.ripple(${px}, ${py}, ${JSON.stringify(kind)})`).catch(() => undefined);
  }

  private createGlow(display: Display): BrowserWindow {
    const win = new BrowserWindow({
      ...display.bounds,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      title: 'Cellar is using the computer',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true);
    win.setContentProtection(true);
    win.setVisibleOnAllWorkspaces(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(GLOW_HTML)}`);
    return win;
  }

  private createPill(): BrowserWindow {
    const win = new BrowserWindow({
      width: PILL_WIDTH,
      height: this.pillHeight,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      title: 'Cellar computer use',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setContentProtection(true);
    win.setVisibleOnAllWorkspaces(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/computer`);
    else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/computer' });
    return win;
  }

  private placePill(): void {
    const pill = this.pill;
    if (!pill || pill.isDestroyed()) return;
    const area = (this.display ?? screen.getPrimaryDisplay()).workArea;
    pill.setBounds({ x: Math.round(area.x + (area.width - PILL_WIDTH) / 2), y: area.y + 10, width: PILL_WIDTH, height: this.pillHeight });
  }
}
