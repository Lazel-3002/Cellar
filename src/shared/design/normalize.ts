import type { Artboard, Design, DesignElement, DesignElementType, DesignFormat, DesignTheme, DesignTransition, Gradient, ImageCrop, ImageFilters, LinkTarget, TextElement } from '../types/design';
import { normalizeChart } from './charts';
import { sanitizeSvg } from './svg';
import { estimateTextHeight } from './text';
import { customizeTheme, defaultTheme, fontName, normalizeColor, parseSize, THEMES } from './theme';

export const LIMITS = { artboards: 80, elements: 400, text: 20_000, dataUrl: 3_000_000 };

const TRANSITIONS: DesignTransition[] = ['fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down'];

/** A `DesignTransition` from loose text ("fade", "slide left", "slideLeft"…), or undefined when it doesn't match one. */
export function normalizeTransition(value: unknown): DesignTransition | undefined {
  const text = String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  return (TRANSITIONS as string[]).includes(text) ? (text as DesignTransition) : undefined;
}

const TYPE_ALIASES: Record<string, DesignElementType> = {
  text: 'text',
  textbox: 'text',
  'text-box': 'text',
  heading: 'text',
  title: 'text',
  subtitle: 'text',
  paragraph: 'text',
  label: 'text',
  caption: 'text',
  bullets: 'text',
  list: 'text',
  rect: 'rect',
  rectangle: 'rect',
  box: 'rect',
  shape: 'rect',
  square: 'rect',
  card: 'rect',
  button: 'rect',
  background: 'rect',
  ellipse: 'ellipse',
  circle: 'ellipse',
  oval: 'ellipse',
  dot: 'ellipse',
  line: 'line',
  divider: 'line',
  rule: 'line',
  separator: 'line',
  image: 'image',
  img: 'image',
  picture: 'image',
  photo: 'image',
  chart: 'chart',
  graph: 'chart',
  plot: 'chart',
  svg: 'svg',
  icon: 'svg',
  logo: 'svg',
  illustration: 'svg',
  vector: 'svg',
};

/** Other names models use for element fields. */
const KEY_ALIASES: Record<string, string> = {
  left: 'x',
  top: 'y',
  width: 'w',
  height: 'h',
  content: 'text',
  value: 'text',
  label: 'text',
  font_size: 'size',
  fontsize: 'size',
  fontSize: 'size',
  font_family: 'font',
  fontFamily: 'font',
  fontface: 'font',
  fontFace: 'font',
  font_weight: 'weight',
  fontWeight: 'weight',
  text_align: 'align',
  textAlign: 'align',
  alignment: 'align',
  vertical_align: 'valign',
  verticalAlign: 'valign',
  line_height: 'lineHeight',
  lineheight: 'lineHeight',
  letter_spacing: 'letterSpacing',
  tracking: 'letterSpacing',
  text_color: 'color',
  textColor: 'color',
  font_color: 'color',
  fontColor: 'color',
  background: 'fill',
  background_color: 'fill',
  backgroundColor: 'fill',
  bg: 'fill',
  fill_color: 'fill',
  fillColor: 'fill',
  border_radius: 'radius',
  borderRadius: 'radius',
  corner_radius: 'radius',
  cornerRadius: 'radius',
  rounded: 'radius',
  border_color: 'stroke',
  borderColor: 'stroke',
  stroke_color: 'stroke',
  strokeColor: 'stroke',
  border_width: 'strokeWidth',
  borderWidth: 'strokeWidth',
  stroke_width: 'strokeWidth',
  thickness: 'strokeWidth',
  url: 'src',
  image: 'src',
  path: 'src',
  data: 'chart',
  angle: 'rotation',
  rotate: 'rotation',
  alpha: 'opacity',
  text_transform: 'textTransform',
};

const WEIGHTS: Record<string, number> = { thin: 200, extralight: 200, light: 300, normal: 400, regular: 400, medium: 500, semibold: 600, 'semi-bold': 600, demibold: 600, bold: 700, extrabold: 800, black: 900, heavy: 900 };

export interface NormalizeContext {
  width: number;
  height: number;
  theme: DesignTheme;
  /** Element ids already used in the design; new ids are added to it. */
  ids: Set<string>;
}

const PREFIX: Record<DesignElementType, string> = { text: 't', rect: 'r', ellipse: 'e', line: 'l', image: 'i', chart: 'c', svg: 's' };

export function newElementId(type: DesignElementType, ids: Set<string>): string {
  let n = 1;
  while (ids.has(`${PREFIX[type]}${n}`)) n++;
  const id = `${PREFIX[type]}${n}`;
  ids.add(id);
  return id;
}

export function newArtboardId(used: Iterable<string>): string {
  const taken = new Set(used);
  let n = 1;
  while (taken.has(`a${n}`)) n++;
  return `a${n}`;
}

let groupCounter = 0;
/** A fresh id for a new group of elements. */
export function newGroupId(): string {
  groupCounter += 1;
  return `g${Date.now().toString(36)}${(groupCounter % 1000).toString(36)}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 120, "120", "120px", "50%" (of `relative`). */
function length(value: unknown, relative: number): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const text = value.trim().toLowerCase();
  const pct = /^(-?[\d.]+)\s*%$/.exec(text);
  if (pct) return (Number(pct[1]) / 100) * relative;
  const px = /^(-?[\d.]+)\s*(px|pt)?$/.exec(text);
  if (px) return Number(px[1]) * (px[2] === 'pt' ? 4 / 3 : 1);
  return undefined;
}

const bool = (value: unknown) => value === true || value === 'true' || value === 1;

/** Element fields under their canonical names. */
export function canonicalFields(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const canonical = KEY_ALIASES[key] ?? KEY_ALIASES[key.toLowerCase()] ?? key;
    if (!(canonical in out) || key === canonical) out[canonical] = value;
  }
  if (out.style && typeof out.style === 'object') {
    for (const [key, value] of Object.entries(canonicalFields(out.style as Record<string, unknown>))) if (!(key in out)) out[key] = value;
    delete out.style;
  }
  return out;
}

function gradient(value: unknown): Gradient | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const g = value as Record<string, unknown>;
  const angle = Number(g.angle ?? 180);
  const type = String(g.type ?? '').toLowerCase() === 'radial' ? 'radial' : undefined;
  const rawStops = Array.isArray(g.stops) ? g.stops : Array.isArray(g.colors) && g.colors.length > 2 ? g.colors.map((c) => ({ color: c })) : undefined;
  if (rawStops) {
    const stops = rawStops
      .map((s, i) => {
        const entry: Record<string, unknown> = s && typeof s === 'object' ? (s as Record<string, unknown>) : { color: s };
        const color = normalizeColor(entry.color ?? entry.value);
        if (!color) return undefined;
        const at = Number(entry.at ?? entry.offset ?? entry.position ?? i / Math.max(1, rawStops.length - 1));
        return { color, at: Number.isFinite(at) ? clamp(at > 1 ? at / 100 : at, 0, 1) : i / Math.max(1, rawStops.length - 1) };
      })
      .filter((s): s is { color: string; at: number } => !!s);
    if (stops.length >= 2) return { angle: Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 180, ...(type ? { type } : {}), stops };
  }
  const colors = Array.isArray(g.colors) ? g.colors : [];
  const from = normalizeColor(g.from ?? colors[0]);
  const to = normalizeColor(g.to ?? colors[1]);
  if (!from || !to) return undefined;
  return { from, to, angle: Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 180, ...(type ? { type } : {}) };
}

function color(value: unknown): string | undefined {
  return normalizeColor(value) ?? undefined;
}

/** A hotspot target: `{kind, artboard}`/`{kind, url}`, or the shorthand `href`/`url` fields meaning a URL link. */
function linkTarget(raw: Record<string, unknown>): LinkTarget | undefined {
  const value = raw.link;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const kind = String(v.kind ?? (v.artboard !== undefined ? 'artboard' : v.url !== undefined ? 'url' : '')).toLowerCase();
    if (kind === 'artboard' && typeof v.artboard === 'string' && v.artboard.trim()) return { kind: 'artboard', artboard: v.artboard.trim().slice(0, 80) };
    if (kind === 'url' && typeof v.url === 'string' && v.url.trim()) return { kind: 'url', url: v.url.trim().slice(0, 2000) };
    return undefined;
  }
  // Not `url`: that key is already claimed as an alias for an image's own `src`.
  if (typeof raw.href === 'string' && raw.href.trim()) return { kind: 'url', url: raw.href.trim().slice(0, 2000) };
  return undefined;
}

/** A crop rectangle: 0–1 fractions of the source image (or 0–100 as percentages), kept inside the image's bounds. */
function imageCrop(value: unknown): ImageCrop | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const frac = (n: unknown, fallback: number) => {
    const num = Number(n);
    return Number.isFinite(num) ? clamp(num > 1 ? num / 100 : num, 0, 1) : fallback;
  };
  const w = frac(v.w ?? v.width, 1);
  const h = frac(v.h ?? v.height, 1);
  if (w <= 0 || h <= 0) return undefined;
  const x = clamp(frac(v.x, 0), 0, 1 - w);
  const y = clamp(frac(v.y, 0), 0, 1 - h);
  return { x, y, w, h };
}

/** Brightness/contrast/saturate as CSS `filter()` multipliers (1 = unchanged). */
function imageFilters(value: unknown): ImageFilters | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const num = (n: unknown) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return undefined;
    // A value over 3 is almost certainly a percentage ("120" meaning 120%) rather than a literal multiplier.
    return clamp(x > 3 ? x / 100 : x, 0, 3);
  };
  const out: ImageFilters = {};
  const brightness = num(v.brightness);
  const contrast = num(v.contrast);
  const saturate = num(v.saturate ?? v.saturation);
  if (brightness !== undefined) out.brightness = brightness;
  if (contrast !== undefined) out.contrast = contrast;
  if (saturate !== undefined) out.saturate = saturate;
  return Object.keys(out).length ? out : undefined;
}

function resolveImageSrc(value: unknown): string {
  if (typeof value !== 'string') return '';
  const src = value.trim();
  if (/^attachment:[\w-]{8,64}$/.test(src)) return src;
  // Images supplied by the caller of an export (documents built from files).
  if (/^asset:[\w.-]{1,120}$/.test(src)) return src;
  if (/^cellar-attachment:\/\/image\/[\w-]{8,64}$/.test(src)) return `attachment:${src.split('/').pop()}`;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(src) && src.length <= LIMITS.dataUrl) return src.replace(/\s+/g, '');
  return '';
}

/**
 * Turns loose element input into a valid element. Positions may be numbers, "50%" or words like
 * "center"; colors may be theme names or hex; unknown fields are ignored.
 */
export function normalizeElement(input: unknown, ctx: NormalizeContext): { element?: DesignElement; error?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Each element must be an object.' };
  const raw = canonicalFields(input as Record<string, unknown>);
  const typeText = String(raw.type ?? (raw.chart ? 'chart' : raw.svg ? 'svg' : raw.src ? 'image' : raw.text !== undefined ? 'text' : '')).trim().toLowerCase();
  let type = TYPE_ALIASES[typeText];
  if (typeText === 'shape' && typeof raw.shape === 'string' && TYPE_ALIASES[raw.shape.toLowerCase()]) type = TYPE_ALIASES[raw.shape.toLowerCase()];
  if (!type) return { error: `Unknown element type "${typeText || '(missing)'}". Use text, rect, ellipse, line, image, chart or svg.` };
  const W = ctx.width;
  const H = ctx.height;
  const base = Math.sqrt(W * H);

  const opacityRaw = raw.opacity === undefined ? undefined : Number(raw.opacity);
  const common = {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : undefined,
    rotation: Number.isFinite(Number(raw.rotation)) && Number(raw.rotation) ? clamp(Number(raw.rotation), -360, 360) : undefined,
    opacity: opacityRaw !== undefined && Number.isFinite(opacityRaw) ? clamp(opacityRaw > 1 ? opacityRaw / 100 : opacityRaw, 0, 1) : undefined,
    locked: bool(raw.locked) || undefined,
    hidden: bool(raw.hidden) || undefined,
    groupId: typeof raw.groupId === 'string' && raw.groupId.trim() ? raw.groupId.trim().replace(/[^\w-]/g, '').slice(0, 40) : undefined,
    link: linkTarget(raw),
  };

  let element: DesignElement;
  const wRaw = length(raw.w, W);
  let hRaw = length(raw.h, H);
  if (type === 'text') {
    const text = String(raw.text ?? raw.title ?? '').slice(0, LIMITS.text);
    let list: TextElement['list'];
    let body = text;
    if (Array.isArray(raw.items ?? raw.bullets)) {
      body = ((raw.items ?? raw.bullets) as unknown[]).map(String).join('\n');
      list = 'bullet';
    }
    const listRaw = String(raw.list ?? '').toLowerCase();
    if (listRaw === 'bullet' || listRaw === 'bullets' || listRaw === 'true' || raw.list === true) list = 'bullet';
    if (listRaw === 'number' || listRaw === 'numbered' || listRaw === 'ordered') list = 'number';
    const weightText = String(raw.weight ?? '').toLowerCase().replace(/\s+/g, '');
    const weight = WEIGHTS[weightText] ?? (Number.isFinite(Number(raw.weight)) && raw.weight !== undefined && raw.weight !== '' ? clamp(Math.round(Number(raw.weight) / 100) * 100, 100, 900) : bool(raw.bold) ? 700 : undefined);
    let size = length(raw.size, H) ?? Math.max(12, Math.round(base * 0.026));
    size = clamp(Math.round(size), 4, 1000);
    let lineHeight = raw.lineHeight === undefined ? undefined : length(raw.lineHeight, 1);
    if (lineHeight !== undefined && lineHeight > 3) lineHeight = lineHeight / size;
    let letterSpacing = raw.letterSpacing === undefined ? undefined : length(raw.letterSpacing, 1);
    if (letterSpacing !== undefined && Math.abs(letterSpacing) > 1) letterSpacing = letterSpacing / size;
    const alignText = String(raw.align ?? '').toLowerCase();
    const align = alignText === 'center' || alignText === 'centre' || alignText === 'middle' ? 'center' : alignText === 'right' || alignText === 'end' ? 'right' : alignText === 'justify' ? 'justify' : alignText === 'left' || alignText === 'start' ? 'left' : undefined;
    const valignText = String(raw.valign ?? '').toLowerCase();
    const valign = valignText === 'middle' || valignText === 'center' ? 'middle' : valignText === 'bottom' || valignText === 'end' ? 'bottom' : valignText === 'top' ? 'top' : undefined;
    const uppercase = bool(raw.uppercase) || String(raw.textTransform ?? '').toLowerCase() === 'uppercase' || undefined;
    const font = typeof raw.font === 'string' && raw.font.trim() ? raw.font.replace(/["';{}<>]/g, '').trim().slice(0, 60) : undefined;
    const padding = length(raw.padding, Math.min(W, H));
    const draft: TextElement = {
      id: '',
      type: 'text',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      text: body,
      size,
      ...(font ? { font } : {}),
      ...(weight ? { weight } : {}),
      ...(bool(raw.italic) || String(raw.fontStyle ?? '') === 'italic' ? { italic: true } : {}),
      ...(bool(raw.underline) ? { underline: true } : {}),
      ...(uppercase ? { uppercase: true } : {}),
      ...(color(raw.color) ? { color: color(raw.color) } : {}),
      ...(align ? { align } : {}),
      ...(valign ? { valign } : {}),
      ...(lineHeight !== undefined && Number.isFinite(lineHeight) ? { lineHeight: clamp(lineHeight, 0.7, 3) } : {}),
      ...(letterSpacing !== undefined && Number.isFinite(letterSpacing) ? { letterSpacing: clamp(letterSpacing, -0.2, 1) } : {}),
      ...(list ? { list } : {}),
      ...(color(raw.fill) ? { fill: color(raw.fill) } : {}),
      ...(length(raw.radius, 1) !== undefined ? { radius: clamp(length(raw.radius, 1)!, 0, 2000) } : {}),
      ...(padding !== undefined ? { padding: clamp(padding, 0, 400) } : {}),
    };
    const fontFamily = fontName(draft.font, ctx.theme);
    const widest = Math.max(...body.split('\n').map((p) => p.length), 1) * size * 0.56 + 2 * (draft.padding ?? 0) + (list ? size * 1.2 : 0);
    const xGuess = length(raw.x, W) ?? W * 0.08;
    draft.w = clamp(Math.round(wRaw ?? Math.min(Math.max(size * 3, widest), Math.max(size * 3, W - xGuess - W * 0.06))), 4, 20000);
    draft.h = Math.round(hRaw ?? estimateTextHeight(draft, fontFamily));
    hRaw = draft.h;
    element = draft;
  } else if (type === 'rect' || type === 'ellipse') {
    const g = gradient(raw.gradient);
    element = {
      id: '',
      type,
      x: 0,
      y: 0,
      w: Math.round(wRaw ?? W * 0.25),
      h: Math.round(hRaw ?? (type === 'ellipse' ? wRaw ?? W * 0.25 : H * 0.25)),
      fill: color(raw.fill) ?? color(raw.color) ?? (type === 'ellipse' ? 'primary' : 'surface'),
      ...(g ? { gradient: g } : {}),
      ...(color(raw.stroke) ? { stroke: color(raw.stroke) } : {}),
      ...(length(raw.strokeWidth, 1) !== undefined ? { strokeWidth: clamp(length(raw.strokeWidth, 1)!, 0, 200) } : {}),
      ...(type === 'rect' && length(raw.radius, 1) !== undefined ? { radius: clamp(length(raw.radius, 1)!, 0, 5000) } : {}),
      ...(bool(raw.shadow) ? { shadow: true } : {}),
    };
    hRaw = element.h;
  } else if (type === 'line') {
    const x2 = length(raw.x2, W);
    const y2 = length(raw.y2, H);
    const x1 = length(raw.x1 ?? raw.x, W) ?? 0;
    const y1 = length(raw.y1 ?? raw.y, H) ?? 0;
    const w = x2 !== undefined ? x2 - x1 : wRaw ?? W * 0.3;
    const h = y2 !== undefined ? y2 - y1 : length(raw.h, H) ?? 0;
    element = {
      id: '',
      type: 'line',
      x: x1,
      y: y1,
      w: Math.round(w),
      h: Math.round(h),
      stroke: color(raw.stroke) ?? color(raw.color) ?? color(raw.fill) ?? 'muted',
      strokeWidth: clamp(length(raw.strokeWidth, 1) ?? Math.max(1, Math.round(base * 0.002)), 0.5, 200),
      ...(bool(raw.dashed) ? { dashed: true } : {}),
    };
    hRaw = element.h;
  } else if (type === 'image') {
    const fit = String(raw.fit ?? raw.objectFit ?? '').toLowerCase() === 'contain' ? 'contain' : 'cover';
    element = {
      id: '',
      type: 'image',
      x: 0,
      y: 0,
      w: Math.round(wRaw ?? W * 0.4),
      h: Math.round(hRaw ?? H * 0.4),
      src: resolveImageSrc(raw.src),
      fit,
      ...(length(raw.radius, 1) !== undefined ? { radius: clamp(length(raw.radius, 1)!, 0, 5000) } : {}),
      ...(typeof raw.alt === 'string' ? { alt: raw.alt.slice(0, 200) } : {}),
      ...(imageCrop(raw.crop) ? { crop: imageCrop(raw.crop) } : {}),
      ...(imageFilters(raw.filters) ? { filters: imageFilters(raw.filters) } : {}),
    };
    hRaw = element.h;
  } else if (type === 'chart') {
    const chartObject = raw.chart && typeof raw.chart === 'object' && !Array.isArray(raw.chart) ? (raw.chart as Record<string, unknown>) : {};
    const kind = chartObject.kind ?? chartObject.type ?? raw.kind ?? raw.chartType ?? raw.chart_type ?? 'bar';
    const spec = normalizeChart({ ...raw, ...chartObject, kind });
    if (spec.series.length === 0) return { error: 'A chart needs data: labels plus series like [{"name": "Sales", "values": [3, 5, 8]}].' };
    element = {
      id: '',
      type: 'chart',
      x: 0,
      y: 0,
      w: Math.round(wRaw ?? W * 0.6),
      h: Math.round(hRaw ?? H * 0.5),
      chart: spec,
      ...(color(raw.color) ? { color: color(raw.color) } : {}),
      ...(typeof raw.font === 'string' && raw.font.trim() ? { font: raw.font.replace(/["';{}<>]/g, '').trim().slice(0, 60) } : {}),
    };
    hRaw = element.h;
  } else {
    const svg = sanitizeSvg(String(raw.svg ?? raw.text ?? raw.src ?? ''));
    if (!svg) return { error: 'An svg element needs "svg": a complete <svg>…</svg> document.' };
    element = { id: '', type: 'svg', x: 0, y: 0, w: Math.round(wRaw ?? Math.min(W, H) * 0.2), h: Math.round(hRaw ?? wRaw ?? Math.min(W, H) * 0.2), svg };
    hRaw = element.h;
  }

  element.w = clamp(element.w, type === 'line' ? -20000 : 1, 20000);
  element.h = clamp(element.h, type === 'line' ? -20000 : 1, 20000);
  if (type !== 'line') {
    const w = element.w;
    const h = hRaw ?? element.h;
    const position = (value: unknown, size: number, total: number, far: unknown, words: { start: string[]; middle: string[]; end: string[] }) => {
      if (typeof value === 'string') {
        const word = value.trim().toLowerCase();
        if (words.middle.includes(word)) return (total - size) / 2;
        if (words.start.includes(word)) return 0;
        if (words.end.includes(word)) return total - size;
      }
      const direct = length(value, total);
      if (direct !== undefined) return direct;
      const fromFar = length(far, total);
      if (fromFar !== undefined) return total - fromFar - size;
      return undefined;
    };
    element.x = Math.round(position(raw.x, w, W, raw.right, { start: ['left', 'start'], middle: ['center', 'centre', 'middle'], end: ['right', 'end'] }) ?? (W - w) / 2);
    element.y = Math.round(position(raw.y, h, H, raw.bottom, { start: ['top', 'start'], middle: ['center', 'centre', 'middle'], end: ['bottom', 'end'] }) ?? (H - h) / 2);
  } else {
    element.x = Math.round(element.x);
    element.y = Math.round(element.y);
  }
  Object.assign(element, Object.fromEntries(Object.entries(common).filter(([, v]) => v !== undefined)));

  const wanted = typeof raw.id === 'string' ? raw.id.trim().replace(/[^\w-]/g, '').slice(0, 40) : '';
  element.id = wanted && !ctx.ids.has(wanted) ? wanted : newElementId(type, ctx.ids);
  ctx.ids.add(element.id);
  return { element };
}

/** Applies loose changes to an element, keeping its id. */
export function patchElement(element: DesignElement, changes: Record<string, unknown>, ctx: NormalizeContext): { element?: DesignElement; error?: string } {
  const patch = canonicalFields(changes);
  delete patch.id;
  const merged: Record<string, unknown> = { ...element, ...patch };
  // A changed text or size without a new height re-measures the box.
  if (element.type === 'text' && ('text' in patch || 'size' in patch || 'w' in patch || 'items' in patch || 'bullets' in patch) && !('h' in patch)) delete merged.h;
  if (element.type === 'chart' && patch.chart && typeof patch.chart === 'object') merged.chart = { ...element.chart, ...(patch.chart as object) };
  if (element.type === 'chart' && (patch.labels || patch.series || patch.kind)) merged.chart = { ...element.chart, ...(patch.labels ? { labels: patch.labels } : {}), ...(patch.series ? { series: patch.series } : {}), ...(patch.kind ? { kind: patch.kind } : {}) };
  const ids = new Set(ctx.ids);
  ids.delete(element.id);
  const result = normalizeElement({ ...merged, id: element.id }, { ...ctx, ids });
  if (result.element) result.element.id = element.id;
  return result;
}

function sanitizeName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : fallback;
}

/** Validates a stored or edited artboard (elements keep their ids when unique). */
export function normalizeArtboard(raw: unknown, theme: DesignTheme, ids: Set<string>, usedArtboardIds: Set<string>, index = 0): Artboard {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const size = parseSize(input.width && input.height ? { width: input.width, height: input.height } : input.size ?? input.preset, 'slide');
  const wanted = typeof input.id === 'string' ? input.id.replace(/[^\w-]/g, '').slice(0, 40) : '';
  const id = wanted && !usedArtboardIds.has(wanted) ? wanted : newArtboardId(usedArtboardIds);
  usedArtboardIds.add(id);
  const ctx: NormalizeContext = { width: size.width, height: size.height, theme, ids };
  const elements: DesignElement[] = [];
  for (const item of (Array.isArray(input.elements) ? input.elements : []).slice(0, LIMITS.elements)) {
    const { element } = normalizeElement(item, ctx);
    if (element) elements.push(element);
  }
  const g = gradient(input.gradient);
  return {
    id,
    name: sanitizeName(input.name, `Artboard ${index + 1}`),
    width: size.width,
    height: size.height,
    background: normalizeColor(input.background) ?? 'background',
    ...(g ? { gradient: g } : {}),
    elements,
    ...(typeof input.notes === 'string' && input.notes.trim() ? { notes: input.notes.slice(0, 10_000) } : {}),
    ...(normalizeTransition(input.transition) ? { transition: normalizeTransition(input.transition) } : {}),
  };
}

const FORMATS: DesignFormat[] = ['slides', 'document', 'social', 'poster', 'web', 'mobile', 'custom'];

export function normalizeTheme(raw: unknown): DesignTheme {
  if (!raw || typeof raw !== 'object') return defaultTheme();
  const input = raw as Record<string, unknown>;
  const preset = typeof input.id === 'string' ? THEMES.find((t) => t.id === input.id) : undefined;
  const base = structuredClone(preset ?? THEMES[0]);
  const theme = customizeTheme(base, { colors: input.colors as Record<string, unknown>, fonts: input.fonts as Record<string, unknown> });
  theme.id = typeof input.id === 'string' ? input.id.replace(/[^\w-]/g, '').slice(0, 40) || 'custom' : 'custom';
  theme.name = sanitizeName(input.name, theme.name);
  return theme;
}

/** Validates a whole design, e.g. one saved by the editor. */
export function normalizeDesign(raw: unknown, fallback: Pick<Design, 'id' | 'conversationId' | 'createdAt'>): Design {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const theme = normalizeTheme(input.theme);
  const ids = new Set<string>();
  const artboardIds = new Set<string>();
  const artboards = (Array.isArray(input.artboards) ? input.artboards : []).slice(0, LIMITS.artboards).map((a, i) => normalizeArtboard(a, theme, ids, artboardIds, i));
  return {
    id: fallback.id,
    conversationId: fallback.conversationId,
    title: sanitizeName(input.title, 'Untitled design'),
    format: FORMATS.includes(input.format as DesignFormat) ? (input.format as DesignFormat) : 'custom',
    theme,
    artboards,
    version: Number.isInteger(input.version) ? (input.version as number) : 1,
    createdAt: fallback.createdAt,
    updatedAt: Date.now(),
  };
}

/** All element ids in a design. */
export function elementIds(design: Pick<Design, 'artboards'>): Set<string> {
  return new Set(design.artboards.flatMap((a) => a.elements.map((e) => e.id)));
}
