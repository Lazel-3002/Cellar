import type { DesignTheme } from '../types/design';
import { estimateTextHeight, fitFontSize } from './text';
import { readableOn } from './theme';

/**
 * Layouts turn content (a title, bullets, an image, a chart…) into positioned elements, so small models
 * get a well-spaced artboard from one tool call and people can refine it on the canvas.
 */
export const LAYOUTS = {
  title: 'Cover: kicker, large title, subtitle; image or color block on the side',
  section: 'Section divider on the primary color',
  bullets: 'Title with a bullet list (image or chart beside it when given)',
  'two-column': 'Title with two columns (columns: [{title, body|bullets}])',
  'image-left': 'Image filling the left half, text on the right',
  'image-right': 'Text on the left, image filling the right half',
  chart: 'Title with a large chart (and optional bullets beside it)',
  quote: 'A large quote with its author',
  stats: 'Title with 2–4 big numbers (stats: [{value, label}])',
  cards: 'Title with a grid of cards (items: [{title, body}])',
  closing: 'Centered closing message',
  article: 'Document page: title, subtitle and body text, with an optional image or chart',
  hero: 'Web landing page: navigation bar (kicker = brand name, items = nav links), headline, body, cta button and an image',
  'app-screen': 'Phone app screen: header, list of cards and a tab bar',
  poster: 'Poster: huge headline, image, details at the bottom',
  blank: 'Empty artboard',
} as const;

export type LayoutName = keyof typeof LAYOUTS;

export const LAYOUT_NAMES = Object.keys(LAYOUTS) as LayoutName[];

export interface LayoutContent {
  title?: string;
  subtitle?: string;
  kicker?: string;
  body?: string;
  bullets?: string[];
  /** attachment:<id> or a data URL; empty shows an image placeholder. */
  image?: string;
  chart?: unknown;
  quote?: string;
  author?: string;
  stats?: Array<{ value: string; label: string }>;
  columns?: Array<{ title?: string; body?: string; bullets?: string[] }>;
  items?: Array<{ title: string; body?: string }>;
  cta?: string;
  footer?: string;
}

type Raw = Record<string, unknown>;

export function layoutName(value: unknown): LayoutName | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  const aliases: Record<string, LayoutName> = {
    cover: 'title',
    'title-slide': 'title',
    intro: 'title',
    divider: 'section',
    'section-header': 'section',
    list: 'bullets',
    'bullet-list': 'bullets',
    content: 'bullets',
    'title-and-content': 'bullets',
    columns: 'two-column',
    comparison: 'two-column',
    'two-columns': 'two-column',
    'image-text': 'image-left',
    'text-image': 'image-right',
    graph: 'chart',
    testimonial: 'quote',
    numbers: 'stats',
    metrics: 'stats',
    kpis: 'stats',
    grid: 'cards',
    features: 'cards',
    agenda: 'cards',
    end: 'closing',
    'thank-you': 'closing',
    thanks: 'closing',
    page: 'article',
    document: 'article',
    'one-pager': 'article',
    landing: 'hero',
    'landing-page': 'hero',
    website: 'hero',
    mobile: 'app-screen',
    app: 'app-screen',
    screen: 'app-screen',
    flyer: 'poster',
    empty: 'blank',
  };
  return (LAYOUT_NAMES as string[]).includes(key) ? (key as LayoutName) : aliases[key];
}

/** Content from loose tool arguments (strings for lists, other field names). */
export function layoutContent(raw: Raw): LayoutContent {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 4000) : typeof v === 'number' ? String(v) : undefined);
  const list = (v: unknown): string[] | undefined => {
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? String((x as Raw).text ?? (x as Raw).title ?? '') : String(x))).filter((x) => x.trim()).slice(0, 20);
    if (typeof v === 'string' && v.trim()) return v.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean).slice(0, 20);
    return undefined;
  };
  const objects = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map((x) => x as Raw) : []);
  return {
    title: str(raw.title ?? raw.heading ?? raw.headline),
    subtitle: str(raw.subtitle ?? raw.subheading ?? raw.tagline),
    kicker: str(raw.kicker ?? raw.eyebrow ?? raw.label ?? raw.brand),
    body: str(raw.body ?? raw.text ?? raw.paragraph ?? raw.description),
    bullets: list(raw.bullets ?? raw.points ?? raw.list),
    image: str(raw.image ?? raw.image_src ?? raw.src),
    chart: raw.chart && typeof raw.chart === 'object' ? raw.chart : undefined,
    quote: str(raw.quote),
    author: str(raw.author ?? raw.attribution),
    stats: objects(raw.stats ?? raw.metrics ?? raw.numbers).map((s) => ({ value: String(s.value ?? s.number ?? ''), label: String(s.label ?? s.title ?? s.name ?? '') })).filter((s) => s.value).slice(0, 4),
    columns: objects(raw.columns).map((c) => ({ title: str(c.title ?? c.heading), body: str(c.body ?? c.text), bullets: list(c.bullets ?? c.points) })).slice(0, 3),
    items: objects(raw.items ?? raw.cards ?? raw.features).map((c) => ({ title: String(c.title ?? c.name ?? c.heading ?? ''), body: str(c.body ?? c.text ?? c.description) })).filter((c) => c.title).slice(0, 8),
    cta: str(raw.cta ?? raw.button),
    footer: str(raw.footer ?? raw.date ?? raw.contact),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Builds a layout for an artboard of the given size. */
export function layoutElements(layout: LayoutName, content: LayoutContent, size: { width: number; height: number }, theme: DesignTheme): { background?: string; elements: Raw[] } {
  const W = size.width;
  const H = size.height;
  const portrait = H > W * 1.1;
  const base = Math.sqrt(W * H);
  const m = Math.round(Math.min(W, H) * (portrait ? 0.08 : 0.075));
  const T = Math.round(clamp(base * (portrait ? 0.06 : 0.055), 22, 150));
  const H2 = Math.round(clamp(base * 0.036, 18, 90));
  const B = Math.round(clamp(base * 0.022, 13, 48));
  const S = Math.round(clamp(base * 0.015, 11, 30));
  const els: Raw[] = [];
  const headingFont = theme.fonts.heading;
  const bodyFont = theme.fonts.body;

  const text = (props: Raw & { text: string; x: number; y: number; w: number; size: number }): Raw => {
    const font = props.font === 'heading' ? headingFont : bodyFont;
    const el: Raw = { type: 'text', lineHeight: 1.25, ...props };
    el.h = typeof props.h === 'number' ? props.h : estimateTextHeight(el as never, font);
    return el;
  };
  /** Text without words (content the caller did not give) is left out instead of showing placeholder copy. */
  const filled = (el: Raw) => el.type !== 'text' || String(el.text ?? '').trim() !== '';
  const push = (...items: Raw[]) => {
    els.push(...items.filter(filled));
    return items;
  };
  /** Stacks text blocks from y with gaps; returns the bottom. */
  const stack = (blocks: Raw[], y: number, gap: number) => {
    let cursor = y;
    for (const block of blocks.filter(filled)) {
      block.y = Math.round(cursor);
      cursor += (block.h as number) + gap;
      els.push(block);
    }
    return cursor - gap;
  };
  const heightOf = (blocks: Raw[], gap: number) => {
    const shown = blocks.filter(filled);
    return shown.reduce((sum, b) => sum + (b.h as number), 0) + gap * Math.max(0, shown.length - 1);
  };
  const bulletText = (items: string[] | undefined, body?: string) => (items?.length ? items.join('\n') : body ?? '');
  const media = (x: number, y: number, w: number, h: number, radius = 0) => {
    if (content.chart) return push({ type: 'chart', x, y, w, h, chart: content.chart, name: 'Chart' })[0];
    return push({ type: 'image', x, y, w, h, src: content.image ?? '', fit: 'cover', ...(radius ? { radius } : {}), name: 'Image' })[0];
  };
  const hasMedia = !!(content.image || content.chart);
  const kicker = (value: string | undefined, x: number, w: number, colorName = 'accent') =>
    value ? [text({ text: value, x, y: 0, w, size: S, weight: 700, uppercase: true, letterSpacing: 0.12, color: colorName })] : [];
  const fitHeading = (block: Raw, maxHeight: number, min: number) => {
    if ((block.h as number) <= maxHeight) return block;
    const size = fitFontSize({ ...block, h: maxHeight } as unknown as Parameters<typeof fitFontSize>[0], block.font === 'heading' ? headingFont : bodyFont, min);
    const { h: _h, ...rest } = block;
    return text({ ...(rest as Parameters<typeof text>[0]), size });
  };

  switch (layout) {
    case 'blank':
      return { elements: [] };

    case 'title': {
      const mediaW = portrait ? W : Math.round(W * 0.4);
      const mediaH = portrait ? Math.round(H * 0.42) : H;
      if (content.image) push({ type: 'image', x: portrait ? 0 : W - mediaW, y: 0, w: mediaW, h: mediaH, src: content.image, fit: 'cover', name: 'Cover image' });
      else if (!portrait) {
        push({ type: 'rect', x: W - Math.round(W * 0.26), y: 0, w: Math.round(W * 0.26), h: H, fill: 'primary', name: 'Color block' });
        push({ type: 'ellipse', x: W - Math.round(W * 0.26) - Math.round(H * 0.16), y: Math.round(H * 0.62), w: Math.round(H * 0.32), h: Math.round(H * 0.32), fill: 'accent', name: 'Accent circle' });
      } else push({ type: 'rect', x: 0, y: 0, w: W, h: Math.round(H * 0.12), fill: 'primary', name: 'Color band' });
      const textW = portrait ? W - 2 * m : (content.image ? W - mediaW : W * 0.74) - 2 * m;
      const top = portrait ? mediaH + m : 0;
      const areaH = portrait ? H - mediaH - 2 * m : H;
      const blocks = [
        ...kicker(content.kicker, m, textW),
        text({ text: content.title ?? '', x: m, y: 0, w: textW, size: T, weight: 700, font: 'heading', lineHeight: 1.08, color: 'text', name: 'Title' }),
        ...(content.subtitle ? [text({ text: content.subtitle, x: m, y: 0, w: Math.min(textW, W * 0.6), size: Math.round(B * 1.15), color: 'muted', lineHeight: 1.35, name: 'Subtitle' })] : []),
      ];
      blocks[blocks.length > 1 && content.kicker ? 1 : 0] = fitHeading(blocks[blocks.length > 1 && content.kicker ? 1 : 0], areaH * 0.55, Math.round(T * 0.55));
      const gap = Math.round(T * 0.35);
      const start = portrait ? top : Math.round((H - heightOf(blocks, gap)) / 2);
      push({ type: 'rect', x: m, y: Math.max(m / 2, start - Math.round(T * 0.45)), w: Math.round(T * 0.9), h: Math.max(4, Math.round(base * 0.006)), fill: 'accent', name: 'Accent rule' });
      stack(blocks, start, gap);
      if (content.footer) push(text({ text: content.footer, x: m, y: H - m - S * 1.3, w: textW, size: S, color: 'muted', name: 'Footer' }));
      return { background: 'background', elements: els };
    }

    case 'section': {
      const fg = readableOn(theme.colors.primary);
      const textW = W - 2 * m;
      const blocks = [
        ...(content.kicker ? [text({ text: content.kicker, x: m, y: 0, w: textW, size: S, weight: 700, uppercase: true, letterSpacing: 0.14, color: fg, opacity: 0.8 })] : []),
        text({ text: content.title ?? '', x: m, y: 0, w: textW * 0.85, size: Math.round(T * 1.05), weight: 700, font: 'heading', lineHeight: 1.08, color: fg, name: 'Title' }),
        ...(content.subtitle ? [text({ text: content.subtitle, x: m, y: 0, w: textW * 0.7, size: Math.round(B * 1.1), color: fg, opacity: 0.85, lineHeight: 1.35, name: 'Subtitle' })] : []),
      ];
      const gap = Math.round(T * 0.3);
      stack(blocks, Math.round((H - heightOf(blocks, gap)) / 2), gap);
      push({ type: 'rect', x: m, y: H - m - Math.max(4, Math.round(base * 0.006)), w: Math.round(W * 0.12), h: Math.max(4, Math.round(base * 0.006)), fill: 'accent', name: 'Accent rule' });
      return { background: 'primary', elements: els };
    }

    case 'bullets':
    case 'chart': {
      const split = layout === 'bullets' ? hasMedia && !portrait : !!(content.bullets?.length || content.body) && !portrait;
      const titleBlock = text({ text: content.title ?? '', x: m, y: m, w: W - 2 * m, size: H2, weight: 700, font: 'heading', lineHeight: 1.1, name: 'Title' });
      const head = [...kicker(content.kicker, m, W - 2 * m), titleBlock];
      const headBottom = stack(head, m, Math.round(S * 0.6));
      push({ type: 'rect', x: m, y: headBottom + Math.round(H2 * 0.35), w: Math.round(H2 * 1.2), h: Math.max(3, Math.round(base * 0.004)), fill: 'accent', name: 'Accent rule' });
      const contentTop = headBottom + Math.round(H2 * 0.9);
      const contentH = H - contentTop - m;
      if (layout === 'bullets') {
        const listW = split ? Math.round((W - 3 * m) * 0.5) : W - 2 * m;
        const items = content.bullets?.length ? content.bullets : undefined;
        const list = text({ text: bulletText(items, content.body), x: m, y: contentTop, w: listW, size: B, lineHeight: 1.35, color: 'text', ...(items ? { list: 'bullet' } : {}), name: items ? 'Bullets' : 'Body' });
        push(fitHeading(list, contentH, Math.round(B * 0.6)));
        if (split) media(m * 2 + listW, contentTop, W - 3 * m - listW, contentH, Math.round(base * 0.01));
        else if (hasMedia && portrait) {
          const listBottom = contentTop + (els[els.length - 1].h as number) + m;
          if (H - m - listBottom > H * 0.2) media(m, listBottom, W - 2 * m, H - m - listBottom, Math.round(base * 0.01));
        }
      } else {
        const sideW = split ? Math.round((W - 3 * m) * 0.32) : 0;
        const chartW = split ? W - 3 * m - sideW : W - 2 * m;
        if (content.chart) push({ type: 'chart', x: m, y: contentTop, w: chartW, h: contentH, chart: content.chart, name: 'Chart' });
        if (split) {
          const side = text({ text: bulletText(content.bullets, content.body), x: m * 2 + chartW, y: contentTop, w: sideW, size: Math.round(B * 0.9), lineHeight: 1.4, color: 'text', ...(content.bullets?.length ? { list: 'bullet' } : {}), name: 'Notes' });
          push(fitHeading(side, contentH, Math.round(B * 0.55)));
        }
      }
      return { background: 'background', elements: els };
    }

    case 'two-column': {
      const head = [...kicker(content.kicker, m, W - 2 * m), text({ text: content.title ?? '', x: m, y: m, w: W - 2 * m, size: H2, weight: 700, font: 'heading', lineHeight: 1.1, name: 'Title' })];
      const headBottom = stack(head, m, Math.round(S * 0.6));
      const half = Math.ceil((content.bullets?.length ?? 0) / 2);
      const columns = content.columns?.length ? content.columns : content.bullets?.length ? [{ bullets: content.bullets.slice(0, half) }, { bullets: content.bullets.slice(half) }] : [];
      const count = portrait ? 1 : Math.min(3, columns.length);
      const gap = m;
      const colW = Math.round((W - 2 * m - gap * (count - 1)) / count);
      const top = headBottom + Math.round(H2 * 0.8);
      const shown = columns.slice(0, portrait ? 3 : count);
      const blocksFor = (col: (typeof columns)[number], i: number, x: number, w: number) => [
        ...(col.title ? [text({ text: col.title, x, y: 0, w, size: Math.round(B * 1.15), weight: 700, font: 'heading', color: 'primary', name: `Column ${i + 1} title` })] : []),
        text({ text: bulletText(col.bullets, col.body), x, y: 0, w, size: B, lineHeight: 1.4, color: 'text', ...(col.bullets?.length ? { list: 'bullet' } : {}), name: `Column ${i + 1} text` }),
      ];
      const ruleH = Math.max(3, Math.round(base * 0.004));
      const lead = Math.round(S * 1.2);
      if (portrait) {
        shown.forEach((col, i) => {
          const y = top + i * Math.round((H - top - m) / Math.min(3, columns.length));
          push({ type: 'rect', x: m, y, w: Math.round((W - 2 * m) * 0.18), h: ruleH, fill: i % 2 ? 'primary' : 'accent', name: `Column ${i + 1} rule` });
          stack(blocksFor(col, i, m, W - 2 * m), y + lead, Math.round(B * 0.5));
        });
      } else {
        // Short columns sit a little above the middle of the space under the title instead of hugging it.
        const sets = shown.map((col, i) => blocksFor(col, i, m + i * (colW + gap), colW));
        const tallest = Math.max(0, ...sets.map((blocks) => heightOf(blocks, Math.round(B * 0.5)))) + lead;
        const y = top + Math.max(0, Math.round((H - m - top - tallest) * 0.35));
        sets.forEach((blocks, i) => {
          push({ type: 'rect', x: m + i * (colW + gap), y, w: Math.round(colW * 0.18), h: ruleH, fill: i % 2 ? 'primary' : 'accent', name: `Column ${i + 1} rule` });
          stack(blocks, y + lead, Math.round(B * 0.5));
        });
      }
      return { background: 'background', elements: els };
    }

    case 'image-left':
    case 'image-right': {
      const imageW = portrait ? W : Math.round(W * 0.46);
      const imageH = portrait ? Math.round(H * 0.45) : H;
      const imageX = portrait || layout === 'image-left' ? 0 : W - imageW;
      if (content.chart) push({ type: 'rect', x: imageX, y: 0, w: imageW, h: imageH, fill: 'surface', name: 'Chart panel' });
      if (content.chart) push({ type: 'chart', x: imageX + m / 2, y: m / 2 + (portrait ? 0 : m / 2), w: imageW - m, h: imageH - m * (portrait ? 1 : 2), chart: content.chart, name: 'Chart' });
      else push({ type: 'image', x: imageX, y: 0, w: imageW, h: imageH, src: content.image ?? '', fit: 'cover', name: 'Image' });
      const textX = portrait ? m : layout === 'image-left' ? imageW + m : m;
      const textW = portrait ? W - 2 * m : W - imageW - 2 * m;
      const blocks = [
        ...kicker(content.kicker, textX, textW),
        text({ text: content.title ?? '', x: textX, y: 0, w: textW, size: H2, weight: 700, font: 'heading', lineHeight: 1.1, name: 'Title' }),
        ...(content.body || content.bullets?.length ? [text({ text: bulletText(content.bullets, content.body), x: textX, y: 0, w: textW, size: B, lineHeight: 1.45, color: content.bullets?.length ? 'text' : 'muted', ...(content.bullets?.length ? { list: 'bullet' } : {}), name: 'Body' })] : []),
      ];
      const gap = Math.round(H2 * 0.5);
      const areaTop = portrait ? imageH + m : m;
      const areaH = portrait ? H - imageH - 2 * m : H - 2 * m;
      const last = blocks.length - 1;
      blocks[last] = fitHeading(blocks[last], Math.max(B * 2, areaH - heightOf(blocks.slice(0, last), gap) - gap), Math.round(B * 0.6));
      stack(blocks, areaTop + Math.max(0, Math.round((areaH - heightOf(blocks, gap)) / (portrait ? 4 : 2))), gap);
      return { background: 'background', elements: els };
    }

    case 'quote': {
      const w = W - 2 * m * (portrait ? 1 : 1.6);
      const x = Math.round((W - w) / 2);
      const mark = text({ text: '“', x, y: 0, w: T * 2, size: Math.round(T * 2.4), weight: 700, font: 'heading', color: 'accent', lineHeight: 0.9, h: Math.round(T * 1.5), name: 'Quote mark' });
      const quote = text({ text: content.quote ?? content.title ?? '', x, y: 0, w, size: Math.round(H2 * 1.05), font: 'heading', italic: true, lineHeight: 1.3, color: 'text', name: 'Quote' });
      const author = content.author ? [text({ text: `— ${content.author}`, x, y: 0, w, size: B, color: 'muted', weight: 600, name: 'Author' })] : [];
      const blocks = [...(String(quote.text).trim() ? [mark] : []), fitHeading(quote, H * 0.55, Math.round(B * 1.1)), ...author];
      const gap = Math.round(B * 0.8);
      stack(blocks, Math.round((H - heightOf(blocks, gap)) / 2), gap);
      return { background: 'surface', elements: els };
    }

    case 'stats': {
      const head = [...kicker(content.kicker, m, W - 2 * m), text({ text: content.title ?? '', x: m, y: m, w: W - 2 * m, size: H2, weight: 700, font: 'heading', lineHeight: 1.1, name: 'Title' })];
      const headBottom = stack(head, m, Math.round(S * 0.6));
      const stats = content.stats ?? [];
      const perRow = Math.max(1, portrait ? Math.min(2, stats.length) : stats.length);
      const rows = Math.ceil(stats.length / perRow);
      const gap = Math.round(m * 0.5);
      const cardW = Math.round((W - 2 * m - gap * (perRow - 1)) / perRow);
      const below = headBottom + Math.round(H2 * 0.9);
      const cardH = Math.round(Math.min((H - below - m - gap * (rows - 1)) / Math.max(1, rows), cardW * 0.75));
      // The grid sits a little above the middle of the space under the title.
      const top = below + Math.max(0, Math.round((H - m - below - (rows * cardH + gap * (rows - 1))) * 0.35));
      stats.forEach((stat, i) => {
        const x = m + (i % perRow) * (cardW + gap);
        const y = top + Math.floor(i / perRow) * (cardH + gap);
        push({ type: 'rect', x, y, w: cardW, h: cardH, fill: 'surface', radius: Math.round(base * 0.012), name: `Stat ${i + 1} card` });
        const valueSize = Math.round(clamp(Math.min(T * 1.2, cardW / Math.max(3, stat.value.length * 0.62)), S * 1.5, T * 1.4));
        const blocks = [
          text({ text: stat.value, x: x + gap, y: 0, w: cardW - 2 * gap, size: valueSize, weight: 700, font: 'heading', color: i % 2 ? 'accent' : 'primary', lineHeight: 1.05, name: `Stat ${i + 1} value` }),
          text({ text: stat.label || ' ', x: x + gap, y: 0, w: cardW - 2 * gap, size: B, color: 'muted', lineHeight: 1.3, name: `Stat ${i + 1} label` }),
        ];
        stack(blocks, y + Math.max(gap, Math.round((cardH - heightOf(blocks, S * 0.5)) / 2)), Math.round(S * 0.5));
      });
      return { background: 'background', elements: els };
    }

    case 'cards': {
      const head = [...kicker(content.kicker, m, W - 2 * m), text({ text: content.title ?? '', x: m, y: m, w: W - 2 * m, size: H2, weight: 700, font: 'heading', lineHeight: 1.1, name: 'Title' })];
      const headBottom = stack(head, m, Math.round(S * 0.6));
      const items = content.items?.length ? content.items : (content.bullets ?? []).map((b) => ({ title: b, body: undefined as string | undefined }));
      const perRow = Math.max(1, portrait ? (W < 600 ? 1 : 2) : items.length === 4 ? (W / H > 1.5 ? 4 : 2) : Math.min(3, items.length));
      const rows = Math.max(1, Math.ceil(items.length / perRow));
      const gap = Math.round(m * 0.45);
      const below = headBottom + Math.round(H2 * 0.8);
      const cardW = Math.round((W - 2 * m - gap * (perRow - 1)) / perRow);
      const pad = Math.round(clamp(cardW * 0.08, 10, 48));
      // Cards are as tall as their text needs (with some air), up to the space available.
      const needed = Math.max(
        0,
        ...items.map((item) => {
          const title = estimateTextHeight({ text: item.title, size: Math.round(B * 1.1), weight: 700, w: cardW - 2 * pad, lineHeight: 1.2 } as never, headingFont);
          const body = item.body ? estimateTextHeight({ text: item.body, size: Math.round(B * 0.85), w: cardW - 2 * pad, lineHeight: 1.4 } as never, bodyFont) + S * 0.6 : 0;
          return pad * 2 + B * 2.2 + title + body;
        }),
      );
      const available = (H - below - m - gap * (rows - 1)) / rows;
      const cardH = Math.round(Math.min(available, Math.max(needed * 1.2, cardW * 0.5)));
      const top = below + Math.max(0, Math.round((H - m - below - (rows * cardH + gap * (rows - 1))) * 0.35));
      items.forEach((item, i) => {
        const x = m + (i % perRow) * (cardW + gap);
        const y = top + Math.floor(i / perRow) * (cardH + gap);
        push({ type: 'rect', x, y, w: cardW, h: cardH, fill: 'surface', radius: Math.round(base * 0.012), name: `Card ${i + 1}` });
        push({ type: 'ellipse', x: x + pad, y: y + pad, w: Math.round(B * 1.6), h: Math.round(B * 1.6), fill: i % 3 === 1 ? 'accent' : i % 3 === 2 ? 'secondary' : 'primary', name: `Card ${i + 1} dot` });
        push(text({ text: String(i + 1), x: x + pad, y: y + pad, w: Math.round(B * 1.6), h: Math.round(B * 1.6), size: Math.round(B * 0.8), weight: 700, align: 'center', valign: 'middle', color: readableOn(theme.colors.primary), name: `Card ${i + 1} number` }));
        const blocks = [
          text({ text: item.title, x: x + pad, y: 0, w: cardW - 2 * pad, size: Math.round(B * 1.1), weight: 700, font: 'heading', lineHeight: 1.2, name: `Card ${i + 1} title` }),
          ...(item.body ? [text({ text: item.body, x: x + pad, y: 0, w: cardW - 2 * pad, size: Math.round(B * 0.85), color: 'muted', lineHeight: 1.4, name: `Card ${i + 1} text` })] : []),
        ];
        const inner = cardH - pad * 2 - B * 2.2;
        if (blocks.length > 1) blocks[1] = fitHeading(blocks[1], Math.max(S * 1.5, inner - (blocks[0].h as number) - S), Math.round(S * 0.9));
        stack(blocks, y + pad + Math.round(B * 2.2), Math.round(S * 0.6));
      });
      return { background: 'background', elements: els };
    }

    case 'closing': {
      const w = W - 2 * m;
      const blocks = [
        text({ text: content.title ?? 'Thank you', x: m, y: 0, w, size: Math.round(T * 1.1), weight: 700, font: 'heading', align: 'center', lineHeight: 1.1, name: 'Title' }),
        ...(content.subtitle ? [text({ text: content.subtitle, x: m + w * 0.1, y: 0, w: w * 0.8, size: Math.round(B * 1.1), color: 'muted', align: 'center', lineHeight: 1.4, name: 'Subtitle' })] : []),
        ...(content.footer ? [text({ text: content.footer, x: m, y: 0, w, size: B, color: 'primary', weight: 600, align: 'center', name: 'Contact' })] : []),
      ];
      const gap = Math.round(B * 0.9);
      const start = Math.round((H - heightOf(blocks, gap)) / 2);
      push({ type: 'rect', x: Math.round(W / 2 - T * 0.6), y: start - Math.round(T * 0.6), w: Math.round(T * 1.2), h: Math.max(4, Math.round(base * 0.006)), fill: 'accent', name: 'Accent rule' });
      stack(blocks, start, gap);
      return { background: 'background', elements: els };
    }

    case 'article': {
      const w = W - 2 * m;
      push({ type: 'rect', x: 0, y: 0, w: W, h: Math.round(m * 0.35), fill: 'primary', name: 'Top band' });
      const head = [
        ...kicker(content.kicker, m, w, 'primary'),
        text({ text: content.title ?? '', x: m, y: 0, w, size: Math.round(T * 0.85), weight: 700, font: 'heading', lineHeight: 1.1, name: 'Title' }),
        ...(content.subtitle ? [text({ text: content.subtitle, x: m, y: 0, w, size: Math.round(B * 1.15), color: 'muted', lineHeight: 1.35, name: 'Subtitle' })] : []),
      ];
      let y = stack(head, m * 1.2, Math.round(B * 0.6));
      push({ type: 'line', x: m, y: y + B, w, h: 0, stroke: 'accent', strokeWidth: Math.max(2, Math.round(base * 0.002)), name: 'Rule' });
      y += B * 2;
      const footerH = content.footer ? S * 2.5 : 0;
      const mediaH = hasMedia ? Math.round((H - y - m - footerH) * 0.42) : 0;
      if (content.body || content.bullets?.length) {
        const body = text({ text: bulletText(content.bullets, content.body), x: m, y, w, size: Math.round(B * 0.8), lineHeight: 1.55, color: 'text', ...(content.bullets?.length && !content.body ? { list: 'bullet' } : {}), name: 'Body' });
        const room = H - y - m - footerH - (mediaH ? mediaH + B : 0);
        push(fitHeading(body, room, Math.max(10, Math.round(B * 0.55))));
        y += Math.min(room, els[els.length - 1].h as number) + B;
      }
      if (hasMedia) media(m, Math.round(H - m - footerH - mediaH), w, mediaH, Math.round(base * 0.008));
      if (content.footer) push(text({ text: content.footer, x: m, y: H - m - S * 1.3, w, size: S, color: 'muted', name: 'Footer' }));
      return { background: 'background', elements: els };
    }

    case 'hero': {
      const navH = Math.round(clamp(H * 0.09, 48, 96));
      const pad = Math.round(W * 0.05);
      const small = Math.round(clamp(base * 0.013, 12, 20));
      push({ type: 'rect', x: 0, y: 0, w: W, h: navH, fill: 'background', name: 'Nav bar' });
      push(text({ text: content.kicker ?? '', x: pad, y: Math.round(navH / 2 - small * 0.8), w: Math.round(W * 0.25), size: Math.round(small * 1.35), weight: 800, font: 'heading', color: 'text', name: 'Logo' }));
      const links = (content.items?.length ? content.items.map((i) => i.title) : ['Product', 'Pricing', 'About']).slice(0, 4);
      links.forEach((link, i) => push(text({ text: link, x: Math.round(W * 0.45 + i * W * 0.09), y: Math.round(navH / 2 - small * 0.65), w: Math.round(W * 0.085), size: small, color: 'muted', name: `Nav link ${i + 1}` })));
      const ctaLabel = content.cta ?? 'Get started';
      const btnW = Math.round(clamp(ctaLabel.length * small * 0.62 + small * 2.4, 90, 280));
      push({ type: 'rect', x: W - pad - btnW, y: Math.round(navH / 2 - small * 1.25), w: btnW, h: Math.round(small * 2.5), fill: 'primary', radius: 999, name: 'Nav button' });
      push(text({ text: ctaLabel, x: W - pad - btnW, y: Math.round(navH / 2 - small * 1.25), w: btnW, h: Math.round(small * 2.5), size: small, weight: 600, align: 'center', valign: 'middle', color: readableOn(theme.colors.primary), name: 'Nav button label' }));
      push({ type: 'line', x: 0, y: navH, w: W, h: 0, stroke: 'surface', strokeWidth: 1, name: 'Nav divider' });
      const textW = Math.round(W * 0.46);
      const blocks = [
        ...kicker(content.subtitle && content.body ? content.subtitle : undefined, pad, textW, 'primary'),
        text({ text: content.title ?? '', x: pad, y: 0, w: textW, size: Math.round(T * 0.95), weight: 800, font: 'heading', lineHeight: 1.05, name: 'Headline' }),
        text({ text: content.body ?? content.subtitle ?? '', x: pad, y: 0, w: Math.round(textW * 0.9), size: Math.round(B * 0.95), color: 'muted', lineHeight: 1.5, name: 'Lead' }),
      ];
      const gap = Math.round(B * 0.9);
      const areaTop = navH + pad * 0.6;
      const areaH = H - areaTop - pad * 0.6;
      const btnH = Math.round(B * 2.3);
      const total = heightOf(blocks, gap) + gap + btnH;
      const y = stack(blocks, areaTop + Math.max(0, Math.round((areaH - total) / 2)), gap);
      const mainW = Math.round(clamp(ctaLabel.length * B * 0.62 + B * 2.6, 140, 420));
      push({ type: 'rect', x: pad, y: y + gap, w: mainW, h: btnH, fill: 'primary', radius: Math.round(btnH / 2), name: 'Primary button' });
      push(text({ text: ctaLabel, x: pad, y: y + gap, w: mainW, h: btnH, size: Math.round(B * 0.85), weight: 600, align: 'center', valign: 'middle', color: readableOn(theme.colors.primary), name: 'Primary button label' }));
      const mediaX = Math.round(W * 0.56);
      const secondX = pad + mainW + Math.round(B * 0.6);
      const secondW = Math.round(Math.min(mainW * 0.9, B * 7.5, mediaX - pad * 0.5 - secondX));
      if (secondW >= B * 4.5) {
        push({ type: 'rect', x: secondX, y: y + gap, w: secondW, h: btnH, fill: 'transparent', stroke: 'text', strokeWidth: 1.5, radius: Math.round(btnH / 2), name: 'Secondary button' });
        push(text({ text: 'Learn more', x: secondX, y: y + gap, w: secondW, h: btnH, size: Math.round(B * 0.85), weight: 600, align: 'center', valign: 'middle', name: 'Secondary button label' }));
      }
      media(mediaX, Math.round(areaTop), W - mediaX - pad, Math.round(areaH), Math.round(base * 0.014));
      return { background: 'background', elements: els };
    }

    case 'app-screen': {
      const pad = Math.round(W * 0.06);
      const unit = Math.round(clamp(W * 0.037, 11, 22));
      push(text({ text: '9:41', x: pad, y: Math.round(unit * 0.9), w: unit * 4, size: Math.round(unit * 1.05), weight: 600, name: 'Status time' }));
      push({ type: 'rect', x: W - pad - unit * 2, y: Math.round(unit * 1.1), w: unit * 2, h: Math.round(unit * 0.9), fill: 'text', radius: 3, name: 'Battery' });
      const head = [
        ...(content.kicker ? [text({ text: content.kicker, x: pad, y: 0, w: W - 2 * pad, size: unit, color: 'muted', name: 'Greeting' })] : []),
        text({ text: content.title ?? '', x: pad, y: 0, w: W - 2 * pad, size: Math.round(unit * 2.1), weight: 800, font: 'heading', lineHeight: 1.1, name: 'Screen title' }),
        ...(content.subtitle ? [text({ text: content.subtitle, x: pad, y: 0, w: W - 2 * pad, size: unit, color: 'muted', lineHeight: 1.35, name: 'Subtitle' })] : []),
      ];
      let y = stack(head, unit * 3.4, Math.round(unit * 0.4)) + unit * 1.2;
      const tabH = Math.round(unit * 5.2);
      const ctaH = content.cta ? Math.round(unit * 3.6) : 0;
      if (content.image) {
        const imgH = Math.round(W * 0.42);
        push({ type: 'image', x: pad, y, w: W - 2 * pad, h: imgH, src: content.image, fit: 'cover', radius: unit, name: 'Banner image' });
        y += imgH + unit;
      }
      const items = content.items?.length ? content.items : (content.bullets ?? []).map((b) => ({ title: b, body: undefined as string | undefined }));
      const available = H - y - tabH - ctaH - unit * (ctaH ? 2 : 1);
      const cardH = Math.round(clamp(available / items.length - unit * 0.7, unit * 3.2, unit * 6.5));
      for (const [i, item] of items.entries()) {
        if (y + cardH > H - tabH - ctaH - unit) break;
        push({ type: 'rect', x: pad, y, w: W - 2 * pad, h: cardH, fill: 'surface', radius: Math.round(unit * 0.9), name: `Card ${i + 1}` });
        push({ type: 'ellipse', x: pad + unit, y: Math.round(y + cardH / 2 - unit * 1.2), w: unit * 2.4, h: unit * 2.4, fill: i % 2 ? 'accent' : 'primary', name: `Card ${i + 1} icon` });
        const blocks = [
          text({ text: item.title, x: pad + unit * 4.2, y: 0, w: W - 2 * pad - unit * 5.2, size: Math.round(unit * 1.15), weight: 700, lineHeight: 1.2, name: `Card ${i + 1} title` }),
          ...(item.body && cardH > unit * 4 ? [text({ text: item.body, x: pad + unit * 4.2, y: 0, w: W - 2 * pad - unit * 5.2, size: Math.round(unit * 0.95), color: 'muted', lineHeight: 1.3, name: `Card ${i + 1} text` })] : []),
        ];
        const fitBlocks = blocks.map((b, bi) => (bi === 1 ? fitHeading(b, cardH - (blocks[0].h as number) - unit * 1.4, Math.round(unit * 0.8)) : b));
        stack(fitBlocks, y + Math.max(unit * 0.5, Math.round((cardH - heightOf(fitBlocks, unit * 0.2)) / 2)), Math.round(unit * 0.2));
        y += cardH + Math.round(unit * 0.7);
      }
      if (content.cta) {
        const by = H - tabH - ctaH - unit;
        push({ type: 'rect', x: pad, y: by, w: W - 2 * pad, h: ctaH, fill: 'primary', radius: Math.round(ctaH / 2), name: 'Button' });
        push(text({ text: content.cta, x: pad, y: by, w: W - 2 * pad, h: ctaH, size: Math.round(unit * 1.15), weight: 700, align: 'center', valign: 'middle', color: readableOn(theme.colors.primary), name: 'Button label' }));
      }
      push({ type: 'rect', x: 0, y: H - tabH, w: W, h: tabH, fill: 'surface', name: 'Tab bar' });
      ['Home', 'Search', 'Saved', 'Profile'].forEach((label, i) => {
        const cx = Math.round((W / 4) * (i + 0.5));
        push({ type: 'ellipse', x: cx - unit, y: H - tabH + unit, w: unit * 2, h: unit * 2, fill: i === 0 ? 'primary' : 'muted', opacity: i === 0 ? 1 : 0.35, name: `Tab ${i + 1} icon` });
        push(text({ text: label, x: cx - unit * 3, y: H - tabH + unit * 3.3, w: unit * 6, size: Math.round(unit * 0.8), align: 'center', color: i === 0 ? 'primary' : 'muted', weight: i === 0 ? 600 : 400, name: `Tab ${i + 1} label` }));
      });
      return { background: 'background', elements: els };
    }

    case 'poster': {
      const w = W - 2 * m;
      const titleBlock = text({ text: content.title ?? '', x: m, y: 0, w, size: Math.round(T * 1.5), weight: 800, font: 'heading', lineHeight: 1.0, uppercase: true, name: 'Headline' });
      const head = [...kicker(content.kicker, m, w), fitHeading(titleBlock, H * 0.3, Math.round(T * 0.7)), ...(content.subtitle ? [text({ text: content.subtitle, x: m, y: 0, w, size: Math.round(B * 1.3), color: 'muted', lineHeight: 1.3, name: 'Subtitle' })] : [])];
      const headBottom = stack(head, m, Math.round(B * 0.5));
      const footer = [
        ...(content.body ? [text({ text: content.body, x: m, y: 0, w: w * 0.9, size: B, lineHeight: 1.45, name: 'Details' })] : []),
        ...(content.footer ? [text({ text: content.footer, x: m, y: 0, w, size: Math.round(B * 1.1), weight: 700, color: 'primary', name: 'Date and place' })] : []),
      ];
      const footH = heightOf(footer, Math.round(B * 0.5));
      const mediaTop = headBottom + B * 1.4;
      const mediaH = H - mediaTop - m - footH - (footer.length ? B * 1.4 : 0);
      if (mediaH > H * 0.15) {
        if (hasMedia) media(m, mediaTop, w, mediaH, Math.round(base * 0.01));
        else {
          push({ type: 'rect', x: m, y: mediaTop, w, h: mediaH, fill: 'primary', radius: Math.round(base * 0.01), name: 'Color panel' });
          push({ type: 'ellipse', x: Math.round(m + w * 0.45), y: Math.round(mediaTop + mediaH * 0.2), w: Math.round(Math.min(w, mediaH) * 0.7), h: Math.round(Math.min(w, mediaH) * 0.7), fill: 'accent', opacity: 0.9, name: 'Circle' });
        }
      }
      stack(footer, H - m - footH, Math.round(B * 0.5));
      return { background: 'background', elements: els };
    }
  }
}

/** Layouts that suit a format, best first. */
export function layoutsFor(format: string): LayoutName[] {
  switch (format) {
    case 'document':
      return ['article', 'title', 'bullets', 'two-column', 'chart', 'stats', 'cards', 'quote', 'blank'];
    case 'social':
    case 'poster':
      return ['poster', 'title', 'quote', 'stats', 'image-left', 'blank'];
    case 'web':
      return ['hero', 'cards', 'stats', 'image-right', 'two-column', 'blank'];
    case 'mobile':
      return ['app-screen', 'cards', 'title', 'blank'];
    default:
      return ['title', 'section', 'bullets', 'two-column', 'image-left', 'image-right', 'chart', 'quote', 'stats', 'cards', 'closing', 'blank'];
  }
}
