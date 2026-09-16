const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
  middot: '·',
  bull: '•',
  laquo: '«',
  raquo: '»',
  euro: '€',
  times: '×',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const stripTags = (html: string) => decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

export interface PageText {
  title: string;
  text: string;
  links: Array<{ url: string; text: string }>;
}

function absoluteUrl(href: string, base?: string): string | null {
  try {
    const url = new URL(decodeEntities(href), base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

/** Readable text from an HTML page: headings, paragraphs and list items, without scripts, styles or chrome. */
export function htmlToText(html: string, baseUrl?: string): PageText {
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  let body = html;
  const main = html.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i);
  if (main && stripTags(main[2]).length > 400) body = main[2];
  else body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;

  body = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|head|nav|footer|aside|form|button|select)\b[\s\S]*?<\/\1>/gi, ' ');

  const links: PageText['links'] = [];
  const seen = new Set<string>();
  body = body.replace(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_m, _q, href: string, inner: string) => {
    const text = stripTags(inner);
    const url = absoluteUrl(href, baseUrl);
    if (url && text && !seen.has(url) && links.length < 60) {
      seen.add(url);
      links.push({ url, text: text.slice(0, 120) });
    }
    return inner;
  });

  const text = decodeEntities(
    body
      .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, inner: string) => `\n\n${'#'.repeat(Number(level))} ${stripTags(inner)}\n\n`)
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<(br|hr)\b[^>]*>/gi, '\n')
      .replace(/<\/(p|div|section|article|header|ul|ol|table|tr|blockquote|pre|h[1-6]|dl|dt|dd|figure|figcaption)>/gi, '\n')
      .replace(/<(td|th)\b[^>]*>/gi, ' | ')
      .replace(/<[^>]*>/g, ''),
  )
    .split(String.fromCharCode(160))
    .join(' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text, links };
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Which engine produced this result. Set by the caller in web.ts, not by these parsers. */
  source?: string;
}

/**
 * Snippet text near a result, tolerant of HTML a response cut off mid-tag: falls back to the
 * next result block or a length cap instead of requiring a matching closing tag.
 */
function snippetNear(html: string, from: number, boundary: number): string {
  const idx = html.indexOf('class="result__snippet"', from);
  if (idx === -1 || idx >= boundary) return '';
  const tagStart = html.lastIndexOf('<', idx);
  const openEnd = html.indexOf('>', idx);
  if (tagStart === -1 || openEnd === -1) return '';
  // Look for the tag's own close (e.g. "</a"), not the first "</" — content can nest <b>/<span> etc.
  const tagName = html.slice(tagStart + 1, idx).match(/^([a-zA-Z]+)/)?.[1] ?? 'a';
  const candidates = [html.indexOf(`</${tagName}`, openEnd), html.indexOf('<div class="result', openEnd), boundary].filter((i) => i !== -1 && i > openEnd);
  const end = Math.min(openEnd + 2000, candidates.length ? Math.min(...candidates) : openEnd + 2000);
  return stripTags(html.slice(openEnd + 1, end));
}

/** Results from html.duckduckgo.com (the lite endpoint rejects automated requests). */
export function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const anchors = [...html.matchAll(/<a\b([^>]*class="result__a"[^>]*)>([\s\S]*?)<\/a>/g)];
  const results: SearchResult[] = [];
  anchors.forEach((match, i) => {
    const start = match.index ?? 0;
    const end = anchors[i + 1]?.index ?? html.length;
    const href = decodeEntities(match[1].match(/href="([^"]*)"/)?.[1] ?? '');
    const title = stripTags(match[2]);
    let url = href.startsWith('//') ? `https:${href}` : href;
    try {
      const target = new URL(url).searchParams.get('uddg');
      if (target) url = target;
    } catch {
      return;
    }
    // Sponsored results point back at duckduckgo.com/y.js.
    if (!/^https?:\/\//i.test(url) || /duckduckgo\.com\/y\.js/.test(url) || !title) return;
    results.push({ title, url, snippet: snippetNear(html, start, end) });
  });
  return results;
}

/** Web results from search.brave.com (server-rendered `data-type="web"` snippets). */
export function parseBraveHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.split(/<div\b[^>]*data-type="web"[^>]*>/).slice(1);
  for (const block of blocks) {
    const href = block.match(/<a\b[^>]*href="(https?:\/\/[^"]+)"/)?.[1];
    if (!href) continue;
    const url = decodeEntities(href);
    if (/^https?:\/\/([^/]+\.)?(brave\.com|search\.brave\.com)\//i.test(url)) continue;
    // Class names must start with the word: "result-content" and "site-name-content" are other elements.
    const titleTag = block.match(/<div\b[^>]*class="title\b[^"]*"[^>]*?(?:title="([^"]*)")?[^>]*>([\s\S]*?)<\/div>/);
    const title = decodeEntities(titleTag?.[1] ?? '') || stripTags(titleTag?.[2] ?? '');
    // A well-formed page closes "content" on the next </div>; a truncated or nested-div response
    // can lack that close, so fall back to a length-capped raw grab rather than an empty snippet.
    const content = block.match(/<div\b[^>]*class="content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? block.match(/<div\b[^>]*class="content\b[^"]*"[^>]*>([\s\S]{0,800})/)?.[1] ?? '';
    const snippet = stripTags(content.replace(/<span\b[^>]*class="[^"]*t-secondary[^"]*"[^>]*>[\s\S]*?<\/span>/, ''));
    if (title && !results.some((r) => r.url === url)) results.push({ title, url, snippet });
  }
  return results;
}

export function parseSearxngJson(json: unknown): SearchResult[] {
  const list = (json as { results?: Array<{ title?: string; url?: string; content?: string }> })?.results ?? [];
  return list
    .filter((r) => typeof r.url === 'string' && /^https?:\/\//i.test(r.url))
    .map((r) => ({ title: (r.title ?? r.url ?? '').trim(), url: r.url!, snippet: (r.content ?? '').trim() }));
}
