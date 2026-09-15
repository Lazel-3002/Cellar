import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Design } from '@shared/types/design';
import { ArtboardView } from './ArtboardView';

/** Full-screen slideshow of the artboards. */
export function Present({ design, startId, onClose }: { design: Design; startId?: string | null; onClose: () => void }) {
  const [index, setIndex] = useState(() => Math.max(0, design.artboards.findIndex((a) => a.id === startId)));
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const count = design.artboards.length;

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
  const scale = Math.min(size.w / artboard.width, size.h / artboard.height);
  return (
    <div data-testid="present" className="group fixed inset-0 z-[100] flex items-center justify-center bg-black" onClick={() => setIndex((i) => Math.min(count - 1, i + 1))}>
      <div style={{ width: artboard.width * scale, height: artboard.height * scale, overflow: 'hidden' }}>
        <ArtboardView artboard={artboard} theme={design.theme} style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} />
      </div>
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
