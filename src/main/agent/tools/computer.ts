/**
 * Computer use as tools: the model looks at the Windows desktop and works the mouse and keyboard
 * (`main/computer/`). Every action answers with what it did plus a fresh look at the screen, so the
 * model checks each step without an extra round. Controls are pointed at by the numbers Cellar
 * draws on the screenshot (UI Automation found them), which is what makes this work for small
 * local models; x/y is the fallback for canvases and games.
 */
import { z } from 'zod';
import { riskOf, SCREEN_MARKER } from '@shared/computer';
import type { ApprovalRequest } from '@shared/types/agent';
import { computer, type ComputerSession, type Target } from '../../computer/controller';
import { HelperError } from '../../computer/helper';
import { sleep } from '../../lib/util';
import { defineTool, ToolError, type AgentTool, type ToolContext } from './types';

const element = z.coerce.number().int().min(1).optional().describe('Number of the element on the latest screenshot (preferred over x/y).');
const x = z.coerce.number().optional().describe('Horizontal position on the screenshot, when there is no element number.');
const y = z.coerce.number().optional().describe('Vertical position on the screenshot.');

function owner(ctx: ToolContext) {
  if (!ctx.conversationId || !ctx.messageId || !ctx.stopRun) throw new ToolError('Computer use is only available while a reply is running.');
  return { conversationId: ctx.conversationId, messageId: ctx.messageId, signal: ctx.signal, stop: ctx.stopRun };
}

/** Helper failures are messages for the model, not crashes. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof HelperError) throw new ToolError(err.message);
    throw err;
  }
}

/** A 16K context window cannot carry a 150-line list of controls three times over. */
const maxElements = (ctx: ToolContext) => (ctx.maxResultChars >= 24_000 ? 150 : 80);

async function look(ctx: ToolContext, s: ComputerSession, pointer?: { x: number; y: number }): Promise<string> {
  const seen = await computer.look(s, { vision: !!ctx.vision, modelId: ctx.modelId ?? '', pointer, maxElements: maxElements(ctx) });
  if (seen.image) await ctx.recordResultImages?.([seen.image]);
  return seen.text;
}

/**
 * The shape of every action: take the screen (first step of the run), make sure the user has not
 * taken the mouse back, act, let the screen settle, and look again.
 */
async function act(ctx: ToolContext, status: string, settleMs: number, work: (s: ComputerSession) => Promise<{ said: string; pointer?: { x: number; y: number } }>): Promise<string> {
  return guarded(async () => {
    const s = await computer.begin(owner(ctx));
    if (await computer.checkIn(s)) return `The user took over the mouse, so this step was not done. The screen may have changed: check it before going on.${SCREEN_MARKER}${await look(ctx, s)}`;
    computer.status(status);
    const { said, pointer } = await work(s);
    await sleep(settleMs, ctx.signal);
    return `${said}${SCREEN_MARKER}${await look(ctx, s, pointer)}`;
  });
}

/**
 * The first computer step of a task asks once ("Allow for this task" covers the rest); anything
 * that sends, pays, deletes or publishes asks every time.
 */
function gate(ctx: ToolContext, summary: string, risk: string | null): ApprovalRequest | null {
  if (risk) return { kind: 'action', title: `Cellar wants to ${summary}`, preview: `This ${risk}. Allow it only if it is what you asked for.` };
  if (ctx.task.computerAllowed) return null;
  const until = ctx.chat ? 'this reply' : 'this task';
  return {
    kind: 'computer',
    title: 'Let Cellar use your computer',
    preview: `First step: ${summary}.\n\nCellar will see your screen and use the mouse and keyboard until ${until} ends. Cellar's window moves out of the way; moving the mouse pauses it, and Stop on the bar at the top of the screen (or Ctrl+Alt+Esc) ends it.`,
  };
}

const where = (args: { element?: number; x?: number; y?: number }) => (args.element !== undefined ? `element ${args.element}` : args.x !== undefined ? `(${args.x}, ${args.y})` : 'the screen');

/** What a pointer action aims at, named from the latest screenshot when possible (for the approval card and risk). */
function peek(ctx: ToolContext, args: { element?: number; x?: number; y?: number }): string {
  const known = ctx.messageId && args.element !== undefined ? computer.knownElement(ctx.messageId, args.element) : null;
  return known ? `${known.role}${known.name ? ` “${known.name}”` : ''}` : where(args);
}

async function resolve(s: ComputerSession, args: { element?: number; x?: number; y?: number }): Promise<Target> {
  return computer.target(s, args);
}

export const computerScreenshot = defineTool({
  name: 'computer_screenshot',
  description:
    'Look at the screen: a screenshot with numbered boxes on the controls, the list of those controls, the active window and the other open windows. Start here. Every other computer_ tool also returns a fresh look after it acts, so use this to look again after waiting (wait) or to zoom in on part of the screen (zoom).',
  category: 'computer',
  input: z.object({
    wait: z.coerce.number().min(0).max(30).optional().describe('Seconds to wait first (for something loading).'),
    zoom: z
      .object({ x: z.coerce.number(), y: z.coerce.number(), width: z.coerce.number().positive(), height: z.coerce.number().positive() })
      .optional()
      .describe('A rectangle on the latest screenshot to see enlarged (small text, icons).'),
  }),
  async approval(args, ctx) {
    return gate(ctx, args.zoom ? 'look closer at part of the screen' : 'look at the screen', null);
  },
  async run(args, ctx) {
    return guarded(async () => {
      const s = await computer.begin(owner(ctx));
      computer.status(args.zoom ? 'Looking closer' : 'Looking at the screen');
      if (args.wait) await sleep(args.wait * 1000, ctx.signal);
      if (args.zoom) {
        const seen = await computer.look(s, { vision: !!ctx.vision, modelId: ctx.modelId ?? '', zoom: args.zoom });
        if (!seen.image) return 'Zooming needs a model that can see images. Use computer_read for the text instead.';
        await ctx.recordResultImages?.([seen.image]);
        return seen.text;
      }
      return look(ctx, s);
    });
  },
});

export const computerClick = defineTool({
  name: 'computer_click',
  description: 'Click something on the screen: an element by its number, or x/y. clicks=2 double-clicks (open a file, select a word); button="right" opens a context menu.',
  category: 'computer',
  input: z.object({
    element,
    x,
    y,
    button: z.enum(['left', 'right', 'middle']).optional().describe('Default left.'),
    clicks: z.coerce.number().int().min(1).max(3).optional().describe('2 for a double-click.'),
    hold: z.string().optional().describe('Keys held down while clicking, e.g. "ctrl" or "shift".'),
  }),
  async approval(args, ctx) {
    const target = peek(ctx, args);
    const verb = args.button === 'right' ? 'right-click' : args.clicks === 2 ? 'double-click' : 'click';
    const name = ctx.messageId && args.element !== undefined ? computer.knownElement(ctx.messageId, args.element)?.name : undefined;
    return gate(ctx, `${verb} ${target}`, args.button === 'right' ? null : riskOf({ kind: 'click', target: name ?? (await computer.nameAt(ctx.messageId, args)) }));
  },
  async run(args, ctx) {
    const button = args.button ?? 'left';
    const clicks = args.clicks ?? 1;
    const verb = button === 'right' ? 'Right-clicked' : button === 'middle' ? 'Middle-clicked' : clicks === 2 ? 'Double-clicked' : clicks === 3 ? 'Triple-clicked' : 'Clicked';
    return act(ctx, `${verb.replace(/ed$/, 'ing')} ${peek(ctx, args)}`, clicks > 1 ? 650 : 500, async (s) => {
      const t = await resolve(s, args);
      await computer.click(s, t, { button, clicks, hold: args.hold });
      return { said: `${verb} ${t.label}.`, pointer: t };
    });
  },
});

export const computerType = defineTool({
  name: 'computer_type',
  description:
    'Type text with the keyboard into the field that has focus, or click an element (or x/y) first to focus it. clear=true replaces what the field holds; enter=true presses Enter afterwards (to search or submit). To press a button, use computer_click. Never for passwords — use computer_hand_over.',
  category: 'computer',
  input: z.object({
    text: z.string().max(5000).describe('What to type. New lines become Enter presses.'),
    element,
    x,
    y,
    clear: z.boolean().optional().describe('Select all and delete what is in the field first.'),
    enter: z.boolean().optional().describe('Press Enter after typing.'),
  }),
  async approval(args, ctx) {
    const into = args.element !== undefined || args.x !== undefined ? ` into ${peek(ctx, args)}` : '';
    const shown = args.text.length > 60 ? `${args.text.slice(0, 57)}…` : args.text;
    return gate(ctx, `type “${shown}”${into}${args.enter ? ' and press Enter' : ''}`, riskOf({ kind: 'type', text: args.text }));
  },
  async run(args, ctx) {
    const shown = args.text.length > 40 ? `${args.text.slice(0, 37)}…` : args.text;
    return act(ctx, `Typing “${shown}”`, args.enter ? 700 : 300, async (s) => {
      const button = args.element === undefined && args.x === undefined ? computer.buttonNamed(s.messageId, args.text) : null;
      if (button) {
        // The label of a key on screen, not text for a field: press it (unless pressing it deserves a question).
        if (riskOf({ kind: 'click', target: button.name })) throw new HelperError(`“${args.text}” is the name of ${button.role} [${button.n}], not text to type. To press it, use computer_click with element=${button.n}.`);
        const t = await resolve(s, { element: button.n });
        await computer.click(s, t, { button: 'left', clicks: 1 });
        return { said: `“${args.text}” is the name of ${button.role} [${button.n}], so it was clicked instead of typed.`, pointer: t };
      }
      let into = '';
      let pointer: Target | undefined;
      if (args.element !== undefined || args.x !== undefined) {
        const t = await resolve(s, args);
        if (t.password) throw new HelperError('That is a password field. Cellar never types passwords: use computer_hand_over so the user types it.');
        await computer.click(s, t, { button: 'left', clicks: 1 });
        await sleep(200, ctx.signal);
        into = ` into ${t.label}`;
        pointer = t;
      }
      await computer.type(s, args.text, { clear: args.clear, enter: args.enter });
      return { said: `Typed ${args.text.length} character${args.text.length === 1 ? '' : 's'}${into}${args.clear ? ' (replacing what was there)' : ''}${args.enter ? ' and pressed Enter' : ''}.`, pointer };
    });
  },
});

export const computerKey = defineTool({
  name: 'computer_key',
  description: 'Press a key or a shortcut: "enter", "tab", "esc", "backspace", "pagedown", "ctrl+s", "ctrl+l", "alt+tab", "alt+f4", "win", "ctrl+shift+t". repeat presses it several times.',
  category: 'computer',
  input: z.object({
    keys: z.string().min(1).describe('One key or modifiers+key, joined with +.'),
    repeat: z.coerce.number().int().min(1).max(50).optional().describe('How many times (default 1).'),
  }),
  async approval(args, ctx) {
    return gate(ctx, `press ${args.keys}${args.repeat && args.repeat > 1 ? ` ${args.repeat} times` : ''}`, riskOf({ kind: 'keys', keys: args.keys }));
  },
  async run(args, ctx) {
    return act(ctx, `Pressing ${args.keys}`, 550, async (s) => {
      const label = await computer.keys(s, args.keys, args.repeat ?? 1);
      return { said: `Pressed ${label}${args.repeat && args.repeat > 1 ? ` ${args.repeat} times` : ''}.` };
    });
  },
});

export const computerScroll = defineTool({
  name: 'computer_scroll',
  description: 'Scroll with the mouse wheel over an element or x/y (default: the middle of the active window). amount is wheel notches (default 5, about a third of a page).',
  category: 'computer',
  input: z.object({
    direction: z.enum(['up', 'down', 'left', 'right']),
    amount: z.coerce.number().int().min(1).max(30).optional(),
    element,
    x,
    y,
  }),
  async approval(args, ctx) {
    return gate(ctx, `scroll ${args.direction}`, null);
  },
  async run(args, ctx) {
    const amount = args.amount ?? 5;
    return act(ctx, `Scrolling ${args.direction}`, 450, async (s) => {
      const t = args.element !== undefined || args.x !== undefined ? await resolve(s, args) : null;
      await computer.scroll(s, t, args.direction, amount);
      return { said: `Scrolled ${args.direction} ${amount} notch${amount === 1 ? '' : 'es'}${t ? ` over ${t.label}` : ' in the active window'}.` };
    });
  },
});

export const computerDrag = defineTool({
  name: 'computer_drag',
  description: 'Drag with the left mouse button from one point to another (move a file, a slider, a window edge, select text). Each end is an element number or x/y.',
  category: 'computer',
  input: z.object({
    from_element: element,
    from_x: x,
    from_y: y,
    to_element: element,
    to_x: x,
    to_y: y,
  }),
  async approval(args, ctx) {
    return gate(ctx, `drag from ${peek(ctx, { element: args.from_element, x: args.from_x, y: args.from_y })} to ${peek(ctx, { element: args.to_element, x: args.to_x, y: args.to_y })}`, null);
  },
  async run(args, ctx) {
    return act(ctx, 'Dragging', 550, async (s) => {
      const from = await resolve(s, { element: args.from_element, x: args.from_x, y: args.from_y });
      const to = await resolve(s, { element: args.to_element, x: args.to_x, y: args.to_y });
      await computer.drag(s, from, to);
      return { said: `Dragged from ${from.label} to ${to.label}.`, pointer: to };
    });
  },
});

export const computerMove = defineTool({
  name: 'computer_move',
  description: 'Move the mouse over something without clicking (to open a hover menu or show a tooltip).',
  category: 'computer',
  input: z.object({ element, x, y }),
  async approval(args, ctx) {
    return gate(ctx, `move the mouse to ${peek(ctx, args)}`, null);
  },
  async run(args, ctx) {
    return act(ctx, `Pointing at ${peek(ctx, args)}`, 450, async (s) => {
      const t = await resolve(s, args);
      await computer.move(s, t);
      return { said: `Moved the mouse to ${t.label}.`, pointer: t };
    });
  },
});

export const computerOpenApp = defineTool({
  name: 'computer_open_app',
  description: 'Open an app by name ("Notepad", "Excel", "Calculator", "Settings"), a website in the default browser ("https://…" or "example.com"), or a file or folder by its full path. Waits for its window and brings it to the front.',
  category: 'computer',
  input: z.object({ name: z.string().min(1).max(500).describe('App name, web address, or full path.') }),
  async approval(args, ctx) {
    return gate(ctx, `open ${args.name}`, null);
  },
  async run(args, ctx) {
    return act(ctx, `Opening ${args.name}`, 300, async (s) => ({ said: await computer.open(s, args.name) }));
  },
});

export const computerWindows = defineTool({
  name: 'computer_windows',
  description: 'List the open windows, or bring one to the front (focus), minimize, maximize, restore or close it. window is its number (1 is the active window) or words from its title or app name.',
  category: 'computer',
  input: z.object({
    action: z.enum(['list', 'focus', 'minimize', 'maximize', 'restore', 'close']).optional().describe('Default: focus when a window is given, list otherwise.'),
    window: z.union([z.coerce.number().int().min(1), z.string().min(1)]).optional(),
  }),
  async approval(args, ctx) {
    const action = args.action ?? (args.window !== undefined ? 'focus' : 'list');
    if (action === 'list') return gate(ctx, 'list the open windows', null);
    return gate(ctx, `${action} window ${typeof args.window === 'number' ? args.window : `“${args.window}”`}`, action === 'close' ? riskOf({ kind: 'close-window' }) : null);
  },
  async run(args, ctx) {
    const action = args.action ?? (args.window !== undefined ? 'focus' : 'list');
    if (action === 'list') {
      return guarded(async () => {
        const s = await computer.begin(owner(ctx));
        computer.status('Listing windows');
        return `Open windows: ${computer.windowList(await computer.listWindows(s))}`;
      });
    }
    if (args.window === undefined) throw new ToolError(`Say which window to ${action}: its number from the list, or words from its title.`);
    return act(ctx, `${action[0].toUpperCase()}${action.slice(1)} window`, 500, async (s) => {
      const w = await computer.findWindow(s, args.window!);
      await computer.windowAction(s, w, action);
      const verb = { focus: 'Switched to', minimize: 'Minimized', maximize: 'Maximized', restore: 'Restored', close: 'Asked to close' }[action];
      return { said: `${verb} "${w.title}" (${w.process}).${action === 'close' ? ' If it asks about unsaved changes, that dialog is on screen now.' : ''}` };
    });
  },
});

export const computerRead = defineTool({
  name: 'computer_read',
  description: 'Read the text in the active window (or another window): the part on screen, or all=true for the whole document or page. More exact and cheaper than reading a screenshot.',
  category: 'computer',
  input: z.object({
    window: z.union([z.coerce.number().int().min(1), z.string().min(1)]).optional().describe('Leave out for the active window. Another window by its number or title words.'),
    all: z.boolean().optional().describe('The whole document, not only what is on screen.'),
  }),
  async approval(_args, ctx) {
    return gate(ctx, 'read the text on the screen', null);
  },
  async run(args, ctx) {
    return guarded(async () => {
      const s = await computer.begin(owner(ctx));
      computer.status('Reading the screen');
      return computer.read(s, args.window, !!args.all, Math.max(2000, Math.min(Math.round(ctx.maxResultChars / 2), 20_000)));
    });
  },
});

export const computerHandOver = defineTool({
  name: 'computer_hand_over',
  description:
    'Hand the mouse and keyboard to the user for something only they should do (sign in, type a password or payment details, a 2FA code, a CAPTCHA, a choice you are unsure of) and wait until they press Done. Say exactly what they should do.',
  category: 'computer',
  input: z.object({ reason: z.string().min(1).max(400).describe('What the user should do, e.g. "Sign in to your bank, then press Done".') }),
  async run(args, ctx) {
    return guarded(async () => {
      const s = await computer.begin(owner(ctx));
      await computer.handOver(s, args.reason);
      return `The user pressed Done.${SCREEN_MARKER}${await look(ctx, s)}`;
    });
  },
});

export const COMPUTER_TOOLS = [
  computerScreenshot,
  computerClick,
  computerType,
  computerKey,
  computerScroll,
  computerDrag,
  computerMove,
  computerOpenApp,
  computerWindows,
  computerRead,
  computerHandOver,
] as AgentTool[];

/** Plan and Ask modes may look, not touch. */
export const COMPUTER_READ_ONLY = new Set(['computer_screenshot', 'computer_read']);
