import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  asUrl,
  coordinateSpaceFor,
  describeObservation,
  isBlockedApp,
  looksLikePaymentDetails,
  matchApps,
  normalizeComputerArgs,
  parseKeyCombo,
  regionToScreen,
  riskOf,
  SCREEN_MARKER,
  toModel,
  toScreen,
  type ScreenFrame,
} from '../../src/shared/computer';
import type { AgentPart, TaskState, ToolPart } from '../../src/shared/types/agent';
import type { Message, StreamEvent } from '../../src/shared/types/chat';
import type { ScreenObservation } from '../../src/shared/types/computer';
import type { ModelEntry } from '../../src/shared/types/models';
import type { ProviderStatus } from '../../src/shared/types/providers';

process.env.CELLAR_HOME = join(tmpdir(), `cellar-computer-home-${process.pid}`);

const { initPaths } = await import('../../src/main/system/paths');
const { closeDatabase, openDatabase } = await import('../../src/main/db/client');
const { settings } = await import('../../src/main/services/settings');
const { providers } = await import('../../src/main/providers/registry');
const { chat } = await import('../../src/main/chat/orchestrator');
const { buildTaskHistory, freshScreens } = await import('../../src/main/agent/history');
const tools = await import('../../src/main/agent/tools/computer');
const { compileHelper, ComputerHelper } = await import('../../src/main/computer/helper');
type ChatRequest = import('../../src/main/providers/types').ChatRequest;
type Provider = import('../../src/main/providers/types').Provider;
type ToolContext = import('../../src/main/agent/tools/types').ToolContext;

const frame = (space: 'pixels' | 'normalized' = 'pixels'): ScreenFrame => ({ region: { x: 1920, y: 0, w: 2560, h: 1440 }, imageWidth: 1280, imageHeight: 720, space });

describe('computer use: coordinates', () => {
  it('picks the 0–1000 grid for Qwen3-VL-family models and pixels for the rest', () => {
    expect(coordinateSpaceFor('qwen3.5:9b', 'auto')).toBe('normalized');
    expect(coordinateSpaceFor('Qwen3.6-35B-A3B-UD-IQ3_S.gguf', 'auto')).toBe('normalized');
    expect(coordinateSpaceFor('qwen3-vl:8b', 'auto')).toBe('normalized');
    expect(coordinateSpaceFor('qwen3:0.6b', 'auto')).toBe('pixels');
    expect(coordinateSpaceFor('gemma4:e4b', 'auto')).toBe('pixels');
    expect(coordinateSpaceFor('qwen3.5:9b', 'pixels')).toBe('pixels');
    expect(coordinateSpaceFor('llama3.2', 'normalized')).toBe('normalized');
  });

  it('maps screenshot points onto a scaled, offset display and back', () => {
    expect(toScreen(frame(), 640, 360)).toEqual({ x: 1920 + 1280, y: 720 });
    expect(toScreen(frame(), 0, 0)).toEqual({ x: 1920, y: 0 });
    expect(toScreen(frame('normalized'), 500, 500)).toEqual({ x: 1920 + 1280, y: 720 });
    expect(toModel(frame(), 3200, 720)).toEqual({ x: 640, y: 360 });
    expect(toModel(frame('normalized'), 3200, 720)).toEqual({ x: 500, y: 500 });
    // The far edge stays on the screen.
    expect(toScreen(frame(), 1280, 720).x).toBeLessThan(1920 + 2560);
  });

  it('explains a point off the screenshot in terms the model can fix', () => {
    expect(() => toScreen(frame(), 1500, 10)).toThrow(/outside the screenshot: x and y are pixels in the 1280×720 screenshot/);
    expect(() => toScreen(frame('normalized'), 1200, 10)).toThrow(/0–1000 grid/);
  });

  it('grows a tiny zoom rectangle to something worth looking at', () => {
    expect(regionToScreen(frame(), { x: 100, y: 100, width: 5, height: 5 })).toMatchObject({ x: 2120, y: 200, w: 64, h: 64 });
  });
});

describe('computer use: keys', () => {
  it('parses shortcuts, xdotool-style names and characters', () => {
    expect(parseKeyCombo('ctrl+s')).toEqual({ keys: [{ vk: 0x11 }, { vk: 0x53 }], label: 'Ctrl+S' });
    expect(parseKeyCombo('Return').keys).toEqual([{ vk: 0x0d }]);
    expect(parseKeyCombo('alt+F4').keys).toEqual([{ vk: 0x12 }, { vk: 0x73 }]);
    expect(parseKeyCombo('Page_Down').keys).toEqual([{ vk: 0x22, ext: true }]);
    expect(parseKeyCombo('win').keys).toEqual([{ vk: 0x5b, ext: true }]);
    expect(parseKeyCombo('ctrl++').keys).toEqual([{ vk: 0x11 }, { ch: '+' }]);
    expect(parseKeyCombo('ctrl + shift + t').label).toBe('Ctrl+Shift+T');
    expect(parseKeyCombo('ctrl+.').keys).toEqual([{ vk: 0x11 }, { ch: '.' }]);
  });

  it('refuses unknown keys and two ordinary keys at once', () => {
    expect(() => parseKeyCombo('hyper+q')).toThrow(/Unknown key "hyper"/);
    expect(() => parseKeyCombo('a+b')).toThrow(/not a modifier/);
    expect(() => parseKeyCombo('  ')).toThrow(/No keys/);
  });
});

describe('computer use: risk and blocked apps', () => {
  it('flags clicks that send, pay, delete or publish, in English and Turkish', () => {
    expect(riskOf({ kind: 'click', target: 'Send' })).toBe('sends something');
    expect(riskOf({ kind: 'click', target: 'Gönder' })).toBe('sends something');
    expect(riskOf({ kind: 'click', target: 'Satın al' })).toBe('spends money');
    expect(riskOf({ kind: 'click', target: 'Place order' })).toBe('spends money');
    expect(riskOf({ kind: 'click', target: 'Delete' })).toBe('deletes something');
    expect(riskOf({ kind: 'click', target: 'Sil' })).toBe('deletes something');
    expect(riskOf({ kind: 'click', target: 'Save' })).toBeNull();
    expect(riskOf({ kind: 'click', target: 'Sender name' })).toBeNull();
    expect(riskOf({ kind: 'click' })).toBeNull();
  });

  it('flags permanent deletes, sends by shortcut, closing windows and payment details', () => {
    expect(riskOf({ kind: 'keys', keys: 'shift+delete' })).toBe('deletes permanently');
    expect(riskOf({ kind: 'keys', keys: 'ctrl+enter' })).toBe('often sends a message');
    expect(riskOf({ kind: 'keys', keys: 'ctrl+s' })).toBeNull();
    expect(riskOf({ kind: 'close-window' })).toMatch(/unsaved work/);
    expect(riskOf({ kind: 'type', text: 'My card is 4111 1111 1111 1111' })).toBe('types what looks like payment details');
    expect(looksLikePaymentDetails('TR33 0006 1005 1978 6457 8413 26')).toBe(true);
    expect(looksLikePaymentDetails('Order 1234567890123 shipped')).toBe(false);
    expect(riskOf({ kind: 'type', text: 'hello world' })).toBeNull();
  });

  it('matches blocked apps by process name or window title', () => {
    const blocked = ['KeePassXC', '1Password', 'Bitwarden'];
    expect(isBlockedApp('KeePassXC', 'Passwords.kdbx - KeePassXC', blocked)).toBe('KeePassXC');
    expect(isBlockedApp('keepassxc.exe', '', blocked)).toBe('KeePassXC');
    expect(isBlockedApp('msedge', 'Vault - 1Password', blocked)).toBe('1Password');
    expect(isBlockedApp('notepad', 'notes.txt - Notepad', blocked)).toBeNull();
  });
});

const observation = (overrides: Partial<ScreenObservation> = {}): ScreenObservation => ({
  image: null,
  mime: null,
  imageWidth: 1280,
  imageHeight: 720,
  region: { x: 0, y: 0, w: 1920, h: 1080 },
  display: { x: 0, y: 0, w: 1920, h: 1080 },
  foreground: { hwnd: 1, title: 'notes.txt - Notepad', process: 'Notepad', pid: 10, minimized: false, maximized: true, foreground: true, rect: { x: 0, y: 0, w: 1920, h: 1040 } },
  cellarForeground: false,
  windows: [
    { hwnd: 1, title: 'notes.txt - Notepad', process: 'Notepad', pid: 10, minimized: false, maximized: true, foreground: true, rect: { x: 0, y: 0, w: 1920, h: 1040 } },
    { hwnd: 2, title: 'Inbox - Outlook', process: 'OUTLOOK', pid: 11, minimized: true, maximized: false, foreground: false, rect: { x: 0, y: 0, w: 800, h: 600 } },
  ],
  elements: [
    { n: 1, role: 'menu item', name: 'File', rect: { x: 0, y: 30, w: 40, h: 20 }, focused: false, enabled: true, password: false, window: 1, state: 'collapsed' },
    { n: 2, role: 'document', name: 'Text editor', value: 'hello', rect: { x: 0, y: 60, w: 1920, h: 900 }, focused: true, enabled: true, password: false, window: 1 },
    { n: 3, role: 'text field', name: 'Password', rect: { x: 0, y: 960, w: 200, h: 20 }, focused: false, enabled: true, password: true, window: 1 },
  ],
  elementsTimedOut: false,
  cursor: { x: 5, y: 5 },
  uiaMs: 10,
  totalMs: 30,
  ...overrides,
});

describe('computer use: what the model reads', () => {
  it('lists the active window, the others and the numbered controls', () => {
    const text = describeObservation(observation(), { frame: { ...frame(), region: { x: 0, y: 0, w: 1920, h: 1080 } }, vision: true, maxElements: 150 });
    expect(text).toContain('Screenshot: 1280×720 of a 1920×1080 screen; x and y are pixels in the 1280×720 screenshot');
    expect(text).toContain('Active window: "notes.txt - Notepad" (Notepad), maximized (window 1)');
    expect(text).toContain('Other windows: 2. "Inbox - Outlook" (OUTLOOK) (minimized)');
    expect(text).toContain('[1] menu item "File" (collapsed)');
    expect(text).toContain('[2] document "Text editor" = "hello" (focused)');
    expect(text).toContain('[3] text field "Password" (password — never type into it)');
  });

  it('adds the static text on screen (a display, a dialog message) on one line', () => {
    const text = describeObservation(observation({ texts: ['Standart Hesap Makinesi modu', 'Ekran değeri 7.006.652'] }), { frame: frame(), vision: true, maxElements: 150 });
    expect(text).toContain('Text on screen: "Standart Hesap Makinesi modu" · "Ekran değeri 7.006.652"');
  });

  it('tells a model without vision to work from the list, and counts what did not fit', () => {
    const text = describeObservation(observation(), { frame: frame(), vision: false, maxElements: 2 });
    expect(text).toContain('you get no image');
    expect(text).toContain('… and 1 more.');
    expect(text).not.toContain('[3]');
  });

  it('says what to do when the app lists no controls, or Cellar is in front', () => {
    expect(describeObservation(observation({ elements: [], elementsTimedOut: true }), { frame: frame(), vision: true, maxElements: 150 })).toContain('did not list its controls in time');
    expect(describeObservation(observation({ elements: [] }), { frame: frame(), vision: true, maxElements: 150 })).toContain('reports no controls');
    expect(describeObservation(observation({ foreground: null, cellarForeground: true }), { frame: frame(), vision: true, maxElements: 150 })).toContain("Cellar's own window is in front");
  });
});

describe('computer use: apps and arguments', () => {
  const apps = [
    { name: 'Notepad', id: 'notepad' },
    { name: 'Notepad++', id: 'npp' },
    { name: 'Hesap Makinesi', id: 'calc' },
    { name: 'Firefox Gizli Gezinti', id: 'ff-private' },
    { name: 'Firefox', id: 'ff' },
    { name: 'Uninstall Firefox', id: 'ff-uninstall' },
    { name: 'Dosya Gezgini', id: 'explorer' },
  ];

  it('finds apps by name, alias and Turkish Start menu names', () => {
    expect(matchApps('notepad', apps)[0].id).toBe('notepad');
    expect(matchApps('Notepad.exe', apps)[0].id).toBe('notepad');
    expect(matchApps('calculator', apps)[0].id).toBe('calc');
    expect(matchApps('firefox', apps)[0].id).toBe('ff');
    expect(matchApps('file explorer', apps)[0]?.id).toBe('explorer');
    expect(matchApps('explorer', apps)[0].id).toBe('explorer');
    expect(matchApps('Photoshop', apps)).toEqual([]);
  });

  it('tells web addresses from app names and files', () => {
    expect(asUrl('example.com')).toBe('https://example.com');
    expect(asUrl('https://github.com/x')).toBe('https://github.com/x');
    expect(asUrl('notes.txt')).toBeNull();
    expect(asUrl('Notepad')).toBeNull();
  });

  it('accepts the argument shapes models send', () => {
    expect(normalizeComputerArgs('computer_click', { coordinate: [10, 20] })).toMatchObject({ x: 10, y: 20 });
    expect(normalizeComputerArgs('computer_click', { element: '[12]' })).toMatchObject({ element: 12 });
    expect(normalizeComputerArgs('computer_click', { id: 7 })).toMatchObject({ element: 7 });
    expect(normalizeComputerArgs('computer_click', { position: '(300, 400)' })).toMatchObject({ x: 300, y: 400 });
    expect(normalizeComputerArgs('computer_key', { keys: ['ctrl', 's'] })).toMatchObject({ keys: 'ctrl+s' });
    expect(normalizeComputerArgs('computer_key', { key: 'Return' })).toMatchObject({ keys: 'Return' });
    expect(normalizeComputerArgs('computer_scroll', { delta: -300 })).toMatchObject({ direction: 'up', amount: 3 });
    expect(normalizeComputerArgs('computer_scroll', { scroll_direction: 'down', scroll_amount: 4 })).toMatchObject({ direction: 'down', amount: 4 });
    expect(normalizeComputerArgs('computer_open_app', { app: 'Excel' })).toMatchObject({ name: 'Excel' });
    expect(normalizeComputerArgs('computer_type', { content: 'hi' })).toMatchObject({ text: 'hi' });
    expect(normalizeComputerArgs('computer_drag', { start_coordinate: [1, 2], end_coordinate: [3, 4] })).toMatchObject({ from_x: 1, from_y: 2, to_x: 3, to_y: 4 });
    expect(normalizeComputerArgs('computer_windows', { title: 'Outlook' })).toMatchObject({ window: 'Outlook' });
  });
});

function computerPart(id: string, round: number): ToolPart {
  return { type: 'tool', id, round, name: 'computer_click', argsText: '{}', args: { element: 1 }, status: 'done', category: 'computer', result: `Clicked [1] ${id}.${SCREEN_MARKER}Active window: step ${id}`, resultImages: [`img-${id}`] };
}

describe('computer use: history', () => {
  const branchOf = (ids: string[]): Message[] => [
    { id: 'u', conversationId: 'x', parentId: null, role: 'user', content: 'Do it', attachments: [], createdAt: 0 } as unknown as Message,
    { id: 'm', conversationId: 'x', parentId: 'u', role: 'assistant', content: '', attachments: [], parts: [...ids.map((id, i) => computerPart(id, i)), { type: 'text', round: ids.length, text: 'Done.' }] as AgentPart[], createdAt: 1 } as unknown as Message,
  ];

  it('keeps the latest looks at the screen, cutting older ones in batches so the prompt cache survives', () => {
    expect([...freshScreens(branchOf(['a']))]).toEqual(['a']);
    expect([...freshScreens(branchOf(['a', 'b']))]).toEqual(['a', 'b']);
    expect([...freshScreens(branchOf(['a', 'b', 'c']))]).toEqual(['a', 'b', 'c']);
    expect([...freshScreens(branchOf(['a', 'b', 'c', 'd']))]).toEqual(['d']);
    expect([...freshScreens(branchOf(['a', 'b', 'c', 'd', 'e']))]).toEqual(['d', 'e']);
    expect([...freshScreens(branchOf(['a', 'b', 'c', 'd', 'e', 'f', 'g']))]).toEqual(['g']);
    // A small context window keeps at most two.
    expect([...freshScreens(branchOf(['a', 'b', 'c']), 2)]).toEqual(['c']);
    expect([...freshScreens(branchOf(['a', 'b', 'c', 'd']), 2)]).toEqual(['c', 'd']);
  });

  it('cuts an older look to what the step did', async () => {
    const history = await buildTaskHistory(branchOf(['a', 'b', 'c', 'd', 'e']), { protocol: 'native', vision: false, trimOldResults: false });
    const results = history.filter((m) => m.role === 'tool').map((m) => m.content);
    expect(results[0]).toBe('Clicked [1] a.\n(An older look at the screen, no longer shown.)');
    expect(results[2]).toBe('Clicked [1] c.\n(An older look at the screen, no longer shown.)');
    expect(results[3]).toContain('Active window: step d');
    expect(results[4]).toContain('Active window: step e');
  });
});

describe('computer use: approvals', () => {
  const task = (computerAllowed?: boolean): TaskState => ({ folder: null, workDir: '.', permissionMode: 'ask', status: 'running', todos: [], files: [], sources: [], allowCommands: false, allowedDomains: [], steps: 0, maxSteps: 40, computerAllowed });
  const ctx = (computerAllowed?: boolean, chatTurn = false) => ({ task: task(computerAllowed), messageId: 'no-session', chat: chatTurn }) as unknown as ToolContext;

  it('asks once before the first step, then only for risky ones', async () => {
    expect(await tools.computerScreenshot.approval!({}, ctx())).toMatchObject({ kind: 'computer', title: 'Let Cellar use your computer' });
    expect((await tools.computerScreenshot.approval!({}, ctx(false, true)))?.preview).toContain('until this reply ends');
    expect(await tools.computerScreenshot.approval!({}, ctx(true))).toBeNull();
    expect(await tools.computerClick.approval!({ element: 4 }, ctx(true))).toBeNull();
    expect(await tools.computerKey.approval!({ keys: 'shift+delete' }, ctx(true))).toMatchObject({ kind: 'action', title: 'Cellar wants to press shift+delete' });
    expect(await tools.computerType.approval!({ text: '4111111111111111' }, ctx(true))).toMatchObject({ kind: 'action' });
    expect(await tools.computerWindows.approval!({ action: 'close', window: 'Notepad' }, ctx(true))).toMatchObject({ kind: 'action', title: 'Cellar wants to close window “Notepad”' });
    expect(await tools.computerWindows.approval!({ action: 'focus', window: 2 }, ctx(true))).toBeNull();
  });
});

class FakeProvider implements Provider {
  readonly id = 'fake';
  readonly kind = 'openai' as const;
  readonly name = 'Fake';
  readonly canManageModels = false;
  readonly canDownload = false;
  requests: ChatRequest[] = [];
  script: (req: ChatRequest) => StreamEvent[] = () => [{ type: 'text', delta: 'ok' }];
  async status(): Promise<ProviderStatus> {
    return { id: this.id, kind: this.kind, name: this.name, baseUrl: '', state: 'online', canManageModels: false, canDownload: false };
  }
  async listModels(): Promise<ModelEntry[]> {
    return [];
  }
  async *chat(req: ChatRequest): AsyncGenerator<StreamEvent> {
    this.requests.push(req);
    for (const event of this.script(req)) yield event;
    yield { type: 'done', stopReason: 'stop' };
  }
}

describe('computer use: in the agent loop', () => {
  const fake = new FakeProvider();
  const model: ModelEntry = {
    ref: { providerId: 'fake', modelId: 'qwen3.5:9b' },
    providerKind: 'openai',
    providerName: 'Fake',
    displayName: 'Fake Vision',
    contextLength: 32768,
    capabilities: { vision: true, tools: true, reasoning: false, embedding: false },
    reasoningStyle: 'none',
    loaded: true,
  };
  let userData: string;
  let root: string;
  const call = (name: string, args: unknown): StreamEvent => ({ type: 'tool_call', id: `c${Math.random()}`, name, argumentsDelta: JSON.stringify(args) });
  const toolTurns = (req: ChatRequest) => req.messages.filter((m) => m.role === 'tool').length;
  const partsOf = (conversationId: string, messageId: string) => chat.getConversation(conversationId).messages.find((m) => m.id === messageId)!;
  async function waitFor<T>(fn: () => T | undefined | false, timeout = 10_000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const value = fn();
      if (value) return value;
      if (Date.now() - start > timeout) throw new Error('Timed out waiting');
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  const toolParts = (parts: AgentPart[] | undefined) => (parts ?? []).filter((p): p is ToolPart => p.type === 'tool');

  beforeAll(async () => {
    userData = await mkdtemp(join(tmpdir(), 'cellar-computer-data-'));
    root = await mkdtemp(join(tmpdir(), 'cellar-computer-ws-'));
    initPaths(userData, userData);
    closeDatabase();
    openDatabase(':memory:');
    settings.update({ autoTitle: false, coworkNotifications: false, approvalMode: 'manual' });
    (providers as unknown as { get: (id: string) => Provider }).get = () => fake;
    (providers as unknown as { findModel: () => Promise<ModelEntry> }).findModel = async () => model;
  });

  afterAll(async () => {
    chat.stopAll();
    settings.update({ computerUse: false });
    await rm(root, { recursive: true, force: true });
    await rm(userData, { recursive: true, force: true }).catch(() => undefined);
    await rm(process.env.CELLAR_HOME!, { recursive: true, force: true }).catch(() => undefined);
  });

  beforeEach(() => {
    fake.requests = [];
  });

  it.runIf(process.platform === 'win32')('offers the tools and guidance, and asks before the first look at the screen', async () => {
    settings.update({ computerUse: true });
    fake.script = (req) => (toolTurns(req) === 0 ? [call('screenshot', {})] : [{ type: 'text', delta: 'Understood.' }]);
    const { conversationId, assistantMessageId } = await chat.send({ content: 'What is on my screen?', attachmentIds: [], model: model.ref, thinking: 'off', task: { folder: root, permissionMode: 'ask' } });
    const pending = await waitFor(() => toolParts(partsOf(conversationId, assistantMessageId).parts).find((t) => t.status === 'awaiting-approval'));
    // The "screenshot" alias resolved to the real tool, which asks once for the task.
    expect(pending.name).toBe('computer_screenshot');
    expect(pending.approval).toMatchObject({ kind: 'computer', title: 'Let Cellar use your computer' });
    const first = fake.requests[0];
    expect(first.tools?.map((t) => t.name)).toEqual(expect.arrayContaining(['computer_screenshot', 'computer_click', 'computer_type', 'computer_hand_over']));
    expect(first.messages[0].content).toContain('<computer_use>');
    expect(first.messages[0].content).toContain('0–1000 grid');
    chat.approve(assistantMessageId, pending.id, { action: 'deny', feedback: 'Not now' });
    const done = await waitFor(() => {
      const m = partsOf(conversationId, assistantMessageId);
      return m.status !== 'streaming' ? m : undefined;
    });
    expect(toolParts(done.parts)[0]).toMatchObject({ status: 'denied', feedback: 'Not now' });
    expect(fake.requests[1].messages.find((m) => m.role === 'tool')?.content).toContain('The user denied this action');
  });

  it.runIf(process.platform === 'win32')('lets plan mode look but not touch', async () => {
    settings.update({ computerUse: true });
    fake.script = (req) => (toolTurns(req) === 0 ? [call('computer_click', { element: 3 })] : [{ type: 'text', delta: 'OK.' }]);
    const { conversationId, assistantMessageId } = await chat.send({ content: 'Plan it', attachmentIds: [], model: model.ref, thinking: 'off', task: { folder: root, permissionMode: 'plan' } });
    const done = await waitFor(() => {
      const m = partsOf(conversationId, assistantMessageId);
      return m.status !== 'streaming' ? m : undefined;
    });
    const names = fake.requests[0].tools?.map((t) => t.name) ?? [];
    expect(names).toEqual(expect.arrayContaining(['computer_screenshot', 'computer_read']));
    expect(names).not.toContain('computer_click');
    expect(toolParts(done.parts)[0]).toMatchObject({ status: 'error', error: expect.stringContaining('not available in plan mode') });
  });

  it('explains that computer use is off when a model reaches for it anyway', async () => {
    settings.update({ computerUse: false });
    fake.script = (req) => (toolTurns(req) === 0 ? [call('computer_click', { x: 1, y: 1 })] : [{ type: 'text', delta: 'OK.' }]);
    const { conversationId, assistantMessageId } = await chat.send({ content: 'Click', attachmentIds: [], model: model.ref, thinking: 'off', task: { folder: root, permissionMode: 'ask' } });
    const done = await waitFor(() => {
      const m = partsOf(conversationId, assistantMessageId);
      return m.status !== 'streaming' ? m : undefined;
    });
    expect(fake.requests[0].tools?.map((t) => t.name)).not.toContain('computer_click');
    expect(toolParts(done.parts)[0].error).toContain('Computer use is turned off');
  });
});

describe.runIf(process.platform === 'win32')('computer use: the Windows helper (read-only)', () => {
  let dir: string;
  let helper: InstanceType<typeof ComputerHelper>;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cellar-computer-helper-'));
    helper = new ComputerHelper(() => dir, () => [process.pid]);
  });
  afterAll(async () => {
    helper.kill();
    await new Promise((r) => setTimeout(r, 300));
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('compiles once with the C# compiler Windows ships, and reuses the build', async () => {
    const exe = await compileHelper(dir);
    expect(existsSync(exe)).toBe(true);
    expect(await compileHelper(dir)).toBe(exe);
  }, 120_000);

  it('reports displays, the pointer and windows, and takes a marked screenshot without touching anything', async () => {
    const displays = await helper.displays();
    expect(displays.length).toBeGreaterThan(0);
    expect(displays.some((d) => d.primary)).toBe(true);
    const cursor = await helper.cursor();
    expect(typeof cursor.x).toBe('number');
    // Only a real mouse counts as the user taking over; the hook that tells them apart is on.
    expect(await helper.userInput()).toMatchObject({ watching: true, mouse: expect.any(Number) });
    expect(Array.isArray(await helper.windows())).toBe(true);
    const obs = await helper.observe({ display: 0, maxWidth: 800, maxHeight: 500, marks: true, maxElements: 40 });
    expect(obs.imageWidth).toBeLessThanOrEqual(800);
    expect(obs.imageHeight).toBeLessThanOrEqual(500);
    expect(obs.mime).toBe('image/jpeg');
    expect(obs.image?.startsWith('/9j/')).toBe(true);
    expect(obs.region.w).toBe(displays[0].bounds.w);
    expect(obs.elements.length).toBeLessThanOrEqual(40);
  }, 60_000);

  it('turns a stale element number into a sentence for the model', async () => {
    await expect(helper.element(9999)).rejects.toThrow(/no element 9999 on the latest screenshot/);
  });
});
