/**
 * The expression engine behind the calculator, the `calculate` tool and every solver: one tolerant
 * parser for what people and models write (`2(3+4)`, `√3`, `a^2`, `sin30`, `12/13 + 5/13`), with both
 * a numeric and an exact evaluator over the same tree.
 */
import {
  approxRational,
  exact,
  exactAdd,
  exactDiv,
  exactFromNumber,
  exactInt,
  exactIsZero,
  exactMul,
  exactNeg,
  exactNumber,
  exactPow,
  exactSqrt,
  exactSub,
  formatExact,
  isInteger,
  rat,
  ratNumber,
  type Exact,
} from './exact';

export class MathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MathError';
  }
}

export type AngleMode = 'deg' | 'rad';

export interface EvalContext {
  angle: AngleMode;
  vars: Record<string, number>;
}

export const defaultContext = (angle: AngleMode = 'deg', vars: Record<string, number> = {}): EvalContext => ({ angle, vars });

export type Node =
  | { t: 'num'; value: number; text: string; exact?: Exact }
  | { t: 'const'; name: 'pi' | 'e' | 'tau' | 'phi' }
  | { t: 'var'; name: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^' | '%'; a: Node; b: Node }
  | { t: 'call'; name: string; args: Node[] }
  | { t: 'fact'; a: Node }
  | { t: 'pct'; a: Node };

// ---------------------------------------------------------------------------
// Tokens

type Token = { k: 'num'; value: number; text: string } | { k: 'name'; text: string } | { k: 'op'; text: string } | { k: 'end' };

const SUPERSCRIPTS: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

/** Unicode maths, LaTeX commands and other spellings folded into the plain ASCII the parser knows. */
export function normalizeExpression(input: string): string {
  let text = String(input ?? '').trim();
  text = text
    .replace(/\$+/g, '')
    .replace(/\\left|\\right|\\!|\\,|\\;|\\quad|\\qquad/g, '')
    .replace(/\\(?:dfrac|tfrac|frac)/g, 'frac')
    .replace(/\\sqrt\s*\[\s*([^\]]+)\s*\]\s*/g, 'root($1,')
    .replace(/\\sqrt/g, 'sqrt')
    .replace(/\\(?:operatorname|mathrm|mathit|text)\s*\{([^}]*)\}/g, '$1')
    .replace(/\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|log|ln|exp|min|max|gcd|deg)\b/g, '$1')
    .replace(/\\(?:cdot|times|ast)\b/g, '*')
    .replace(/\\(?:div|over)\b/g, '/')
    .replace(/\\(pi|tau|phi)\b/g, '$1')
    .replace(/\\pm\b/g, '+')
    .replace(/\\(?:le|leq)\b/g, '<=')
    .replace(/\\(?:ge|geq)\b/g, '>=')
    .replace(/\\(?:ne|neq)\b/g, '!=')
    .replace(/\\%/g, '%')
    .replace(/[   ]/g, ' ')
    .replace(/[×∙⋅·*]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/,(?=\d{3}(\D|$))/g, '')
    .replace(/√/g, 'sqrt')
    .replace(/π/g, 'pi')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => `^${[...run].map((c) => SUPERSCRIPTS[c] ?? '').join('')}`)
    .replace(/½/g, '(1/2)')
    .replace(/¼/g, '(1/4)')
    .replace(/¾/g, '(3/4)');
  text = expandFractions(text);
  // Remaining braces (sqrt{3}, x^{2}) behave like parentheses.
  for (let i = 0; i < 12 && /\{/.test(text); i++) {
    const next = text.replace(/\{([^{}]*)\}/g, '($1)');
    if (next === text) break;
    text = next;
  }
  return text.trim();
}

/** The inside of the brace group that starts at `open`, and the index just after it. */
function readBalanced(text: string, open: number): { inner: string; end: number } | null {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return { inner: text.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

/** `frac{a}{b}` → `((a)/(b))`, with nested braces (`frac{sqrt{3}}{2}`) read as whole groups. */
function expandFractions(input: string): string {
  let text = input;
  for (let guard = 0; guard < 60; guard++) {
    const match = /frac\s*\{/.exec(text);
    if (!match) break;
    const start = match.index;
    const first = readBalanced(text, text.indexOf('{', start));
    if (!first) break;
    let after = first.end;
    while (/\s/.test(text[after] ?? '')) after++;
    if (text[after] !== '{') {
      // A stray "frac" with one group: keep the group, drop the word.
      text = `${text.slice(0, start)}(${first.inner})${text.slice(first.end)}`;
      continue;
    }
    const second = readBalanced(text, after);
    if (!second) break;
    text = `${text.slice(0, start)}((${first.inner})/(${second.inner}))${text.slice(second.end)}`;
  }
  return text;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      const match = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(input.slice(i));
      if (!match) throw new MathError(`I could not read the number at "${input.slice(i, i + 8)}".`);
      tokens.push({ k: 'num', value: Number(match[0]), text: match[0] });
      i += match[0].length;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      const match = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(input.slice(i))!;
      const name = match[0];
      i += name.length;
      const known = (text: string) => !!canonicalFunction(text) || CONSTANTS.has(text.toLowerCase());
      // "sqrt3" and "sin30" are a function and its argument, but "log2" is one name.
      const split = known(name) ? null : /^([a-zA-Z_]+)(\d+(?:\.\d+)?)$/.exec(name);
      if (split && known(split[1])) {
        tokens.push({ k: 'name', text: split[1] }, { k: 'num', value: Number(split[2]), text: split[2] });
        continue;
      }
      tokens.push({ k: 'name', text: name });
      continue;
    }
    if ('+-*/^%()!'.includes(c)) {
      tokens.push({ k: 'op', text: c });
      i++;
      continue;
    }
    if (c === ',' || c === ';') {
      tokens.push({ k: 'op', text: ',' });
      i++;
      continue;
    }
    throw new MathError(`"${c}" is not something I can calculate with.`);
  }
  tokens.push({ k: 'end' });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser

const CONSTANTS = new Set(['pi', 'e', 'tau', 'phi']);

export const FUNCTIONS: Record<string, { arity: number | [number, number]; help: string }> = {
  sqrt: { arity: 1, help: 'square root' },
  cbrt: { arity: 1, help: 'cube root' },
  root: { arity: 2, help: 'root(n, x): the nth root of x' },
  abs: { arity: 1, help: 'absolute value' },
  sign: { arity: 1, help: '-1, 0 or 1' },
  round: { arity: [1, 2], help: 'round(x) or round(x, decimals)' },
  floor: { arity: 1, help: 'round down' },
  ceil: { arity: 1, help: 'round up' },
  trunc: { arity: 1, help: 'drop the decimals' },
  min: { arity: [1, 8], help: 'smallest' },
  max: { arity: [1, 8], help: 'largest' },
  exp: { arity: 1, help: 'e raised to x' },
  ln: { arity: 1, help: 'natural logarithm' },
  log: { arity: [1, 2], help: 'log(x) base 10, or log(x, base)' },
  log2: { arity: 1, help: 'logarithm base 2' },
  sin: { arity: 1, help: 'sine' },
  cos: { arity: 1, help: 'cosine' },
  tan: { arity: 1, help: 'tangent' },
  cot: { arity: 1, help: 'cotangent' },
  sec: { arity: 1, help: 'secant' },
  csc: { arity: 1, help: 'cosecant' },
  asin: { arity: 1, help: 'inverse sine' },
  acos: { arity: 1, help: 'inverse cosine' },
  atan: { arity: 1, help: 'inverse tangent' },
  atan2: { arity: 2, help: 'atan2(y, x)' },
  sinh: { arity: 1, help: 'hyperbolic sine' },
  cosh: { arity: 1, help: 'hyperbolic cosine' },
  tanh: { arity: 1, help: 'hyperbolic tangent' },
  hypot: { arity: [2, 8], help: 'hypot(a, b) is √(a² + b²)' },
  gcd: { arity: [2, 8], help: 'greatest common divisor' },
  lcm: { arity: [2, 8], help: 'least common multiple' },
  mod: { arity: 2, help: 'remainder' },
  fact: { arity: 1, help: 'factorial' },
  ncr: { arity: 2, help: 'ncr(n, r): combinations' },
  npr: { arity: 2, help: 'npr(n, r): permutations' },
  pow: { arity: 2, help: 'pow(x, n)' },
  deg: { arity: 1, help: 'radians to degrees' },
  rad: { arity: 1, help: 'degrees to radians' },
};

const ALIASES: Record<string, string> = {
  arcsin: 'asin',
  arccos: 'acos',
  arctan: 'atan',
  factorial: 'fact',
  ctg: 'cot',
  cotan: 'cot',
  tg: 'tan',
  lg: 'log',
  comb: 'ncr',
  perm: 'npr',
  modulo: 'mod',
  degrees: 'deg',
  radians: 'rad',
};

function canonicalFunction(name: string): string | null {
  const lower = name.toLowerCase();
  const aliased = ALIASES[lower] ?? lower;
  return aliased in FUNCTIONS ? aliased : null;
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private eat(text: string): boolean {
    const token = this.peek();
    if (token.k === 'op' && token.text === text) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expect(text: string): void {
    if (!this.eat(text)) throw new MathError(`I expected "${text}" in the expression.`);
  }

  parse(): Node {
    const node = this.expression(0);
    if (this.peek().k !== 'end') throw new MathError('There is something extra at the end of the expression.');
    return node;
  }

  /** Precedence climbing: + - (1), * / (2), implicit multiplication (3), ^ (4, right-associative). */
  private expression(minPrecedence: number): Node {
    let left = this.unary();
    for (;;) {
      const token = this.peek();
      let op: '+' | '-' | '*' | '/' | '%' | '^' | null = null;
      let precedence = 0;
      let implicit = false;
      if (token.k === 'op' && (token.text === '+' || token.text === '-')) {
        op = token.text;
        precedence = 1;
      } else if (token.k === 'op' && (token.text === '*' || token.text === '/')) {
        op = token.text;
        precedence = 2;
      } else if (token.k === 'op' && token.text === '^') {
        op = '^';
        precedence = 4;
      } else if (this.startsPrimary(token)) {
        // 2x, 2(3+4), 3sqrt(2), 2pi
        op = '*';
        precedence = 3;
        implicit = true;
      }
      if (!op || precedence < minPrecedence) break;
      if (!implicit) this.pos++;
      const right = op === '^' ? this.expression(4) : this.expression(precedence + 1);
      left = { t: 'bin', op, a: left, b: right };
    }
    return left;
  }

  private startsPrimary(token: Token): boolean {
    if (token.k === 'num' || token.k === 'name') return true;
    return token.k === 'op' && token.text === '(';
  }

  private unary(): Node {
    // Looser than ^, so -4^2 is -(4^2), the way it is read on paper.
    if (this.eat('-')) return { t: 'neg', a: this.expression(4) };
    if (this.eat('+')) return this.unary();
    return this.postfix(this.primary());
  }

  private postfix(node: Node): Node {
    let out = node;
    for (;;) {
      if (this.eat('!')) {
        out = { t: 'fact', a: out };
        continue;
      }
      const token = this.peek();
      if (token.k === 'op' && token.text === '%') {
        this.pos++;
        out = { t: 'pct', a: out };
        continue;
      }
      return out;
    }
  }

  private primary(): Node {
    const token = this.peek();
    if (token.k === 'num') {
      this.pos++;
      const exactValue = exactFromNumber(token.value);
      return exactValue ? { t: 'num', value: token.value, text: token.text, exact: exactValue } : { t: 'num', value: token.value, text: token.text };
    }
    if (token.k === 'op' && token.text === '(') {
      this.pos++;
      const inner = this.expression(0);
      this.expect(')');
      return inner;
    }
    if (token.k === 'name') {
      this.pos++;
      const fn = canonicalFunction(token.text);
      if (fn) {
        const args: Node[] = [];
        if (this.eat('(')) {
          if (!this.eat(')')) {
            do args.push(this.expression(0));
            while (this.eat(','));
            this.expect(')');
          }
        } else {
          // sin30, sqrt2: a bare argument binds tighter than any operator.
          args.push(this.postfix(this.primary()));
        }
        const arity = FUNCTIONS[fn].arity;
        const [min, max] = typeof arity === 'number' ? [arity, arity] : arity;
        if (args.length < min || args.length > max) {
          throw new MathError(`${fn}() takes ${min === max ? min : `${min} to ${max}`} argument${max === 1 ? '' : 's'} — ${FUNCTIONS[fn].help}.`);
        }
        return { t: 'call', name: fn, args };
      }
      const lower = token.text.toLowerCase();
      if (CONSTANTS.has(lower)) return { t: 'const', name: lower as 'pi' | 'e' | 'tau' | 'phi' };
      return { t: 'var', name: token.text };
    }
    throw new MathError('The expression ends too early.');
  }
}

export function parseExpression(input: string): Node {
  const text = normalizeExpression(input);
  if (!text) throw new MathError('There is nothing to calculate.');
  if (/[=<>]/.test(text)) throw new MathError('This looks like an equation — use solve_steps for equations.');
  return new Parser(tokenize(text)).parse();
}

export interface Equation {
  lhs: Node;
  rhs: Node;
  text: { lhs: string; rhs: string };
}

/** Splits "3x + 5 = 20" into two trees. */
export function parseEquation(input: string): Equation {
  const text = normalizeExpression(input);
  const parts = text.split('=');
  if (parts.length !== 2) throw new MathError('Write the equation with exactly one "=" sign.');
  const [lhs, rhs] = parts.map((part) => part.trim());
  if (!lhs || !rhs) throw new MathError('Both sides of the "=" need an expression.');
  return { lhs: new Parser(tokenize(lhs)).parse(), rhs: new Parser(tokenize(rhs)).parse(), text: { lhs, rhs } };
}

/** Variable names in a tree, in the order they appear. */
export function variablesOf(node: Node): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    switch (n.t) {
      case 'var':
        if (!out.includes(n.name)) out.push(n.name);
        return;
      case 'neg':
      case 'fact':
      case 'pct':
        return walk(n.a);
      case 'bin':
        walk(n.a);
        return walk(n.b);
      case 'call':
        return n.args.forEach(walk);
      default:
        return;
    }
  };
  walk(node);
  return out;
}

// ---------------------------------------------------------------------------
// Numeric evaluation

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new MathError('A factorial needs a whole number that is not negative.');
  if (n > 170) throw new MathError('That factorial is too large to calculate.');
  let out = 1;
  for (let i = 2; i <= n; i++) out *= i;
  return out;
}

function gcdNumber(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

const toRadians = (value: number, ctx: EvalContext) => (ctx.angle === 'deg' ? (value * Math.PI) / 180 : value);
const fromRadians = (value: number, ctx: EvalContext) => (ctx.angle === 'deg' ? (value * 180) / Math.PI : value);

/** Rounds away floating-point dust, so tan(45°) is 1 and sin(180°) is 0. */
function clean(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-12 * Math.max(1, Math.abs(value))) return rounded === 0 ? 0 : rounded;
  const scaled = Number(value.toPrecision(13));
  return Object.is(scaled, -0) ? 0 : scaled;
}

export function evaluateNode(node: Node, ctx: EvalContext): number {
  switch (node.t) {
    case 'num':
      return node.value;
    case 'const':
      return node.name === 'pi' ? Math.PI : node.name === 'e' ? Math.E : node.name === 'tau' ? Math.PI * 2 : (1 + Math.sqrt(5)) / 2;
    case 'var': {
      const value = ctx.vars[node.name] ?? ctx.vars[node.name.toLowerCase()];
      if (value === undefined) throw new MathError(`I do not know what "${node.name}" is — give it a value, or use a number.`);
      return value;
    }
    case 'neg':
      return -evaluateNode(node.a, ctx);
    case 'pct':
      return evaluateNode(node.a, ctx) / 100;
    case 'fact':
      return factorial(evaluateNode(node.a, ctx));
    case 'bin': {
      const a = evaluateNode(node.a, ctx);
      const b = evaluateNode(node.b, ctx);
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          if (b === 0) throw new MathError('Division by zero.');
          return a / b;
        case '%':
          if (b === 0) throw new MathError('Division by zero.');
          return a % b;
        case '^':
          return a ** b;
      }
      return NaN;
    }
    case 'call': {
      const args = node.args.map((arg) => evaluateNode(arg, ctx));
      const [x, y] = args;
      switch (node.name) {
        case 'sqrt':
          if (x < 0) throw new MathError('The square root of a negative number is not a real number.');
          return Math.sqrt(x);
        case 'cbrt':
          return Math.cbrt(x);
        case 'root':
          if (x === 0) throw new MathError('The root degree cannot be 0.');
          return y < 0 && Math.abs(x % 2) === 1 ? -(Math.abs(y) ** (1 / x)) : y ** (1 / x);
        case 'abs':
          return Math.abs(x);
        case 'sign':
          return Math.sign(x);
        case 'round': {
          const decimals = args.length > 1 ? Math.min(12, Math.max(0, Math.round(y))) : 0;
          const factor = 10 ** decimals;
          return Math.round(x * factor) / factor;
        }
        case 'floor':
          return Math.floor(x);
        case 'ceil':
          return Math.ceil(x);
        case 'trunc':
          return Math.trunc(x);
        case 'min':
          return Math.min(...args);
        case 'max':
          return Math.max(...args);
        case 'exp':
          return Math.exp(x);
        case 'ln':
          if (x <= 0) throw new MathError('A logarithm needs a positive number.');
          return Math.log(x);
        case 'log':
          if (x <= 0) throw new MathError('A logarithm needs a positive number.');
          return args.length > 1 ? Math.log(x) / Math.log(y) : Math.log10(x);
        case 'log2':
          if (x <= 0) throw new MathError('A logarithm needs a positive number.');
          return Math.log2(x);
        case 'sin':
          return clean(Math.sin(toRadians(x, ctx)));
        case 'cos':
          return clean(Math.cos(toRadians(x, ctx)));
        case 'tan': {
          const cos = clean(Math.cos(toRadians(x, ctx)));
          if (cos === 0) throw new MathError('The tangent of that angle is undefined.');
          return clean(Math.sin(toRadians(x, ctx)) / cos);
        }
        case 'cot': {
          const sin = clean(Math.sin(toRadians(x, ctx)));
          if (sin === 0) throw new MathError('The cotangent of that angle is undefined.');
          return clean(Math.cos(toRadians(x, ctx)) / sin);
        }
        case 'sec': {
          const cos = clean(Math.cos(toRadians(x, ctx)));
          if (cos === 0) throw new MathError('The secant of that angle is undefined.');
          return clean(1 / cos);
        }
        case 'csc': {
          const sin = clean(Math.sin(toRadians(x, ctx)));
          if (sin === 0) throw new MathError('The cosecant of that angle is undefined.');
          return clean(1 / sin);
        }
        case 'asin':
          if (x < -1 || x > 1) throw new MathError('A sine is always between -1 and 1.');
          return clean(fromRadians(Math.asin(x), ctx));
        case 'acos':
          if (x < -1 || x > 1) throw new MathError('A cosine is always between -1 and 1.');
          return clean(fromRadians(Math.acos(x), ctx));
        case 'atan':
          return clean(fromRadians(Math.atan(x), ctx));
        case 'atan2':
          return clean(fromRadians(Math.atan2(x, y), ctx));
        case 'sinh':
          return Math.sinh(x);
        case 'cosh':
          return Math.cosh(x);
        case 'tanh':
          return Math.tanh(x);
        case 'hypot':
          return Math.hypot(...args);
        case 'gcd':
          return args.reduce((acc, value) => gcdNumber(acc, value));
        case 'lcm':
          return args.reduce((acc, value) => (acc === 0 || value === 0 ? 0 : Math.abs((acc * value) / gcdNumber(acc, value))));
        case 'mod':
          if (y === 0) throw new MathError('Division by zero.');
          return ((x % y) + y) % y;
        case 'fact':
          return factorial(x);
        case 'ncr':
          return clean(factorial(x) / (factorial(y) * factorial(x - y)));
        case 'npr':
          return clean(factorial(x) / factorial(x - y));
        case 'pow':
          return x ** y;
        case 'deg':
          return clean((x * 180) / Math.PI);
        case 'rad':
          return (x * Math.PI) / 180;
      }
      throw new MathError(`I do not know the function "${node.name}".`);
    }
  }
}

// ---------------------------------------------------------------------------
// Exact evaluation

/** sin, cos, tan and cot at the angles school problems use, as exact values. */
export function specialTrig(fn: 'sin' | 'cos' | 'tan' | 'cot', degrees: number): Exact | null {
  if (!Number.isFinite(degrees) || !Number.isInteger(degrees)) return null;
  const angle = ((degrees % 360) + 360) % 360;
  if (angle % 30 !== 0 && angle % 45 !== 0) return null;
  const quadrant = Math.floor(angle / 90);
  const reference = angle % 90;
  const base: Record<number, Exact> = {
    0: exactInt(0),
    30: exact(rat(1n, 2n)),
    45: exact(rat(1n, 2n), 2n),
    60: exact(rat(1n, 2n), 3n),
    90: exactInt(1),
  };
  const sinRef = base[reference];
  const cosRef = base[90 - reference];
  if (!sinRef || !cosRef) return null;
  // Every other quadrant swaps the roles of sine and cosine.
  const swapped = quadrant % 2 === 1;
  const sinMagnitude = swapped ? cosRef : sinRef;
  const cosMagnitude = swapped ? sinRef : cosRef;
  const sinValue = quadrant < 2 ? sinMagnitude : exactNeg(sinMagnitude);
  const cosValue = quadrant === 0 || quadrant === 3 ? cosMagnitude : exactNeg(cosMagnitude);
  switch (fn) {
    case 'sin':
      return sinValue;
    case 'cos':
      return cosValue;
    case 'tan':
      return exactIsZero(cosValue) ? null : exactDiv(sinValue, cosValue);
    case 'cot':
      return exactIsZero(sinValue) ? null : exactDiv(cosValue, sinValue);
  }
}

/** The exact value of a tree, or null once a step leaves fractions and square roots behind. */
export function evaluateExact(node: Node, ctx: EvalContext): Exact | null {
  switch (node.t) {
    case 'num':
      return node.exact ?? exactFromNumber(node.value);
    case 'const':
      return null;
    case 'var': {
      const value = ctx.vars[node.name] ?? ctx.vars[node.name.toLowerCase()];
      return value === undefined ? null : exactFromNumber(value);
    }
    case 'neg': {
      const a = evaluateExact(node.a, ctx);
      return a ? exactNeg(a) : null;
    }
    case 'pct': {
      const a = evaluateExact(node.a, ctx);
      return a ? exactDiv(a, exactInt(100)) : null;
    }
    case 'fact': {
      const a = evaluateExact(node.a, ctx);
      if (!a || a.r !== 1n || !isInteger(a.c)) return null;
      const n = Number(a.c.n);
      return n >= 0 && n <= 20 ? exactFromNumber(factorial(n)) : null;
    }
    case 'bin': {
      const a = evaluateExact(node.a, ctx);
      const b = evaluateExact(node.b, ctx);
      if (!a || !b) return null;
      switch (node.op) {
        case '+':
          return exactAdd(a, b);
        case '-':
          return exactSub(a, b);
        case '*':
          return exactMul(a, b);
        case '/':
          return exactDiv(a, b);
        case '^':
          return b.r === 1n && isInteger(b.c) ? exactPow(a, Number(b.c.n)) : null;
        default:
          return null;
      }
    }
    case 'call': {
      const args = node.args.map((arg) => evaluateExact(arg, ctx));
      if (args.some((arg) => !arg)) return null;
      const values = args as Exact[];
      const [x, y] = values;
      switch (node.name) {
        case 'sqrt':
          return exactSqrt(x);
        case 'abs':
          return exactNumber(x) < 0 ? exactNeg(x) : x;
        case 'min':
          return values.reduce((best, value) => (exactNumber(value) < exactNumber(best) ? value : best));
        case 'max':
          return values.reduce((best, value) => (exactNumber(value) > exactNumber(best) ? value : best));
        case 'pow':
          return y.r === 1n && isInteger(y.c) ? exactPow(x, Number(y.c.n)) : null;
        case 'hypot': {
          let total = exactInt(0);
          for (const value of values) {
            const square = exactPow(value, 2);
            const sum = square && exactAdd(total, square);
            if (!sum) return null;
            total = sum;
          }
          return exactSqrt(total);
        }
        case 'sin':
        case 'cos':
        case 'tan':
        case 'cot': {
          if (x.r !== 1n) return null;
          const degrees = ctx.angle === 'deg' ? ratNumber(x.c) : (ratNumber(x.c) * 180) / Math.PI;
          return specialTrig(node.name, Math.abs(degrees - Math.round(degrees)) < 1e-9 ? Math.round(degrees) : NaN);
        }
        case 'gcd':
        case 'lcm':
        case 'mod':
        case 'round':
        case 'floor':
        case 'ceil':
        case 'trunc':
        case 'sign':
        case 'fact':
        case 'ncr':
        case 'npr': {
          if (values.some((value) => value.r !== 1n)) return null;
          const numbers = values.map((value) => ratNumber(value.c));
          const result = evaluateNode({ t: 'call', name: node.name, args: numbers.map((value) => ({ t: 'num', value, text: String(value) })) }, ctx);
          return exactFromNumber(result);
        }
        default:
          return null;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Printing and step reduction

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 4 };

/** Prints a tree the way a notebook writes it (√, ^, fraction slashes), with only the parentheses it needs. */
export function printNode(node: Node, parentPrecedence = 0, side: 'left' | 'right' = 'left'): string {
  switch (node.t) {
    case 'num':
      return node.text;
    case 'const':
      return node.name === 'pi' ? 'π' : node.name;
    case 'var':
      return node.name;
    case 'neg': {
      const inner = printNode(node.a, 3);
      return parentPrecedence > 1 ? `(-${inner})` : `-${inner}`;
    }
    case 'pct':
      return `${printNode(node.a, 5)}%`;
    case 'fact':
      return `${printNode(node.a, 5)}!`;
    case 'bin': {
      const precedence = PRECEDENCE[node.op];
      const symbol = node.op === '*' ? '·' : node.op === '%' ? ' mod ' : node.op;
      const left = printNode(node.a, precedence, 'left');
      const right = printNode(node.b, precedence, 'right');
      const spaced = node.op === '+' || node.op === '-' ? ` ${symbol} ` : symbol;
      const text = `${left}${spaced}${right}`;
      const needsParens = precedence < parentPrecedence || (precedence === parentPrecedence && side === 'right' && (node.op === '-' || node.op === '/'));
      return needsParens ? `(${text})` : text;
    }
    case 'call':
      if (node.name === 'sqrt') return `sqrt(${printNode(node.args[0], 0)})`;
      return `${node.name}(${node.args.map((arg) => printNode(arg, 0)).join(', ')})`;
  }
}

function literal(value: number, exactValue: Exact | null): Node {
  if (exactValue) return { t: 'num', value: exactNumber(exactValue), text: formatExact(exactValue), exact: exactValue };
  const approx = approxRational(value, 1000, 1e-12);
  return { t: 'num', value, text: approx && approx.d !== 1n ? `${approx.n}/${approx.d}` : formatDecimal(value) };
}

/**
 * One round of the reduction people write down: every innermost part whose pieces are already
 * numbers becomes a number, so repeated calls give `3^2 + 4^2` → `9 + 16` → `25`.
 */
export function reduceOnce(node: Node, ctx: EvalContext): { node: Node; changed: boolean } {
  const isNumber = (n: Node) => n.t === 'num';
  const reduceChildren = (children: Node[]): { children: Node[]; changed: boolean } => {
    let changed = false;
    const out = children.map((child) => {
      const result = reduceOnce(child, ctx);
      changed = changed || result.changed;
      return result.node;
    });
    return { children: out, changed };
  };

  switch (node.t) {
    case 'num':
    case 'const':
    case 'var':
      return { node, changed: false };
    case 'neg':
    case 'fact':
    case 'pct': {
      if (isNumber(node.a)) return { node: literal(evaluateNode(node, ctx), evaluateExact(node, ctx)), changed: true };
      const inner = reduceOnce(node.a, ctx);
      return { node: { ...node, a: inner.node }, changed: inner.changed };
    }
    case 'bin': {
      if (isNumber(node.a) && isNumber(node.b)) return { node: literal(evaluateNode(node, ctx), evaluateExact(node, ctx)), changed: true };
      const { children, changed } = reduceChildren([node.a, node.b]);
      return { node: { ...node, a: children[0], b: children[1] }, changed };
    }
    case 'call': {
      if (node.args.every(isNumber)) return { node: literal(evaluateNode(node, ctx), evaluateExact(node, ctx)), changed: true };
      const { children, changed } = reduceChildren(node.args);
      return { node: { ...node, args: children }, changed };
    }
  }
}

/** Numbers are always formatted in en-US, whatever the system locale is. */
export function formatDecimal(value: number, decimals = 10): string {
  if (Number.isNaN(value)) return 'undefined';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return value.toLocaleString('en-US', { maximumFractionDigits: 0, useGrouping: false });
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude < 1e-6 || magnitude >= 1e15)) return value.toExponential(6).replace('e', ' × 10^');
  const rounded = Number(value.toFixed(decimals));
  return rounded.toLocaleString('en-US', { maximumFractionDigits: decimals, useGrouping: false });
}
