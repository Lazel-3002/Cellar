/**
 * Exact arithmetic for school maths: every value is `c · √r` with `c` a rational and `r` a positive
 * square-free integer (`r = 1` is a plain fraction). That covers what shows up in a notebook —
 * 17/13, √3, 2√3, √3/2, 4/3 — and returns null as soon as a step leaves the family, so callers
 * fall back to decimals instead of printing something wrong.
 */

export interface Rational {
  /** Numerator; carries the sign. */
  n: bigint;
  /** Denominator, always > 0. */
  d: bigint;
}

export interface Exact {
  c: Rational;
  /** Radicand: 1 for a plain rational. */
  r: bigint;
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

export const exact = (c: Rational, r: bigint = 1n): Exact => ({ c, r });
export const exactInt = (n: bigint | number) => exact(rat(n));
export const exactZero = exact(ZERO);
export const isRational = (e: Exact) => e.r === 1n;
export const exactIsZero = (e: Exact) => isZero(e.c);
export const exactNumber = (e: Exact) => ratNumber(e.c) * Math.sqrt(Number(e.r));

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

export function exactAdd(a: Exact, b: Exact): Exact | null {
  if (exactIsZero(a)) return b;
  if (exactIsZero(b)) return a;
  if (a.r !== b.r) return null;
  return exact(ratAdd(a.c, b.c), a.r);
}

export const exactNeg = (a: Exact) => exact(ratNeg(a.c), a.r);
export const exactSub = (a: Exact, b: Exact) => exactAdd(a, exactNeg(b));

export function exactMul(a: Exact, b: Exact): Exact {
  const product = ratMul(a.c, b.c);
  if (a.r === 1n) return exact(product, b.r);
  if (b.r === 1n) return exact(product, a.r);
  if (a.r === b.r) return exact(ratMul(product, rat(a.r)), 1n);
  const { k, r } = simplifySqrt(a.r * b.r);
  return exact(ratMul(product, rat(k)), r);
}

/** 1 / (c√r) = √r / (c·r), so the radical never stays in a denominator. */
export function exactInverse(a: Exact): Exact | null {
  if (exactIsZero(a)) return null;
  if (a.r === 1n) return exact(rat(a.c.d, a.c.n));
  const denominator = ratMul(a.c, rat(a.r));
  return exact(rat(denominator.d, denominator.n), a.r);
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

export function exactSqrt(a: Exact): Exact | null {
  if (a.r !== 1n) return null;
  if (a.c.n < 0n) return null;
  if (isZero(a.c)) return exactZero;
  // √(p/q) = √(p·q) / q
  const { k, r } = simplifySqrt(a.c.n * a.c.d);
  return exact(rat(k, a.c.d), r);
}

export function formatRational(q: Rational): string {
  if (q.d === 1n) return q.n.toString();
  return `${q.n}/${q.d}`;
}

/** "2√3", "√3/2", "-17/13" — the shape a fraction bar or radical sign is built from later. */
export function formatExact(e: Exact): string {
  if (e.r === 1n) return formatRational(e.c);
  const sign = e.c.n < 0n ? '-' : '';
  const num = abs(e.c.n);
  const root = `√${e.r}`;
  const top = num === 1n ? root : `${num}${root}`;
  return e.c.d === 1n ? `${sign}${top}` : `${sign}${top}/${e.c.d}`;
}
