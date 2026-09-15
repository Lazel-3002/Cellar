import type { Artboard, DesignElement, DesignTheme, TextElement } from '../types/design';
import { estimateTextHeight, plainText } from './text';
import { contrastRatio, fontName, resolveColor } from './theme';

const intersects = (a: DesignElement, b: DesignElement) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

const short = (text: string) => {
  const line = plainText(text).split('\n').find((l) => l.trim())?.trim() ?? '';
  return line.length > 32 ? `${line.slice(0, 31)}…` : line;
};

/** The color behind a point: the topmost filled shape below the element, or the artboard. */
function backgroundAt(artboard: Artboard, index: number, x: number, y: number, theme: DesignTheme): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const el = artboard.elements[i];
    if (el.hidden || x < el.x || x > el.x + el.w || y < el.y || y > el.y + el.h) continue;
    if (el.type === 'image' || el.type === 'chart' || el.type === 'svg') return null;
    if (el.type === 'rect' || el.type === 'ellipse') {
      if (el.gradient) return null;
      const fill = resolveColor(el.fill, theme, 'transparent');
      if (fill !== 'transparent' && (el.opacity ?? 1) > 0.6) return fill;
    }
    if (el.type === 'text' && el.fill) {
      const fill = resolveColor(el.fill, theme, 'transparent');
      if (fill !== 'transparent') return fill;
    }
  }
  return artboard.gradient ? null : resolveColor(artboard.background, theme, 'background');
}

/** Layout problems a model (or person) should fix: overflowing or overlapping text, off-artboard elements, low contrast. */
export function checkArtboard(artboard: Artboard, theme: DesignTheme): string[] {
  const out: string[] = [];
  const base = Math.sqrt(artboard.width * artboard.height);
  const visible = artboard.elements.filter((e) => !e.hidden);
  artboard.elements.forEach((el, index) => {
    if (el.hidden) return;
    const label = el.type === 'text' ? `${el.id} ("${short(el.text)}")` : el.id;
    const left = Math.min(el.x, el.x + el.w);
    const top = Math.min(el.y, el.y + el.h);
    const right = Math.max(el.x, el.x + el.w);
    const bottom = Math.max(el.y, el.y + el.h);
    if (right <= 0 || bottom <= 0 || left >= artboard.width || top >= artboard.height) {
      out.push(`${label} is entirely outside the ${artboard.width}×${artboard.height} artboard.`);
      return;
    }
    if ((el.type === 'text' || el.type === 'chart') && (left < -2 || top < -2 || right > artboard.width + 2 || bottom > artboard.height + 2)) {
      out.push(`${label} extends past the artboard edge (x ${Math.round(el.x)}–${Math.round(right)}, y ${Math.round(el.y)}–${Math.round(bottom)} on a ${artboard.width}×${artboard.height} artboard).`);
    }
    if (el.type !== 'text') return;
    const needed = estimateTextHeight(el, fontName(el.font, theme));
    if (needed > el.h * 1.12 + el.size * 0.4) {
      out.push(`${label} probably needs about ${needed}px of height but its box is ${Math.round(el.h)}px: enlarge the box, shorten the text or lower the size (${el.size}px).`);
    }
    if (el.size < base * 0.0095) out.push(`${label} uses ${el.size}px text, which is hard to read at this artboard size.`);
    const bg = backgroundAt(artboard, index, el.x + el.w / 2, el.y + Math.min(el.h, el.size) / 2, theme);
    const fg = resolveColor(el.color, theme, 'text');
    if (bg && fg !== 'transparent' && !fg.startsWith('rgba') && contrastRatio(fg, bg) < 2.6 && (el.opacity ?? 1) > 0.5) {
      out.push(`${label} has low contrast against what is behind it (${fg} on ${bg}).`);
    }
  });
  const texts = visible.filter((e): e is TextElement => e.type === 'text');
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const area = intersects(texts[i], texts[j]);
      const smaller = Math.min(texts[i].w * texts[i].h, texts[j].w * texts[j].h);
      if (area > smaller * 0.25) out.push(`${texts[i].id} and ${texts[j].id} overlap; move one of them.`);
    }
  }
  return out.slice(0, 12);
}
