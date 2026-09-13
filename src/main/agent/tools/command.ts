import { spawn, type ChildProcess } from 'node:child_process';
import { z } from 'zod';
import { clip, defineTool } from './types';

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${String.fromCharCode(7)}]*${String.fromCharCode(7)}`, 'g');
const MAX_CAPTURE = 2 * 1024 * 1024;

function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => undefined);
  } else {
    child.kill('SIGKILL');
  }
}

export interface ShellResult {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
  cancelled: boolean;
  durationMs: number;
}

/**
 * Run a PowerShell script (sh elsewhere). Output is forced to UTF-8 because Windows PowerShell
 * otherwise uses the OEM code page, and formatted wide so tables are not cut at 80 columns.
 */
export function runShell(command: string, cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<ShellResult> {
  const started = Date.now();
  const windows = process.platform === 'win32';
  const script = [
    "$ProgressPreference = 'SilentlyContinue'",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$OutputEncoding = [System.Text.Encoding]::UTF8',
    '& {',
    command,
    '} 2>&1 | Out-String -Width 220 -Stream',
    'if ($LASTEXITCODE) { exit $LASTEXITCODE }',
  ].join('\n');
  const child = windows
    ? spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
        cwd,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1' },
      })
    : spawn('/bin/sh', ['-c', command], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let captured = 0;
    let timedOut = false;
    let cancelled = false;
    const collect = (chunk: Buffer) => {
      if (captured > MAX_CAPTURE) return;
      captured += chunk.length;
      chunks.push(chunk);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    const onAbort = () => {
      cancelled = true;
      killTree(child);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const finish = (exitCode: number | null, extra = '') => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      const output = (Buffer.concat(chunks).toString('utf8') + extra).replace(ANSI, '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
      resolve({ exitCode, output, timedOut, cancelled, durationMs: Date.now() - started });
    };
    child.on('error', (err) => finish(null, `\n${err.message}`));
    child.on('close', (code) => finish(code));
    if (signal?.aborted) onAbort();
  });
}

export const runCommand = defineTool({
  name: 'run_command',
  description:
    'Run a Windows PowerShell command in the working folder and get its output (stdout and stderr together). The user approves each command. Use the file tools for reading, searching and editing files.',
  category: 'command',
  input: z.object({
    command: z.string().min(1).describe('The PowerShell command or script.'),
    timeout_seconds: z.coerce.number().int().min(1).max(600).optional().describe('Stop the command after this many seconds (default 120).'),
  }),
  async approval(args, ctx) {
    return { kind: 'command', title: 'Run a PowerShell command', preview: args.command, path: ctx.workspace.root };
  },
  async run(args, ctx) {
    const timeout = (args.timeout_seconds ?? 120) * 1000;
    const result = await runShell(args.command, ctx.workspace.root, timeout, ctx.signal);
    const seconds = (result.durationMs / 1000).toFixed(1);
    const status = result.cancelled
      ? 'The command was cancelled.'
      : result.timedOut
        ? `The command was stopped after ${args.timeout_seconds ?? 120} seconds.`
        : `Exit code ${result.exitCode ?? 'unknown'} after ${seconds} s.`;
    return `${status}\n${result.output ? clip(result.output, ctx.maxResultChars, 'narrow the command to see less output') : '(no output)'}`;
  },
});
