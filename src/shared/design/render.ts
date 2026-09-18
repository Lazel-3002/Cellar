import type { Artboard, Design, DesignElement, DesignTheme, ImageElement, LineElement, LinkTarget, ShapeElement, TextElement } from '../types/design';
import { findArtboard } from './ops';
import { chartSvg, escapeXml } from './charts';
import { svgDataUrl } from './svg';
import { inlineRuns, paragraphs } from './text';
import { fontName, fontStack, gradientCss, resolveColor } from './theme';

/** Inline styles with camelCase keys and string values: usable as React styles and serializable to CSS. */
export type Style = Record<string, string>;

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

export function cssText(style: Style): string {
  return Object.entries(style)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`)
    .join(';');
}

/** Position, size, rotation and opacity. Lines use their bounding box. */
export function boxStyle(el: DesignElement): Style {
  const left = el.type === 'line' ? Math.min(el.x, el.x + el.w) : el.x;
  const top = el.type === 'line' ? Math.min(el.y, el.y + el.h) : el.y;
  const width = el.type === 'line' ? Math.abs(el.w) : el.w;
  const height = el.type === 'line' ? Math.abs(el.h) : el.h;
  const style: Style = { position: 'absolute', left: px(left), top: px(top), width: px(width), height: px(height), boxSizing: 'border-box' };
  if (el.rotation) style.transform = `rotate(${el.rotation}deg)`;
  if (el.opacity !== undefined && el.opacity < 1) style.opacity = String(el.opacity);
  if (el.hidden) style.display = 'none';
  return style;
}

export function textStyle(el: TextElement, theme: DesignTheme): Style {
  const style: Style = {
    ...boxStyle(el),
    display: 'flex',
    flexDirection: 'column',
    justifyContent: el.valign === 'middle' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start',
    fontFamily: fontStack(fontName(el.font, theme)),
    fontSize: px(el.size),
    fontWeight: String(el.weight ?? 400),
    lineHeight: String(el.lineHeight ?? 1.25),
    color: resolveColor(el.color, theme, 'text'),
    textAlign: el.align ?? 'left',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  };
  if (el.italic) style.fontStyle = 'italic';
  if (el.underline) style.textDecoration = 'underline';
  if (el.uppercase) style.textTransform = 'uppercase';
  if (el.letterSpacing) style.letterSpacing = `${el.letterSpacing}em`;
  if (el.fill) style.background = resolveColor(el.fill, theme, 'transparent');
  if (el.radius) style.borderRadius = px(el.radius);
  if (el.padding) style.padding = px(el.padding);
  return style;
}

export function shapeStyle(el: ShapeElement, theme: DesignTheme): Style {
  const style: Style = { ...boxStyle(el), background: el.gradient ? gradientCss(el.gradient, theme) : resolveColor(el.fill, theme, 'transparent') };
  if (el.type === 'ellipse') style.borderRadius = '50%';
  else if (el.radius) style.borderRadius = px(Math.min(el.radius, el.w / 2, el.h / 2));
  if (el.stroke && (el.strokeWidth ?? 1) > 0) style.border = `${px(el.strokeWidth ?? 1)} solid ${resolveColor(el.stroke, theme, 'text')}`;
  if (el.shadow) style.boxShadow = `0 ${px(Math.max(2, el.h * 0.03))} ${px(Math.max(8, el.h * 0.12))} rgba(0,0,0,0.18)`;
  return style;
}

export function imageFrameStyle(el: ImageElement, theme: DesignTheme): Style {
  const style: Style = { ...boxStyle(el), overflow: 'hidden' };
  if (el.radius) style.borderRadius = px(Math.min(el.radius, el.w / 2, el.h / 2));
  if (!el.src) {
    style.background = resolveColor('surface', theme);
    style.border = `${px(Math.max(1, Math.min(el.w, el.h) * 0.004))} dashed ${resolveColor('muted', theme)}`;
  }
  return style;
}

/** The `<img>` itself (not its frame): crop pre-scales/shifts it to fill the frame exactly; filters are plain CSS. Shared by the canvas and every export, so both render identically. */
export function imageStyle(el: ImageElement): Style {
  const style: Style = { display: 'block' };
  const crop = el.crop;
  if (crop && crop.w > 0 && crop.h > 0) {
    style.position = 'absolute';
    style.width = `${Math.round((100 / crop.w) * 1000) / 1000}%`;
    style.height = `${Math.round((100 / crop.h) * 1000) / 1000}%`;
    style.left = `${Math.round(((-100 * crop.x) / crop.w) * 1000) / 1000}%`;
    style.top = `${Math.round(((-100 * crop.y) / crop.h) * 1000) / 1000}%`;
  } else {
    style.width = '100%';
    style.height = '100%';
    style.objectFit = el.fit ?? 'cover';
  }
  const filters = [
    el.filters?.brightness !== undefined && el.filters.brightness !== 1 ? `brightness(${el.filters.brightness})` : '',
    el.filters?.contrast !== undefined && el.filters.contrast !== 1 ? `contrast(${el.filters.contrast})` : '',
    el.filters?.saturate !== undefined && el.filters.saturate !== 1 ? `saturate(${el.filters.saturate})` : '',
  ].filter(Boolean);
  if (filters.length) style.filter = filters.join(' ');
  return style;
}

export function artboardStyle(artboard: Artboard, theme: DesignTheme): Style {
  return {
    position: 'relative',
    width: px(artboard.width),
    height: px(artboard.height),
    overflow: 'hidden',
    background: artboard.gradient ? gradientCss(artboard.gradient, theme) : resolveColor(artboard.background, theme, 'background'),
  };
}

/** SVG markup for a line element inside its bounding box. */
export function lineSvg(el: LineElement, theme: DesignTheme): string {
  const width = Math.max(1, Math.abs(el.w));
  const height = Math.max(1, Math.abs(el.h));
  const x1 = el.w >= 0 ? 0 : width;
  const y1 = el.h >= 0 ? 0 : height;
  const stroke = el.strokeWidth ?? 2;
  const color = resolveColor(el.stroke, theme, 'muted');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible;display:block"><line x1="${x1}" y1="${y1}" x2="${width - x1}" y2="${height - y1}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"${el.dashed ? ` stroke-dasharray="${stroke * 3} ${stroke * 2}"` : ''}/></svg>`;
}

/** Placeholder picture icon for images without a source. */
export function placeholderSvg(theme: DesignTheme): string {
  const c = escapeXml(resolveColor('muted', theme));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${c}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>`;
}

export interface HtmlOptions {
  /** URL for an image element's src (attachment ids become data URLs in exports). */
  imageUrl: (src: string) => string;
  /** `@font-face` rules (as data URLs) for any custom fonts this design uses, so exports render them offline. */
  fontFaces?: string;
  /** Only 'html' and 'pdf' carry every artboard as one addressable page/section, so only those wrap hotspots in a real `<a>`. */
  mode?: 'pdf' | 'png' | 'html';
  /** Resolves a hotspot to an href ("#a2" or an external URL); set by `designHtml`/`artboardSvg`, which know every artboard's id. */
  linkHref?: (link: LinkTarget) => string | null;
}

function textHtml(el: TextElement): string {
  const lines = paragraphs(el.text);
  return lines
    .map((line, i) => {
      const runs = inlineRuns(line)
        .map((r) => (r.bold ? `<strong style="font-weight:${Math.max(700, (el.weight ?? 400) + 300)}">${escapeXml(r.text)}</strong>` : escapeXml(r.text)))
        .join('');
      const content = runs || '&#8203;';
      if (el.list && line.trim()) {
        const marker = el.list === 'number' ? `${lines.slice(0, i + 1).filter((l) => l.trim()).length}.` : '•';
        return `<div style="display:flex;margin-bottom:${i < lines.length - 1 ? '0.35em' : '0'}"><span style="flex:0 0 1.2em">${marker}</span><span style="flex:1;min-width:0">${content}</span></div>`;
      }
      return `<div>${content}</div>`;
    })
    .join('');
}

function elementBodyHtml(el: DesignElement, theme: DesignTheme, options: HtmlOptions): string {
  switch (el.type) {
    case 'text':
      return `<div style="${escapeXml(cssText(textStyle(el, theme)))}">${textHtml(el)}</div>`;
    case 'rect':
    case 'ellipse':
      return `<div style="${escapeXml(cssText(shapeStyle(el, theme)))}"></div>`;
    case 'line':
      return `<div style="${escapeXml(cssText(boxStyle(el)))};overflow:visible">${lineSvg(el, theme)}</div>`;
    case 'image': {
      const frame = escapeXml(cssText(imageFrameStyle(el, theme)));
      if (!el.src) return `<div style="${frame}"><div style="position:absolute;left:35%;top:35%;width:30%;height:30%">${placeholderSvg(theme)}</div></div>`;
      return `<div style="${frame}"><img alt="${escapeXml(el.alt ?? '')}" src="${escapeXml(options.imageUrl(el.src))}" style="${escapeXml(cssText(imageStyle(el)))}"></div>`;
    }
    case 'chart':
      return `<div style="${escapeXml(cssText(boxStyle(el)))}">${chartSvg(el.chart, el.w, el.h, { theme, color: el.color, font: el.font ? fontName(el.font, theme) : undefined })}</div>`;
    case 'svg':
      return `<div style="${escapeXml(cssText(boxStyle(el)))}"><img alt="" src="${escapeXml(svgDataUrl(el.svg))}" style="width:100%;height:100%;display:block"></div>`;
  }
}

export function elementHtml(el: DesignElement, theme: DesignTheme, options: HtmlOptions): string {
  const body = elementBodyHtml(el, theme, options);
  const wrappable = el.link && (options.mode === 'html' || options.mode === 'pdf');
  const href = wrappable ? options.linkHref?.(el.link!) : null;
  if (!href) return body;
  // An <a> around an absolutely-positioned <div> doesn't affect its position (it isn't itself positioned), so the div's own layout is untouched.
  const external = el.link!.kind === 'url';
  return `<a href="${escapeXml(href)}" style="text-decoration:none;color:inherit"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${body}</a>`;
}

export function artboardHtml(artboard: Artboard, theme: DesignTheme, options: HtmlOptions): string {
  // The id is what a hotspot's href="#..." target actually points to (see designHtml's linkHref).
  return `<div class="artboard" id="${escapeXml(artboard.id)}" style="${escapeXml(cssText(artboardStyle(artboard, theme)))}">${artboard.elements.map((el) => elementHtml(el, theme, options)).join('')}</div>`;
}

/**
 * A static page with the chosen artboards: one per PDF page (each page sized to its artboard), a
 * single artboard at the top-left for PNG capture, or every artboard stacked with a gap for a
 * portable HTML export.
 */
export function designHtml(design: Pick<Design, 'title' | 'theme' | 'artboards'>, artboardIds: string[] | undefined, options: HtmlOptions & { mode: 'pdf' | 'png' | 'html' }): string {
  const boards = design.artboards.filter((a) => !artboardIds?.length || artboardIds.includes(a.id));
  const linkHref = (link: LinkTarget): string | null => (link.kind === 'url' ? (link.url ?? null) : (() => { const target = findArtboard(design, link.artboard); return target ? `#${target.id}` : null; })());
  const opts: HtmlOptions & { mode: 'pdf' | 'png' | 'html' } = { ...options, linkHref };
  const pages = boards
    .map((a, i) => {
      const inner = artboardHtml(a, design.theme, opts);
      return options.mode === 'pdf' ? `<section class="page" style="page:p${i};width:${a.width}px;height:${a.height}px">${inner}</section>` : options.mode === 'html' ? `<section class="board">${inner}</section>` : inner;
    })
    .join('');
  const pageRules = options.mode === 'pdf' ? boards.map((a, i) => `@page p${i}{size:${a.width}px ${a.height}px;margin:0}`).join('') : '';
  const bodyRules = options.mode === 'html' ? 'body{display:flex;flex-direction:column;align-items:center;gap:32px;padding:32px;background:#e9e9e9}.board{box-shadow:0 4px 24px rgba(0,0,0,0.18)}' : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(design.title)}</title><style>${options.fontFaces ?? ''}${pageRules}
html,body{margin:0;padding:0;background:transparent;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{overflow:hidden;break-after:page}.page:last-child{break-after:auto}
.artboard *{margin:0}
${bodyRules}
</style></head><body>${pages}</body></html>`;
}

/** A single artboard as a standalone SVG document: the same markup as the HTML export, embedded via foreignObject so fonts, gradients and images render identically. */
export function artboardSvg(artboard: Artboard, theme: DesignTheme, options: HtmlOptions): string {
  const inner = artboardHtml(artboard, theme, options);
  const style = options.fontFaces ? `<style>${options.fontFaces}</style>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" width="${artboard.width}" height="${artboard.height}" viewBox="0 0 ${artboard.width} ${artboard.height}">${style}<foreignObject width="100%" height="100%"><xhtml:div xmlns="http://www.w3.org/1999/xhtml" style="width:${artboard.width}px;height:${artboard.height}px;position:relative;overflow:hidden">${inner}</xhtml:div></foreignObject></svg>`;
}
