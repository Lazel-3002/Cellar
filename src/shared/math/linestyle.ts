/**
 * How lines look on the board — colour, thickness, dashes, dots, transparency and the scribbled
 * zigzag used in a notebook to highlight a segment (tan α on the tangent axis). Shared by the
 * whiteboard, the step-by-step diagrams and the exporters, so a line prints the way it looks.
 */
import type { DiagramWeight, LineStyle } from '../types/math';

export interface Pt {
  x: number;
  y: number;
}

export const LINE_STYLES: LineStyle[] = ['solid', 'dashed', 'dotted', 'dashdot', 'zigzag', 'wavy'];

/** Colours a model can ask for by name. They read on white paper and on the dark theme alike. */
export const NAMED_COLORS: Record<string, string> = {
  red: '#d64545',
  orange: '#d97757',
  yellow: '#d9a13c',
  amber: '#d9a13c',
  gold: '#d9a13c',
  green: '#3f9e63',
  teal: '#2a9d99',
  cyan: '#2a9d99',
  blue: '#3f7fd0',
  navy: '#2f5ea8',
  purple: '#9b59d0',
  violet: '#9b59d0',
  pink: '#d3589a',
  magenta: '#d3589a',
  brown: '#9a6a3e',
  gray: '#8a8984',
  grey: '#8a8984',
};

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * A colour safe to put in an SVG attribute: a known name, #hex, or the text colour. Anything else
 * (including anything that could break out of the attribute) falls back to the text colour.
 */
export function resolveColor(value: unknown, fallback = 'currentColor'): string {
  if (typeof value !== 'string') return fallback;
  const text = value.trim().toLowerCase();
  if (!text) return fallback;
  if (text === 'black' || text === 'default' || text === 'currentcolor' || text === 'ink' || text === 'white') return 'currentColor';
  if (NAMED_COLORS[text]) return NAMED_COLORS[text];
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/.test(text)) return text;
  return fallback;
}

const WEIGHTS: Record<DiagramWeight, number> = { thin: 1, normal: 1.8, bold: 3.2, thick: 4.6 };

/** Stroke width in pixels from a word or a number. */
export function weightOf(value: unknown, fallback = WEIGHTS.normal): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.min(12, Math.max(0.5, value));
  if (typeof value === 'string') {
    const word = value.trim().toLowerCase();
    if (word in WEIGHTS) return WEIGHTS[word as DiagramWeight];
    if (word === 'heavy' || word === 'thicker') return WEIGHTS.thick;
    if (word === 'light' || word === 'hairline') return WEIGHTS.thin;
    const number = Number(word);
    if (Number.isFinite(number)) return weightOf(number, fallback);
  }
  return fallback;
}

/** Reads the many ways a line style gets written ("dash", "dotted line", "sketched", "- -"). */
export function lineStyleOf(value: unknown): LineStyle | undefined {
  if (typeof value !== 'string') return undefined;
  const word = value.trim().toLowerCase().replace(/[\s_-]+(line)?$/, '');
  if (!word) return undefined;
  if (/^(solid|normal|plain|straight|continuous)$/.test(word)) return 'solid';
  if (/^(dash(ed)?|broken|- -|--)$/.test(word)) return 'dashed';
  if (/^(dot(s|ted)?|\.\.+|dot[\s-]?dot)$/.test(word)) return 'dotted';
  if (/^(dash[\s-]?dot(ted)?|dot[\s-]?dash(ed)?|center)$/.test(word)) return 'dashdot';
  if (/^(zig[\s-]?zag|sketch(ed|y)?|scribble(d)?|hatch(ed)?|highlight(ed)?|jagged)$/.test(word)) return 'zigzag';
  if (/^(wav(e|y)|curly|squiggl(e|y))$/.test(word)) return 'wavy';
  return undefined;
}

/** Transparency between 0.1 and 1 (a percentage works too). */
export function opacityOf(value: unknown): number | undefined {
  const number = typeof value === 'string' ? Number(value.replace('%', '')) / (value.includes('%') ? 100 : 1) : Number(value);
  if (value === undefined || value === null || value === '' || !Number.isFinite(number)) return undefined;
  const fraction = number > 1 ? number / 100 : number;
  return Math.min(1, Math.max(0.1, Math.round(fraction * 100) / 100));
}

/** SVG dash pattern for a style, scaled to the stroke width so dots stay round and dashes even. */
export function dashArray(style: LineStyle | undefined, width: number): string | undefined {
  const w = Math.max(1, width);
  switch (style) {
    case 'dashed':
      return `${round(w * 3.4 + 3)} ${round(w * 2.2 + 3)}`;
    case 'dotted':
      return `0.01 ${round(w * 2 + 3)}`;
    case 'dashdot':
      return `${round(w * 4 + 5)} ${round(w * 1.8 + 3)} 0.01 ${round(w * 1.8 + 3)}`;
    default:
      return undefined;
  }
}

/** Whether a style draws a real line that a pen can trace (the draw-in animation needs one). */
export const isContinuous = (style: LineStyle | undefined) => !style || style === 'solid' || style === 'zigzag' || style === 'wavy';

/** Straight path data through the points. */
export function polylineD(points: Pt[], closed = false): string {
  if (!points.length) return '';
  return `M${points.map((p) => `${round(p.x)} ${round(p.y)}`).join('L')}${closed ? 'Z' : ''}`;
}

/** Smooth path data through the points (quadratic segments through the midpoints). */
export function smoothD(points: Pt[]): string {
  if (points.length < 3) return polylineD(points);
  let d = `M${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    d += `Q${round(points[i].x)} ${round(points[i].y)} ${round(mid.x)} ${round(mid.y)}`;
  }
  const last = points[points.length - 1];
  return `${d}L${round(last.x)} ${round(last.y)}`;
}

/**
 * The scribble a student uses to highlight a segment: the path is walked at an even pace and every
 * other point is pushed to alternate sides. `smooth` rounds the corners into a wave.
 */
export function zigzag(points: Pt[], width: number, options: { closed?: boolean } = {}): Pt[] {
  const path = options.closed && points.length > 2 ? [...points, points[0]] : points;
  if (path.length < 2) return path;
  const amplitude = Math.max(3.2, width * 1.6 + 1.8);
  const spacing = Math.max(3.6, width * 1.4 + 2.6);
  const out: Pt[] = [{ ...path[0] }];
  let side = 1;
  let carry = spacing;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-6) continue;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    let at = carry;
    while (at < length) {
      out.push({ x: a.x + ux * at - uy * amplitude * side, y: a.y + uy * at + ux * amplitude * side });
      side = -side;
      at += spacing;
    }
    carry = at - length;
  }
  out.push({ ...path[path.length - 1] });
  return out;
}

/** Arrowhead at `tip`, pointing away from `from`. */
export function arrowHead(from: Pt, tip: Pt, width: number): string {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const size = Math.max(8, width * 3.2);
  const left = { x: tip.x - size * Math.cos(angle - Math.PI / 7), y: tip.y - size * Math.sin(angle - Math.PI / 7) };
  const right = { x: tip.x - size * Math.cos(angle + Math.PI / 7), y: tip.y - size * Math.sin(angle + Math.PI / 7) };
  return `M${round(left.x)} ${round(left.y)}L${round(tip.x)} ${round(tip.y)}L${round(right.x)} ${round(right.y)}`;
}

/** Points around an ellipse, for styles that have to walk the outline. */
export function ellipsePoints(cx: number, cy: number, rx: number, ry: number, from = 0, to = Math.PI * 2, count?: number): Pt[] {
  const span = to - from;
  const n = count ?? Math.max(12, Math.min(160, Math.round((Math.abs(span) * Math.max(rx, ry)) / 4)));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = from + (span * i) / n;
    return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
  });
}

/** Path data for points drawn in a style: zigzag and wavy change the geometry, the rest is dashes. */
export function styledPath(points: Pt[], style: LineStyle | undefined, width: number, closed = false): string {
  if (style === 'zigzag') return polylineD(zigzag(points, width, { closed }));
  if (style === 'wavy') return smoothD(zigzag(points, width, { closed }));
  return polylineD(points, closed);
}
