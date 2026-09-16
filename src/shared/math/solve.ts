/**
 * Step-by-step solvers. Every solver returns the lines a student would write down, in order, so the
 * model never has to do the arithmetic itself — it asks for the steps and puts them on the board.
 */
import {
  exact,
  exactAdd,
  exactDiv,
  exactInt,
  exactMul,
  exactNumber,
  exactPow,
  exactSqrt,
  exactSub,
  formatExact,
  approxRational,
  isRational,
  isZero,
  rat,
  ratNumber,
  type Exact,
  type Rational,
} from './exact';
import { calculate, evaluationSteps } from './calc';
import {
  defaultContext,
  evaluateExact,
  evaluateNode,
  formatDecimal,
  MathError,
  normalizeExpression,
  parseEquation,
  parseExpression,
  printNode,
  variablesOf,
  type AngleMode,
  type EvalContext,
  type Node,
} from './expr';

export interface SolveStep {
  math: string;
  /** Why this line follows from the one before. */
  reason?: string;
}

export interface Solution {
  title: string;
  steps: SolveStep[];
  /** The answer on its own, for a result line. */
  result: string;
  note?: string;
}

export type SolveKind = 'auto' | 'expression' | 'equation' | 'linear' | 'quadratic' | 'pythagoras' | 'trig';

const squared = (text: string) => (/^[\d.]+$/.test(text) || /^[a-zA-Z]$/.test(text) ? `${text}^2` : `(${text})^2`);

function exactOf(text: string, ctx: EvalContext): Exact | null {
  try {
    return evaluateExact(parseExpression(text), ctx);
  } catch {
    return null;
  }
}

/** The tidiest way to write a value: an exact fraction or root when there is one. */
function show(value: Exact | null, fallback: number): string {
  if (value) return formatExact(value);
  const approx = approxRational(fallback, 1000, 1e-10);
  return approx && approx.d !== 1n ? `${approx.n}/${approx.d}` : formatDecimal(fallback, 6);
}

const showRational = (q: Rational) => (q.d === 1n ? q.n.toString() : `${q.n}/${q.d}`);

// ---------------------------------------------------------------------------
// Expressions

export function solveExpression(input: string, options: { angle?: AngleMode } = {}): Solution {
  const ctx = defaultContext(options.angle ?? 'deg');
  const node = parseExpression(input);
  const steps = evaluationSteps(node, ctx);
  const result = calculate(input, { angle: ctx.angle, decimals: 6 });
  if (!result.ok) throw new MathError(result.error ?? 'I could not calculate that.');
  const lines: SolveStep[] = steps.map((math, index) => ({ math, reason: index === 0 ? undefined : undefined }));
  if (lines.length === 1) lines.push({ math: result.answer });
  return {
    title: `Calculate ${steps[0]}`,
    steps: lines,
    result: result.answer,
    note: result.approx ? `≈ ${result.approx}` : undefined,
  };
}

// ---------------------------------------------------------------------------
// Equations

/** a·x + b, or a·x² + b·x + c, read off the values of the expression at a few points. */
function coefficients(node: Node, variable: string, ctx: EvalContext): { a: Rational; b: Rational; c: Rational } | null {
  const at = (x: number) => evaluateNode(node, { ...ctx, vars: { ...ctx.vars, [variable]: x } });
  let f0: number;
  let f1: number;
  let fMinus1: number;
  let f2: number;
  try {
    f0 = at(0);
    f1 = at(1);
    fMinus1 = at(-1);
    f2 = at(2);
  } catch {
    return null;
  }
  const c = f0;
  const a = (f1 + fMinus1 - 2 * f0) / 2;
  const b = (f1 - fMinus1) / 2;
  // Confirm the guess: anything that is not a polynomial of degree ≤ 2 fails here.
  if (Math.abs(4 * a + 2 * b + c - f2) > 1e-6 * Math.max(1, Math.abs(f2))) return null;
  const rationals = [a, b, c].map((value) => approxRational(value, 100_000, 1e-9));
  if (rationals.some((value) => !value)) return null;
  const [ra, rb, rc] = rationals as Rational[];
  return { a: ra, b: rb, c: rc };
}

export function solveLinear(input: string, options: { angle?: AngleMode } = {}): Solution {
  const ctx = defaultContext(options.angle ?? 'deg');
  const equation = parseEquation(input);
  const variables = [...new Set([...variablesOf(equation.lhs), ...variablesOf(equation.rhs)])];
  if (variables.length !== 1) throw new MathError(variables.length === 0 ? 'There is no unknown in this equation.' : `This equation has more than one unknown (${variables.join(', ')}).`);
  const variable = variables[0];
  const difference: Node = { t: 'bin', op: '-', a: equation.lhs, b: equation.rhs };
  const found = coefficients(difference, variable, ctx);
  if (!found) throw new MathError('I can only solve equations that are linear or quadratic in one unknown.');
  if (!isZero(found.a)) return quadraticFrom(found, variable, `${equation.text.lhs} = ${equation.text.rhs}`);
  const { b, c } = found;
  if (isZero(b)) throw new MathError(isZero(c) ? 'Every number solves this equation.' : 'No number solves this equation.');
  const steps: SolveStep[] = [{ math: `${equation.text.lhs} = ${equation.text.rhs}` }];
  const left = `${showRational(b)}${variable}`;
  const right = showRational(rat(-c.n, c.d));
  steps.push({ math: `${left} = ${right}`, reason: 'move the numbers to the right, the unknown to the left' });
  const root = rat(-c.n * b.d, c.d * b.n);
  if (b.d !== 1n || b.n !== 1n) steps.push({ math: `${variable} = ${right}/${showRational(b)}`, reason: `divide both sides by ${showRational(b)}` });
  steps.push({ math: `${variable} = ${showRational(root)}` });
  const decimal = formatDecimal(ratNumber(root), 6);
  return {
    title: `Solve ${equation.text.lhs} = ${equation.text.rhs}`,
    steps,
    result: `${variable} = ${showRational(root)}`,
    note: root.d === 1n ? undefined : `≈ ${decimal}`,
  };
}

function quadraticFrom(found: { a: Rational; b: Rational; c: Rational }, variable: string, original: string): Solution {
  const { a, b, c } = found;
  const term = (value: Rational, suffix: string) => {
    const text = showRational(value);
    if (text === '1' && suffix) return suffix;
    if (text === '-1' && suffix) return `-${suffix}`;
    return `${text}${suffix}`;
  };
  const join = (parts: string[]) => parts.filter(Boolean).reduce((acc, part) => (acc ? (part.startsWith('-') ? `${acc} - ${part.slice(1)}` : `${acc} + ${part}`) : part), '');
  const normalized = join([term(a, `${variable}^2`), isZero(b) ? '' : term(b, variable), isZero(c) ? '' : showRational(c)]);
  const steps: SolveStep[] = [{ math: original }];
  if (`${normalized} = 0` !== original.replace(/\s+/g, ' ')) steps.push({ math: `${normalized} = 0`, reason: 'bring everything to one side' });

  const ea = exact(a);
  const eb = exact(b);
  const ec = exact(c);
  const bSquared = exactPow(eb, 2)!;
  const fourAc = exactMul(exactMul(exactInt(4), ea), ec);
  const discriminant = exactSub(bSquared, fourAc);
  const discriminantValue = exactNumber(discriminant);
  steps.push({ math: `Δ = b^2 - 4ac = ${showRational(b)}^2 - 4·${showRational(a)}·${showRational(c)} = ${formatExact(discriminant)}`, reason: 'the discriminant decides how many real roots there are' });

  if (discriminantValue < 0) {
    return { title: `Solve ${original}`, steps: [...steps, { math: 'Δ < 0, so there is no real solution.' }], result: 'no real solution' };
  }
  const rootOfDiscriminant = exactSqrt(discriminant);
  const twoA = exactMul(exactInt(2), ea);
  const minusB = exactMul(exactInt(-1), eb);
  if (discriminantValue === 0) {
    const single = exactDiv(minusB, twoA);
    const text = show(single, -ratNumber(b) / (2 * ratNumber(a)));
    return {
      title: `Solve ${original}`,
      steps: [...steps, { math: `${variable} = -b/(2a) = ${text}`, reason: 'Δ = 0, so both roots are the same' }],
      result: `${variable} = ${text}`,
    };
  }
  const sqrtText = rootOfDiscriminant ? formatExact(rootOfDiscriminant) : `√${formatExact(discriminant)}`;
  steps.push({ math: `${variable} = (-b ± √Δ)/(2a) = (${showRational(rat(-b.n, b.d))} ± ${sqrtText})/${formatExact(twoA)}`, reason: 'the quadratic formula' });
  const numeric = (sign: 1 | -1) => (-ratNumber(b) + sign * Math.sqrt(discriminantValue)) / (2 * ratNumber(a));
  const exactRoot = (sign: 1 | -1) => {
    if (!rootOfDiscriminant) return null;
    const signed = sign === 1 ? rootOfDiscriminant : exactMul(exactInt(-1), rootOfDiscriminant);
    return exactDiv(exactAdd(minusB, signed), twoA);
  };
  const first = show(exactRoot(1), numeric(1));
  const second = show(exactRoot(-1), numeric(-1));
  steps.push({ math: `${variable}₁ = ${first},   ${variable}₂ = ${second}` });
  return {
    title: `Solve ${original}`,
    steps,
    result: `${variable}₁ = ${first}, ${variable}₂ = ${second}`,
    note: rootOfDiscriminant ? undefined : `≈ ${formatDecimal(numeric(1), 4)} and ${formatDecimal(numeric(-1), 4)}`,
  };
}

export function solveQuadratic(input: string, options: { angle?: AngleMode } = {}): Solution {
  const ctx = defaultContext(options.angle ?? 'deg');
  const equation = parseEquation(input);
  const variables = [...new Set([...variablesOf(equation.lhs), ...variablesOf(equation.rhs)])];
  if (variables.length !== 1) throw new MathError('A quadratic needs exactly one unknown.');
  const difference: Node = { t: 'bin', op: '-', a: equation.lhs, b: equation.rhs };
  const found = coefficients(difference, variables[0], ctx);
  if (!found) throw new MathError('I could not read this as a quadratic equation.');
  if (isZero(found.a)) return solveLinear(input, options);
  return quadraticFrom(found, variables[0], `${equation.text.lhs} = ${equation.text.rhs}`);
}

// ---------------------------------------------------------------------------
// Right triangles

export interface PythagorasInput {
  /** Two of the three sides; the missing one is what gets solved for. Values may be written as "√3". */
  a?: number | string;
  b?: number | string;
  c?: number | string;
  /** Names for the sides in the derivation (default a, b, c). */
  names?: { a?: string; b?: string; c?: string };
  angle?: AngleMode;
}

/**
 * The Pythagoras derivation as it is written in a notebook:
 * `a² + b² = c²` → `a² + (√3)² = 2²` → `a² + 3 = 4` → `a² = 4 - 3` → `a² = 1` → `a = 1`.
 */
export function solvePythagoras(input: PythagorasInput): Solution {
  const ctx = defaultContext(input.angle ?? 'deg');
  const names = { a: input.names?.a || 'a', b: input.names?.b || 'b', c: input.names?.c || 'c' };
  const unknownNames: Partial<Record<'a' | 'b' | 'c', string>> = {};
  const read = (value: number | string | undefined, key: 'a' | 'b' | 'c') => {
    if (value === undefined || value === null || value === '') return null;
    const text = typeof value === 'number' ? formatDecimal(value) : normalizeExpression(String(value));
    const result = calculate(text, { angle: ctx.angle });
    if (!result.ok || result.value === null || result.value <= 0) {
      // A letter or a "?" names the side being looked for rather than being an error.
      const label = String(value).trim();
      if (/^[?a-zA-Z_][a-zA-Z_0-9']{0,7}$/.test(label)) {
        unknownNames[key] = label === '?' ? key : label;
        return null;
      }
      throw new MathError(`"${label}" is not a length I can use. Give a number, a root like "√3", or a letter for the side to find.`);
    }
    return { text: typeof value === 'number' ? formatDecimal(value) : String(value).trim(), value: result.value, exact: exactOf(text, ctx) };
  };
  const sides = { a: read(input.a, 'a'), b: read(input.b, 'b'), c: read(input.c, 'c') };
  for (const key of ['a', 'b', 'c'] as const) if (unknownNames[key]) names[key] = unknownNames[key]!;
  const known = (['a', 'b', 'c'] as const).filter((key) => sides[key]);
  if (known.length < 2) throw new MathError('Give two of the three sides (the legs a and b, and the hypotenuse c), and leave out the one to find.');
  if (known.length > 2) return checkPythagoras(sides as Record<'a' | 'b' | 'c', { text: string; value: number; exact: Exact | null }>, names);
  const unknown = (['a', 'b', 'c'] as const).find((key) => !sides[key])!;
  const steps: SolveStep[] = [{ math: `${names.a}^2 + ${names.b}^2 = ${names.c}^2`, reason: 'the Pythagorean theorem' }];
  const label = names[unknown];

  const squareOf = (side: { text: string; value: number; exact: Exact | null }) => {
    const exactSquare = side.exact ? exactPow(side.exact, 2) : null;
    return { text: show(exactSquare, side.value * side.value), value: side.value * side.value, exact: exactSquare };
  };

  if (unknown === 'c') {
    const a = sides.a!;
    const b = sides.b!;
    steps.push({ math: `${squared(a.text)} + ${squared(b.text)} = ${names.c}^2`, reason: 'put the lengths in' });
    const sa = squareOf(a);
    const sb = squareOf(b);
    steps.push({ math: `${sa.text} + ${sb.text} = ${names.c}^2` });
    const sum = sa.exact && sb.exact ? exactAdd(sa.exact, sb.exact) : null;
    const sumValue = sa.value + sb.value;
    steps.push({ math: `${names.c}^2 = ${show(sum, sumValue)}` });
    const root = sum ? exactSqrt(sum) : null;
    const answer = show(root, Math.sqrt(sumValue));
    steps.push({ math: `${names.c} = ${answer}`, reason: 'take the square root (a length is positive)' });
    return {
      title: `Find ${names.c} with the Pythagorean theorem`,
      steps,
      result: `${names.c} = ${answer}`,
      note: root && isRational(root) ? undefined : `≈ ${formatDecimal(Math.sqrt(sumValue), 4)}`,
    };
  }

  const other = unknown === 'a' ? sides.b! : sides.a!;
  const otherName = unknown === 'a' ? names.b : names.a;
  const hypotenuse = sides.c!;
  if (hypotenuse.value <= other.value) throw new MathError('The hypotenuse has to be longer than either leg.');
  steps.push({
    math: unknown === 'a' ? `${label}^2 + ${squared(other.text)} = ${squared(hypotenuse.text)}` : `${squared(other.text)} + ${label}^2 = ${squared(hypotenuse.text)}`,
    reason: 'put the lengths in',
  });
  const so = squareOf(other);
  const sh = squareOf(hypotenuse);
  steps.push({ math: unknown === 'a' ? `${label}^2 + ${so.text} = ${sh.text}` : `${so.text} + ${label}^2 = ${sh.text}` });
  steps.push({ math: `${label}^2 = ${sh.text} - ${so.text}`, reason: `move ${so.text} to the other side` });
  const difference = sh.exact && so.exact ? exactSub(sh.exact, so.exact) : null;
  const differenceValue = sh.value - so.value;
  steps.push({ math: `${label}^2 = ${show(difference, differenceValue)}` });
  const root = difference ? exactSqrt(difference) : null;
  const answer = show(root, Math.sqrt(differenceValue));
  steps.push({ math: `${label} = ${answer}`, reason: 'take the square root (a length is positive)' });
  return {
    title: `Find ${label} with the Pythagorean theorem`,
    steps,
    result: `${label} = ${answer}`,
    note: root && isRational(root) ? undefined : `≈ ${formatDecimal(Math.sqrt(differenceValue), 4)}`,
  };
}

/** All three sides given: check the theorem instead of refusing to work. */
function checkPythagoras(sides: Record<'a' | 'b' | 'c', { text: string; value: number; exact: Exact | null }>, names: { a: string; b: string; c: string }): Solution {
  const square = (side: { text: string; value: number; exact: Exact | null }) => {
    const exactSquare = side.exact ? exactPow(side.exact, 2) : null;
    return { text: show(exactSquare, side.value * side.value), value: side.value * side.value };
  };
  const sa = square(sides.a);
  const sb = square(sides.b);
  const sc = square(sides.c);
  const sum = sa.value + sb.value;
  const holds = Math.abs(sum - sc.value) < 1e-9 * Math.max(1, sc.value);
  const steps: SolveStep[] = [
    { math: `${names.a}^2 + ${names.b}^2 = ${names.c}^2`, reason: 'the Pythagorean theorem' },
    { math: `${squared(sides.a.text)} + ${squared(sides.b.text)} = ${squared(sides.c.text)}`, reason: 'put the lengths in' },
    { math: `${sa.text} + ${sb.text} = ${sc.text}` },
    { math: `${show(null, sum)} ${holds ? '=' : '≠'} ${sc.text}` },
  ];
  return {
    title: `Check the Pythagorean theorem for ${sides.a.text}, ${sides.b.text}, ${sides.c.text}`,
    steps,
    result: holds ? 'It is a right triangle.' : 'These sides do not make a right triangle.',
    note: holds ? undefined : `${names.a}² + ${names.b}² is ${show(null, sum)}, but ${names.c}² is ${sc.text}.`,
  };
}

export interface TrigInput {
  /** The side across from the angle. */
  opposite?: number | string;
  /** The side next to the angle (not the hypotenuse). */
  adjacent?: number | string;
  hypotenuse?: number | string;
  /** Name of the angle, for the labels (default A). */
  angleName?: string;
  /** Which ratios to work out (default all four). */
  ratios?: Array<'sin' | 'cos' | 'tan' | 'cot'>;
  angle?: AngleMode;
}

/** sin, cos, tan and cot of an acute angle in a right triangle, as exact fractions. */
export function solveTrigRatios(input: TrigInput): Solution {
  const ctx = defaultContext(input.angle ?? 'deg');
  const name = (input.angleName || 'A').trim().slice(0, 12);
  const read = (value: number | string | undefined, what: string) => {
    if (value === undefined || value === null || value === '') return null;
    const text = typeof value === 'number' ? formatDecimal(value) : normalizeExpression(String(value));
    const result = calculate(text, { angle: ctx.angle });
    if (!result.ok || result.value === null || result.value <= 0) throw new MathError(`The ${what} "${String(value)}" is not a length I can use.`);
    return { text: typeof value === 'number' ? formatDecimal(value) : String(value).trim(), value: result.value, exact: exactOf(text, ctx) };
  };
  let opposite = read(input.opposite, 'opposite side');
  let adjacent = read(input.adjacent, 'adjacent side');
  let hypotenuse = read(input.hypotenuse, 'hypotenuse');
  const steps: SolveStep[] = [];

  const derive = (first: { value: number; exact: Exact | null }, second: { value: number; exact: Exact | null }, mode: 'sum' | 'difference') => {
    const fs = first.exact ? exactPow(first.exact, 2) : null;
    const ss = second.exact ? exactPow(second.exact, 2) : null;
    const combined = fs && ss ? (mode === 'sum' ? exactAdd(fs, ss) : exactSub(fs, ss)) : null;
    const value = mode === 'sum' ? first.value ** 2 + second.value ** 2 : first.value ** 2 - second.value ** 2;
    const root = combined ? exactSqrt(combined) : null;
    return { text: show(root, Math.sqrt(value)), value: Math.sqrt(value), exact: root };
  };

  if (opposite && adjacent && !hypotenuse) {
    hypotenuse = derive(opposite, adjacent, 'sum');
    steps.push({ math: `${name}: hypotenuse = √(${squared(opposite.text)} + ${squared(adjacent.text)}) = ${hypotenuse.text}`, reason: 'the Pythagorean theorem gives the missing side' });
  } else if (opposite && hypotenuse && !adjacent) {
    adjacent = derive(hypotenuse, opposite, 'difference');
    steps.push({ math: `adjacent = √(${squared(hypotenuse.text)} - ${squared(opposite.text)}) = ${adjacent.text}`, reason: 'the Pythagorean theorem gives the missing side' });
  } else if (adjacent && hypotenuse && !opposite) {
    opposite = derive(hypotenuse, adjacent, 'difference');
    steps.push({ math: `opposite = √(${squared(hypotenuse.text)} - ${squared(adjacent.text)}) = ${opposite.text}`, reason: 'the Pythagorean theorem gives the missing side' });
  }
  if (!opposite || !adjacent || !hypotenuse) throw new MathError('Give two of: the opposite side, the adjacent side and the hypotenuse.');
  if (hypotenuse.value <= opposite.value || hypotenuse.value <= adjacent.value) throw new MathError('The hypotenuse has to be the longest side.');

  const ratio = (top: { text: string; value: number; exact: Exact | null }, bottom: { text: string; value: number; exact: Exact | null }) => {
    const exactValue = top.exact && bottom.exact ? exactDiv(top.exact, bottom.exact) : null;
    return { text: show(exactValue, top.value / bottom.value), value: top.value / bottom.value };
  };
  const wanted = input.ratios?.length ? input.ratios : (['sin', 'cos', 'tan', 'cot'] as const);
  const definitions: Record<'sin' | 'cos' | 'tan' | 'cot', { words: string; parts: [typeof opposite, typeof opposite] }> = {
    sin: { words: 'opposite / hypotenuse', parts: [opposite, hypotenuse] },
    cos: { words: 'adjacent / hypotenuse', parts: [adjacent, hypotenuse] },
    tan: { words: 'opposite / adjacent', parts: [opposite, adjacent] },
    cot: { words: 'adjacent / opposite', parts: [adjacent, opposite] },
  };
  const results: string[] = [];
  for (const key of wanted) {
    const definition = definitions[key];
    if (!definition) continue;
    const [top, bottom] = definition.parts;
    const value = ratio(top!, bottom!);
    steps.push({ math: `${key} ${name} = ${definition.words} = ${top!.text}/${bottom!.text} = ${value.text}`, reason: undefined });
    results.push(`${key} ${name} = ${value.text}`);
  }
  const angleDegrees = (Math.asin(opposite.value / hypotenuse.value) * 180) / Math.PI;
  return {
    title: `Trigonometric ratios of ${name}`,
    steps,
    result: results.join(', '),
    note: `The sides are ${opposite.text} (opposite), ${adjacent.text} (adjacent) and ${hypotenuse.text} (hypotenuse); ${name} ≈ ${formatDecimal(angleDegrees, 2)}°.`,
  };
}

// ---------------------------------------------------------------------------
// Entry point

export interface SolveRequest {
  kind?: SolveKind;
  /** An expression or an equation, for the expression and equation solvers. */
  input?: string;
  /** Pythagoras: two of the three sides. */
  sides?: { a?: number | string; b?: number | string; c?: number | string; names?: { a?: string; b?: string; c?: string } };
  /** Trigonometry: two sides of a right triangle. */
  triangle?: { opposite?: number | string; adjacent?: number | string; hypotenuse?: number | string; angleName?: string; ratios?: Array<'sin' | 'cos' | 'tan' | 'cot'> };
  angle?: AngleMode;
}

/** Picks the right solver, so a model only has to say what it has. */
export function solve(request: SolveRequest): Solution {
  const angle = request.angle ?? 'deg';
  const kind = request.kind && request.kind !== 'auto' ? request.kind : null;
  if (kind === 'pythagoras' || (!kind && request.sides)) {
    if (!request.sides) throw new MathError('Give the sides of the triangle.');
    return solvePythagoras({ ...request.sides, names: request.sides.names, angle });
  }
  if (kind === 'trig' || (!kind && request.triangle)) {
    if (!request.triangle) throw new MathError('Give two sides of the right triangle.');
    return solveTrigRatios({ ...request.triangle, angle });
  }
  const input = (request.input ?? '').trim();
  if (!input) throw new MathError('Give an expression, an equation or the sides of a triangle.');
  if (kind === 'expression') return solveExpression(input, { angle });
  if (kind === 'linear') return solveLinear(input, { angle });
  if (kind === 'quadratic') return solveQuadratic(input, { angle });
  if (input.includes('=')) return solveLinear(input, { angle });
  return solveExpression(input, { angle });
}

/** A one-line summary for tool results. */
export function solutionText(solution: Solution): string {
  const lines = solution.steps.map((step) => (step.reason ? `${step.math}    (${step.reason})` : step.math));
  return [solution.title, ...lines, `Answer: ${solution.result}`, solution.note ?? ''].filter(Boolean).join('\n');
}

export { printNode };
