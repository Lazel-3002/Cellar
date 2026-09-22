/**
 * Diagrams the way models write them, turned into a clean spec. A drawing can come as a flat list of
 * elements with step numbers, or as steps that each say something and draw something
 * (`steps: [{ say: "Draw the unit circle", draw: [...] }]`), which is how small models most naturally
 * describe a construction. Kinds, styles and field names have aliases ("dashed", "sketched", "vector",
 * "unit circle"), and the trigonometric circle can be asked for as a preset that Cellar builds itself.
 */
import { trigCircle, type TrigFunction } from './diagram';
import { lineStyleOf, opacityOf } from './linestyle';
import type { DiagramElement, DiagramElementKind, DiagramPoint, DiagramSpec, DiagramStep, LabelPosition } from '../types/math';

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose => !!value && typeof value === 'object' && !Array.isArray(value);

export const DIAGRAM_LIMITS = { elements: 300, steps: 40, label: 80, text: 240 };

const KIND_WORDS: Array<[RegExp, DiagramElementKind, Partial<DiagramElement>?]> = [
  [/^(axes|axis|coordinate.?axes|coordinates|xy.?axes|cartesian)$/, 'axes'],
  [/^(x.?axis|number.?line|numberline|real.?line)$/, 'axes', { axis: 'x' }],
  [/^(y.?axis)$/, 'axes', { axis: 'y' }],
  [/^(unit.?circle|trig(onometric)?.?circle)$/, 'unit-circle'],
  [/^(point|dot|vertex|node|mark)$/, 'point'],
  [/^(segment|line.?segment|side|edge|chord|radius|diameter|height|median|stroke)$/, 'segment'],
  [/^(highlight|zigzag|sketch(ed)?|scribble|hatch(ed)?)$/, 'segment', { line: 'zigzag' }],
  [/^(dashed|dashed.?line|dotted|dotted.?line)$/, 'segment'],
  [/^(line|infinite.?line|straight.?line|vertical.?line|horizontal.?line|tangent.?line|axis.?line)$/, 'line'],
  [/^(ray|half.?line)$/, 'ray'],
  [/^(arrow|vector)$/, 'arrow'],
  [/^(circle|disc|disk)$/, 'circle'],
  [/^(arc)$/, 'arc'],
  [/^(angle|angle.?arc|angle.?mark|right.?angle)$/, 'angle'],
  [/^(polygon|triangle|square|rectangle|quadrilateral|shape|region|area|polyline)$/, 'polygon'],
  [/^(function|graph|curve|plot)$/, 'function'],
  [/^(text|label|caption|note|sign|symbol|word|annotation)$/, 'text'],
];

function kindOf(raw: string): { kind: DiagramElementKind; extra?: Partial<DiagramElement> } | null {
  const word = raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
  for (const [pattern, kind, extra] of KIND_WORDS) if (pattern.test(word)) return { kind, extra: word === 'dotted' || word === 'dotted-line' ? { line: 'dotted' } : word.startsWith('dashed') ? { line: 'dashed' } : word === 'right-angle' ? { right: true } : extra };
  return null;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
}

function pick(source: Loose, keys: string[]): unknown {
  for (const key of keys) if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  return undefined;
}

/** A coordinate or a measurement: a number or a short expression ("cos 135", "√3/2"). */
function value(input: unknown): number | string | undefined {
  if (typeof input === 'number') return Number.isFinite(input) ? input : undefined;
  if (typeof input === 'string' && input.trim()) return input.trim().slice(0, 80);
  return undefined;
}

function point(input: unknown): DiagramPoint | undefined {
  if (Array.isArray(input) && input.length >= 2) {
    const x = value(input[0]);
    const y = value(input[1]);
    return x !== undefined && y !== undefined ? [x, y] : undefined;
  }
  if (isObject(input)) {
    const x = value(input.x);
    const y = value(input.y);
    return x !== undefined && y !== undefined ? [x, y] : undefined;
  }
  if (typeof input === 'string' && input.trim()) return input.trim().slice(0, 60);
  return undefined;
}

const POSITIONS: LabelPosition[] = ['above', 'below', 'left', 'right', 'above-left', 'above-right', 'below-left', 'below-right'];

function positionOf(input: unknown): LabelPosition | undefined {
  if (typeof input !== 'string') return undefined;
  const word = input
    .trim()
    .toLowerCase()
    .replace(/\s+|_/g, '-')
    .replace(/^top/, 'above')
    .replace(/^bottom/, 'below')
    .replace(/^up(per)?/, 'above')
    .replace(/^(down|lower)/, 'below')
    .replace(/^north/, 'above')
    .replace(/^south/, 'below')
    .replace(/east$/, 'right')
    .replace(/west$/, 'left');
  return POSITIONS.includes(word as LabelPosition) ? (word as LabelPosition) : undefined;
}

export function normalizeElement(input: unknown, step: number): DiagramElement | null {
  if (!isObject(input)) return null;
  const rawKind = text(pick(input, ['kind', 'type', 'shape', 'draw', 'element', 'what']), 40);
  let found = rawKind ? kindOf(rawKind) : null;
  if (!found) {
    // Guess from the fields that are there.
    if (typeof input.expr === 'string' || typeof input.function === 'string') found = { kind: 'function' };
    else if (Array.isArray(input.points)) found = { kind: 'polygon' };
    else if (input.text !== undefined && input.from === undefined) found = { kind: 'text' };
    else if (input.from !== undefined && input.to !== undefined) found = { kind: 'segment' };
    else if (input.radius !== undefined) found = { kind: 'circle' };
    else if (input.at !== undefined || input.position !== undefined) found = { kind: 'point' };
    else return null;
  }
  const element: DiagramElement = { kind: found.kind, step, ...(found.extra ?? {}) };

  const name = text(pick(input, ['name', 'id']), 12);
  if (name) element.name = name;
  const label = text(pick(input, ['label', 'caption', 'title']), DIAGRAM_LIMITS.label);
  if (label) element.label = label;

  const at = point(pick(input, ['at', 'center', 'centre', 'vertex', 'point', 'pos', 'location', 'coords', 'coordinates']));
  if (at) element.at = at;
  let from = point(pick(input, ['from', 'p1', 'a', 'begin', 'origin']));
  let to = point(pick(input, ['to', 'p2', 'b', 'finish', 'target', 'endPoint']));
  // A segment's ends are sometimes given as start/end.
  if (!from && (Array.isArray(input.start) || (typeof input.start === 'string' && !/^-?[\d.]+$/.test(input.start) && found.kind !== 'angle' && found.kind !== 'arc'))) from = point(input.start);
  if (!to && (Array.isArray(input.end) || (typeof input.end === 'string' && !/^-?[\d.]+$/.test(input.end) && found.kind !== 'angle' && found.kind !== 'arc'))) to = point(input.end);
  if (from) element.from = from;
  if (to) element.to = to;
  const through = point(pick(input, ['through', 'via', 'passing']));
  if (through) element.through = through;

  // A position word ("above") vs a place: position may be either.
  const position = positionOf(pick(input, ['position', 'labelPosition', 'anchor', 'side', 'placement']));
  if (position) element.position = position;
  else if (!element.at && input.position !== undefined) {
    const place = point(input.position);
    if (place) element.at = place;
  }

  for (const key of ['x', 'y', 'slope', 'radius'] as const) {
    const v = value(key === 'radius' ? pick(input, ['radius', 'r']) : input[key]);
    if (v !== undefined) element[key] = v;
  }
  if (element.kind === 'arc' || element.kind === 'angle') {
    const start = value(pick(input, ['start', 'startAngle', 'from_angle', 'fromAngle']));
    const end = value(pick(input, ['end', 'endAngle', 'degrees', 'angle', 'measure', 'to_angle', 'toAngle']));
    if (start !== undefined && !Array.isArray(input.start)) element.start = start;
    if (end !== undefined && !Array.isArray(input.end)) element.end = end;
  }
  if (Array.isArray(input.points)) element.points = input.points.slice(0, 40).map(point).filter((p): p is DiagramPoint => p !== undefined);
  const expr = text(pick(input, ['expr', 'function', 'expression', 'equation', 'f']), 200);
  if (expr && element.kind === 'function') element.expr = expr;
  if (Array.isArray(input.domain) && input.domain.length === 2 && input.domain.every((v) => Number.isFinite(Number(v)))) element.domain = [Number(input.domain[0]), Number(input.domain[1])];
  const words = text(pick(input, ['text', 'content', 'value', 'body']), DIAGRAM_LIMITS.text);
  if (words && element.kind === 'text') element.text = words;
  if (element.kind === 'text' && !element.text && element.label) {
    element.text = element.label;
    delete element.label;
  }

  if (input.right === true || input.rightAngle === true) element.right = true;
  if (input.right === false) element.right = false;
  if (input.open === true || input.hollow === true || input.filled === false) element.open = true;
  if (typeof input.ticks === 'boolean') element.ticks = input.ticks;
  const axis = text(input.axis ?? input.axes, 8)?.toLowerCase();
  if (axis === 'x' || axis === 'y' || axis === 'both') element.axis = axis;
  const size = text(input.size, 10)?.toLowerCase();
  if (size === 'small' || size === 'large' || size === 'normal') element.size = size;
  else if (size === 'big' || size === 'huge') element.size = 'large';
  else if (size === 'tiny') element.size = 'small';

  // Style
  const color = text(pick(input, ['color', 'colour', 'stroke', 'strokeColor']), 24);
  if (color) element.color = color;
  const weight = pick(input, ['weight', 'width', 'thickness', 'strokeWidth', 'lineWidth']);
  if (typeof weight === 'number' || typeof weight === 'string') element.weight = weight as DiagramElement['weight'];
  if (input.bold === true || input.thick === true) {
    if (element.kind === 'text') element.bold = true;
    else if (element.weight === undefined) element.weight = input.thick === true ? 'thick' : 'bold';
  }
  if (element.kind === 'point' && input.bold === true) element.bold = true;
  const line = lineStyleOf(pick(input, ['line', 'lineStyle', 'style', 'dash', 'stroke_style', 'strokeStyle', 'pattern']));
  if (line) element.line = line;
  else if (input.dashed === true) element.line = 'dashed';
  else if (input.dotted === true) element.line = 'dotted';
  else if (input.zigzag === true || input.sketched === true || input.scribble === true || input.highlight === true) element.line = 'zigzag';
  else if (input.wavy === true) element.line = 'wavy';
  const opacity = opacityOf(pick(input, ['opacity', 'alpha', 'transparency']));
  if (opacity !== undefined) element.opacity = opacity;
  const fill = pick(input, ['fill', 'fillColor', 'shade', 'shaded']);
  if (typeof fill === 'string') element.fill = fill.slice(0, 24);
  else if (fill === true) element.fill = element.color ?? 'blue';
  const fillOpacity = opacityOf(input.fillOpacity);
  if (fillOpacity !== undefined) element.fillOpacity = fillOpacity;
  const arrow = pick(input, ['arrow', 'arrows', 'arrowhead', 'head']);
  if (arrow === true) element.arrow = 'end';
  else if (arrow === false) element.arrow = 'none';
  else if (typeof arrow === 'string' && ['none', 'end', 'start', 'both'].includes(arrow)) element.arrow = arrow as DiagramElement['arrow'];

  // A highlighted segment is orange and bold unless it says otherwise, like a marker on paper.
  if (found.kind === 'segment' && rawKind && /highlight|zigzag|sketch|scribble|hatch/i.test(rawKind)) {
    element.color ??= 'orange';
    element.weight ??= 'bold';
  }
  return element;
}

function stepOf(input: unknown): DiagramStep | null {
  if (typeof input === 'string') return input.trim() ? { text: input.trim().slice(0, DIAGRAM_LIMITS.text * 2) } : null;
  if (!isObject(input)) return null;
  const say = text(pick(input, ['text', 'say', 'explain', 'explanation', 'description', 'caption', 'title', 'step', 'instruction', 'narration']), DIAGRAM_LIMITS.text * 2);
  const math = text(pick(input, ['math', 'formula', 'equation', 'result', 'latex']), 300);
  if (!say && !math) return null;
  return { text: say ?? '', ...(math ? { math } : {}) };
}

const TRIG_FUNCTIONS: TrigFunction[] = ['sin', 'cos', 'tan', 'cot'];

export function normalizeDiagram(input: Loose): { diagram?: DiagramSpec; notes: string[]; error?: string } {
  const source: Loose = isObject(input.diagram) ? { ...input, ...input.diagram } : { ...input };
  const notes: string[] = [];
  const elements: DiagramElement[] = [];
  const steps: DiagramStep[] = [];

  // A preset Cellar builds itself.
  // A block typed "unit circle" with an angle and nothing drawn is the preset too.
  const typeWord = typeof source.type === 'string' && /(unit|trig\w*)[\s_-]?circle/i.test(source.type) && !Array.isArray(source.elements) ? 'trig-circle' : undefined;
  const preset = text(pick(source, ['preset', 'template']) ?? typeWord, 40)?.toLowerCase().replace(/[\s_]+/g, '-');
  if (preset && /^(trig(onometric)?-?circle|unit-?circle|trig|tangent|cotangent|tan|cot)$/.test(preset)) {
    const rawShow = pick(source, ['show', 'ratios', 'functions', 'fns']);
    const list = (Array.isArray(rawShow) ? rawShow : typeof rawShow === 'string' ? rawShow.split(/[\s,]+/) : [])
      .map((item) => String(item).toLowerCase().trim().slice(0, 3))
      .filter((item): item is TrigFunction => TRIG_FUNCTIONS.includes(item as TrigFunction));
    if (!list.length && /tan/.test(preset)) list.push('tan');
    if (!list.length && /cot/.test(preset)) list.push('cot');
    const angleInput = pick(source, ['alpha', 'degrees', 'angleDegrees', 'value', 'theta']) ?? (typeof source.angle === 'number' || (typeof source.angle === 'string' && !/^(deg|rad)$/.test(source.angle)) ? source.angle : undefined);
    try {
      const built = trigCircle({ angle: (angleInput as number | string | undefined) ?? 30, show: list, name: text(source.name ?? source.angleName, 8) });
      elements.push(...built.spec.elements);
      steps.push(...(built.spec.steps ?? []));
      notes.push(...built.facts);
      Object.assign(source, { xMin: source.xMin ?? built.spec.xMin, xMax: source.xMax ?? built.spec.xMax, yMin: source.yMin ?? built.spec.yMin, yMax: source.yMax ?? built.spec.yMax });
    } catch (err) {
      return { notes, error: err instanceof Error ? err.message : 'I could not build that preset.' };
    }
    // Wording of the model's own (in the user's language) replaces the default step text.
    const own = Array.isArray(source.steps) ? source.steps : [];
    own.slice(0, steps.length).forEach((raw, index) => {
      const step = stepOf(raw);
      if (step?.text) steps[index] = { ...steps[index], text: step.text, ...(step.math ? { math: step.math } : {}) };
    });
  } else if (Array.isArray(source.steps)) {
    // Steps that each say something and draw something.
    for (const raw of source.steps.slice(0, DIAGRAM_LIMITS.steps)) {
      const step = stepOf(raw);
      const draw = isObject(raw) ? pick(raw, ['draw', 'elements', 'shapes', 'add', 'drawings', 'objects']) : undefined;
      const drawn = Array.isArray(draw) ? draw : isObject(draw) ? [draw] : [];
      // An empty step still counts, so the numbers of the steps after it stay the same.
      const number = steps.length + 1;
      steps.push(step ?? { text: '' });
      for (const item of drawn) {
        const element = normalizeElement(item, number);
        if (element) elements.push(element);
        else notes.push(`Step ${number}: I could not tell what to draw from ${JSON.stringify(item).slice(0, 80)}.`);
      }
    }
  }

  // A flat list, with step numbers or in drawing order.
  const flat = pick(source, ['elements', 'draw', 'shapes', 'objects', 'items', 'drawings']);
  if (Array.isArray(flat)) {
    const base = preset ? steps.length : 0;
    let last = base || 1;
    for (const item of flat.slice(0, DIAGRAM_LIMITS.elements)) {
      const requested = isObject(item) ? Math.round(Number(item.step)) : NaN;
      const step = Number.isFinite(requested) && requested >= 1 ? requested + base : preset ? base + 1 : last;
      last = step;
      const element = normalizeElement(item, Math.min(step, DIAGRAM_LIMITS.steps + base + 1));
      if (element) elements.push(element);
      else notes.push(`I could not tell what to draw from ${JSON.stringify(item).slice(0, 80)}.`);
    }
  }

  if (!elements.length) return { notes, error: 'A diagram needs something to draw: steps with draw lists, elements, or preset "trig-circle" with an angle.' };

  const diagram: DiagramSpec = { elements: elements.slice(0, DIAGRAM_LIMITS.elements) };
  const highest = diagram.elements.reduce((max, element) => Math.max(max, element.step ?? 1), 1);
  while (steps.length < highest) steps.push({ text: '' });
  if (steps.some((step) => step.text || step.math)) diagram.steps = steps.slice(0, Math.max(highest, steps.length));
  for (const key of ['xMin', 'xMax', 'yMin', 'yMax', 'width'] as const) {
    const number = Number(source[key]);
    if (source[key] !== undefined && source[key] !== null && source[key] !== '' && Number.isFinite(number)) diagram[key] = number;
  }
  if (source.grid === true) diagram.grid = true;
  if (source.angle === 'rad' || source.angleMode === 'rad') diagram.angle = 'rad';
  return { diagram, notes };
}
