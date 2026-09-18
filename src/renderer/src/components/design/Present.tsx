import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { findArtboard } from '@shared/design/ops';
import type { Artboard, Design, DesignElement, DesignTheme, DesignTransition } from '@shared/types/design';
import { invoke } from '@/lib/ipc';
import { ArtboardView } from './ArtboardView';

/** How far the incoming/outgoing layers travel for a "slide" transition, as a fraction of the artboard's own size. */
const SLIDE_OFFSET: Record<string, { x: number; y: number }> = {
  'slide-left': { x: 1, y: 0 },
  'slide-right': { x: -1, y: 0 },
  'slide-up': { x: 0, y: 1 },
  'slide-down': { x: 0, y: -1 },
};

const TRANSITION_MS = 260;

/** Full-screen slideshow of the artboards. */
export function Present({ design, startId, onClose }: { design: Design; startId?: string | null; onClose: () => void }) {
  const [index, setIndex] = useState(() => Math.max(0, design.artboards.findIndex((a) => a.id === startId)));
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const count = design.artboards.length;

  // The previous artboard stays mounted briefly so the incoming one can transition over it.
  const [outgoing, setOutgoing] = useState<Artboard | null>(null);
  const [entered, setEntered] = useState(true);
  const prevIndex = useRef(index);
  useEffect(() => {
    if (prevIndex.current === index) return;
    const from = design.artboards[prevIndex.current];
    prevIndex.current = index;
    const to = design.artboards[index];
    if (!to?.transition || !from) return;
    setOutgoing(from);
    setEntered(false);
    const raf = requestAnimationFrame(() => setEntered(true));
    const timer = setTimeout(() => setOutgoing(null), TRANSITION_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) setIndex((i) => Math.min(count - 1, i + 1));
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'Home') setIndex(0);
      else if (e.key === 'End') setIndex(count - 1);
      else if (e.key === 'Escape') onClose();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) onClose();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('fullscreenchange', onFullscreen);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [count, onClose]);

  const artboard = design.artboards[Math.min(index, count - 1)];
  if (!artboard) return null;

  const onElementClick = (el: DesignElement) => {
    if (!el.link) return;
    if (el.link.kind === 'url') {
      if (el.link.url) void invoke('system:openExternal', el.link.url);
      return;
    }
    const target = findArtboard(design, el.link.artboard);
    if (target) setIndex(design.artboards.indexOf(target));
  };

  return (
    <div data-testid="present" className="group fixed inset-0 z-[100] overflow-hidden bg-black" onClick={() => setIndex((i) => Math.min(count - 1, i + 1))}>
      {outgoing && <PresentLayer artboard={outgoing} theme={design.theme} size={size} style={transitionStyle(artboard.transition, true, entered)} onElementClick={onElementClick} />}
      <PresentLayer artboard={artboard} theme={design.theme} size={size} style={outgoing ? transitionStyle(artboard.transition, false, entered) : undefined} onElementClick={onElementClick} />
      <div className="absolute right-4 bottom-4 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[12px] text-white/80 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        <button aria-label="Previous" className="flex size-7 items-center justify-center rounded-full hover:bg-white/10" onClick={() => setIndex((i) => Math.max(0, i - 1))}>
          <ChevronLeft className="size-4" />
        </button>
        <span className="tabular-nums">
          {index + 1} / {count}
        </span>
        <button aria-label="Next" className="flex size-7 items-center justify-center rounded-full hover:bg-white/10" onClick={() => setIndex((i) => Math.min(count - 1, i + 1))}>
          <ChevronRight className="size-4" />
        </button>
        <button aria-label="Exit" className="ml-1 flex size-7 items-center justify-center rounded-full hover:bg-white/10" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

function PresentLayer({ artboard, theme, size, style, onElementClick }: { artboard: Artboard; theme: DesignTheme; size: { w: number; h: number }; style?: CSSProperties; onElementClick: (el: DesignElement) => void }) {
  const scale = Math.min(size.w / artboard.width, size.h / artboard.height);
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={style}>
      <div style={{ width: artboard.width * scale, height: artboard.height * scale, overflow: 'hidden' }}>
        <ArtboardView artboard={artboard} theme={theme} style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} onElementClick={onElementClick} />
      </div>
    </div>
  );
}

/** The incoming layer starts offset/transparent and settles into place; the outgoing layer starts in place and exits the opposite way. `entered` flips a frame after mount, which is what actually drives the CSS transition. */
function transitionStyle(kind: DesignTransition | undefined, isOutgoing: boolean, entered: boolean): CSSProperties | undefined {
  if (!kind) return undefined;
  const base: CSSProperties = { transition: `transform ${TRANSITION_MS}ms ease, opacity ${TRANSITION_MS}ms ease` };
  if (kind === 'fade') return { ...base, opacity: isOutgoing ? (entered ? 0 : 1) : entered ? 1 : 0 };
  const offset = SLIDE_OFFSET[kind];
  const magnitude = isOutgoing ? (entered ? -100 : 0) : entered ? 0 : 100;
  return { ...base, transform: `translate(${offset.x * magnitude}%, ${offset.y * magnitude}%)` };
}
