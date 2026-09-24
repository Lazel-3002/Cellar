/**
 * Computer use, the live side: one run at a time has the screen. Its first action moves Cellar's
 * window out of the way and puts up the overlay; every action checks that the user has not taken
 * the mouse back, refuses Cellar's own windows, blocked apps and password fields, acts, waits for
 * the screen to settle and looks again, so the model always sees what its step did.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { globalShortcut, shell, type BrowserWindow } from 'electron';
import {
  asUrl,
  coordinateSpaceFor,
  describeObservation,
  isBlockedApp,
  matchApps,
  orderedWindows,
  parseKeyCombo,
  rectCenter,
  rectContains,
  regionToScreen,
  toScreen,
  type InstalledApp,
  type ScreenFrame,
} from '@shared/computer';
import type { ComputerState, ComputerTestResult, ScreenDisplay, ScreenElement, ScreenObservation, ScreenRect, ScreenWindow } from '@shared/types/computer';
import type { ApprovalRequest } from '@shared/types/agent';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage, sleep } from '../lib/util';
import { settings } from '../services/settings';
import { paths } from '../system/paths';
import { ComputerHelper, HelperError } from './helper';
import { ComputerOverlay } from './overlay';

const log = logger('computer');

export const STOP_SHORTCUT = 'Control+Alt+Escape';
/** How far (physical px) the pointer may drift from where Cellar left it before that counts as the user taking over (only when the mouse hook is unavailable). */
const TAKEOVER_DISTANCE = 40;
/** Real mouse events since Cellar's last step that count as the user taking over (a bump of the desk is one or two). */
const TAKEOVER_EVENTS = 4;

export interface ComputerOwner {
  conversationId: string;
  messageId: string;
  signal: AbortSignal;
  /** Stops the whole run (the pill's Stop button and the shortcut). */
  stop: () => void;
}

interface Session extends ComputerOwner {
  /** The latest screenshot the model saw, for mapping its coordinates. */
  frame: ScreenFrame | null;
  elements: ScreenElement[];
  windows: ScreenWindow[];
  display: ScreenRect | null;
  /** Where Cellar left the pointer (the fallback check when the mouse hook is unavailable). */
  lastCursor: { x: number; y: number } | null;
  /** The helper's count of real mouse events after Cellar's last step. */
  lastUserInput: number | null;
  hidMain: boolean;
  wait: { resolve: () => void; reject: (err: Error) => void } | null;
}

export interface LookOptions {
  vision: boolean;
  modelId: string;
  /** Controls listed at most (a small context window gets a shorter list). */
  maxElements?: number;
  /** A rectangle in the model's coordinates to look at more closely. */
  zoom?: { x: number; y: number; width: number; height: number };
  /** Physical point to mark on the screenshot (where the last click landed). */
  pointer?: { x: number; y: number };
}

export interface Look {
  text: string;
  image: { mime: string; base64: string } | null;
}

/** Physical target of a pointer action, with what is there (for approval cards, risk and guards). */
export interface Target {
  x: number;
  y: number;
  /** "[12] button “Send”" or "(640, 360)". */
  label: string;
  /** The control's own name, when known. */
  name: string;
  process: string;
  title: string;
  password: boolean;
  cellar: boolean;
}

class ComputerController {
  private helper = new ComputerHelper(
    () => join(paths().cellarHome, 'computer'),
    () => [process.pid],
  );
  private overlay = new ComputerOverlay();
  private getMain: () => BrowserWindow | null = () => null;
  private session: Session | null = null;
  private state: ComputerState = { phase: 'idle' };
  private apps: { at: number; list: InstalledApp[] } | null = null;
  private shortcut = false;

  install(getMainWindow: () => BrowserWindow | null): void {
    this.getMain = getMainWindow;
  }

  current(): ComputerState {
    return this.state;
  }

  private setState(patch: Partial<ComputerState> & { phase: ComputerState['phase'] }): void {
    const s = this.session;
    this.state = {
      conversationId: s?.conversationId,
      messageId: s?.messageId,
      stopShortcut: this.shortcut ? 'Ctrl+Alt+Esc' : undefined,
      ...patch,
    };
    bus.emit('computer:state', this.state);
  }

  /** Show what the model is doing on the pill. */
  status(action: string): void {
    if (this.session && this.state.phase === 'working') this.setState({ phase: 'working', action });
  }

  // ---------- session ----------

  /** The run this owner belongs to gets the screen (the first computer step of a run calls this). */
  async begin(owner: ComputerOwner): Promise<Session> {
    const current = this.session;
    if (current && current.messageId === owner.messageId) return current;
    if (current && !current.signal.aborted) throw new HelperError('Another chat or task is using the computer right now. Wait for it to finish (or stop it), then try again.');
    if (current) this.end(current.messageId);
    const app = settings.get();
    const displays = await this.helper.displays();
    const display = displays[app.computerDisplay] ?? displays.find((d) => d.primary) ?? displays[0];
    const session: Session = { ...owner, frame: null, elements: [], windows: [], display: display?.bounds ?? null, lastCursor: null, lastUserInput: null, hidMain: false, wait: null };
    this.session = session;
    owner.signal.addEventListener('abort', () => this.end(owner.messageId), { once: true });
    const main = this.getMain();
    if (app.computerHideWindow && main && !main.isDestroyed() && main.isVisible() && !main.isMinimized()) {
      main.minimize();
      session.hidMain = true;
      await sleep(350);
    }
    if (display) this.overlay.show(display.bounds);
    this.registerShortcut();
    await this.settled(session);
    this.setState({ phase: 'working', action: 'Starting…' });
    return session;
  }

  /** The run finished, failed or was stopped: take the overlay down and bring Cellar back. */
  end(messageId: string): void {
    const s = this.session;
    if (!s || s.messageId !== messageId) return;
    this.session = null;
    s.wait?.reject(new Error('Stopped'));
    this.overlay.hide();
    this.unregisterShortcut();
    const main = this.getMain();
    if (s.hidMain && main && !main.isDestroyed()) {
      if (main.isMinimized()) main.restore();
      main.show();
    }
    this.setState({ phase: 'idle' });
  }

  activeFor(messageId: string): boolean {
    return this.session?.messageId === messageId;
  }

  /** An element from this run's latest look (for naming it on an approval card before acting). */
  knownElement(messageId: string, n: number): ScreenElement | null {
    return this.session?.messageId === messageId ? (this.session.elements.find((e) => e.n === n) ?? null) : null;
  }

  /**
   * A button (or menu item, tab, link…) on the latest screenshot whose name is exactly `text`, when
   * no text field has the focus: small models "type" a calculator key's label when they mean to
   * press it.
   */
  buttonNamed(messageId: string, text: string): ScreenElement | null {
    const s = this.session;
    if (!s || s.messageId !== messageId) return null;
    const wanted = text.trim().toLowerCase();
    if (!wanted || wanted.length > 60) return null;
    if (s.elements.some((e) => e.focused && /text field|document|dropdown|edit/.test(e.role))) return null;
    return s.elements.find((e) => e.enabled && e.name.trim().toLowerCase() === wanted && /button|menu item|tab|link|list item|checkbox|radio/.test(e.role)) ?? null;
  }

  /** The name of the control under x/y on this run's latest screenshot, if the helper can tell. */
  async nameAt(messageId: string | undefined, spec: { element?: number; x?: number; y?: number }): Promise<string | undefined> {
    const s = this.session;
    if (!s || s.messageId !== messageId || !s.frame || spec.x === undefined || spec.y === undefined) return undefined;
    try {
      const p = toScreen(s.frame, spec.x, spec.y);
      return (await this.helper.pointInfo(p.x, p.y)).element?.name || undefined;
    } catch {
      return undefined;
    }
  }

  private registerShortcut(): void {
    if (this.shortcut || process.env.CELLAR_NO_GLOBAL_SHORTCUT) return;
    try {
      this.shortcut = globalShortcut.register(STOP_SHORTCUT, () => this.stop());
    } catch (err) {
      log.warn('could not register the stop shortcut', errorMessage(err));
    }
  }

  private unregisterShortcut(): void {
    if (!this.shortcut) return;
    globalShortcut.unregister(STOP_SHORTCUT);
    this.shortcut = false;
  }

  stop(): void {
    const s = this.session;
    if (!s) return;
    s.stop();
    this.end(s.messageId);
  }

  resume(): void {
    const wait = this.session?.wait;
    if (!wait) return;
    this.session!.wait = null;
    wait.resolve();
  }

  setPillHeight(height: number): void {
    this.overlay.setPillHeight(height);
  }

  /** Wait for the user (after they took the mouse, or to do something only they should). */
  private waitForUser(session: Session, phase: 'paused' | 'handover', reason: string): Promise<void> {
    this.setState({ phase, reason });
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(session.signal.reason ?? new Error('Stopped'));
      if (session.signal.aborted) return onAbort();
      session.signal.addEventListener('abort', onAbort, { once: true });
      session.wait = {
        resolve: () => {
          session.signal.removeEventListener('abort', onAbort);
          this.setState({ phase: 'working', action: 'Continuing…' });
          resolve();
        },
        reject: (err) => {
          session.signal.removeEventListener('abort', onAbort);
          reject(err);
        },
      };
    });
  }

  /** A tool call is waiting for approval while Cellar's window is out of the way: ask on the pill. */
  approvalWaiting(messageId: string, toolCallId: string, approval: ApprovalRequest): void {
    if (!this.activeFor(messageId)) return;
    this.setState({
      phase: 'approval',
      approval: { toolCallId, title: approval.title, detail: approval.preview?.slice(0, 400), canAllowAll: approval.kind !== 'action' },
    });
  }

  approvalDone(messageId: string): void {
    const s = this.session;
    if (!s || s.messageId !== messageId) return;
    if (this.state.phase === 'approval') this.setState({ phase: 'working', action: 'Continuing…' });
    // The user just moved the mouse to answer: that is not taking over.
    void this.settled(s);
  }

  /** Remember where things stand after Cellar's own step (or the user's answer), so the next step can tell whether the user took the mouse since. */
  private async settled(session: Session): Promise<void> {
    const [cursor, input] = await Promise.all([this.helper.cursor().catch(() => null), this.helper.userInput().catch(() => null)]);
    if (this.session !== session) return;
    session.lastCursor = cursor;
    session.lastUserInput = input?.watching ? input.mouse : null;
  }

  /** Did the user take the mouse since Cellar's last step? Real mouse events when the hook is on; how far the pointer moved otherwise. */
  private async userMoved(session: Session): Promise<boolean> {
    const input = await this.helper.userInput().catch(() => null);
    if (input?.watching && session.lastUserInput !== null) {
      const moved = input.mouse - session.lastUserInput >= TAKEOVER_EVENTS;
      if (moved) log.info(`paused: ${input.mouse - session.lastUserInput} real mouse events since the last step`);
      return moved;
    }
    if (!session.lastCursor) return false;
    const now = await this.helper.cursor().catch(() => null);
    const moved = !!now && Math.hypot(now.x - session.lastCursor.x, now.y - session.lastCursor.y) > TAKEOVER_DISTANCE;
    if (moved) log.info(`paused: the pointer moved from (${session.lastCursor.x}, ${session.lastCursor.y}) to (${now!.x}, ${now!.y})`);
    return moved;
  }

  /**
   * Before each action: did the user take over? (moved the pointer, or brought Cellar's window
   * back). If so, wait for Resume and report that instead of acting on a screen that changed.
   */
  async checkIn(session: Session): Promise<boolean> {
    const app = settings.get();
    const main = this.getMain();
    const cellarBack = session.hidMain && !!main && !main.isDestroyed() && main.isVisible() && !main.isMinimized();
    const moved = app.computerPauseOnMouse && (await this.userMoved(session));
    if (!moved && !cellarBack) return false;
    await this.waitForUser(session, 'paused', moved ? 'You moved the mouse, so Cellar paused.' : 'Cellar paused while its window is open.');
    if (cellarBack && main && !main.isDestroyed() && !main.isMinimized()) {
      main.minimize();
      await sleep(300);
    }
    await this.settled(session);
    return true;
  }

  async handOver(session: Session, reason: string): Promise<void> {
    await this.waitForUser(session, 'handover', reason);
    await this.settled(session);
  }

  // ---------- looking ----------

  async look(session: Session, o: LookOptions): Promise<Look> {
    const app = settings.get();
    const space = coordinateSpaceFor(o.modelId, app.computerCoordinates);
    const maxWidth = app.computerScreenshotWidth;
    const maxHeight = Math.round(maxWidth * 0.625);
    const zoomed = !!o.zoom && !!session.frame;
    const region = zoomed ? regionToScreen(session.frame!, o.zoom!) : undefined;
    this.overlay.raise();
    const obs = await this.helper.observe({
      display: app.computerDisplay,
      maxWidth,
      maxHeight,
      marks: app.computerMarks && o.vision,
      elements: !zoomed,
      image: o.vision,
      region,
      pointer: o.pointer,
      maxElements: 150,
    });
    const frame: ScreenFrame = { region: obs.region, imageWidth: obs.imageWidth, imageHeight: obs.imageHeight, space };
    if (!zoomed) {
      session.frame = frame;
      session.elements = obs.elements;
      session.windows = obs.windows;
      session.display = obs.display;
    }
    const blocked = obs.foreground ? isBlockedApp(obs.foreground.process, obs.foreground.title, app.computerBlockedApps) : null;
    if (blocked && !zoomed) {
      // A blocked app in front: the model gets neither its pixels nor its controls.
      return {
        text: `The active window belongs to ${blocked}, which the user does not let Cellar see or use, so there is no screenshot. Open windows: ${this.windowList(obs.windows)}. Switch to another window with computer_windows, or use computer_hand_over.`,
        image: null,
      };
    }
    const text = describeObservation(obs, { frame, vision: o.vision, maxElements: o.maxElements ?? 150, zoomed });
    return { text, image: obs.image && obs.mime ? { mime: obs.mime, base64: obs.image } : null };
  }

  // ---------- targets ----------

  /** Where a pointer action lands: an element from the latest look, or x/y in the model's coordinates. */
  async target(session: Session, spec: { element?: number; x?: number; y?: number }): Promise<Target> {
    if (spec.element !== undefined) {
      const known = session.elements.find((e) => e.n === spec.element);
      if (!known) throw new HelperError(`There is no element ${spec.element} on the latest screenshot (it has ${session.elements.length}). Take a new look with computer_screenshot.`);
      const live = await this.helper.element(spec.element);
      const window = session.windows.find((w) => w.hwnd === known.window);
      return {
        x: live.x,
        y: live.y,
        label: `[${known.n}] ${known.role}${known.name ? ` “${known.name.slice(0, 60)}”` : ''}`,
        name: live.name || known.name,
        process: live.process,
        title: window?.title ?? '',
        password: live.password,
        cellar: live.pid === process.pid,
      };
    }
    if (spec.x === undefined || spec.y === undefined) throw new HelperError('Say where: an element number from the screenshot (element), or x and y.');
    if (!session.frame) throw new HelperError('Take a look at the screen first (computer_screenshot), so coordinates mean something.');
    const p = toScreen(session.frame, spec.x, spec.y);
    const info = await this.helper.pointInfo(p.x, p.y);
    const inside = session.elements.filter((e) => rectContains(e.rect, p.x, p.y)).sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h)[0];
    const name = info.element?.name || inside?.name || '';
    return {
      ...p,
      label: `(${spec.x}, ${spec.y})${name ? ` on “${name.slice(0, 60)}”` : ''}`,
      name,
      process: info.process,
      title: info.title,
      password: !!info.element?.password,
      cellar: info.cellar,
    };
  }

  private guardTarget(t: Target): void {
    if (t.cellar) throw new HelperError("That spot is on Cellar's own window, which you cannot use. Ask the user in your reply instead.");
    const blocked = isBlockedApp(t.process, t.title, settings.get().computerBlockedApps);
    if (blocked) throw new HelperError(`That is ${blocked}, which the user does not let Cellar use. Use computer_hand_over if the user has to do it.`);
  }

  private async guardKeyboard(): Promise<{ process: string; title: string; element?: { name: string; role: string; password: boolean } }> {
    const f = await this.helper.focused();
    if (f.cellar) throw new HelperError("Cellar's own window has the keyboard focus. Click into the app you want first, or switch to it with computer_windows.");
    const blocked = isBlockedApp(f.process, f.title, settings.get().computerBlockedApps);
    if (blocked) throw new HelperError(`The keyboard focus is in ${blocked}, which the user does not let Cellar use.`);
    return f;
  }

  private async pointerAction<T>(session: Session, point: { x: number; y: number }, work: () => Promise<T>): Promise<T> {
    const pill = this.overlay.pillScreenRect();
    const result = pill && rectContains(pill, point.x, point.y) ? await this.overlay.without(work) : await work();
    await this.settled(session);
    return result;
  }

  // ---------- acting ----------

  async click(session: Session, t: Target, o: { button: 'left' | 'right' | 'middle'; clicks: number; hold?: string }): Promise<void> {
    this.guardTarget(t);
    const hold = o.hold ? parseKeyCombo(o.hold).keys : [];
    await this.pointerAction(session, t, async () => {
      this.overlay.ripple(t.x, t.y, o.button === 'right' ? 'right' : 'left');
      await this.helper.click(t.x, t.y, o.button, o.clicks, hold);
    });
  }

  async move(session: Session, t: Target): Promise<void> {
    this.guardTarget(t);
    await this.pointerAction(session, t, () => this.helper.move(t.x, t.y));
  }

  async drag(session: Session, from: Target, to: Target): Promise<void> {
    this.guardTarget(from);
    this.guardTarget(to);
    await this.pointerAction(session, from, async () => {
      this.overlay.ripple(from.x, from.y);
      await this.helper.drag(from.x, from.y, to.x, to.y);
      this.overlay.ripple(to.x, to.y);
    });
  }

  async scroll(session: Session, t: Target | null, direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void> {
    let point = t;
    if (!point) {
      // No target: the middle of the active window (or of the screen).
      const fg = session.windows.find((w) => w.foreground);
      const rect = fg && !fg.minimized ? fg.rect : session.display;
      if (!rect) throw new HelperError('Take a look at the screen first (computer_screenshot).');
      const c = rectCenter(rect);
      const info = await this.helper.pointInfo(c.x, c.y);
      point = { ...c, label: 'the active window', name: '', process: info.process, title: info.title, password: false, cellar: info.cellar };
    }
    this.guardTarget(point);
    const notches = Math.max(1, Math.min(30, Math.round(amount)));
    const dy = direction === 'up' ? notches : direction === 'down' ? -notches : 0;
    const dx = direction === 'right' ? notches : direction === 'left' ? -notches : 0;
    await this.pointerAction(session, point, () => this.helper.scroll(point!.x, point!.y, dx, dy));
  }

  /** Type into whatever has the keyboard focus (never a password field). */
  async type(session: Session, text: string, o: { clear?: boolean; enter?: boolean }): Promise<void> {
    const f = await this.guardKeyboard();
    if (f.element?.password) throw new HelperError('The focused field is a password field. Cellar never types passwords: use computer_hand_over so the user types it.');
    if (o.clear) {
      await this.helper.keys(parseKeyCombo('ctrl+a').keys);
      await this.helper.keys(parseKeyCombo('delete').keys);
    }
    if (text) await this.helper.type(text);
    if (o.enter) await this.helper.keys(parseKeyCombo('enter').keys);
    await this.settled(session);
  }

  async keys(session: Session, combo: string, repeat: number): Promise<string> {
    const parsed = parseKeyCombo(combo);
    await this.guardKeyboard();
    await this.helper.keys(parsed.keys, Math.max(1, Math.min(50, Math.round(repeat))));
    await this.settled(session);
    return parsed.label;
  }

  async focusElement(n: number): Promise<void> {
    await this.helper.focusElement(n);
  }

  // ---------- windows and apps ----------

  /** A window by its number (1 is the active window, then front to back) or by words in its title or app name. */
  async findWindow(session: Session, which: string | number): Promise<ScreenWindow> {
    const windows = await this.helper.windows();
    session.windows = windows;
    if (typeof which === 'number' || /^\d+$/.test(String(which).trim())) {
      const n = Number(which);
      const hit = orderedWindows(windows)[n - 1];
      if (!hit) throw new HelperError(`There is no window ${n}. Windows now: ${this.windowList(windows)}`);
      return hit;
    }
    const q = String(which).toLowerCase().trim();
    const hit =
      windows.find((w) => w.title.toLowerCase() === q) ??
      windows.find((w) => w.process.toLowerCase() === q) ??
      windows.find((w) => w.title.toLowerCase().includes(q)) ??
      windows.find((w) => w.process.toLowerCase().includes(q));
    if (!hit) throw new HelperError(`No open window matches "${which}". Windows now: ${this.windowList(windows)}`);
    return hit;
  }

  windowList(windows: ScreenWindow[]): string {
    if (!windows.length) return '(none)';
    return orderedWindows(windows)
      .map((w, i) => `${i + 1}. "${w.title}" (${w.process})${w.foreground ? ' active' : ''}${w.minimized ? ' minimized' : ''}`)
      .join(' · ');
  }

  async listWindows(session: Session): Promise<ScreenWindow[]> {
    session.windows = await this.helper.windows();
    return session.windows;
  }

  async windowAction(session: Session, w: ScreenWindow, action: 'focus' | 'minimize' | 'maximize' | 'restore' | 'close'): Promise<ScreenWindow> {
    const blocked = isBlockedApp(w.process, w.title, settings.get().computerBlockedApps);
    if (blocked && action !== 'minimize') throw new HelperError(`That is ${blocked}, which the user does not let Cellar use.`);
    const result = await this.helper.window(w.hwnd, action);
    this.overlay.raise();
    await this.settled(session);
    return result;
  }

  async installedApps(): Promise<InstalledApp[]> {
    if (this.apps && Date.now() - this.apps.at < 10 * 60_000) return this.apps.list;
    const list = await this.helper.apps();
    this.apps = { at: Date.now(), list };
    return list;
  }

  /** Open an app by name (through the Start menu's list), a URL in the default browser, or a file or folder. Waits for its window. */
  async open(session: Session, name: string): Promise<string> {
    const before = new Set((await this.helper.windows()).map((w) => w.hwnd));
    const url = asUrl(name);
    let opened: string;
    if (url) {
      await shell.openExternal(url);
      opened = `Opened ${url} in the default browser`;
    } else if (/^[a-z]:[\\/]|^\\\\|^~[\\/]/i.test(name.trim())) {
      const path = name.trim().replace(/^~(?=[\\/])/, process.env.USERPROFILE ?? '~');
      const error = await shell.openPath(path);
      if (error) throw new HelperError(`Could not open ${path}: ${error}`);
      opened = `Opened ${path}`;
    } else {
      const matches = matchApps(name, await this.installedApps());
      const app = matches[0];
      if (!app) throw new HelperError(`No installed app is called "${name}". Try another name, or open it from the Start menu with computer_key "win" and computer_type.`);
      const blocked = isBlockedApp(app.name, app.name, settings.get().computerBlockedApps);
      if (blocked) throw new HelperError(`${app.name} is on the user's list of apps Cellar may not use.`);
      // The Start menu's own launch path: works for desktop programs and Store apps alike.
      spawn('explorer.exe', [`shell:AppsFolder\\${app.id}`], { detached: true, stdio: 'ignore' }).unref();
      opened = `Opened ${app.name}`;
    }
    // Wait for a new window (or at least a new foreground one), up to 10 s.
    const started = Date.now();
    let fresh: ScreenWindow | undefined;
    while (Date.now() - started < 10_000) {
      if (session.signal.aborted) throw session.signal.reason ?? new Error('Stopped');
      await sleep(350);
      const windows = await this.helper.windows();
      fresh = windows.find((w) => !before.has(w.hwnd)) ?? undefined;
      if (fresh) break;
    }
    if (fresh) {
      await sleep(700);
      await this.helper.window(fresh.hwnd, 'focus').catch(() => undefined);
    }
    this.overlay.raise();
    await this.settled(session);
    return fresh ? `${opened}: "${fresh.title}" (${fresh.process}) is in front now.` : `${opened}. No new window appeared within 10 s (it may reuse a window that was already open, or still be starting).`;
  }

  async read(session: Session, which: string | number | undefined, all: boolean, maxChars: number): Promise<string> {
    const w = which !== undefined ? await this.findWindow(session, which) : null;
    const fg = w ?? (await this.helper.windows()).find((x) => x.foreground) ?? null;
    if (!fg) throw new HelperError('No window is active to read. Open or switch to one first.');
    const blocked = isBlockedApp(fg.process, fg.title, settings.get().computerBlockedApps);
    if (blocked) throw new HelperError(`That window belongs to ${blocked}, which the user does not let Cellar read.`);
    const r = await this.helper.read(fg.hwnd, maxChars, all);
    const body = r.text.trim() || (r.timedOut ? '(The app took too long to report its text.)' : '(No readable text in this window. Look at the screenshot instead.)');
    return `Text in "${r.title}" (${r.process})${all ? '' : ', the part on screen'}:\n\n${body}`;
  }

  // ---------- settings page ----------

  displays(): Promise<ScreenDisplay[]> {
    return this.helper.displays();
  }

  /** One look, the way a vision model would get it, without starting a session. */
  async test(): Promise<ComputerTestResult> {
    const app = settings.get();
    const started = Date.now();
    const obs: ScreenObservation = await this.helper.observe({
      display: app.computerDisplay,
      maxWidth: app.computerScreenshotWidth,
      maxHeight: Math.round(app.computerScreenshotWidth * 0.625),
      marks: app.computerMarks,
      maxElements: 150,
    });
    const frame: ScreenFrame = { region: obs.region, imageWidth: obs.imageWidth, imageHeight: obs.imageHeight, space: coordinateSpaceFor('', app.computerCoordinates) };
    return {
      imageDataUrl: obs.image && obs.mime ? `data:${obs.mime};base64,${obs.image}` : null,
      imageWidth: obs.imageWidth,
      imageHeight: obs.imageHeight,
      elements: obs.elements.length,
      windows: obs.windows.length,
      foreground: obs.foreground ? `${obs.foreground.title} (${obs.foreground.process})` : null,
      ms: Date.now() - started,
      text: describeObservation(obs, { frame, vision: true, maxElements: 150 }),
    };
  }

  dispose(): void {
    if (this.session) this.end(this.session.messageId);
    this.helper.kill();
  }
}

export const computer = new ComputerController();
export type { Session as ComputerSession };
