import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Eraser, Minus, MousePointer2, Pencil, Plus, Square, Triangle, Circle, MoveUpRight, Trash } from 'lucide-react';
import { paperStyle, strokeGeometry } from '@shared/math/render';
import type { MathPaper, SketchBlock, SketchStroke, SketchTool } from '@shared/types/math';
import { IconButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PEN_COLORS, useMathEditor, useMathLayout } from '@/stores/math';
import { addStroke, clearSketch, eraseStroke, updateBlock } from './actions';

/** Strokes are stored in this width, so a sketch looks the same at any window size and in exports. */
const LOGICAL_WIDTH = 900;

const TOOLS: Array<{ value: SketchTool | 'eraser'; label: string; icon: typeof Pencil }> = [
  { value: 'pen', label: 'Pen', icon: Pencil },
  { value: 'line', label: 'Line', icon: Minus },
  { value: 'arrow', label: 'Arrow', icon: MoveUpRight },
  { value: 'rect', label: 'Rectangle', icon: Square },
  { value: 'ellipse', label: 'Circle', icon: Circle },
  { value: 'triangle', label: 'Triangle', icon: Triangle },
  { value: 'eraser', label: 'Eraser', icon: Eraser },
];

export function SketchToolbar({ block }: { block: SketchBlock }) {
  const { tool, setTool, color, setColor, penWidth, setPenWidth } = useMathLayout();
  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-1.5">
      <div className="flex items-center gap-0.5 rounded-lg bg-seg p-0.5">
        {TOOLS.map((item) => (
          <IconButton key={item.value} label={item.label} active={tool === item.value} onClick={() => setTool(item.value)} data-testid={`sketch-${item.value}`}>
            <item.icon className="size-[15px]" strokeWidth={1.8} />
          </IconButton>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {PEN_COLORS.map((swatch) => (
          <button
            key={swatch}
            aria-label={`Colour ${swatch}`}
            onClick={() => setColor(swatch)}
            className={cn('size-4 rounded-full border border-black/20 transition-transform', color === swatch && 'scale-125 ring-2 ring-brand/60')}
            style={{ background: swatch }}
          />
        ))}
      </div>
      <div className="flex items-center gap-0.5">
        <IconButton label="Thinner" onClick={() => setPenWidth(penWidth - 1)}>
          <Minus className="size-3.5" />
        </IconButton>
        <span className="w-6 text-center text-[11.5px] text-muted-foreground tabular-nums">{penWidth}</span>
        <IconButton label="Thicker" onClick={() => setPenWidth(penWidth + 1)}>
          <Plus className="size-3.5" />
        </IconButton>
      </div>
      <div className="flex-1" />
      <IconButton label="Taller" onClick={() => updateBlock(block.id, (b) => void (b.type === 'sketch' && (b.height = Math.min(1200, b.height + 120))))}>
        <MousePointer2 className="size-[15px] rotate-180" strokeWidth={1.8} />
      </IconButton>
      <IconButton label="Clear the whiteboard" onClick={() => clearSketch(block.id)}>
        <Trash className="size-[15px]" strokeWidth={1.8} />
      </IconButton>
    </div>
  );
}

function pathsOf(stroke: SketchStroke, index: number) {
  const { d, head } = strokeGeometry(stroke);
  if (!d) return null;
  const common = { stroke: stroke.color === 'currentColor' ? undefined : stroke.color, strokeWidth: stroke.width, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <g key={index} className={stroke.color === 'currentColor' ? 'stroke-current' : undefined}>
      <path d={d} {...common} />
      {head && <path d={head} {...common} />}
    </g>
  );
}

/** Distance from a point to a stroke, for the eraser. */
function distanceTo(stroke: SketchStroke, x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < stroke.points.length; i += 2) {
    best = Math.min(best, Math.hypot(stroke.points[i] - x, stroke.points[i + 1] - y));
  }
  return best;
}

export function SketchCanvas({ block, paper }: { block: SketchBlock; paper: MathPaper }) {
  const { tool, color, penWidth } = useMathLayout();
  const [draft, setDraft] = useState<SketchStroke | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const checkpoint = useMathEditor((s) => s.checkpoint);
  const style = paperStyle(block.paper ?? paper);
  const height = block.height;

  const toLocal = (event: ReactPointerEvent) => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    const scale = LOGICAL_WIDTH / rect.width;
    return { x: Math.round((event.clientX - rect.left) * scale * 10) / 10, y: Math.round((event.clientY - rect.top) * scale * 10) / 10 };
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const { x, y } = toLocal(event);
    if (tool === 'eraser') {
      const hit = [...block.strokes].reverse().findIndex((stroke) => distanceTo(stroke, x, y) < 12);
      if (hit >= 0) eraseStroke(block.id, block.strokes.length - 1 - hit);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft({ tool, color, width: penWidth, points: [x, y, x, y] });
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    const { x, y } = toLocal(event);
    setDraft((current) => {
      if (!current) return current;
      if (current.tool === 'pen') {
        const last = current.points.length;
        const dx = x - current.points[last - 2];
        const dy = y - current.points[last - 1];
        if (Math.hypot(dx, dy) < 2) return current;
        return { ...current, points: [...current.points, x, y] };
      }
      return { ...current, points: [current.points[0], current.points[1], x, y] };
    });
  };

  const finish = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const moved = Math.hypot(draft.points[draft.points.length - 2] - draft.points[0], draft.points[draft.points.length - 1] - draft.points[1]);
    setDraft(null);
    if (draft.tool !== 'pen' && moved < 6) return;
    checkpoint();
    addStroke(block.id, draft);
  };

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${LOGICAL_WIDTH} ${height}`}
      className={cn('block w-full touch-none rounded-lg border border-divider bg-card text-foreground', tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair')}
      style={{ height, backgroundImage: style.backgroundImage, backgroundSize: style.backgroundSize }}
      data-testid="sketch-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {block.strokes.map((stroke, index) => pathsOf(stroke, index))}
      {draft && pathsOf(draft, -1)}
    </svg>
  );
}
