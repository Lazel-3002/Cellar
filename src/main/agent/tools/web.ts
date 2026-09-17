import { isIP } from 'node:net';
import { z } from 'zod';
import { extractPdfText } from '../../chat/attachments';
import { fetchWithTimeout, sleep } from '../../lib/util';
import { htmlToText, parseBraveHtml, parseDuckDuckGoHtml, parseSearxngJson, type SearchResult } from '../html';
import { clip, defineTool, ToolError, type ToolContext } from './types';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const MAX_DOWNLOAD = 10 * 1024 * 1024;

/** 1s, 2s, 4s: three retries for transient network errors and 5xx before giving up. */
const SEARCH_BACKOFF_MS = [1000, 2000, 4000];
/** A 429 means "slow down", not "broken" — wait longer than a plain retry, honoring Retry-After if the server sent one. */
const RATE_LIMIT_DELAY_MS = 8000;
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;

const searchCache = new Map<string, { at: number; results: SearchResult[] }>();

const SOURCE_LABELS: Record<string, string> = { duckduckgo: 'DuckDuckGo', brave: 'Brave Search', searxng: 'SearXNG' };

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

function withSource(results: SearchResult[], source: string): SearchResult[] {
  return results.map((r) => ({ ...r, source }));
}

interface FetchRetryingOptions {
  signal: AbortSignal;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Used in the error message and to log which provider was retried. */
  label: string;
  /**
   * Some providers answer HTTP 200 with a page that actually means "blocked" (DuckDuckGo's
   * anomaly/challenge page). Return a retry reason to treat that response as retryable too.
   */
  shouldRetryBody?: (text: string, res: Response) => string | null;
}

/** Fetches with exponential backoff for network errors and 5xx, and a longer wait on HTTP 429. */
async function fetchRetrying(url: string, opts: FetchRetryingOptions): Promise<{ res: Response; text: string }> {
  const { signal, headers, timeoutMs = 15_000, label, shouldRetryBody } = opts;
  let lastReason = `${label} is temporarily unavailable.`;
  for (let attempt = 0; attempt <= SEARCH_BACKOFF_MS.length; attempt++) {
    const isLastAttempt = attempt === SEARCH_BACKOFF_MS.length;
    let res: Response;
    try {
      res = await fetchWithTimeout(url, { headers, timeoutMs, signal });
    } catch (err) {
      if (signal.aborted || isLastAttempt) throw err;
      await sleep(SEARCH_BACKOFF_MS[attempt], signal);
      continue;
    }
    if (res.status === 429) {
      lastReason = `${label} is rate-limiting automated requests.`;
      if (isLastAttempt) break;
      await sleep(retryAfterMs(res.headers.get('retry-after')) ?? RATE_LIMIT_DELAY_MS, signal);
      continue;
    }
    if (res.status >= 500) {
      lastReason = `${label} returned HTTP ${res.status}.`;
      if (isLastAttempt) break;
      await sleep(SEARCH_BACKOFF_MS[attempt], signal);
      continue;
    }
    const text = await res.text();
    const blocked = res.ok ? shouldRetryBody?.(text, res) : null;
    if (blocked) {
      lastReason = blocked;
      if (isLastAttempt) break;
      await sleep(SEARCH_BACKOFF_MS[attempt], signal);
      continue;
    }
    return { res, text };
  }
  throw new ToolError(`${lastReason} Wait a minute and try again, or set up SearXNG in Settings → Cowork.`);
}

/** Coalesces repeat queries within an hour so we don't re-scrape the same search. */
async function cachedSearch(provider: string, query: string, run: () => Promise<SearchResult[]>): Promise<SearchResult[]> {
  const key = `${provider}:${query.trim().toLowerCase()}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_CACHE_TTL_MS) return hit.results;
  const results = await run();
  if (results.length) searchCache.set(key, { at: Date.now(), results });
  return results;
}

/** One retry for connection resets and similar blips; HTTP errors and cancellation are not retried. */
async function fetchOnceMore(url: string, init: Parameters<typeof fetchWithTimeout>[1] & { signal: AbortSignal }): Promise<Response> {
  try {
    return await fetchWithTimeout(url, init);
  } catch (err) {
    if (init.signal.aborted) throw err;
    await new Promise((resolve) => setTimeout(resolve, 800));
    return fetchWithTimeout(url, init);
  }
}

/** Canonical form used to recognise URLs the model saw in search results or the user's messages. */
export function canonicalUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function extractUrls(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const url = canonicalUrl(match[0].replace(/[.,;:!?]+$/, ''));
    if (url) out.push(url);
  }
  return out;
}

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return true;
  const version = isIP(host);
  if (version === 4) {
    const [a, b] = host.split('.').map(Number);
    return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (version === 6) {
    if (host === '::1' || host === '::') return true;
    if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return true;
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateHost(mapped[1]) : false;
  }
  return false;
}

async function searchDuckDuckGo(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const { res, text } = await fetchRetrying(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    signal,
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' },
    label: 'DuckDuckGo',
    shouldRetryBody: (html, r) => (r.status === 202 || /anomaly|challenge-form/i.test(html.slice(0, 5000)) ? 'DuckDuckGo is temporarily refusing automated searches.' : null),
  });
  if (!res.ok) throw new ToolError(`DuckDuckGo returned HTTP ${res.status}.`);
  return withSource(parseDuckDuckGoHtml(text), 'duckduckgo');
}

async function searchBrave(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const { res, text } = await fetchRetrying(`https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`, {
    signal,
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' },
    label: 'Brave Search',
  });
  if (!res.ok) throw new ToolError(`Brave Search returned HTTP ${res.status}.`);
  return withSource(parseBraveHtml(text), 'brave');
}

/** DuckDuckGo first; when it refuses or finds nothing, Brave Search. */
async function searchWithFallback(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  let first: unknown;
  try {
    const results = await searchDuckDuckGo(query, signal);
    if (results.length) return results;
  } catch (err) {
    if (signal.aborted) throw err;
    first = err;
  }
  try {
    const results = await searchBrave(query, signal);
    if (results.length || !first) return results;
  } catch (err) {
    if (signal.aborted || !first) throw err;
  }
  throw first;
}

async function searchSearxng(base: string, query: string, signal: AbortSignal): Promise<SearchResult[]> {
  if (!base) throw new ToolError('SearXNG is selected but no server URL is set. Add it in Settings → Cowork.');
  const { res, text } = await fetchRetrying(`${base.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&format=json`, {
    signal,
    headers: { Accept: 'application/json' },
    label: 'SearXNG',
  });
  if (res.status === 403) throw new ToolError('The SearXNG server does not allow JSON results. Add "json" to search.formats in its settings.yml.');
  if (!res.ok) throw new ToolError(`SearXNG returned HTTP ${res.status}.`);
  return withSource(parseSearxngJson(JSON.parse(text)), 'searxng');
}

export const webSearch = defineTool({
  name: 'web_search',
  description: 'Search the web. Returns titles, URLs and snippets; open a result with web_fetch for its full text.',
  category: 'web',
  input: z.object({
    query: z.string().min(1).describe('Search query.'),
    max_results: z.coerce.number().int().min(1).max(10).optional().describe('Number of results (default 6).'),
  }),
  async run(args, ctx) {
    const provider = ctx.settings.webSearchProvider;
    const found = await cachedSearch(provider, args.query, () =>
      provider === 'searxng'
        ? searchSearxng(ctx.settings.searxngUrl, args.query, ctx.signal)
        : provider === 'brave'
          ? searchBrave(args.query, ctx.signal)
          : searchWithFallback(args.query, ctx.signal),
    );
    const results = found.slice(0, args.max_results ?? 6);
    if (results.length === 0) return `No results for "${args.query}".`;
    for (const r of results) {
      const url = canonicalUrl(r.url);
      if (!url) continue;
      ctx.knownUrls.add(url);
      ctx.recordSource({ url, title: r.title, kind: 'search', query: args.query, provider: r.source });
    }
    return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}${r.snippet ? `\n   ${r.snippet}` : ''}\n   Source: ${SOURCE_LABELS[r.source ?? ''] ?? r.source ?? provider}`).join('\n');
  },
});

export function checkedUrl(raw: string): URL {
  const canonical = canonicalUrl(raw);
  if (!canonical) throw new ToolError(`${raw} is not a valid http(s) URL.`);
  const url = new URL(canonical);
  if (isPrivateHost(url.hostname)) throw new ToolError(`${url.hostname} is a local or private address. web_fetch only opens public websites.`);
  return url;
}

export async function download(url: URL, ctx: ToolContext): Promise<{ finalUrl: URL; contentType: string; body: Buffer }> {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetchOnceMore(current.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,text/plain,application/json,application/pdf;q=0.9,*/*;q=0.5', 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'manual',
      timeoutMs: 25_000,
      signal: ctx.signal,
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = checkedUrl(new URL(res.headers.get('location')!, current).toString());
      continue;
    }
    if (!res.ok) throw new ToolError(`${current.hostname} returned HTTP ${res.status}.`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_DOWNLOAD) throw new ToolError(`The page is ${Math.round(declared / 1048576)} MB, too large to read.`);
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_DOWNLOAD) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    return { finalUrl: current, contentType: res.headers.get('content-type') ?? '', body: Buffer.concat(chunks) };
  }
  throw new ToolError('Too many redirects.');
}

export const webFetch = defineTool({
  name: 'web_fetch',
  description: 'Open a public web page (or PDF) and return its readable text plus the links it contains.',
  category: 'web',
  input: z.object({
    url: z.string().min(1).describe('The http(s) URL to open.'),
    max_chars: z.coerce.number().int().min(500).optional().describe('Maximum characters of text to return.'),
  }),
  async approval(args, ctx) {
    const url = checkedUrl(args.url);
    if (ctx.knownUrls.has(url.toString()) || ctx.task.allowedDomains.includes(url.hostname)) return null;
    return { kind: 'web', title: `Open a page on ${url.hostname}`, url: url.toString() };
  },
  async run(args, ctx) {
    const url = checkedUrl(args.url);
    const { finalUrl, contentType, body } = await download(url, ctx);
    const limit = Math.min(args.max_chars ?? ctx.maxResultChars, ctx.maxResultChars);
    let title = '';
    let text: string;
    let links: Array<{ url: string; text: string }> = [];
    if (/pdf/i.test(contentType) || body.subarray(0, 5).toString('latin1') === '%PDF-') {
      text = await extractPdfText(body);
    } else if (/html|xhtml/i.test(contentType) || /^\s*<(!doctype html|html)/i.test(body.subarray(0, 200).toString('utf8'))) {
      const page = htmlToText(body.toString('utf8'), finalUrl.toString());
      title = page.title;
      text = page.text;
      links = page.links;
    } else if (/^text\/|json|xml|javascript|csv|markdown/i.test(contentType) || !contentType) {
      text = body.toString('utf8');
    } else {
      throw new ToolError(`web_fetch cannot read ${contentType} content.`);
    }
    ctx.recordSource({ url: finalUrl.toString(), title: title || undefined, kind: 'fetch' });
    for (const link of links) ctx.knownUrls.add(link.url);
    const linkBlock = links.length ? `\n\nLinks on this page:\n${links.slice(0, 25).map((l) => `- ${l.text}: ${l.url}`).join('\n')}` : '';
    const header = `${title ? `# ${title}\n` : ''}URL: ${finalUrl.toString()}\n\n`;
    return clip(`${header}${text || '(no readable text)'}`, Math.max(500, limit - linkBlock.length), 'call web_fetch with a larger max_chars for more') + linkBlock;
  },
});
