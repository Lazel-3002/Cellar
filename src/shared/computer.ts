/**
 * Computer use, the parts that are plain logic: where a point the model names lands on the screen,
 * key names, which actions deserve a second look, the screen description the model reads, and
 * finding an app by the name a model uses for it. The helper and the tools do the rest.
 */
import type { CoordinateSpace, ScreenElement, ScreenObservation, ScreenRect, ScreenWindow } from './types/computer';

// ---------- coordinates ----------

/** The screenshot the model is looking at, and the part of the screen it shows. */
export interface ScreenFrame {
  region: ScreenRect;
  imageWidth: number;
  imageHeight: number;
  space: CoordinateSpace;
}

/**
 * Qwen3-VL and the Qwen 3.5/3.6 models built on it point on a 0–1000 grid across the image; most
 * other vision models point in the image's own pixels. Element numbers sidestep the question, so
 * this only matters for things UI Automation cannot see.
 */
export function coordinateSpaceFor(modelId: string, setting: 'auto' | CoordinateSpace): CoordinateSpace {
  if (setting !== 'auto') return setting;
  return /qwen[\s._-]?3(?:[\s._-]?vl|\.[5-9])|qwen3[\s._-]?[5-9](?!\d)|qwen3vl/i.test(modelId) ? 'normalized' : 'pixels';
}

export function describeSpace(frame: Pick<ScreenFrame, 'imageWidth' | 'imageHeight' | 'space'>): string {
  return frame.space === 'normalized'
    ? 'x and y are on a 0–1000 grid across the screenshot (0,0 top-left, 1000,1000 bottom-right)'
    : `x and y are pixels in the ${frame.imageWidth}×${frame.imageHeight} screenshot (0,0 top-left)`;
}

/** A point the model gave, in physical screen pixels. Throws a sentence the model can act on when it is off the image. */
export function toScreen(frame: ScreenFrame, x: number, y: number): { x: number; y: number } {
  const maxX = frame.space === 'normalized' ? 1000 : frame.imageWidth;
  const maxY = frame.space === 'normalized' ? 1000 : frame.imageHeight;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > maxX || y > maxY) {
    throw new Error(`(${x}, ${y}) is outside the screenshot: ${describeSpace(frame)}.`);
  }
  const fx = frame.space === 'normalized' ? x / 1000 : x / frame.imageWidth;
  const fy = frame.space === 'normalized' ? y / 1000 : y / frame.imageHeight;
  return {
    x: Math.min(frame.region.x + frame.region.w - 1, Math.round(frame.region.x + fx * frame.region.w)),
    y: Math.min(frame.region.y + frame.region.h - 1, Math.round(frame.region.y + fy * frame.region.h)),
  };
}

/** A physical screen point, in the model's coordinates (for telling it where something is). */
export function toModel(frame: ScreenFrame, x: number, y: number): { x: number; y: number } {
  const fx = (x - frame.region.x) / frame.region.w;
  const fy = (y - frame.region.y) / frame.region.h;
  return frame.space === 'normalized'
    ? { x: Math.round(fx * 1000), y: Math.round(fy * 1000) }
    : { x: Math.round(fx * frame.imageWidth), y: Math.round(fy * frame.imageHeight) };
}

/** A rectangle the model gave (for zooming in), in physical pixels, grown to at least 64 px a side. */
export function regionToScreen(frame: ScreenFrame, r: { x: number; y: number; width: number; height: number }): ScreenRect {
  const a = toScreen(frame, r.x, r.y);
  const maxX = frame.space === 'normalized' ? 1000 : frame.imageWidth;
  const maxY = frame.space === 'normalized' ? 1000 : frame.imageHeight;
  const b = toScreen(frame, Math.min(maxX, r.x + Math.max(1, r.width)), Math.min(maxY, r.y + Math.max(1, r.height)));
  const w = Math.max(64, b.x - a.x);
  const h = Math.max(64, b.y - a.y);
  return { x: a.x, y: a.y, w, h };
}

export const rectCenter = (r: ScreenRect) => ({ x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) });
export const rectContains = (r: ScreenRect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

// ---------- keys ----------

/** A key for the helper: a virtual-key code (extended keys flagged), or a character it maps with the keyboard layout. */
export type KeySpec = { vk: number; ext?: boolean } | { ch: string };

const NAMED_KEYS: Record<string, KeySpec> = {
  ctrl: { vk: 0x11 },
  control: { vk: 0x11 },
  shift: { vk: 0x10 },
  alt: { vk: 0x12 },
  option: { vk: 0x12 },
  win: { vk: 0x5b, ext: true },
  windows: { vk: 0x5b, ext: true },
  meta: { vk: 0x5b, ext: true },
  super: { vk: 0x5b, ext: true },
  cmd: { vk: 0x5b, ext: true },
  command: { vk: 0x5b, ext: true },
  enter: { vk: 0x0d },
  return: { vk: 0x0d },
  kpenter: { vk: 0x0d, ext: true },
  tab: { vk: 0x09 },
  esc: { vk: 0x1b },
  escape: { vk: 0x1b },
  space: { vk: 0x20 },
  spacebar: { vk: 0x20 },
  backspace: { vk: 0x08 },
  back: { vk: 0x08 },
  delete: { vk: 0x2e, ext: true },
  del: { vk: 0x2e, ext: true },
  insert: { vk: 0x2d, ext: true },
  ins: { vk: 0x2d, ext: true },
  home: { vk: 0x24, ext: true },
  end: { vk: 0x23, ext: true },
  pageup: { vk: 0x21, ext: true },
  pgup: { vk: 0x21, ext: true },
  prior: { vk: 0x21, ext: true },
  pagedown: { vk: 0x22, ext: true },
  pgdn: { vk: 0x22, ext: true },
  next: { vk: 0x22, ext: true },
  up: { vk: 0x26, ext: true },
  arrowup: { vk: 0x26, ext: true },
  down: { vk: 0x28, ext: true },
  arrowdown: { vk: 0x28, ext: true },
  left: { vk: 0x25, ext: true },
  arrowleft: { vk: 0x25, ext: true },
  right: { vk: 0x27, ext: true },
  arrowright: { vk: 0x27, ext: true },
  capslock: { vk: 0x14 },
  printscreen: { vk: 0x2c, ext: true },
  prtsc: { vk: 0x2c, ext: true },
  print: { vk: 0x2c, ext: true },
  apps: { vk: 0x5d, ext: true },
  contextmenu: { vk: 0x5d, ext: true },
  menu: { vk: 0x5d, ext: true },
  plus: { ch: '+' },
  minus: { ch: '-' },
  comma: { ch: ',' },
  period: { ch: '.' },
  dot: { ch: '.' },
  slash: { ch: '/' },
  backslash: { ch: '\\' },
  semicolon: { ch: ';' },
  quote: { ch: "'" },
  equal: { ch: '=' },
  equals: { ch: '=' },
  volumeup: { vk: 0xaf, ext: true },
  volumedown: { vk: 0xae, ext: true },
  volumemute: { vk: 0xad, ext: true },
  mediaplaypause: { vk: 0xb3, ext: true },
  playpause: { vk: 0xb3, ext: true },
};

const MODIFIER_VKS = new Set([0x11, 0x10, 0x12, 0x5b]);

function keyFor(name: string): KeySpec | null {
  if (name.length === 1) {
    const c = name.toLowerCase();
    if (/[a-z]/.test(c)) return { vk: c.toUpperCase().charCodeAt(0) };
    if (/[0-9]/.test(c)) return { vk: c.charCodeAt(0) };
    return { ch: name };
  }
  const key = name.toLowerCase().replace(/[\s_-]+/g, '');
  if (NAMED_KEYS[key]) return NAMED_KEYS[key];
  const f = /^f([1-9]|1\d|2[0-4])$/.exec(key);
  if (f) return { vk: 0x6f + Number(f[1]) };
  const pad = /^(?:numpad|kp)([0-9])$/.exec(key);
  if (pad) return { vk: 0x60 + Number(pad[1]) };
  return null;
}

/**
 * "ctrl+shift+s", "Alt+F4", "Return", "ctrl++", "super" → keys to hold down in order. Every key but
 * the last must be a modifier; a lone modifier ("win") is fine.
 */
export function parseKeyCombo(text: string): { keys: KeySpec[]; label: string } {
  const raw = text.trim();
  if (!raw) throw new Error('No keys given. Use names like "enter", "ctrl+s" or "alt+tab".');
  let parts = raw.split(/\s*\+\s*/);
  // "ctrl++" and "+" mean the plus key itself.
  if (raw.endsWith('+')) parts = [...raw.slice(0, -1).split(/\s*\+\s*/).filter(Boolean), '+'];
  parts = parts.filter((p) => p.length > 0);
  const keys: KeySpec[] = [];
  for (const part of parts) {
    const key = keyFor(part);
    if (!key) throw new Error(`Unknown key "${part}". Use names like enter, tab, esc, backspace, delete, up, down, pageup, home, f5, ctrl, shift, alt, win, or a single character.`);
    keys.push(key);
  }
  keys.slice(0, -1).forEach((key, i) => {
    if (!('vk' in key) || !MODIFIER_VKS.has(key.vk)) throw new Error(`"${parts[i]}" is not a modifier; press one key at a time, with ctrl, shift, alt or win in front (for example "ctrl+s").`);
  });
  const label = parts.map((p) => (p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join('+');
  return { keys, label };
}

// ---------- risk ----------

/** Words on a button or menu item that mean the click does something hard to take back (English and Turkish). */
const RISKY_WORDS: Array<[RegExp, string]> = [
  [/\b(send|reply all|gönder|yanıtla|cevapla)\b/i, 'sends something'],
  [/\b(pay|payment|purchase|buy|checkout|check out|place order|order now|subscribe|donate|öde|ödeme|satın al|siparişi? (ver|tamamla)|abone ol|bağış)/i, 'spends money'],
  [/\b(delete|remove|erase|discard|trash|empty recycle|permanently|wipe|sil|kaldır|çöpe|kalıcı olarak)/i, 'deletes something'],
  [/\b(uninstall|format|factory reset|reset|sıfırla|biçimlendir)\b/i, 'changes the system'],
  [/\b(transfer|withdraw|wire|havale|eft|para gönder)\b/i, 'moves money'],
  [/\b(publish|post|tweet|share|submit|yayınla|paylaş|gönderi|ilet)\b/i, 'publishes or submits something'],
  [/\b(sign out|log out|logout|çıkış yap|oturumu kapat)\b/i, 'signs you out'],
  [/\b(accept|agree|confirm|approve|kabul|onayla)\b/i, 'confirms something'],
];

function riskyWord(name: string): string | null {
  for (const [pattern, reason] of RISKY_WORDS) if (pattern.test(name)) return reason;
  return null;
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Text that looks like a payment card number or an IBAN. */
export function looksLikePaymentDetails(text: string): boolean {
  for (const match of text.matchAll(/(?:\d[ -]?){13,19}/g)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true;
  }
  return /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/.test(text.toUpperCase());
}

export type ComputerActionKind = 'click' | 'type' | 'keys' | 'drag' | 'close-window';

/**
 * Why an action deserves the user's say-so even after they let Cellar use the computer for this
 * task, or null. The model is told the same list, so a card is not a surprise.
 */
export function riskOf(action: { kind: ComputerActionKind; target?: string; text?: string; keys?: string }): string | null {
  switch (action.kind) {
    case 'click':
      return action.target ? riskyWord(action.target) : null;
    case 'type':
      return action.text && looksLikePaymentDetails(action.text) ? 'types what looks like payment details' : null;
    case 'keys': {
      const k = (action.keys ?? '').toLowerCase().replace(/\s+/g, '');
      if (/shift\+(delete|del)$/.test(k)) return 'deletes permanently';
      if (/alt\+f4$/.test(k)) return 'closes the window';
      if (/ctrl\+enter$/.test(k) || /ctrl\+return$/.test(k)) return 'often sends a message';
      return null;
    }
    case 'close-window':
      return 'closes a window (unsaved work could be lost)';
    default:
      return null;
  }
}

/** A process the user asked Cellar never to touch (password managers by default). */
export function isBlockedApp(process: string, title: string, blocked: string[]): string | null {
  const proc = process.toLowerCase().replace(/\.exe$/, '');
  const name = title.toLowerCase();
  for (const entry of blocked) {
    const b = entry.trim().toLowerCase().replace(/\.exe$/, '');
    if (!b) continue;
    if (proc === b || proc.replace(/[\s._-]/g, '') === b.replace(/[\s._-]/g, '') || name.includes(b)) return entry.trim();
  }
  return null;
}

// ---------- what the model reads ----------

export function elementLine(e: ScreenElement): string {
  const name = e.name ? ` "${e.name.length > 80 ? `${e.name.slice(0, 77)}…` : e.name}"` : '';
  const value = e.value && e.value !== e.name ? ` = "${e.value.length > 60 ? `${e.value.slice(0, 57)}…` : e.value}"` : '';
  const flags = [e.focused && 'focused', !e.enabled && 'disabled', e.password && 'password — never type into it', e.state].filter(Boolean);
  return `[${e.n}] ${e.role}${name}${value}${flags.length ? ` (${flags.join(', ')})` : ''}`;
}

const windowLabel = (w: ScreenWindow) => `"${w.title.length > 70 ? `${w.title.slice(0, 67)}…` : w.title}" (${w.process || 'unknown app'})`;

/** Windows as they are numbered for the model: the active one is 1, the rest follow front to back. */
export function orderedWindows(windows: ScreenWindow[]): ScreenWindow[] {
  return [...windows.filter((w) => w.foreground), ...windows.filter((w) => !w.foreground)];
}

export interface DescribeOptions {
  frame: ScreenFrame;
  vision: boolean;
  /** Elements listed at most (the rest are counted). */
  maxElements: number;
  zoomed?: boolean;
}

/** The screen as text: size, windows, and the numbered controls (which match the boxes on the screenshot). */
export function describeObservation(obs: ScreenObservation, o: DescribeOptions): string {
  const lines: string[] = [];
  if (o.zoomed) {
    lines.push(`Zoomed-in screenshot of part of the screen (${obs.imageWidth}×${obs.imageHeight}). Coordinates still refer to the full-screen screenshot, not this one.`);
  } else {
    lines.push(
      o.vision
        ? `Screenshot: ${obs.imageWidth}×${obs.imageHeight} of a ${obs.display.w}×${obs.display.h} screen; ${describeSpace(o.frame)}.`
        : `Screen: ${obs.display.w}×${obs.display.h} (you get no image; work from the numbered elements, computer_read and the keyboard).`,
    );
  }
  if (obs.cellarForeground) lines.push("Cellar's own window is in front; it is hidden from you. Switch to another window with computer_windows or computer_open_app.");
  else if (obs.foreground) lines.push(`Active window: ${windowLabel(obs.foreground)}${obs.foreground.maximized ? ', maximized' : ''}${obs.windows.some((w) => w.foreground) ? ' (window 1)' : ''}`);
  else lines.push('No window is active (the desktop is showing).');
  const numbered = orderedWindows(obs.windows).map((w, i) => ({ w, n: i + 1 }));
  const others = numbered.filter(({ w }) => !w.foreground);
  if (others.length) lines.push(`Other windows: ${others.slice(0, 12).map(({ w, n }) => `${n}. ${windowLabel(w)}${w.minimized ? ' (minimized)' : ''}`).join(' · ')}`);
  if (o.zoomed) return lines.join('\n');
  const texts = (obs.texts ?? []).map((t) => (t.length > 90 ? `${t.slice(0, 87)}…` : t));
  if (texts.length) {
    let line = 'Text on screen:';
    for (const t of texts) {
      if (line.length + t.length > 900) break;
      line += ` "${t}" ·`;
    }
    lines.push(line.replace(/ ·$/, ''));
  }
  if (obs.elements.length) {
    lines.push(o.vision ? 'Elements (the numbers match the boxes on the screenshot; use them with element=N):' : 'Elements (use them with element=N):');
    lines.push(...obs.elements.slice(0, o.maxElements).map(elementLine));
    if (obs.elements.length > o.maxElements) lines.push(`… and ${obs.elements.length - o.maxElements} more.`);
  } else if (obs.elementsTimedOut) {
    lines.push(o.vision ? 'This app did not list its controls in time: point at things with x/y from the screenshot.' : 'This app did not list its controls in time. Try keyboard shortcuts or computer_read.');
  } else if (obs.foreground) {
    lines.push(o.vision ? 'This window reports no controls (a canvas, game or remote screen?): point with x/y from the screenshot.' : 'This window reports no controls. Try keyboard shortcuts or computer_read.');
  }
  return lines.join('\n');
}

/** Where the screen description starts inside a tool result; older descriptions are cut there. */
export const SCREEN_MARKER = '\n\n--- screen now ---\n';

// ---------- apps ----------

export interface InstalledApp {
  name: string;
  id: string;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\.exe$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** What people and models call an app, mapped to words in its Start menu name. */
const APP_ALIASES: Record<string, string[]> = {
  explorer: ['file explorer', 'dosya gezgini'],
  'file explorer': ['file explorer', 'dosya gezgini'],
  'windows explorer': ['file explorer', 'dosya gezgini'],
  files: ['file explorer', 'dosya gezgini'],
  'file manager': ['file explorer', 'dosya gezgini'],
  cmd: ['command prompt', 'komut istemi'],
  'command line': ['command prompt', 'komut istemi'],
  terminal: ['terminal', 'windows terminal'],
  powershell: ['windows powershell', 'powershell'],
  calc: ['calculator', 'hesap makinesi'],
  calculator: ['calculator', 'hesap makinesi'],
  notepad: ['notepad', 'not defteri'],
  paint: ['paint'],
  settings: ['settings', 'ayarlar'],
  'control panel': ['control panel', 'denetim masasi'],
  edge: ['microsoft edge'],
  chrome: ['google chrome'],
  browser: ['microsoft edge', 'google chrome', 'firefox'],
  word: ['word'],
  excel: ['excel'],
  powerpoint: ['powerpoint'],
  outlook: ['outlook'],
  mail: ['outlook', 'mail'],
  store: ['microsoft store'],
  camera: ['camera', 'kamera'],
  photos: ['photos', 'fotograflar'],
  clock: ['clock', 'saat'],
  'task manager': ['task manager', 'gorev yoneticisi'],
  'snipping tool': ['snipping tool', 'ekran alintisi araci'],
  vscode: ['visual studio code'],
  code: ['visual studio code'],
};

/** Installed apps ranked for a name: exact, then starts-with, then contains, then shared words. */
export function matchApps(query: string, apps: InstalledApp[]): InstalledApp[] {
  const q = fold(query);
  if (!q) return [];
  const wanted = [q, ...(APP_ALIASES[q] ?? []).map(fold)];
  const scored: Array<{ app: InstalledApp; score: number }> = [];
  for (const app of apps) {
    const name = fold(app.name);
    let score = 0;
    for (const [i, w] of wanted.entries()) {
      const bonus = i === 0 ? 0 : -5;
      if (name === w) score = Math.max(score, 100 + bonus);
      else if (name.startsWith(`${w} `)) score = Math.max(score, 80 + bonus - name.length / 100);
      else if (name.includes(w)) score = Math.max(score, 60 + bonus - name.length / 100);
      else {
        const words = w.split(' ');
        const shared = words.filter((word) => word.length > 1 && name.split(' ').includes(word)).length;
        if (shared) score = Math.max(score, 20 + (30 * shared) / words.length + bonus);
      }
    }
    // Uninstallers and "(private browsing)" twins are rarely what anyone means.
    if (score && /uninstall|kaldir|private|gizli|safe mode|help|readme|documentation/.test(name) && !/uninstall|private|gizli/.test(q)) score -= 40;
    if (score > 0) scored.push({ app, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.app);
}

/** A URL (with or without its scheme) rather than an app name. */
export function asUrl(text: string): string | null {
  const t = text.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return t;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(t) && !/\.(exe|lnk|txt|docx?|xlsx?|pptx?|pdf|png|jpe?g)$/i.test(t)) return `https://${t}`;
  return null;
}

// ---------- arguments ----------

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};

function pointFrom(v: unknown): { x: number; y: number } | null {
  if (Array.isArray(v) && v.length >= 2) {
    const x = num(v[0]);
    const y = num(v[1]);
    if (x !== undefined && y !== undefined) return { x, y };
  }
  if (typeof v === 'string') {
    const m = /^\s*\(?\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*\)?\s*$/.exec(v);
    if (m) return { x: Number(m[1]), y: Number(m[2]) };
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const x = num(o.x);
    const y = num(o.y);
    if (x !== undefined && y !== undefined) return { x, y };
  }
  return null;
}

function elementFrom(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string') {
    const m = /^\s*\[?\s*#?(\d+)\s*\]?\s*$/.exec(v);
    if (m) return Number(m[1]);
  }
  return undefined;
}

/** The argument shapes models send for pointing, typing and keys (Anthropic-style `coordinate`, `[12]`, key arrays…). */
export function normalizeComputerArgs(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  const out = { ...args };
  if (out.element === undefined || typeof out.element === 'string') {
    const alias = out.element ?? out.element_id ?? out.elementId ?? out.id ?? out.index ?? out.mark ?? out.number ?? out.target ?? out.ref;
    const n = elementFrom(alias);
    if (n !== undefined) out.element = n;
    else if (typeof out.element === 'string') delete out.element;
  }
  if (out.x === undefined || out.y === undefined) {
    const p = pointFrom(out.coordinate ?? out.coordinates ?? out.point ?? out.position ?? out.location ?? out.pos);
    if (p) {
      out.x = p.x;
      out.y = p.y;
    }
  }
  if (tool === 'computer_drag') {
    const from = pointFrom(out.from ?? out.start ?? out.start_coordinate ?? out.source);
    const to = pointFrom(out.to ?? out.end ?? out.end_coordinate ?? out.destination ?? (out.coordinate !== undefined ? out.coordinate : undefined));
    if (from && out.from_x === undefined) {
      out.from_x = from.x;
      out.from_y = from.y;
    }
    if (to && out.to_x === undefined) {
      out.to_x = to.x;
      out.to_y = to.y;
    }
    const fromEl = elementFrom(out.from_element ?? out.from);
    const toEl = elementFrom(out.to_element ?? out.to);
    if (fromEl !== undefined) out.from_element = fromEl;
    if (toEl !== undefined) out.to_element = toEl;
  }
  if (tool === 'computer_type' && typeof out.text !== 'string') {
    const alias = out.content ?? out.value ?? out.string ?? out.input ?? out.message ?? out.query;
    if (typeof alias === 'string' || typeof alias === 'number') out.text = String(alias);
  }
  if (tool === 'computer_key' && typeof out.keys !== 'string') {
    const alias = out.keys ?? out.key ?? out.combo ?? out.shortcut ?? out.hotkey ?? out.text ?? out.keys_to_press;
    if (Array.isArray(alias)) out.keys = alias.map(String).join('+');
    else if (typeof alias === 'string') out.keys = alias;
  }
  if (tool === 'computer_scroll') {
    if (out.amount === undefined) out.amount = out.clicks ?? out.scroll_amount ?? out.notches ?? out.times;
    if (typeof out.direction !== 'string') {
      const delta = num(out.delta ?? out.dy ?? out.scroll_y);
      const dx = num(out.dx ?? out.scroll_x);
      if (delta !== undefined && delta !== 0) {
        out.direction = delta > 0 ? 'down' : 'up';
        out.amount ??= Math.max(1, Math.round(Math.abs(delta) / (Math.abs(delta) >= 50 ? 100 : 1)));
      } else if (dx !== undefined && dx !== 0) {
        out.direction = dx > 0 ? 'right' : 'left';
        out.amount ??= Math.max(1, Math.round(Math.abs(dx) / (Math.abs(dx) >= 50 ? 100 : 1)));
      } else if (typeof out.scroll_direction === 'string') out.direction = out.scroll_direction;
    }
  }
  if (tool === 'computer_open_app' && typeof out.name !== 'string') {
    const alias = out.app ?? out.application ?? out.app_name ?? out.program ?? out.target ?? out.path ?? out.url ?? out.query;
    if (typeof alias === 'string') out.name = alias;
  }
  if (tool === 'computer_windows' && out.window === undefined) {
    const alias = out.title ?? out.name ?? out.app ?? out.target;
    if (typeof alias === 'string' || typeof alias === 'number') out.window = alias;
  }
  if (tool === 'computer_hand_over' && typeof out.reason !== 'string') {
    const alias = out.message ?? out.text ?? out.instructions ?? out.task;
    if (typeof alias === 'string') out.reason = alias;
  }
  if (tool === 'computer_screenshot' && out.wait === undefined) {
    const alias = num(out.seconds ?? out.duration ?? out.wait_seconds);
    if (alias !== undefined) out.wait = alias;
  }
  for (const key of ['x', 'y', 'from_x', 'from_y', 'to_x', 'to_y', 'amount', 'clicks', 'repeat', 'wait']) {
    const n = num(out[key]);
    if (n !== undefined) out[key] = n;
  }
  return out;
}
