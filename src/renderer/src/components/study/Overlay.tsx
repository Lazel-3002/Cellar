/**
 * What is written on one page, drawn over pdf.js's own page: highlights and handwriting as SVG
 * (in page points, so they scale with the page), typed text, notes and marks as HTML. The active
 * tool decides whether the layer catches the pointer or lets it through to the page's text.
 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { X } from 'lucide-react';
import { smoothD } from '@shared/math/linestyle';
import { annotationBox } from '@shared/study/anchor';
import { MARK_COLORS, MARK_SYMBOL, nextAnnotationId } from '@shared/study/annotations';
import type { BookPageInfo, InkAnnotation, InkStroke, StudyAnnotation } from '@shared/types/study';
import { cn } from '@/lib/utils';
import { useStudyEditor, useStudyLayout } from '@/stores/study';

const FONT = '"Segoe UI", system-ui, sans-serif';
/** Strokes drawn within this long of each other, close together, are one piece of handwriting. */
const INK_MERGE_MS = 2500;

function pointsOf(stroke: InkStroke) {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < stroke.points.length; i += 2) pts.push({ x: stroke.points[i], y: stroke.points[i + 1] });
  return pts;
}

function strokePath(stroke: InkStroke): string {
  const pts = pointsOf(stroke);
  if (pts.length === 1) return `M${pts[0].x} ${pts[0].y}l0.01 0`;
  return pts.length > 2 ? smoothD(pts) : `M${pts[0].x} ${pts[0].y}L${pts[1].x} ${pts[1].y}`;
}

/** Distance from a point to a segment. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function strokeHit(stroke: InkStroke, x: number, y: number, tolerance: number): boolean {
  const p = stroke.points;
  if (p.length === 2) return Math.hypot(p[0] - x, p[1] - y) <= tolerance + stroke.width;
  for (let i = 0; i + 3 < p.length; i += 2) if (segmentDistance(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= tolerance + stroke.width / 2) return true;
  return false;
}

/** Annotations under a point, top-most last. */
function hitTest(annotations: StudyAnnotation[], x: number, y: number, tolerance: number): StudyAnnotation[] {
  return annotations.filter((a) => {
    if (a.type === 'ink') return a.strokes.some((stroke) => strokeHit(stroke, x, y, tolerance));
    if (a.type === 'highlight') return a.rects.some((r) => x >= r.x - 1 && x <= r.x + r.w + 1 && y >= r.y - 1 && y <= r.y + r.h + 1);
    const box = annotationBox(a);
    return x >= box.x - tolerance && x <= box.x + box.w + tolerance && y >= box.y - tolerance && y <= box.y + box.h + tolerance;
  });
}

interface OverlayProps {
  page: number;
  info: BookPageInfo;
  annotations: StudyAnnotation[];
}

export function PageOverlay({ page, info, annotations }: OverlayProps) {
  const root = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const tool = useStudyLayout((s) => s.tool);
  const penColor = useStudyLayout((s) => s.penColor);
  const penWidth = useStudyLayout((s) => s.penWidth);
  const highlightColor = useStudyLayout((s) => s.highlightColor);
  const selectedId = useStudyEditor((s) => s.selectedId);
  const editingId = useStudyEditor((s) => s.editingId);
  const store = useStudyEditor.getState;
  const [live, setLive] = useState<InkStroke | null>(null);
  const drawing = useRef<{ stroke: InkStroke; last: number } | null>(null);
  const lastInk = useRef<{ id: string; at: number } | null>(null);
  const erasing = useRef(false);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  // CSS pixels per page point, from the page's actual size on screen.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setK(el.clientWidth / info.width || 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [info.width]);

  const toPage = (event: { clientX: number; clientY: number }) => {
    const rect = root.current!.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * info.width, y: ((event.clientY - rect.top) / rect.height) * info.height };
  };

  const catches = tool === 'pen' || tool === 'marker' || tool === 'text' || tool === 'note' || tool === 'eraser';

  const eraseAt = (x: number, y: number) => {
    const hits = hitTest(annotations, x, y, 5 / Math.max(0.3, k));
    if (!hits.length) return;
    store().change(
      (all) =>
        all.flatMap((a) => {
          if (!hits.some((hit) => hit.id === a.id)) return [a];
          if (a.type !== 'ink') return [];
          const strokes = a.strokes.filter((stroke) => !strokeHit(stroke, x, y, 5 / Math.max(0.3, k)));
          return strokes.length ? [{ ...a, strokes }] : [];
        }),
      { history: false },
    );
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!catches || event.button !== 0 || event.target !== event.currentTarget) return;
    const { x, y } = toPage(event);
    event.preventDefault();
    if (tool === 'eraser') {
      store().checkpoint();
      erasing.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      eraseAt(x, y);
      return;
    }
    if (tool === 'pen' || tool === 'marker') {
      event.currentTarget.setPointerCapture(event.pointerId);
      const stroke: InkStroke =
        tool === 'marker' ? { points: [x, y], color: highlightColor, width: 11, opacity: 0.35 } : { points: [x, y], color: penColor, width: penWidth };
      drawing.current = { stroke, last: performance.now() };
      setLive({ ...stroke });
      return;
    }
    const id = nextAnnotationId(store().book?.annotations ?? []);
    if (tool === 'text') {
      const width = Math.max(60, Math.min(260, info.width - x - 12));
      store().change((all) => [...all, { id, type: 'text', page, author: 'user', createdAt: Date.now(), x, y: Math.max(0, y - 7), width, text: '', color: penColor, size: 11 }]);
      store().setEditing(id);
    } else if (tool === 'note') {
      store().change((all) => [...all, { id, type: 'note', page, author: 'user', createdAt: Date.now(), x, y, text: '' }]);
      store().setEditing(id);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (erasing.current) {
      const { x, y } = toPage(event);
      eraseAt(x, y);
      return;
    }
    const current = drawing.current;
    if (!current) return;
    const { x, y } = toPage(event);
    const p = current.stroke.points;
    // Skip points closer than a fraction of a point: they only add weight.
    if (Math.hypot(p[p.length - 2] - x, p[p.length - 1] - y) < 0.6 / Math.max(0.3, k)) return;
    p.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
    setLive({ ...current.stroke, points: [...p] });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (erasing.current) {
      erasing.current = false;
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    const current = drawing.current;
    if (!current) return;
    drawing.current = null;
    setLive(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
    const stroke = current.stroke;
    const now = Date.now();
    const box = annotationBox({ id: '', type: 'ink', page, author: 'user', createdAt: 0, strokes: [stroke] });
    const recent = lastInk.current;
    const existing = recent && now - recent.at < INK_MERGE_MS ? (store().book?.annotations.find((a) => a.id === recent.id && a.type === 'ink' && a.page === page) as InkAnnotation | undefined) : undefined;
    const near = existing && (() => {
      const other = annotationBox(existing);
      return box.x < other.x + other.w + 60 && other.x < box.x + box.w + 60 && box.y < other.y + other.h + 40 && other.y < box.y + box.h + 40;
    })();
    if (existing && near && stroke.opacity === existing.strokes[0]?.opacity) {
      store().change((all) => all.map((a) => (a.id === existing.id && a.type === 'ink' ? { ...a, strokes: [...a.strokes, stroke] } : a)));
      lastInk.current = { id: existing.id, at: now };
    } else {
      const id = nextAnnotationId(store().book?.annotations ?? []);
      store().change((all) => [...all, { id, type: 'ink', page, author: 'user', createdAt: now, strokes: [stroke] }]);
      lastInk.current = { id, at: now };
    }
  };

  // Moving a text box, note or mark with the select tool.
  const startDrag = (event: ReactPointerEvent<HTMLElement>, annotation: StudyAnnotation) => {
    if (tool === 'eraser') {
      event.stopPropagation();
      store().change((all) => all.filter((a) => a.id !== annotation.id));
      return;
    }
    if (tool !== 'select' || event.button !== 0 || editingId === annotation.id) return;
    if (annotation.type !== 'text' && annotation.type !== 'note' && annotation.type !== 'mark') return;
    event.stopPropagation();
    const { x, y } = toPage(event);
    store().select(annotation.id);
    drag.current = { id: annotation.id, dx: x - annotation.x, dy: y - annotation.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const { x, y } = toPage(event);
    if (!d.moved) {
      d.moved = true;
      store().checkpoint();
    }
    const nx = Math.max(0, Math.min(info.width - 8, x - d.dx));
    const ny = Math.max(0, Math.min(info.height - 8, y - d.dy));
    store().change((all) => all.map((a) => (a.id === d.id && (a.type === 'text' || a.type === 'note' || a.type === 'mark') ? { ...a, x: nx, y: ny } : a)), { history: false });
  };
  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  };

  const inks = annotations.filter((a): a is InkAnnotation => a.type === 'ink');
  const highlights = annotations.filter((a) => a.type === 'highlight');
  const cursor = tool === 'pen' || tool === 'marker' ? 'crosshair' : tool === 'text' ? 'text' : tool === 'note' ? 'copy' : tool === 'eraser' ? 'cell' : undefined;

  return (
    <div
      ref={root}
      data-testid={`study-overlay-${page}`}
      className="cellar-study-overlay"
      style={{ pointerEvents: catches ? 'auto' : 'none', cursor, touchAction: catches ? 'none' : undefined }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg viewBox={`0 0 ${info.width} ${info.height}`} className="pointer-events-none absolute inset-0 size-full" preserveAspectRatio="none">
        {highlights.map((a) => (a.type === 'highlight' ? <HighlightView key={a.id} annotation={a} /> : null))}
        {inks.map((a) => (
          <g key={a.id} data-annotation={a.id}>
            {a.strokes.map((stroke, i) => (
              <path key={i} d={strokePath(stroke)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeOpacity={stroke.opacity ?? 1} strokeLinecap="round" strokeLinejoin="round" style={stroke.opacity ? { mixBlendMode: 'multiply' } : undefined} />
            ))}
          </g>
        ))}
        {live && <path d={strokePath(live)} fill="none" stroke={live.color} strokeWidth={live.width} strokeOpacity={live.opacity ?? 1} strokeLinecap="round" strokeLinejoin="round" style={live.opacity ? { mixBlendMode: 'multiply' } : undefined} />}
      </svg>
      {annotations.map((a) => {
        if (a.type === 'text') return <TextBox key={a.id} annotation={a} k={k} selected={selectedId === a.id} editing={editingId === a.id} tool={tool} onPointerDown={(e) => startDrag(e, a)} onPointerMove={moveDrag} onPointerUp={endDrag} />;
        if (a.type === 'note') return <NotePin key={a.id} annotation={a} k={k} open={selectedId === a.id || editingId === a.id} editing={editingId === a.id} tool={tool} pageWidth={info.width} onPointerDown={(e) => startDrag(e, a)} onPointerMove={moveDrag} onPointerUp={endDrag} />;
        if (a.type === 'mark') return <MarkView key={a.id} annotation={a} k={k} selected={selectedId === a.id} tool={tool} onPointerDown={(e) => startDrag(e, a)} onPointerMove={moveDrag} onPointerUp={endDrag} />;
        if (a.type === 'highlight' && a.note) {
          const first = a.rects[0];
          const note = { ...a, type: 'note' as const, x: Math.min(info.width - 10, first.x + first.w + 8), y: first.y, text: a.note };
          return <NotePin key={a.id} annotation={note} k={k} open={selectedId === a.id} editing={false} tool={tool} pageWidth={info.width} readOnly onPointerDown={(e) => { e.stopPropagation(); store().select(selectedId === a.id ? null : a.id); }} onPointerMove={() => undefined} onPointerUp={() => undefined} />;
        }
        return null;
      })}
    </div>
  );
}

interface ItemProps<T> {
  annotation: T;
  k: number;
  tool: string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}

/** Flashes once when the model has just written it. */
function useFresh(id: string): boolean {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (useStudyEditor.getState().takeFresh(id)) {
      setFresh(true);
      const timer = setTimeout(() => setFresh(false), 2400);
      return () => clearTimeout(timer);
    }
  }, [id]);
  return fresh;
}

function TextBox({ annotation: a, k, selected, editing, tool, onPointerDown, onPointerMove, onPointerUp }: ItemProps<Extract<StudyAnnotation, { type: 'text' }>> & { selected: boolean; editing: boolean }) {
  const store = useStudyEditor.getState;
  const fresh = useFresh(a.id);
  const area = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(a.text);
  useEffect(() => setDraft(a.text), [a.text]);
  useLayoutEffect(() => {
    if (!editing || !area.current) return;
    area.current.focus();
    area.current.setSelectionRange(area.current.value.length, area.current.value.length);
  }, [editing]);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing, k]);

  const commit = () => {
    store().setEditing(null);
    const text = draft.replace(/\s+$/, '');
    if (!text.trim()) store().change((all) => all.filter((x) => x.id !== a.id));
    else if (text !== a.text) store().change((all) => all.map((x) => (x.id === a.id && x.type === 'text' ? { ...x, text } : x)));
  };

  const style = { left: a.x * k, top: a.y * k, width: a.width * k, fontSize: a.size * k, lineHeight: 1.3, color: a.color, fontFamily: FONT };
  const interactive = tool === 'select' || tool === 'eraser' || tool === 'text';
  if (editing) {
    return (
      <textarea
        ref={area}
        data-testid="study-text-editor"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
            event.preventDefault();
            area.current?.blur();
          }
        }}
        className="study-item absolute resize-none overflow-hidden rounded-[3px] bg-white/70 p-0 outline outline-1 outline-[#2459c4]/60"
        style={{ ...style, pointerEvents: 'auto' }}
        placeholder="Type…"
      />
    );
  }
  return (
    <div
      data-testid="study-text"
      data-annotation={a.id}
      className={cn('study-item absolute whitespace-pre-wrap rounded-[3px]', selected && 'outline outline-1 outline-[#2459c4]/60', fresh && 'study-fresh', tool === 'select' && 'cursor-move')}
      style={{ ...style, pointerEvents: interactive ? 'auto' : 'none' }}
      title={a.author === 'ai' ? 'Written by the tutor' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(event) => {
        event.stopPropagation();
        store().setEditing(a.id);
      }}
      onClick={(event) => {
        if (tool === 'text') {
          event.stopPropagation();
          store().setEditing(a.id);
        }
      }}
    >
      {a.text}
      {selected && tool === 'select' && <DeleteButton id={a.id} k={k} />}
    </div>
  );
}

function HighlightView({ annotation: a }: { annotation: Extract<StudyAnnotation, { type: 'highlight' }> }) {
  const fresh = useFresh(a.id);
  return (
    <g className={cn(fresh && 'study-fresh')} data-annotation={a.id} data-testid="study-highlight">
      {a.rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={a.color} opacity={0.42} style={{ mixBlendMode: 'multiply' }} rx={1} />
      ))}
    </g>
  );
}

function DeleteButton({ id, k }: { id: string; k: number }) {
  return (
    <button
      aria-label="Delete"
      className="absolute -top-2.5 -right-2.5 flex size-5 items-center justify-center rounded-full bg-[#1f1f1f] text-white shadow"
      style={{ transform: `scale(${Math.min(1.2, Math.max(0.8, k))})` }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        useStudyEditor.getState().change((all) => all.filter((a) => a.id !== id));
      }}
    >
      <X className="size-3" />
    </button>
  );
}

function NotePin({
  annotation: a,
  k,
  open,
  editing,
  tool,
  pageWidth,
  readOnly,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: ItemProps<Extract<StudyAnnotation, { type: 'note' }>> & { open: boolean; editing: boolean; pageWidth: number; readOnly?: boolean }) {
  const store = useStudyEditor.getState;
  const fresh = useFresh(a.id);
  const [draft, setDraft] = useState(a.text);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setDraft(a.text), [a.text]);
  useLayoutEffect(() => {
    if (editing) area.current?.focus();
  }, [editing]);
  const size = Math.max(16, 18 * k);
  const cardWidth = 230;
  // Open the card towards the page's middle so it stays on the page.
  const openLeft = a.x * k + cardWidth + 12 > pageWidth * k;
  const commit = () => {
    store().setEditing(null);
    const text = draft.trim();
    if (!text) store().change((all) => all.filter((x) => x.id !== a.id));
    else if (text !== a.text) store().change((all) => all.map((x) => (x.id === a.id && x.type === 'note' ? { ...x, text } : x)));
  };
  return (
    <>
      <div
        data-testid="study-note"
        data-annotation={a.id}
        className={cn('study-item absolute flex items-center justify-center rounded-[4px] shadow-sm', a.author === 'ai' ? 'bg-[#f7c948] text-[#5c4300]' : 'bg-[#8cc4f5] text-[#123d66]', fresh && 'study-fresh')}
        style={{ left: a.x * k - size / 2, top: a.y * k, width: size, height: size, fontSize: size * 0.62, pointerEvents: 'auto', cursor: tool === 'select' ? 'pointer' : undefined }}
        title={a.author === 'ai' ? 'Note from the tutor' : 'Your note'}
        onPointerDown={(event) => {
          onPointerDown(event);
          if (tool !== 'eraser' && !readOnly) {
            event.stopPropagation();
            store().select(open ? null : a.id);
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        ✎
      </div>
      {open && (
        <div
          className="study-item absolute z-10 rounded-lg border border-black/10 bg-[#fffbe8] p-2.5 text-[12.5px] leading-snug text-[#2b2b2b] shadow-lg"
          style={{ left: openLeft ? a.x * k - cardWidth - size / 2 - 4 : a.x * k + size / 2 + 4, top: a.y * k, width: cardWidth, pointerEvents: 'auto', fontFamily: FONT }}
          onPointerDown={(event) => event.stopPropagation()}
          data-testid="study-note-card"
        >
          <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-[#8a6d00]">
            <span>{a.author === 'ai' ? 'Tutor' : 'Your note'}</span>
            {!readOnly && (
              <button aria-label="Delete note" className="rounded p-0.5 hover:bg-black/5" onClick={() => store().change((all) => all.filter((x) => x.id !== a.id))}>
                <X className="size-3" />
              </button>
            )}
          </div>
          {editing ? (
            <textarea
              ref={area}
              value={draft}
              data-testid="study-note-editor"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) area.current?.blur();
              }}
              rows={4}
              className="w-full resize-none bg-transparent outline-none"
              placeholder="Write a note…"
            />
          ) : (
            <div className="whitespace-pre-wrap" onDoubleClick={() => !readOnly && a.author === 'user' && store().setEditing(a.id)}>
              {a.text}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function MarkView({ annotation: a, k, selected, tool, onPointerDown, onPointerMove, onPointerUp }: ItemProps<Extract<StudyAnnotation, { type: 'mark' }>> & { selected: boolean }) {
  const fresh = useFresh(a.id);
  const color = MARK_COLORS[a.verdict];
  return (
    <div
      data-testid="study-mark"
      data-annotation={a.id}
      className={cn('study-item absolute flex items-baseline gap-1 whitespace-nowrap', selected && 'outline outline-1 outline-[#2459c4]/60', fresh && 'study-fresh')}
      style={{ left: a.x * k, top: a.y * k - 3 * k, color, fontFamily: FONT, pointerEvents: tool === 'select' || tool === 'eraser' ? 'auto' : 'none', cursor: tool === 'select' ? 'move' : undefined }}
      title={a.author === 'ai' ? 'Marked by the tutor' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <span style={{ fontSize: 16 * k, fontWeight: 700, lineHeight: 1 }}>{MARK_SYMBOL[a.verdict]}</span>
      {a.comment && <span style={{ fontSize: 9.5 * k }}>{a.comment}</span>}
      {selected && tool === 'select' && <DeleteButton id={a.id} k={k} />}
    </div>
  );
}

