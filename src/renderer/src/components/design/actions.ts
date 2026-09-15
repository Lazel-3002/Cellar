import { toast } from 'sonner';
import { elementIds, newArtboardId, normalizeElement } from '@shared/design/normalize';
import { buildLayout, cloneElements, duplicateArtboard, reorderElement, type OrderChange } from '@shared/design/ops';
import type { LayoutName } from '@shared/design/layouts';
import { ARTBOARD_PRESETS, FORMAT_DEFAULTS } from '@shared/design/theme';
import type { AttachmentRef } from '@shared/types/chat';
import type { Artboard, Design, DesignElement } from '@shared/types/design';
import { attachmentImageUrl } from '@/components/chat/Attachments';
import { invoke } from '@/lib/ipc';
import { selectedArtboard, useDesignEditor } from '@/stores/design';

const editor = () => useDesignEditor.getState();

/** Adds a loose element to an artboard and selects it. */
export function addElement(artboardId: string, input: Record<string, unknown>, options: { edit?: boolean } = {}): DesignElement | undefined {
  const { design } = editor();
  const artboard = design?.artboards.find((a) => a.id === artboardId);
  if (!design || !artboard) return undefined;
  const { element, error } = normalizeElement(input, { width: artboard.width, height: artboard.height, theme: design.theme, ids: elementIds(design) });
  if (!element) {
    toast.error(error ?? 'Could not add the element.');
    return undefined;
  }
  editor().change((d) => d.artboards.find((a) => a.id === artboardId)!.elements.push(element));
  editor().select({ artboardId, elementIds: [element.id] });
  if (options.edit) editor().setEditingText(element.id);
  return element;
}

export function deleteSelection(): void {
  const { selection } = editor();
  if (!selection.artboardId || selection.elementIds.length === 0) return;
  editor().change((d) => {
    const artboard = d.artboards.find((a) => a.id === selection.artboardId);
    if (artboard) artboard.elements = artboard.elements.filter((e) => !selection.elementIds.includes(e.id));
  });
  editor().select({ elementIds: [] });
}

export function duplicateSelection(offset = 24): void {
  const state = editor();
  const artboard = selectedArtboard(state);
  if (!state.design || !artboard || state.selection.elementIds.length === 0) return;
  const ids = elementIds(state.design);
  const copies = cloneElements(artboard.elements.filter((e) => state.selection.elementIds.includes(e.id)), ids, offset);
  state.change((d) => d.artboards.find((a) => a.id === artboard.id)!.elements.push(...copies));
  editor().select({ elementIds: copies.map((c) => c.id) });
}

export function copySelection(): void {
  const state = editor();
  const artboard = selectedArtboard(state);
  if (!artboard) return;
  const elements = artboard.elements.filter((e) => state.selection.elementIds.includes(e.id));
  if (elements.length) state.setClipboard(structuredClone(elements));
}

export function pasteClipboard(): boolean {
  const state = editor();
  const artboard = selectedArtboard(state);
  if (!state.design || !artboard || state.clipboard.length === 0) return false;
  const copies = cloneElements(state.clipboard, elementIds(state.design), 24);
  state.change((d) => d.artboards.find((a) => a.id === artboard.id)!.elements.push(...copies));
  editor().select({ elementIds: copies.map((c) => c.id) });
  state.setClipboard(copies);
  return true;
}

export function nudgeSelection(dx: number, dy: number): void {
  const state = editor();
  const artboard = selectedArtboard(state);
  if (!artboard) return;
  const patches: Record<string, Partial<DesignElement>> = {};
  for (const el of artboard.elements) if (state.selection.elementIds.includes(el.id) && !el.locked) patches[el.id] = { x: el.x + dx, y: el.y + dy };
  if (Object.keys(patches).length) state.patchElements(artboard.id, patches);
}

export type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Aligns the selection to the artboard (one element) or to the selection bounds (several). */
export function alignSelection(edge: AlignEdge): void {
  const state = editor();
  const artboard = selectedArtboard(state);
  if (!artboard) return;
  const items = artboard.elements.filter((e) => state.selection.elementIds.includes(e.id) && !e.locked);
  if (items.length === 0) return;
  const bounds =
    items.length === 1
      ? { x: 0, y: 0, w: artboard.width, h: artboard.height }
      : (() => {
          const x = Math.min(...items.map((e) => e.x));
          const y = Math.min(...items.map((e) => e.y));
          return { x, y, w: Math.max(...items.map((e) => e.x + e.w)) - x, h: Math.max(...items.map((e) => e.y + e.h)) - y };
        })();
  const patches: Record<string, Partial<DesignElement>> = {};
  for (const e of items) {
    if (edge === 'left') patches[e.id] = { x: bounds.x };
    if (edge === 'center') patches[e.id] = { x: Math.round(bounds.x + (bounds.w - e.w) / 2) };
    if (edge === 'right') patches[e.id] = { x: bounds.x + bounds.w - e.w };
    if (edge === 'top') patches[e.id] = { y: bounds.y };
    if (edge === 'middle') patches[e.id] = { y: Math.round(bounds.y + (bounds.h - e.h) / 2) };
    if (edge === 'bottom') patches[e.id] = { y: bounds.y + bounds.h - e.h };
  }
  state.patchElements(artboard.id, patches);
}

export function reorderSelection(change: OrderChange): void {
  const state = editor();
  const artboard = selectedArtboard(state);
  if (!artboard) return;
  const ids = artboard.elements.filter((e) => state.selection.elementIds.includes(e.id)).map((e) => e.id);
  const ordered = change === 'front' || change === 'forward' ? [...ids].reverse() : ids;
  state.change((d) => {
    const target = d.artboards.find((a) => a.id === artboard.id)!;
    for (const id of ordered) reorderElement(target, id, change);
  });
}

/** Adds an artboard (optionally from a layout with placeholder content) after the selected one. */
export function addArtboard(options: { preset?: string; layout?: LayoutName; copyOf?: string } = {}): void {
  const state = editor();
  const design = state.design;
  if (!design) return;
  const index = design.artboards.findIndex((a) => a.id === state.selection.artboardId);
  const at = index >= 0 ? index + 1 : design.artboards.length;
  let artboard: Artboard;
  if (options.copyOf) {
    const source = design.artboards.find((a) => a.id === options.copyOf);
    if (!source) return;
    artboard = duplicateArtboard(design, source);
  } else {
    const current = design.artboards[index];
    const preset = options.preset ? ARTBOARD_PRESETS[options.preset] : undefined;
    const size = preset ?? (current ? { width: current.width, height: current.height } : ARTBOARD_PRESETS[FORMAT_DEFAULTS[design.format]?.preset ?? 'slide']);
    artboard = { id: newArtboardId(design.artboards.map((a) => a.id)), name: `${FORMAT_DEFAULTS[design.format]?.label ?? 'Artboard'} ${design.artboards.length + 1}`, width: size.width, height: size.height, background: 'background', elements: [] };
    if (options.layout) {
      const built = buildLayout(options.layout, PLACEHOLDER_CONTENT, size, design.theme, elementIds(design));
      artboard.elements = built.elements;
      if (built.background) artboard.background = built.background;
    }
  }
  state.change((d) => d.artboards.splice(at, 0, artboard));
  editor().select({ artboardId: artboard.id, elementIds: [] });
}

const PLACEHOLDER_CONTENT = {
  kicker: 'Label',
  title: 'Headline',
  subtitle: 'A supporting line that explains the headline',
  body: 'Write a short paragraph here. Double-click any text to edit it.',
  bullets: ['First point', 'Second point', 'Third point'],
  quote: 'A memorable quote that captures the idea.',
  author: 'Name, Role',
  stats: [{ value: '42%', label: 'Growth' }, { value: '3.2K', label: 'Customers' }, { value: '4.8', label: 'Rating' }],
  items: [{ title: 'Feature one', body: 'A short description.' }, { title: 'Feature two', body: 'A short description.' }, { title: 'Feature three', body: 'A short description.' }],
  columns: [{ title: 'Before', bullets: ['Slow', 'Manual'] }, { title: 'After', bullets: ['Fast', 'Automatic'] }],
  chart: { kind: 'bar', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Revenue', values: [12, 18, 24, 31] }] },
  cta: 'Get started',
  footer: 'cellar.local',
};

export function deleteArtboard(id: string): void {
  const state = editor();
  if (!state.design) return;
  const index = state.design.artboards.findIndex((a) => a.id === id);
  state.change((d) => {
    d.artboards = d.artboards.filter((a) => a.id !== id);
  });
  const next = editor().design?.artboards[Math.max(0, index - 1)];
  editor().select({ artboardId: next?.id ?? null, elementIds: [] });
}

export function moveArtboard(id: string, direction: -1 | 1): void {
  editor().change((d) => {
    const index = d.artboards.findIndex((a) => a.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= d.artboards.length) return;
    const [board] = d.artboards.splice(index, 1);
    d.artboards.splice(target, 0, board);
  });
}

function naturalSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
    img.onerror = () => resolve({ width: 800, height: 600 });
    img.src = url;
  });
}

/** Places an attached image on an artboard, fitted within 60% of it, centered on `at` when given. */
export async function placeImage(artboardId: string, attachment: AttachmentRef, at?: { x: number; y: number }): Promise<void> {
  const design = editor().design;
  const artboard = design?.artboards.find((a) => a.id === artboardId);
  if (!artboard) return;
  const size = await naturalSize(attachmentImageUrl(attachment.id));
  const scale = Math.min(1, (artboard.width * 0.6) / size.width, (artboard.height * 0.6) / size.height);
  const w = Math.round(size.width * scale);
  const h = Math.round(size.height * scale);
  const center = at ?? { x: artboard.width / 2, y: artboard.height / 2 };
  addElement(artboardId, { type: 'image', src: `attachment:${attachment.id}`, x: Math.round(center.x - w / 2), y: Math.round(center.y - h / 2), w, h, alt: attachment.name, name: attachment.name });
}

export async function imagesFromFiles(files: File[]): Promise<AttachmentRef[]> {
  const refs: AttachmentRef[] = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const path = window.cellar.getPathForFile(file);
      if (path) refs.push(...(await invoke('attachments:fromPaths', [path])).filter((r) => r.kind === 'image'));
      else refs.push(await invoke('attachments:fromBytes', file.name || `pasted-${Date.now()}.png`, file.type, new Uint8Array(await file.arrayBuffer())));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }
  return refs;
}

export function designTitle(design: Pick<Design, 'title'>): string {
  return design.title || 'Untitled design';
}
