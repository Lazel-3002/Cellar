import type { Artboard, Design, DesignElement, DesignTheme } from '../types/design';
import { layoutElements, type LayoutContent, type LayoutName } from './layouts';
import { newArtboardId, newElementId, normalizeElement, type NormalizeContext } from './normalize';
import { plainText } from './text';

/** Finds an artboard by id, name or 1-based position. */
export function findArtboard(design: Pick<Design, 'artboards'>, ref: unknown): Artboard | undefined {
  if (ref === undefined || ref === null || ref === '') return undefined;
  const text = String(ref).trim();
  const byId = design.artboards.find((a) => a.id === text);
  if (byId) return byId;
  const lower = text.toLowerCase();
  const byName = design.artboards.find((a) => a.name.toLowerCase() === lower);
  if (byName) return byName;
  const n = Number(text.replace(/^(artboard|slide|page|screen)\s*#?/i, ''));
  if (Number.isInteger(n) && n >= 1 && n <= design.artboards.length) return design.artboards[n - 1];
  if (lower === 'last') return design.artboards[design.artboards.length - 1];
  if (lower === 'first') return design.artboards[0];
  return design.artboards.find((a) => a.name.toLowerCase().includes(lower));
}

export function findElement(design: Pick<Design, 'artboards'>, id: string): { artboard: Artboard; element: DesignElement; index: number } | undefined {
  for (const artboard of design.artboards) {
    const index = artboard.elements.findIndex((e) => e.id === id);
    if (index >= 0) return { artboard, element: artboard.elements[index], index };
  }
  return undefined;
}

/** Copies elements with fresh ids. */
export function cloneElements(elements: DesignElement[], ids: Set<string>, offset = 0): DesignElement[] {
  return elements.map((el) => ({ ...structuredClone(el), id: newElementId(el.type, ids), x: el.x + offset, y: el.y + offset }));
}

export function duplicateArtboard(design: Design, artboard: Artboard, name?: string): Artboard {
  const ids = new Set(design.artboards.flatMap((a) => a.elements.map((e) => e.id)));
  return {
    ...structuredClone(artboard),
    id: newArtboardId(design.artboards.map((a) => a.id)),
    name: name?.trim().slice(0, 80) || `${artboard.name} copy`,
    elements: cloneElements(artboard.elements, ids),
  };
}

/** Resizes an artboard, scaling its elements to match. */
export function resizeArtboard(artboard: Artboard, width: number, height: number, scaleContent = true): void {
  if (scaleContent && artboard.width > 0 && artboard.height > 0) {
    const sx = width / artboard.width;
    const sy = height / artboard.height;
    const s = Math.min(sx, sy);
    for (const el of artboard.elements) {
      el.x = Math.round(el.x * sx);
      el.y = Math.round(el.y * sy);
      el.w = Math.round(el.w * sx);
      el.h = Math.round(el.h * sy);
      if (el.type === 'text') {
        el.size = Math.max(4, Math.round(el.size * s));
        if (el.padding) el.padding = Math.round(el.padding * s);
      }
      if ((el.type === 'rect' || el.type === 'text' || el.type === 'image') && el.radius) el.radius = Math.round(el.radius * s);
      if ((el.type === 'rect' || el.type === 'ellipse' || el.type === 'line') && el.strokeWidth) el.strokeWidth = Math.max(0.5, Math.round(el.strokeWidth * s * 10) / 10);
    }
  }
  artboard.width = width;
  artboard.height = height;
}

/** Elements for a layout, with ids. */
export function buildLayout(layout: LayoutName, content: LayoutContent, size: { width: number; height: number }, theme: DesignTheme, ids: Set<string>): { background?: string; elements: DesignElement[]; errors: string[] } {
  const { background, elements: raw } = layoutElements(layout, content, size, theme);
  const ctx: NormalizeContext = { width: size.width, height: size.height, theme, ids };
  const elements: DesignElement[] = [];
  const errors: string[] = [];
  for (const item of raw) {
    const { element, error } = normalizeElement(item, ctx);
    if (element) elements.push(element);
    else if (error) errors.push(error);
  }
  return { background, elements, errors };
}

export type OrderChange = 'front' | 'back' | 'forward' | 'backward';

export function reorderElement(artboard: Artboard, id: string, change: OrderChange): void {
  const index = artboard.elements.findIndex((e) => e.id === id);
  if (index < 0) return;
  const [el] = artboard.elements.splice(index, 1);
  const target = change === 'front' ? artboard.elements.length : change === 'back' ? 0 : change === 'forward' ? Math.min(artboard.elements.length, index + 1) : Math.max(0, index - 1);
  artboard.elements.splice(target, 0, el);
}

/** One line per element, for tool results and the prompt. */
export function describeElement(el: DesignElement): string {
  const pos = `at ${Math.round(el.x)},${Math.round(el.y)} size ${Math.round(el.w)}×${Math.round(el.h)}`;
  const name = el.name ? ` [${el.name}]` : '';
  switch (el.type) {
    case 'text': {
      const text = plainText(el.text).replace(/\s+/g, ' ').trim();
      const excerpt = text.length > 60 ? `${text.slice(0, 59)}…` : text;
      return `${el.id} text${name} "${excerpt}" ${pos}, ${el.size}px${el.weight && el.weight >= 600 ? ' bold' : ''}${el.font ? ` ${el.font}` : ''}${el.color ? `, color ${el.color}` : ''}${el.list ? `, ${el.list} list` : ''}`;
    }
    case 'rect':
    case 'ellipse':
      return `${el.id} ${el.type}${name} ${pos}, fill ${el.gradient ? 'gradient' : el.fill ?? 'none'}${el.radius ? `, radius ${el.radius}` : ''}`;
    case 'line':
      return `${el.id} line${name} from ${Math.round(el.x)},${Math.round(el.y)} to ${Math.round(el.x + el.w)},${Math.round(el.y + el.h)}, ${el.stroke ?? 'muted'}`;
    case 'image':
      return `${el.id} image${name} ${pos}${el.src ? '' : ' (empty placeholder)'}`;
    case 'chart':
      return `${el.id} chart${name} ${el.chart.kind} of ${el.chart.series.map((s) => s.name).join(', ')} (${el.chart.labels.length} labels) ${pos}`;
    case 'svg':
      return `${el.id} svg${name} ${pos}`;
  }
}

export function describeArtboard(artboard: Artboard, index: number, withElements = true): string {
  const head = `${index + 1}. ${artboard.id} "${artboard.name}" ${artboard.width}×${artboard.height}, background ${artboard.gradient ? 'gradient' : artboard.background}, ${artboard.elements.length} element${artboard.elements.length === 1 ? '' : 's'}`;
  if (!withElements || artboard.elements.length === 0) return head;
  return `${head}\n${artboard.elements.map((e) => `   ${describeElement(e)}`).join('\n')}`;
}
