export interface ParsedViz {
  content: string;
  /** True when the closing fence has not arrived yet (still streaming). */
  open: boolean;
  /** Character offsets of the whole fenced block in the source text. */
  start: number;
  end: number;
}

/**
 * Find fenced code blocks whose info string is `html viz`, e.g.
 * ```html viz
 * <!doctype html>...
 * ```
 */
export function parseVizBlocks(markdown: string): ParsedViz[] {
  const out: ParsedViz[] = [];
  const lines = markdown.split('\n');
  let offset = 0;
  let i = 0;
  const lineStarts: number[] = [];
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  while (i < lines.length) {
    const open = lines[i].match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (!open) {
      i++;
      continue;
    }
    const fence = open[1];
    const isViz = /^\s*html\s+viz\s*$/i.test(open[2] ?? '');
    const close = new RegExp(`^\\s{0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) j++;
    const closed = j < lines.length;
    if (isViz) {
      const content = lines.slice(i + 1, j).join('\n');
      out.push({
        content,
        open: !closed,
        start: lineStarts[i],
        end: closed ? lineStarts[j] + lines[j].length : markdown.length,
      });
    }
    i = closed ? j + 1 : lines.length;
  }
  return out;
}
