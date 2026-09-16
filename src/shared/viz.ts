import { normalizeChart } from './design/charts';
import type { ChartSpec } from './types/design';

/**
 * The three things a model can draw straight into a reply:
 *
 * - `chart` — a small JSON spec that Cellar renders itself (no model-written drawing code, so it
 *   cannot come out broken; this is the one small local models can actually hit every time).
 * - `svg`   — a plain SVG element, sanitized and mounted directly in the message DOM, so it picks
 *   up the chat's own font and colors and stays crisp at any zoom.
 * - `html`  — an HTML fragment with scripts, for things that have to react to the user. Only this
 *   one needs the sandboxed frame.
 */
export type VizKind = 'chart' | 'svg' | 'html';

export interface ParsedViz {
  kind: VizKind;
  content: string;
  /** True when the closing fence has not arrived yet (still streaming). */
  open: boolean;
  /** Character offsets of the whole fenced block in the source text. */
  start: number;
  end: number;
}

/**
 * Which kind of visualization an info string asks for, if any.
 *
 * `html viz` and `svg viz` are marked, because plain ```html / ```svg fences have to keep working
 * as code. A ```chart fence needs no marker — nothing else writes one — but `chart viz` is
 * accepted too, since a model that has just read about `viz` blocks tends to tack it on.
 * Anything after the marker (a `title="…"` attribute copied from the artifact convention) is
 * ignored rather than treated as a mismatch.
 */
export function vizKindOf(info: string): VizKind | null {
  const tokens = info.trim().split(/\s+/).filter(Boolean);
  const lang = (tokens[0] ?? '').toLowerCase();
  const marked = tokens.slice(1).some((t) => t.toLowerCase() === 'viz');
  if (lang === 'chart') return 'chart';
  if (!marked) return null;
  if (lang === 'svg') return 'svg';
  if (lang === 'html') return 'html';
  return null;
}

/** Find the fenced code blocks that render as visualizations instead of as code. */
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
    const kind = vizKindOf(open[2] ?? '');
    const close = new RegExp(`^\\s{0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) j++;
    const closed = j < lines.length;
    if (kind) {
      const content = lines.slice(i + 1, j).join('\n');
      out.push({
        kind,
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

/**
 * JSON as models actually write it: with `//` comments, trailing commas, or a sentence around the
 * object. Everything here is a repair a strict parser would reject but a reader would not blink at.
 */
function tolerantJson(text: string): unknown {
  const attempts: string[] = [];
  const trimmed = text.trim();
  attempts.push(trimmed);
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start > 0 || (end >= 0 && end < trimmed.length - 1)) attempts.push(trimmed.slice(Math.max(0, start), end + 1));
  for (const candidate of [...attempts]) {
    attempts.push(
      candidate
        .replace(/^\s*\/\/[^\n]*$/gm, '')
        .replace(/,(\s*[}\]])/g, '$1')
        .trim(),
    );
  }
  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next repair
    }
  }
  return null;
}

/** Height of a chart block in CSS pixels, if the model asked for one. */
export interface ChatChartSpec extends ChartSpec {
  height?: number;
}

/** A ```chart block's JSON as a drawable spec, or null when there is nothing to draw yet. */
export function parseChartSpec(text: string): ChatChartSpec | null {
  const raw = tolerantJson(text);
  if (!raw || typeof raw !== 'object') return null;
  const spec = normalizeChart(raw) as ChatChartSpec;
  if (spec.series.length === 0 || spec.labels.length === 0) return null;
  const height = Number((raw as Record<string, unknown>).height);
  if (Number.isFinite(height)) spec.height = Math.min(600, Math.max(140, Math.round(height)));
  return spec;
}

/** A file name a person would recognize a week later. */
export function vizFileName(title: string | undefined, extension: string): string {
  const base =
    (title ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'visualization';
  return `${base}.${extension}`;
}
