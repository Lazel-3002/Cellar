/**
 * The built-in browser as tools. These drive the same Chromium tabs the user sees in the browser
 * panel (`main/browser/browser.ts`), so the model works with the user's own logged-in session and
 * the user can watch every page it opens.
 */
import { z } from 'zod';
import { browser, MAX_TABS } from '../../browser/browser';
import { clip, defineTool, ToolError } from './types';

const tabId = z.string().min(1).optional().describe('Tab to act on. Omit for the tab that is open now.');

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
    return { kind: 'web', title: `Open ${host} in the built-in browser`, url: args.url };
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
  description: 'Read the page open in the built-in browser: its readable text and the links on it. Use this after browse_open, a click, or a form submission.',
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
    return { kind: 'web', title: 'Type into a field in the built-in browser', preview: `${args.selector}\n\n${args.value.slice(0, 2000)}` };
  },
  async run(args) {
    return asToolError(() => browser.fill(args.selector, args.value, args.tab_id));
  },
});

export const browseScroll = defineTool({
  name: 'browse_scroll',
  description: 'Scroll the page in the built-in browser by a number of pixels (negative scrolls up).',
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

export const BROWSER_TOOLS = [browseOpen, browseRead, browseUrl, browseBack, browseForward, browseReload, browseClick, browseFill, browseScroll, browseTabs];
