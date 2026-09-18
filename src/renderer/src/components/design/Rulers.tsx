import { useEffect, useState, type RefObject } from 'react';
import { useDesignEditor } from '@/stores/design';

const RULER = 20;
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

/** A "nice" world-space spacing whose ticks land at least ~60 screen px apart at the current zoom. */
function niceStep(zoom: number): number {
  return STEPS.find((step) => step * zoom >= 60) ?? STEPS[STEPS.length - 1];
}

/** Fixed top/left tick strips showing world-space position alongside the canvas. Canvas-only: never exported, never seen by the model. */
export function Rulers({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const zoom = useDesignEditor((s) => s.zoom);
  const panX = useDesignEditor((s) => s.panX);
  const panY = useDesignEditor((s) => s.panY);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => setSize({ w: node.clientWidth, h: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef]);

  const step = niceStep(zoom);
  const ticks = (pan: number, extent: number) => {
    const out: number[] = [];
    if (extent <= 0) return out;
    const start = Math.floor(-pan / zoom / step) * step;
    const end = Math.ceil((extent - pan) / zoom / step) * step;
    for (let v = start; v <= end; v += step) out.push(v);
    return out;
  };

  return (
    <>
      <svg data-canvas-ui className="pointer-events-none absolute top-0 left-[20px] h-5 text-muted-foreground" style={{ width: Math.max(0, size.w - RULER) }}>
        {ticks(panX, size.w).map((v) => {
          const x = panX + v * zoom - RULER;
          return (
            <g key={v}>
              <line x1={x} y1={12} x2={x} y2={20} stroke="currentColor" strokeOpacity={0.5} />
              <text x={x + 3} y={11} fontSize={9} fill="currentColor" fillOpacity={0.7}>
                {v}
              </text>
            </g>
          );
        })}
      </svg>
      <svg data-canvas-ui className="pointer-events-none absolute top-[20px] left-0 w-5 text-muted-foreground" style={{ height: Math.max(0, size.h - RULER) }}>
        {ticks(panY, size.h).map((v) => {
          const y = panY + v * zoom - RULER;
          return (
            <g key={v}>
              <line x1={12} y1={y} x2={20} y2={y} stroke="currentColor" strokeOpacity={0.5} />
              <text x={2} y={y + 9} fontSize={9} fill="currentColor" fillOpacity={0.7} transform={`rotate(-90, 2, ${y + 9})`}>
                {v}
              </text>
            </g>
          );
        })}
      </svg>
      <div data-canvas-ui className="pointer-events-none absolute top-0 left-0 h-5 w-5 bg-[var(--sidebar)]" />
    </>
  );
}
