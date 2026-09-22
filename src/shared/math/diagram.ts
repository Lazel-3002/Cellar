/**
 * Step-by-step diagrams: what a teacher draws on the board while explaining. The model describes the
 * drawing in maths coordinates — axes, the unit circle, points, segments, lines like x = 1, angle
 * arcs marked α, coloured, bold, dashed, dotted or scribbled — and says which step each piece belongs
 * to. This builds the SVG with every element in a group tagged with its step, so the editor can draw
 * them in one step at a time and exports can print the finished picture with the steps beside it.
 *
 * Coordinates may be expressions (`cos 135`, `√3/2`, `tan(40)`) worked out by Cellar's calculator, so
 * a small model never has to do the trigonometry to put a point in the right place.
 */
import { calculate, measureOf } from './calc';
import { defaultContext, evaluateNode, parseExpression, variablesOf, type Node } from './expr';
import { arrowHead, dashArray, ellipsePoints, isContinuous, resolveColor, styledPath, weightOf, type Pt } from './linestyle';
import { escapeHtml, labelText } from './mathtext';
import type { DiagramElement, DiagramPoint, DiagramSpec, DiagramStep, LabelPosition, LineStyle, MathAngleMode } from '../types/math';

export interface BuiltDiagram {
  svg: string;
  width: number;
  height: number;
  /** Things that could not be drawn, for the model to fix. */
  notes: string[];
  steps: DiagramStep[];
  stepCount: number;
  /** Named points where they ended up, in maths coordinates. */
  points: Record<string, Pt>;
}

const PAD = 26;
const MIN_WIDTH = 220;
const MAX_WIDTH = 760;
const MAX_HEIGHT = 640;
const FONT = "'Source Serif 4 Variable','Cambria Math',Georgia,serif";

const round = (value: number) => Math.round(value * 100) / 100;

/** How many steps a diagram has: the listed steps, or the highest step an element names. */
export function diagramStepCount(spec: Pick<DiagramSpec, 'elements' | 'steps'>): number {
  const elements = Array.isArray(spec.elements) ? spec.elements : [];
  const highest = elements.reduce((max, element) => Math.max(max, Number(element?.step) || 1), elements.length ? 1 : 0);
  return Math.max(highest, Array.isArray(spec.steps) ? spec.steps.length : 0);
}

// ---------------------------------------------------------------------------
// Coordinates

function numberOf(value: unknown, angle: MathAngleMode): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const measured = measureOf(value, angle);
  return measured && Number.isFinite(measured.value) ? measured.value : null;
}

class Points {
  readonly named = new Map<string, Pt>();

  constructor(private readonly angle: MathAngleMode) {}

  define(name: string, point: Pt) {
    this.named.set(name.trim(), point);
  }

  lookup(name: string): Pt | null {
    const key = name.trim();
    const exact = this.named.get(key);
    if (exact) return exact;
    for (const [candidate, point] of this.named) if (candidate.toLowerCase() === key.toLowerCase()) return point;
    if (/^(o|origin)$/i.test(key)) return { x: 0, y: 0 };
    return null;
  }

  resolve(value: DiagramPoint | Record<string, unknown> | undefined | null): Pt | null {
    if (value === undefined || value === null) return null;
    if (Array.isArray(value)) {
      const x = numberOf(value[0], this.angle);
      const y = numberOf(value[1], this.angle);
      return x === null || y === null ? null : { x, y };
    }
    if (typeof value === 'object') {
      const x = numberOf((value as Record<string, unknown>).x, this.angle);
      const y = numberOf((value as Record<string, unknown>).y, this.angle);
      return x === null || y === null ? null : { x, y };
    }
    const text = String(value).trim();
    if (!text) return null;
    const named = this.lookup(text);
    if (named) return named;
    // "(1, 2)" or "1, 2" written as one string.
    const pair = text.replace(/^\(|\)$/g, '').split(/[,;]/);
    if (pair.length === 2) return this.resolve([pair[0].trim(), pair[1].trim()]);
    return null;
  }

  number(value: unknown): number | null {
    return numberOf(value, this.angle);
  }
}

/** Degrees from a number or an expression; written with π it is read as radians ("3pi/4" → 135). */
function degreesOf(value: unknown): number | null {
  if (typeof value === 'string' && /pi|π/i.test(value)) {
    const radians = numberOf(value, 'rad');
    return radians === null ? null : (radians * 180) / Math.PI;
  }
  return numberOf(value, 'deg');
}

/** Direction of the vector a → b in degrees, counter-clockwise in maths coordinates. */
const directionOf = (a: Pt, b: Pt) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/** The part of the line p + t·d (t in [tMin, tMax]) inside the box, or null when it misses it. */
function clipLine(p: Pt, d: Pt, box: { x0: number; x1: number; y0: number; y1: number }, tMin = -Infinity, tMax = Infinity): [Pt, Pt] | null {
  let lo = tMin;
  let hi = tMax;
  const checks: Array<[number, number]> = [
    [-d.x, p.x - box.x0],
    [d.x, box.x1 - p.x],
    [-d.y, p.y - box.y0],
    [d.y, box.y1 - p.y],
  ];
  for (const [q, r] of checks) {
    if (Math.abs(q) < 1e-12) {
      if (r < 0) return null;
      continue;
    }
    const t = r / q;
    if (q < 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
  }
  if (lo > hi || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return [
    { x: p.x + d.x * lo, y: p.y + d.y * lo },
    { x: p.x + d.x * hi, y: p.y + d.y * hi },
  ];
}

/** A tick step that lands on 1, 2 or 5 times a power of ten. */
function niceStep(span: number, target = 6): number {
  const raw = span / Math.max(2, target);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  return (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10) * magnitude;
}

const tickText = (value: number) => {
  const text = String(Number(value.toFixed(6)));
  return text.startsWith('-') ? `−${text.slice(1)}` : text;
};

// ---------------------------------------------------------------------------
// Drawing

interface Style {
  color: string;
  width: number;
  line?: LineStyle;
}

const LABEL_OFFSETS: Record<LabelPosition, { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }> = {
  above: { dx: 0, dy: -9, anchor: 'middle' },
  below: { dx: 0, dy: 17, anchor: 'middle' },
  left: { dx: -9, dy: 4.5, anchor: 'end' },
  right: { dx: 9, dy: 4.5, anchor: 'start' },
  'above-left': { dx: -6, dy: -7, anchor: 'end' },
  'above-right': { dx: 6, dy: -7, anchor: 'start' },
  'below-left': { dx: -6, dy: 16, anchor: 'end' },
  'below-right': { dx: 6, dy: 16, anchor: 'start' },
};

const FONT_SIZES = { small: 11, normal: 13.5, large: 18 } as const;

function textSvg(x: number, y: number, raw: string, options: { color: string; anchor?: 'start' | 'middle' | 'end'; size?: keyof typeof FONT_SIZES; bold?: boolean; italic?: boolean; muted?: boolean }): string {
  const plain = labelText(raw);
  if (!plain) return '';
  const italic = options.italic ?? /^[a-zA-Zα-ω](['′₀-₉0-9]*)$/.test(plain);
  return `<text class="dg-f dg-label" x="${round(x)}" y="${round(y)}" text-anchor="${options.anchor ?? 'middle'}" fill="${options.color}" font-size="${FONT_SIZES[options.size ?? 'normal']}" font-family="${FONT}"${italic ? ' font-style="italic"' : ''}${options.bold ? ' font-weight="700"' : ''}${options.muted ? ' fill-opacity="0.72"' : ''}>${escapeHtml(plain)}</text>`;
}

function strokeSvg(d: string, style: Style, extra = ''): string {
  if (!d) return '';
  const dash = dashArray(style.line, style.width);
  const traced = isContinuous(style.line);
  return `<path class="${traced ? 'dg-s' : 'dg-f'}"${traced ? ' pathLength="1"' : ''} d="${d}" fill="none" stroke="${style.color}" stroke-width="${style.width}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${extra}/>`;
}

function headsSvg(points: Pt[], arrow: DiagramElement['arrow'], style: Style): string {
  if (!arrow || arrow === 'none' || points.length < 2) return '';
  const parts: string[] = [];
  const common = `fill="none" stroke="${style.color}" stroke-width="${style.width}" stroke-linecap="round" stroke-linejoin="round"`;
  if (arrow === 'end' || arrow === 'both') parts.push(`<path class="dg-f" d="${arrowHead(points[points.length - 2], points[points.length - 1], style.width)}" ${common}/>`);
  if (arrow === 'start' || arrow === 'both') parts.push(`<path class="dg-f" d="${arrowHead(points[1], points[0], style.width)}" ${common}/>`);
  return parts.join('');
}

/** Which way a label should sit so it points away from the middle of the drawing. */
function awayPosition(point: Pt, from: Pt): LabelPosition {
  const dx = point.x - from.x;
  const dy = point.y - from.y;
  if (Math.hypot(dx, dy) < 1e-9) return 'below-left';
  return dy >= 0 ? (dx >= 0 ? 'above-right' : 'above-left') : dx >= 0 ? 'below-right' : 'below-left';
}

const POSITIONS = Object.keys(LABEL_OFFSETS) as LabelPosition[];
const positionOf = (value: unknown): LabelPosition | undefined => (typeof value === 'string' && POSITIONS.includes(value as LabelPosition) ? (value as LabelPosition) : undefined);

// ---------------------------------------------------------------------------

export function buildDiagram(spec: DiagramSpec): BuiltDiagram {
  const angle: MathAngleMode = spec.angle === 'rad' ? 'rad' : 'deg';
  const notes: string[] = [];
  const elements = (Array.isArray(spec.elements) ? spec.elements : []).filter((element) => element && typeof element === 'object').slice(0, 400);
  const points = new Points(angle);

  // Named points first, twice, so a point may be placed relative to one listed after it.
  for (let pass = 0; pass < 2; pass++) {
    for (const element of elements) {
      if (!element.name || element.kind !== 'point') continue;
      const at = points.resolve(element.at ?? ([element.x, element.y] as DiagramPoint));
      if (at) points.define(element.name, at);
    }
  }

  // The window: what was asked for, otherwise everything that has a place.
  const xs: number[] = [];
  const ys: number[] = [];
  const include = (p: Pt | null) => {
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e6 && Math.abs(p.y) < 1e6) {
      xs.push(p.x);
      ys.push(p.y);
    }
  };
  for (const element of elements) {
    for (const ref of [element.at, element.from, element.to, element.through, ...(Array.isArray(element.points) ? element.points : [])]) include(points.resolve(ref));
    if (element.kind === 'point' && element.at === undefined) include(points.resolve([element.x ?? 0, element.y ?? 0] as DiagramPoint));
    if (element.kind === 'line' && element.from === undefined && element.at === undefined) {
      const x = points.number(element.x);
      const y = points.number(element.y);
      if (x !== null) xs.push(x);
      if (y !== null) ys.push(y);
    }
    if (element.kind === 'axes') include({ x: 0, y: 0 });
    if (element.kind === 'unit-circle' || element.kind === 'circle' || element.kind === 'arc') {
      const center = points.resolve(element.at) ?? { x: 0, y: 0 };
      const radius = element.kind === 'unit-circle' ? 1 : Math.abs(points.number(element.radius) ?? 1);
      include({ x: center.x - radius, y: center.y - radius });
      include({ x: center.x + radius, y: center.y + radius });
    }
    if (element.kind === 'function' && Array.isArray(element.domain)) {
      const [a, b] = element.domain.map(Number);
      if (Number.isFinite(a)) xs.push(a);
      if (Number.isFinite(b)) xs.push(b);
    }
  }
  const fit = (values: number[], min: unknown, max: unknown): [number, number] => {
    let lo = values.length ? Math.min(...values) : -5;
    let hi = values.length ? Math.max(...values) : 5;
    if (hi - lo < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    const pad = Math.max((hi - lo) * 0.14, 0.3);
    lo -= pad;
    hi += pad;
    const givenMin = Number(min);
    const givenMax = Number(max);
    if (min !== undefined && min !== null && Number.isFinite(givenMin)) lo = givenMin;
    if (max !== undefined && max !== null && Number.isFinite(givenMax)) hi = givenMax;
    return hi > lo ? [lo, hi] : [lo, lo + 2];
  };
  const [xMin, xMax] = fit(xs, spec.xMin, spec.xMax);
  const [yMin, yMax] = fit(ys, spec.yMin, spec.yMax);
  const box = { x0: xMin, x1: xMax, y0: yMin, y1: yMax };

  // One scale for both axes, so circles stay round.
  let width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(Number(spec.width) || 440)));
  let scale = (width - PAD * 2) / (xMax - xMin);
  let height = Math.round((yMax - yMin) * scale + PAD * 2);
  if (height > MAX_HEIGHT) {
    scale = (MAX_HEIGHT - PAD * 2) / (yMax - yMin);
    height = MAX_HEIGHT;
    width = Math.max(MIN_WIDTH, Math.round((xMax - xMin) * scale + PAD * 2));
  }
  const px = (p: Pt): Pt => ({ x: round(PAD + (p.x - xMin) * scale), y: round(height - PAD - (p.y - yMin) * scale) });
  const middle = { x: (xMin + xMax) / 2, y: (yMin + yMax) / 2 };

  const parts: string[] = [];
  if (spec.grid) {
    const step = scale >= 14 ? 1 : niceStep(xMax - xMin, 14);
    const lines: string[] = [];
    for (let x = Math.ceil(xMin / step) * step; x <= xMax; x += step) lines.push(`M${px({ x, y: 0 }).x} 0V${height}`);
    for (let y = Math.ceil(yMin / step) * step; y <= yMax; y += step) lines.push(`M0 ${px({ x: 0, y }).y}H${width}`);
    parts.push(`<path d="${lines.join('')}" stroke="currentColor" stroke-width="0.6" opacity="0.13" fill="none"/>`);
  }

  const stepCount = diagramStepCount({ elements, steps: spec.steps });
  let lastStep = 1;
  const perStep = new Map<number, number>();

  elements.forEach((element, index) => {
    const requested = Math.round(Number(element.step));
    const step = Number.isFinite(requested) && requested >= 1 ? Math.min(requested, stepCount) : lastStep;
    lastStep = step;
    const where = `Element ${index + 1} (${element.kind})`;
    const color = resolveColor(element.color);
    const kind = element.kind;
    const style: Style = {
      color,
      width: weightOf(element.weight, kind === 'axes' ? 1.2 : kind === 'angle' ? 1.4 : 1.8),
      line: element.line,
    };
    const labelColor = color;
    const body: string[] = [];
    const missing = (what: string) => notes.push(`${where}: ${what}`);

    const label = (text: string | undefined, at: Pt, position: LabelPosition, size?: 'small' | 'normal' | 'large') => {
      if (!text) return;
      const offset = LABEL_OFFSETS[position];
      const p = px(at);
      // A scribbled line is wider than it looks thick, so its label steps further away.
      const clear = style.line === 'zigzag' || style.line === 'wavy' ? Math.max(3.2, style.width * 1.6 + 1.8) + 2 : 0;
      const dx = offset.dx + Math.sign(offset.dx) * clear;
      const dy = offset.dy + (offset.dy < 0 ? -clear : offset.dy > 10 ? clear : 0);
      body.push(textSvg(p.x + dx, p.y + dy, text, { color: labelColor, anchor: offset.anchor, size: size ?? element.size, bold: element.bold }));
    };

    /** A straight piece from a to b (both in maths coordinates), with arrows and a label. */
    const straight = (a: Pt, b: Pt, arrow: DiagramElement['arrow'], labelAlong = 0.5) => {
      const pa = px(a);
      const pb = px(b);
      body.push(strokeSvg(styledPath([pa, pb], style.line, style.width), style));
      body.push(headsSvg([pa, pb], arrow, style));
      if (element.label) {
        const at = { x: a.x + (b.x - a.x) * labelAlong, y: a.y + (b.y - a.y) * labelAlong };
        // Perpendicular to the piece, on the side away from the middle of the drawing.
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const length = Math.hypot(dx, dy) || 1;
        let nx = -dy / length;
        let ny = dx / length;
        const mid = px(at);
        const centre = px(middle);
        if ((mid.x - centre.x) * nx + (mid.y - centre.y) * ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        const position = positionOf(element.position);
        if (position) label(element.label, at, position);
        else {
          let anchor: 'start' | 'middle' | 'end' = Math.abs(nx) < 0.35 ? 'middle' : nx > 0 ? 'start' : 'end';
          // Near an edge the label turns inward rather than running off the drawing.
          if (anchor !== 'end' && mid.x > width - 90) anchor = 'end';
          else if (anchor !== 'start' && mid.x < 90) anchor = 'start';
          const away = 12 + (style.line === 'zigzag' || style.line === 'wavy' ? Math.max(3.2, style.width * 1.6 + 1.8) + 2 : 0);
          body.push(textSvg(mid.x + nx * away, mid.y + ny * away + 4.5, element.label, { color: labelColor, anchor, size: element.size, bold: element.bold }));
        }
      }
    };

    switch (kind) {
      case 'axes': {
        const which = element.axis ?? 'both';
        const axisStyle: Style = { ...style, color: element.color ? color : 'currentColor' };
        const originY = Math.min(yMax, Math.max(yMin, 0));
        const originX = Math.min(xMax, Math.max(xMin, 0));
        const ticks = element.ticks !== false;
        const tickParts: string[] = [];
        if (which !== 'y') {
          const a = px({ x: xMin, y: originY });
          const b = px({ x: xMax, y: originY });
          body.push(strokeSvg(`M${a.x} ${a.y}L${b.x} ${b.y}`, axisStyle), headsSvg([a, b], 'end', axisStyle));
          body.push(textSvg(b.x - 4, b.y + 16, element.label?.split(',')[0]?.trim() || 'x', { color: axisStyle.color, anchor: 'end', size: 'small', italic: true }));
          if (ticks) {
            const stepX = niceStep(xMax - xMin);
            for (let x = Math.ceil(xMin / stepX) * stepX; x < xMax - stepX * 0.4; x += stepX) {
              if (Math.abs(x) < stepX * 1e-6) continue;
              const t = px({ x, y: originY });
              tickParts.push(`M${t.x} ${t.y - 3.5}V${t.y + 3.5}`);
              body.push(textSvg(t.x, t.y + 15, tickText(x), { color: axisStyle.color, size: 'small', italic: false, muted: true }));
            }
          }
        }
        if (which !== 'x') {
          const a = px({ x: originX, y: yMin });
          const b = px({ x: originX, y: yMax });
          body.push(strokeSvg(`M${a.x} ${a.y}L${b.x} ${b.y}`, axisStyle), headsSvg([a, b], 'end', axisStyle));
          body.push(textSvg(b.x + 9, b.y + 10, element.label?.split(',')[1]?.trim() || 'y', { color: axisStyle.color, anchor: 'start', size: 'small', italic: true }));
          if (ticks) {
            const stepY = niceStep(yMax - yMin);
            for (let y = Math.ceil(yMin / stepY) * stepY; y < yMax - stepY * 0.4; y += stepY) {
              if (Math.abs(y) < stepY * 1e-6) continue;
              const t = px({ x: originX, y });
              tickParts.push(`M${t.x - 3.5} ${t.y}H${t.x + 3.5}`);
              body.push(textSvg(t.x - 7, t.y + 4, tickText(y), { color: axisStyle.color, anchor: 'end', size: 'small', italic: false, muted: true }));
            }
          }
        }
        if (tickParts.length) body.push(`<path class="dg-f" d="${tickParts.join('')}" stroke="${axisStyle.color}" stroke-width="1" fill="none"/>`);
        break;
      }

      case 'unit-circle':
      case 'circle': {
        const center = points.resolve(element.at) ?? { x: 0, y: 0 };
        let radius = kind === 'unit-circle' ? 1 : points.number(element.radius);
        const through = points.resolve(element.through ?? element.to);
        if ((radius === null || kind === 'circle') && through && element.radius === undefined) radius = Math.hypot(through.x - center.x, through.y - center.y);
        if (radius === null || !(radius > 0)) {
          missing('a circle needs a radius (or a point it goes through).');
          break;
        }
        const c = px(center);
        const r = radius * scale;
        const fill = element.fill ? resolveColor(element.fill, '') : '';
        if (fill) body.push(`<circle class="dg-f" cx="${c.x}" cy="${c.y}" r="${round(r)}" fill="${fill}" fill-opacity="${Math.min(1, Math.max(0.05, Number(element.fillOpacity) || 0.14))}" stroke="none"/>`);
        // Drawn from the positive x-axis counter-clockwise, the way a compass goes round on paper.
        const outline = ellipsePoints(c.x, c.y, r, r, 0, -Math.PI * 2);
        body.push(strokeSvg(styledPath(outline, style.line, style.width), style));
        if (kind === 'unit-circle' && element.ticks) {
          const muted = { color: 'currentColor', size: 'small' as const, italic: false, muted: true };
          const right = px({ x: center.x + 1, y: center.y });
          const left = px({ x: center.x - 1, y: center.y });
          const top = px({ x: center.x, y: center.y + 1 });
          const bottom = px({ x: center.x, y: center.y - 1 });
          body.push(textSvg(right.x + 5, right.y + 14, '1', { ...muted, anchor: 'start' }));
          body.push(textSvg(left.x - 5, left.y + 14, '−1', { ...muted, anchor: 'end' }));
          body.push(textSvg(top.x - 6, top.y - 5, '1', { ...muted, anchor: 'end' }));
          body.push(textSvg(bottom.x - 6, bottom.y + 14, '−1', { ...muted, anchor: 'end' }));
        }
        if (element.label) label(element.label, { x: center.x + radius * Math.SQRT1_2, y: center.y + radius * Math.SQRT1_2 }, positionOf(element.position) ?? 'above-right');
        break;
      }

      case 'point': {
        const at = points.resolve(element.at ?? (element.x !== undefined ? ([element.x, element.y ?? 0] as DiagramPoint) : undefined));
        if (!at) {
          missing(`I could not place this point (${JSON.stringify(element.at ?? null)}).`);
          break;
        }
        const p = px(at);
        const size = element.size === 'large' ? 4.4 : element.size === 'small' ? 2.4 : 3.3;
        body.push(
          element.open
            ? `<circle class="dg-f dg-hollow" cx="${p.x}" cy="${p.y}" r="${size + 0.6}" fill="#ffffff" stroke="${color}" stroke-width="1.6"/>`
            : `<circle class="dg-f" cx="${p.x}" cy="${p.y}" r="${size}" fill="${color}"/>`,
        );
        const text = element.label ?? element.name;
        if (text) {
          const offset = LABEL_OFFSETS[positionOf(element.position) ?? awayPosition(at, { x: 0, y: 0 })];
          body.push(textSvg(p.x + offset.dx, p.y + offset.dy, text, { color: labelColor, anchor: offset.anchor, size: element.size === 'large' ? 'large' : 'normal', bold: element.bold }));
        }
        break;
      }

      case 'segment':
      case 'arrow': {
        const a = points.resolve(element.from ?? element.at);
        const b = points.resolve(element.to ?? element.through);
        if (!a || !b) {
          missing(`it needs both ends; I could not read ${!a ? `from ${JSON.stringify(element.from ?? null)}` : `to ${JSON.stringify(element.to ?? null)}`}.`);
          break;
        }
        straight(a, b, element.arrow ?? (kind === 'arrow' ? 'end' : 'none'));
        break;
      }

      case 'line':
      case 'ray': {
        const start = points.resolve(element.from ?? element.at);
        let through = points.resolve(element.through ?? element.to);
        let origin = start;
        const slope = points.number(element.slope);
        const fixedX = points.number(element.x);
        const fixedY = points.number(element.y);
        if (!origin && fixedX !== null && element.slope === undefined) {
          origin = { x: fixedX, y: 0 };
          through = { x: fixedX, y: 1 };
        } else if (!origin && fixedY !== null) {
          origin = { x: 0, y: fixedY };
          through = { x: 1, y: fixedY + (slope ?? 0) };
        } else if (origin && !through && slope !== null) {
          through = { x: origin.x + 1, y: origin.y + slope };
        }
        if (!origin || !through || (Math.abs(through.x - origin.x) < 1e-12 && Math.abs(through.y - origin.y) < 1e-12)) {
          missing('a line needs two points, a point and a slope, or x = … / y = ….');
          break;
        }
        const direction = { x: through.x - origin.x, y: through.y - origin.y };
        const clipped = clipLine(origin, direction, box, kind === 'ray' ? 0 : -Infinity);
        if (!clipped) {
          missing('the line is outside the drawing.');
          break;
        }
        straight(clipped[0], clipped[1], element.arrow ?? 'none', kind === 'ray' ? 0.8 : 0.9);
        break;
      }

      case 'arc':
      case 'angle': {
        const vertex = points.resolve(element.at) ?? { x: 0, y: 0 };
        const from = points.resolve(element.from);
        const to = points.resolve(element.to ?? element.through);
        const startGiven = degreesOf(element.start);
        const endGiven = degreesOf(element.end);
        let start = startGiven ?? (from ? directionOf(vertex, from) : 0);
        const end = endGiven ?? (to ? directionOf(vertex, to) : null);
        if (end === null) {
          missing('it needs where it ends: end (degrees) or a point "to".');
          break;
        }
        let sweep: number;
        if (startGiven !== null || endGiven !== null) {
          // Directions given in degrees are drawn exactly: counter-clockwise, or clockwise when negative.
          sweep = end - start;
          if (Math.abs(sweep) >= 360) sweep = Math.sign(sweep) * 359.99;
        } else {
          // Between two arms the smaller angle is meant.
          sweep = (((end - start) % 360) + 360) % 360;
          if (sweep > 180) {
            start = end;
            sweep = 360 - sweep;
          }
        }
        if (Math.abs(sweep) < 0.01) {
          missing('the angle is 0°.');
          break;
        }
        const v = px(vertex);
        const pixelRadius =
          kind === 'arc'
            ? Math.abs(points.number(element.radius) ?? 1) * scale
            : element.size === 'large'
              ? 34
              : element.size === 'small'
                ? 14
                : Number(element.radius) > 3
                  ? Math.min(80, Number(element.radius))
                  : 22 + (sweep > 180 ? 4 : 0);
        const rad = (deg: number) => (deg * Math.PI) / 180;
        if (kind === 'angle' && (element.right || (element.right !== false && Math.abs(Math.abs(sweep) - 90) < 0.01))) {
          const size = 10;
          const u = { x: Math.cos(rad(start)), y: -Math.sin(rad(start)) };
          const w = { x: Math.cos(rad(start + 90 * Math.sign(sweep))), y: -Math.sin(rad(start + 90 * Math.sign(sweep))) };
          const d = `M${round(v.x + u.x * size)} ${round(v.y + u.y * size)}L${round(v.x + (u.x + w.x) * size)} ${round(v.y + (u.y + w.y) * size)}L${round(v.x + w.x * size)} ${round(v.y + w.y * size)}`;
          body.push(strokeSvg(d, { ...style, line: 'solid', width: Math.min(style.width, 1.6) }));
        } else {
          // Pixel y points down, so counter-clockwise in maths is a negative angle on screen.
          const outline = ellipsePoints(v.x, v.y, pixelRadius, pixelRadius, -rad(start), -rad(start + sweep));
          body.push(strokeSvg(styledPath(outline, style.line, style.width), style));
          body.push(headsSvg(outline, element.arrow, style));
        }
        if (element.label) {
          const bisector = rad(start + sweep / 2);
          const distance = pixelRadius + (kind === 'angle' ? 11 : 13);
          const lx = v.x + Math.cos(bisector) * distance;
          const ly = v.y - Math.sin(bisector) * distance;
          const anchor = Math.abs(Math.cos(bisector)) < 0.3 ? 'middle' : Math.cos(bisector) > 0 ? 'start' : 'end';
          body.push(textSvg(lx, ly + 4.5, element.label, { color: labelColor, anchor, size: element.size === 'large' ? 'large' : 'normal', bold: element.bold }));
        }
        break;
      }

      case 'polygon': {
        const corners = (Array.isArray(element.points) ? element.points : []).map((point) => points.resolve(point));
        if (corners.length < 2 || corners.some((corner) => !corner)) {
          missing('a polygon needs its corners, each as [x, y] or a point name.');
          break;
        }
        const pixels = (corners as Pt[]).map(px);
        const fill = element.fill ? resolveColor(element.fill, '') : '';
        if (fill && pixels.length > 2) body.push(`<path class="dg-f" d="M${pixels.map((p) => `${p.x} ${p.y}`).join('L')}Z" fill="${fill}" fill-opacity="${Math.min(1, Math.max(0.05, Number(element.fillOpacity) || 0.16))}" stroke="none"/>`);
        body.push(strokeSvg(styledPath(pixels, style.line, style.width, pixels.length > 2), style));
        if (element.label) {
          const centre = { x: (corners as Pt[]).reduce((sum, p) => sum + p.x, 0) / corners.length, y: (corners as Pt[]).reduce((sum, p) => sum + p.y, 0) / corners.length };
          const c = px(centre);
          body.push(textSvg(c.x, c.y + 4.5, element.label, { color: labelColor, size: element.size, bold: element.bold }));
        }
        break;
      }

      case 'function': {
        const raw = String(element.expr ?? '').trim();
        let node: Node;
        try {
          node = parseExpression(raw.replace(/^\s*[yf]\s*(\(\s*x\s*\))?\s*=\s*/i, ''));
        } catch (err) {
          missing(`${raw || 'no expression'}: ${err instanceof Error ? err.message : 'could not be read'}.`);
          break;
        }
        const unknown = variablesOf(node).filter((name) => name.toLowerCase() !== 'x');
        if (unknown.length) {
          missing(`I do not know what ${unknown.join(', ')} is in ${raw}.`);
          break;
        }
        const ctx = defaultContext(angle);
        const [a, b] = Array.isArray(element.domain) && element.domain.length === 2 && element.domain.every((value) => Number.isFinite(Number(value))) ? element.domain.map(Number) : [xMin, xMax];
        const lo = Math.max(xMin, Math.min(a, b));
        const hi = Math.min(xMax, Math.max(a, b));
        const spanY = yMax - yMin;
        const runs: Pt[][] = [];
        let run: Pt[] = [];
        let previous: number | null = null;
        const samples = 320;
        for (let i = 0; i <= samples; i++) {
          const x = lo + ((hi - lo) * i) / samples;
          let y: number | null = null;
          try {
            const value = evaluateNode(node, { ...ctx, vars: { x } });
            y = Number.isFinite(value) && value > yMin - spanY && value < yMax + spanY ? value : null;
          } catch {
            y = null;
          }
          if (y === null || (previous !== null && Math.abs(y - previous) > spanY)) {
            if (run.length > 1) runs.push(run);
            run = [];
          }
          if (y !== null) run.push(px({ x, y }));
          previous = y;
        }
        if (run.length > 1) runs.push(run);
        if (!runs.length) {
          missing(`${raw} has no values inside the drawing.`);
          break;
        }
        for (const piece of runs) body.push(strokeSvg(styledPath(piece, style.line, style.width), style));
        if (element.label) {
          const last = runs[runs.length - 1];
          const end = last[Math.max(0, last.length - 12)];
          body.push(textSvg(end.x + 6, end.y - 8, element.label, { color: labelColor, anchor: 'start', size: element.size, bold: element.bold }));
        }
        break;
      }

      case 'text': {
        const at = points.resolve(element.at ?? (element.x !== undefined ? ([element.x, element.y ?? 0] as DiagramPoint) : undefined));
        const text = element.text ?? element.label;
        if (!at || !text) {
          missing(!text ? 'a text needs text.' : 'a text needs a place (at).');
          break;
        }
        const p = px(at);
        const position = positionOf(element.position);
        const offset = position ? LABEL_OFFSETS[position] : { dx: 0, dy: 4.5, anchor: 'middle' as const };
        body.push(textSvg(p.x + offset.dx, p.y + offset.dy, text, { color: labelColor, anchor: offset.anchor, size: element.size, bold: element.bold, italic: false }));
        break;
      }

      default:
        missing('unknown kind. Use axes, unit-circle, point, segment, line, ray, arrow, circle, arc, angle, polygon, function or text.');
    }

    const content = body.filter(Boolean).join('');
    if (!content) return;
    const order = perStep.get(step) ?? 0;
    perStep.set(step, order + 1);
    const opacity = Number(element.opacity);
    const inner = Number.isFinite(opacity) && opacity > 0 && opacity < 1 ? `<g opacity="${Math.max(0.1, round(opacity))}">${content}</g>` : content;
    parts.push(`<g class="dg-el" data-step="${step}" style="--dg-i:${order}">${inner}</g>`);
  });

  const steps = (Array.isArray(spec.steps) ? spec.steps : []).slice(0, stepCount);
  const named: Record<string, Pt> = {};
  for (const [name, point] of points.named) named[name] = { x: Math.round(point.x * 1000) / 1000, y: Math.round(point.y * 1000) / 1000 };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="m-figure m-diagram" role="img" aria-label="${escapeHtml(`Diagram in ${stepCount} step${stepCount === 1 ? '' : 's'}`)}">${parts.join('')}</svg>`;
  return { svg, width, height, notes, steps, stepCount, points: named };
}

// ---------------------------------------------------------------------------
// The trigonometric circle, built by Cellar so the construction and the values are right.

export type TrigFunction = 'sin' | 'cos' | 'tan' | 'cot';

export interface TrigCircleOptions {
  /** α in degrees ("135"), or in radians when written with pi ("3pi/4"). */
  angle: number | string;
  /** Which ratios to construct, in this order (default sin and cos). */
  show?: TrigFunction[];
  /** The angle's name on the drawing (default α). */
  name?: string;
}

export interface TrigCircle {
  spec: DiagramSpec;
  /** One line per ratio with its exact value, for the model. */
  facts: string[];
  degrees: number;
}

const QUADRANT_NAMES = ['I', 'II', 'III', 'IV'];

function trigValue(fn: TrigFunction, degrees: number): { text: string; value: number } | null {
  const result = calculate(`${fn}(${degrees})`, { angle: 'deg', decimals: 3 });
  if (!result.ok || result.value === null || !Number.isFinite(result.value) || Math.abs(result.value) > 1e9) return null;
  return { text: result.answer.replace(/^-/, '−'), value: result.value };
}

/** Where α lands: a quadrant, or one of the axes. */
function placeOf(degrees: number): string {
  const d = ((degrees % 360) + 360) % 360;
  if (d === 0) return 'on the positive x-axis';
  if (d === 90) return 'on the positive y-axis';
  if (d === 180) return 'on the negative x-axis';
  if (d === 270) return 'on the negative y-axis';
  return `in quadrant ${QUADRANT_NAMES[Math.floor(d / 90)]}`;
}

/** The unit-circle construction of sin, cos, tan and cot of one angle, step by step. */
export function trigCircle(options: TrigCircleOptions): TrigCircle {
  const read = degreesOf(options.angle);
  if (read === null) throw new Error(`I could not read the angle "${String(options.angle)}". Give it in degrees, e.g. 135.`);
  const degrees = Math.round(read * 1000) / 1000;
  const name = (options.name ?? 'α').trim().slice(0, 8) || 'α';
  const show = (options.show?.length ? options.show : (['sin', 'cos'] as TrigFunction[])).filter((fn, index, list) => list.indexOf(fn) === index);
  const d = `${String(degrees)}°`;
  const cos = trigValue('cos', degrees)!;
  const sin = trigValue('sin', degrees)!;
  const px = Math.abs(cos.value) < 1e-12 ? 0 : cos.value;
  const py = Math.abs(sin.value) < 1e-12 ? 0 : sin.value;
  const sign = (value: number) => (value > 1e-12 ? '+' : value < -1e-12 ? '−' : '0');
  const signWord = (value: number) => (value > 1e-12 ? 'positive' : value < -1e-12 ? 'negative' : 'zero');

  const elements: DiagramElement[] = [];
  const steps: DiagramStep[] = [];
  const facts: string[] = [];
  let step = 0;
  const add = (text: string, math: string | undefined, drawn: DiagramElement[]) => {
    step += 1;
    steps.push(math ? { text, math } : { text });
    for (const element of drawn) elements.push({ ...element, step });
  };

  add('Draw the axes and the unit circle: centre O, radius 1.', 'x^2 + y^2 = 1', [
    { kind: 'axes', ticks: false, weight: 'thin' },
    { kind: 'unit-circle', ticks: true },
    { kind: 'point', name: 'O', at: [0, 0], size: 'small', position: 'below-left' },
  ]);

  add(`Turn ${name} = ${d} counter-clockwise from the positive x-axis. The end of the turn, P = (cos ${name}, sin ${name}), lands ${placeOf(degrees)}.`, `P = (${cos.text}, ${sin.text})`, [
    { kind: 'angle', at: 'O', start: 0, end: degrees, label: name, color: 'orange', arrow: 'end' },
    { kind: 'segment', from: 'O', to: [px, py], color: 'blue', weight: 'bold' },
    { kind: 'point', name: 'P', at: [px, py], color: 'blue' },
  ]);

  let extent = 1;
  for (const fn of show) {
    if (fn === 'cos') {
      add(`cos ${name} is the x-coordinate of P: drop a dotted line from P straight down (or up) to the x-axis.`, `cos ${d} = ${cos.text}  (${sign(cos.value)})`, [
        ...(Math.abs(py) > 1e-9 ? [{ kind: 'segment', from: 'P', to: [px, 0], line: 'dotted', color: 'gray' } as DiagramElement] : []),
        ...(Math.abs(px) > 1e-9 ? [{ kind: 'segment', from: [0, 0], to: [px, 0], color: 'green', weight: 'thick', opacity: 0.85, label: `cos ${name}`, position: py >= 0 ? 'below' : 'above' } as DiagramElement] : []),
      ]);
      facts.push(`cos ${d} = ${cos.text} (${signWord(cos.value)})`);
    }
    if (fn === 'sin') {
      add(`sin ${name} is the y-coordinate of P: draw a dotted line across from P to the y-axis.`, `sin ${d} = ${sin.text}  (${sign(sin.value)})`, [
        ...(Math.abs(px) > 1e-9 ? [{ kind: 'segment', from: 'P', to: [0, py], line: 'dotted', color: 'gray' } as DiagramElement] : []),
        ...(Math.abs(py) > 1e-9 ? [{ kind: 'segment', from: [0, 0], to: [0, py], color: 'red', weight: 'thick', opacity: 0.85, label: `sin ${name}`, position: px >= 0 ? 'left' : 'right' } as DiagramElement] : []),
      ]);
      facts.push(`sin ${d} = ${sin.text} (${signWord(sin.value)})`);
    }
    if (fn === 'tan') {
      const tan = Math.abs(px) < 1e-12 ? null : trigValue('tan', degrees);
      add('Draw the tangent axis: the line x = 1, which touches the circle at A(1, 0).', undefined, [
        { kind: 'line', x: 1, color: 'purple', label: 'x = 1', position: 'above-right' },
        // A's label goes on the side the highlighted segment does not.
        { kind: 'point', name: 'A', at: [1, 0], size: 'small', color: 'purple', position: tan && tan.value < 0 ? 'above-left' : 'below-left' },
      ]);
      if (!tan) {
        add(`OP is parallel to x = 1, so the two never meet: tan ${d} is undefined.`, `tan ${d} is undefined`, [{ kind: 'text', at: [1.25, 0.5], text: 'undefined', color: 'purple', size: 'small' }]);
        facts.push(`tan ${d} is undefined`);
      } else {
        const t = tan.value;
        extent = Math.max(extent, Math.abs(t));
        add(
          px > 0 ? 'Extend OP beyond P until it meets the tangent axis at T.' : 'OP points away from x = 1, so extend it backwards through O until it meets the tangent axis at T.',
          `T = (1, tan ${name})`,
          [
            { kind: 'segment', from: 'P', to: [1, t], line: 'dashed', color: 'blue' },
            { kind: 'point', name: 'T', at: [1, t], color: 'purple', position: t >= 0 ? 'above-right' : 'below-right' },
          ],
        );
        add(`The piece of the tangent axis from A to T is tan ${name}. It goes ${t > 0 ? 'up, so tan is positive' : 'down, so tan is negative'}.`, `tan ${d} = ${tan.text}  (${sign(t)})`, [
          { kind: 'segment', from: [1, 0], to: [1, t], line: 'zigzag', color: 'orange', weight: 'bold', label: `tan ${name} = ${tan.text}`, position: 'right' },
        ]);
        facts.push(`tan ${d} = ${tan.text} (${signWord(t)})`);
      }
    }
    if (fn === 'cot') {
      const cot = Math.abs(py) < 1e-12 ? null : trigValue('cot', degrees);
      add('Draw the cotangent axis: the line y = 1, which touches the circle at B(0, 1).', undefined, [
        { kind: 'line', y: 1, color: 'teal', label: 'y = 1', position: 'above-left' },
        { kind: 'point', name: 'B', at: [0, 1], size: 'small', color: 'teal', position: cot && cot.value < 0 ? 'below-right' : 'below-left' },
      ]);
      if (!cot) {
        add(`OP is parallel to y = 1, so the two never meet: cot ${d} is undefined.`, `cot ${d} is undefined`, [{ kind: 'text', at: [0.5, 1.25], text: 'undefined', color: 'teal', size: 'small' }]);
        facts.push(`cot ${d} is undefined`);
      } else {
        const k = cot.value;
        extent = Math.max(extent, Math.abs(k));
        add(
          py > 0 ? 'Extend OP beyond P until it meets the cotangent axis at K.' : 'OP points away from y = 1, so extend it backwards through O until it meets the cotangent axis at K.',
          `K = (cot ${name}, 1)`,
          [
            { kind: 'segment', from: 'P', to: [k, 1], line: 'dashed', color: 'blue' },
            { kind: 'point', name: 'K', at: [k, 1], color: 'teal', position: k >= 0 ? 'above-right' : 'above-left' },
          ],
        );
        add(`The piece of the cotangent axis from B to K is cot ${name}. It goes ${k > 0 ? 'right, so cot is positive' : 'left, so cot is negative'}.`, `cot ${d} = ${cot.text}  (${sign(k)})`, [
          { kind: 'segment', from: [0, 1], to: [k, 1], line: 'zigzag', color: 'orange', weight: 'bold', label: `cot ${name} = ${cot.text}`, position: 'above' },
        ]);
        facts.push(`cot ${d} = ${cot.text} (${signWord(k)})`);
      }
    }
  }

  // Keep the circle readable: a very steep tangent is cut off at the edge instead of shrinking the circle.
  const reach = Math.min(3.2, Math.max(1.45, extent + 0.45));
  const spec: DiagramSpec = { elements, steps, xMin: -Math.max(1.45, show.includes('cot') ? reach : 1.45), xMax: Math.max(1.75, show.includes('tan') || show.includes('cot') ? reach + 0.3 : 1.45), yMin: -Math.max(1.45, show.includes('tan') ? reach : 1.45), yMax: Math.max(1.45, show.includes('tan') || show.includes('cot') ? reach : 1.45), width: 440 };
  if (extent > reach) facts.push('The value is large, so its end point lies off the edge of the drawing; the construction is the same.');
  return { spec, facts, degrees };
}
