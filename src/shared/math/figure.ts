/**
 * Geometry figures drawn from what a problem says: "a right triangle with legs 3 and 4", "a square
 * with side a", "a circle of radius r". The model gives lengths and labels — a length may be a number
 * (`3`), a root (`√3`) or just a letter (`a`, `x`) — and this builds the coordinates, the right-angle
 * mark and the SVG. Letters are drawn at a sensible size and, in a right triangle, a single unknown
 * side is measured with Pythagoras so the picture matches the numbers.
 */
import { measureOf } from './calc';
import { escapeHtml, mathToPlain } from './mathtext';
import type { FigureSpec } from '../types/math';

export interface Point {
  x: number;
  y: number;
}

export interface BuiltFigure {
  svg: string;
  width: number;
  height: number;
  /** Lengths worked out on the way, so the model sees them too. */
  notes: string[];
}

interface Side {
  /** What to write next to the edge. */
  text: string;
  /** Length used for drawing; NaN until it is known. */
  value: number;
  /** The length is a letter, so the value is only for the drawing. */
  symbolic?: boolean;
}

const DEFAULT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const PAD = 30;
const MIN_SIZE = 140;
const MAX_SIZE = 560;

/** A measurement that may be a number, a root or a letter. */
function read(value: number | string | undefined | null, fallback: number): Side | null {
  if (value === undefined || value === null || value === '') return null;
  const measure = measureOf(value);
  if (measure && measure.value > 0) return { text: measure.text, value: measure.value };
  return { text: String(value).trim().slice(0, 40), value: fallback, symbolic: true };
}

function labelIndex(labels: string[], ref: number | string | undefined, fallback: number): number {
  const count = Math.max(1, labels.length);
  if (ref === undefined || ref === null || ref === '') return fallback;
  if (typeof ref === 'number') return ((Math.round(ref) % count) + count) % count;
  const text = String(ref).trim();
  const byLabel = labels.findIndex((label) => label.toLowerCase() === text.toLowerCase());
  if (byLabel >= 0) return byLabel;
  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) return ((Math.round(asNumber) % count) + count) % count;
  return fallback;
}

/** Side i runs from vertex i to vertex i+1, which keeps triangles, squares and polygons consistent. */
function readSides(spec: FigureSpec, count: number, fallback = NaN): Array<Side | null> {
  const given = Array.isArray(spec.sides) ? spec.sides : [];
  return Array.from({ length: count }, (_, i) => read(given[i] ?? null, fallback));
}

const format = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4))));

/**
 * Fills in the third side of a right triangle, and gives letters a length to be drawn at. When the
 * right-angle vertex contradicts the sides that were given (a model naming a vertex that makes the
 * hypotenuse shorter than a leg), the two known sides are taken as the legs instead of refusing.
 */
function completeRightTriangle(sides: Array<Side | null>, rightAt: number, notes: string[]): { sides: Side[]; rightAt: number } {
  const legStart = (rightAt + 2) % 3; // the edge that ends at the right angle
  const legEnd = rightAt; // the edge that starts at the right angle
  const hypotenuse = (rightAt + 1) % 3;
  const filled: Array<Side | null> = [...sides];
  const known = (index: number) => !!filled[index] && !filled[index]!.symbolic && Number.isFinite(filled[index]!.value);
  const set = (index: number, value: number, note: string) => {
    const existing = filled[index];
    filled[index] = existing ? { ...existing, value } : { text: format(value), value };
    notes.push(note);
  };

  if (!known(hypotenuse) && known(legStart) && known(legEnd)) {
    const a = filled[legStart]!.value;
    const b = filled[legEnd]!.value;
    set(hypotenuse, Math.hypot(a, b), `hypotenuse = √(${format(a)}² + ${format(b)}²) = ${format(Math.hypot(a, b))}`);
  } else if (known(hypotenuse) && (known(legStart) || known(legEnd))) {
    const missing = known(legStart) ? legEnd : legStart;
    const other = known(legStart) ? legStart : legEnd;
    if (!known(missing)) {
      const c = filled[hypotenuse]!.value;
      const o = filled[other]!.value;
      if (c <= o) {
        // The two given sides cannot be a leg and the hypotenuse; they must both be legs.
        const vertex = (Math.min(hypotenuse, other) === 0 && Math.max(hypotenuse, other) === 2 ? 0 : Math.max(hypotenuse, other)) % 3;
        notes.push(`${format(c)} cannot be the hypotenuse next to a leg of ${format(o)}, so both are legs and the right angle is at vertex ${vertex + 1}.`);
        return completeRightTriangle(sides, vertex, notes);
      }
      const leg = Math.sqrt(c * c - o * o);
      set(missing, leg, `missing leg = √(${format(c)}² − ${format(o)}²) = ${format(leg)}`);
    }
  } else if ([legStart, legEnd, hypotenuse].filter(known).length < 2 && sides.every((side) => !side || side.symbolic)) {
    // Only letters: draw a 3-4-5 triangle so the labels sit in the right places.
    const shape = [0, 0, 0];
    shape[legStart] = 3;
    shape[legEnd] = 4;
    shape[hypotenuse] = 5;
    for (let i = 0; i < 3; i++) filled[i] = filled[i] ? { ...filled[i]!, value: shape[i] } : { text: '', value: shape[i] };
  }

  const missing = [legStart, legEnd, hypotenuse].filter((index) => !filled[index] || !Number.isFinite(filled[index]!.value));
  if (missing.length) throw new Error('A right triangle needs two of its three sides.');
  return { sides: filled as Side[], rightAt };
}

/** Triangle corners from three side lengths (side i from vertex i to vertex i+1). */
function triangleFromSides(sides: Side[]): Point[] {
  const [ab, bc, ca] = sides.map((side) => side.value);
  if (!(ab > 0) || !(bc > 0) || !(ca > 0)) throw new Error('Every side has to be longer than 0.');
  if (ab + bc <= ca || ab + ca <= bc || bc + ca <= ab) throw new Error('Those three lengths cannot make a triangle.');
  const x = (ca * ca + ab * ab - bc * bc) / (2 * ab);
  const y = Math.sqrt(Math.max(0, ca * ca - x * x));
  return [
    { x: 0, y: 0 },
    { x: ab, y: 0 },
    { x, y },
  ];
}

function regularPolygon(count: number, radius: number): Point[] {
  // Flat side at the bottom.
  const offset = Math.PI / 2 + Math.PI / count;
  return Array.from({ length: count }, (_, i) => {
    const angle = offset + (i * 2 * Math.PI) / count;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}

const centroid = (points: Point[]): Point => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});

interface Layout {
  /** Points in figure space, y up. */
  points: Point[];
  labels: string[];
  sides: Array<Side | null>;
  closed: boolean;
  circle?: { center: Point; radius: number; label?: string };
  rightAngles: number[];
  angleLabels: Array<{ at: number; text: string }>;
}

function layoutFor(spec: FigureSpec, notes: string[]): Layout {
  const kind = spec.kind;
  const labels = (Array.isArray(spec.labels) && spec.labels.length ? spec.labels : DEFAULT_LABELS).map((label) => String(label ?? '').slice(0, 8));
  const angleLabels: Array<{ at: number; text: string }> = [];
  const addAngles = (count: number) => {
    const given = Array.isArray(spec.angles) ? spec.angles : [];
    for (let i = 0; i < count; i++) {
      const value = given[i];
      if (value === undefined || value === null || value === '') continue;
      const text = typeof value === 'number' ? `${value}°` : String(value).trim();
      angleLabels.push({ at: i, text: /[°a-zA-ZÀ-￿]/.test(text) ? text : `${text}°` });
    }
  };

  if (kind === 'circle') {
    const radius = read(spec.radius ?? spec.width ?? null, 1) ?? { text: '', value: 1 };
    return {
      points: [],
      labels: labels.slice(0, 1),
      sides: [],
      closed: true,
      circle: { center: { x: 0, y: 0 }, radius: radius.value, label: radius.text || undefined },
      rightAngles: [],
      angleLabels: [],
    };
  }

  if (kind === 'square' || kind === 'rectangle') {
    const side = read(spec.sides?.[0] ?? null, 1);
    const width = read(spec.width ?? null, 1) ?? side ?? { text: '', value: 1 };
    const height = kind === 'square' ? width : (read(spec.height ?? null, 1) ?? read(spec.sides?.[1] ?? null, 1) ?? width);
    const points = [
      { x: 0, y: 0 },
      { x: width.value, y: 0 },
      { x: width.value, y: height.value },
      { x: 0, y: height.value },
    ];
    const sides: Array<Side | null> = [width, height, kind === 'square' ? null : width, kind === 'square' ? null : height];
    addAngles(4);
    return { points, labels: labels.slice(0, 4), sides, closed: true, rightAngles: [labelIndex(labels, spec.rightAngleAt, 0)], angleLabels };
  }

  if (kind === 'polygon') {
    const custom = Array.isArray(spec.points) ? spec.points.filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) : [];
    if (custom.length >= 3) {
      const points = custom.slice(0, 12).map((p) => ({ x: Number(p.x), y: Number(p.y) }));
      const customLabels = points.map((_, i) => custom[i]?.label ?? labels[i] ?? '');
      addAngles(points.length);
      return {
        points,
        labels: customLabels,
        sides: readSides(spec, points.length, 1),
        closed: true,
        rightAngles: spec.rightAngleAt === undefined ? [] : [labelIndex(customLabels, spec.rightAngleAt, 0)],
        angleLabels,
      };
    }
    const count = Math.min(12, Math.max(3, Math.round(Number(spec.corners) || (Array.isArray(spec.sides) ? spec.sides.length : 0) || 5)));
    addAngles(count);
    return { points: regularPolygon(count, 1), labels: labels.slice(0, count), sides: readSides(spec, count, NaN), closed: true, rightAngles: [], angleLabels };
  }

  if (kind === 'angle') {
    const degrees = read(spec.degrees ?? spec.angles?.[0] ?? 45, 45) ?? { text: '45°', value: 45 };
    const radians = (Math.min(179, Math.max(1, degrees.value)) * Math.PI) / 180;
    angleLabels.push({ at: 1, text: /[°a-zA-ZÀ-￿]/.test(degrees.text) ? degrees.text : `${degrees.text}°` });
    return {
      points: [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
        { x: Math.cos(radians), y: Math.sin(radians) },
      ],
      labels: labels.slice(0, 3),
      sides: [null, null, null],
      closed: false,
      rightAngles: !degrees.symbolic && Math.abs(degrees.value - 90) < 0.01 ? [1] : [],
      angleLabels,
    };
  }

  if (kind === 'segment') {
    const length = read(spec.sides?.[0] ?? spec.width ?? null, 1) ?? { text: '', value: 1 };
    return {
      points: [
        { x: 0, y: 0 },
        { x: length.value, y: 0 },
      ],
      labels: labels.slice(0, 2),
      sides: [length],
      closed: false,
      rightAngles: [],
      angleLabels: [],
    };
  }

  // Triangles
  const isRight = kind === 'right-triangle' || spec.rightAngleAt !== undefined;
  let rightAt = labelIndex(labels, spec.rightAngleAt, 1);
  let sides = readSides(spec, 3);
  if (isRight) {
    const completed = completeRightTriangle(sides, rightAt, notes);
    sides = completed.sides;
    rightAt = completed.rightAt;
  } else if (sides.some((side) => !side || !Number.isFinite(side.value))) {
    // Letters, or sides left out: draw an even triangle around whatever lengths are known.
    const numbers = sides.filter((side) => side && Number.isFinite(side.value)).map((side) => side!.value);
    const fallback = numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 1;
    const drawn = sides.map((side) => (side && Number.isFinite(side.value) ? side : { text: side?.text ?? '', value: fallback, symbolic: true }));
    const [ab, bc, ca] = drawn.map((side) => side.value);
    sides = ab + bc <= ca || ab + ca <= bc || bc + ca <= ab ? drawn.map((side) => ({ ...side, value: fallback })) : drawn;
  }
  addAngles(3);
  return { points: triangleFromSides(sides as Side[]), labels: labels.slice(0, 3), sides, closed: true, rightAngles: isRight ? [rightAt] : [], angleLabels };
}

const round = (value: number) => Math.round(value * 100) / 100;

export function buildFigure(spec: FigureSpec): BuiltFigure {
  const notes: string[] = [];
  const layout = layoutFor(spec, notes);
  const target = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(Number(spec.size) || 260)));

  // Figure space → pixels, y flipped so maths coordinates point up.
  const xs = layout.circle ? [-layout.circle.radius, layout.circle.radius] : layout.points.map((p) => p.x);
  const ys = layout.circle ? [-layout.circle.radius, layout.circle.radius] : layout.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min(target / spanX, target / spanY);
  const width = Math.round(spanX * scale + PAD * 2);
  const height = Math.round(spanY * scale + PAD * 2);
  const toPixels = (p: Point): Point => ({ x: round(PAD + (p.x - minX) * scale), y: round(height - PAD - (p.y - minY) * scale) });

  const pixels = layout.points.map(toPixels);
  const center = pixels.length ? centroid(pixels) : toPixels({ x: 0, y: 0 });
  const parts: string[] = [];

  if (spec.grid) {
    const step = 20;
    const lines: string[] = [];
    for (let x = PAD % step; x < width; x += step) lines.push(`M${x} 0V${height}`);
    for (let y = height - (PAD % step); y > 0; y -= step) lines.push(`M0 ${y}H${width}`);
    parts.push(`<path d="${lines.join('')}" stroke="currentColor" stroke-width="0.5" opacity="0.14" fill="none"/>`);
  }

  if (layout.circle) {
    const radius = round(layout.circle.radius * scale);
    const middle = toPixels(layout.circle.center);
    parts.push(`<circle cx="${middle.x}" cy="${middle.y}" r="${radius}" fill="${spec.fill ? 'currentColor' : 'none'}" fill-opacity="0.08" stroke="currentColor" stroke-width="1.6"/>`);
    parts.push(`<circle cx="${middle.x}" cy="${middle.y}" r="2.5" fill="currentColor"/>`);
    if (layout.labels[0]) parts.push(text(middle.x - 11, middle.y + 15, layout.labels[0], 'middle', true));
    if (layout.circle.label) {
      parts.push(`<line x1="${middle.x}" y1="${middle.y}" x2="${middle.x + radius}" y2="${middle.y}" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 3"/>`);
      parts.push(text(middle.x + radius / 2, middle.y - 7, layout.circle.label, 'middle'));
    }
  } else if (pixels.length >= 2) {
    const d = `M${pixels.map((p) => `${p.x} ${p.y}`).join('L')}${layout.closed ? 'Z' : ''}`;
    parts.push(`<path d="${d}" fill="${spec.fill && layout.closed ? 'currentColor' : 'none'}" fill-opacity="0.07" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`);
  }

  // Right-angle marks
  for (const index of layout.rightAngles) {
    if (pixels.length < 3) continue;
    const vertex = pixels[index];
    const previous = pixels[(index - 1 + pixels.length) % pixels.length];
    const next = pixels[(index + 1) % pixels.length];
    if (vertex && previous && next) parts.push(rightAngleMark(vertex, previous, next));
  }

  // Angle arcs
  for (const label of layout.angleLabels) {
    if (pixels.length < 3 || layout.rightAngles.includes(label.at)) continue;
    const vertex = pixels[label.at];
    const previous = pixels[(label.at - 1 + pixels.length) % pixels.length];
    const next = pixels[(label.at + 1) % pixels.length];
    if (vertex && previous && next) parts.push(angleArc(vertex, previous, next, label.text));
  }

  // Side labels at the middle of each edge, pushed outwards
  layout.sides.forEach((side, index) => {
    if (!side || !side.text) return;
    const from = pixels[index];
    const to = pixels[(index + 1) % pixels.length];
    if (!from || !to) return;
    if (!layout.closed && index >= pixels.length - 1) return;
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const away = normalize({ x: middle.x - center.x, y: middle.y - center.y });
    parts.push(text(middle.x + away.x * 16, middle.y + away.y * 16 + 4, side.text, 'middle'));
  });

  // Vertex labels
  layout.labels.forEach((label, index) => {
    if (!label || !pixels[index]) return;
    const vertex = pixels[index];
    const away = normalize({ x: vertex.x - center.x, y: vertex.y - center.y });
    parts.push(text(vertex.x + away.x * 14, vertex.y + away.y * 14 + 4, label, 'middle', true));
    parts.push(`<circle cx="${vertex.x}" cy="${vertex.y}" r="2.4" fill="currentColor"/>`);
  });

  // Extra lines inside the figure: a height, a diagonal, a median
  for (const mark of Array.isArray(spec.marks) ? spec.marks.slice(0, 8) : []) {
    const from = pixels[labelIndex(layout.labels, mark.from, 0)];
    const to = pixels[labelIndex(layout.labels, mark.to, 1)];
    if (!from || !to) continue;
    parts.push(`<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="currentColor" stroke-width="1.3"${mark.dashed ? ' stroke-dasharray="5 4"' : ''} opacity="0.85"/>`);
    if (mark.label) parts.push(text((from.x + to.x) / 2 + 8, (from.y + to.y) / 2 - 6, mark.label));
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="m-figure" role="img" aria-label="${escapeHtml(figureLabel(spec))}">${parts.join('')}</svg>`;
  return { svg, width, height, notes };
}

function figureLabel(spec: FigureSpec): string {
  const sides = Array.isArray(spec.sides) ? spec.sides.filter((side) => side !== undefined && side !== null && side !== '').join(', ') : '';
  return `${spec.kind.replace('-', ' ')}${sides ? ` with sides ${sides}` : ''}`;
}

function normalize(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y);
  return length < 1e-6 ? { x: 0, y: -1 } : { x: vector.x / length, y: vector.y / length };
}

function text(x: number, y: number, label: string, anchor: 'start' | 'middle' | 'end' = 'start', vertex = false): string {
  const plain = mathToPlain(String(label));
  const italic = vertex || /^[a-zA-Z]$/.test(plain);
  return `<text x="${round(x)}" y="${round(y)}" text-anchor="${anchor}" fill="currentColor" font-size="13" font-family="'Source Serif 4 Variable','Cambria Math',Georgia,serif"${italic ? ' font-style="italic"' : ''}>${escapeHtml(plain)}</text>`;
}

function rightAngleMark(vertex: Point, previous: Point, next: Point): string {
  const u = normalize({ x: previous.x - vertex.x, y: previous.y - vertex.y });
  const w = normalize({ x: next.x - vertex.x, y: next.y - vertex.y });
  const size = 11;
  const p1 = { x: vertex.x + u.x * size, y: vertex.y + u.y * size };
  const p2 = { x: vertex.x + (u.x + w.x) * size, y: vertex.y + (u.y + w.y) * size };
  const p3 = { x: vertex.x + w.x * size, y: vertex.y + w.y * size };
  const dot = { x: p2.x - (u.x + w.x) * size * 0.45, y: p2.y - (u.y + w.y) * size * 0.45 };
  return `<path d="M${round(p1.x)} ${round(p1.y)}L${round(p2.x)} ${round(p2.y)}L${round(p3.x)} ${round(p3.y)}" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="${round(dot.x)}" cy="${round(dot.y)}" r="1.3" fill="currentColor"/>`;
}

function angleArc(vertex: Point, previous: Point, next: Point, label: string): string {
  const u = normalize({ x: previous.x - vertex.x, y: previous.y - vertex.y });
  const w = normalize({ x: next.x - vertex.x, y: next.y - vertex.y });
  const radius = 20;
  const start = { x: vertex.x + u.x * radius, y: vertex.y + u.y * radius };
  const end = { x: vertex.x + w.x * radius, y: vertex.y + w.y * radius };
  const sweep = u.x * w.y - u.y * w.x > 0 ? 1 : 0;
  const bisector = normalize({ x: u.x + w.x, y: u.y + w.y });
  const at = { x: vertex.x + bisector.x * (radius + 13), y: vertex.y + bisector.y * (radius + 13) + 4 };
  return `<path d="M${round(start.x)} ${round(start.y)}A${radius} ${radius} 0 0 ${sweep} ${round(end.x)} ${round(end.y)}" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.8"/>${text(at.x, at.y, label, 'middle')}`;
}
