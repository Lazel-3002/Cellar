/** Math: study boards a local model fills with worked steps, figures, graphs and practice tests. */

export type MathAngleMode = 'deg' | 'rad';

/** Background of the board and of sketch blocks — squared paper by default, like a maths notebook. */
export type MathPaper = 'grid' | 'dots' | 'lined' | 'plain';

export type MathBlockType = 'text' | 'formula' | 'derivation' | 'figure' | 'plot' | 'table' | 'quiz' | 'sketch' | 'diagram';

interface BlockBase {
  id: string;
  /** A short remark under the block. */
  note?: string;
}

export interface TextBlock extends BlockBase {
  type: 'text';
  heading?: string;
  /** Markdown-free prose; blank lines start paragraphs and `- ` lines become a list. */
  body: string;
  /** note and tip get a coloured edge; warning is for common mistakes. */
  tone?: 'plain' | 'note' | 'tip' | 'warning';
}

export interface FormulaBlock extends BlockBase {
  type: 'formula';
  title?: string;
  /** One formula per line, e.g. `a^2 + b^2 = c^2`. */
  formula: string;
  /** What the letters mean: "c: the hypotenuse". */
  where?: string[];
}

export interface DerivationStep {
  /** One line of the derivation, e.g. `a^2 + 3 = 4`. */
  math: string;
  /** Why this line follows from the one above. */
  reason?: string;
}

export interface DerivationBlock extends BlockBase {
  type: 'derivation';
  title?: string;
  steps: DerivationStep[];
  /** The answer, highlighted under the steps. */
  result?: string;
}

export type FigureKind = 'triangle' | 'right-triangle' | 'square' | 'rectangle' | 'circle' | 'polygon' | 'angle' | 'segment';

export interface FigureSpec {
  kind: FigureKind;
  /** Vertex names, in order (default A, B, C, …). */
  labels?: string[];
  /** Side i runs from vertex i to vertex i+1. Lengths may be written as `√3` or `2a`. */
  sides?: Array<number | string>;
  /** Angle at vertex i, for an arc with a label. */
  angles?: Array<number | string>;
  /** Vertex with the right angle (index or label). Any triangle with this set is drawn as a right triangle. */
  rightAngleAt?: number | string;
  radius?: number | string;
  width?: number | string;
  height?: number | string;
  /** Regular polygon corner count. */
  corners?: number;
  /** The angle to draw, for kind "angle". */
  degrees?: number | string;
  /** Exact corners, for an irregular polygon. */
  points?: Array<{ x: number; y: number; label?: string }>;
  /** Extra lines inside the figure: a height, a diagonal, a median. */
  marks?: Array<{ from: number | string; to: number | string; label?: string; dashed?: boolean }>;
  fill?: boolean;
  /** Squared paper behind the figure. */
  grid?: boolean;
  /** Longest side in pixels (140–560, default 260). */
  size?: number;
}

export interface FigureBlock extends BlockBase {
  type: 'figure';
  title?: string;
  figure: FigureSpec;
  caption?: string;
}

export interface PlotSpec {
  /** `x^2 - 2`, `sin(x)`, or with the name: `y = 2x + 1`. */
  functions?: Array<{ expr: string; label?: string; color?: string }>;
  points?: Array<{ x: number; y: number; label?: string }>;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  xLabel?: string;
  yLabel?: string;
  grid?: boolean;
  width?: number;
  height?: number;
  angle?: MathAngleMode;
}

export interface PlotBlock extends BlockBase {
  type: 'plot';
  title?: string;
  plot: PlotSpec;
  caption?: string;
}

export interface TableBlock extends BlockBase {
  type: 'table';
  title?: string;
  columns: string[];
  rows: string[][];
  /** Typeset the cells as maths (fractions and roots), which suits a table of trigonometric values. */
  math?: boolean;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  /** Multiple choice when present; otherwise the answer is typed in. */
  choices?: string[];
  answer: string;
  /** The worked solution, revealed with the answer. */
  steps?: string[];
  figure?: FigureSpec;
  points?: number;
  /** What the student typed or picked (kept so a board can be finished later). */
  userAnswer?: string;
  /** The student asked to see this answer. */
  revealed?: boolean;
}

export interface QuizBlock extends BlockBase {
  type: 'quiz';
  title?: string;
  instructions?: string;
  questions: QuizQuestion[];
}

export type SketchTool = 'pen' | 'line' | 'rect' | 'ellipse' | 'triangle' | 'arrow' | 'text';

/** How a line is drawn: plain, dashed, dotted, dash-dot, or scribbled like a highlighted segment in a notebook. */
export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'dashdot' | 'zigzag' | 'wavy';

export interface SketchStroke {
  tool: SketchTool;
  color: string;
  width: number;
  /** Flat x, y pairs in the sketch's own pixel space. A text stroke is anchored at the first pair. */
  points: number[];
  /** Solid when left out. */
  line?: LineStyle;
  /** 0.1–1; left out means fully opaque. */
  opacity?: number;
  /** What a text stroke says (Greek names like alpha and powers like x^2 are typeset). */
  text?: string;
}

export interface SketchBlock extends BlockBase {
  type: 'sketch';
  title?: string;
  /** Drawing area height in pixels. */
  height: number;
  paper?: MathPaper;
  strokes: SketchStroke[];
}

/**
 * A drawing built up step by step, the way a teacher draws on the board while explaining: each step
 * says one sentence and draws a few things. Coordinates are maths coordinates (y up) and may be
 * written as expressions (`cos 135`, `√3/2`) or as the name of a point drawn earlier.
 */
export type DiagramPoint = [number | string, number | string] | string;

export type DiagramElementKind =
  | 'axes'
  | 'unit-circle'
  | 'point'
  | 'segment'
  | 'line'
  | 'ray'
  | 'arrow'
  | 'circle'
  | 'arc'
  | 'angle'
  | 'polygon'
  | 'function'
  | 'text';

export type DiagramWeight = 'thin' | 'normal' | 'bold' | 'thick';

export type LabelPosition = 'above' | 'below' | 'left' | 'right' | 'above-left' | 'above-right' | 'below-left' | 'below-right';

export interface DiagramElement {
  kind: DiagramElementKind;
  /** The step (from 1) this is drawn in. */
  step?: number;
  /** Names a point so later elements can use it ("P", "T"). */
  name?: string;
  label?: string;
  /** A point, a text anchor, an angle's vertex or a circle's centre. */
  at?: DiagramPoint;
  from?: DiagramPoint;
  to?: DiagramPoint;
  /** A line or ray through `at`/`from` and this point. */
  through?: DiagramPoint;
  /** A vertical line x = …, or a horizontal line y = …. */
  x?: number | string;
  y?: number | string;
  slope?: number | string;
  radius?: number | string;
  /** Arcs and angles: directions in degrees, counter-clockwise from the positive x-axis. */
  start?: number | string;
  end?: number | string;
  points?: DiagramPoint[];
  /** function: y as an expression in x. */
  expr?: string;
  domain?: [number, number];
  /** angle: the square right-angle mark. */
  right?: boolean;
  /** point: a hollow dot, as for an excluded end of an interval. */
  open?: boolean;
  /** text: what to write. */
  text?: string;
  /** axes: which axes to draw (x alone makes a number line). */
  axis?: 'both' | 'x' | 'y';
  ticks?: boolean;
  /** Where a label goes relative to its point. */
  position?: LabelPosition;
  size?: 'small' | 'normal' | 'large';
  bold?: boolean;
  /** A name (red, blue, green, orange, purple, teal, yellow, pink, gray, black) or #hex. */
  color?: string;
  weight?: DiagramWeight | number;
  line?: LineStyle;
  /** Transparency (alpha), 0.1–1. */
  opacity?: number;
  /** Fill colour for circles and polygons. */
  fill?: string;
  fillOpacity?: number;
  arrow?: 'none' | 'end' | 'start' | 'both';
}

export interface DiagramStep {
  /** What this step does, in one sentence. */
  text: string;
  /** A line of maths that goes with it, typeset. */
  math?: string;
}

export interface DiagramSpec {
  elements: DiagramElement[];
  steps?: DiagramStep[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  /** Squared paper behind the drawing. */
  grid?: boolean;
  /** Width in pixels (220–760, default 440). */
  width?: number;
  /** Angle unit for expressions in coordinates and functions (default degrees). */
  angle?: MathAngleMode;
}

export interface DiagramBlock extends BlockBase {
  type: 'diagram';
  title?: string;
  diagram: DiagramSpec;
  caption?: string;
}

export type MathBlock = TextBlock | FormulaBlock | DerivationBlock | FigureBlock | PlotBlock | TableBlock | QuizBlock | SketchBlock | DiagramBlock;

export interface MathBoard {
  id: string;
  conversationId: string;
  title: string;
  /** What the board is about, e.g. "Right triangles and trigonometric ratios". */
  topic: string;
  paper: MathPaper;
  angleMode: MathAngleMode;
  blocks: MathBlock[];
  /** Increases with every save; stale saves are rejected. */
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface MathBoardSummary {
  id: string;
  conversationId: string;
  title: string;
  topic: string;
  blockCount: number;
  /** First formula or step on the board, for the card. */
  preview: string;
  counts: { derivations: number; figures: number; quizzes: number; sketches: number };
  starred: boolean;
  taskStatus?: import('./agent').TaskStatus;
  updatedAt: number;
}

/** Stored on a Math conversation's task state. */
export interface MathSessionInfo {
  boardId: string;
  /** The block the user had selected when they sent their latest message. */
  selection?: MathSelection;
}

export interface MathSelection {
  blockId: string;
}

export interface MathStartOptions {
  topic?: string;
  paper?: MathPaper;
  angleMode?: MathAngleMode;
}

export type MathExportFormat = 'pdf' | 'png' | 'md';

export interface MathExportRequest {
  boardId: string;
  format: MathExportFormat;
  /** false prints a test paper: questions only, with the answer key on its own page. */
  answers?: boolean;
  /** PNG scale factor (default 2). */
  scale?: number;
}

export interface MathChangedEvent {
  boardId: string;
  conversationId: string;
  version: number;
  /** Who changed it: the model (tools) or a person (the board editor). */
  source: 'agent' | 'user';
}

export type QuizTopic =
  | 'arithmetic'
  | 'fractions'
  | 'powers'
  | 'pythagoras'
  | 'trig-ratios'
  | 'special-angles'
  | 'linear'
  | 'quadratic'
  | 'area'
  | 'mixed';

export type QuizDifficulty = 'easy' | 'medium' | 'hard';
