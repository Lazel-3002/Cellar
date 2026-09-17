import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.CELLAR_HOME = join(tmpdir(), `cellar-modules-home-${process.pid}`);
process.env.CELLAR_NO_OS_SCHEDULE = '1';

// Exports and the PDF renderer reach for a window; the module registry itself does not.
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null }, app: { getVersion: () => '0.0.0' }, dialog: {}, ipcMain: { handle: vi.fn() }, shell: {}, session: {} }));

const { initPaths } = await import('../../src/main/system/paths');
initPaths(join(tmpdir(), `cellar-modules-data-${process.pid}`), join(tmpdir(), 'artifact-runtime'));
const { openDatabase } = await import('../../src/main/db/client');
openDatabase(':memory:');

const { modules } = await import('../../src/main/modules/registry');
const { normalizeCallArgs } = await import('../../src/main/agent/tools/call');
const { settings } = await import('../../src/main/services/settings');

describe('call(module, task)', () => {
  beforeEach(() => modules.reset());

  it('answers cellar-math from Cellar\'s own calculator, without a model', async () => {
    const result = await modules.call('cellar-math', { action: 'calculate', params: { expression: '2/3 + 1/6' } });
    expect(result.status).toBe('success');
    expect(result.stdout).toContain('5/6');
  });

  it('keeps the documented result shape for a failure', async () => {
    const result = await modules.call('cellar-code', { action: 'diagnostics', params: {} });
    expect(result).toMatchObject({ status: 'error', result: null });
    expect(result.stdout).toContain('folder');
  });

  it('names the actions a module takes when the action is unknown', async () => {
    const result = await modules.call('cellar-voice', { action: 'sing' });
    expect(result.status).toBe('error');
    expect(result.stdout).toContain('transcribe');
  });

  it('rate limits each module separately', async () => {
    settings.update({ moduleCallsPerMinute: 2 });
    const math = () => modules.call('cellar-math', { action: 'calculate', params: { expression: '1+1' } });
    expect((await math()).status).toBe('success');
    expect((await math()).status).toBe('success');
    const limited = await math();
    expect(limited.status).toBe('error');
    expect(limited.stdout).toMatch(/limit is 2/);
    // A different module has its own budget.
    expect((await modules.call('cellar-voice', { action: 'info' })).status).toBe('success');
    // Polling a delegated task is never rate limited, so a model can always check on its own work.
    expect((await modules.call('cellar-math', { action: 'status', params: { task_id: 'nope' } })).stdout).toContain('no delegated task');
    settings.update({ moduleCallsPerMinute: 5 });
  });

  it('marks only the read-only actions as needing no approval', () => {
    expect(modules.readOnly('cellar-math', 'calculate')).toBe(true);
    expect(modules.readOnly('cellar-math', 'status')).toBe(true);
    expect(modules.readOnly('cellar-cowork', 'run')).toBe(false);
    expect(modules.readOnly('cellar-code', 'run')).toBe(false);
  });
});

describe('call argument shapes models actually send', () => {
  it('lifts a flattened action and params into task', () => {
    expect(normalizeCallArgs({ module: 'cellar-math', action: 'calculate', params: { expression: '1+1' } })).toEqual({
      module: 'cellar-math',
      task: { action: 'calculate', params: { expression: '1+1' } },
    });
  });

  it('parses a task sent as a JSON string', () => {
    expect(normalizeCallArgs({ module: 'math', task: '{"action":"quiz","arguments":{"count":3}}' })).toEqual({
      module: 'cellar-math',
      task: { action: 'quiz', params: { count: 3 } },
    });
  });

  it('accepts a bare module name and a bare action string', () => {
    expect(normalizeCallArgs({ module: 'cowork', task: 'run' })).toEqual({ module: 'cellar-cowork', task: { action: 'run' } });
  });
});
