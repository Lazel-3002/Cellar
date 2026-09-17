import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { LayoutTemplate, Plus } from 'lucide-react';
import { layoutsFor, LAYOUTS } from '@shared/design/layouts';
import { textStyle } from '@shared/design/render';
import { estimateTextHeight } from '@shared/design/text';
import { ARTBOARD_PRESETS, fontName } from '@shared/design/theme';
import type { Artboard, Design, DesignElement, LineElement, TextElement } from '@shared/types/design';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuTrigger } from '@/components/ui/menu';
import { cn } from '@/lib/utils';
import { artboardOffsets, useDesignEditor } from '@/stores/design';
import { ArtboardView } from './ArtboardView';
import { addArtboard, addElement, expandToGroups, imagesFromFiles, isWholeGroup, placeImage } from './actions';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end' | 'rotate';

type Drag =
  | { kind: 'pan'; x: number; y: number; panX: number; panY: number }
  | { kind: 'move'; artboardId: string; start: Point; origin: Map<string, Point>; moved: boolean }
  | { kind: 'resize'; artboardId: string; id: string; handle: Handle; start: Point; box: Box; moved: boolean }
  | { kind: 'resize-group'; artboardId: string; handle: Handle; start: Point; box: Box; origin: Map<string, Box>; moved: boolean }
  | { kind: 'rotate'; artboardId: string; center: Point; startAngle: number; origin: Map<string, { x: number; y: number; cx: number; cy: number; rotation: number }>; moved: boolean }
  | { kind: 'marquee'; artboardId: string; start: Point; additive: string[] }
  | { kind: 'create'; artboardId: string; type: 'rect' | 'ellipse' | 'line'; start: Point; id: string | null };

interface Point {
  x: number;
  y: number;
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Guide {
  axis: 'x' | 'y';
  /** World coordinate of the line. */
  at: number;
  from: number;
  to: number;
}

const HANDLES: Array<{ id: Handle; cx: number; cy: number; cursor: string }> = [
  { id: 'nw', cx: 0, cy: 0, cursor: 'nwse-resize' },
  { id: 'n', cx: 0.5, cy: 0, cursor: 'ns-resize' },
  { id: 'ne', cx: 1, cy: 0, cursor: 'nesw-resize' },
  { id: 'e', cx: 1, cy: 0.5, cursor: 'ew-resize' },
  { id: 'se', cx: 1, cy: 1, cursor: 'nwse-resize' },
  { id: 's', cx: 0.5, cy: 1, cursor: 'ns-resize' },
  { id: 'sw', cx: 0, cy: 1, cursor: 'nesw-resize' },
  { id: 'w', cx: 0, cy: 0.5, cursor: 'ew-resize' },
];

const isEditable = (el: Element | null) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);

/** An element's axis-aligned box in its own local coordinates (lines use their bounding box). */
function elementBox(el: DesignElement): Box {
  return el.type === 'line' ? { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.max(1, Math.abs(el.w)), h: Math.max(1, Math.abs(el.h)) } : { x: el.x, y: el.y, w: el.w, h: el.h };
}

function unionBox(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** Keeps a rotation delta from drifting past a full turn. */
function wrapAngle(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}


/** Fits all artboards (or one) into the visible canvas. */
export function fitView(container: HTMLElement | null, design: Design | null, artboardId?: string): void {
  if (!container || !design || design.artboards.length === 0) return;
  const offsets = artboardOffsets(design);
  const boards = artboardId ? design.artboards.filter((a) => a.id === artboardId) : design.artboards;
  if (boards.length === 0) return;
  const left = Math.min(...boards.map((a) => offsets.get(a.id)!));
  const right = Math.max(...boards.map((a) => offsets.get(a.id)! + a.width));
  const height = Math.max(...boards.map((a) => a.height));
  const rect = container.getBoundingClientRect();
  const zoom = Math.min(1, (rect.width - 96) / (right - left), (rect.height - 120) / height);
  useDesignEditor.getState().setView({ zoom, panX: (rect.width - (right - left) * zoom) / 2 - left * zoom, panY: Math.max(56, (rect.height - height * zoom) / 2) });
}

export function DesignCanvas({ containerRef, running }: { containerRef: React.RefObject<HTMLDivElement | null>; running: boolean }) {
  const design = useDesignEditor((s) => s.design)!;
  const selection = useDesignEditor((s) => s.selection);
  const zoom = useDesignEditor((s) => s.zoom);
  const panX = useDesignEditor((s) => s.panX);
  const panY = useDesignEditor((s) => s.panY);
  const tool = useDesignEditor((s) => s.tool);
  const editingTextId = useDesignEditor((s) => s.editingTextId);
  const offsets = useMemo(() => artboardOffsets(design), [design]);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [space, setSpace] = useState(false);
  const [dropping, setDropping] = useState(false);
  const store = useDesignEditor.getState;

  // Space bar held: drag to pan.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditable(document.activeElement)) {
        if (!e.repeat) setSpace(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Wheel pans; Ctrl+wheel (and pinch) zooms around the pointer.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = store();
      const rect = node.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const lx = e.clientX - rect.left;
        const ly = e.clientY - rect.top;
        const next = Math.min(8, Math.max(0.02, s.zoom * Math.exp(-e.deltaY * 0.0022)));
        s.setView({ zoom: next, panX: lx - ((lx - s.panX) * next) / s.zoom, panY: ly - ((ly - s.panY) * next) / s.zoom });
      } else {
        s.setView({ panX: s.panX - (e.shiftKey ? e.deltaY : e.deltaX), panY: s.panY - (e.shiftKey ? 0 : e.deltaY) });
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [containerRef, store]);

  const toWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = containerRef.current!.getBoundingClientRect();
      const s = store();
      return { x: (clientX - rect.left - s.panX) / s.zoom, y: (clientY - rect.top - s.panY) / s.zoom };
    },
    [containerRef, store],
  );

  const artboardAt = (p: Point): Artboard | undefined => design.artboards.find((a) => p.x >= offsets.get(a.id)! && p.x <= offsets.get(a.id)! + a.width && p.y >= 0 && p.y <= a.height);
  const local = (artboard: Artboard, p: Point): Point => ({ x: p.x - offsets.get(artboard.id)!, y: p.y });

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-canvas-ui]')) return;
    const s = store();
    if (s.editingTextId && !target.closest('textarea')) s.setEditingText(null);
    const world = toWorld(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (e.button === 1 || tool === 'hand' || space) {
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, panX: s.panX, panY: s.panY };
      return;
    }
    const handle = target.closest<HTMLElement>('[data-handle]');
    if (handle && s.selection.artboardId && s.selection.elementIds.length >= 1) {
      const artboard = design.artboards.find((a) => a.id === s.selection.artboardId)!;
      const els = artboard.elements.filter((x) => s.selection.elementIds.includes(x.id));
      const handleId = handle.dataset.handle as Handle;
      if (handleId === 'rotate' && els.length && !els.some((el) => el.locked)) {
        const box = unionBox(els.map(elementBox));
        const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
        const worldCenter = { x: offsets.get(artboard.id)! + center.x, y: center.y };
        s.checkpoint();
        drag.current = {
          kind: 'rotate',
          artboardId: artboard.id,
          center,
          startAngle: Math.atan2(world.y - worldCenter.y, world.x - worldCenter.x),
          origin: new Map(
            els.map((el) => {
              const b = elementBox(el);
              return [el.id, { x: el.x, y: el.y, cx: b.x + b.w / 2, cy: b.y + b.h / 2, rotation: el.rotation ?? 0 }];
            }),
          ),
          moved: false,
        };
        return;
      }
      if (handleId !== 'rotate' && els.length === 1) {
        const el = els[0];
        s.checkpoint();
        drag.current = { kind: 'resize', artboardId: artboard.id, id: el.id, handle: handleId, start: local(artboard, world), box: { x: el.x, y: el.y, w: el.w, h: el.h }, moved: false };
        return;
      }
      if (handleId !== 'rotate' && els.length > 1 && !els.some((el) => el.locked)) {
        s.checkpoint();
        drag.current = {
          kind: 'resize-group',
          artboardId: artboard.id,
          handle: handleId,
          start: local(artboard, world),
          box: unionBox(els.map(elementBox)),
          origin: new Map(els.map((el) => [el.id, elementBox(el)])),
          moved: false,
        };
        return;
      }
    }
    const artboard = artboardAt(world);
    if (!artboard) {
      s.select({ elementIds: [] });
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, panX: s.panX, panY: s.panY };
      return;
    }
    const p = local(artboard, world);
    if (tool === 'text') {
      const size = Math.max(14, Math.round(Math.sqrt(artboard.width * artboard.height) * 0.03));
      addElement(artboard.id, { type: 'text', text: 'Text', x: Math.round(p.x), y: Math.round(p.y - size * 0.6), w: Math.round(size * 8), size }, { edit: true });
      s.setTool('select');
      return;
    }
    if (tool === 'rect' || tool === 'ellipse' || tool === 'line') {
      drag.current = { kind: 'create', artboardId: artboard.id, type: tool, start: p, id: null };
      return;
    }
    const hit = target.closest<HTMLElement>('[data-element-id]');
    const hitId = hit?.closest(`[data-artboard-id="${artboard.id}"]`) ? hit.dataset.elementId! : null;
    if (hitId) {
      const sameBoard = s.selection.artboardId === artboard.id;
      let ids = sameBoard ? s.selection.elementIds : [];
      const clickIds = expandToGroups(artboard, [hitId]);
      const alreadySelected = clickIds.every((id) => ids.includes(id));
      if (e.shiftKey || e.ctrlKey) ids = alreadySelected ? ids.filter((id) => !clickIds.includes(id)) : [...new Set([...ids, ...clickIds])];
      else if (!alreadySelected) ids = clickIds;
      s.select({ artboardId: artboard.id, elementIds: ids });
      const movable = artboard.elements.filter((x) => ids.includes(x.id) && !x.locked);
      if (movable.length && ids.includes(hitId)) drag.current = { kind: 'move', artboardId: artboard.id, start: p, origin: new Map(movable.map((x) => [x.id, { x: x.x, y: x.y }])), moved: false };
      return;
    }
    const keep = (e.shiftKey || e.ctrlKey) && s.selection.artboardId === artboard.id ? s.selection.elementIds : [];
    s.select({ artboardId: artboard.id, elementIds: keep });
    drag.current = { kind: 'marquee', artboardId: artboard.id, start: p, additive: keep };
  };

  const snap = (artboard: Artboard, box: Box, exclude: Set<string>, threshold: number): { dx: number; dy: number; guides: Guide[] } => {
    const off = offsets.get(artboard.id)!;
    const xs = [0, artboard.width / 2, artboard.width];
    const ys = [0, artboard.height / 2, artboard.height];
    for (const el of artboard.elements) {
      if (exclude.has(el.id) || el.hidden || el.type === 'line') continue;
      xs.push(el.x, el.x + el.w / 2, el.x + el.w);
      ys.push(el.y, el.y + el.h / 2, el.y + el.h);
    }
    let bestX: { d: number; at: number } | null = null;
    for (const edge of [box.x, box.x + box.w / 2, box.x + box.w]) for (const c of xs) if (Math.abs(c - edge) <= threshold && (!bestX || Math.abs(c - edge) < Math.abs(bestX.d))) bestX = { d: c - edge, at: c };
    let bestY: { d: number; at: number } | null = null;
    for (const edge of [box.y, box.y + box.h / 2, box.y + box.h]) for (const c of ys) if (Math.abs(c - edge) <= threshold && (!bestY || Math.abs(c - edge) < Math.abs(bestY.d))) bestY = { d: c - edge, at: c };
    const out: Guide[] = [];
    if (bestX) out.push({ axis: 'x', at: off + bestX.at, from: 0, to: artboard.height });
    if (bestY) out.push({ axis: 'y', at: bestY.at, from: off, to: off + artboard.width });
    return { dx: bestX?.d ?? 0, dy: bestY?.d ?? 0, guides: out };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) {
      const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-element-id]');
      setHover(hit && !(e.target as HTMLElement).closest('[data-canvas-ui]') ? hit.dataset.elementId! : null);
      return;
    }
    const s = store();
    if (d.kind === 'pan') {
      s.setView({ panX: d.panX + e.clientX - d.x, panY: d.panY + e.clientY - d.y });
      return;
    }
    const artboard = design.artboards.find((a) => a.id === d.artboardId);
    if (!artboard) return;
    const p = local(artboard, toWorld(e.clientX, e.clientY));
    const threshold = 6 / s.zoom;

    if (d.kind === 'move') {
      let dx = p.x - d.start.x;
      let dy = p.y - d.start.y;
      if (!d.moved) {
        if (Math.hypot(dx, dy) * s.zoom < 3) return;
        d.moved = true;
        s.checkpoint();
      }
      if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      const items = artboard.elements.filter((x) => d.origin.has(x.id));
      const left = Math.min(...items.map((x) => d.origin.get(x.id)!.x));
      const top = Math.min(...items.map((x) => d.origin.get(x.id)!.y));
      const right = Math.max(...items.map((x) => d.origin.get(x.id)!.x + x.w));
      const bottom = Math.max(...items.map((x) => d.origin.get(x.id)!.y + x.h));
      const snapped = e.altKey ? { dx: 0, dy: 0, guides: [] } : snap(artboard, { x: left + dx, y: top + dy, w: right - left, h: bottom - top }, new Set(d.origin.keys()), threshold);
      setGuides(snapped.guides);
      const patches: Record<string, Partial<DesignElement>> = {};
      for (const [id, origin] of d.origin) patches[id] = { x: Math.round(origin.x + dx + snapped.dx), y: Math.round(origin.y + dy + snapped.dy) };
      s.patchElements(artboard.id, patches, { history: false });
      return;
    }

    if (d.kind === 'resize') {
      const el = artboard.elements.find((x) => x.id === d.id);
      if (!el) return;
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      d.moved = true;
      if (d.handle === 'start' || d.handle === 'end') {
        const line = d.box;
        let patch: Partial<LineElement> = d.handle === 'start' ? { x: Math.round(line.x + dx), y: Math.round(line.y + dy), w: Math.round(line.w - dx), h: Math.round(line.h - dy) } : { w: Math.round(line.w + dx), h: Math.round(line.h + dy) };
        if (e.shiftKey) {
          const w = patch.w ?? line.w;
          const h = patch.h ?? line.h;
          const angle = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(w, h);
          const nw = Math.round(Math.cos(angle) * len);
          const nh = Math.round(Math.sin(angle) * len);
          patch = d.handle === 'start' ? { x: line.x + line.w - nw, y: line.y + line.h - nh, w: nw, h: nh } : { w: nw, h: nh };
        }
        s.patchElements(artboard.id, { [el.id]: patch }, { history: false });
        return;
      }
      const b = d.box;
      let { x, y, w, h } = b;
      if (d.handle.includes('e')) w = b.w + dx;
      if (d.handle.includes('w')) {
        w = b.w - dx;
        x = b.x + dx;
      }
      if (d.handle.includes('s')) h = b.h + dy;
      if (d.handle.includes('n')) {
        h = b.h - dy;
        y = b.y + dy;
      }
      const keepRatio = e.shiftKey || ((el.type === 'image' || el.type === 'svg') && d.handle.length === 2 && !e.altKey);
      if (keepRatio && d.handle.length === 2) {
        const ratio = b.w / Math.max(1, b.h);
        if (Math.abs(w - b.w) / b.w > Math.abs(h - b.h) / b.h) h = w / ratio;
        else w = h * ratio;
        if (d.handle.includes('w')) x = b.x + b.w - w;
        if (d.handle.includes('n')) y = b.y + b.h - h;
      }
      const min = 4;
      if (w < min) {
        if (d.handle.includes('w')) x -= min - w;
        w = min;
      }
      if (h < min) {
        if (d.handle.includes('n')) y -= min - h;
        h = min;
      }
      s.patchElements(artboard.id, { [el.id]: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) } }, { history: false });
      return;
    }

    if (d.kind === 'resize-group') {
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      d.moved = true;
      const b = d.box;
      let { x, y, w, h } = b;
      if (d.handle.includes('e')) w = b.w + dx;
      if (d.handle.includes('w')) {
        w = b.w - dx;
        x = b.x + dx;
      }
      if (d.handle.includes('s')) h = b.h + dy;
      if (d.handle.includes('n')) {
        h = b.h - dy;
        y = b.y + dy;
      }
      const min = 4;
      if (w < min) {
        if (d.handle.includes('w')) x -= min - w;
        w = min;
      }
      if (h < min) {
        if (d.handle.includes('n')) y -= min - h;
        h = min;
      }
      const sx = w / Math.max(1, b.w);
      const sy = h / Math.max(1, b.h);
      const patches: Record<string, Partial<DesignElement>> = {};
      for (const [id, origin] of d.origin) patches[id] = { x: Math.round(x + (origin.x - b.x) * sx), y: Math.round(y + (origin.y - b.y) * sy), w: Math.round(origin.w * sx), h: Math.round(origin.h * sy) };
      s.patchElements(artboard.id, patches, { history: false });
      return;
    }

    if (d.kind === 'rotate') {
      const world = toWorld(e.clientX, e.clientY);
      const worldCenter = { x: offsets.get(artboard.id)! + d.center.x, y: d.center.y };
      const angle = Math.atan2(world.y - worldCenter.y, world.x - worldCenter.x);
      let deltaDeg = ((angle - d.startAngle) * 180) / Math.PI;
      if (e.shiftKey) deltaDeg = Math.round(deltaDeg / 15) * 15;
      d.moved = true;
      const rad = (deltaDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const patches: Record<string, Partial<DesignElement>> = {};
      for (const [id, o] of d.origin) {
        const relX = o.cx - d.center.x;
        const relY = o.cy - d.center.y;
        const newCx = d.center.x + relX * cos - relY * sin;
        const newCy = d.center.y + relX * sin + relY * cos;
        patches[id] = { x: Math.round(o.x + (newCx - o.cx)), y: Math.round(o.y + (newCy - o.cy)), rotation: wrapAngle(o.rotation + deltaDeg) || undefined };
      }
      s.patchElements(artboard.id, patches, { history: false });
      return;
    }

    if (d.kind === 'marquee') {
      const box = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
      setMarquee(box);
      const hits = artboard.elements.filter((x) => !x.hidden && x.x < box.x + box.w && x.x + x.w > box.x && x.y < box.y + box.h && x.y + x.h > box.y).map((x) => x.id);
      s.select({ artboardId: artboard.id, elementIds: [...new Set([...d.additive, ...expandToGroups(artboard, hits)])] });
      return;
    }

    if (d.kind === 'create') {
      const box = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
      if (box.w * s.zoom < 3 && box.h * s.zoom < 3) return;
      if (!d.id) {
        const created = addElement(artboard.id, d.type === 'line' ? { type: 'line', x: d.start.x, y: d.start.y, w: 1, h: 0 } : { type: d.type, ...box, w: Math.max(1, box.w), h: Math.max(1, box.h) });
        d.id = created?.id ?? null;
        return;
      }
      const patch = d.type === 'line' ? { w: Math.round(p.x - d.start.x), h: Math.round((e.shiftKey ? 0 : p.y - d.start.y)) } : { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(Math.max(1, e.shiftKey ? Math.max(box.w, box.h) : box.w)), h: Math.round(Math.max(1, e.shiftKey ? Math.max(box.w, box.h) : box.h)) };
      s.patchElements(artboard.id, { [d.id]: patch }, { history: false });
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    setGuides([]);
    setMarquee(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d) return;
    const s = store();
    if ((d.kind === 'resize' || d.kind === 'resize-group' || d.kind === 'rotate') && !d.moved) s.undo();
    if (d.kind === 'create') {
      if (!d.id) {
        const artboard = design.artboards.find((a) => a.id === d.artboardId);
        if (artboard) {
          const size = Math.round(Math.min(artboard.width, artboard.height) * 0.2);
          addElement(artboard.id, d.type === 'line' ? { type: 'line', x: d.start.x, y: d.start.y, w: size * 2, h: 0 } : { type: d.type, x: Math.round(d.start.x - size / 2), y: Math.round(d.start.y - size / 2), w: size, h: size });
        }
      }
      s.setTool('select');
    }
    if (d.kind === 'resize' && d.moved) {
      // A resized text box grows to fit its text.
      const artboard = design.artboards.find((a) => a.id === d.artboardId);
      const el = store().design?.artboards.find((a) => a.id === d.artboardId)?.elements.find((x) => x.id === d.id);
      if (artboard && el?.type === 'text' && (d.handle === 'e' || d.handle === 'w')) {
        const needed = estimateTextHeight(el, fontName(el.font, store().design!.theme));
        if (needed > el.h) s.patchElements(artboard.id, { [el.id]: { h: needed } }, { history: false });
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Pointer capture retargets clicks to the canvas, so look up what is under the pointer.
    const under = document.elementsFromPoint(e.clientX, e.clientY) as HTMLElement[];
    const label = under.map((el) => el.closest<HTMLElement>('[data-artboard-label]')).find(Boolean);
    if (label) {
      fitView(containerRef.current, design, label.dataset.artboardLabel);
      return;
    }
    const hit = under.map((el) => el.closest<HTMLElement>('[data-element-id]')).find(Boolean);
    if (hit?.dataset.elementType === 'text') {
      const artboardId = hit.closest<HTMLElement>('[data-artboard-id]')?.dataset.artboardId;
      const el = design.artboards.find((a) => a.id === artboardId)?.elements.find((x) => x.id === hit.dataset.elementId);
      if (artboardId && el && !el.locked) {
        store().select({ artboardId, elementIds: [el.id] });
        store().setEditingText(el.id);
      }
    }
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropping(false);
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    const world = toWorld(e.clientX, e.clientY);
    const artboard = artboardAt(world) ?? design.artboards.find((a) => a.id === selection.artboardId) ?? design.artboards[0];
    if (!artboard) return;
    const at = artboardAt(world) ? local(artboard, world) : undefined;
    for (const ref of await imagesFromFiles(files)) await placeImage(artboard.id, ref, at);
  };

  const selectedBoard = design.artboards.find((a) => a.id === selection.artboardId);
  const selected = selectedBoard?.elements.filter((el) => selection.elementIds.includes(el.id)) ?? [];
  const groupSelected = selectedBoard && isWholeGroup(selectedBoard, selection.elementIds) ? selected : null;
  const hovered = hover && !selection.elementIds.includes(hover) ? design.artboards.flatMap((a) => a.elements.map((el) => ({ a, el }))).find((x) => x.el.id === hover) : undefined;
  const last = design.artboards[design.artboards.length - 1];
  const addX = last ? offsets.get(last.id)! + last.width + 60 : 0;
  const screen = (artboardId: string, box: Box) => ({ left: panX + (offsets.get(artboardId)! + box.x) * zoom, top: panY + box.y * zoom, width: box.w * zoom, height: box.h * zoom });
  const cursor = space || tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';

  return (
    <div
      ref={containerRef}
      data-testid="design-canvas"
      className={cn('relative h-full w-full touch-none overflow-hidden bg-[var(--canvas-bg)] select-none', dropping && 'ring-2 ring-brand/60 ring-inset')}
      style={{ cursor, '--canvas-bg': 'color-mix(in srgb, var(--sidebar) 70%, var(--background))' } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={onDoubleClick}
      onDragOver={(e) => {
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => void onDrop(e)}
    >
      <div className="absolute top-0 left-0" style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        {design.artboards.map((artboard) => (
          <div key={artboard.id} className="absolute top-0" style={{ left: offsets.get(artboard.id), width: artboard.width, height: artboard.height, boxShadow: `0 ${2 / zoom}px ${18 / zoom}px rgba(0,0,0,0.22)` }}>
            <ArtboardView artboard={artboard} theme={design.theme} flagOverflow editingId={editingTextId} />
            {editingTextId && artboard.elements.some((el) => el.id === editingTextId) && <TextEditor artboard={artboard} element={artboard.elements.find((el) => el.id === editingTextId) as TextElement} />}
          </div>
        ))}
      </div>

      {/* Labels, selection and guides are drawn in screen space so they stay crisp at any zoom. */}
      {design.artboards.map((artboard) => {
        const left = panX + offsets.get(artboard.id)! * zoom;
        const active = artboard.id === selection.artboardId;
        return (
          <div
            key={artboard.id}
            data-artboard-label={artboard.id}
            data-testid="artboard-label"
            onPointerDown={(e) => {
              e.stopPropagation();
              store().select({ artboardId: artboard.id, elementIds: [] });
            }}
            className={cn('absolute flex max-w-full cursor-default items-center gap-2 truncate text-[12px] whitespace-nowrap', active ? 'text-brand' : 'text-muted-foreground hover:text-foreground')}
            style={{ left, top: panY - 22, maxWidth: Math.max(80, artboard.width * zoom) }}
            title="Double-click to zoom to this artboard"
          >
            <span className="truncate font-medium">{artboard.name}</span>
            <span className="shrink-0 opacity-70">
              {artboard.width}×{artboard.height}
            </span>
          </div>
        );
      })}
      {selectedBoard && selection.elementIds.length === 0 && (
        <div className="pointer-events-none absolute border-2 border-brand/70" style={{ ...screen(selectedBoard.id, { x: 0, y: 0, w: selectedBoard.width, h: selectedBoard.height }) }} />
      )}
      {hovered && (
        <div className="pointer-events-none absolute border border-brand/60" style={{ ...boxFor(hovered.el, (b) => screen(hovered.a.id, b)), transform: hovered.el.rotation ? `rotate(${hovered.el.rotation}deg)` : undefined }} />
      )}
      {selectedBoard &&
        selected.map((el) => (
          <div
            key={el.id}
            data-testid="selection-box"
            className={cn('pointer-events-none absolute border', selected.length > 1 ? 'border-brand/80 border-dashed' : 'border-brand', el.locked && 'border-warning')}
            style={{ ...boxFor(el, (b) => screen(selectedBoard.id, b)), transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}
          />
        ))}
      {selectedBoard && selected.length === 1 && !editingTextId && !selected[0].locked && <Handles el={selected[0]} box={screen(selectedBoard.id, selected[0])} />}
      {selectedBoard && groupSelected && !editingTextId && !groupSelected.some((el) => el.locked) && <GroupHandles box={screen(selectedBoard.id, unionBox(groupSelected.map(elementBox)))} />}
      {guides.map((g, i) =>
        g.axis === 'x' ? (
          <div key={i} className="pointer-events-none absolute w-px bg-[#ff3b8b]" style={{ left: panX + g.at * zoom, top: panY + g.from * zoom, height: (g.to - g.from) * zoom }} />
        ) : (
          <div key={i} className="pointer-events-none absolute h-px bg-[#ff3b8b]" style={{ top: panY + g.at * zoom, left: panX + g.from * zoom, width: (g.to - g.from) * zoom }} />
        ),
      )}
      {marquee && selectedBoard && <div className="pointer-events-none absolute border border-brand bg-brand/10" style={screen(selectedBoard.id, marquee)} />}

      {design.artboards.length > 0 && <AddArtboardButton left={panX + addX * zoom} top={panY + Math.min(last.height * zoom, 240) / 2 - 20} format={design.format} />}
      {design.artboards.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center" data-canvas-ui>
          <div className="max-w-sm text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-selected text-fg-2">
              <LayoutTemplate className="size-5" />
            </div>
            <div className="mt-3 text-[15px] font-medium text-foreground">{running ? 'The model is setting up the canvas…' : 'An empty canvas'}</div>
            <div className="mt-1 text-[13px] text-muted-foreground">{running ? 'Artboards appear here as they are created.' : 'Describe what you want in the chat, or add an artboard to start by hand.'}</div>
            {!running && (
              <div className="mt-3 flex justify-center">
                <AddArtboardButton format={design.format} inline />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function boxFor(el: DesignElement, toScreen: (box: Box) => { left: number; top: number; width: number; height: number }) {
  const box = el.type === 'line' ? { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.max(1, Math.abs(el.w)), h: Math.max(1, Math.abs(el.h)) } : el;
  return toScreen(box);
}

function Handles({ el, box }: { el: DesignElement; box: { left: number; top: number; width: number; height: number } }) {
  const zoom = useDesignEditor((s) => s.zoom);
  const size = 8;
  if (el.type === 'line') {
    const ends: Array<{ id: Handle; x: number; y: number }> = [
      { id: 'start', x: 0, y: 0 },
      { id: 'end', x: el.w, y: el.h },
    ];
    const originLeft = box.left - Math.min(0, el.w) * zoom;
    const originTop = box.top - Math.min(0, el.h) * zoom;
    return (
      <>
        {ends.map((end) => (
          <div key={end.id} data-handle={end.id} className="absolute rounded-full border-2 border-brand bg-white" style={{ width: size + 2, height: size + 2, left: originLeft + end.x * zoom - (size + 2) / 2, top: originTop + end.y * zoom - (size + 2) / 2, cursor: 'move' }} />
        ))}
      </>
    );
  }
  const small = box.width < 24 || box.height < 24;
  return (
    <div className="pointer-events-none absolute" style={{ ...box, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}>
      {HANDLES.filter((h) => !small || h.id.length === 2).map((h) => (
        <div
          key={h.id}
          data-handle={h.id}
          data-testid={`handle-${h.id}`}
          className="pointer-events-auto absolute rounded-[2px] border border-brand bg-white"
          style={{ width: size, height: size, left: h.cx * box.width - size / 2, top: h.cy * box.height - size / 2, cursor: h.cursor }}
        />
      ))}
      <RotateHandle width={box.width} />
    </div>
  );
}

/** A stem and grip above a selection's box, for click-drag rotation; sits inside the (possibly rotated) box so it turns with it. */
function RotateHandle({ width }: { width: number }) {
  return (
    <>
      <div className="pointer-events-none absolute w-px bg-brand/60" style={{ left: width / 2, top: -22, height: 14 }} />
      <div data-handle="rotate" data-testid="handle-rotate" className="pointer-events-auto absolute size-3 cursor-grab rounded-full border-2 border-brand bg-white" style={{ left: width / 2 - 6, top: -28 }} />
    </>
  );
}

/** Resize handles and a rotate grip around a group's bounding box (axis-aligned; members may each have their own rotation). */
function GroupHandles({ box }: { box: { left: number; top: number; width: number; height: number } }) {
  const size = 8;
  return (
    <div className="pointer-events-none absolute" style={box}>
      {HANDLES.map((h) => (
        <div
          key={h.id}
          data-handle={h.id}
          data-testid={`handle-${h.id}`}
          className="pointer-events-auto absolute rounded-[2px] border border-brand bg-white"
          style={{ width: size, height: size, left: h.cx * box.width - size / 2, top: h.cy * box.height - size / 2, cursor: h.cursor }}
        />
      ))}
      <RotateHandle width={box.width} />
    </div>
  );
}

function AddArtboardButton({ left, top, format, inline }: { left?: number; top?: number; format: string; inline?: boolean }) {
  return (
    <div data-canvas-ui className={inline ? '' : 'absolute'} style={inline ? undefined : { left, top }}>
      <Menu>
        <MenuTrigger asChild>
          <button data-testid="add-artboard" aria-label="Add artboard" className={cn('flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-composer-border bg-background/70 text-[13px] text-muted-foreground hover:border-brand/60 hover:text-foreground', inline ? 'h-9 px-3' : 'size-10')}>
            <Plus className="size-4" />
            {inline && 'Add artboard'}
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="w-64">
          <MenuItem onSelect={() => addArtboard()}>Blank artboard</MenuItem>
          <MenuSeparator />
          <MenuLabel>From a layout</MenuLabel>
          {layoutsFor(format)
            .filter((l) => l !== 'blank')
            .map((layout) => (
              <MenuItem key={layout} onSelect={() => addArtboard({ layout })}>
                <span className="flex flex-col py-0.5">
                  <span className="capitalize">{layout.replace('-', ' ')}</span>
                </span>
              </MenuItem>
            ))}
          <MenuSeparator />
          <MenuSub label="Other size">
            {Object.entries(ARTBOARD_PRESETS).map(([id, preset]) => (
              <MenuItem key={id} onSelect={() => addArtboard({ preset: id })}>
                {preset.label} <span className="ml-auto pl-3 text-[11.5px] text-muted-foreground">{preset.width}×{preset.height}</span>
              </MenuItem>
            ))}
          </MenuSub>
        </MenuContent>
      </Menu>
      <span className="sr-only">{Object.keys(LAYOUTS).length} layouts</span>
    </div>
  );
}

/** In-place text editing with the element's own typography. */
function TextEditor({ artboard, element }: { artboard: Artboard; element: TextElement }) {
  const theme = useDesignEditor((s) => s.design!.theme);
  const ref = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);
  const style = textStyle(element, theme) as unknown as CSSProperties;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = '0px';
    const needed = node.scrollHeight;
    node.style.height = `${Math.max(element.h, needed)}px`;
    if (needed > element.h + 1) useDesignEditor.getState().patchElements(artboard.id, { [element.id]: { h: needed } }, { history: false });
  }, [element.text, element.w, element.size, element.h, artboard.id, element.id]);

  return (
    <textarea
      ref={ref}
      data-testid="text-editor"
      value={element.text}
      spellCheck={false}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const s = useDesignEditor.getState();
        if (!started.current) {
          s.checkpoint();
          started.current = true;
        }
        s.patchElements(artboard.id, { [element.id]: { text: e.target.value } }, { history: false });
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          useDesignEditor.getState().setEditingText(null);
        }
      }}
      onBlur={() => useDesignEditor.getState().setEditingText(null)}
      style={{
        ...style,
        display: 'block',
        resize: 'none',
        overflow: 'hidden',
        border: 'none',
        outline: `${2 / useDesignEditor.getState().zoom}px solid var(--brand)`,
        background: style.background ?? 'transparent',
        margin: 0,
        zIndex: 5,
        cursor: 'text',
      }}
    />
  );
}
