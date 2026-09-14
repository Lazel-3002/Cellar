/**
 * Integrated terminal: node-pty shells per Code session, streamed to the renderer over
 * `terminal:data` / `terminal:exit` / `terminal:changed`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { spawn, type IDisposable, type IPty } from 'node-pty';
import { z } from 'zod';
import type { IpcEventMap } from '@shared/ipc-contract';
import type { TerminalInfo } from '@shared/types/code';
import type { TerminalShell } from '@shared/types/settings';
import { handle } from '../ipc/register';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage, newId } from '../lib/util';

const log = logger('terminal');

/** Output kept per terminal for re-attaching a view. */
export const BUFFER_LIMIT = 250_000;
export const MAX_TERMINALS_PER_SESSION = 8;
const FLUSH_MS = 16;
const INITIAL_COLS = 100;
const INITIAL_ROWS = 30;

/**
 * node-pty's Windows kill() lists the console's processes by the shell's pid in a helper process and
 * signals them; for a shell that exited earlier that pid may belong to another process by now. So an
 * exited pty only gets its conout worker released (a no-op if node-pty's internals change).
 */
function releaseExitedPty(pty: IPty): void {
  const agent = (pty as unknown as { _agent?: { _conoutSocketWorker?: { dispose(): void } } })._agent;
  try {
    agent?._conoutSocketWorker?.dispose();
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Shell resolution

export interface ShellCommand {
  file: string;
  args: string[];
  /** Base of the tab title, e.g. "PowerShell". */
  label: string;
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
}

function lstatExists(file: string): boolean {
  try {
    lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

function findOnPath(exe: string, env: NodeJS.ProcessEnv): string | undefined {
  for (const raw of (envValue(env, 'PATH') ?? '').split(';')) {
    const dir = raw.trim().replace(/^"(.*)"$/, '$1');
    if (!dir) continue;
    const file = join(dir, exe);
    // lstat also sees app execution aliases (Store installs such as pwsh.exe), which stat and existsSync cannot read.
    if (existsSync(file) || lstatExists(file)) return file;
  }
  return undefined;
}

/** auto → pwsh when installed, else Windows PowerShell; explicit choices fall back to Windows PowerShell. */
export function resolveShell(preference: TerminalShell = 'auto', platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): ShellCommand {
  if (platform !== 'win32') {
    const file = envValue(env, 'SHELL') || '/bin/bash';
    return { file, args: [], label: basename(file) };
  }
  const systemRoot = envValue(env, 'SystemRoot') || 'C:\\Windows';
  if (preference === 'cmd') {
    const comSpec = envValue(env, 'ComSpec');
    const file = findOnPath('cmd.exe', env) ?? (comSpec && existsSync(comSpec) ? comSpec : undefined);
    if (file) return { file, args: [], label: 'Command Prompt' };
  }
  if (preference === 'auto' || preference === 'pwsh') {
    const programFiles = envValue(env, 'ProgramFiles');
    const installed = programFiles ? join(programFiles, 'PowerShell', '7', 'pwsh.exe') : '';
    const file = findOnPath('pwsh.exe', env) ?? (installed && existsSync(installed) ? installed : undefined);
    if (file) return { file, args: ['-NoLogo'], label: 'PowerShell' };
  }
  const file = findOnPath('powershell.exe', env) ?? join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return { file, args: ['-NoLogo'], label: 'PowerShell' };
}

/** Environment for shells: Cellar's own, minus Electron internals that would leak into user tools. */
function shellEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !/^ELECTRON_(RUN_AS_NODE|NO_ATTACH_CONSOLE|RENDERER_URL)$/i.test(key)) env[key] = value;
  }
  env.TERM_PROGRAM = 'Cellar';
  env.COLORTERM = 'truecolor';
  return env;
}

// ---------------------------------------------------------------------------
// Output buffer

/**
 * Keeps the most recent output (up to `limit` plus a trimming slack of a fifth). Cuts prefer a
 * line start so a replay rarely begins in the middle of an escape sequence.
 */
export class OutputBuffer {
  private chunks: string[] = [];
  private size = 0;

  constructor(private readonly limit = BUFFER_LIMIT) {}

  append(data: string): void {
    if (!data) return;
    this.chunks.push(data);
    this.size += data.length;
    if (this.size > this.limit + Math.floor(this.limit / 5)) this.trim();
  }

  toString(): string {
    if (this.chunks.length > 1) this.chunks = [this.chunks.join('')];
    return this.chunks[0] ?? '';
  }

  get length(): number {
    return this.size;
  }

  private trim(): void {
    const text = this.chunks.join('');
    const start = text.length - this.limit;
    const newline = text.indexOf('\n', start);
    const kept = newline >= 0 && newline - start < 4096 ? text.slice(newline + 1) : text.slice(start);
    this.chunks = [kept];
    this.size = kept.length;
  }
}

// ---------------------------------------------------------------------------
// Manager

type TerminalEvent = 'terminal:data' | 'terminal:exit' | 'terminal:changed';
export type TerminalEmit = <K extends TerminalEvent>(channel: K, payload: IpcEventMap[K]) => void;

export interface CreateTerminalOptions {
  conversationId: string;
  cwd: string;
  shell?: TerminalShell;
}

interface Session {
  info: TerminalInfo;
  label: string;
  number: number;
  pty: IPty;
  output: OutputBuffer;
  pending: string;
  timer: NodeJS.Timeout | null;
  listeners: IDisposable[];
  cols: number;
  rows: number;
}

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid terminal id.');
const conversationIdSchema = z.string().min(1, 'Missing session id.').max(128, 'Invalid session id.');
const sizeSchema = z.number().int('Terminal size must be a whole number.').min(2, 'Terminal size must be between 2 and 500.').max(500, 'Terminal size must be between 2 and 500.');
const dataSchema = z.string().max(1_000_000, 'Input is too large to send to the terminal.');

function check<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? 'Invalid input.');
  return result.data;
}

export class TerminalManager {
  private sessions = new Map<string, Session>();

  constructor(private readonly emit: TerminalEmit = (channel, payload) => bus.emit(channel, payload)) {}

  async create({ conversationId, cwd, shell = 'auto' }: CreateTerminalOptions): Promise<TerminalInfo> {
    check(conversationIdSchema, conversationId);
    const existing = this.forConversation(conversationId);
    if (existing.length >= MAX_TERMINALS_PER_SESSION) {
      throw new Error(`A session can have up to ${MAX_TERMINALS_PER_SESSION} terminals. Close one to open another.`);
    }
    const folder = await stat(cwd).catch(() => null);
    if (!folder?.isDirectory()) throw new Error(`The working folder no longer exists: ${cwd}`);

    const command = resolveShell(shell);
    const used = new Set(existing.filter((s) => s.label === command.label).map((s) => s.number));
    let number = 1;
    while (used.has(number)) number++;

    let pty: IPty;
    try {
      pty = spawn(command.file, command.args, {
        name: 'xterm-256color',
        cols: INITIAL_COLS,
        rows: INITIAL_ROWS,
        cwd,
        env: shellEnv(),
      });
    } catch (err) {
      throw new Error(`Could not start ${basename(command.file)}: ${errorMessage(err)}`);
    }

    const info: TerminalInfo = { id: newId(), conversationId, cwd, shell: command.file, title: `${command.label} ${number}`, exited: false };
    const session: Session = { info, label: command.label, number, pty, output: new OutputBuffer(), pending: '', timer: null, listeners: [], cols: INITIAL_COLS, rows: INITIAL_ROWS };
    session.listeners.push(
      pty.onData((data) => this.onData(session, data)),
      pty.onExit(({ exitCode }) => this.onExit(session, exitCode)),
    );
    this.sessions.set(info.id, session);
    this.emit('terminal:changed', { conversationId });
    return { ...info };
  }

  list(conversationId: string): TerminalInfo[] {
    return this.forConversation(conversationId).map((s) => ({ ...s.info }));
  }

  /** Output so far. Pending data is flushed first, so a view that subscribed before asking can drop earlier events. */
  buffer(id: string): string {
    const session = this.get(id);
    this.flush(session);
    return session.output.toString();
  }

  write(id: string, data: string): void {
    const session = this.get(id);
    const input = check(dataSchema, data);
    if (session.info.exited || !input) return;
    session.pty.write(input);
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.get(id);
    const c = check(sizeSchema, cols);
    const r = check(sizeSchema, rows);
    if (session.info.exited || (c === session.cols && r === session.rows)) return;
    try {
      session.pty.resize(c, r);
      session.cols = c;
      session.rows = r;
    } catch (err) {
      // The process can exit between the check and the call.
      log.warn('resize failed:', errorMessage(err));
    }
  }

  kill(id: string): void {
    const session = this.get(id);
    this.dispose(session);
    this.emit('terminal:changed', { conversationId: session.info.conversationId });
  }

  killForConversation(conversationId: string): void {
    const sessions = this.forConversation(conversationId);
    if (sessions.length === 0) return;
    for (const session of sessions) this.dispose(session);
    this.emit('terminal:changed', { conversationId });
  }

  /** App quit: end every shell and its child processes without throwing. */
  disposeAll(): void {
    const sessions = [...this.sessions.values()];
    if (sessions.length === 0) return;
    let treeKilled = false;
    const pids = sessions.filter((s) => !s.info.exited && s.pty.pid > 0).map((s) => String(s.pty.pid));
    if (process.platform === 'win32' && pids.length > 0) {
      // node-pty finds a shell's child processes asynchronously and the app may exit before that
      // finishes, so end the process trees synchronously (dev servers would otherwise keep running).
      try {
        const result = spawnSync('taskkill', ['/F', '/T', ...pids.flatMap((pid) => ['/PID', pid])], { windowsHide: true, timeout: 5000, stdio: 'ignore' });
        treeKilled = !result.error;
      } catch {
        // fall back to node-pty's kill
      }
    }
    for (const session of sessions) this.dispose(session, !treeKilled);
  }

  private forConversation(conversationId: string): Session[] {
    return [...this.sessions.values()].filter((s) => s.info.conversationId === conversationId);
  }

  private get(id: string): Session {
    const session = this.sessions.get(check(idSchema, id));
    if (!session) throw new Error('That terminal is no longer open.');
    return session;
  }

  private onData(session: Session, data: string): void {
    if (!this.sessions.has(session.info.id)) return;
    session.output.append(data);
    session.pending += data;
    session.timer ??= setTimeout(() => this.flush(session), FLUSH_MS);
  }

  private flush(session: Session): void {
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }
    if (!session.pending) return;
    const data = session.pending;
    session.pending = '';
    this.emit('terminal:data', { id: session.info.id, data });
  }

  private onExit(session: Session, exitCode: number): void {
    if (!this.sessions.has(session.info.id) || session.info.exited) return;
    this.flush(session);
    session.info.exited = true;
    session.info.exitCode = exitCode;
    this.emit('terminal:exit', { id: session.info.id, exitCode });
    this.emit('terminal:changed', { conversationId: session.info.conversationId });
  }

  private dispose(session: Session, killProcess = true): void {
    this.sessions.delete(session.info.id);
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
    session.pending = '';
    for (const listener of session.listeners) {
      try {
        listener.dispose();
      } catch {
        // ignore
      }
    }
    if (!killProcess) return;
    if (session.info.exited) {
      releaseExitedPty(session.pty);
      return;
    }
    try {
      session.pty.kill();
    } catch (err) {
      log.warn('kill failed:', errorMessage(err));
    }
  }
}

export const terminals = new TerminalManager();

export function registerTerminalHandlers(): void {
  handle('terminal:create', async (conversationId) => {
    // Loaded lazily so the manager stays importable without the chat orchestrator.
    const [{ codeSession }, { settings }] = await Promise.all([import('./context'), import('../services/settings')]);
    const { task } = await codeSession(check(conversationIdSchema, conversationId));
    return terminals.create({ conversationId, cwd: task.workDir, shell: settings.get().terminalShell });
  });
  handle('terminal:list', (conversationId) => terminals.list(check(conversationIdSchema, conversationId)));
  handle('terminal:buffer', (id) => terminals.buffer(id));
  handle('terminal:write', (id, data) => terminals.write(id, data));
  handle('terminal:resize', (id, cols, rows) => terminals.resize(id, cols, rows));
  handle('terminal:kill', (id) => terminals.kill(id));
}
