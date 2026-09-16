export interface ParsedImageTag {
  query: string;
  start: number;
  end: number;
}

const IMAGE_TAG = /\[\[\s*image\s*:\s*([^\]\n]{1,200}?)\s*\]\]\s*/gi;

/** Every `[[image: query]]` tag in the text, in order. */
export function parseImageTags(text: string): ParsedImageTag[] {
  const out: ParsedImageTag[] = [];
  for (const m of text.matchAll(IMAGE_TAG)) {
    const query = m[1]?.trim();
    if (query) out.push({ query, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** A trailing, unclosed `[[image: ...` fragment left once the message is no longer streaming. */
const BROKEN_TAG = /\[\[\s*image\s*:[^\]\n]*$/i;

/**
 * Replace the first `max` tags with `render(query)`, drop the rest, and (once the message is
 * final) strip any unclosed fragment so raw tag syntax never reaches the user.
 */
export function withImageTags(text: string, render: (query: string, index: number) => string, opts: { max: number; streaming: boolean }): string {
  const tags = parseImageTags(text);
  let out = '';
  let cursor = 0;
  tags.forEach((tag, index) => {
    out += text.slice(cursor, tag.start);
    out += index < opts.max ? render(tag.query, index) : '';
    cursor = tag.end;
  });
  out += text.slice(cursor);
  if (!opts.streaming) out = out.replace(BROKEN_TAG, '');
  return out;
}
