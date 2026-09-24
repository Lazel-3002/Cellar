/**
 * The computer-use helper process (`helper.cs`): compiled on first use with the C# compiler every
 * Windows install already has, cached by a hash of its source, and spoken to over stdio with one
 * JSON request and one JSON reply per line. No native Node module and nothing to download.
 */
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { KeySpec } from '@shared/computer';
import type { ScreenDisplay, ScreenObservation, ScreenRect, ScreenWindow } from '@shared/types/computer';
import { logger } from '../lib/log';
import { errorMessage } from '../lib/util';
import source from './helper.cs?raw';

const log = logger('computer');

export const HELPER_VERSION = createHash('sha256').update(source).digest('hex').slice(0, 12);

/** A failure the helper explains in words the model can act on. */
export class HelperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HelperError';
  }
}

function frameworkDir(): string {
  const windir = process.env.WINDIR ?? process.env.SystemRoot ?? 'C:\\Windows';
  const x64 = join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  return existsSync(join(x64, 'csc.exe')) ? x64 : join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319');
}

/** Compile `helper.cs` into `<dir>/cellar-computer-<hash>.exe` unless that exact build is already there. */
export async function compileHelper(dir: string): Promise<string> {
  if (process.platform !== 'win32') throw new HelperError('Computer use works on Windows only for now.');
  const exe = join(dir, `cellar-computer-${HELPER_VERSION}.exe`);
  if (existsSync(exe)) return exe;
  await mkdir(dir, { recursive: true });
  const fw = frameworkDir();
  const csc = join(fw, 'csc.exe');
  if (!existsSync(csc)) throw new HelperError(`Computer use needs the .NET Framework 4 C# compiler (${csc}), which comes with Windows but is missing here.`);
  const cs = join(dir, `helper-${HELPER_VERSION}.cs`);
  await writeFile(cs, source, 'utf8');
  const out = `${exe}.tmp`;
  const args = [
    '-nologo',
    '-target:exe',
    '-optimize+',
    '-platform:anycpu',
    `-out:${out}`,
    `-r:${join(fw, 'WPF', 'UIAutomationClient.dll')}`,
    `-r:${join(fw, 'WPF', 'UIAutomationTypes.dll')}`,
    `-r:${join(fw, 'WPF', 'WindowsBase.dll')}`,
    '-r:System.Drawing.dll',
    '-r:System.Windows.Forms.dll',
    '-r:System.Web.Extensions.dll',
    '-r:Microsoft.CSharp.dll',
    '-r:System.Core.dll',
    cs,
  ];
  await new Promise<void>((resolve, reject) => {
    execFile(csc, args, { windowsHide: true, timeout: 90_000 }, (err, stdout) => {
      if (err) reject(new HelperError(`Could not build the computer-use helper: ${String(stdout).split(/\r?\n/).filter((l) => /error/i.test(l)).slice(0, 5).join(' ') || errorMessage(err)}`));
      else resolve();
    });
  });
  await rename(out, exe);
  await rm(cs, { force: true });
  // Older builds of the helper are never used again.
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (/^cellar-computer-[0-9a-f]+\.exe$/.test(name) && !name.includes(HELPER_VERSION)) await rm(join(dir, name), { force: true }).catch(() => undefined);
  }
  log.info('built the computer-use helper', exe);
  return exe;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/** One running helper; requests are answered in order, each with its own timeout. */
export class ComputerHelper {
  private child: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<ChildProcessWithoutNullStreams> | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  /** `dir` holds the compiled helper; `exclude` lists processes whose windows are never touched (Cellar's own). */
  constructor(
    private readonly dir: () => string,
    private readonly exclude: () => number[],
  ) {}

  private async start(): Promise<ChildProcessWithoutNullStreams> {
    if (this.child) return this.child;
    this.starting ??= (async () => {
      const exe = await compileHelper(this.dir());
      const child = spawn(exe, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      child.stderr.on('data', (chunk) => log.warn('helper:', String(chunk).trim()));
      createInterface({ input: child.stdout }).on('line', (line) => this.onLine(line));
      child.on('exit', (code) => {
        if (this.child === child) this.child = null;
        for (const [id, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new HelperError(`The computer-use helper stopped (exit code ${code ?? 'unknown'}).`));
          this.pending.delete(id);
        }
      });
      child.on('error', (err) => log.error('helper failed to start', errorMessage(err)));
      this.child = child;
      return child;
    })().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private onLine(line: string): void {
    let msg: { id: number; ok: boolean; result?: unknown; error?: string };
    try {
      msg = JSON.parse(line);
    } catch {
      log.warn('helper said something that is not JSON', line.slice(0, 200));
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new HelperError(msg.error ?? 'The computer-use helper failed.'));
  }

  async request<T>(cmd: string, args: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
    const child = await this.start();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HelperError(`The computer-use helper did not answer "${cmd}" in ${Math.round(timeoutMs / 1000)} s.`));
        // A helper stuck in a hung app is no use; the next request starts a fresh one.
        this.kill();
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, cmd, exclude: this.exclude(), ...args })}\n`);
    });
  }

  kill(): void {
    const child = this.child;
    this.child = null;
    if (child && !child.killed) child.kill();
  }

  // ---------- typed commands ----------

  displays = () => this.request<ScreenDisplay[]>('displays');
  observe = (o: { display: number; maxWidth: number; maxHeight: number; marks: boolean; elements?: boolean; image?: boolean; region?: ScreenRect; pointer?: { x: number; y: number }; maxElements?: number; quality?: number }) =>
    this.request<ScreenObservation>('observe', o, 20_000);
  cursor = () => this.request<{ x: number; y: number }>('cursor');
  /** How many real (not injected) mouse events the helper has seen; `watching` is false when its hook could not be installed. */
  userInput = () => this.request<{ watching: boolean; mouse: number }>('userInput');
  move = (x: number, y: number) => this.request<boolean>('move', { x, y });
  click = (x: number, y: number, button: 'left' | 'right' | 'middle', count: number, hold: KeySpec[] = []) => this.request<boolean>('click', { x, y, button, count, hold });
  drag = (x1: number, y1: number, x2: number, y2: number) => this.request<boolean>('drag', { x1, y1, x2, y2 });
  scroll = (x: number, y: number, dx: number, dy: number) => this.request<boolean>('scroll', { x, y, dx, dy });
  type = (text: string) => this.request<boolean>('type', { text, delay: text.length > 400 ? 2 : 6 }, 20_000 + text.length * 20);
  keys = (keys: KeySpec[], repeat = 1) => this.request<boolean>('keys', { keys, repeat });
  element = (n: number) => this.request<{ x: number; y: number; rect: ScreenRect; name: string; role: string; enabled: boolean; password: boolean; pid: number; process: string }>('element', { n });
  focusElement = (n: number) => this.request<boolean>('focusElement', { n });
  pointInfo = (x: number, y: number) => this.request<{ hwnd: number; pid: number; process: string; title: string; cellar: boolean; element?: { name: string; role: string; password: boolean } }>('pointInfo', { x, y });
  focused = () => this.request<{ hwnd: number; pid: number; process: string; title: string; cellar: boolean; element?: { name: string; role: string; password: boolean } }>('focused');
  windows = () => this.request<ScreenWindow[]>('windows');
  window = (hwnd: number, action: 'focus' | 'minimize' | 'maximize' | 'restore' | 'close') => this.request<ScreenWindow>('window', { hwnd, action });
  read = (hwnd: number, maxChars: number, all: boolean) => this.request<{ text: string; timedOut: boolean; title: string; process: string }>('read', { hwnd, maxChars, all }, 12_000);
  apps = () => this.request<Array<{ name: string; id: string }>>('apps', {}, 20_000);
}
