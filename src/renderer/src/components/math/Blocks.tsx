import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, GripVertical, Pencil, Plus, RotateCcw, Trash, TriangleAlert, X } from 'lucide-react';
import { buildFigure } from '@shared/math/figure';
import { buildPlot } from '@shared/math/plot';
import type { DerivationBlock, FigureBlock, FormulaBlock, MathBlock, MathPaper, PlotBlock, QuizBlock, QuizQuestion, SketchBlock, TableBlock, TextBlock } from '@shared/types/math';
import { Button, IconButton } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/form';
import { Tip } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { useMathEditor } from '@/stores/math';
import { answerMatches, answerQuestion, deleteBlock, duplicateBlock, moveBlock, reorderBlock, resetQuiz, revealQuestion, updateBlock } from './actions';
import { MathText, SvgFigure } from './MathText';
import { SketchCanvas, SketchToolbar } from './Sketch';

const EDITABLE: MathBlock['type'][] = ['text', 'formula', 'derivation', 'table', 'sketch'];

function BlockShell({ block, index, count, children }: { block: MathBlock; index: number; count: number; children: React.ReactNode }) {
  const selected = useMathEditor((s) => s.selectedId === block.id);
  const editing = useMathEditor((s) => s.editingId === block.id);
  const select = useMathEditor((s) => s.select);
  const setEditing = useMathEditor((s) => s.setEditing);
  const [dropBefore, setDropBefore] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDropBefore(false);
    const dragged = event.dataTransfer.getData('text/plain');
    if (dragged && dragged !== block.id) reorderBlock(dragged, block.id);
  };

  return (
    <section
      data-testid={`block-${block.id}`}
      data-block-type={block.type}
      onClick={() => select(block.id)}
      onDragOver={(event) => {
        event.preventDefault();
        setDropBefore(true);
      }}
      onDragLeave={() => setDropBefore(false)}
      onDrop={onDrop}
      className={cn(
        'group relative rounded-xl border border-transparent px-4 py-3 transition-colors',
        selected ? 'border-brand/45 bg-card/70' : 'hover:border-divider hover:bg-card/40',
        dropBefore && 'border-t-2 border-t-brand',
      )}
    >
      <div className="absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-divider bg-menu px-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <span
          draggable
          onDragStart={(event) => event.dataTransfer.setData('text/plain', block.id)}
          className="flex size-6 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground"
          title="Drag to reorder"
        >
          <GripVertical className="size-3.5" />
        </span>
        {EDITABLE.includes(block.type) && (
          <IconButton label={editing ? 'Done' : 'Edit'} onClick={() => setEditing(editing ? null : block.id)} data-testid={`edit-${block.id}`}>
            {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
          </IconButton>
        )}
        <IconButton label="Move up" disabled={index === 0} onClick={() => moveBlock(block.id, -1)}>
          <ArrowUp className="size-3.5" />
        </IconButton>
        <IconButton label="Move down" disabled={index === count - 1} onClick={() => moveBlock(block.id, 1)}>
          <ArrowDown className="size-3.5" />
        </IconButton>
        <IconButton label="Duplicate" onClick={() => duplicateBlock(block.id)}>
          <Copy className="size-3.5" />
        </IconButton>
        <IconButton label="Delete" onClick={() => deleteBlock(block.id)} data-testid={`delete-${block.id}`}>
          <Trash className="size-3.5" />
        </IconButton>
      </div>
      {children}
      {block.note && <div className="mt-2 text-[12.5px] text-muted-foreground">{block.note}</div>}
    </section>
  );
}

const BlockTitle = ({ children }: { children: React.ReactNode }) =>
  children ? <div className="mb-1.5 text-[11.5px] font-medium tracking-[0.06em] text-muted-foreground uppercase">{children}</div> : null;

function BrokenBlock({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TextView({ block, editing }: { block: TextBlock; editing: boolean }) {
  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <Input value={block.heading ?? ''} placeholder="Heading (optional)" onChange={(event) => updateBlock(block.id, (b) => void (b.type === 'text' && (b.heading = event.target.value)))} />
        <Textarea
          autoFocus
          rows={Math.min(14, Math.max(3, block.body.split('\n').length + 1))}
          value={block.body}
          placeholder="Write the explanation. Maths like a^2 + b^2 = c^2 is typeset."
          onChange={(event) => updateBlock(block.id, (b) => void (b.type === 'text' && (b.body = event.target.value)))}
        />
      </div>
    );
  }
  const paragraphs = block.body.split(/\n{2,}/);
  return (
    <div className={cn(block.tone && 'border-l-[3px] pl-3', block.tone === 'warning' ? 'border-warning' : block.tone === 'tip' ? 'border-success' : block.tone === 'note' ? 'border-brand' : '')}>
      {block.heading && <h3 className="mb-1 font-serif text-[19px] leading-snug text-foreground">{block.heading}</h3>}
      {paragraphs.map((paragraph, index) => {
        const lines = paragraph.split('\n');
        const bullets = lines.length > 1 && lines.every((line) => /^\s*[-*•]\s+/.test(line));
        if (bullets) {
          return (
            <ul key={index} className="my-1 ml-5 list-disc space-y-0.5 text-[14.5px] leading-relaxed text-fg-2">
              {lines.map((line, i) => (
                <li key={i}>
                  <MathText text={line.replace(/^\s*[-*•]\s+/, '')} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="my-1 text-[14.5px] leading-relaxed text-fg-2">
            <MathText text={paragraph} />
          </p>
        );
      })}
    </div>
  );
}

function FormulaView({ block, editing }: { block: FormulaBlock; editing: boolean }) {
  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <Input value={block.title ?? ''} placeholder="Name (optional)" onChange={(event) => updateBlock(block.id, (b) => void (b.type === 'formula' && (b.title = event.target.value)))} />
        <Textarea
          autoFocus
          rows={Math.max(2, block.formula.split('\n').length)}
          value={block.formula}
          placeholder="a^2 + b^2 = c^2"
          onChange={(event) => updateBlock(block.id, (b) => void (b.type === 'formula' && (b.formula = event.target.value)))}
        />
        <Textarea
          rows={2}
          value={(block.where ?? []).join('\n')}
          placeholder="What the letters mean, one per line: c: the hypotenuse"
          onChange={(event) => updateBlock(block.id, (b) => void (b.type === 'formula' && (b.where = event.target.value.split('\n').filter(Boolean))))}
        />
      </div>
    );
  }
  return (
    <>
      <BlockTitle>{block.title}</BlockTitle>
      <div className="rounded-xl border border-divider bg-card px-4 py-3">
        {block.formula.split('\n').map((line, index) => (
          <div key={index} className="text-[19px] leading-relaxed text-foreground">
            <MathText text={line} />
          </div>
        ))}
        {!!block.where?.length && (
          <ul className="mt-2 ml-4 list-disc space-y-0.5 text-[12.5px] text-muted-foreground">
            {block.where.map((item, index) => (
              <li key={index}>
                <MathText text={item} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function DerivationView({ block, editing }: { block: DerivationBlock; editing: boolean }) {
  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <Input value={block.title ?? ''} placeholder="What is being worked out" onChange={(event) => updateBlock(block.id, (b) => void (b.type === 'derivation' && (b.title = event.target.value)))} />
        {block.steps.map((step, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <span className="w-4 text-right text-[11px] text-muted-foreground">{index + 1}</span>
            <Input
              className="flex-1 font-serif"
              value={step.math}
              placeholder="a^2 + 3 = 4"
              onChange={(event) =>
                updateBlock(block.id, (b) => {
                  if (b.type === 'derivation') b.steps[index] = { ...b.steps[index], math: event.target.value };
                })
              }
            />
            <Input
              className="w-40"
              value={step.reason ?? ''}
              placeholder="why"
              onChange={(event) =>
                updateBlock(block.id, (b) => {
                  if (b.type === 'derivation') b.steps[index] = { ...b.steps[index], reason: event.target.value || undefined };
                })
              }
            />
            <IconButton
              label="Remove step"
              onClick={() =>
                updateBlock(block.id, (b) => {
                  if (b.type === 'derivation') b.steps = b.steps.filter((_, i) => i !== index);
                })
              }
            >
              <X className="size-3.5" />
            </IconButton>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              updateBlock(block.id, (b) => {
                if (b.type === 'derivation') b.steps = [...b.steps, { math: '' }];
              })
            }
          >
            <Plus className="size-3.5" /> Step
          </Button>
          <Input className="flex-1 font-serif" value={block.result ?? ''} placeholder="Answer (optional)" onChange={(event) => updateBlock(block.id, (b) => void (b.type === 'derivation' && (b.result = event.target.value)))} />
        </div>
      </div>
    );
  }
  return (
    <>
      <BlockTitle>{block.title}</BlockTitle>
      <div className="m-steps">
        {block.steps.map((step, index) => (
          <div key={index}>
            <div className="m-step">
              <MathText text={step.math} className="m-step-math text-[17px] text-foreground" />
              {step.reason && <span className="m-step-reason text-muted-foreground">{step.reason}</span>}
            </div>
            {index < block.steps.length - 1 && <div className="m-arrow pl-1 text-faint">↓</div>}
          </div>
        ))}
      </div>
      {block.result && (
        <div className="mt-1.5">
          <span className="inline-block rounded-md bg-brand/12 px-2.5 py-1 text-[17px] text-foreground">
            <MathText text={block.result} />
          </span>
        </div>
      )}
    </>
  );
}

function FigureView({ block }: { block: FigureBlock }) {
  const built = useMemo(() => {
    try {
      return { svg: buildFigure(block.figure).svg, error: null as string | null };
    } catch (err) {
      return { svg: '', error: err instanceof Error ? err.message : 'This figure could not be drawn.' };
    }
  }, [block.figure]);
  return (
    <>
      <BlockTitle>{block.title}</BlockTitle>
      {built.error ? <BrokenBlock message={built.error} /> : <SvgFigure svg={built.svg} className="text-foreground" />}
      {block.caption && (
        <div className="mt-1 text-[12.5px] text-muted-foreground">
          <MathText text={block.caption} />
        </div>
      )}
    </>
  );
}

function PlotView({ block }: { block: PlotBlock }) {
  const built = useMemo(() => {
    try {
      const plot = buildPlot(block.plot);
      return { svg: plot.svg, notes: plot.notes, error: null as string | null };
    } catch (err) {
      return { svg: '', notes: [], error: err instanceof Error ? err.message : 'This graph could not be drawn.' };
    }
  }, [block.plot]);
  return (
    <>
      <BlockTitle>{block.title}</BlockTitle>
      {built.error ? <BrokenBlock message={built.error} /> : <SvgFigure svg={built.svg} className="text-foreground" />}
      {built.notes.map((note) => (
        <div key={note} className="mt-1 text-[12px] text-warning">
          {note}
        </div>
      ))}
      {block.caption && (
        <div className="mt-1 text-[12.5px] text-muted-foreground">
          <MathText text={block.caption} />
        </div>
      )}
    </>
  );
}

function TableView({ block, editing }: { block: TableBlock; editing: boolean }) {
  const setCell = (row: number, column: number, value: string) =>
    updateBlock(block.id, (b) => {
      if (b.type !== 'table') return;
      const rows = b.rows.map((cells) => [...cells]);
      rows[row] = rows[row] ?? [];
      rows[row][column] = value;
      b.rows = rows;
    });
  return (
    <>
      <BlockTitle>{block.title}</BlockTitle>
      <div className="overflow-x-auto">
        <table className="m-table text-[14px] text-fg-2">
          <thead>
            <tr>
              {block.columns.map((column, index) => (
                <th key={index}>
                  {editing ? (
                    <Input
                      className="h-7 min-w-24"
                      value={column}
                      onChange={(event) =>
                        updateBlock(block.id, (b) => {
                          if (b.type !== 'table') return;
                          const columns = [...b.columns];
                          columns[index] = event.target.value;
                          b.columns = columns;
                        })
                      }
                    />
                  ) : (
                    column
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {block.columns.map((_, columnIndex) => (
                  <td key={columnIndex}>
                    {editing ? (
                      <Input className="h-7 min-w-24" value={row[columnIndex] ?? ''} onChange={(event) => setCell(rowIndex, columnIndex, event.target.value)} />
                    ) : block.math === false ? (
                      row[columnIndex] ?? ''
                    ) : (
                      <MathText text={row[columnIndex] ?? ''} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              updateBlock(block.id, (b) => {
                if (b.type === 'table') b.rows = [...b.rows, b.columns.map(() => '')];
              })
            }
          >
            <Plus className="size-3.5" /> Row
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              updateBlock(block.id, (b) => {
                if (b.type !== 'table') return;
                b.columns = [...b.columns, `Column ${b.columns.length + 1}`];
                b.rows = b.rows.map((row) => [...row, '']);
              })
            }
          >
            <Plus className="size-3.5" /> Column
          </Button>
        </div>
      )}
    </>
  );
}

function Question({ block, question, index }: { block: QuizBlock; question: QuizQuestion; index: number }) {
  const [draft, setDraft] = useState(question.userAnswer ?? '');
  useEffect(() => setDraft(question.userAnswer ?? ''), [question.userAnswer]);
  const figure = useMemo(() => {
    if (!question.figure) return '';
    try {
      return buildFigure(question.figure).svg;
    } catch {
      return '';
    }
  }, [question.figure]);
  const answered = !!question.userAnswer;
  const correct = answered && answerMatches(question, question.userAnswer ?? '');

  return (
    <div className="border-t border-divider py-3 first:border-0 first:pt-0" data-testid={`question-${question.id}`}>
      <div className="flex gap-2 text-[14.5px] text-foreground">
        <span className="text-muted-foreground tabular-nums">{index + 1}.</span>
        <div className="min-w-0 flex-1">
          <MathText text={question.prompt} />
          {figure && <SvgFigure svg={figure} className="mt-2 text-foreground" />}
          {question.choices?.length ? (
            <div className="mt-2 flex flex-col gap-1">
              {question.choices.map((choice, choiceIndex) => {
                const picked = question.userAnswer === choice;
                return (
                  <button
                    key={choiceIndex}
                    onClick={() => answerQuestion(block.id, question.id, choice)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[14px] transition-colors',
                      picked ? (answerMatches(question, choice) ? 'border-success/60 bg-success/10' : 'border-danger/60 bg-danger/10') : 'border-divider hover:bg-hover',
                    )}
                  >
                    <span className="text-[11.5px] text-muted-foreground">{String.fromCharCode(65 + choiceIndex)}</span>
                    <MathText text={choice} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <Input
                className="h-8 w-44 font-serif"
                placeholder="Your answer"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') answerQuestion(block.id, question.id, draft);
                }}
                data-testid={`answer-${question.id}`}
              />
              <Button size="sm" variant="secondary" onClick={() => answerQuestion(block.id, question.id, draft)}>
                Check
              </Button>
            </div>
          )}
          {answered && (
            <div className={cn('mt-1.5 text-[13px]', correct ? 'text-success' : 'text-danger')}>
              {correct ? 'Correct.' : 'Not quite.'}
              {!correct && (
                <button className="ml-2 underline hover:no-underline" onClick={() => revealQuestion(block.id, question.id, !question.revealed)}>
                  {question.revealed ? 'Hide the answer' : 'Show the answer'}
                </button>
              )}
            </div>
          )}
          {!answered && (
            <button className="mt-1.5 block text-[12.5px] text-muted-foreground underline hover:text-foreground" onClick={() => revealQuestion(block.id, question.id, !question.revealed)}>
              {question.revealed ? 'Hide the answer' : 'Show the answer'}
            </button>
          )}
          {(question.revealed || (answered && correct)) && (
            <div className="mt-2 rounded-lg border border-divider bg-card px-3 py-2">
              <div className="text-[14px] text-foreground">
                Answer: <MathText text={question.answer} />
              </div>
              {!!question.steps?.length && (
                <div className="m-steps mt-1">
                  {question.steps.map((step, stepIndex) => (
                    <div key={stepIndex} className="m-step text-[13.5px] text-fg-2">
                      <MathText text={step} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuizView({ block }: { block: QuizBlock }) {
  const answered = block.questions.filter((question) => question.userAnswer);
  const correct = answered.filter((question) => answerMatches(question, question.userAnswer ?? ''));
  return (
    <div className="rounded-xl border border-divider bg-card/60 px-4 py-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[15px] font-medium text-foreground">{block.title ?? 'Practice test'}</span>
        <div className="flex-1" />
        {answered.length > 0 && (
          <span className="text-[12.5px] text-muted-foreground tabular-nums" data-testid={`score-${block.id}`}>
            {correct.length}/{block.questions.length}
          </span>
        )}
        <Tip label="Clear my answers">
          <IconButton label="Clear my answers" onClick={() => resetQuiz(block.id)}>
            <RotateCcw className="size-3.5" />
          </IconButton>
        </Tip>
      </div>
      {block.instructions && <p className="mb-2 text-[12.5px] text-muted-foreground">{block.instructions}</p>}
      {block.questions.map((question, index) => (
        <Question key={question.id} block={block} question={question} index={index} />
      ))}
    </div>
  );
}

function SketchView({ block, paper, editing }: { block: SketchBlock; paper: MathPaper; editing: boolean }) {
  return (
    <>
      <BlockTitle>{block.title}</BlockTitle>
      <SketchToolbar block={block} />
      <SketchCanvas block={block} paper={paper} />
      {editing && (
        <div className="mt-2 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span>Height</span>
          <Input
            className="h-7 w-20"
            type="number"
            value={block.height}
            onChange={(event) => updateBlock(block.id, (b) => void (b.type === 'sketch' && (b.height = Math.min(1200, Math.max(120, Number(event.target.value) || 360)))))}
          />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

export function BlockView({ block, index, count, paper }: { block: MathBlock; index: number; count: number; paper: MathPaper }) {
  const editing = useMathEditor((s) => s.editingId === block.id);
  const body = (() => {
    switch (block.type) {
      case 'text':
        return <TextView block={block} editing={editing} />;
      case 'formula':
        return <FormulaView block={block} editing={editing} />;
      case 'derivation':
        return <DerivationView block={block} editing={editing} />;
      case 'figure':
        return <FigureView block={block} />;
      case 'plot':
        return <PlotView block={block} />;
      case 'table':
        return <TableView block={block} editing={editing} />;
      case 'quiz':
        return <QuizView block={block} />;
      case 'sketch':
        return <SketchView block={block} paper={paper} editing={editing} />;
    }
  })();
  return (
    <BlockShell block={block} index={index} count={count}>
      {body}
    </BlockShell>
  );
}

/** Scrolls a block into view and selects it (used when the model adds one). */
export function useScrollToBlock(container: React.RefObject<HTMLElement | null>): (blockId: string) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (blockId: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const element = container.current?.querySelector(`[data-testid="block-${blockId}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };
}
