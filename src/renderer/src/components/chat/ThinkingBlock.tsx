import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThinkingBlock({ reasoning, active, durationMs, defaultOpen = false }: { reasoning: string; active: boolean; durationMs?: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(active || defaultOpen);
  const wasActive = useRef(active);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active && !wasActive.current) setOpen(true);
    if (!active && wasActive.current && !defaultOpen) setOpen(false);
    wasActive.current = active;
  }, [active]);

  useEffect(() => {
    if (active && open && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [reasoning, active, open]);

  const seconds = durationMs ? Math.max(1, Math.round(durationMs / 1000)) : undefined;
  const label = active ? 'Thinking…' : seconds ? `Thought for ${seconds} second${seconds === 1 ? '' : 's'}` : 'Thoughts';

  return (
    <div className="mb-3 font-sans">
      <button onClick={() => setOpen((o) => !o)} className="group flex items-center gap-1 text-[13.5px] text-muted-foreground hover:text-foreground">
        <span className={cn(active && 'shimmer')}>{label}</span>
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div ref={body} className={cn('selectable mt-2 border-l-2 border-divider pl-4 text-[13.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground', active && 'max-h-60 overflow-y-auto')}>
          {reasoning.trim()}
        </div>
      )}
    </div>
  );
}
