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
  ratDiv,
  ratMul,
  ratNeg,
  ratNumber,
  ratSub,
  type Exact,
  type Rational,
} from './exact';
import { antiderivativePolynomial, asPolynomial, CalculusError, definiteIntegral, differentiate, evalPolynomial, printPolynomial } from './calculus';
import { calculate, evaluationSteps } from './calc';
import {
  defaultContext,
  dependsOn,
  evaluateExact,
  evaluateNode,
  formatDecimal,
  MathError,
  normalizeExpression,
  parseEquation,
  parseExpression,
  parseInequality,
  printNode,
  variablesOf,
  type AngleMode,
  type EvalContext,
  type Inequality,
  type InequalityOp,
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

export type SolveKind =
  | 'auto'
  | 'expression'
  | 'equation'
  | 'linear'
  | 'quadratic'
  | 'pythagoras'
  | 'trig'
  | 'system'
  | 'inequality'
  | 'logarithmic'
  | 'trig-equation'
  | 'derivative'
  | 'integral';

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
// Systems of linear equations

export interface SystemInput {
  equations: string[];
}

/** Coefficients of a linear combination of `variables` (plus a constant), read off by sampling like `coefficients()`. */
function linearCoefficients(node: Node, variables: string[], ctx: EvalContext): Rational[] | null {
  const at = (values: number[]) => evaluateNode(node, { ...ctx, vars: { ...ctx.vars, ...Object.fromEntries(variables.map((v, i) => [v, values[i]])) } });
  let base: number;
  try {
    base = at(new Array(variables.length).fill(0));
  } catch {
    return null;
  }
  const deltas: number[] = [];
  for (let i = 0; i < variables.length; i++) {
    const probe = new Array(variables.length).fill(0);
    probe[i] = 1;
    try {
      deltas.push(at(probe) - base);
    } catch {
      return null;
    }
  }
  // Confirm it really is linear: every variable at once should match the sum of the individual deltas.
  let atAll: number;
  try {
    atAll = at(new Array(variables.length).fill(1));
  } catch {
    return null;
  }
  const predicted = base + deltas.reduce((sum, d) => sum + d, 0);
  if (Math.abs(atAll - predicted) > 1e-6 * Math.max(1, Math.abs(atAll))) return null;
  const rationals = [...deltas, base].map((value) => approxRational(value, 100_000, 1e-9));
  return rationals.every((value) => value) ? (rationals as Rational[]) : null;
}

/** N linear equations in N unknowns (up to 4), by Gaussian elimination with exact rational arithmetic. */
export function solveSystem(input: SystemInput, options: { angle?: AngleMode } = {}): Solution {
  const ctx = defaultContext(options.angle ?? 'deg');
  const texts = (input.equations ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (texts.length < 2) throw new MathError('Give at least two equations.');
  const equations = texts.map((text) => parseEquation(text));
  const variables = [...new Set(equations.flatMap((eq) => [...variablesOf(eq.lhs), ...variablesOf(eq.rhs)]))];
  if (variables.length !== equations.length) {
    throw new MathError(
      `This system has ${variables.length} unknown${variables.length === 1 ? '' : 's'}${variables.length ? ` (${variables.join(', ')})` : ''} but ${equations.length} equations — give exactly one equation per unknown.`,
    );
  }
  if (variables.length > 4) throw new MathError('I can solve systems with up to 4 unknowns.');

  const n = variables.length;
  // Row i: [a1 ... an | b] meaning a1·x1 + ... + an·xn = b.
  const matrix: Rational[][] = equations.map((eq) => {
    const difference: Node = { t: 'bin', op: '-', a: eq.lhs, b: eq.rhs };
    const found = linearCoefficients(difference, variables, ctx);
    if (!found) throw new MathError(`"${eq.text.lhs} = ${eq.text.rhs}" is not linear in ${variables.join(', ')}.`);
    const row = found.slice(0, n);
    row.push(ratNeg(found[n]));
    return row;
  });

  const steps: SolveStep[] = equations.map((eq) => ({ math: `${eq.text.lhs} = ${eq.text.rhs}` }));
  steps.push({ math: 'Eliminate one unknown at a time until each equation has just one left.', reason: 'Gaussian elimination' });

  for (let col = 0; col < n; col++) {
    let pivot = col;
    while (pivot < n && isZero(matrix[pivot][col])) pivot++;
    if (pivot === n) throw new MathError('This system does not have exactly one solution (it may have none, or infinitely many).');
    if (pivot !== col) [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const pivotValue = matrix[col][col];
    for (let row = 0; row < n; row++) {
      if (row === col || isZero(matrix[row][col])) continue;
      const factor = ratDiv(matrix[row][col], pivotValue)!;
      for (let k = col; k <= n; k++) matrix[row][k] = ratSub(matrix[row][k], ratMul(factor, matrix[col][k]));
    }
  }
  const values = matrix.map((row, i) => ratDiv(row[n], row[i])!);
  for (const [i, variable] of variables.entries()) steps.push({ math: `${variable} = ${showRational(values[i])}` });
  return {
    title: `Solve the system in ${variables.join(', ')}`,
    steps,
    result: variables.map((v, i) => `${v} = ${showRational(values[i])}`).join(', '),
    note: values.some((v) => v.d !== 1n) ? variables.map((v, i) => `${v} ≈ ${formatDecimal(ratNumber(values[i]), 4)}`).join(', ') : undefined,
  };
}

// ---------------------------------------------------------------------------
// Inequalities

const flipOp = (op: InequalityOp): InequalityOp => (op === '<' ? '>' : op === '>' ? '<' : op === '<=' ? '>=' : '<=');
const holdsFor = (op: InequalityOp, value: number) => (op === '<' ? value < 0 : op === '>' ? value > 0 : op === '<=' ? value <= 0 : value >= 0);

/** Linear or quadratic inequalities in one unknown: `<`, `>`, `<=`, `>=` against 0 after moving everything to one side. */
export function solveInequality(input: string, options: { angle?: AngleMode } = {}): Solution {
  const ctx = defaultContext(options.angle ?? 'deg');
  const inequality: Inequality = parseInequality(input);
  const variables = [...new Set([...variablesOf(inequality.lhs), ...variablesOf(inequality.rhs)])];
  if (variables.length !== 1) throw new MathError(variables.length === 0 ? 'There is no unknown in this inequality.' : `This inequality has more than one unknown (${variables.join(', ')}).`);
  const variable = variables[0];
  const original = `${inequality.text.lhs} ${inequality.op} ${inequality.text.rhs}`;
  const difference: Node = { t: 'bin', op: '-', a: inequality.lhs, b: inequality.rhs };
  const found = coefficients(difference, variable, ctx);
  if (!found) throw new MathError('I can only solve inequalities that are linear or quadratic in one unknown.');
  const steps: SolveStep[] = [{ math: original }];

  if (isZero(found.a)) {
    const { b, c } = found;
    if (isZero(b)) {
      const holds = holdsFor(inequality.op, ratNumber(c));
      steps.push({ math: holds ? 'This is always true.' : 'This is never true.' });
      return { title: `Solve ${original}`, steps, result: holds ? 'all real numbers' : 'no solution' };
    }
    const negative = ratNumber(b) < 0;
    const boundary = rat(-c.n * b.d, c.d * b.n);
    const op = negative ? flipOp(inequality.op) : inequality.op;
    steps.push({ math: `${showRational(b)}${variable} ${inequality.op} ${showRational(rat(-c.n, c.d))}`, reason: 'move the numbers to the right, the unknown to the left' });
    steps.push({ math: `${variable} ${op} ${showRational(boundary)}`, reason: negative ? `divide both sides by ${showRational(b)} (negative, so the inequality flips)` : b.d !== 1n || b.n !== 1n ? `divide both sides by ${showRational(b)}` : undefined });
    return { title: `Solve ${original}`, steps, result: `${variable} ${op} ${showRational(boundary)}`, note: boundary.d === 1n ? undefined : `≈ ${variable} ${op} ${formatDecimal(ratNumber(boundary), 6)}` };
  }

  const { a, b, c } = found;
  const discriminant = exactSub(exactPow(exact(b), 2)!, exactMul(exactMul(exactInt(4), exact(a)), exact(c)));
  const discriminantValue = exactNumber(discriminant);
  const opensUp = ratNumber(a) > 0;
  const wantsPositive = inequality.op === '>' || inequality.op === '>=';
  const inclusive = inequality.op === '<=' || inequality.op === '>=';
  steps.push({ math: `Δ = b^2 - 4ac = ${formatExact(discriminant)}`, reason: 'find where the parabola crosses zero first' });

  if (discriminantValue < 0) {
    const alwaysPositive = opensUp;
    const holds = wantsPositive === alwaysPositive;
    steps.push({ math: `Δ < 0: the parabola never touches zero, and it opens ${opensUp ? 'upward' : 'downward'}, so it is always ${opensUp ? 'positive' : 'negative'}.` });
    return { title: `Solve ${original}`, steps, result: holds ? 'all real numbers' : 'no solution' };
  }

  const root = exactSqrt(discriminant);
  const twoA = exactMul(exactInt(2), exact(a));
  const minusB = exactMul(exactInt(-1), exact(b));
  const sqrtValue = Math.sqrt(discriminantValue);
  const numRootLow = (-ratNumber(b) - sqrtValue) / (2 * ratNumber(a));
  const numRootHigh = (-ratNumber(b) + sqrtValue) / (2 * ratNumber(a));
  const lowIsMinus = numRootLow <= numRootHigh;
  const lowExact = root && exactDiv(lowIsMinus ? exactSub(minusB, root) : exactAdd(minusB, root), twoA);
  const highExact = root && exactDiv(lowIsMinus ? exactAdd(minusB, root) : exactSub(minusB, root), twoA);
  const lo = Math.min(numRootLow, numRootHigh);
  const hi = Math.max(numRootLow, numRootHigh);
  const loText = show(lowExact, lo);
  const hiText = show(highExact, hi);
  steps.push({ math: `${variable}₁ = ${loText},   ${variable}₂ = ${hiText}`, reason: 'the roots split the number line into three parts' });

  let result: string;
  if (discriminantValue === 0) {
    if (wantsPositive === opensUp) result = inclusive ? 'all real numbers' : `all real numbers except ${variable} = ${loText}`;
    else result = inclusive ? `${variable} = ${loText}` : 'no solution';
  } else if (wantsPositive === opensUp) {
    result = `${variable} ${inclusive ? '≤' : '<'} ${loText} or ${variable} ${inclusive ? '≥' : '>'} ${hiText}`;
  } else {
    result = `${loText} ${inclusive ? '≤' : '<'} ${variable} ${inclusive ? '≤' : '<'} ${hiText}`;
  }
  steps.push({ math: result });
  return { title: `Solve ${original}`, steps, result, note: root ? undefined : `≈ ${variable}₁ ≈ ${formatDecimal(lo, 4)}, ${variable}₂ ≈ ${formatDecimal(hi, 4)}` };
}

// ---------------------------------------------------------------------------
// Logarithmic and exponential equations

interface RewriteAttempt {
  rewritten: string;
  steps: SolveStep[];
}

/** `log(f(x)) = k`, `ln(f(x)) = k`, or `log(f(x), base) = k`, with a number on the other side. */
function tryLogForm(side: Node, other: Node, variable: string, ctx: EvalContext): RewriteAttempt | null {
  if (side.t !== 'call' || !['log', 'ln', 'log2'].includes(side.name)) return null;
  if (!dependsOn(side.args[0], variable) || dependsOn(other, variable)) return null;
  let target: number;
  try {
    target = evaluateNode(other, ctx);
  } catch {
    return null;
  }
  const base = side.name === 'ln' ? Math.E : side.name === 'log2' ? 2 : side.args[1] ? evaluateNode(side.args[1], ctx) : 10;
  const baseText = side.name === 'ln' ? 'e' : formatDecimal(base);
  const rhsValue = base ** target;
  const argText = printNode(side.args[0]);
  return {
    rewritten: `${argText} = ${formatDecimal(rhsValue, 10)}`,
    steps: [{ math: `${argText} = ${baseText}^${formatDecimal(target)} = ${formatDecimal(rhsValue, 6)}`, reason: 'undo the logarithm by raising both sides as an exponent' }],
  };
}

/** `a^f(x) = k` with a constant base and a number on the other side. */
function tryExpForm(side: Node, other: Node, variable: string, ctx: EvalContext): RewriteAttempt | null {
  if (side.t !== 'bin' || side.op !== '^') return null;
  if (dependsOn(side.a, variable) || !dependsOn(side.b, variable) || dependsOn(other, variable)) return null;
  let base: number;
  let target: number;
  try {
    base = evaluateNode(side.a, ctx);
    target = evaluateNode(other, ctx);
  } catch {
    return null;
  }
  if (base <= 0 || base === 1 || target <= 0) return null;
  const exponentValue = Math.log(target) / Math.log(base);
  const expText = printNode(side.b);
  return {
    rewritten: `${expText} = ${formatDecimal(exponentValue, 10)}`,
    steps: [{ math: `${expText} = log(${formatDecimal(target)}) / log(${formatDecimal(base)}) = ${formatDecimal(exponentValue, 6)}`, reason: 'take the logarithm of both sides' }],
  };
}

export function solveLogarithmic(input: string, options: { angle?: AngleMode } = {}): Solution {
  const ctx = defaultContext(options.angle ?? 'deg');
  const equation = parseEquation(input);
  const variables = [...new Set([...variablesOf(equation.lhs), ...variablesOf(equation.rhs)])];
  if (variables.length !== 1) throw new MathError(variables.length === 0 ? 'There is no unknown in this equation.' : `This equation has more than one unknown (${variables.join(', ')}).`);
  const variable = variables[0];
  const original = `${equation.text.lhs} = ${equation.text.rhs}`;
  const attempt =
    tryLogForm(equation.lhs, equation.rhs, variable, ctx) ??
    tryLogForm(equation.rhs, equation.lhs, variable, ctx) ??
    tryExpForm(equation.lhs, equation.rhs, variable, ctx) ??
    tryExpForm(equation.rhs, equation.lhs, variable, ctx);
  if (!attempt) throw new MathError('I can solve log(...) = number and a^(...) = number, with the unknown linear inside — one logarithm or one exponential, alone on one side.');
  let inner: Solution;
  try {
    inner = solveLinear(attempt.rewritten, options);
  } catch (err) {
    throw new MathError(err instanceof MathError ? err.message : 'I could not finish solving that.');
  }
  return {
    title: `Solve ${original}`,
    steps: [{ math: original }, ...attempt.steps, ...inner.steps.slice(1)],
    result: inner.result,
    note: inner.note,
  };
}

// ---------------------------------------------------------------------------
// Trigonometric equations

/** `sin(m·x + k) = value`, `cos(...)`, `tan(...)` or `cot(...)`, with a number on the other side. */
function tryTrigForm(side: Node, other: Node, variable: string, ctx: EvalContext): { fn: 'sin' | 'cos' | 'tan' | 'cot'; argText: string; m: number; k: number; value: number } | null {
  if (side.t !== 'call' || !['sin', 'cos', 'tan', 'cot'].includes(side.name)) return null;
  if (dependsOn(other, variable)) return null;
  const arg = side.args[0];
  let atZero: number;
  let atOne: number;
  let atTwo: number;
  let value: number;
  try {
    atZero = evaluateNode(arg, { ...ctx, vars: { ...ctx.vars, [variable]: 0 } });
    atOne = evaluateNode(arg, { ...ctx, vars: { ...ctx.vars, [variable]: 1 } });
    atTwo = evaluateNode(arg, { ...ctx, vars: { ...ctx.vars, [variable]: 2 } });
    value = evaluateNode(other, ctx);
  } catch {
    return null;
  }
  const m = atOne - atZero;
  if (Math.abs(atTwo - (atZero + 2 * m)) > 1e-6 * Math.max(1, Math.abs(atTwo)) || m === 0) return null;
  return { fn: side.name as 'sin' | 'cos' | 'tan' | 'cot', argText: printNode(arg), m, k: atZero, value };
}

/** The general solution of sin/cos/tan/cot(linear expression) = value, one family of x per family of the angle. */
export function solveTrigEquation(input: string, options: { angle?: AngleMode } = {}): Solution {
  const angleMode = options.angle ?? 'deg';
  const ctx = defaultContext(angleMode);
  const equation = parseEquation(input);
  const variables = [...new Set([...variablesOf(equation.lhs), ...variablesOf(equation.rhs)])];
  if (variables.length !== 1) throw new MathError(variables.length === 0 ? 'There is no unknown in this equation.' : `This equation has more than one unknown (${variables.join(', ')}).`);
  const variable = variables[0];
  const original = `${equation.text.lhs} = ${equation.text.rhs}`;
  const attempt = tryTrigForm(equation.lhs, equation.rhs, variable, ctx) ?? tryTrigForm(equation.rhs, equation.lhs, variable, ctx);
  if (!attempt) throw new MathError('I can solve sin, cos, tan or cot of a linear expression equal to a number, with one unknown.');
  const { fn, argText, m, k, value } = attempt;
  const steps: SolveStep[] = [{ math: original }];
  if ((fn === 'sin' || fn === 'cos') && Math.abs(value) > 1 + 1e-9) {
    steps.push({ math: `${fn} is always between -1 and 1, so there is no solution.` });
    return { title: `Solve ${original}`, steps, result: 'no solution' };
  }
  const unit = angleMode === 'deg' ? '°' : '';
  const toUnit = (radians: number) => (angleMode === 'deg' ? (radians * 180) / Math.PI : radians);
  const straight = angleMode === 'deg' ? 180 : Math.PI;
  const full = angleMode === 'deg' ? 360 : 2 * Math.PI;
  const base = fn === 'sin' ? toUnit(Math.asin(value)) : fn === 'cos' ? toUnit(Math.acos(value)) : toUnit(Math.atan(value));
  steps.push({ math: `${fn}⁻¹(${formatDecimal(value, 6)}) = ${formatDecimal(base, 4)}${unit}`, reason: 'the reference angle' });

  const period = fn === 'sin' || fn === 'cos' ? full : straight;
  const angleBases = fn === 'sin' ? [base, straight - base] : fn === 'cos' ? [base, -base] : [base];
  const results: string[] = [];
  for (const [i, angleBase] of angleBases.entries()) {
    steps.push({ math: `${argText} = ${formatDecimal(angleBase, 4)}${unit} + k·${formatDecimal(period, 4)}${unit},  k ∈ ℤ`, reason: i === 0 ? 'one family of angles per period' : undefined });
    const xBase = (angleBase - k) / m;
    const xPeriod = Math.abs(period / m);
    const line = `${variable} = ${formatDecimal(xBase, 4)}${unit} + k·${formatDecimal(xPeriod, 4)}${unit},  k ∈ ℤ`;
    steps.push({ math: line, reason: `solve ${argText} for ${variable}` });
    results.push(line);
  }
  return { title: `Solve ${original}`, steps, result: results.join(';  ') };
}

// ---------------------------------------------------------------------------
// Basic calculus

export interface DerivativeInput {
  expression: string;
  variable?: string;
  /** Also evaluate the derivative at this point. */
  at?: number;
}

/** Trigonometric derivative rules only hold with x in radians, regardless of the board's angle setting. */
export function solveDerivative(input: DerivativeInput): Solution {
  const variable = (input.variable || 'x').trim();
  const node = parseExpression(input.expression);
  const ctx = defaultContext('rad');
  let derivative: Node;
  try {
    derivative = differentiate(node, variable);
  } catch (err) {
    throw new MathError(err instanceof CalculusError ? err.message : 'I could not differentiate that.');
  }
  const printedFn = printNode(node);
  const printedDerivative = printNode(derivative);
  const steps: SolveStep[] = [{ math: `f(${variable}) = ${printedFn}` }, { math: `f'(${variable}) = ${printedDerivative}`, reason: 'the sum, product, quotient, power and chain rules' }];
  let result = `f'(${variable}) = ${printedDerivative}`;
  if (input.at !== undefined && Number.isFinite(input.at)) {
    const value = evaluateNode(derivative, { ...ctx, vars: { ...ctx.vars, [variable]: input.at } });
    steps.push({ math: `f'(${formatDecimal(input.at)}) = ${formatDecimal(value, 6)}`, reason: `evaluate at ${variable} = ${formatDecimal(input.at)}` });
    result = `f'(${formatDecimal(input.at)}) = ${formatDecimal(value, 6)}`;
  }
  const usesTrig = /\b(sin|cos|tan|cot|sec|csc)\b/.test(input.expression);
  return { title: `Differentiate ${printedFn}`, steps, result, note: usesTrig ? `${variable} is in radians here, as calculus always assumes.` : undefined };
}

export interface IntegralInput {
  expression: string;
  variable?: string;
  from: number | string;
  to: number | string;
}

/** A definite integral: an exact antiderivative for polynomials, adaptive Simpson's rule otherwise. */
export function solveIntegral(input: IntegralInput): Solution {
  const variable = (input.variable || 'x').trim();
  const node = parseExpression(input.expression);
  const ctx = defaultContext('rad');
  const bound = (value: number | string) => (typeof value === 'number' ? value : evaluateNode(parseExpression(String(value)), ctx));
  const from = bound(input.from);
  const to = bound(input.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new MathError('Give finite numbers for the limits of integration.');
  const printedFn = printNode(node);
  const title = `Evaluate ∫ ${printedFn} d${variable} from ${formatDecimal(from)} to ${formatDecimal(to)}`;
  const header = `∫ from ${formatDecimal(from)} to ${formatDecimal(to)} of ${printedFn} d${variable}`;
  const steps: SolveStep[] = [{ math: header }];

  const polynomial = asPolynomial(node, variable, ctx);
  if (polynomial && polynomial.length) {
    const antiderivative = antiderivativePolynomial(polynomial);
    steps.push({ math: `F(${variable}) = ${printPolynomial(antiderivative, variable)}`, reason: 'the power rule, term by term' });
    const atTo = evalPolynomial(antiderivative, to);
    const atFrom = evalPolynomial(antiderivative, from);
    steps.push({ math: `F(${formatDecimal(to)}) - F(${formatDecimal(from)}) = ${formatDecimal(atTo, 6)} - ${formatDecimal(atFrom, 6)}`, reason: 'the fundamental theorem of calculus' });
    const value = atTo - atFrom;
    const asExact = approxRational(value, 10_000, 1e-9);
    const text = asExact ? showRational(asExact) : formatDecimal(value, 6);
    steps.push({ math: `= ${text}` });
    return { title, steps, result: text, note: asExact && asExact.d === 1n ? undefined : `≈ ${formatDecimal(value, 6)}` };
  }

  const value = definiteIntegral((x) => evaluateNode(node, { ...ctx, vars: { ...ctx.vars, [variable]: x } }), from, to);
  steps.push({ math: `≈ ${formatDecimal(value, 6)}`, reason: 'no simple antiderivative was recognized, so this is evaluated numerically (adaptive Simpson’s rule)' });
  return { title, steps, result: formatDecimal(value, 6), note: 'Numerical result — an exact antiderivative is only shown for polynomials.' };
}

// ---------------------------------------------------------------------------
// Entry point

export interface SolveRequest {
  kind?: SolveKind;
  /** An expression, equation, inequality or log/trig equation, for those solvers. */
  input?: string;
  /** Pythagoras: two of the three sides. */
  sides?: { a?: number | string; b?: number | string; c?: number | string; names?: { a?: string; b?: string; c?: string } };
  /** Trigonometry: two sides of a right triangle. */
  triangle?: { opposite?: number | string; adjacent?: number | string; hypotenuse?: number | string; angleName?: string; ratios?: Array<'sin' | 'cos' | 'tan' | 'cot'> };
  /** A system of linear equations, one per unknown. */
  system?: SystemInput;
  /** A derivative, optionally evaluated at a point. */
  derivative?: DerivativeInput;
  /** A definite integral. */
  integral?: IntegralInput;
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
  if (kind === 'system' || (!kind && request.system)) {
    if (!request.system) throw new MathError('Give the equations of the system, one per unknown.');
    return solveSystem(request.system, { angle });
  }
  if (kind === 'derivative' || (!kind && request.derivative)) {
    if (!request.derivative) throw new MathError('Give the expression to differentiate.');
    return solveDerivative(request.derivative);
  }
  if (kind === 'integral' || (!kind && request.integral)) {
    if (!request.integral) throw new MathError('Give the expression and the limits of integration.');
    return solveIntegral(request.integral);
  }
  const input = (request.input ?? '').trim();
  if (!input) throw new MathError('Give an expression, an equation, an inequality, a system, a derivative or an integral.');
  if (kind === 'expression') return solveExpression(input, { angle });
  if (kind === 'linear') return solveLinear(input, { angle });
  if (kind === 'quadratic') return solveQuadratic(input, { angle });
  if (kind === 'inequality') return solveInequality(input, { angle });
  if (kind === 'logarithmic') return solveLogarithmic(input, { angle });
  if (kind === 'trig-equation') return solveTrigEquation(input, { angle });
  if (!kind && /[<>]/.test(input)) return solveInequality(input, { angle });
  if (input.includes('=')) return solveLinear(input, { angle });
  return solveExpression(input, { angle });
}

/** A one-line summary for tool results. */
export function solutionText(solution: Solution): string {
  const lines = solution.steps.map((step) => (step.reason ? `${step.math}    (${step.reason})` : step.math));
  return [solution.title, ...lines, `Answer: ${solution.result}`, solution.note ?? ''].filter(Boolean).join('\n');
}

export { printNode };
