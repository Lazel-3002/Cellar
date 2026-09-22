/**
 * Turns what a model writes into board blocks. Small models spell things their own way, so every
 * field has aliases, types are guessed from the words used, and a block that cannot be read comes
 * back as an error the model can act on instead of a crash.
 */
import { normalizeDiagram, normalizeElement } from './diagram-normalize';
import { diagramStepCount } from './diagram';
import { lineStyleOf, opacityOf } from './linestyle';
import { mathToPlain } from './mathtext';
import type {
  DerivationStep,
  FigureKind,
  FigureSpec,
  MathAngleMode,
  MathBlock,
  MathBlockType,
  MathBoard,
  MathPaper,
  PlotSpec,
  QuizQuestion,
  SketchStroke,
} from '../types/math';

export const LIMITS = {
  blocks: 200,
  steps: 60,
  questions: 40,
  choices: 8,
  where: 12,
  rows: 80,
  columns: 12,
  strokes: 4000,
  strokePoints: 8000,
  text: 12_000,
  math: 600,
};

const PAPERS: MathPaper[] = ['grid', 'dots', 'lined', 'plain'];
const FIGURE_KINDS: FigureKind[] = ['triangle', 'right-triangle', 'square', 'rectangle', 'circle', 'polygon', 'angle', 'segment'];

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose => !!value && typeof value === 'object' && !Array.isArray(value);

function pickString(source: Loose, keys: string[], max = LIMITS.text): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, max);
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function pickArray(source: Loose, keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return undefined;
}

const stringList = (values: unknown[] | undefined, max: number, itemMax = 400): string[] =>
  (values ?? [])
    .slice(0, max)
    .map((value) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''))
    .map((value) => value.trim().slice(0, itemMax))
    .filter(Boolean);

const TYPE_WORDS: Array<[RegExp, MathBlockType]> = [
  [/^(derivation|steps?|solution|working|solve|derive)$/i, 'derivation'],
  [/^(formula|equation|identity|theorem|rule|definition)$/i, 'formula'],
  [/^(diagram|construction|board.?drawing|scene|step.?by.?step|unit.?circle|trig(onometric)?.?circle|coordinate.?drawing)$/i, 'diagram'],
  [/^(figure|shape|drawing|geometry|triangle|right.?triangle|square|rectangle|circle|polygon|angle|segment)$/i, 'figure'],
  [/^(plot|graph|chart|function|curve)$/i, 'plot'],
  [/^(table|values|grid)$/i, 'table'],
  [/^(quiz|test|exam|questions?|exercises?|practice|problems?)$/i, 'quiz'],
  [/^(sketch|whiteboard|canvas|draw|board)$/i, 'sketch'],
  [/^(text|note|paragraph|markdown|explanation|summary|prose|tip|warning|intro|introduction|definition|concept)$/i, 'text'],
];

/** The block type, from an explicit `type` or from the fields that are present. */
function blockType(input: Loose): MathBlockType | null {
  const raw = pickString(input, ['type', 'kind', 'block', 'blockType'], 40);
  if (raw) {
    const word = raw.trim();
    for (const [pattern, type] of TYPE_WORDS) {
      if (!pattern.test(word)) continue;
      // "diagram" with a figure spec inside is the labelled geometry figure.
      if (type === 'diagram' && isObject(input.figure) && !isObject(input.diagram) && !Array.isArray(input.elements)) return 'figure';
      return type;
    }
    // An unknown word ("block", "section"): fall through and guess from the fields instead of refusing.
  }
  if (isObject(input.diagram) || Array.isArray(input.elements) || pickString(input, ['preset'], 40)) return 'diagram';
  if (Array.isArray(input.steps) && input.steps.some((step) => isObject(step) && (Array.isArray(step.draw) || Array.isArray(step.elements)))) return 'diagram';
  if (isObject(input.figure) || pickString(input, ['figureKind'], 40)) return 'figure';
  if (isObject(input.plot) || Array.isArray(input.functions)) return 'plot';
  if (Array.isArray(input.steps)) return 'derivation';
  if (Array.isArray(input.questions)) return 'quiz';
  if (Array.isArray(input.rows) || Array.isArray(input.columns)) return 'table';
  if (Array.isArray(input.strokes)) return 'sketch';
  if (pickString(input, ['formula', 'equation', 'math', 'latex'], LIMITS.math)) return 'formula';
  if (pickString(input, ['body', 'text', 'content', 'markdown', 'explanation', 'summary', 'description'], LIMITS.text)) return 'text';
  if (pickString(input, ['heading', 'title'], 200)) return 'text';
  return null;
}

function figureKindOf(input: Loose, fallbackWord?: string): FigureKind {
  const raw = (pickString(input, ['kind', 'shape', 'figureKind', 'type'], 40) ?? fallbackWord ?? 'triangle').toLowerCase().replace(/[\s_]+/g, '-');
  const match = FIGURE_KINDS.find((kind) => kind === raw);
  if (match) return match;
  if (/right/.test(raw) && /triangle/.test(raw)) return 'right-triangle';
  if (/triangle/.test(raw)) return 'triangle';
  if (/square/.test(raw)) return 'square';
  if (/rect/.test(raw)) return 'rectangle';
  if (/circ|disc/.test(raw)) return 'circle';
  if (/poly|pentagon|hexagon/.test(raw)) return 'polygon';
  if (/angle/.test(raw)) return 'angle';
  if (/segment|line/.test(raw)) return 'segment';
  return 'triangle';
}

const measureList = (values: unknown[] | undefined, max = 12): Array<number | string> =>
  (values ?? [])
    .slice(0, max)
    .map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' ? value.trim().slice(0, 40) : ''))
    .filter((value) => value !== '');

export function normalizeFigure(input: unknown, fallbackWord?: string): FigureSpec {
  const source = isObject(input) ? input : {};
  const nested = isObject(source.figure) ? source.figure : source;
  const kind = figureKindOf(nested, fallbackWord ?? (isObject(source) ? pickString(source, ['type'], 40) : undefined));
  const spec: FigureSpec = { kind };
  const labels = stringList(pickArray(nested, ['labels', 'vertices', 'names', 'points_labels']), 12, 8);
  if (labels.length) spec.labels = labels;
  const sides = measureList(pickArray(nested, ['sides', 'lengths', 'edges']));
  if (sides.length) spec.sides = sides;
  const legs = measureList(pickArray(nested, ['legs']));
  const hypotenuse = nested.hypotenuse ?? nested.hyp;
  if (!sides.length && legs.length) {
    spec.sides = [legs[0], legs[1] ?? legs[0], typeof hypotenuse === 'number' || typeof hypotenuse === 'string' ? hypotenuse : ''].filter((value) => value !== '');
    spec.rightAngleAt = spec.rightAngleAt ?? 1;
  }
  const angles = measureList(pickArray(nested, ['angles']));
  if (angles.length) spec.angles = angles;
  const right = nested.rightAngleAt ?? nested.right_angle_at ?? nested.rightAngle ?? nested.right_angle;
  if (typeof right === 'number' || typeof right === 'string') spec.rightAngleAt = right;
  if (kind === 'right-triangle' && spec.rightAngleAt === undefined) spec.rightAngleAt = 1;
  for (const key of ['radius', 'width', 'height', 'degrees'] as const) {
    const value = nested[key] ?? nested[`${key}s`];
    if (typeof value === 'number' || typeof value === 'string') spec[key] = value as never;
  }
  const corners = Number(nested.corners ?? nested.n ?? nested.count);
  if (Number.isFinite(corners) && corners >= 3) spec.corners = Math.min(12, Math.round(corners));
  const points = pickArray(nested, ['points', 'coordinates']);
  if (points?.length) {
    const cleaned = points
      .slice(0, 12)
      .map((point) => {
        if (Array.isArray(point) && point.length >= 2) return { x: Number(point[0]), y: Number(point[1]) };
        if (isObject(point)) return { x: Number(point.x), y: Number(point.y), label: typeof point.label === 'string' ? point.label.slice(0, 8) : undefined };
        return null;
      })
      .filter((point): point is { x: number; y: number; label?: string } => !!point && Number.isFinite(point.x) && Number.isFinite(point.y));
    if (cleaned.length >= 3) spec.points = cleaned;
  }
  const marks = pickArray(nested, ['marks', 'segments', 'extras']);
  if (marks?.length) {
    const cleaned = marks
      .slice(0, 8)
      .map((mark) => {
        if (!isObject(mark)) return null;
        const from = mark.from ?? mark.a ?? mark.start;
        const to = mark.to ?? mark.b ?? mark.end;
        if ((typeof from !== 'number' && typeof from !== 'string') || (typeof to !== 'number' && typeof to !== 'string')) return null;
        return { from, to, label: typeof mark.label === 'string' ? mark.label.slice(0, 40) : undefined, dashed: mark.dashed === true };
      })
      .filter((mark): mark is NonNullable<typeof mark> => !!mark);
    if (cleaned.length) spec.marks = cleaned;
  }
  if (nested.fill === true) spec.fill = true;
  if (nested.grid === true) spec.grid = true;
  const size = Number(nested.size ?? nested.scale);
  if (Number.isFinite(size) && size > 0) spec.size = Math.min(560, Math.max(140, Math.round(size)));
  return spec;
}

export function normalizePlot(input: unknown): PlotSpec {
  const source = isObject(input) ? input : {};
  const nested = isObject(source.plot) ? source.plot : source;
  const spec: PlotSpec = {};
  const functions = pickArray(nested, ['functions', 'curves', 'series', 'equations', 'expressions']);
  const fromStrings = typeof nested.expr === 'string' || typeof nested.function === 'string' || typeof nested.equation === 'string';
  const entries: PlotSpec['functions'] = [];
  for (const entry of functions ?? []) {
    if (typeof entry === 'string') entries.push({ expr: entry.slice(0, 200) });
    else if (isObject(entry)) {
      const expr = pickString(entry, ['expr', 'expression', 'function', 'equation', 'y', 'formula'], 200);
      if (expr) entries.push({ expr, label: pickString(entry, ['label', 'name', 'title'], 40), color: pickString(entry, ['color'], 20) });
    }
  }
  if (fromStrings) {
    const expr = pickString(nested, ['expr', 'function', 'equation', 'y'], 200);
    if (expr) entries.push({ expr });
  }
  if (entries.length) spec.functions = entries.slice(0, 5);
  const points = pickArray(nested, ['points', 'markers']);
  if (points?.length) {
    spec.points = points
      .slice(0, 40)
      .map((point) => {
        if (Array.isArray(point) && point.length >= 2) return { x: Number(point[0]), y: Number(point[1]) };
        if (isObject(point)) return { x: Number(point.x), y: Number(point.y), label: typeof point.label === 'string' ? point.label.slice(0, 40) : undefined };
        return null;
      })
      .filter((point): point is { x: number; y: number; label?: string } => !!point && Number.isFinite(point.x) && Number.isFinite(point.y));
  }
  const range = isObject(nested.range) ? nested.range : nested;
  for (const [key, aliases] of [
    ['xMin', ['xMin', 'x_min', 'from', 'min']],
    ['xMax', ['xMax', 'x_max', 'to', 'max']],
    ['yMin', ['yMin', 'y_min']],
    ['yMax', ['yMax', 'y_max']],
  ] as const) {
    for (const alias of aliases) {
      const value = Number((range as Loose)[alias]);
      if (Number.isFinite(value)) {
        spec[key] = value;
        break;
      }
    }
  }
  const xLabel = pickString(nested, ['xLabel', 'x_label', 'xAxis'], 40);
  const yLabel = pickString(nested, ['yLabel', 'y_label', 'yAxis'], 40);
  if (xLabel) spec.xLabel = xLabel;
  if (yLabel) spec.yLabel = yLabel;
  if (nested.grid === false) spec.grid = false;
  const width = Number(nested.width);
  const height = Number(nested.height);
  if (Number.isFinite(width)) spec.width = Math.min(900, Math.max(240, Math.round(width)));
  if (Number.isFinite(height)) spec.height = Math.min(700, Math.max(180, Math.round(height)));
  if (nested.angle === 'rad' || nested.angle === 'deg') spec.angle = nested.angle;
  return spec;
}

function normalizeSteps(values: unknown[] | undefined): DerivationStep[] {
  return (values ?? [])
    .slice(0, LIMITS.steps)
    .map((value) => {
      if (typeof value === 'string') {
        const text = value.trim();
        if (!text) return null;
        // "a^2 = 4 - 3  // move the 3 across" and "a^2 = 1 (because …)"
        const split = /^(.*?)\s*(?:\/\/|—\s|--\s)\s*(.+)$/.exec(text);
        if (split) return { math: split[1].trim().slice(0, LIMITS.math), reason: split[2].trim().slice(0, 300) };
        return { math: text.slice(0, LIMITS.math) };
      }
      if (Array.isArray(value)) {
        const [math, reason] = value;
        return typeof math === 'string' && math.trim() ? { math: math.trim().slice(0, LIMITS.math), reason: typeof reason === 'string' ? reason.trim().slice(0, 300) : undefined } : null;
      }
      if (isObject(value)) {
        const math = pickString(value, ['math', 'step', 'expression', 'latex', 'line', 'equation', 'text'], LIMITS.math);
        if (!math) return null;
        return { math, reason: pickString(value, ['reason', 'why', 'explanation', 'note', 'justification', 'comment'], 300) };
      }
      return null;
    })
    .filter((step): step is DerivationStep => !!step);
}

function normalizeQuestions(values: unknown[] | undefined): QuizQuestion[] {
  return (values ?? [])
    .slice(0, LIMITS.questions)
    .map((value, index) => {
      if (typeof value === 'string') {
        const text = value.trim();
        return text ? { id: `q${index + 1}`, prompt: text.slice(0, 2000), answer: '' } : null;
      }
      if (!isObject(value)) return null;
      const prompt = pickString(value, ['prompt', 'question', 'q', 'text', 'ask'], 2000);
      if (!prompt) return null;
      const answer = pickString(value, ['answer', 'a', 'solution', 'result', 'correct'], 600) ?? '';
      const choices = stringList(pickArray(value, ['choices', 'options', 'alternatives']), LIMITS.choices, 300);
      const steps = stringList(pickArray(value, ['steps', 'solutionSteps', 'working', 'explanation']), LIMITS.steps, LIMITS.math);
      const points = Number(value.points ?? value.mark ?? value.marks);
      const figure = isObject(value.figure) || isObject(value.triangle) ? normalizeFigure(value.figure ?? value.triangle) : undefined;
      const id = pickString(value, ['id'], 20) ?? `q${index + 1}`;
      return {
        id,
        prompt,
        answer,
        ...(choices.length > 1 ? { choices } : {}),
        ...(steps.length ? { steps } : {}),
        ...(figure ? { figure } : {}),
        points: Number.isFinite(points) && points > 0 ? Math.min(100, Math.round(points)) : 1,
        ...(typeof value.userAnswer === 'string' ? { userAnswer: value.userAnswer.slice(0, 600) } : {}),
        ...(value.revealed === true ? { revealed: true } : {}),
      } satisfies QuizQuestion;
    })
    .filter((question): question is QuizQuestion => !!question);
}

function normalizeStrokes(values: unknown[] | undefined): SketchStroke[] {
  return (values ?? [])
    .slice(0, LIMITS.strokes)
    .map((value): SketchStroke | null => {
      if (!isObject(value)) return null;
      const rawPoints = Array.isArray(value.points) ? value.points : [];
      const points: number[] = [];
      for (const point of rawPoints) {
        if (typeof point === 'number' && Number.isFinite(point)) points.push(Math.round(point * 10) / 10);
        else if (Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))) {
          points.push(Math.round(Number(point[0]) * 10) / 10, Math.round(Number(point[1]) * 10) / 10);
        } else if (isObject(point) && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) {
          points.push(Math.round(Number(point.x) * 10) / 10, Math.round(Number(point.y) * 10) / 10);
        }
        if (points.length >= LIMITS.strokePoints) break;
      }
      const tool = String(value.tool ?? 'pen');
      const text = tool === 'text' && typeof value.text === 'string' ? value.text.trim().slice(0, 200) : '';
      if (tool === 'text' ? !text || points.length < 2 : points.length < 4) return null;
      const color = typeof value.color === 'string' && /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/.test(value.color) ? value.color : 'currentColor';
      const width = Number(value.width);
      const line = lineStyleOf(value.line);
      const opacity = opacityOf(value.opacity);
      return {
        tool: (['pen', 'line', 'rect', 'ellipse', 'triangle', 'arrow', 'text'] as const).includes(tool as SketchStroke['tool']) ? (tool as SketchStroke['tool']) : 'pen',
        color,
        width: Number.isFinite(width) ? Math.min(24, Math.max(1, width)) : 2,
        points: tool === 'text' ? points.slice(0, 2) : points,
        ...(line && line !== 'solid' ? { line } : {}),
        ...(opacity !== undefined && opacity < 1 ? { opacity } : {}),
        ...(text ? { text } : {}),
      } satisfies SketchStroke;
    })
    .filter((stroke): stroke is SketchStroke => !!stroke);
}

export function nextBlockId(used: Set<string>): string {
  for (let i = 1; i < 10_000; i++) {
    const id = `b${i}`;
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
  const fallback = `b${Date.now().toString(36)}`;
  used.add(fallback);
  return fallback;
}

export const blockIds = (board: Pick<MathBoard, 'blocks'>): Set<string> => new Set(board.blocks.map((block) => block.id));

export interface NormalizeResult {
  block?: MathBlock;
  error?: string;
  /** Things worth telling the model (values a preset worked out, parts that could not be read). */
  notes?: string[];
}

/** One block from loose model input. */
export function normalizeBlock(input: unknown, ids: Set<string>): NormalizeResult {
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return { error: 'the block is empty' };
    return { block: { id: nextBlockId(ids), type: 'text', body: text.slice(0, LIMITS.text) } };
  }
  if (!isObject(input)) return { error: 'a block has to be an object with a "type"' };
  const type = blockType(input);
  if (!type) {
    return {
      error:
        'I could not tell what kind of block this is. Use type: text (with body), formula (with formula), derivation (with steps), figure, plot, table, quiz (with questions), sketch or diagram (with steps that each say and draw something).',
    };
  }
  const wanted = pickString(input, ['id'], 20);
  const id = wanted && !ids.has(wanted) ? (ids.add(wanted), wanted) : nextBlockId(ids);
  const note = pickString(input, ['note', 'footnote', 'caption'], 400);
  const base = { id, ...(note && type !== 'figure' && type !== 'plot' && type !== 'diagram' ? { note } : {}) };

  switch (type) {
    case 'text': {
      const body = pickString(input, ['body', 'text', 'content', 'markdown', 'explanation', 'summary', 'description'], LIMITS.text);
      const heading = pickString(input, ['heading', 'title'], 200);
      if (!body && !heading) return { error: 'a text block needs a body' };
      const toneWord = (pickString(input, ['tone', 'style', 'variant', 'type'], 20) ?? '').toLowerCase();
      const tone = toneWord === 'note' || toneWord === 'tip' || toneWord === 'warning' ? (toneWord as 'note' | 'tip' | 'warning') : undefined;
      return { block: { ...base, type: 'text', body: body ?? '', ...(heading ? { heading } : {}), ...(tone ? { tone } : {}) } };
    }
    case 'formula': {
      const formula = pickString(input, ['formula', 'equation', 'math', 'latex', 'expression', 'body', 'content'], LIMITS.math);
      if (!formula) return { error: 'a formula block needs a formula' };
      const where = stringList(pickArray(input, ['where', 'legend', 'definitions', 'meanings']), LIMITS.where, 200);
      return { block: { ...base, type: 'formula', formula, ...(pickString(input, ['title', 'name'], 200) ? { title: pickString(input, ['title', 'name'], 200) } : {}), ...(where.length ? { where } : {}) } };
    }
    case 'derivation': {
      const steps = normalizeSteps(pickArray(input, ['steps', 'lines', 'derivation', 'working', 'solution']));
      if (!steps.length) return { error: 'a derivation needs steps, each with a "math" line' };
      const result = pickString(input, ['result', 'answer', 'conclusion'], LIMITS.math);
      return { block: { ...base, type: 'derivation', steps, ...(pickString(input, ['title', 'name'], 200) ? { title: pickString(input, ['title', 'name'], 200) } : {}), ...(result ? { result } : {}) } };
    }
    case 'figure': {
      const figure = normalizeFigure(input, pickString(input, ['type'], 40));
      const caption = pickString(input, ['caption', 'note'], 400);
      return { block: { ...base, type: 'figure', figure, ...(pickString(input, ['title', 'name'], 200) ? { title: pickString(input, ['title', 'name'], 200) } : {}), ...(caption ? { caption } : {}) } };
    }
    case 'plot': {
      const plot = normalizePlot(input);
      if (!plot.functions?.length && !plot.points?.length) return { error: 'a plot needs at least one function, e.g. functions: ["x^2 - 2"]' };
      const caption = pickString(input, ['caption', 'note'], 400);
      return { block: { ...base, type: 'plot', plot, ...(pickString(input, ['title', 'name'], 200) ? { title: pickString(input, ['title', 'name'], 200) } : {}), ...(caption ? { caption } : {}) } };
    }
    case 'table': {
      const rawRows = pickArray(input, ['rows', 'data', 'values']) ?? [];
      let columns = stringList(pickArray(input, ['columns', 'headers', 'header', 'cols']), LIMITS.columns, 120);
      const rows: string[][] = [];
      for (const row of rawRows.slice(0, LIMITS.rows)) {
        if (Array.isArray(row)) {
          rows.push(stringList(row, LIMITS.columns, 200));
        } else if (isObject(row)) {
          if (!columns.length) columns = Object.keys(row).slice(0, LIMITS.columns);
          rows.push(columns.map((column) => {
            const value = row[column];
            return typeof value === 'string' ? value.slice(0, 200) : typeof value === 'number' ? String(value) : '';
          }));
        }
      }
      if (!rows.length) return { error: 'a table needs rows' };
      if (!columns.length) columns = rows[0].map((_, index) => `Column ${index + 1}`);
      return { block: { ...base, type: 'table', columns, rows, ...(pickString(input, ['title', 'name'], 200) ? { title: pickString(input, ['title', 'name'], 200) } : {}), ...(input.math === false ? {} : { math: true }) } };
    }
    case 'quiz': {
      const questions = normalizeQuestions(pickArray(input, ['questions', 'items', 'problems', 'exercises']));
      if (!questions.length) return { error: 'a quiz needs questions, each with a prompt and an answer' };
      return {
        block: {
          ...base,
          type: 'quiz',
          questions,
          ...(pickString(input, ['title', 'name'], 200) ? { title: pickString(input, ['title', 'name'], 200) } : {}),
          ...(pickString(input, ['instructions', 'intro'], 600) ? { instructions: pickString(input, ['instructions', 'intro'], 600) } : {}),
        },
      };
    }
    case 'sketch': {
      const height = Number(input.height ?? input.h);
      const paper = (pickString(input, ['paper', 'background'], 20) ?? '') as MathPaper;
      return {
        block: {
          ...base,
          type: 'sketch',
          height: Number.isFinite(height) ? Math.min(1200, Math.max(120, Math.round(height))) : 360,
          strokes: normalizeStrokes(pickArray(input, ['strokes', 'lines', 'paths'])),
          ...(PAPERS.includes(paper) ? { paper } : {}),
          ...(pickString(input, ['title', 'name'], 200) ? { title: pickString(input, ['title', 'name'], 200) } : {}),
        },
      };
    }
    case 'diagram': {
      const { diagram, notes, error } = normalizeDiagram(input);
      if (!diagram) return { error: error ?? 'I could not read that diagram.' };
      const title = pickString(input, ['title', 'heading'], 200);
      const caption = pickString(input, ['caption'], 400);
      return {
        block: { ...base, type: 'diagram', diagram, ...(title ? { title } : {}), ...(caption ? { caption } : {}), ...(note && note !== caption ? { note } : {}) },
        notes,
      };
    }
  }
}

/** Fields a model may change on an existing block; anything it leaves out stays as it is. */
export function patchBlock(block: MathBlock, patch: unknown): { block: MathBlock; changed: string[] } {
  if (!isObject(patch)) return { block, changed: [] };
  const changed: string[] = [];
  const next = structuredClone(block) as MathBlock;
  const note = pickString(patch, ['note'], 400);
  if (note !== undefined) {
    next.note = note;
    changed.push('note');
  }
  const title = pickString(patch, ['title', 'heading', 'name'], 200);
  if (title !== undefined && next.type !== 'text') {
    if ('title' in next) {
      (next as { title?: string }).title = title;
      changed.push('title');
    }
  }
  switch (next.type) {
    case 'text': {
      const body = pickString(patch, ['body', 'text', 'content'], LIMITS.text);
      if (body !== undefined) {
        next.body = body;
        changed.push('body');
      }
      if (title !== undefined) {
        next.heading = title;
        changed.push('heading');
      }
      const tone = (pickString(patch, ['tone'], 20) ?? '').toLowerCase();
      if (tone === 'note' || tone === 'tip' || tone === 'warning' || tone === 'plain') {
        next.tone = tone === 'plain' ? undefined : (tone as 'note' | 'tip' | 'warning');
        changed.push('tone');
      }
      break;
    }
    case 'formula': {
      const formula = pickString(patch, ['formula', 'equation', 'math', 'latex'], LIMITS.math);
      if (formula !== undefined) {
        next.formula = formula;
        changed.push('formula');
      }
      const where = pickArray(patch, ['where', 'legend']);
      if (where) {
        next.where = stringList(where, LIMITS.where, 200);
        changed.push('where');
      }
      break;
    }
    case 'derivation': {
      const steps = pickArray(patch, ['steps', 'lines']);
      if (steps) {
        const normalized = normalizeSteps(steps);
        if (normalized.length) {
          next.steps = normalized;
          changed.push('steps');
        }
      }
      const append = pickArray(patch, ['addSteps', 'appendSteps', 'moreSteps']);
      if (append) {
        next.steps = [...next.steps, ...normalizeSteps(append)].slice(0, LIMITS.steps);
        changed.push('steps');
      }
      const result = pickString(patch, ['result', 'answer'], LIMITS.math);
      if (result !== undefined) {
        next.result = result;
        changed.push('result');
      }
      break;
    }
    case 'figure': {
      if (isObject(patch.figure) || pickString(patch, ['kind', 'shape'], 40) || Array.isArray(patch.sides) || Array.isArray(patch.labels)) {
        next.figure = normalizeFigure({ ...next.figure, ...(isObject(patch.figure) ? patch.figure : patch) });
        changed.push('figure');
      }
      const caption = pickString(patch, ['caption'], 400);
      if (caption !== undefined) {
        next.caption = caption;
        changed.push('caption');
      }
      break;
    }
    case 'plot': {
      if (isObject(patch.plot) || Array.isArray(patch.functions) || patch.xMin !== undefined || patch.xMax !== undefined) {
        next.plot = normalizePlot({ ...next.plot, ...(isObject(patch.plot) ? patch.plot : patch) });
        changed.push('plot');
      }
      break;
    }
    case 'table': {
      const columns = pickArray(patch, ['columns', 'headers']);
      if (columns) {
        next.columns = stringList(columns, LIMITS.columns, 120);
        changed.push('columns');
      }
      const rows = pickArray(patch, ['rows', 'data']);
      if (rows) {
        const cleaned = rows.slice(0, LIMITS.rows).map((row) => (Array.isArray(row) ? stringList(row, LIMITS.columns, 200) : []));
        if (cleaned.length) {
          next.rows = cleaned;
          changed.push('rows');
        }
      }
      break;
    }
    case 'quiz': {
      const questions = pickArray(patch, ['questions', 'items']);
      if (questions) {
        const normalized = normalizeQuestions(questions);
        if (normalized.length) {
          next.questions = normalized;
          changed.push('questions');
        }
      }
      const instructions = pickString(patch, ['instructions'], 600);
      if (instructions !== undefined) {
        next.instructions = instructions;
        changed.push('instructions');
      }
      break;
    }
    case 'sketch': {
      const height = Number(patch.height);
      if (Number.isFinite(height)) {
        next.height = Math.min(1200, Math.max(120, Math.round(height)));
        changed.push('height');
      }
      const strokes = pickArray(patch, ['strokes']);
      if (strokes) {
        next.strokes = normalizeStrokes(strokes);
        changed.push('strokes');
      }
      break;
    }
    case 'diagram': {
      // A whole new drawing.
      if (isObject(patch.diagram) || Array.isArray(patch.elements) || pickString(patch, ['preset'], 40) || (Array.isArray(patch.steps) && patch.steps.some((step) => isObject(step) && Array.isArray(step.draw)))) {
        const { diagram } = normalizeDiagram({ ...(isObject(patch.diagram) ? patch.diagram : patch) });
        if (diagram) {
          next.diagram = diagram;
          changed.push('diagram');
        }
      }
      // More steps drawn on top of what is there, while the explanation goes on.
      const append = pickArray(patch, ['addSteps', 'moreSteps', 'nextSteps']);
      if (append?.length) {
        const { diagram } = normalizeDiagram({ steps: append });
        if (diagram) {
          const offset = diagramStepCount(next.diagram);
          const steps = [...(next.diagram.steps ?? Array.from({ length: offset }, () => ({ text: '' })))];
          while (steps.length < offset) steps.push({ text: '' });
          steps.push(...(diagram.steps ?? Array.from({ length: diagramStepCount(diagram) }, () => ({ text: '' }))));
          next.diagram = {
            ...next.diagram,
            elements: [...next.diagram.elements, ...diagram.elements.map((element) => ({ ...element, step: (element.step ?? 1) + offset }))].slice(0, 300),
            steps: steps.slice(0, 80),
          };
          changed.push('steps');
        }
      }
      const extra = pickArray(patch, ['addElements', 'draw']);
      if (extra?.length) {
        const last = Math.max(1, diagramStepCount(next.diagram));
        const elements = extra.map((item) => normalizeElement(item, last)).filter((element): element is NonNullable<typeof element> => !!element);
        if (elements.length) {
          next.diagram = { ...next.diagram, elements: [...next.diagram.elements, ...elements].slice(0, 300) };
          changed.push('elements');
        }
      }
      const caption = pickString(patch, ['caption'], 400);
      if (caption !== undefined) {
        next.caption = caption;
        changed.push('caption');
      }
      break;
    }
  }
  return { block: next, changed };
}

/** A board coming back from the editor, checked field by field before it is stored. */
export function normalizeBoard(input: MathBoard, base: { id: string; conversationId: string; createdAt: number }): MathBoard {
  const ids = new Set<string>();
  const blocks: MathBlock[] = [];
  for (const block of Array.isArray(input.blocks) ? input.blocks.slice(0, LIMITS.blocks) : []) {
    const { block: normalized } = normalizeBlock(block, ids);
    if (normalized) blocks.push(normalized);
  }
  return {
    id: base.id,
    conversationId: base.conversationId,
    title: String(input.title ?? '').slice(0, 200) || 'Untitled board',
    topic: String(input.topic ?? '').slice(0, 400),
    paper: PAPERS.includes(input.paper) ? input.paper : 'grid',
    angleMode: input.angleMode === 'rad' ? 'rad' : 'deg',
    blocks,
    version: Number(input.version) || 1,
    createdAt: base.createdAt,
    updatedAt: Date.now(),
  };
}

export function findBlock(board: MathBoard, ref: number | string | undefined): MathBlock | undefined {
  if (ref === undefined || ref === null || ref === '') return undefined;
  if (typeof ref === 'number') return board.blocks[Math.max(0, Math.round(ref) - 1)];
  const text = String(ref).trim();
  const byId = board.blocks.find((block) => block.id === text);
  if (byId) return byId;
  const asNumber = Number(text);
  if (Number.isFinite(asNumber) && String(asNumber) === text) return board.blocks[Math.max(0, Math.round(asNumber) - 1)];
  const lower = text.toLowerCase();
  return board.blocks.find((block) => 'title' in block && typeof block.title === 'string' && block.title.toLowerCase() === lower);
}

/** One line describing a block, for tool results and the prompt outline. */
export function describeBlock(block: MathBlock, index: number): string {
  const head = `${index + 1}. [${block.id}] ${block.type}`;
  switch (block.type) {
    case 'text':
      return `${head}${block.heading ? ` "${block.heading}"` : ''}: ${mathToPlain(block.body).replace(/\s+/g, ' ').slice(0, 120)}`;
    case 'formula':
      return `${head}${block.title ? ` "${block.title}"` : ''}: ${mathToPlain(block.formula).slice(0, 120)}`;
    case 'derivation':
      return `${head}${block.title ? ` "${block.title}"` : ''}: ${block.steps.length} steps, ${mathToPlain(block.steps[0]?.math ?? '')} … ${mathToPlain(block.result ?? block.steps[block.steps.length - 1]?.math ?? '')}`;
    case 'figure':
      return `${head}: ${block.figure.kind}${block.figure.sides?.length ? ` sides ${block.figure.sides.join(', ')}` : ''}${block.figure.labels?.length ? ` labels ${block.figure.labels.join('')}` : ''}`;
    case 'plot':
      return `${head}: ${(block.plot.functions ?? []).map((fn) => fn.expr).join(', ') || 'points'}`;
    case 'table':
      return `${head}${block.title ? ` "${block.title}"` : ''}: ${block.columns.join(' | ')} (${block.rows.length} rows)`;
    case 'quiz':
      return `${head}${block.title ? ` "${block.title}"` : ''}: ${block.questions.length} questions${block.questions.filter((q) => q.userAnswer).length ? `, ${block.questions.filter((q) => q.userAnswer).length} answered` : ''}`;
    case 'sketch':
      return `${head}: whiteboard, ${block.strokes.length} strokes`;
    case 'diagram': {
      const count = diagramStepCount(block.diagram);
      const steps = (block.diagram.steps ?? []).map((step) => step.text || step.math || '').filter(Boolean);
      return `${head}${block.title ? ` "${block.title}"` : ''}: step-by-step drawing, ${count} step${count === 1 ? '' : 's'}, ${block.diagram.elements.length} elements${steps.length ? ` — ${steps.map((step, i) => `${i + 1}) ${mathToPlain(step).slice(0, 60)}`).join(' ').slice(0, 260)}` : ''}`;
    }
  }
}

/** The board as text for the prompt: enough to work from without sending every stroke. */
export function boardOutline(board: MathBoard, maxChars = 6000): string {
  const lines = [`Title: ${board.title}`, board.topic ? `Topic: ${board.topic}` : '', `Paper: ${board.paper}, angles in ${board.angleMode === 'deg' ? 'degrees' : 'radians'}`, `${board.blocks.length} block${board.blocks.length === 1 ? '' : 's'}:`].filter(Boolean);
  for (const [index, block] of board.blocks.entries()) lines.push(describeBlock(block, index));
  const text = lines.join('\n');
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[… outline shortened; use get_board for the rest …]`;
}
