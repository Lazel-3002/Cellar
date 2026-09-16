/**
 * Exact arithmetic for school maths: every value is a sum of terms `c · √r`, one per distinct
 * square-free radicand `r` (`r = 1` is the plain-rational part). That covers everything that shows
 * up in a notebook — 17/13, √3, 2√3, √3/2, and now sums like √2 + √3 or 2 - √5 too — and returns
 * null as soon as an operation would leave the family (e.g. dividing by a 3-term irrational sum),
 * so callers fall back to decimals instead of printing something wrong.
 */

export interface Rational {
  /** Numerator; carries the sign. */
  n: bigint;
  /** Denominator, always > 0. */
  d: bigint;
}

/** One `c · √r` term of an Exact sum. */
export interface ExactTerm {
  c: Rational;
  r: bigint;
}

/** A sum of terms, one per distinct square-free radicand; sorted by `r`, no zero coefficients. Empty = 0. */
export interface Exact {
  terms: ExactTerm[];
}

const abs = (v: bigint) => (v < 0n ? -v : v);

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function rat(n: bigint | number, d: bigint | number = 1n): Rational {
  let num = BigInt(n);
  let den = BigInt(d);
  if (den === 0n) throw new Error('Division by zero');
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den) || 1n;
  return { n: num / g, d: den / g };
}

export const ZERO = rat(0n);
export const ONE = rat(1n);

export const isZero = (q: Rational) => q.n === 0n;
export const isInteger = (q: Rational) => q.d === 1n;
export const ratAdd = (a: Rational, b: Rational) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const ratSub = (a: Rational, b: Rational) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const ratMul = (a: Rational, b: Rational) => rat(a.n * b.n, a.d * b.d);
export const ratDiv = (a: Rational, b: Rational) => (isZero(b) ? null : rat(a.n * b.d, a.d * b.n));
export const ratNeg = (a: Rational) => rat(-a.n, a.d);
export const ratNumber = (q: Rational) => Number(q.n) / Number(q.d);
export const ratCmp = (a: Rational, b: Rational) => {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
};

export function ratPow(a: Rational, e: number): Rational | null {
  if (!Number.isInteger(e) || Math.abs(e) > 64) return null;
  if (e < 0) {
    if (isZero(a)) return null;
    return ratPow(rat(a.d, a.n), -e);
  }
  let out = ONE;
  for (let i = 0; i < e; i++) out = ratMul(out, a);
  return out;
}

/** The closest fraction with a denominator up to `maxDen` (continued fractions), or null. */
export function approxRational(x: number, maxDen = 10_000, tolerance = 1e-9): Rational | null {
  if (!Number.isFinite(x)) return null;
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return rat(BigInt(x));
  const sign = x < 0 ? -1n : 1n;
  let value = Math.abs(x);
  let [p0, q0, p1, q1] = [0n, 1n, 1n, 0n];
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(value);
    const ab = BigInt(a);
    const p2 = ab * p1 + p0;
    const q2 = ab * q1 + q0;
    if (q2 > BigInt(maxDen)) break;
    [p0, q0, p1, q1] = [p1, q1, p2, q2];
    const approx = Number(p1) / Number(q1);
    if (Math.abs(approx - Math.abs(x)) <= tolerance * Math.max(1, Math.abs(x))) break;
    const frac = value - a;
    if (frac < 1e-12) break;
    value = 1 / frac;
  }
  if (q1 === 0n) return null;
  const result = rat(sign * p1, q1);
  return Math.abs(ratNumber(result) - x) <= tolerance * Math.max(1, Math.abs(x)) ? result : null;
}

/** √k = out.k · √out.r with `out.r` free of square factors. */
export function simplifySqrt(k: bigint): { k: bigint; r: bigint } {
  if (k < 0n) throw new Error('negative radicand');
  if (k === 0n) return { k: 0n, r: 1n };
  let outside = 1n;
  let inside = k;
  for (let f = 2n; f * f <= inside; f++) {
    while (inside % (f * f) === 0n) {
      inside /= f * f;
      outside *= f;
    }
    // Large primes have no square factor left below the bound.
    if (f > 10_000n) break;
  }
  return { k: outside, r: inside };
}

/** Merges same-radicand terms, drops zero coefficients, and sorts by radicand. */
function normalizeTerms(terms: ExactTerm[]): ExactTerm[] {
  const byRadicand = new Map<string, ExactTerm>();
  for (const term of terms) {
    if (isZero(term.c)) continue;
    const key = term.r.toString();
    const existing = byRadicand.get(key);
    byRadicand.set(key, existing ? { c: ratAdd(existing.c, term.c), r: term.r } : term);
  }
  return [...byRadicand.values()]
    .filter((term) => !isZero(term.c))
    .sort((a, b) => (a.r < b.r ? -1 : a.r > b.r ? 1 : 0));
}

/** A single `c · √r` term as an Exact (the common case: a plain fraction or one radical). */
export const exact = (c: Rational, r: bigint = 1n): Exact => ({ terms: normalizeTerms([{ c, r }]) });
export const exactInt = (n: bigint | number) => exact(rat(n));
export const exactZero: Exact = { terms: [] };
export const exactIsZero = (e: Exact) => e.terms.length === 0;
/** True for the plain-rational case: no terms (zero) or exactly one term with radicand 1. */
export const isRational = (e: Exact) => e.terms.length === 0 || (e.terms.length === 1 && e.terms[0].r === 1n);
/** The rational value, only when `e` has no irrational terms at all. */
export const asRational = (e: Exact): Rational | null => (e.terms.length === 0 ? ZERO : e.terms.length === 1 && e.terms[0].r === 1n ? e.terms[0].c : null);
export const exactNumber = (e: Exact): number => e.terms.reduce((sum, t) => sum + ratNumber(t.c) * Math.sqrt(Number(t.r)), 0);

/** A decimal or integer literal as an exact rational (long decimals stay inexact). */
export function exactFromNumber(x: number): Exact | null {
  if (!Number.isFinite(x)) return null;
  if (Number.isInteger(x) && Math.abs(x) <= Number.MAX_SAFE_INTEGER) return exactInt(x);
  const text = String(x);
  const match = /^-?(\d+)\.(\d{1,9})$/.exec(text);
  if (!match) return null;
  const decimals = match[2].length;
  return exact(rat(BigInt(text.replace('.', '')), 10n ** BigInt(decimals)));
}

export const exactAdd = (a: Exact, b: Exact): Exact => ({ terms: normalizeTerms([...a.terms, ...b.terms]) });
export const exactNeg = (a: Exact): Exact => ({ terms: a.terms.map((t) => ({ c: ratNeg(t.c), r: t.r })) });
export const exactSub = (a: Exact, b: Exact): Exact => exactAdd(a, exactNeg(b));

/** Every cross term `ca√ra · cb√rb = ca·cb · √(ra·rb)`, simplified and merged back into a sum. */
export function exactMul(a: Exact, b: Exact): Exact {
  const out: ExactTerm[] = [];
  for (const ta of a.terms) {
    for (const tb of b.terms) {
      const { k, r } = simplifySqrt(ta.r * tb.r);
      out.push({ c: ratMul(ratMul(ta.c, tb.c), rat(k)), r });
    }
  }
  return { terms: normalizeTerms(out) };
}

/**
 * 1/(c√r) = √r/(c·r) for a single term. For two terms p + q, rationalize by the conjugate:
 * 1/(p+q) = (p-q) / (p²-q²), and p²-q² is always rational (each term squares to a rational).
 * Three or more terms would need nested conjugates — out of scope, so null (falls back to decimal).
 */
export function exactInverse(a: Exact): Exact | null {
  if (exactIsZero(a)) return null;
  if (a.terms.length === 1) {
    const [t] = a.terms;
    if (t.r === 1n) return exact(rat(t.c.d, t.c.n));
    const denominator = ratMul(t.c, rat(t.r));
    return exact(rat(denominator.d, denominator.n), t.r);
  }
  if (a.terms.length === 2) {
    const [p, q] = a.terms;
    const conjugate: Exact = { terms: [p, { c: ratNeg(q.c), r: q.r }] };
    const denominator = asRational(exactMul(a, conjugate));
    if (!denominator || isZero(denominator)) return null;
    return exactMul(conjugate, exact(rat(denominator.d, denominator.n)));
  }
  return null;
}

export function exactDiv(a: Exact, b: Exact): Exact | null {
  const inverse = exactInverse(b);
  return inverse ? exactMul(a, inverse) : null;
}

export function exactPow(a: Exact, e: number): Exact | null {
  if (!Number.isInteger(e) || Math.abs(e) > 32) return null;
  if (e === 0) return exactInt(1);
  if (e < 0) {
    const inverse = exactInverse(a);
    return inverse ? exactPow(inverse, -e) : null;
  }
  let out = exactInt(1);
  for (let i = 0; i < e; i++) out = exactMul(out, a);
  return out;
}

/** Only a plain rational has an exact square root in this family (a general sum almost never denests). */
export function exactSqrt(a: Exact): Exact | null {
  const q = asRational(a);
  if (!q) return null;
  if (q.n < 0n) return null;
  if (isZero(q)) return exactZero;
  // √(p/q) = √(p·q) / q
  const { k, r } = simplifySqrt(q.n * q.d);
  return exact(rat(k, q.d), r);
}

export function formatRational(q: Rational): string {
  if (q.d === 1n) return q.n.toString();
  return `${q.n}/${q.d}`;
}

function formatTerm(t: ExactTerm): string {
  const magnitude = { n: abs(t.c.n), d: t.c.d };
  if (t.r === 1n) return formatRational(magnitude);
  const root = `√${t.r}`;
  const top = magnitude.n === 1n ? root : `${magnitude.n}${root}`;
  return magnitude.d === 1n ? top : `${top}/${magnitude.d}`;
}

/** "2√3", "√3/2", "-17/13", "√2 + √3", "2 - √5" — the shape a fraction bar or radical sign is built from later. */
export function formatExact(e: Exact): string {
  if (e.terms.length === 0) return '0';
  return e.terms
    .map((t, i) => {
      const sign = t.c.n < 0n ? '-' : i === 0 ? '' : '+';
      const body = formatTerm(t);
      return i === 0 ? `${sign}${body}` : ` ${sign} ${body}`;
    })
    .join('');
}
