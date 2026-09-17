/**
 * Basic calculus: symbolic differentiation over the same expression tree the calculator uses, and
 * definite integrals — a symbolic antiderivative for polynomials (the common school case), and
 * adaptive Simpson's rule everywhere else (a standard, robust numerical method, not a guess).
 */
import { dependsOn, evaluateNode, MathError, type EvalContext, type Node } from './expr';

export class CalculusError extends MathError {}

// ---------------------------------------------------------------------------
// Symbolic differentiation

const num = (value: number): Node => ({ t: 'num', value, text: value < 0 ? `(${value})` : String(value) });
const isZeroNode = (n: Node): boolean => n.t === 'num' && n.value === 0;
const isOneNode = (n: Node): boolean => n.t === 'num' && n.value === 1;

function add(a: Node, b: Node): Node {
  if (isZeroNode(a)) return b;
  if (isZeroNode(b)) return a;
  return { t: 'bin', op: '+', a, b };
}
function sub(a: Node, b: Node): Node {
  if (isZeroNode(b)) return a;
  if (isZeroNode(a)) return { t: 'neg', a: b };
  return { t: 'bin', op: '-', a, b };
}
function mul(a: Node, b: Node): Node {
  if (isZeroNode(a) || isZeroNode(b)) return num(0);
  if (isOneNode(a)) return b;
  if (isOneNode(b)) return a;
  return { t: 'bin', op: '*', a, b };
}
function div(a: Node, b: Node): Node {
  if (isZeroNode(a)) return num(0);
  if (isOneNode(b)) return a;
  return { t: 'bin', op: '/', a, b };
}
function powNode(a: Node, e: number): Node {
  if (e === 0) return num(1);
  if (e === 1) return a;
  return { t: 'bin', op: '^', a, b: num(e) };
}
function negNode(a: Node): Node {
  return isZeroNode(a) ? num(0) : { t: 'neg', a };
}
const call = (name: string, ...args: Node[]): Node => ({ t: 'call', name, args });

/**
 * d/dx of a tree with the standard sum/product/quotient/power/chain rules. Throws for forms outside
 * "basic calculus" (a variable exponent AND base together, factorials, etc.) rather than guessing.
 * Trigonometric rules (d/dx sin x = cos x) are only true for x in radians, so callers evaluating a
 * numeric result should use radians regardless of the board's angle setting.
 */
export function differentiate(node: Node, variable: string): Node {
  switch (node.t) {
    case 'num':
    case 'const':
      return num(0);
    case 'var':
      return num(node.name === variable ? 1 : 0);
    case 'neg':
      return negNode(differentiate(node.a, variable));
    case 'pct':
      return div(differentiate(node.a, variable), num(100));
    case 'fact':
      throw new CalculusError('The derivative of a factorial is not something I can do symbolically.');
    case 'bin': {
      const { op, a, b } = node;
      switch (op) {
        case '+':
          return add(differentiate(a, variable), differentiate(b, variable));
        case '-':
          return sub(differentiate(a, variable), differentiate(b, variable));
        case '*':
          return add(mul(differentiate(a, variable), b), mul(a, differentiate(b, variable)));
        case '/':
          return div(sub(mul(differentiate(a, variable), b), mul(a, differentiate(b, variable))), powNode(b, 2));
        case '^': {
          const aVaries = dependsOn(a, variable);
          const bVaries = dependsOn(b, variable);
          if (!bVaries) {
            if (b.t !== 'num') throw new CalculusError('I can only differentiate a power with a constant, numeric exponent.');
            return mul(mul(num(b.value), powNode(a, b.value - 1)), differentiate(a, variable));
          }
          if (!aVaries) return mul(mul(node, call('ln', a)), differentiate(b, variable));
          throw new CalculusError('I can only differentiate a power when the base or the exponent is constant, not both varying.');
        }
        case '%':
          throw new CalculusError('The derivative of a remainder is not something I can do symbolically.');
        default:
          throw new CalculusError('I cannot differentiate that.');
      }
    }
    case 'call': {
      const [arg] = node.args;
      if (!arg) throw new CalculusError(`I do not know the derivative of ${node.name}().`);
      const chainFactor = differentiate(arg, variable);
      const chain = (outer: Node) => mul(outer, chainFactor);
      switch (node.name) {
        case 'sin':
          return chain(call('cos', arg));
        case 'cos':
          return chain(negNode(call('sin', arg)));
        case 'tan':
          return chain(powNode(call('sec', arg), 2));
        case 'cot':
          return chain(negNode(powNode(call('csc', arg), 2)));
        case 'sec':
          return chain(mul(call('sec', arg), call('tan', arg)));
        case 'csc':
          return chain(negNode(mul(call('csc', arg), call('cot', arg))));
        case 'ln':
          return chain(div(num(1), arg));
        case 'log':
          return chain(div(num(1), mul(arg, call('ln', num(10)))));
        case 'log2':
          return chain(div(num(1), mul(arg, call('ln', num(2)))));
        case 'exp':
          return chain(node);
        case 'sqrt':
          return chain(div(num(1), mul(num(2), node)));
        case 'abs':
          throw new CalculusError('The derivative of an absolute value is not smooth at 0; I will not guess a sign.');
        default:
          throw new CalculusError(`I do not know the derivative of ${node.name}().`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Polynomial recognition, for an exact antiderivative

export interface PolyTerm {
  coefficient: number;
  /** A non-negative integer: only true polynomials get a symbolic antiderivative here. */
  exponent: number;
}

/** A bare `variable` or `variable^n` (n a non-negative integer), coefficient 1. */
function bareTermOf(node: Node, variable: string): PolyTerm | null {
  if (node.t === 'var' && node.name === variable) return { coefficient: 1, exponent: 1 };
  if (node.t === 'bin' && node.op === '^' && node.a.t === 'var' && node.a.name === variable && node.b.t === 'num' && Number.isInteger(node.b.value) && node.b.value >= 0) {
    return { coefficient: 1, exponent: node.b.value };
  }
  return null;
}

/** Multiplies two term-lists together (distributes), the standard way to multiply polynomials. */
function multiplyTerms(a: PolyTerm[], b: PolyTerm[]): PolyTerm[] {
  const out: PolyTerm[] = [];
  for (const x of a) for (const y of b) out.push({ coefficient: x.coefficient * y.coefficient, exponent: x.exponent + y.exponent });
  return out;
}

function collectPolynomialTerms(node: Node, variable: string, ctx: EvalContext, sign: number, out: PolyTerm[]): boolean {
  if (node.t === 'bin' && node.op === '+') return collectPolynomialTerms(node.a, variable, ctx, sign, out) && collectPolynomialTerms(node.b, variable, ctx, sign, out);
  if (node.t === 'bin' && node.op === '-') return collectPolynomialTerms(node.a, variable, ctx, sign, out) && collectPolynomialTerms(node.b, variable, ctx, -sign, out);
  if (node.t === 'neg') return collectPolynomialTerms(node.a, variable, ctx, -sign, out);
  if (node.t === 'bin' && node.op === '*') {
    const left: PolyTerm[] = [];
    const right: PolyTerm[] = [];
    if (!collectPolynomialTerms(node.a, variable, ctx, 1, left) || !collectPolynomialTerms(node.b, variable, ctx, 1, right)) return false;
    for (const t of multiplyTerms(left, right)) out.push({ ...t, coefficient: sign * t.coefficient });
    return true;
  }
  if (node.t === 'bin' && node.op === '/') {
    if (dependsOn(node.b, variable)) return false;
    const denominator = evaluateNode(node.b, ctx);
    const numerator: PolyTerm[] = [];
    if (!collectPolynomialTerms(node.a, variable, ctx, 1, numerator)) return false;
    for (const t of numerator) out.push({ coefficient: (sign * t.coefficient) / denominator, exponent: t.exponent });
    return true;
  }
  if (node.t === 'bin' && node.op === '^' && !dependsOn(node.b, variable) && node.b.t === 'num' && Number.isInteger(node.b.value) && node.b.value >= 0) {
    const base: PolyTerm[] = [];
    if (!collectPolynomialTerms(node.a, variable, ctx, 1, base)) return false;
    let power: PolyTerm[] = [{ coefficient: 1, exponent: 0 }];
    for (let i = 0; i < node.b.value; i++) power = multiplyTerms(power, base);
    for (const t of power) out.push({ ...t, coefficient: sign * t.coefficient });
    return true;
  }
  const bare = bareTermOf(node, variable);
  if (bare) {
    out.push({ coefficient: sign * bare.coefficient, exponent: bare.exponent });
    return true;
  }
  if (!dependsOn(node, variable)) {
    out.push({ coefficient: sign * evaluateNode(node, ctx), exponent: 0 });
    return true;
  }
  return false;
}

function mergeTerms(terms: PolyTerm[]): PolyTerm[] {
  const byExponent = new Map<number, number>();
  for (const t of terms) byExponent.set(t.exponent, (byExponent.get(t.exponent) ?? 0) + t.coefficient);
  return [...byExponent.entries()]
    .filter(([, coefficient]) => coefficient !== 0)
    .map(([exponent, coefficient]) => ({ coefficient, exponent }))
    .sort((a, b) => b.exponent - a.exponent);
}

/** Recognizes `node` as a sum of `c·x^n` terms (n a non-negative integer); null for anything else. */
export function asPolynomial(node: Node, variable: string, ctx: EvalContext): PolyTerm[] | null {
  const out: PolyTerm[] = [];
  return collectPolynomialTerms(node, variable, ctx, 1, out) ? mergeTerms(out) : null;
}

/** The power rule, term by term: ∫x^n dx = x^(n+1)/(n+1). */
export function antiderivativePolynomial(terms: PolyTerm[]): PolyTerm[] {
  return terms.map((t) => ({ coefficient: t.coefficient / (t.exponent + 1), exponent: t.exponent + 1 }));
}

export function evalPolynomial(terms: PolyTerm[], x: number): number {
  return terms.reduce((sum, t) => sum + t.coefficient * x ** t.exponent, 0);
}

/** "2x^3 - x + 5", the way a notebook writes a polynomial. */
export function printPolynomial(terms: PolyTerm[], variable: string): string {
  if (terms.length === 0) return '0';
  const part = (t: PolyTerm, i: number): string => {
    const magnitude = Math.abs(t.coefficient);
    const sign = t.coefficient < 0 ? '-' : i === 0 ? '' : '+';
    const power = t.exponent === 0 ? '' : t.exponent === 1 ? variable : `${variable}^${t.exponent}`;
    const coefficientText = power && magnitude === 1 ? '' : Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(4).replace(/\.?0+$/, '');
    const body = power ? `${coefficientText}${power}` : coefficientText || '0';
    return i === 0 ? `${sign}${body}` : ` ${sign} ${body}`;
  };
  return terms.map(part).join('');
}

// ---------------------------------------------------------------------------
// Numerical definite integration (adaptive Simpson's rule)

function simpson(f: (x: number) => number, a: number, b: number): number {
  const c = (a + b) / 2;
  return ((b - a) / 6) * (f(a) + 4 * f(c) + f(b));
}

function adaptiveSimpson(f: (x: number) => number, a: number, b: number, whole: number, eps: number, depth: number): number {
  const c = (a + b) / 2;
  const left = simpson(f, a, c);
  const right = simpson(f, c, b);
  if (depth <= 0 || Math.abs(left + right - whole) < 15 * eps) return left + right + (left + right - whole) / 15;
  return adaptiveSimpson(f, a, c, left, eps / 2, depth - 1) + adaptiveSimpson(f, c, b, right, eps / 2, depth - 1);
}

/** ∫ from a to b of f, by adaptive Simpson's rule — accurate for any smooth function, not just polynomials. */
export function definiteIntegral(f: (x: number) => number, a: number, b: number, eps = 1e-9): number {
  if (a === b) return 0;
  const sign = a > b ? -1 : 1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return sign * adaptiveSimpson(f, lo, hi, simpson(f, lo, hi), eps, 30);
}
