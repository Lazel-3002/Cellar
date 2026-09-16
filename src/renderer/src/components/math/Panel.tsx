import { useMemo, useState } from 'react';
import { Calculator as CalculatorIcon, ChartSpline, Delete, Grid3x3, ListChecks, Pencil, PenLine, Plus, Shapes, Sigma, SquareFunction, Table as TableIcon, Trash } from 'lucide-react';
import { calculate } from '@shared/math/calc';
import { generateQuiz, QUIZ_TOPICS } from '@shared/math/quiz';
import type { FigureKind, MathAngleMode, MathPaper, QuizDifficulty, QuizTopic } from '@shared/types/math';
import { Button, IconButton } from '@/components/ui/button';
import { Field, Input, Select, Segmented, Switch } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { selectedBlock, useMathEditor, useMathLayout, type PanelTab } from '@/stores/math';
import { addBlock, resetQuiz, setBoardMeta, updateBlock } from './actions';
import { MathText } from './MathText';

const KEYS: Array<Array<{ label: string; insert?: string; action?: 'clear' | 'back' | 'equals' }>> = [
  [{ label: 'sin', insert: 'sin(' }, { label: 'cos', insert: 'cos(' }, { label: 'tan', insert: 'tan(' }, { label: 'cot', insert: 'cot(' }],
  [{ label: '(', insert: '(' }, { label: ')', insert: ')' }, { label: '√', insert: 'sqrt(' }, { label: 'x²', insert: '^2' }],
  [{ label: '7', insert: '7' }, { label: '8', insert: '8' }, { label: '9', insert: '9' }, { label: '÷', insert: '/' }],
  [{ label: '4', insert: '4' }, { label: '5', insert: '5' }, { label: '6', insert: '6' }, { label: '×', insert: '·' }],
  [{ label: '1', insert: '1' }, { label: '2', insert: '2' }, { label: '3', insert: '3' }, { label: '−', insert: '-' }],
  [{ label: '0', insert: '0' }, { label: '.', insert: '.' }, { label: 'π', insert: 'pi' }, { label: '+', insert: '+' }],
];

function Calculator() {
  const [input, setInput] = useState('');
  const board = useMathEditor((s) => s.board);
  const { calcHistory, pushCalc, clearCalc } = useMathLayout();
  const angle: MathAngleMode = board?.angleMode ?? 'deg';
  const result = useMemo(() => (input.trim() ? calculate(input, { angle, steps: true }) : null), [input, angle]);
  const selectedId = useMathEditor((s) => s.selectedId);

  const commit = () => {
    if (!result?.ok) return;
    pushCalc({ input: result.input, answer: result.answer });
    setInput(result.answer);
  };

  const insertSteps = () => {
    if (!result?.ok) return;
    const steps = (result.steps ?? [result.input]).map((math) => ({ math }));
    addBlock({ type: 'derivation', title: `Calculate ${result.input}`, steps: steps.length > 1 ? steps : [{ math: `${result.input} = ${result.answer}` }], result: result.answer }, { after: selectedId });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pt-3">
        <Input
          autoFocus
          value={input}
          placeholder="12/13 + 5/13"
          className="h-10 font-serif text-[16px]"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
          data-testid="calc-input"
        />
        <div className="mt-2 min-h-[46px] rounded-lg border border-divider bg-card px-3 py-2" data-testid="calc-result">
          {result?.ok ? (
            <>
              <div className="text-[20px] leading-tight text-foreground">
                <MathText text={result.answer} />
              </div>
              {result.approx && <div className="text-[12px] text-muted-foreground tabular-nums">≈ {result.approx}</div>}
            </>
          ) : (
            <div className="text-[12.5px] text-muted-foreground">{result?.error ?? `Angles in ${angle === 'deg' ? 'degrees' : 'radians'}. Fractions and roots stay exact.`}</div>
          )}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {KEYS.flat().map((key, index) => (
            <button
              key={`${key.label}-${index}`}
              onClick={() => setInput((current) => current + (key.insert ?? ''))}
              className="h-8 rounded-md border border-divider bg-card text-[13.5px] text-fg-2 hover:bg-hover hover:text-foreground"
            >
              {key.label}
            </button>
          ))}
          <button onClick={() => setInput('')} className="h-8 rounded-md border border-divider bg-card text-[13px] text-fg-2 hover:bg-hover">
            C
          </button>
          <button onClick={() => setInput((current) => current.slice(0, -1))} className="flex h-8 items-center justify-center rounded-md border border-divider bg-card text-fg-2 hover:bg-hover">
            <Delete className="size-3.5" />
          </button>
          <button onClick={commit} className="col-span-2 h-8 rounded-md bg-foreground text-[13.5px] font-medium text-background hover:opacity-90">
            =
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="secondary" className="flex-1" disabled={!result?.ok} onClick={insertSteps} data-testid="calc-insert">
            Add to the board
          </Button>
          <Segmented
            size="sm"
            value={angle}
            onChange={(value) => setBoardMeta({ angleMode: value as MathAngleMode })}
            options={[
              { value: 'deg', label: 'DEG' },
              { value: 'rad', label: 'RAD' },
            ]}
          />
        </div>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-divider px-3 py-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11.5px] text-muted-foreground">History</span>
          {calcHistory.length > 0 && (
            <IconButton label="Clear history" onClick={clearCalc}>
              <Trash className="size-3.5" />
            </IconButton>
          )}
        </div>
        {calcHistory.length === 0 && <div className="text-[12.5px] text-muted-foreground">Everything you work out shows up here.</div>}
        {calcHistory.map((entry, index) => (
          <button key={index} onClick={() => setInput(entry.input)} className="block w-full border-b border-divider py-1.5 text-left last:border-0 hover:bg-hover">
            <div className="truncate text-[12.5px] text-muted-foreground">
              <MathText text={entry.input} />
            </div>
            <div className="truncate text-[14px] text-foreground">
              <MathText text={entry.answer} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const TRIG_TABLE = {
  type: 'table',
  title: 'Values at the special angles',
  columns: ['', '30°', '45°', '60°'],
  rows: [
    ['sin', '1/2', '√2/2', '√3/2'],
    ['cos', '√3/2', '√2/2', '1/2'],
    ['tan', '√3/3', '1', '√3'],
    ['cot', '√3', '1', '√3/3'],
  ],
  math: true,
};

function InsertTab() {
  const selectedId = useMathEditor((s) => s.selectedId);
  const [topic, setTopic] = useState<QuizTopic>('pythagoras');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('medium');
  const [choices, setChoices] = useState(false);
  const after = selectedId;

  const items: Array<{ label: string; description: string; icon: typeof PenLine; onClick: () => void }> = [
    { label: 'Explanation', description: 'A paragraph of text', icon: PenLine, onClick: () => addBlock({ type: 'text', body: '' }, { after }) },
    { label: 'Formula', description: 'A boxed rule', icon: Sigma, onClick: () => addBlock({ type: 'formula', title: 'Pythagorean theorem', formula: 'a^2 + b^2 = c^2', where: ['c: the hypotenuse'] }, { after }) },
    { label: 'Steps', description: 'A worked derivation', icon: SquareFunction, onClick: () => addBlock({ type: 'derivation', title: 'Working', steps: [{ math: '' }, { math: '' }] }, { after }) },
    { label: 'Figure', description: 'A labelled triangle, square or circle', icon: Shapes, onClick: () => addBlock({ type: 'figure', figure: { kind: 'right-triangle', labels: ['A', 'B', 'C'], sides: [3, 4], rightAngleAt: 1 } }, { after }) },
    { label: 'Graph', description: 'A function on axes', icon: ChartSpline, onClick: () => addBlock({ type: 'plot', title: 'Graph', plot: { functions: [{ expr: 'x^2 - 2' }], xMin: -5, xMax: 5 } }, { after }) },
    { label: 'Table of values', description: 'The special angles', icon: TableIcon, onClick: () => addBlock(TRIG_TABLE, { after }) },
    { label: 'Whiteboard', description: 'Space to work by hand', icon: Pencil, onClick: () => addBlock({ type: 'sketch', height: 360, strokes: [] }, { after }) },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <button key={item.label} onClick={item.onClick} className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover" data-testid={`insert-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-tile text-muted-foreground">
              <item.icon className="size-4" strokeWidth={1.6} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] text-foreground">{item.label}</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">{item.description}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-divider p-3">
        <div className="flex items-center gap-2 text-[13.5px] text-foreground">
          <ListChecks className="size-4 text-muted-foreground" /> Practice test
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">Cellar writes the questions, the answers and the worked solutions, so they are always right.</p>
        <div className="mt-2 flex flex-col gap-2">
          <Field label="Topic" stacked>
            <Select value={topic} onChange={(value) => setTopic(value as QuizTopic)} options={(Object.keys(QUIZ_TOPICS) as QuizTopic[]).map((key) => ({ value: key, label: key.replace('-', ' ') }))} />
          </Field>
          <div className="flex gap-2">
            <Field label="Questions" stacked className="flex-1">
              <Input className="h-8" type="number" min={1} max={20} value={count} onChange={(event) => setCount(Math.min(20, Math.max(1, Number(event.target.value) || 5)))} />
            </Field>
            <Field label="Level" stacked className="flex-1">
              <Select
                value={difficulty}
                onChange={(value) => setDifficulty(value as QuizDifficulty)}
                options={[
                  { value: 'easy', label: 'Easy' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'hard', label: 'Hard' },
                ]}
              />
            </Field>
          </div>
          <Field label="Multiple choice" description="Pick instead of typing">
            <Switch checked={choices} onCheckedChange={setChoices} label="Multiple choice" />
          </Field>
          <Button
            variant="primary"
            onClick={() => {
              const quiz = generateQuiz({ topic, count, difficulty, choices, seed: Date.now() });
              addBlock({ type: 'quiz', title: quiz.title, instructions: quiz.instructions, questions: quiz.questions }, { after });
            }}
            data-testid="make-test"
          >
            <Plus className="size-3.5" /> Make the test
          </Button>
        </div>
      </div>
    </div>
  );
}

const FIGURE_KINDS: FigureKind[] = ['triangle', 'right-triangle', 'square', 'rectangle', 'circle', 'polygon', 'angle', 'segment'];

function PropertiesTab() {
  const board = useMathEditor((s) => s.board);
  const block = useMathEditor(selectedBlock);
  if (!board) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
      {block?.type === 'figure' && (
        <div className="flex flex-col gap-2">
          <div className="text-[11.5px] tracking-[0.06em] text-muted-foreground uppercase">Figure {block.id}</div>
          <Field label="Shape" stacked>
            <Select value={block.figure.kind} onChange={(value) => updateBlock(block.id, (b) => void (b.type === 'figure' && (b.figure = { ...b.figure, kind: value as FigureKind })))} options={FIGURE_KINDS.map((kind) => ({ value: kind, label: kind.replace('-', ' ') }))} />
          </Field>
          <Field label="Vertex labels" description="Comma separated" stacked>
            <Input
              className="h-8"
              value={(block.figure.labels ?? []).join(', ')}
              placeholder="A, B, C"
              onChange={(event) =>
                updateBlock(block.id, (b) => {
                  if (b.type === 'figure') b.figure = { ...b.figure, labels: event.target.value.split(',').map((label) => label.trim()).filter(Boolean) };
                })
              }
            />
          </Field>
          <Field label="Sides" description="Numbers, roots (√3) or letters, comma separated" stacked>
            <Input
              className="h-8"
              value={(block.figure.sides ?? []).join(', ')}
              placeholder="3, 4"
              onChange={(event) =>
                updateBlock(block.id, (b) => {
                  if (b.type === 'figure') b.figure = { ...b.figure, sides: event.target.value.split(',').map((side) => side.trim()).filter(Boolean) };
                })
              }
            />
          </Field>
          {(block.figure.kind === 'circle' || block.figure.kind === 'angle') && (
            <Field label={block.figure.kind === 'circle' ? 'Radius' : 'Angle'} stacked>
              <Input
                className="h-8"
                value={String((block.figure.kind === 'circle' ? block.figure.radius : block.figure.degrees) ?? '')}
                onChange={(event) =>
                  updateBlock(block.id, (b) => {
                    if (b.type !== 'figure') return;
                    b.figure = b.figure.kind === 'circle' ? { ...b.figure, radius: event.target.value } : { ...b.figure, degrees: event.target.value };
                  })
                }
              />
            </Field>
          )}
          <Field label="Right angle at" description="A vertex label, or empty for none" stacked>
            <Input
              className="h-8"
              value={String(block.figure.rightAngleAt ?? '')}
              placeholder="B"
              onChange={(event) =>
                updateBlock(block.id, (b) => {
                  if (b.type === 'figure') b.figure = { ...b.figure, rightAngleAt: event.target.value || undefined };
                })
              }
            />
          </Field>
          <Field label="Squared paper">
            <Switch checked={!!block.figure.grid} onCheckedChange={(value) => updateBlock(block.id, (b) => void (b.type === 'figure' && (b.figure = { ...b.figure, grid: value })))} label="Squared paper" />
          </Field>
          <Field label="Filled">
            <Switch checked={!!block.figure.fill} onCheckedChange={(value) => updateBlock(block.id, (b) => void (b.type === 'figure' && (b.figure = { ...b.figure, fill: value })))} label="Filled" />
          </Field>
          <Field label="Size" stacked>
            <Input
              className="h-8"
              type="number"
              min={140}
              max={560}
              value={block.figure.size ?? 260}
              onChange={(event) => updateBlock(block.id, (b) => void (b.type === 'figure' && (b.figure = { ...b.figure, size: Math.min(560, Math.max(140, Number(event.target.value) || 260)) })))}
            />
          </Field>
          <Field label="Caption" stacked>
            <Input className="h-8" value={block.caption ?? ''} onChange={(event) => updateBlock(block.id, (b) => void (b.type === 'figure' && (b.caption = event.target.value)))} />
          </Field>
        </div>
      )}

      {block?.type === 'plot' && (
        <div className="flex flex-col gap-2">
          <div className="text-[11.5px] tracking-[0.06em] text-muted-foreground uppercase">Graph {block.id}</div>
          <Field label="Functions of x" description="One per line" stacked>
            <Input
              className="h-8"
              value={(block.plot.functions ?? []).map((fn) => fn.expr).join(', ')}
              placeholder="x^2 - 2, sin(x)"
              onChange={(event) =>
                updateBlock(block.id, (b) => {
                  if (b.type === 'plot') b.plot = { ...b.plot, functions: event.target.value.split(',').map((expr) => ({ expr: expr.trim() })).filter((fn) => fn.expr) };
                })
              }
            />
          </Field>
          <div className="flex gap-2">
            {(['xMin', 'xMax'] as const).map((key) => (
              <Field key={key} label={key === 'xMin' ? 'x from' : 'x to'} stacked className="flex-1">
                <Input
                  className="h-8"
                  type="number"
                  value={block.plot[key] ?? (key === 'xMin' ? -10 : 10)}
                  onChange={(event) =>
                    updateBlock(block.id, (b) => {
                      if (b.type === 'plot') b.plot = { ...b.plot, [key]: Number(event.target.value) };
                    })
                  }
                />
              </Field>
            ))}
          </div>
        </div>
      )}

      {block?.type === 'quiz' && (
        <div className="flex flex-col gap-2">
          <div className="text-[11.5px] tracking-[0.06em] text-muted-foreground uppercase">Test {block.id}</div>
          <div className="text-[12.5px] text-muted-foreground">
            {block.questions.length} questions · {block.questions.filter((question) => question.userAnswer).length} answered
          </div>
          <Button size="sm" variant="secondary" onClick={() => resetQuiz(block.id)}>
            Clear my answers
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-divider pt-3">
        <div className="text-[11.5px] tracking-[0.06em] text-muted-foreground uppercase">Board</div>
        <Field label="Topic" description="What this board covers" stacked>
          <Input className="h-8" value={board.topic} placeholder="Right triangles" onChange={(event) => setBoardMeta({ topic: event.target.value })} />
        </Field>
        <Field label="Paper" stacked>
          <Select
            value={board.paper}
            onChange={(value) => setBoardMeta({ paper: value as MathPaper })}
            options={[
              { value: 'grid', label: 'Squared' },
              { value: 'dots', label: 'Dotted' },
              { value: 'lined', label: 'Lined' },
              { value: 'plain', label: 'Plain' },
            ]}
          />
        </Field>
        <Field label="Angles" stacked>
          <Segmented
            value={board.angleMode}
            onChange={(value) => setBoardMeta({ angleMode: value as MathAngleMode })}
            options={[
              { value: 'deg', label: 'Degrees' },
              { value: 'rad', label: 'Radians' },
            ]}
          />
        </Field>
      </div>
    </div>
  );
}

const TABS: Array<{ value: PanelTab; label: string; icon: typeof CalculatorIcon }> = [
  { value: 'calculator', label: 'Calculator', icon: CalculatorIcon },
  { value: 'insert', label: 'Insert', icon: Plus },
  { value: 'properties', label: 'Properties', icon: Grid3x3 },
];

export function MathPanel() {
  const { panelTab, setPanelTab } = useMathLayout();
  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-divider bg-sidebar" data-testid="math-panel">
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-divider px-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setPanelTab(tab.value)}
            className={cn('flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] transition-colors', panelTab === tab.value ? 'bg-selected text-foreground' : 'text-fg-2 hover:bg-hover hover:text-foreground')}
            data-testid={`tab-${tab.value}`}
          >
            <tab.icon className="size-3.5" />
            {tab.label}
          </button>
        ))}
      </div>
      {panelTab === 'calculator' ? <Calculator /> : panelTab === 'insert' ? <InsertTab /> : <PropertiesTab />}
    </aside>
  );
}
