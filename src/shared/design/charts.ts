import type { ChartKind, ChartSpec, DesignTheme } from '../types/design';
import { chartPalette, fontStack, readableOn, resolveColor } from './theme';

export const CHART_KINDS: ChartKind[] = ['bar', 'hbar', 'line', 'area', 'pie', 'donut'];

export const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** 1234 → "1.2K", 0.5 → "0.5". */
export function formatValue(value: number, unit = ''): string {
  const abs = Math.abs(value);
  let text: string;
  if (abs >= 1e9) text = `${(value / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1 })}B`;
  else if (abs >= 1e6) text = `${(value / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`;
  else if (abs >= 1e4) text = `${(value / 1e3).toLocaleString('en-US', { maximumFractionDigits: 1 })}K`;
  else text = value.toLocaleString('en-US', { maximumFractionDigits: abs < 10 ? 2 : 1 });
  return `${text}${unit}`;
}

/** Round axis bounds and a step for about `count` ticks. */
export function niceScale(min: number, max: number, count = 5): { min: number; max: number; step: number } {
  if (min === max) {
    if (max === 0) return { min: 0, max: 1, step: 0.25 };
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  const range = max - min;
  const rough = range / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

/** Coerces loose chart input (Chart.js-style datasets, a single values array, string numbers) into a spec. */
export function normalizeChart(input: unknown): ChartSpec {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const data = (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : raw) as Record<string, unknown>;
  const kindText = String(raw.kind ?? raw.type ?? raw.chart_type ?? 'bar').toLowerCase();
  const kind: ChartKind =
    kindText.includes('donut') || kindText.includes('doughnut') ? 'donut'
    : kindText.includes('pie') ? 'pie'
    : kindText.includes('area') ? 'area'
    : kindText.includes('line') ? 'line'
    : kindText.includes('hbar') || kindText.includes('horizontal') ? 'hbar'
    : 'bar';
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.eE+-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  let labels = Array.isArray(data.labels) ? data.labels.map((l) => String(l ?? '')) : Array.isArray(data.categories) ? data.categories.map(String) : [];
  const rawSeries = (Array.isArray(data.series) ? data.series : Array.isArray(data.datasets) ? data.datasets : null) as unknown[] | null;
  let series: ChartSpec['series'] = [];
  if (rawSeries) {
    series = rawSeries.map((s, i) => {
      if (Array.isArray(s)) return { name: `Series ${i + 1}`, values: s.map(num) };
      const o = (s ?? {}) as Record<string, unknown>;
      const values = Array.isArray(o.values) ? o.values : Array.isArray(o.data) ? o.data : [];
      const color = typeof o.color === 'string' ? o.color : typeof o.backgroundColor === 'string' ? o.backgroundColor : undefined;
      return { name: String(o.name ?? o.label ?? `Series ${i + 1}`), values: values.map(num), ...(color ? { color } : {}) };
    });
  } else if (Array.isArray(data.values)) {
    series = [{ name: String(raw.title ?? 'Values'), values: data.values.map(num) }];
  } else if (Array.isArray(data.points ?? data.items)) {
    // [{label, value}] pairs
    const points = (data.points ?? data.items) as Array<Record<string, unknown>>;
    labels = points.map((p) => String(p.label ?? p.name ?? ''));
    series = [{ name: String(raw.title ?? 'Values'), values: points.map((p) => num(p.value ?? p.y)) }];
  }
  series = series.filter((s) => s.values.length > 0).slice(0, 8);
  const longest = Math.max(0, ...series.map((s) => s.values.length));
  if (labels.length < longest) labels = [...labels, ...Array.from({ length: longest - labels.length }, (_, i) => String(labels.length + i + 1))];
  labels = labels.slice(0, 60).map((l) => l.slice(0, 60));
  series = series.map((s) => ({ ...s, name: s.name.slice(0, 60), values: s.values.slice(0, labels.length) }));
  return {
    kind,
    labels,
    series,
    ...(typeof raw.title === 'string' && raw.title.trim() ? { title: raw.title.trim().slice(0, 120) } : {}),
    ...(typeof raw.legend === 'boolean' ? { legend: raw.legend } : {}),
    ...(typeof (raw.values ?? raw.show_values ?? raw.showValues) === 'boolean' ? { values: Boolean(raw.values ?? raw.show_values ?? raw.showValues) } : {}),
    ...(typeof raw.unit === 'string' ? { unit: raw.unit.slice(0, 8) } : {}),
    ...(raw.stacked === true ? { stacked: true } : {}),
  };
}

export interface ChartRenderOptions {
  theme: DesignTheme;
  /** Label color (default theme text). */
  color?: string;
  /** Font name. */
  font?: string;
}

function truncate(text: string, maxChars: number): string {
  if (maxChars < 2) return '';
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text;
}

/** A self-contained SVG for a chart; the same markup is used on the canvas, in PNG/PDF exports and in PDF documents. */
export function chartSvg(spec: ChartSpec, width: number, height: number, options: ChartRenderOptions): string {
  const { theme } = options;
  const w = Math.max(40, width);
  const h = Math.max(40, height);
  const text = resolveColor(options.color, theme, 'text');
  const muted = resolveColor(undefined, theme, 'muted');
  const font = escapeXml(fontStack(options.font ?? theme.fonts.body));
  const palette = chartPalette(theme.colors);
  const colorOf = (i: number) => (spec.series[i]?.color ? resolveColor(spec.series[i].color, theme, 'primary') : palette[i % palette.length]);
  const label = clamp(Math.min(w, h) * 0.04, 9, 30);
  const out: string[] = [];
  let top = label * 0.4;
  let bottom = h - label * 0.4;
  const circular = spec.kind === 'pie' || spec.kind === 'donut';
  const showLegend = spec.legend ?? (spec.series.length > 1 || circular);

  if (spec.title) {
    const size = clamp(label * 1.3, 11, 40);
    out.push(`<text x="${r1(w / 2)}" y="${r1(top + size)}" text-anchor="middle" font-size="${r1(size)}" font-weight="600" fill="${text}">${escapeXml(truncate(spec.title, Math.floor(w / (size * 0.55))))}</text>`);
    top += size * 1.6;
  }

  const legendItems = circular ? spec.labels.map((name, i) => ({ name, color: palette[i % palette.length] })) : spec.series.map((s, i) => ({ name: s.name, color: colorOf(i) }));
  if (showLegend && legendItems.length) {
    const rowHeight = label * 1.6;
    const widths = legendItems.map((item) => label * 1.6 + Math.min(item.name.length, 24) * label * 0.55 + label);
    const rows: Array<Array<{ name: string; color: string; width: number }>> = [[]];
    let rowWidth = 0;
    legendItems.forEach((item, i) => {
      if (rowWidth + widths[i] > w * 0.95 && rows[rows.length - 1].length) {
        rows.push([]);
        rowWidth = 0;
      }
      rows[rows.length - 1].push({ ...item, width: widths[i] });
      rowWidth += widths[i];
    });
    const shown = rows.slice(0, 3);
    bottom -= shown.length * rowHeight;
    shown.forEach((row, ri) => {
      const total = row.reduce((sum, item) => sum + item.width, 0);
      let x = (w - total) / 2;
      const y = bottom + ri * rowHeight + rowHeight * 0.75;
      for (const item of row) {
        out.push(`<rect x="${r1(x)}" y="${r1(y - label * 0.8)}" width="${r1(label)}" height="${r1(label)}" rx="${r1(label * 0.2)}" fill="${item.color}"/>`);
        out.push(`<text x="${r1(x + label * 1.4)}" y="${r1(y)}" font-size="${r1(label)}" fill="${text}">${escapeXml(truncate(item.name, 24))}</text>`);
        x += item.width;
      }
    });
    bottom -= label * 0.4;
  }

  if (circular) {
    const values = (spec.series[0]?.values ?? []).map((v) => Math.max(0, v));
    const total = values.reduce((a, b) => a + b, 0);
    const cx = w / 2;
    const cy = (top + bottom) / 2;
    const radius = Math.max(10, Math.min(w * 0.45, (bottom - top) / 2) * 0.92);
    const inner = spec.kind === 'donut' ? radius * 0.58 : 0;
    if (total <= 0) {
      out.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(radius)}" fill="none" stroke="${muted}" stroke-opacity="0.4"/>`);
    } else {
      let angle = -Math.PI / 2;
      values.forEach((value, i) => {
        if (value <= 0) return;
        const sweep = (value / total) * Math.PI * 2;
        const end = angle + sweep;
        const color = palette[i % palette.length];
        if (sweep >= Math.PI * 2 - 1e-6) {
          out.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(radius)}" fill="${color}"/>`);
        } else {
          const large = sweep > Math.PI ? 1 : 0;
          const p = (a: number, r: number) => `${r1(cx + Math.cos(a) * r)} ${r1(cy + Math.sin(a) * r)}`;
          const path = inner
            ? `M ${p(angle, radius)} A ${r1(radius)} ${r1(radius)} 0 ${large} 1 ${p(end, radius)} L ${p(end, inner)} A ${r1(inner)} ${r1(inner)} 0 ${large} 0 ${p(angle, inner)} Z`
            : `M ${r1(cx)} ${r1(cy)} L ${p(angle, radius)} A ${r1(radius)} ${r1(radius)} 0 ${large} 1 ${p(end, radius)} Z`;
          out.push(`<path d="${path}" fill="${color}" stroke="${resolveColor('background', theme)}" stroke-width="${r1(Math.max(1, radius * 0.012))}"/>`);
        }
        const share = value / total;
        if ((spec.values ?? true) && share >= 0.06) {
          const mid = angle + sweep / 2;
          const at = inner ? (radius + inner) / 2 : radius * 0.62;
          const fg = readableOn(color);
          out.push(`<text x="${r1(cx + Math.cos(mid) * at)}" y="${r1(cy + Math.sin(mid) * at + label * 0.35)}" text-anchor="middle" font-size="${r1(label)}" font-weight="600" fill="${fg}">${spec.unit && spec.values ? escapeXml(formatValue(value, spec.unit)) : `${Math.round(share * 100)}%`}</text>`);
        }
        angle = end;
      });
    }
    return wrap(out, w, h, font);
  }

  const horizontal = spec.kind === 'hbar';
  const n = spec.labels.length;
  const seriesCount = Math.max(1, spec.series.length);
  const stackable = spec.stacked && (spec.kind === 'bar' || spec.kind === 'hbar' || spec.kind === 'area');
  let dataMin = 0;
  let dataMax = 0;
  for (let i = 0; i < n; i++) {
    if (stackable) {
      const pos = spec.series.reduce((sum, s) => sum + Math.max(0, s.values[i] ?? 0), 0);
      const neg = spec.series.reduce((sum, s) => sum + Math.min(0, s.values[i] ?? 0), 0);
      dataMax = Math.max(dataMax, pos);
      dataMin = Math.min(dataMin, neg);
    } else {
      for (const s of spec.series) {
        dataMax = Math.max(dataMax, s.values[i] ?? 0);
        dataMin = Math.min(dataMin, s.values[i] ?? 0);
      }
    }
  }
  const scale = niceScale(dataMin, dataMax, horizontal ? Math.max(2, Math.floor(w / 140)) : Math.max(2, Math.floor((bottom - top) / (label * 3))));
  const ticks: number[] = [];
  for (let v = scale.min; v <= scale.max + scale.step / 2; v += scale.step) ticks.push(Math.round(v * 1e6) / 1e6);
  const tickText = ticks.map((t) => formatValue(t, spec.unit));
  const longestLabel = Math.max(1, ...spec.labels.map((l) => l.length));

  if (horizontal) {
    const left = Math.min(w * 0.35, label * 0.58 * Math.min(longestLabel, 18) + label);
    const plotBottom = bottom - label * 1.8;
    const right = w - label * (spec.values ? 3 : 1);
    const x = (v: number) => left + ((v - scale.min) / (scale.max - scale.min)) * (right - left);
    ticks.forEach((t, i) => {
      out.push(`<line x1="${r1(x(t))}" y1="${r1(top)}" x2="${r1(x(t))}" y2="${r1(plotBottom)}" stroke="${muted}" stroke-opacity="${t === 0 ? 0.6 : 0.22}"/>`);
      out.push(`<text x="${r1(x(t))}" y="${r1(plotBottom + label * 1.4)}" text-anchor="middle" font-size="${r1(label * 0.9)}" fill="${muted}">${escapeXml(tickText[i])}</text>`);
    });
    const band = (plotBottom - top) / Math.max(1, n);
    spec.labels.forEach((name, i) => {
      const cy = top + band * (i + 0.5);
      out.push(`<text x="${r1(left - label * 0.5)}" y="${r1(cy + label * 0.35)}" text-anchor="end" font-size="${r1(label)}" fill="${text}">${escapeXml(truncate(name, 18))}</text>`);
      const inner = band * 0.72;
      let stackPos = 0;
      let stackNeg = 0;
      spec.series.forEach((s, si) => {
        const value = s.values[i] ?? 0;
        const thickness = stackable ? inner : inner / seriesCount;
        const y0 = stackable ? cy - inner / 2 : cy - inner / 2 + si * thickness;
        const base = stackable ? (value >= 0 ? stackPos : stackNeg) : 0;
        const a = x(base);
        const b = x(base + value);
        if (stackable) {
          if (value >= 0) stackPos += value;
          else stackNeg += value;
        }
        out.push(`<rect x="${r1(Math.min(a, b))}" y="${r1(y0 + thickness * 0.06)}" width="${r1(Math.abs(b - a))}" height="${r1(thickness * 0.88)}" rx="${r1(Math.min(4, thickness * 0.15))}" fill="${colorOf(si)}"/>`);
        if (spec.values && !stackable) out.push(`<text x="${r1(Math.max(a, b) + label * 0.3)}" y="${r1(y0 + thickness / 2 + label * 0.35)}" font-size="${r1(label * 0.85)}" fill="${text}">${escapeXml(formatValue(value, spec.unit))}</text>`);
      });
    });
    return wrap(out, w, h, font);
  }

  const left = label * 0.6 * Math.max(...tickText.map((t) => t.length)) + label * 0.8;
  const right = w - label * 0.6;
  const plotTop = top + (spec.values ? label * 1.2 : label * 0.4);
  const plotBottom = bottom - label * 1.9;
  const y = (v: number) => plotBottom - ((v - scale.min) / (scale.max - scale.min)) * (plotBottom - plotTop);
  ticks.forEach((t, i) => {
    out.push(`<line x1="${r1(left)}" y1="${r1(y(t))}" x2="${r1(right)}" y2="${r1(y(t))}" stroke="${muted}" stroke-opacity="${t === 0 ? 0.6 : 0.22}"/>`);
    out.push(`<text x="${r1(left - label * 0.5)}" y="${r1(y(t) + label * 0.35)}" text-anchor="end" font-size="${r1(label * 0.9)}" fill="${muted}">${escapeXml(tickText[i])}</text>`);
  });
  const band = (right - left) / Math.max(1, n);
  const maxLabelChars = Math.max(2, Math.floor(band / (label * 0.55)));
  const labelStep = Math.max(1, Math.ceil((Math.min(longestLabel, 12) * label * 0.55) / band));
  spec.labels.forEach((name, i) => {
    if (i % labelStep !== 0) return;
    const cx = spec.kind === 'bar' ? left + band * (i + 0.5) : left + (n > 1 ? (i / (n - 1)) * (right - left) : (right - left) / 2);
    out.push(`<text x="${r1(cx)}" y="${r1(plotBottom + label * 1.4)}" text-anchor="middle" font-size="${r1(label)}" fill="${text}">${escapeXml(truncate(name, maxLabelChars * labelStep))}</text>`);
  });

  if (spec.kind === 'bar') {
    spec.labels.forEach((_, i) => {
      const inner = band * 0.7;
      let stackPos = 0;
      let stackNeg = 0;
      spec.series.forEach((s, si) => {
        const value = s.values[i] ?? 0;
        const thickness = stackable ? inner : inner / seriesCount;
        const x0 = stackable ? left + band * i + (band - inner) / 2 : left + band * i + (band - inner) / 2 + si * thickness;
        const base = stackable ? (value >= 0 ? stackPos : stackNeg) : 0;
        const a = y(base);
        const b = y(base + value);
        if (stackable) {
          if (value >= 0) stackPos += value;
          else stackNeg += value;
        }
        out.push(`<rect x="${r1(x0 + thickness * 0.06)}" y="${r1(Math.min(a, b))}" width="${r1(thickness * 0.88)}" height="${r1(Math.abs(b - a))}" rx="${r1(Math.min(4, thickness * 0.12))}" fill="${colorOf(si)}"/>`);
        if (spec.values && !stackable) out.push(`<text x="${r1(x0 + thickness / 2)}" y="${r1(Math.min(a, b) - label * 0.4)}" text-anchor="middle" font-size="${r1(label * 0.85)}" fill="${text}">${escapeXml(formatValue(value, spec.unit))}</text>`);
      });
    });
    return wrap(out, w, h, font);
  }

  // line and area
  const px = (i: number) => left + (n > 1 ? (i / (n - 1)) * (right - left) : (right - left) / 2);
  const stroke = clamp(Math.min(w, h) * 0.006, 1.5, 6);
  const cumulative = new Array<number>(n).fill(0);
  spec.series.forEach((s, si) => {
    const color = colorOf(si);
    const points = spec.labels.map((_, i) => {
      const value = s.values[i] ?? 0;
      const base = stackable ? cumulative[i] : 0;
      return { x: px(i), y: y(base + value), base: y(base), value };
    });
    if (stackable) spec.labels.forEach((_, i) => (cumulative[i] += s.values[i] ?? 0));
    const line = points.map((p, i) => `${i ? 'L' : 'M'} ${r1(p.x)} ${r1(p.y)}`).join(' ');
    if (spec.kind === 'area' && points.length) {
      const back = [...points].reverse().map((p) => `L ${r1(p.x)} ${r1(stackable ? p.base : y(Math.max(scale.min, Math.min(0, scale.max))))}`).join(' ');
      out.push(`<path d="${line} ${back} Z" fill="${color}" fill-opacity="${stackable ? 0.55 : 0.18}"/>`);
    }
    out.push(`<path d="${line}" fill="none" stroke="${color}" stroke-width="${r1(stroke)}" stroke-linejoin="round" stroke-linecap="round"/>`);
    if (n <= 24) for (const p of points) out.push(`<circle cx="${r1(p.x)}" cy="${r1(p.y)}" r="${r1(stroke * 1.4)}" fill="${color}"/>`);
    if (spec.values && n <= 16) for (const p of points) out.push(`<text x="${r1(p.x)}" y="${r1(p.y - label * 0.7)}" text-anchor="middle" font-size="${r1(label * 0.85)}" fill="${text}">${escapeXml(formatValue(p.value, spec.unit))}</text>`);
  });
  return wrap(out, w, h, font);
}

function wrap(parts: string[], w: number, h: number, font: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r1(w)}" height="${r1(h)}" viewBox="0 0 ${r1(w)} ${r1(h)}" font-family="${font}">${parts.join('')}</svg>`;
}
