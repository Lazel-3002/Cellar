import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsRight, Pause, Play, RotateCcw, TriangleAlert } from 'lucide-react';
import { buildDiagram } from '@shared/math/diagram';
import { normalizeDiagram } from '@shared/math/diagram-normalize';
import type { DiagramBlock } from '@shared/types/math';
import { IconButton } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { useMathEditor } from '@/stores/math';
import { updateBlock } from './actions';
import { MathText, SvgFigure } from './MathText';

/** Seconds between elements of one step (matches --dg-gap in the shared CSS). */
const GAP = 0.55;

/** How long a step takes to draw and read before the next one starts, in ms. */
function stepDuration(elements: number, text: string): number {
  const draw = Math.max(1, elements) * GAP + 0.9;
  const read = Math.min(2.6, text.length * 0.03);
  return Math.round(Math.max(1.5, draw + read) * 1000);
}

/**
 * A step-by-step drawing. Steps the model has just drawn play in one at a time, the way a teacher
 * builds a picture on the board; afterwards the student can step back and forth, replay it, or see
 * the whole thing.
 */
export function DiagramView({ block, editing }: { block: DiagramBlock; editing: boolean }) {
  const built = useMemo(() => {
    try {
      return { ...buildDiagram(block.diagram), error: null as string | null };
    } catch (err) {
      return { svg: '', width: 0, height: 0, notes: [], steps: [], stepCount: 0, points: {}, error: err instanceof Error ? err.message : 'This drawing could not be made.' };
    }
  }, [block.diagram]);
  const total = built.stepCount;
  const perStep = useMemo(() => {
    const counts = new Map<number, number>();
    let last = 1;
    for (const element of block.diagram.elements) {
      last = element.step ?? last;
      counts.set(last, (counts.get(last) ?? 0) + 1);
    }
    return counts;
  }, [block.diagram.elements]);

  const takeFresh = useMathEditor((s) => s.takeFresh);
  const freshMark = useMathEditor((s) => s.fresh[block.id]);
  // A drawing the model has just added starts empty, so it can be drawn in.
  const [shown, setShown] = useState(() => {
    const fresh = useMathEditor.getState().fresh[block.id];
    return fresh !== undefined ? Math.min(fresh, total) : total;
  });
  const [animating, setAnimating] = useState<number | null>(null);
  const [token, setToken] = useState(0);
  const [playing, setPlaying] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const lastTotal = useRef(total);
  const applied = useRef('');

  // New steps from the model: draw them in, starting after what was already there.
  useLayoutEffect(() => {
    if (freshMark === undefined) return;
    takeFresh(block.id);
    const from = Math.min(freshMark, total);
    if (from >= total) return;
    setShown(from);
    setAnimating(null);
    setPlaying(true);
  }, [freshMark, total, block.id, takeFresh]);

  // Steps added or removed some other way (undo, an edit): keep showing everything if everything was shown.
  useLayoutEffect(() => {
    const before = lastTotal.current;
    lastTotal.current = total;
    if (before === total) return;
    setShown((current) => (current >= before ? total : Math.min(current, total)));
  }, [total]);

  // Playing: draw the next step once the current one has had its time.
  useEffect(() => {
    if (!playing) return;
    if (shown >= total) {
      setPlaying(false);
      return;
    }
    const step = built.steps[shown - 1];
    const delay = shown === 0 || animating === null ? 180 : stepDuration(perStep.get(shown) ?? 1, `${step?.text ?? ''}${step?.math ?? ''}`);
    const timer = setTimeout(() => {
      setShown(shown + 1);
      setAnimating(shown + 1);
      setToken((value) => value + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [playing, shown, total, animating, built.steps, perStep]);

  // Show the steps drawn so far, and restart the drawing animation only for the step being drawn.
  useLayoutEffect(() => {
    const root = host.current;
    if (!root) return;
    const key = `${built.svg.length}:${built.svg.slice(-64)}:${animating}:${token}`;
    const restart = applied.current !== key;
    applied.current = key;
    root.querySelectorAll<SVGGElement>('.dg-el').forEach((group) => {
      const step = Number(group.getAttribute('data-step')) || 1;
      group.classList.toggle('dg-hidden', step > shown);
      if (!restart) return;
      group.classList.remove('dg-play');
      if (step === animating && step <= shown) {
        void group.getBoundingClientRect();
        group.classList.add('dg-play');
      }
    });
  }, [built.svg, shown, animating, token]);

  const go = (step: number, animate: boolean) => {
    setPlaying(false);
    setShown(Math.max(0, Math.min(total, step)));
    setAnimating(animate ? step : null);
    setToken((value) => value + 1);
  };
  const play = () => {
    if (playing) return setPlaying(false);
    if (shown >= total) {
      setShown(0);
      setAnimating(null);
    }
    setPlaying(true);
  };

  const current = built.steps[shown - 1];
  const hidden = total - shown;

  return (
    <>
      {block.title && <div className="mb-1.5 text-[11.5px] font-medium tracking-[0.06em] text-muted-foreground uppercase">{block.title}</div>}
      {built.error ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{built.error}</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <div ref={host} className="max-w-full shrink-0" data-testid={`diagram-${block.id}`} data-shown={shown} data-total={total}>
            <SvgFigure svg={built.svg} className="text-foreground" />
          </div>
          {total > 1 || built.steps.length ? (
            <div className="flex min-w-[220px] flex-1 flex-col gap-2">
              <div className="flex items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
                <span className="mr-1.5 text-[12px] text-muted-foreground tabular-nums" data-testid={`diagram-step-${block.id}`}>
                  Step {shown} of {total}
                </span>
                <IconButton label="Start again" onClick={() => go(0, false)} disabled={shown === 0 && !playing}>
                  <RotateCcw className="size-3.5" />
                </IconButton>
                <IconButton label="Previous step" onClick={() => go(shown - 1, false)} disabled={shown === 0}>
                  <ChevronLeft className="size-4" />
                </IconButton>
                <IconButton label={playing ? 'Pause' : shown >= total ? 'Draw it again' : 'Play'} onClick={play} data-testid={`diagram-play-${block.id}`}>
                  {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                </IconButton>
                <IconButton label="Next step" onClick={() => go(shown + 1, true)} disabled={shown >= total} data-testid={`diagram-next-${block.id}`}>
                  <ChevronRight className="size-4" />
                </IconButton>
                <IconButton label="Show everything" onClick={() => go(total, false)} disabled={shown >= total}>
                  <ChevronsRight className="size-4" />
                </IconButton>
              </div>
              <ol className="flex flex-col gap-1.5">
                {built.steps.slice(0, shown).map((step, index) => {
                  const active = index === shown - 1;
                  return (
                    <li key={index}>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          go(index + 1, true);
                        }}
                        className={cn(
                          'flex w-full gap-2 rounded-lg border-l-[3px] px-2.5 py-1.5 text-left transition-colors',
                          active ? 'border-brand bg-brand/8 text-foreground' : 'border-transparent text-fg-2 hover:bg-hover',
                        )}
                      >
                        <span className="w-4 shrink-0 text-[12px] text-muted-foreground tabular-nums">{index + 1}.</span>
                        <span className="min-w-0 text-[13.5px] leading-snug">
                          {step.text}
                          {step.math && (
                            <span className="dg-step-math mt-0.5 block overflow-x-auto pb-0.5 text-[15px] text-foreground">
                              <MathText text={step.math} />
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {hidden > 0 && (
                <div className="pl-2.5 text-[12px] text-muted-foreground">
                  {hidden} more step{hidden === 1 ? '' : 's'} — press <ChevronRight className="inline size-3.5 align-[-2px]" /> or play.
                </div>
              )}
              {!current && shown === 0 && !hidden && <div className="text-[12px] text-muted-foreground">Nothing drawn yet.</div>}
            </div>
          ) : null}
        </div>
      )}
      {built.notes.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-0.5">
          {built.notes.slice(0, 4).map((note) => (
            <div key={note} className="text-[12px] text-warning">
              {note}
            </div>
          ))}
        </div>
      )}
      {block.caption && (
        <div className="mt-1 text-[12.5px] text-muted-foreground">
          <MathText text={block.caption} />
        </div>
      )}
      {editing && <DiagramEditor block={block} />}
    </>
  );
}

/** Step wording in place, and the drawing itself as JSON for anything else. */
function DiagramEditor({ block }: { block: DiagramBlock }) {
  const [json, setJson] = useState(() => JSON.stringify(block.diagram.elements, null, 1));
  const [error, setError] = useState<string | null>(null);
  const steps = block.diagram.steps ?? [];

  const applyJson = (value: string) => {
    setJson(value);
    try {
      const elements = JSON.parse(value) as unknown;
      if (!Array.isArray(elements)) throw new Error('The drawing has to be a list of elements.');
      const { diagram, error: problem } = normalizeDiagram({ ...block.diagram, elements, steps: block.diagram.steps ?? [] });
      if (!diagram) throw new Error(problem ?? 'Nothing to draw.');
      setError(null);
      updateBlock(block.id, (b) => {
        if (b.type === 'diagram') b.diagram = { ...diagram, steps: b.diagram.steps };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That is not valid JSON.');
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-divider pt-3" onClick={(event) => event.stopPropagation()}>
      <Input value={block.title ?? ''} placeholder="Title (optional)" onChange={(event) => updateBlock(block.id, (b) => void (b.type === 'diagram' && (b.title = event.target.value)))} />
      {steps.map((step, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <span className="w-4 text-right text-[11px] text-muted-foreground">{index + 1}</span>
          <Input
            className="flex-1"
            value={step.text}
            placeholder="What this step does"
            onChange={(event) =>
              updateBlock(block.id, (b) => {
                if (b.type !== 'diagram' || !b.diagram.steps) return;
                b.diagram.steps = b.diagram.steps.map((candidate, i) => (i === index ? { ...candidate, text: event.target.value } : candidate));
              })
            }
          />
          <Input
            className="w-44 font-serif"
            value={step.math ?? ''}
            placeholder="maths (optional)"
            onChange={(event) =>
              updateBlock(block.id, (b) => {
                if (b.type !== 'diagram' || !b.diagram.steps) return;
                b.diagram.steps = b.diagram.steps.map((candidate, i) => (i === index ? { ...candidate, math: event.target.value || undefined } : candidate));
              })
            }
          />
        </div>
      ))}
      <details>
        <summary className="cursor-pointer text-[12px] text-muted-foreground select-none">Drawing (JSON)</summary>
        <Textarea className="mt-1.5 font-mono text-[11.5px]" rows={10} value={json} onChange={(event) => applyJson(event.target.value)} spellCheck={false} />
        {error && <div className="mt-1 text-[12px] text-danger">{error}</div>}
      </details>
    </div>
  );
}

/** Replays a derivation's new lines one after another, as if written on the board. */
export function useRevealFrom(blockId: string, count: number): number | null {
  const takeFresh = useMathEditor((s) => s.takeFresh);
  const freshMark = useMathEditor((s) => s.fresh[blockId]);
  const [from, setFrom] = useState<number | null>(() => useMathEditor.getState().fresh[blockId] ?? null);
  useLayoutEffect(() => {
    if (freshMark === undefined) return;
    takeFresh(blockId);
    setFrom(freshMark);
  }, [freshMark, blockId, takeFresh]);
  // Once written, the lines stay put (an edit later must not replay them).
  useEffect(() => {
    if (from === null) return;
    const timer = setTimeout(() => setFrom(null), Math.max(0, count - from) * 550 + 1500);
    return () => clearTimeout(timer);
  }, [from, count]);
  return from;
}
