import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { chartSvg } from '@shared/design/charts';
import { artboardStyle, boxStyle, imageFrameStyle, lineSvg, placeholderSvg, shapeStyle, textStyle } from '@shared/design/render';
import { svgDataUrl } from '@shared/design/svg';
import { inlineRuns, paragraphs } from '@shared/design/text';
import { fontName } from '@shared/design/theme';
import type { Artboard, DesignElement, DesignTheme, TextElement } from '@shared/types/design';
import { attachmentImageUrl } from '@/components/chat/Attachments';

export function imageSrcUrl(src: string): string {
  if (src.startsWith('attachment:')) return attachmentImageUrl(src.slice('attachment:'.length));
  return src.startsWith('data:image/') ? src : '';
}

const css = (style: Record<string, string>) => style as unknown as CSSProperties;

function TextContent({ el }: { el: TextElement }) {
  const lines = paragraphs(el.text);
  let number = 0;
  return (
    <>
      {lines.map((line, i) => {
        const runs = inlineRuns(line).map((r, j) =>
          r.bold ? (
            <strong key={j} style={{ fontWeight: Math.max(700, (el.weight ?? 400) + 300) }}>
              {r.text}
            </strong>
          ) : (
            <span key={j}>{r.text}</span>
          ),
        );
        const content = line ? runs : '​';
        if (el.list && line.trim()) {
          number += 1;
          return (
            <div key={i} style={{ display: 'flex', marginBottom: i < lines.length - 1 ? '0.35em' : 0 }}>
              <span style={{ flex: '0 0 1.2em' }}>{el.list === 'number' ? `${number}.` : '•'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{content}</span>
            </div>
          );
        }
        return <div key={i}>{content}</div>;
      })}
    </>
  );
}

interface ElementViewProps {
  el: DesignElement;
  theme: DesignTheme;
  /** Outline text boxes whose text does not fit (canvas only). */
  flagOverflow?: boolean;
  editing?: boolean;
}

export const ElementView = memo(function ElementView({ el, theme, flagOverflow, editing }: ElementViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    if (!flagOverflow || el.type !== 'text' || !ref.current) return;
    const node = ref.current;
    setOverflow(node.scrollHeight > node.clientHeight + Math.max(2, el.size * 0.15));
  }, [flagOverflow, el, theme]);
  const chart = useMemo(() => (el.type === 'chart' ? chartSvg(el.chart, el.w, el.h, { theme, color: el.color, font: el.font ? fontName(el.font, theme) : undefined }) : ''), [el, theme]);
  const common = { 'data-element-id': el.id, 'data-element-type': el.type };

  switch (el.type) {
    case 'text':
      return (
        <div ref={ref} {...common} style={{ ...css(textStyle(el, theme)), ...(editing ? { visibility: 'hidden' } : {}), ...(overflow ? { outline: `${Math.max(1, el.size * 0.04)}px dashed #e5484d`, outlineOffset: 2 } : {}) }} data-overflow={overflow || undefined}>
          <TextContent el={el} />
        </div>
      );
    case 'rect':
    case 'ellipse':
      return <div {...common} style={css(shapeStyle(el, theme))} />;
    case 'line':
      return <div {...common} style={{ ...css(boxStyle(el)), overflow: 'visible' }} dangerouslySetInnerHTML={{ __html: lineSvg(el, theme) }} />;
    case 'image': {
      const url = el.src ? imageSrcUrl(el.src) : '';
      return (
        <div {...common} style={css(imageFrameStyle(el, theme))}>
          {url ? (
            <img src={url} alt={el.alt ?? ''} draggable={false} style={{ width: '100%', height: '100%', objectFit: el.fit ?? 'cover', display: 'block', pointerEvents: 'none' }} />
          ) : (
            <div style={{ position: 'absolute', left: '35%', top: '35%', width: '30%', height: '30%' }} dangerouslySetInnerHTML={{ __html: placeholderSvg(theme) }} />
          )}
        </div>
      );
    }
    case 'chart':
      return <div {...common} style={css(boxStyle(el))} dangerouslySetInnerHTML={{ __html: chart }} />;
    case 'svg':
      return (
        <div {...common} style={css(boxStyle(el))}>
          <img src={svgDataUrl(el.svg)} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
        </div>
      );
  }
});

/** An artboard at 100% size (scale it with a CSS transform). */
export function ArtboardView({ artboard, theme, flagOverflow, editingId, className, style }: { artboard: Artboard; theme: DesignTheme; flagOverflow?: boolean; editingId?: string | null; className?: string; style?: CSSProperties }) {
  return (
    <div className={className} style={{ ...css(artboardStyle(artboard, theme)), ...style }} data-artboard-id={artboard.id}>
      {artboard.elements.map((el) => (
        <ElementView key={el.id} el={el} theme={theme} flagOverflow={flagOverflow} editing={editingId === el.id} />
      ))}
    </div>
  );
}

/** A scaled-down artboard that fits a box. */
export function ArtboardThumbnail({ artboard, theme, width, height, className }: { artboard: Artboard; theme: DesignTheme; width: number; height: number; className?: string }) {
  const scale = Math.min(width / artboard.width, height / artboard.height);
  return (
    <div className={className} style={{ width, height, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: (width - artboard.width * scale) / 2, top: (height - artboard.height * scale) / 2, width: artboard.width * scale, height: artboard.height * scale, overflow: 'hidden' }}>
        <ArtboardView artboard={artboard} theme={theme} style={{ transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}
