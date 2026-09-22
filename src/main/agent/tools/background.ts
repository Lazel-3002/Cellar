import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${String.fromCharCode(7)}]*${String.fromCharCode(7)}`, 'g');
const MAX_CAPTURE = 2 * 1024 * 1024;
/** Ended commands older than this are dropped from the registry so it cannot grow forever. */
const MAX_ENDED = 20;

interface BackgroundCommand {
  id: string;
  command: string;
  cwd: string;
  conversationId?: string;
  child: ChildProcess;
  chunks: Buffer[];
  captured: number;
  exitCode: number | null;
  killed: boolean;
  startedAt: number;
  endedAt: number | null;
  /** Raw bytes already handed to the model, so a poll only returns what is new. */
  readOffset: number;
}

const commands = new Map<string, BackgroundCommand>();

function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => undefined);
  } else {
    child.kill('SIGKILL');
  }
}

function evictOldEnded(): void {
  const ended = [...commands.values()].filter((c) => c.endedAt !== null).sort((a, b) => a.endedAt! - b.endedAt!);
  while (ended.length > MAX_ENDED) commands.delete(ended.shift()!.id);
}

export function startBackgroundCommand(command: string, cwd: string, shell: string | undefined, conversationId: string | undefined): string {
  const id = randomBytes(4).toString('hex');
  const windows = process.platform === 'win32';
  const script = [
    "$ProgressPreference = 'SilentlyContinue'",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$OutputEncoding = [System.Text.Encoding]::UTF8',
    '& {',
    command,
    '} 2>&1 | Out-String -Width 220 -Stream',
    // PowerShell exits with the status of the pipeline, not of the program inside it, so without this
    // a failed background command reports exit code 0 — the same line `runShell` carries.
    'if ($LASTEXITCODE) { exit $LASTEXITCODE }',
  ].join('\n');
  const child = windows
    ? spawn(shell ?? 'powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
        cwd,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1' },
      })
    : spawn('/bin/sh', ['-c', command], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });

  const entry: BackgroundCommand = { id, command, cwd, conversationId, child, chunks: [], captured: 0, exitCode: null, killed: false, startedAt: Date.now(), endedAt: null, readOffset: 0 };
  const collect = (chunk: Buffer) => {
    if (entry.captured > MAX_CAPTURE) return;
    entry.captured += chunk.length;
    entry.chunks.push(chunk);
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  child.on('error', (err) => {
    entry.chunks.push(Buffer.from(`\n${err.message}`));
    entry.exitCode = null;
    entry.endedAt = Date.now();
    evictOldEnded();
  });
  child.on('close', (code) => {
    entry.exitCode = code;
    entry.endedAt = Date.now();
    evictOldEnded();
  });
  commands.set(id, entry);
  return id;
}

export interface BackgroundCommandStatus {
  found: boolean;
  running?: boolean;
  command?: string;
  output?: string;
  exitCode?: number | null;
  killed?: boolean;
  runningForSeconds?: number;
  /** Bytes of earlier output left out, when reading incrementally. */
  omittedBytes?: number;
}

/**
 * Returns only what has arrived since the last read. This tool exists to be polled, and returning the
 * whole buffer every time spent the model's result budget re-reading what it already had — worse, once
 * the log passed the clip limit the head was kept and the newest lines, the whole reason for polling,
 * were the part dropped. The offset is tracked on raw bytes so it cannot drift against the
 * ANSI-stripped text.
 */
export function readBackgroundCommand(id: string, fromStart = false): BackgroundCommandStatus {
  const entry = commands.get(id);
  if (!entry) return { found: false };
  const all = Buffer.concat(entry.chunks);
  const from = fromStart ? 0 : Math.min(entry.readOffset, all.length);
  const output = all.subarray(from).toString('utf8').replace(ANSI, '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  entry.readOffset = all.length;
  return {
    found: true,
    running: entry.endedAt === null,
    command: entry.command,
    output,
    exitCode: entry.exitCode,
    killed: entry.killed,
    runningForSeconds: Math.round(((entry.endedAt ?? Date.now()) - entry.startedAt) / 1000),
    omittedBytes: from,
  };
}

export function stopBackgroundCommand(id: string): boolean {
  const entry = commands.get(id);
  if (!entry) return false;
  if (entry.endedAt === null) {
    entry.killed = true;
    killTree(entry.child);
  }
  return true;
}

/** Kills every command a conversation started (chat deleted) or the app is quitting. */
export function disposeBackgroundCommands(conversationId?: string): void {
  for (const entry of commands.values()) {
    if (conversationId !== undefined && entry.conversationId !== conversationId) continue;
    if (entry.endedAt === null) killTree(entry.child);
    if (conversationId !== undefined) commands.delete(entry.id);
  }
}
