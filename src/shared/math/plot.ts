/** Function graphs: y = f(x) drawn on labelled axes, with the same expression engine as the calculator. */
import { escapeHtml, mathToPlain } from './mathtext';
import { defaultContext, evaluateNode, formatDecimal, parseExpression, variablesOf, type Node } from './expr';
import type { PlotSpec } from '../types/math';

export interface BuiltPlot {
  svg: string;
  width: number;
  height: number;
  notes: string[];
}

export const PLOT_COLORS = ['#d97757', '#4c8dda', '#4fa87a', '#b072d6', '#d9a13c'];

const round = (value: number) => Math.round(value * 100) / 100;

/** A tick step that lands on 1, 2 or 5 times a power of ten. */
function niceStep(span: number, target = 8): number {
  const raw = span / Math.max(2, target);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  return step * magnitude;
}

export function buildPlot(spec: PlotSpec): BuiltPlot {
  const notes: string[] = [];
  const width = Math.min(900, Math.max(240, Math.round(Number(spec.width) || 520)));
  const height = Math.min(700, Math.max(180, Math.round(Number(spec.height) || 320)));
  const ctx = defaultContext(spec.angle ?? 'deg');
  const xMin = Number.isFinite(Number(spec.xMin)) ? Number(spec.xMin) : -10;
  const xMaxRaw = Number.isFinite(Number(spec.xMax)) ? Number(spec.xMax) : 10;
  const xMax = xMaxRaw > xMin ? xMaxRaw : xMin + 20;

  const functions = (Array.isArray(spec.functions) ? spec.functions : []).slice(0, 5);
  const points = (Array.isArray(spec.points) ? spec.points : []).slice(0, 40).filter((p) => Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y)));

  interface Curve {
    label: string;
    color: string;
    samples: Array<{ x: number; y: number | null }>;
  }
  const curves: Curve[] = [];
  const samples = 480;
  for (const [index, entry] of functions.entries()) {
    const raw = String(entry?.expr ?? '').trim();
    if (!raw) continue;
    let node: Node;
    try {
      node = parseExpression(raw.replace(/^\s*[yf]\s*(\(\s*x\s*\))?\s*=\s*/i, ''));
    } catch (err) {
      notes.push(`${raw}: ${err instanceof Error ? err.message : 'could not be read'}`);
      continue;
    }
    const variables = variablesOf(node).filter((name) => name.toLowerCase() !== 'x');
    if (variables.length) {
      notes.push(`${raw}: I do not know what ${variables.join(', ')} is, so it was left out.`);
      continue;
    }
    const curve: Curve = { label: String(entry?.label ?? raw).slice(0, 40), color: typeof entry?.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(entry.color) ? entry.color : PLOT_COLORS[index % PLOT_COLORS.length], samples: [] };
    for (let i = 0; i <= samples; i++) {
      const x = xMin + ((xMax - xMin) * i) / samples;
      let y: number | null = null;
      try {
        const value = evaluateNode(node, { ...ctx, vars: { ...ctx.vars, x } });
        y = Number.isFinite(value) ? value : null;
      } catch {
        y = null;
      }
      curve.samples.push({ x, y });
    }
    curves.push(curve);
  }

  // Y range: what was asked for, otherwise what the curves need.
  let yMin = Number.isFinite(Number(spec.yMin)) ? Number(spec.yMin) : NaN;
  let yMax = Number.isFinite(Number(spec.yMax)) ? Number(spec.yMax) : NaN;
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    const values = [...curves.flatMap((curve) => curve.samples.map((sample) => sample.y)), ...points.map((p) => Number(p.y))].filter((value): value is number => value !== null && Number.isFinite(value));
    if (values.length) {
      const sorted = [...values].sort((a, b) => a - b);
      // Ignore the extreme tails so one asymptote does not flatten everything.
      const low = sorted[Math.floor(sorted.length * 0.02)];
      const high = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))];
      const padding = Math.max(1, (high - low) * 0.12);
      if (!Number.isFinite(yMin)) yMin = low - padding;
      if (!Number.isFinite(yMax)) yMax = high + padding;
    }
  }
  if (!Number.isFinite(yMin)) yMin = -10;
  if (!Number.isFinite(yMax)) yMax = 10;
  if (yMax - yMin < 1e-6) {
    yMin -= 1;
    yMax += 1;
  }

  const left = 44;
  const bottom = 30;
  const top = 12;
  const right = 14;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const toX = (x: number) => round(left + ((x - xMin) / (xMax - xMin)) * plotWidth);
  const toY = (y: number) => round(top + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight);

  const parts: string[] = [];
  const xStep = niceStep(xMax - xMin);
  const yStep = niceStep(yMax - yMin, 6);
  if (spec.grid !== false) {
    const lines: string[] = [];
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax + 1e-9; x += xStep) lines.push(`M${toX(x)} ${top}V${top + plotHeight}`);
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax + 1e-9; y += yStep) lines.push(`M${left} ${toY(y)}H${left + plotWidth}`);
    parts.push(`<path d="${lines.join('')}" stroke="currentColor" stroke-width="0.5" opacity="0.16" fill="none"/>`);
  }

  // Axes, drawn at zero when it is in view.
  const axisY = yMin <= 0 && yMax >= 0 ? toY(0) : top + plotHeight;
  const axisX = xMin <= 0 && xMax >= 0 ? toX(0) : left;
  parts.push(`<line x1="${left}" y1="${axisY}" x2="${left + plotWidth}" y2="${axisY}" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>`);
  parts.push(`<line x1="${axisX}" y1="${top}" x2="${axisX}" y2="${top + plotHeight}" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>`);

  const tick = (value: number, axis: 'x' | 'y') => {
    const label = formatDecimal(Number(value.toFixed(6)), 4);
    if (axis === 'x') {
      const x = toX(value);
      return `<line x1="${x}" y1="${axisY - 3}" x2="${x}" y2="${axisY + 3}" stroke="currentColor" stroke-width="1" opacity="0.7"/><text x="${x}" y="${axisY + 15}" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">${escapeHtml(label)}</text>`;
    }
    const y = toY(value);
    return `<line x1="${axisX - 3}" y1="${y}" x2="${axisX + 3}" y2="${y}" stroke="currentColor" stroke-width="1" opacity="0.7"/><text x="${axisX - 7}" y="${y + 3.5}" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.75">${escapeHtml(label)}</text>`;
  };
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax + 1e-9; x += xStep) if (Math.abs(x) > 1e-9 || axisX === left) parts.push(tick(x, 'x'));
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax + 1e-9; y += yStep) if (Math.abs(y) > 1e-9) parts.push(tick(y, 'y'));

  // Curves, cut where they leave the box or jump across an asymptote.
  for (const curve of curves) {
    const segments: string[] = [];
    let current: string[] = [];
    let previous: { x: number; y: number } | null = null;
    const jumpLimit = (yMax - yMin) * 1.5;
    for (const sample of curve.samples) {
      const inside = sample.y !== null && sample.y >= yMin - (yMax - yMin) * 2 && sample.y <= yMax + (yMax - yMin) * 2;
      if (!inside || sample.y === null) {
        if (current.length > 1) segments.push(current.join(''));
        current = [];
        previous = null;
        continue;
      }
      const jumped = previous && Math.abs(sample.y - previous.y) > jumpLimit;
      if (jumped) {
        if (current.length > 1) segments.push(current.join(''));
        current = [];
      }
      current.push(`${current.length === 0 ? 'M' : 'L'}${toX(sample.x)} ${toY(sample.y)}`);
      previous = { x: sample.x, y: sample.y };
    }
    if (current.length > 1) segments.push(current.join(''));
    if (segments.length) {
      parts.push(`<path d="${segments.join('')}" fill="none" stroke="${curve.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#plot-area)"/>`);
    }
  }

  for (const point of points) {
    const x = toX(Number(point.x));
    const y = toY(Number(point.y));
    parts.push(`<circle cx="${x}" cy="${y}" r="3.4" fill="${PLOT_COLORS[1]}"/>`);
    if (point.label) parts.push(`<text x="${x + 7}" y="${y - 6}" font-size="11.5" fill="currentColor">${escapeHtml(mathToPlain(String(point.label)))}</text>`);
  }

  if (spec.xLabel) parts.push(`<text x="${left + plotWidth}" y="${axisY - 6}" text-anchor="end" font-size="11.5" font-style="italic" fill="currentColor">${escapeHtml(mathToPlain(String(spec.xLabel)))}</text>`);
  if (spec.yLabel) parts.push(`<text x="${axisX + 6}" y="${top + 10}" font-size="11.5" font-style="italic" fill="currentColor">${escapeHtml(mathToPlain(String(spec.yLabel)))}</text>`);

  if (curves.length > 1 || (curves.length === 1 && curves[0].label)) {
    const legend = curves
      .map((curve, index) => {
        const y = top + 12 + index * 16;
        return `<line x1="${left + 10}" y1="${y - 4}" x2="${left + 28}" y2="${y - 4}" stroke="${curve.color}" stroke-width="2"/><text x="${left + 34}" y="${y}" font-size="11.5" fill="currentColor">${escapeHtml(mathToPlain(curve.label))}</text>`;
      })
      .join('');
    parts.push(legend);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="m-plot" role="img" aria-label="graph"><defs><clipPath id="plot-area"><rect x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}"/></clipPath></defs>${parts.join('')}</svg>`;
  return { svg, width, height, notes };
}
