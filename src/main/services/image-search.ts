import { fetchWithTimeout } from '../lib/util';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

export interface ImageResult {
  url: string;
  width?: number;
  height?: number;
}

interface DuckDuckGoImage {
  image?: string;
  width?: number;
  height?: number;
}

/** DuckDuckGo's image search needs a per-query `vqd` token, minted from the HTML search page. */
async function fetchVqd(query: string, signal?: AbortSignal): Promise<string | null> {
  const res = await fetchWithTimeout(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
    timeoutMs: 10_000,
    signal,
  });
  if (!res.ok) return null;
  const html = await res.text();
  return html.match(/vqd=['"]([\d-]+)['"]/)?.[1] ?? html.match(/vqd=([\d-]+)&/)?.[1] ?? null;
}

/** No API key: scrapes DuckDuckGo's image search the same way web_search scrapes its HTML search. Best-effort — any failure returns null. */
export async function searchImage(query: string, signal?: AbortSignal): Promise<ImageResult | null> {
  const trimmed = query.trim().slice(0, 200);
  if (!trimmed) return null;
  try {
    const vqd = await fetchVqd(trimmed, signal);
    if (!vqd) return null;
    const res = await fetchWithTimeout(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(trimmed)}&vqd=${vqd}&f=,,,,,&p=1`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9', Referer: 'https://duckduckgo.com/', Accept: 'application/json' },
      timeoutMs: 10_000,
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: DuckDuckGoImage[] };
    const first = data.results?.find((r) => r.image);
    if (!first?.image) return null;
    return { url: first.image, width: first.width, height: first.height };
  } catch {
    return null;
  }
}
