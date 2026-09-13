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
}

/** Results from html.duckduckgo.com (the lite endpoint rejects automated requests). */
export function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const anchors = [...html.matchAll(/<a\b([^>]*class="result__a"[^>]*)>([\s\S]*?)<\/a>/g)];
  const snippets = [...html.matchAll(/<(?:a|div|td)\b[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/g)];
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
    const snippet = snippets.find((s) => (s.index ?? 0) > start && (s.index ?? 0) < end);
    results.push({ title, url, snippet: snippet ? stripTags(snippet[1]) : '' });
  });
  return results;
}

export function parseSearxngJson(json: unknown): SearchResult[] {
  const list = (json as { results?: Array<{ title?: string; url?: string; content?: string }> })?.results ?? [];
  return list
    .filter((r) => typeof r.url === 'string' && /^https?:\/\//i.test(r.url))
    .map((r) => ({ title: (r.title ?? r.url ?? '').trim(), url: r.url!, snippet: (r.content ?? '').trim() }));
}
