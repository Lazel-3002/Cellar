/**
 * Cellar's built-in browser: real Chromium tabs (`WebContentsView`) owned by the main process and
 * parented to the app window, so they share the app's default session — its cookies, its logins and
 * its proxy — without a second sign-in or a browser extension.
 *
 * The renderer draws a side panel with the chrome (tab strip, address bar, buttons) and reports the
 * rectangle the page should fill; the view is a native child of the window painted over that
 * rectangle, so nothing about the page reaches the app's own JavaScript. Pages load with node
 * integration off, context isolation on, sandboxed, with no preload, and permission requests
 * (camera, microphone, location, notifications) are denied outright.
 *
 * The same tabs are what the model drives through the `browse_*` tools in `agent/tools/browser.ts`.
 */
import { BrowserWindow, session, shell, WebContentsView, type ContextMenuParams, type WebContents } from 'electron';
import type { BrowserBounds, BrowserElement, BrowserPageContent, BrowserState, BrowserTab } from '@shared/types/browser';
import { htmlToText } from '../agent/html';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage, newId, throttle } from '../lib/util';
import { saveDomainSession } from './sessions';

const log = logger('browser');

export const MAX_TABS = 8;
/** Enough for a big page; anything larger is almost always a generated app, not a document. */
const MAX_HTML_CHARS = 6_000_000;
const LOAD_TIMEOUT_MS = 45_000;
/** Isolated world for tool scripts: same DOM, separate JavaScript context from the page's own. */
const TOOL_WORLD = 999;
const MAX_SCREENSHOT_WIDTH = 1920;
/** How long the cursor dot a mouse tool draws stays visible on the page. */
const CURSOR_FLASH_MS = 300;

/** Finds clickable/interactive elements in viewport CSS pixels, run in the tool's isolated world. */
const ELEMENTS_SCRIPT = `(() => {
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    return r.bottom >= 0 && r.right >= 0 && r.top <= innerHeight && r.left <= innerWidth;
  };
  const typeOf = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'img') return 'image';
    if (tag === 'button' || el.getAttribute('role') === 'button') return 'button';
    if (tag === 'input') return (el.getAttribute('type') || 'text') === 'submit' ? 'button' : 'input';
    if (tag === 'textarea' || tag === 'select' || el.isContentEditable) return 'input';
    return 'other';
  };
  const selector = 'a[href], button, input, textarea, select, [role="button"], [onclick], img, [contenteditable="true"]';
  return Array.from(document.querySelectorAll(selector))
    .filter(isVisible)
    .slice(0, 300)
    .map((el) => {
      const r = el.getBoundingClientRect();
      const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('alt') || el.value || el.placeholder || '').trim().slice(0, 80);
      return { tag: el.tagName.toLowerCase(), type: typeOf(el), text, x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    });
})()`;

const BLANK = 'about:blank';

interface Tab {
  id: string;
  view: WebContentsView;
  error?: string;
  /** Resolves when the current navigation settles (or times out). */
  pending?: Promise<void>;
}

/** http(s) only: a page must never be able to launch an external protocol handler through us. */
export function normalizeUrl(raw: string): string {
  const text = String(raw ?? '').trim();
  if (!text) throw new Error('Give a URL to open.');
  if (text === BLANK) return BLANK;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`${text} is not a valid URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`The built-in browser only opens http and https pages, not ${url.protocol.replace(':', '')}.`);
  return url.toString();
}

let getWindow: () => BrowserWindow | null = () => BrowserWindow.getAllWindows()[0] ?? null;

export function installBrowser(provider: () => BrowserWindow | null): void {
  getWindow = provider;
}

class BrowserService {
  private tabs: Tab[] = [];
  private activeId: string | null = null;
  private bounds: BrowserBounds | null = null;
  private wanted = false;
  private attached: WebContentsView | null = null;
  private readonly emit = throttle(() => bus.emit('browser:changed', this.state()), 60);

  state(): BrowserState {
    return {
      tabs: this.tabs.map((tab) => this.describe(tab)),
      activeTabId: this.activeId,
      visible: this.wanted && !!this.bounds,
    };
  }

  private describe(tab: Tab): BrowserTab {
    const wc = tab.view.webContents;
    const url = wc.getURL();
    return {
      id: tab.id,
      url: url === BLANK ? '' : url,
      title: wc.getTitle() || '',
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      error: tab.error,
    };
  }

  private changed(): void {
    this.emit();
  }

  private find(tabId?: string | null): Tab {
    const id = tabId ?? this.activeId;
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) throw new Error(tabId ? 'That browser tab is no longer open.' : 'No browser tab is open. Open one first.');
    return tab;
  }

  /** The tab a tool should act on, opening a blank one when the browser has never been used. */
  private ensure(tabId?: string | null): Tab {
    if (!tabId && this.tabs.length === 0) return this.create();
    return this.find(tabId);
  }

  private create(): Tab {
    if (this.tabs.length >= MAX_TABS) throw new Error(`The built-in browser holds at most ${MAX_TABS} tabs. Close one first.`);
    const view = new WebContentsView({
      webPreferences: {
        session: session.defaultSession,
        preload: undefined,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        spellcheck: false,
      },
    });
    const tab: Tab = { id: newId(), view };
    view.setBackgroundColor('#ffffff');
    view.webContents.setAudioMuted(!this.wanted);
    this.wire(tab);
    this.tabs.push(tab);
    this.activeId = tab.id;
    this.sync();
    this.changed();
    return tab;
  }

  private wire(tab: Tab): void {
    const wc = tab.view.webContents;
    const update = () => this.changed();
    wc.on('did-start-loading', update);
    wc.on('did-stop-loading', update);
    wc.on('page-title-updated', update);
    wc.on('did-navigate', () => {
      tab.error = undefined;
      update();
      const host = this.hostOf(tab);
      if (host) void saveDomainSession(host);
    });
    wc.on('did-navigate-in-page', update);
    wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      // -3 is ERR_ABORTED, which a normal in-page navigation or a stopped load reports too.
      if (!isMainFrame || code === -3) return;
      tab.error = `${description || 'The page could not be loaded'} (${url})`;
      update();
    });
    wc.on('render-process-gone', (_event, details) => {
      tab.error = `The page crashed (${details.reason}). Reload to try again.`;
      update();
    });
    // A link that wants a new window becomes a new tab, never a real browser window.
    wc.setWindowOpenHandler(({ url }) => {
      try {
        const target = normalizeUrl(url);
        if (this.tabs.length < MAX_TABS) void this.open(target);
        else void shell.openExternal(target);
      } catch {
        // Not a web URL: ignore rather than hand it to the operating system.
      }
      return { action: 'deny' };
    });
    wc.on('will-navigate', (event, url) => {
      if (!/^https?:/i.test(url) && url !== BLANK) event.preventDefault();
    });
    wc.on('will-redirect', (event, url) => {
      if (!/^https?:/i.test(url) && url !== BLANK) event.preventDefault();
    });
    wc.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  }

  /** Attach the active tab to the window and put it where the panel asked, or detach it. */
  private sync(): void {
    const win = getWindow();
    const active = this.tabs.find((t) => t.id === this.activeId);
    const show = this.wanted && !!this.bounds && !!active && !!win && !win.isDestroyed();
    if (this.attached && (!show || this.attached !== active?.view)) {
      const previous = this.attached;
      this.attached = null;
      try {
        win?.contentView.removeChildView(previous);
      } catch (err) {
        log.warn('could not detach the browser view', errorMessage(err));
      }
    }
    if (!show || !win || !active) return;
    if (this.attached !== active.view) {
      win.contentView.addChildView(active.view);
      this.attached = active.view;
    }
    // The panel measures in renderer CSS pixels; view bounds are window pixels, which differ by the zoom factor.
    const b = this.bounds!;
    const zoom = win.webContents.getZoomFactor() || 1;
    active.view.setBounds({
      x: Math.round(b.x * zoom),
      y: Math.round(b.y * zoom),
      width: Math.max(0, Math.round(b.width * zoom)),
      height: Math.max(0, Math.round(b.height * zoom)),
    });
  }

  setBounds(bounds: BrowserBounds | null): void {
    this.bounds = bounds;
    this.sync();
  }

  setVisible(visible: boolean): void {
    this.wanted = visible;
    if (!visible) this.bounds = null;
    // The page keeps running when the panel is hidden (so the model can still act on it) but a
    // background tab playing audio the user can no longer see or pause would be a real annoyance.
    for (const tab of this.tabs) tab.view.webContents.setAudioMuted(!visible);
    this.sync();
    this.changed();
  }

  private hostOf(tab: Tab): string | null {
    try {
      const url = tab.view.webContents.getURL();
      if (!url || url === BLANK) return null;
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  /** Opens a tab (a new one, or `tabId` reused) and waits for the page to settle. */
  async open(url: string, tabId?: string | null): Promise<BrowserTab> {
    const target = normalizeUrl(url);
    const tab = tabId ? this.find(tabId) : this.create();
    await this.load(tab, () => tab.view.webContents.loadURL(target));
    return this.describe(tab);
  }

  async navigate(url: string, tabId?: string | null): Promise<BrowserTab> {
    const target = normalizeUrl(url);
    const tab = this.ensure(tabId);
    await this.load(tab, () => tab.view.webContents.loadURL(target));
    return this.describe(tab);
  }

  async goBack(tabId?: string | null): Promise<BrowserTab> {
    const tab = this.find(tabId);
    if (!tab.view.webContents.navigationHistory.canGoBack()) throw new Error('There is nothing to go back to in this tab.');
    await this.load(tab, () => {
      tab.view.webContents.navigationHistory.goBack();
      return Promise.resolve();
    });
    return this.describe(tab);
  }

  async goForward(tabId?: string | null): Promise<BrowserTab> {
    const tab = this.find(tabId);
    if (!tab.view.webContents.navigationHistory.canGoForward()) throw new Error('There is nothing to go forward to in this tab.');
    await this.load(tab, () => {
      tab.view.webContents.navigationHistory.goForward();
      return Promise.resolve();
    });
    return this.describe(tab);
  }

  async reload(tabId?: string | null): Promise<BrowserTab> {
    const tab = this.find(tabId);
    await this.load(tab, () => {
      tab.view.webContents.reload();
      return Promise.resolve();
    });
    return this.describe(tab);
  }

  stop(tabId?: string | null): void {
    this.find(tabId).view.webContents.stop();
    this.changed();
  }

  activate(tabId: string): BrowserState {
    this.find(tabId);
    this.activeId = tabId;
    this.sync();
    this.changed();
    return this.state();
  }

  close(tabId: string): BrowserState {
    const index = this.tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return this.state();
    const [tab] = this.tabs.splice(index, 1);
    if (this.attached === tab.view) {
      const win = getWindow();
      try {
        win?.contentView.removeChildView(tab.view);
      } catch {
        // the window may already be gone
      }
      this.attached = null;
    }
    tab.view.webContents.close();
    if (this.activeId === tabId) this.activeId = this.tabs[Math.min(index, this.tabs.length - 1)]?.id ?? null;
    this.sync();
    this.changed();
    return this.state();
  }

  closeAll(): void {
    for (const tab of [...this.tabs]) this.close(tab.id);
  }

  /** Runs a navigation and resolves once the page stops loading (or the load times out). */
  private async load(tab: Tab, start: () => Promise<unknown>): Promise<void> {
    const wc = tab.view.webContents;
    tab.error = undefined;
    const settled = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        tab.error ??= 'The page took too long to load.';
        done();
      }, LOAD_TIMEOUT_MS);
      const done = () => {
        clearTimeout(timer);
        wc.off('did-stop-loading', done);
        wc.off('destroyed', done);
        resolve();
      };
      wc.once('did-stop-loading', done);
      wc.once('destroyed', done);
    });
    try {
      await start();
    } catch (err) {
      // loadURL rejects on ERR_ABORTED for ordinary things like a redirect to a download.
      if (!/ERR_ABORTED/.test(errorMessage(err))) tab.error = errorMessage(err).replace(/^Error: /, '');
    }
    tab.pending = settled;
    await settled;
    this.changed();
  }

  private async run<T>(tab: Tab, code: string): Promise<T> {
    if (tab.view.webContents.isDestroyed()) throw new Error('That browser tab is no longer open.');
    await tab.pending;
    return (await tab.view.webContents.executeJavaScriptInIsolatedWorld(TOOL_WORLD, [{ code }])) as T;
  }

  url(tabId?: string | null): { url: string; title: string } {
    const tab = this.find(tabId);
    const wc = tab.view.webContents;
    const url = wc.getURL();
    if (!url || url === BLANK) throw new Error('This tab has no page open yet.');
    return { url, title: wc.getTitle() };
  }

  /** The page's readable text and links, parsed with the same reader `web_fetch` uses. */
  async content(tabId?: string | null): Promise<BrowserPageContent> {
    const tab = this.find(tabId);
    const url = tab.view.webContents.getURL();
    if (!url || url === BLANK) throw new Error('This tab has no page open yet.');
    if (tab.error) throw new Error(tab.error);
    const html = await this.run<string>(tab, `document.documentElement.outerHTML.slice(0, ${MAX_HTML_CHARS})`);
    const page = htmlToText(html, url);
    return { url, title: page.title || tab.view.webContents.getTitle(), text: page.text, links: page.links };
  }

  async click(selector: string, tabId?: string | null): Promise<string> {
    const tab = this.find(tabId);
    const result = await this.run<{ ok: boolean; label?: string; error?: string }>(
      tab,
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { ok: false, error: 'not-found' };
        el.scrollIntoView({ block: 'center' });
        const label = (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').trim().slice(0, 120);
        el.click();
        return { ok: true, label };
      })()`,
    );
    if (!result.ok) throw new Error(`No element on the page matches ${selector}.`);
    // A click usually starts a navigation; give it a moment to begin, then wait for it.
    await this.settleAfterInteraction(tab);
    return result.label ? `Clicked ${selector} ("${result.label}").` : `Clicked ${selector}.`;
  }

  async fill(selector: string, value: string, tabId?: string | null): Promise<string> {
    const tab = this.find(tabId);
    const result = await this.run<{ ok: boolean; error?: string }>(
      tab,
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { ok: false, error: 'not-found' };
        const value = ${JSON.stringify(value)};
        el.scrollIntoView({ block: 'center' });
        if (el.isContentEditable) {
          el.focus();
          el.textContent = value;
          el.dispatchEvent(new InputEvent('input', { bubbles: true }));
          return { ok: true };
        }
        if (!('value' in el)) return { ok: false, error: 'not-a-field' };
        el.focus();
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      })()`,
    );
    if (!result.ok) throw new Error(result.error === 'not-a-field' ? `${selector} is not a text field.` : `No element on the page matches ${selector}.`);
    return `Filled ${selector}.`;
  }

  /** Fills a field and submits its form (or presses enter in it) in one step. */
  async submit(selector: string, value: string, tabId?: string | null): Promise<string> {
    const tab = this.find(tabId);
    const result = await this.run<{ ok: boolean; error?: string }>(
      tab,
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { ok: false, error: 'not-found' };
        const value = ${JSON.stringify(value)};
        el.scrollIntoView({ block: 'center' });
        if ('value' in el) {
          el.focus();
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) setter.call(el, value);
          else el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.isContentEditable) {
          el.focus();
          el.textContent = value;
          el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        } else {
          return { ok: false, error: 'not-a-field' };
        }
        const form = el.form || el.closest('form');
        if (form) {
          if (form.requestSubmit) form.requestSubmit();
          else form.submit();
        } else {
          const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
          el.dispatchEvent(new KeyboardEvent('keydown', opts));
          el.dispatchEvent(new KeyboardEvent('keyup', opts));
        }
        return { ok: true };
      })()`,
    );
    if (!result.ok) throw new Error(result.error === 'not-a-field' ? `${selector} is not a text field.` : `No element on the page matches ${selector}.`);
    await this.settleAfterInteraction(tab);
    return `Filled ${selector} and submitted.`;
  }

  /** Finds a link by its visible text (case-insensitive substring) and clicks it. */
  async clickLinkByText(text: string, tabId?: string | null): Promise<string> {
    const tab = this.find(tabId);
    const result = await this.run<{ ok: boolean; label?: string }>(
      tab,
      `(() => {
        const needle = ${JSON.stringify(text)}.toLowerCase();
        const link = Array.from(document.querySelectorAll('a[href]')).find((a) => (a.innerText || a.textContent || '').trim().toLowerCase().includes(needle));
        if (!link) return { ok: false };
        link.scrollIntoView({ block: 'center' });
        const label = (link.innerText || link.textContent || '').trim().slice(0, 120);
        link.click();
        return { ok: true, label };
      })()`,
    );
    if (!result.ok) throw new Error(`No link with text matching "${text}" was found on the page.`);
    await this.settleAfterInteraction(tab);
    return `Clicked the link "${result.label}". Now at ${tab.view.webContents.getURL()}.`;
  }

  async scroll(delta: number, tabId?: string | null): Promise<string> {
    const tab = this.find(tabId);
    const position = await this.run<{ y: number; height: number }>(
      tab,
      `(() => { window.scrollBy(0, ${Number(delta) || 0}); return { y: Math.round(window.scrollY), height: Math.round(document.documentElement.scrollHeight) }; })()`,
    );
    return `Scrolled to ${position.y} of ${position.height} pixels.`;
  }

  /** A PNG of the viewport (or `rect` of it), capped to `MAX_SCREENSHOT_WIDTH` wide. */
  async screenshot(tabId?: string | null, rect?: { x: number; y: number; width: number; height: number }): Promise<{ base64: string; width: number; height: number }> {
    const tab = this.find(tabId);
    const wc = tab.view.webContents;
    if (wc.isDestroyed()) throw new Error('That browser tab is no longer open.');
    let image = rect
      ? await wc.capturePage({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) })
      : await wc.capturePage();
    const size = image.getSize();
    if (size.width > MAX_SCREENSHOT_WIDTH) image = image.resize({ width: MAX_SCREENSHOT_WIDTH, height: Math.round((size.height / size.width) * MAX_SCREENSHOT_WIDTH) });
    const out = image.getSize();
    return { base64: image.toPNG().toString('base64'), width: out.width, height: out.height };
  }

  /** Clickable/interactive elements on the page, in the same viewport CSS pixel space the mouse tools use. */
  async elements(tabId?: string | null): Promise<BrowserElement[]> {
    const tab = this.find(tabId);
    return this.run<BrowserElement[]>(tab, ELEMENTS_SCRIPT);
  }

  /** A cheap, non-LLM summary of what's on the page: its title and first heading. */
  async pageSummary(tabId?: string | null): Promise<{ title: string; heading: string }> {
    const tab = this.find(tabId);
    return this.run(tab, `(() => ({ title: document.title || '', heading: (document.querySelector('h1')?.innerText || '').trim().slice(0, 150) }))()`);
  }

  async mouseMove(x: number, y: number, tabId?: string | null): Promise<void> {
    const tab = this.find(tabId);
    tab.view.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    await this.flashCursor(tab, x, y);
  }

  async mouseClick(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left', tabId?: string | null): Promise<void> {
    const tab = this.find(tabId);
    const wc = tab.view.webContents;
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    wc.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount: 1 });
    await this.flashCursor(tab, x, y);
    await this.settleAfterInteraction(tab);
  }

  async mouseDoubleClick(x: number, y: number, tabId?: string | null): Promise<void> {
    const tab = this.find(tabId);
    const wc = tab.view.webContents;
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    for (const clickCount of [1, 2] as const) {
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount });
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount });
    }
    await this.flashCursor(tab, x, y);
    await this.settleAfterInteraction(tab);
  }

  /** Right-clicks and reports the page's own context-menu target (link/image/selection), if it built one. */
  async mouseRightClick(x: number, y: number, tabId?: string | null): Promise<ContextMenuParams | null> {
    const tab = this.find(tabId);
    const wc = tab.view.webContents;
    const menu = new Promise<ContextMenuParams | null>((resolve) => {
      const timer = setTimeout(() => {
        wc.off('context-menu', onMenu);
        resolve(null);
      }, 400);
      const onMenu = (_event: unknown, params: ContextMenuParams) => {
        clearTimeout(timer);
        resolve(params);
      };
      wc.once('context-menu', onMenu);
    });
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'right', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'right', clickCount: 1 });
    await this.flashCursor(tab, x, y);
    return menu;
  }

  /** Draws a brief cursor dot on the page itself so the user can see where a mouse tool acted. */
  private async flashCursor(tab: Tab, x: number, y: number): Promise<void> {
    try {
      await this.run(
        tab,
        `(() => {
          let el = document.getElementById('__cellar_cursor__');
          if (!el) {
            el = document.createElement('div');
            el.id = '__cellar_cursor__';
            el.style.cssText = 'position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,70,70,.55);border:2px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.45);pointer-events:none;transition:opacity .15s ease-out;';
            (document.documentElement || document.body).appendChild(el);
          }
          el.style.left = ${JSON.stringify(String(x))} + 'px';
          el.style.top = ${JSON.stringify(String(y))} + 'px';
          el.style.opacity = '1';
          clearTimeout(el.__cellarTimer);
          el.__cellarTimer = setTimeout(() => { el.style.opacity = '0'; }, ${CURSOR_FLASH_MS});
        })()`,
      );
    } catch {
      // No document yet (blank tab, mid-navigation): nothing to draw on.
    }
  }

  /** Waits briefly for a click to start a navigation, then for that navigation to finish. */
  private async settleAfterInteraction(tab: Tab): Promise<void> {
    const wc = tab.view.webContents;
    const started = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => done(false), 400);
      const done = (value: boolean) => {
        clearTimeout(timer);
        wc.off('did-start-loading', onStart);
        resolve(value);
      };
      const onStart = () => done(true);
      wc.once('did-start-loading', onStart);
    });
    if (!started) return;
    await this.load(tab, () => Promise.resolve());
  }

  /** Used by the tools to tell the user's panel to show what the model is doing. */
  reveal(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.sync();
    bus.emit('browser:reveal', {});
    this.changed();
  }

  dispose(): void {
    this.closeAll();
  }

  /** Test seam: the webContents behind a tab. */
  contentsFor(tabId: string): WebContents | undefined {
    return this.tabs.find((t) => t.id === tabId)?.view.webContents;
  }
}

export const browser = new BrowserService();
