/**
 * The built-in browser as tools. These drive the same Chromium tabs the user sees in the browser
 * panel (`main/browser/browser.ts`), so the model works with the user's own logged-in session and
 * the user can watch every page it opens.
 */
import { z } from 'zod';
import { browser, MAX_TABS } from '../../browser/browser';
import { clearDomainSession, loginStatus } from '../../browser/sessions';
import { clip, defineTool, ToolError } from './types';

const tabId = z.string().min(1).optional().describe('Tab to act on. Omit for the tab that is open now.');
const coordinate = () => z.coerce.number().int().min(0).describe('Pixels from the top-left of the browser viewport.');

/** Tab list plus the active page, appended so the model always knows where it is. */
function whereAmI(): string {
  const state = browser.state();
  if (state.tabs.length === 0) return 'No browser tabs are open.';
  return state.tabs
    .map((tab) => `${tab.id === state.activeTabId ? '*' : ' '} [${tab.id.slice(0, 8)}] ${tab.title || '(untitled)'} — ${tab.url || 'blank'}${tab.error ? ` — ${tab.error}` : ''}`)
    .join('\n');
}

const asToolError = async <T>(work: () => Promise<T>): Promise<T> => {
  try {
    return await work();
  } catch (err) {
    throw new ToolError(err instanceof Error ? err.message : String(err));
  }
};

export const browseOpen = defineTool({
  name: 'browse_open',
  description:
    'Open a web page in Cellar\'s built-in browser and show it to the user. The browser shares the app\'s session, so pages the user is signed in to stay signed in. Read the page afterwards with browse_read.',
  category: 'browser',
  input: z.object({
    url: z.string().min(1).describe('The http(s) address to open.'),
    new_tab: z.boolean().optional().describe('Open a new tab instead of reusing the current one (default: reuse).'),
  }),
  async approval(args, ctx) {
    let host = args.url;
    try {
      host = new URL(/^[a-z][a-z0-9+.-]*:/i.test(args.url) ? args.url : `https://${args.url}`).hostname;
    } catch {
      // fall back to the raw text in the prompt
    }
    if (ctx.task.allowedDomains.includes(host)) return null;
    return { kind: 'browser', title: `Open ${host} in the built-in browser`, url: args.url };
  },
  async run(args) {
    browser.reveal();
    const state = browser.state();
    const reuse = !args.new_tab && state.activeTabId ? state.activeTabId : null;
    const tab = await asToolError(() => (reuse ? browser.navigate(args.url, reuse) : browser.open(args.url)));
    if (tab.error) throw new ToolError(tab.error);
    return `Opened ${tab.url}${tab.title ? ` — ${tab.title}` : ''} in tab ${tab.id.slice(0, 8)}.\n\nTabs:\n${whereAmI()}`;
  },
});

export const browseRead = defineTool({
  name: 'browse_read',
  description:
    'Read the page open in the built-in browser: its readable text and the links on it. Use this after browse_open, a click, or a form submission. Prefer this (and browse_get_elements for clickable targets) over browse_screenshot for ordinary text pages — it\'s cheaper and usually all you need. Reach for browse_screenshot only when you actually need to see the visual layout.',
  category: 'browser',
  input: z.object({
    tab_id: tabId,
    max_chars: z.coerce.number().int().min(500).optional().describe('Maximum characters of text to return.'),
  }),
  async run(args, ctx) {
    const page = await asToolError(() => browser.content(args.tab_id));
    const limit = Math.min(args.max_chars ?? ctx.maxResultChars, ctx.maxResultChars);
    ctx.knownUrls.add(page.url);
    for (const link of page.links) ctx.knownUrls.add(link.url);
    ctx.recordSource({ url: page.url, title: page.title || undefined, kind: 'fetch' });
    const links = page.links.length ? `\n\nLinks on this page:\n${page.links.slice(0, 25).map((l) => `- ${l.text}: ${l.url}`).join('\n')}` : '';
    const header = `${page.title ? `# ${page.title}\n` : ''}URL: ${page.url}\n\n`;
    return clip(`${header}${page.text || '(no readable text)'}`, Math.max(500, limit - links.length), 'call browse_read with a larger max_chars for more') + links;
  },
});

export const browseUrl = defineTool({
  name: 'browse_url',
  description: 'The address and title of the page the built-in browser is showing, without reading the whole page.',
  category: 'browser',
  input: z.object({ tab_id: tabId }),
  async run(args) {
    const { url, title } = await asToolError(async () => browser.url(args.tab_id));
    return `${url}${title ? `\n${title}` : ''}`;
  },
});

export const browseBack = defineTool({
  name: 'browse_back',
  description: 'Go back one page in the built-in browser.',
  category: 'browser',
  input: z.object({ tab_id: tabId }),
  async run(args) {
    const tab = await asToolError(() => browser.goBack(args.tab_id));
    return `Back at ${tab.url}${tab.title ? ` — ${tab.title}` : ''}.`;
  },
});

export const browseForward = defineTool({
  name: 'browse_forward',
  description: 'Go forward one page in the built-in browser.',
  category: 'browser',
  input: z.object({ tab_id: tabId }),
  async run(args) {
    const tab = await asToolError(() => browser.goForward(args.tab_id));
    return `Forward at ${tab.url}${tab.title ? ` — ${tab.title}` : ''}.`;
  },
});

export const browseReload = defineTool({
  name: 'browse_reload',
  description: 'Reload the page in the built-in browser.',
  category: 'browser',
  input: z.object({ tab_id: tabId }),
  async run(args) {
    const tab = await asToolError(() => browser.reload(args.tab_id));
    return tab.error ? `Reloaded, but the page reported: ${tab.error}` : `Reloaded ${tab.url}.`;
  },
});

export const browseClick = defineTool({
  name: 'browse_click',
  description: 'Click an element on the page in the built-in browser, found by CSS selector (for example "button.submit" or "a[href*=\'pricing\']"). Read the page first to find the selector.',
  category: 'browser',
  input: z.object({ selector: z.string().min(1).describe('CSS selector for the element to click.'), tab_id: tabId }),
  async run(args) {
    return asToolError(() => browser.click(args.selector, args.tab_id));
  },
});

export const browseFill = defineTool({
  name: 'browse_fill',
  description: 'Type a value into a field on the page in the built-in browser, found by CSS selector. Submit with browse_click on the form\'s button afterwards.',
  category: 'browser',
  input: z.object({
    selector: z.string().min(1).describe('CSS selector for the input, textarea, select or contenteditable element.'),
    value: z.string().describe('The text to put in the field.'),
    tab_id: tabId,
  }),
  async approval(args) {
    return { kind: 'action', title: 'Type into a field in the built-in browser', preview: `${args.selector}\n\n${args.value.slice(0, 2000)}` };
  },
  async run(args) {
    return asToolError(() => browser.fill(args.selector, args.value, args.tab_id));
  },
});

export const browseScroll = defineTool({
  name: 'browse_scroll',
  description:
    'Scroll the page in the built-in browser by a number of pixels (negative scrolls up), using a real mouse-wheel gesture like a human would. Works on custom scrolling feeds (like a video feed), not just ordinary pages.',
  category: 'browser',
  input: z.object({ delta: z.coerce.number().int().describe('Pixels to scroll; negative goes up. About 800 is one screen.'), tab_id: tabId }),
  async run(args) {
    return asToolError(() => browser.scroll(args.delta, args.tab_id));
  },
});

export const browseTabs = defineTool({
  name: 'browse_tabs',
  description: `List the built-in browser's tabs, or switch to and close one. At most ${MAX_TABS} tabs are open at a time.`,
  category: 'browser',
  input: z.object({
    action: z.enum(['list', 'switch', 'close']).optional().describe('What to do (default: list).'),
    tab_id: z.string().min(1).optional().describe('The tab to switch to or close.'),
  }),
  async run(args) {
    const action = args.action ?? 'list';
    if (action !== 'list') {
      if (!args.tab_id) throw new ToolError(`browse_tabs with action "${action}" needs a tab_id.`);
      const full = browser.state().tabs.find((t) => t.id === args.tab_id || t.id.startsWith(args.tab_id!));
      if (!full) throw new ToolError(`There is no browser tab ${args.tab_id}.`);
      await asToolError(async () => (action === 'switch' ? browser.activate(full.id) : browser.close(full.id)));
    }
    return whereAmI();
  },
});

export const browseScreenshot = defineTool({
  name: 'browse_screenshot',
  description:
    'See the page open in the built-in browser: a screenshot plus the clickable elements on it (with their positions), so you can decide what to click without guessing selectors. Use browse_mouse_click with the coordinates of an element this returns. Prefer browse_read or browse_get_elements first for text pages and CSS-selector clicks — reach for this when you need the actual visual layout. If the page hasn\'t changed since your last screenshot, don\'t take another one: use browse_wait if it\'s still loading, or try a different action.',
  category: 'browser',
  input: z.object({ tab_id: tabId }),
  async run(args, ctx) {
    return asToolError(async () => {
      const [shot, elements, summary] = await Promise.all([browser.screenshot(args.tab_id), browser.elements(args.tab_id), browser.pageSummary(args.tab_id)]);
      await ctx.recordResultImages?.([{ mime: 'image/png', base64: shot.base64 }]);
      const list = elements.length
        ? elements.map((el) => `- ${el.type} "${el.text || '(no text)'}" at (${el.x + Math.round(el.width / 2)}, ${el.y + Math.round(el.height / 2)}) [${el.width}x${el.height}]`).join('\n')
        : '(no clickable elements visible)';
      return `${summary.title || '(untitled)'}${summary.heading ? ` — ${summary.heading}` : ''}\nScreenshot: ${shot.width}x${shot.height}px\n\nClickable elements (coordinates are the center of each, for browse_mouse_click):\n${list}`;
    });
  },
});

export const browseElements = defineTool({
  name: 'browse_get_elements',
  description: 'List the clickable/interactive elements on the page in the built-in browser (buttons, links, inputs, images) with their type, visible text, and position, without taking a screenshot.',
  category: 'browser',
  input: z.object({ tab_id: tabId }),
  async run(args) {
    const elements = await asToolError(() => browser.elements(args.tab_id));
    if (!elements.length) return '(no clickable elements visible)';
    return elements.map((el) => `- ${el.type} "${el.text || '(no text)'}" at (${el.x}, ${el.y}), size ${el.width}x${el.height}`).join('\n');
  },
});

export const browseMouseMove = defineTool({
  name: 'browse_mouse_move',
  description: "Move the mouse cursor in the built-in browser to (x, y), relative to the browser viewport's top-left corner. Briefly shows a cursor dot on the page.",
  category: 'browser',
  input: z.object({ x: coordinate(), y: coordinate(), tab_id: tabId }),
  async run(args) {
    await asToolError(() => browser.mouseMove(args.x, args.y, args.tab_id));
    return `Moved the mouse to (${args.x}, ${args.y}).`;
  },
});

export const browseMouseClick = defineTool({
  name: 'browse_mouse_click',
  description: 'Click at (x, y) in the built-in browser, relative to the browser viewport. Use this to click something you saw with browse_screenshot when it has no good CSS selector.',
  category: 'browser',
  input: z.object({ x: coordinate(), y: coordinate(), button: z.enum(['left', 'right', 'middle']).optional().describe('Default: left.'), tab_id: tabId }),
  async run(args) {
    await asToolError(() => browser.mouseClick(args.x, args.y, args.button ?? 'left', args.tab_id));
    return `Clicked (${args.x}, ${args.y}) with the ${args.button ?? 'left'} button.`;
  },
});

export const browseMouseDoubleClick = defineTool({
  name: 'browse_mouse_double_click',
  description: 'Double-click at (x, y) in the built-in browser, relative to the browser viewport.',
  category: 'browser',
  input: z.object({ x: coordinate(), y: coordinate(), tab_id: tabId }),
  async run(args) {
    await asToolError(() => browser.mouseDoubleClick(args.x, args.y, args.tab_id));
    return `Double-clicked (${args.x}, ${args.y}).`;
  },
});

export const browseMouseRightClick = defineTool({
  name: 'browse_mouse_right_click',
  description: 'Right-click at (x, y) in the built-in browser, relative to the browser viewport. Reports the link, image or selected text the page\'s context menu would have targeted, if any.',
  category: 'browser',
  input: z.object({ x: coordinate(), y: coordinate(), tab_id: tabId }),
  async run(args) {
    const params = await asToolError(() => browser.mouseRightClick(args.x, args.y, args.tab_id));
    if (!params) return `Right-clicked (${args.x}, ${args.y}).`;
    const bits = [params.linkURL && `link: ${params.linkURL}`, params.srcURL && `media: ${params.srcURL}`, params.selectionText && `selection: "${params.selectionText.slice(0, 200)}"`].filter(Boolean);
    return bits.length ? `Right-clicked (${args.x}, ${args.y}) — ${bits.join(', ')}.` : `Right-clicked (${args.x}, ${args.y}).`;
  },
});

export const browseNavigateTo = defineTool({
  name: 'browse_navigate_to',
  description: 'Fill a field and submit it in one step (for example, type a search query and press enter, or type a URL into an address-style field). Finds the field by CSS selector.',
  category: 'browser',
  input: z.object({ selector: z.string().min(1).describe('CSS selector for the input or textarea.'), value: z.string().describe('The text to type before submitting.'), tab_id: tabId }),
  async approval(args) {
    return { kind: 'action', title: 'Type into a field and submit it in the built-in browser', preview: `${args.selector}\n\n${args.value.slice(0, 2000)}` };
  },
  async run(args) {
    return asToolError(() => browser.submit(args.selector, args.value, args.tab_id));
  },
});

export const browseFindLink = defineTool({
  name: 'browse_find_link',
  description: 'Find a link on the page by its visible text (a partial, case-insensitive match) and click it. Returns the URL it navigated to.',
  category: 'browser',
  input: z.object({ text: z.string().min(1).describe('Visible text of the link to find.'), tab_id: tabId }),
  async run(args) {
    return asToolError(() => browser.clickLinkByText(args.text, args.tab_id));
  },
});

export const browseWait = defineTool({
  name: 'browse_wait',
  description: 'Wait before the next browser action — useful for a page still loading or an animation still running.',
  category: 'browser',
  input: z.object({ ms: z.coerce.number().int().min(0).max(30_000).describe('Milliseconds to wait, up to 30000.') }),
  async run(args) {
    await new Promise((resolve) => setTimeout(resolve, args.ms));
    return `Waited ${args.ms}ms.`;
  },
});

export const browseScreenshotArea = defineTool({
  name: 'browse_screenshot_area',
  description: 'Screenshot just one region of the built-in browser (useful for a close look at one element), given as (x, y, width, height) relative to the browser viewport.',
  category: 'browser',
  input: z.object({ x: coordinate(), y: coordinate(), width: z.coerce.number().int().min(1), height: z.coerce.number().int().min(1), tab_id: tabId }),
  async run(args, ctx) {
    const shot = await asToolError(() => browser.screenshot(args.tab_id, { x: args.x, y: args.y, width: args.width, height: args.height }));
    await ctx.recordResultImages?.([{ mime: 'image/png', base64: shot.base64 }]);
    return `Screenshot of (${args.x}, ${args.y}, ${args.width}x${args.height}): ${shot.width}x${shot.height}px.`;
  },
});

export const browseLoginStatus = defineTool({
  name: 'browse_login_status',
  description: 'Check whether the built-in browser\'s shared session currently looks signed in to a domain (for example "gmail.com"), based on its saved cookies.',
  category: 'browser',
  input: z.object({ domain: z.string().min(1).describe('Domain to check, e.g. "github.com".') }),
  async run(args) {
    const status = await asToolError(() => loginStatus(args.domain));
    return `${args.domain}: ${status}`;
  },
});

export const browseClearSession = defineTool({
  name: 'browse_clear_session',
  description: 'Sign the built-in browser out of a domain: clears its cookies from the live session and from the saved session file, so the next visit starts logged out.',
  category: 'browser',
  input: z.object({ domain: z.string().min(1).describe('Domain to clear, e.g. "github.com".') }),
  async approval(args) {
    return { kind: 'action', title: `Sign the built-in browser out of ${args.domain}` };
  },
  async run(args) {
    await asToolError(() => clearDomainSession(args.domain));
    return `Cleared the session for ${args.domain}.`;
  },
});

export const BROWSER_TOOLS = [
  browseOpen,
  browseRead,
  browseUrl,
  browseBack,
  browseForward,
  browseReload,
  browseClick,
  browseFill,
  browseScroll,
  browseTabs,
  browseScreenshot,
  browseElements,
  browseMouseMove,
  browseMouseClick,
  browseMouseDoubleClick,
  browseMouseRightClick,
  browseNavigateTo,
  browseFindLink,
  browseWait,
  browseScreenshotArea,
  browseLoginStatus,
  browseClearSession,
];
