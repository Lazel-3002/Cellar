import type { Artboard, Design, DesignElement, DesignTheme, ImageElement, LineElement, ShapeElement, TextElement } from '../types/design';
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

export function elementHtml(el: DesignElement, theme: DesignTheme, options: HtmlOptions): string {
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
      return `<div style="${frame}"><img alt="${escapeXml(el.alt ?? '')}" src="${escapeXml(options.imageUrl(el.src))}" style="width:100%;height:100%;object-fit:${el.fit ?? 'cover'};display:block"></div>`;
    }
    case 'chart':
      return `<div style="${escapeXml(cssText(boxStyle(el)))}">${chartSvg(el.chart, el.w, el.h, { theme, color: el.color, font: el.font ? fontName(el.font, theme) : undefined })}</div>`;
    case 'svg':
      return `<div style="${escapeXml(cssText(boxStyle(el)))}"><img alt="" src="${escapeXml(svgDataUrl(el.svg))}" style="width:100%;height:100%;display:block"></div>`;
  }
}

export function artboardHtml(artboard: Artboard, theme: DesignTheme, options: HtmlOptions): string {
  return `<div class="artboard" style="${escapeXml(cssText(artboardStyle(artboard, theme)))}">${artboard.elements.map((el) => elementHtml(el, theme, options)).join('')}</div>`;
}

/**
 * A static page with the chosen artboards: one per PDF page (each page sized to its artboard), or a
 * single artboard at the top-left for PNG capture.
 */
export function designHtml(design: Pick<Design, 'title' | 'theme' | 'artboards'>, artboardIds: string[] | undefined, options: HtmlOptions & { mode: 'pdf' | 'png' }): string {
  const boards = design.artboards.filter((a) => !artboardIds?.length || artboardIds.includes(a.id));
  const pages = boards
    .map((a, i) => {
      const inner = artboardHtml(a, design.theme, options);
      return options.mode === 'pdf' ? `<section class="page" style="page:p${i};width:${a.width}px;height:${a.height}px">${inner}</section>` : inner;
    })
    .join('');
  const pageRules = options.mode === 'pdf' ? boards.map((a, i) => `@page p${i}{size:${a.width}px ${a.height}px;margin:0}`).join('') : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(design.title)}</title><style>${pageRules}
html,body{margin:0;padding:0;background:transparent;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{overflow:hidden;break-after:page}.page:last-child{break-after:auto}
.artboard *{margin:0}
</style></head><body>${pages}</body></html>`;
}
