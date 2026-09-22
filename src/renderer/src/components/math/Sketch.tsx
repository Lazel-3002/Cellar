import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Circle, Eraser, Highlighter, Minus, MousePointer2, MoveUpRight, Pencil, Plus, Square, Trash, Triangle, Type } from 'lucide-react';
import { dashArray } from '@shared/math/linestyle';
import { labelText } from '@shared/math/mathtext';
import { paperStyle, sketchFontSize, strokeGeometry, strokePaint } from '@shared/math/render';
import type { LineStyle, MathPaper, SketchBlock, SketchStroke } from '@shared/types/math';
import { IconButton } from '@/components/ui/button';
import { Tip } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { PEN_COLORS, useMathEditor, useMathLayout } from '@/stores/math';
import { addStroke, clearSketch, eraseStroke, updateBlock } from './actions';

/** Strokes are stored in this width, so a sketch looks the same at any window size and in exports. */
const LOGICAL_WIDTH = 900;

type Tool = ReturnType<typeof useMathLayout.getState>['tool'];

const TOOLS: Array<{ value: Tool; label: string; icon: typeof Pencil }> = [
  { value: 'pen', label: 'Pen', icon: Pencil },
  { value: 'highlighter', label: 'Highlighter (see-through marker)', icon: Highlighter },
  { value: 'line', label: 'Line', icon: Minus },
  { value: 'arrow', label: 'Arrow', icon: MoveUpRight },
  { value: 'rect', label: 'Rectangle', icon: Square },
  { value: 'ellipse', label: 'Circle', icon: Circle },
  { value: 'triangle', label: 'Triangle', icon: Triangle },
  { value: 'text', label: 'Text (α, β, x^2 …)', icon: Type },
  { value: 'eraser', label: 'Eraser', icon: Eraser },
];

const STYLES: Array<{ value: LineStyle; label: string }> = [
  { value: 'solid', label: 'Solid line' },
  { value: 'dashed', label: 'Dashed line' },
  { value: 'dotted', label: 'Dotted line' },
  { value: 'dashdot', label: 'Dash-dot line' },
  { value: 'zigzag', label: 'Zigzag (scribbled highlight)' },
  { value: 'wavy', label: 'Wavy line' },
];

const OPACITIES = [1, 0.75, 0.5, 0.3];

/** Symbols a keyboard does not have, one click away while writing. */
const SYMBOLS = ['α', 'β', 'θ', 'π', '°', '√', '²', '±', '≤', '≥', '≠', '∞'];

/** A small picture of a line style for its button. */
function StyleSample({ style }: { style: LineStyle }) {
  const d = style === 'zigzag' ? 'M2 8L4.5 5L7 11L9.5 5L12 11L14.5 5L17 11L19.5 5L22 8' : style === 'wavy' ? 'M2 8Q5 3 8 8T14 8T20 8' : 'M2 8H22';
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashArray(style, 1.2)} />
    </svg>
  );
}

export function SketchToolbar({ block }: { block: SketchBlock }) {
  const { tool, setTool, color, setColor, penWidth, setPenWidth, lineStyle, setLineStyle, penOpacity, setPenOpacity } = useMathLayout();
  const custom = !PEN_COLORS.includes(color);
  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-1.5" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-0.5 rounded-lg bg-seg p-0.5">
        {TOOLS.map((item) => (
          <IconButton key={item.value} label={item.label} active={tool === item.value} onClick={() => setTool(item.value)} data-testid={`sketch-${item.value}`}>
            <item.icon className="size-[15px]" strokeWidth={1.8} />
          </IconButton>
        ))}
      </div>
      <div className="flex items-center gap-0.5 rounded-lg bg-seg p-0.5">
        {STYLES.map((item) => (
          <IconButton key={item.value} label={item.label} active={lineStyle === item.value} onClick={() => setLineStyle(item.value)} data-testid={`sketch-line-${item.value}`}>
            <StyleSample style={item.value} />
          </IconButton>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {PEN_COLORS.map((swatch) => (
          <button
            key={swatch}
            aria-label={swatch === 'currentColor' ? 'Ink' : `Colour ${swatch}`}
            onClick={() => setColor(swatch)}
            className={cn('size-4 rounded-full border border-black/20 transition-transform', swatch === 'currentColor' && 'bg-foreground', color === swatch && 'scale-125 ring-2 ring-brand/60')}
            style={swatch === 'currentColor' ? undefined : { background: swatch }}
          />
        ))}
        <Tip label="Any colour">
          <label
            className={cn('relative size-4 cursor-pointer overflow-hidden rounded-full border border-black/20', custom && 'scale-125 ring-2 ring-brand/60')}
            style={{ background: custom ? color : 'conic-gradient(#d64545, #d9a13c, #3f9e63, #2a9d99, #3f7fd0, #9b59d0, #d64545)' }}
          >
            <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#141413'} onChange={(event) => setColor(event.target.value)} aria-label="Any colour" />
          </label>
        </Tip>
      </div>
      <div className="flex items-center gap-0.5">
        <IconButton label="Thinner" onClick={() => setPenWidth(penWidth - 1)}>
          <Minus className="size-3.5" />
        </IconButton>
        <span className="w-6 text-center text-[11.5px] text-muted-foreground tabular-nums">{penWidth}</span>
        <IconButton label="Thicker (bold)" onClick={() => setPenWidth(penWidth + 1)}>
          <Plus className="size-3.5" />
        </IconButton>
      </div>
      <div className="flex items-center gap-0.5 rounded-lg bg-seg p-0.5">
        {OPACITIES.map((value) => (
          <Tip key={value} label={value === 1 ? 'Opaque' : `See-through (${Math.round(value * 100)}%)`}>
            <button
              onClick={() => setPenOpacity(value)}
              data-testid={`sketch-opacity-${Math.round(value * 100)}`}
              className={cn('flex h-6 w-7 items-center justify-center rounded-md text-[10.5px] text-muted-foreground tabular-nums hover:bg-hover', Math.abs(penOpacity - value) < 0.01 && 'bg-selected text-foreground')}
            >
              <span className={cn('size-3 rounded-full', color === 'currentColor' && 'bg-foreground')} style={{ background: color === 'currentColor' ? undefined : color, opacity: value }} />
            </button>
          </Tip>
        ))}
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

function StrokeView({ stroke }: { stroke: SketchStroke }) {
  const themed = stroke.color === 'currentColor';
  const { dash, opacity } = strokePaint(stroke);
  if (stroke.tool === 'text') {
    if (!stroke.text) return null;
    return (
      <text
        x={stroke.points[0]}
        y={stroke.points[1]}
        fill={themed ? undefined : stroke.color}
        className={themed ? 'fill-current' : undefined}
        fontSize={sketchFontSize(stroke)}
        fontFamily="'Source Serif 4 Variable','Cambria Math',Georgia,serif"
        dominantBaseline="middle"
        opacity={opacity}
      >
        {labelText(stroke.text)}
      </text>
    );
  }
  const { d, head } = strokeGeometry(stroke);
  if (!d) return null;
  const common = { stroke: themed ? undefined : stroke.color, strokeWidth: stroke.width, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <g className={themed ? 'stroke-current' : undefined} opacity={opacity}>
      <path d={d} {...common} strokeDasharray={dash} />
      {head && <path d={head} {...common} />}
    </g>
  );
}

/** Distance from a point to a stroke, for the eraser. Text counts as its whole line of writing. */
function distanceTo(stroke: SketchStroke, x: number, y: number): number {
  if (stroke.tool === 'text') {
    const size = sketchFontSize(stroke);
    const width = labelText(stroke.text ?? '').length * size * 0.55;
    const dx = Math.max(stroke.points[0] - x, 0, x - (stroke.points[0] + width));
    const dy = Math.max(Math.abs(y - stroke.points[1]) - size / 2, 0);
    return Math.hypot(dx, dy);
  }
  let best = Infinity;
  for (let i = 0; i < stroke.points.length; i += 2) {
    best = Math.min(best, Math.hypot(stroke.points[i] - x, stroke.points[i + 1] - y));
  }
  return best;
}

interface TextDraft {
  x: number;
  y: number;
  /** Where the box sits on screen, in CSS pixels inside the canvas. */
  left: number;
  top: number;
  value: string;
}

export function SketchCanvas({ block, paper }: { block: SketchBlock; paper: MathPaper }) {
  const { tool, color, penWidth, lineStyle, penOpacity } = useMathLayout();
  const [draft, setDraft] = useState<SketchStroke | null>(null);
  const [text, setTextState] = useState<TextDraft | null>(null);
  // The text being typed, readable from any handler: blur and a new click both finish it, only once.
  const textRef = useRef<TextDraft | null>(null);
  const setText = (next: TextDraft | null) => {
    textRef.current = next;
    setTextState(next);
  };
  const svg = useRef<SVGSVGElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const checkpoint = useMathEditor((s) => s.checkpoint);
  const style = paperStyle(block.paper ?? paper);
  const height = block.height;

  const toLocal = (event: ReactPointerEvent) => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0, left: 0, top: 0 };
    const scale = LOGICAL_WIDTH / rect.width;
    const left = event.clientX - rect.left;
    const top = event.clientY - rect.top;
    return { x: Math.round(left * scale * 10) / 10, y: Math.round(top * scale * 10) / 10, left, top };
  };

  /** Pen settings for a new stroke; the highlighter is a wide see-through pen. */
  const newStroke = (x: number, y: number): SketchStroke => {
    const highlighter = tool === 'highlighter';
    const opacity = highlighter ? Math.min(penOpacity, 0.35) : penOpacity;
    const line = highlighter ? 'solid' : lineStyle;
    return {
      tool: highlighter ? 'pen' : (tool as SketchStroke['tool']),
      color,
      width: highlighter ? Math.min(24, Math.max(12, penWidth * 4)) : penWidth,
      points: [x, y, x, y],
      ...(line !== 'solid' ? { line } : {}),
      ...(opacity < 1 ? { opacity } : {}),
    };
  };

  const commitText = () => {
    const current = textRef.current;
    if (!current) return;
    setText(null);
    const value = current.value.trim();
    if (!value) return;
    checkpoint();
    addStroke(block.id, { tool: 'text', color, width: penWidth, points: [current.x, current.y], text: value.slice(0, 200), ...(penOpacity < 1 ? { opacity: penOpacity } : {}) });
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const { x, y, left, top } = toLocal(event);
    if (tool === 'eraser') {
      const hit = [...block.strokes].reverse().findIndex((stroke) => distanceTo(stroke, x, y) < 12);
      if (hit >= 0) eraseStroke(block.id, block.strokes.length - 1 - hit);
      return;
    }
    if (tool === 'text') {
      event.preventDefault();
      commitText();
      setText({ x, y, left, top, value: '' });
      setTimeout(() => input.current?.focus(), 0);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft(newStroke(x, y));
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

  const scale = svg.current ? svg.current.getBoundingClientRect().width / LOGICAL_WIDTH || 1 : 1;

  return (
    <div className="relative" onClick={(event) => tool === 'text' && event.stopPropagation()}>
      <svg
        ref={svg}
        viewBox={`0 0 ${LOGICAL_WIDTH} ${height}`}
        className={cn('block w-full touch-none rounded-lg border border-divider bg-card text-foreground', tool === 'eraser' ? 'cursor-cell' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair')}
        style={{ height, backgroundImage: style.backgroundImage, backgroundSize: style.backgroundSize }}
        data-testid="sketch-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        {block.strokes.map((stroke, index) => (
          <StrokeView key={index} stroke={stroke} />
        ))}
        {draft && <StrokeView stroke={draft} />}
      </svg>
      {text && (
        <div className="absolute z-10 flex flex-col gap-1" style={{ left: text.left, top: text.top - 16 * scale - 6 }} onPointerDown={(event) => event.stopPropagation()}>
          <input
            ref={input}
            value={text.value}
            onChange={(event) => setText({ ...text, value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitText();
              if (event.key === 'Escape') setText(null);
            }}
            onBlur={(event) => {
              // Clicking a symbol button keeps the box open.
              if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.dataset.symbol) return;
              commitText();
            }}
            placeholder="Type, then Enter (alpha → α, x^2 → x²)"
            className="h-8 min-w-56 rounded-md border border-brand/60 bg-card px-2 font-serif text-[15px] text-foreground shadow-sm outline-none"
            style={{ color: color === 'currentColor' ? undefined : color }}
            data-testid="sketch-text-input"
          />
          <div className="flex flex-wrap gap-0.5 rounded-md border border-divider bg-menu p-0.5 shadow-sm">
            {SYMBOLS.map((symbol) => (
              <button
                key={symbol}
                data-symbol={symbol}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (textRef.current) setText({ ...textRef.current, value: textRef.current.value + symbol });
                  input.current?.focus();
                }}
                className="flex size-6 items-center justify-center rounded font-serif text-[13px] text-fg-2 hover:bg-hover hover:text-foreground"
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
