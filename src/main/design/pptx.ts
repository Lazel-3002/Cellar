import PptxGenJS from 'pptxgenjs';
import { inlineRuns, paragraphs } from '@shared/design/text';
import { chartPalette, fontName, hex6, mixColors, parseRgb, resolveColor } from '@shared/design/theme';
import type { Artboard, ChartElement, DesignElement, DesignTheme, TextElement } from '@shared/types/design';
import type { ResolvedImage } from './images';

export interface PptxAssets {
  image(src: string): Promise<ResolvedImage | null>;
  /** PNG of an SVG, when a renderer is available (PowerPoint shows SVG only in recent versions). */
  rasterize?(svg: string, width: number, height: number): Promise<Buffer | null>;
}

const SLIDE_WIDTH_IN = 13.333;

/** Transparency (0–100) from a color's alpha and the element opacity. */
function transparency(color: string, opacity = 1): number | undefined {
  const alpha = (parseRgb(color)?.a ?? 1) * opacity;
  return alpha >= 1 ? undefined : Math.round((1 - alpha) * 100);
}

function textRuns(el: TextElement): PptxGenJS.TextProps[] {
  const lines = paragraphs(el.text);
  const out: PptxGenJS.TextProps[] = [];
  lines.forEach((line, li) => {
    const runs = inlineRuns(line);
    runs.forEach((run, ri) => {
      const last = ri === runs.length - 1;
      out.push({
        text: el.uppercase ? run.text.toUpperCase() : run.text,
        options: {
          ...(run.bold ? { bold: true } : {}),
          ...(last && li < lines.length - 1 ? { breakLine: true } : {}),
          ...(ri === 0 && el.list && line.trim() ? { bullet: el.list === 'number' ? { type: 'number' } : true } : {}),
          ...(ri === 0 && el.list ? { paraSpaceAfter: Math.round(el.size * 0.35 * 0.75) } : {}),
        },
      });
    });
  });
  return out;
}

const CHART_TYPES: Record<ChartElement['chart']['kind'], PptxGenJS.CHART_NAME> = { bar: 'bar', hbar: 'bar', line: 'line', area: 'area', pie: 'pie', donut: 'doughnut' };

/**
 * Artboards as PowerPoint slides with editable text, shapes and native charts. The slide size follows
 * the first artboard; artboards of other proportions are scaled to fit and centered.
 */
export async function artboardsToPptx(artboards: Artboard[], theme: DesignTheme, meta: { title: string; author?: string }, assets: PptxAssets): Promise<Buffer> {
  const pptx = new PptxGenJS();
  const first = artboards[0] ?? { width: 1920, height: 1080 };
  const slideW = SLIDE_WIDTH_IN;
  const slideH = Math.round((SLIDE_WIDTH_IN * first.height * 1000) / first.width) / 1000;
  pptx.defineLayout({ name: 'CELLAR', width: slideW, height: slideH });
  pptx.layout = 'CELLAR';
  pptx.author = meta.author ?? 'Cellar';
  pptx.title = meta.title;

  for (const artboard of artboards) {
    const slide = pptx.addSlide();
    const k = Math.min(slideW / artboard.width, slideH / artboard.height);
    const ox = (slideW - artboard.width * k) / 2;
    const oy = (slideH - artboard.height * k) / 2;
    const pt = (px: number) => Math.round(px * k * 72 * 10) / 10;
    const inch = (px: number) => Math.round(px * k * 10000) / 10000;
    const pos = (el: Pick<DesignElement, 'x' | 'y' | 'w' | 'h'>) => ({ x: ox + inch(el.x), y: oy + inch(el.y), w: Math.max(0.01, inch(el.w)), h: Math.max(0.01, inch(el.h)) });
    const bg = artboard.gradient ? resolveColor(artboard.gradient.from, theme, 'background') : resolveColor(artboard.background, theme, 'background');
    slide.background = { color: hex6(bg === 'transparent' ? '#FFFFFF' : bg) };
    if (ox > 0.001 || oy > 0.001) {
      // Letterbox artboards of other proportions on the slide.
      slide.background = { color: '000000' };
      slide.addShape('rect', { x: ox, y: oy, w: inch(artboard.width), h: inch(artboard.height), fill: { color: hex6(bg) }, line: { type: 'none' } });
    }

    for (const el of artboard.elements) {
      if (el.hidden) continue;
      const rotate = el.rotation ? { rotate: el.rotation } : {};
      switch (el.type) {
        case 'text': {
          const color = resolveColor(el.color, theme, 'text');
          const fill = el.fill ? resolveColor(el.fill, theme, 'transparent') : 'transparent';
          slide.addText(textRuns(el), {
            ...pos(el),
            ...rotate,
            fontFace: fontName(el.font, theme),
            fontSize: Math.max(1, pt(el.size)),
            color: hex6(color),
            ...(transparency(color, el.opacity) !== undefined ? { transparency: transparency(color, el.opacity) } : {}),
            bold: (el.weight ?? 400) >= 600,
            italic: !!el.italic,
            underline: el.underline ? { style: 'sng' } : undefined,
            align: el.align === 'justify' ? 'justify' : el.align ?? 'left',
            valign: el.valign === 'middle' ? 'middle' : el.valign === 'bottom' ? 'bottom' : 'top',
            lineSpacingMultiple: el.lineHeight ?? 1.25,
            ...(el.letterSpacing ? { charSpacing: Math.round(el.letterSpacing * pt(el.size) * 10) / 10 } : {}),
            margin: el.padding ? pt(el.padding) : 0,
            ...(fill !== 'transparent' ? { fill: { color: hex6(fill), ...(transparency(fill, el.opacity) !== undefined ? { transparency: transparency(fill, el.opacity) } : {}) } } : {}),
            ...(el.radius && fill !== 'transparent' ? { shape: 'roundRect', rectRadius: inch(Math.min(el.radius, el.w / 2, el.h / 2)) } : {}),
            fit: 'none',
            wrap: true,
          });
          break;
        }
        case 'rect':
        case 'ellipse': {
          const fillColor = el.gradient ? resolveColor(el.gradient.from, theme, 'primary') : resolveColor(el.fill, theme, 'transparent');
          const rounded = el.type === 'rect' && !!el.radius;
          slide.addShape(el.type === 'ellipse' ? 'ellipse' : rounded ? 'roundRect' : 'rect', {
            ...pos(el),
            ...rotate,
            fill: fillColor === 'transparent' ? { type: 'none' } : { color: hex6(fillColor), ...(transparency(fillColor, el.opacity) !== undefined ? { transparency: transparency(fillColor, el.opacity) } : {}) },
            line: el.stroke && (el.strokeWidth ?? 1) > 0 ? { color: hex6(resolveColor(el.stroke, theme, 'text')), width: Math.max(0.25, pt(el.strokeWidth ?? 1)) } : { type: 'none' },
            ...(rounded ? { rectRadius: inch(Math.min(el.radius!, el.w / 2, el.h / 2)) } : {}),
            ...(el.shadow ? { shadow: { type: 'outer', color: '000000', opacity: 0.2, blur: 8, offset: 3, angle: 90 } } : {}),
          });
          break;
        }
        case 'line': {
          const color = resolveColor(el.stroke, theme, 'muted');
          slide.addShape('line', {
            x: ox + inch(Math.min(el.x, el.x + el.w)),
            y: oy + inch(Math.min(el.y, el.y + el.h)),
            w: Math.max(0.001, inch(Math.abs(el.w))),
            h: Math.max(0.001, inch(Math.abs(el.h))),
            flipH: el.w < 0 !== el.h < 0 && el.w !== 0 && el.h !== 0,
            line: { color: hex6(color), width: Math.max(0.25, pt(el.strokeWidth ?? 2)), ...(el.dashed ? { dashType: 'dash' } : {}) },
          });
          break;
        }
        case 'image': {
          if (!el.src) {
            slide.addShape('rect', { ...pos(el), fill: { color: hex6(resolveColor('surface', theme)) }, line: { color: hex6(resolveColor('muted', theme)), width: 0.75, dashType: 'dash' } });
            break;
          }
          const image = await assets.image(el.src);
          if (!image) break;
          let data = `${image.mime};base64,${image.bytes.toString('base64')}`;
          let natural = { width: image.width, height: image.height };
          if (image.mime === 'image/svg+xml' && assets.rasterize) {
            const png = await assets.rasterize(image.bytes.toString('utf8'), el.w * 2, el.h * 2);
            if (png) {
              data = `image/png;base64,${png.toString('base64')}`;
              natural = { width: el.w * 2, height: el.h * 2 };
            }
          }
          const box = pos(el);
          const ratio = Math.min(box.w / natural.width, box.h / natural.height);
          slide.addImage({
            data,
            ...rotate,
            ...(el.fit === 'contain'
              ? { x: box.x + (box.w - natural.width * ratio) / 2, y: box.y + (box.h - natural.height * ratio) / 2, w: natural.width * ratio, h: natural.height * ratio }
              : { x: box.x, y: box.y, w: natural.width * (box.w / natural.width), h: natural.height * (box.w / natural.width), sizing: { type: 'cover', w: box.w, h: box.h } }),
            ...(el.alt ? { altText: el.alt } : {}),
          });
          break;
        }
        case 'chart': {
          const spec = el.chart;
          const palette = chartPalette(theme.colors);
          const circular = spec.kind === 'pie' || spec.kind === 'donut';
          const series = circular ? spec.series.slice(0, 1) : spec.series;
          const colors = circular ? spec.labels.map((_, i) => palette[i % palette.length]) : series.map((s, i) => (s.color ? resolveColor(s.color, theme, 'primary') : palette[i % palette.length]));
          const text = hex6(resolveColor(el.color, theme, 'text'));
          const muted = hex6(resolveColor('muted', theme));
          const labelPt = Math.max(8, Math.min(18, pt(Math.min(el.w, el.h) * 0.04)));
          slide.addChart(
            CHART_TYPES[spec.kind],
            series.map((s) => ({ name: s.name, labels: spec.labels, values: s.values })),
            {
              ...pos(el),
              chartColors: colors.map(hex6),
              ...(spec.kind === 'bar' || spec.kind === 'hbar' ? { barDir: spec.kind === 'hbar' ? 'bar' : 'col', barGrouping: spec.stacked ? 'stacked' : 'clustered', barGapWidthPct: 60 } : {}),
              ...(spec.kind === 'area' && spec.stacked ? { barGrouping: 'stacked' } : {}),
              ...(spec.kind === 'donut' ? { holeSize: 58 } : {}),
              showLegend: spec.legend ?? (series.length > 1 || circular),
              legendPos: 'b',
              legendFontSize: labelPt,
              legendColor: text,
              legendFontFace: fontName(el.font, theme),
              showValue: spec.values ?? false,
              ...(circular ? { showPercent: spec.values ?? true, dataLabelColor: 'FFFFFF' } : { dataLabelColor: text }),
              dataLabelFontSize: labelPt,
              ...(spec.title ? { showTitle: true, title: spec.title, titleFontSize: labelPt * 1.3, titleColor: text, titleFontFace: fontName(el.font, theme, 'heading') } : {}),
              catAxisLabelColor: text,
              valAxisLabelColor: muted,
              catAxisLabelFontSize: labelPt,
              valAxisLabelFontSize: labelPt,
              catAxisLabelFontFace: fontName(el.font, theme),
              valAxisLabelFontFace: fontName(el.font, theme),
              valGridLine: { color: hex6(mixColors(resolveColor('muted', theme), bg, 0.7)), style: 'solid', size: 0.5 },
              catGridLine: { style: 'none' },
              ...(spec.unit ? { valAxisLabelFormatCode: `#,##0"${spec.unit.replace(/"/g, '')}"`, dataLabelFormatCode: `#,##0.##"${spec.unit.replace(/"/g, '')}"` } : {}),
              lineSize: 2,
              lineDataSymbol: 'circle',
            },
          );
          break;
        }
        case 'svg': {
          const png = assets.rasterize ? await assets.rasterize(el.svg, el.w * 2, el.h * 2) : null;
          slide.addImage({ data: png ? `image/png;base64,${png.toString('base64')}` : `image/svg+xml;base64,${Buffer.from(el.svg).toString('base64')}`, ...pos(el), ...rotate });
          break;
        }
      }
    }
    if (artboard.notes) slide.addNotes(artboard.notes);
  }
  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.from(out as Uint8Array);
}
