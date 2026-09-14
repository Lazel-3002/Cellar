import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IpcEventMap } from '../../src/shared/ipc-contract';
import { OutputBuffer, resolveShell, TerminalManager } from '../../src/main/code/terminal';

type Emitted = { [K in keyof IpcEventMap]: { channel: K; payload: IpcEventMap[K] } }['terminal:data' | 'terminal:exit' | 'terminal:changed'];

const isWindows = process.platform === 'win32';
const stripAnsi = (text: string) => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g, '');

async function waitFor<T>(check: () => T | undefined | false, timeoutMs = 20_000, label = 'condition'): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

describe('resolveShell', () => {
  it.runIf(isWindows)('falls back to Windows PowerShell when the chosen shell is missing', () => {
    const env = { Path: 'C:\\cellar-missing-dir', SystemRoot: 'C:\\Windows' };
    for (const pref of ['auto', 'pwsh', 'powershell', 'cmd'] as const) {
      const shell = resolveShell(pref, 'win32', env);
      expect(shell.file.toLowerCase()).toBe('c:\\windows\\system32\\windowspowershell\\v1.0\\powershell.exe');
      expect(shell.args).toEqual(['-NoLogo']);
      expect(shell.label).toBe('PowerShell');
    }
  });

  it.runIf(isWindows)('finds cmd.exe on PATH', () => {
    const shell = resolveShell('cmd', 'win32', { PATH: 'C:\\Windows\\System32' });
    expect(shell.file.toLowerCase()).toBe('c:\\windows\\system32\\cmd.exe');
    expect(shell.args).toEqual([]);
    expect(shell.label).toBe('Command Prompt');
  });

  it('uses $SHELL elsewhere', () => {
    expect(resolveShell('auto', 'linux', { SHELL: '/usr/bin/zsh' })).toEqual({ file: '/usr/bin/zsh', args: [], label: 'zsh' });
    expect(resolveShell('auto', 'darwin', {}).file).toBe('/bin/bash');
  });
});

describe('OutputBuffer', () => {
  it('keeps recent output and trims at a line start', () => {
    const buffer = new OutputBuffer(100);
    for (let i = 0; i < 50; i++) buffer.append(`line ${String(i).padStart(3, '0')}\n`);
    const text = buffer.toString();
    expect(text.length).toBeLessThanOrEqual(120);
    expect(text.endsWith('line 049\n')).toBe(true);
    expect(text.startsWith('line ')).toBe(true);
  });
});

describe('TerminalManager', () => {
  let dir: string;
  const events: Emitted[] = [];
  const manager = new TerminalManager((channel, payload) => events.push({ channel, payload } as Emitted));
  const conversationId = 'conv-terminal-test';

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cellar-terminal-'));
  });

  afterAll(async () => {
    manager.disposeAll();
    // node-pty releases its pipes shortly after a kill.
    await new Promise((r) => setTimeout(r, 1500));
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('runs a shell, streams output, resizes and kills', async () => {
    const info = await manager.create({ conversationId, cwd: dir, shell: 'auto' });
    expect(info).toMatchObject({ conversationId, cwd: dir, exited: false });
    expect(info.id).toMatch(/^[A-Za-z0-9_-]+$/);
    if (isWindows) expect(info.title).toBe('PowerShell 1');
    expect(events).toContainEqual({ channel: 'terminal:changed', payload: { conversationId } });
    expect(manager.list(conversationId)).toEqual([info]);

    // Concatenated so the echoed command line itself does not match.
    manager.write(info.id, isWindows ? "echo ('cellar-term-' + 'ok')\r" : "echo cellar-term-'ok'\r");
    await waitFor(() => stripAnsi(manager.buffer(info.id)).includes('cellar-term-ok'), 20_000, 'command output');
    const streamed = events.filter((e) => e.channel === 'terminal:data' && e.payload.id === info.id).map((e) => (e.payload as { data: string }).data);
    expect(stripAnsi(streamed.join(''))).toContain('cellar-term-ok');

    manager.resize(info.id, 120, 40);
    expect(() => manager.resize(info.id, 1, 40)).toThrow('between 2 and 500');
    expect(() => manager.resize(info.id, 80.5, 40)).toThrow('whole number');
    expect(() => manager.write(info.id, 'x'.repeat(1_000_001))).toThrow('too large');
    expect(() => manager.write('../nope', 'ls')).toThrow('Invalid terminal id');
    expect(() => manager.write('missing-id', 'ls')).toThrow('no longer open');

    events.length = 0;
    manager.kill(info.id);
    expect(manager.list(conversationId)).toEqual([]);
    expect(events).toContainEqual({ channel: 'terminal:changed', payload: { conversationId } });
    expect(() => manager.buffer(info.id)).toThrow('no longer open');
  });

  it('keeps exited terminals listed with their exit code', async () => {
    const info = await manager.create({ conversationId, cwd: dir, shell: 'auto' });
    if (isWindows) expect(info.title).toBe('PowerShell 1');
    const second = await manager.create({ conversationId, cwd: dir, shell: 'auto' });
    if (isWindows) expect(second.title).toBe('PowerShell 2');

    manager.write(info.id, 'exit 3\r');
    const exit = await waitFor(() => events.find((e) => e.channel === 'terminal:exit' && e.payload.id === info.id), 20_000, 'exit event');
    expect(exit.payload).toEqual({ id: info.id, exitCode: 3 });
    expect(manager.list(conversationId)).toEqual([
      { ...info, exited: true, exitCode: 3 },
      { ...second, exited: false },
    ]);
    // Input and resizes for an exited shell are ignored.
    expect(() => manager.write(info.id, 'echo hi\r')).not.toThrow();
    expect(() => manager.resize(info.id, 90, 30)).not.toThrow();

    manager.killForConversation(conversationId);
    expect(manager.list(conversationId)).toEqual([]);
  });

  it('rejects a missing working folder', async () => {
    await expect(manager.create({ conversationId, cwd: join(dir, 'missing') })).rejects.toThrow('no longer exists');
  });

  it('disposes without throwing', async () => {
    await manager.create({ conversationId: 'conv-dispose', cwd: dir });
    expect(() => manager.disposeAll()).not.toThrow();
    expect(manager.list('conv-dispose')).toEqual([]);
    expect(() => manager.disposeAll()).not.toThrow();
  });
});
