/** The calculator: one entry point used by the keypad, the `calculate` tool and the solvers. */
import { exactNumber, formatExact } from './exact';
import {
  defaultContext,
  evaluateExact,
  evaluateNode,
  formatDecimal,
  MathError,
  normalizeExpression,
  parseExpression,
  printNode,
  reduceOnce,
  type AngleMode,
  type EvalContext,
  type Node,
} from './expr';

export interface CalcOptions {
  angle?: AngleMode;
  vars?: Record<string, number>;
  /** Decimals kept in the approximate answer (default 6). */
  decimals?: number;
  /** Also return the reduction, one line per round. */
  steps?: boolean;
}

export interface CalcResult {
  /** The expression as Cellar read it. */
  input: string;
  ok: boolean;
  value: number | null;
  /** An exact answer when the result is a fraction or a simple square root. */
  exact: string | null;
  /** The decimal answer, always formatted in en-US. */
  decimal: string;
  /** What to show: the exact answer when there is one, otherwise the decimal. */
  answer: string;
  /** Present when the exact answer is not the whole story (√3 → 1.732051). */
  approx?: string;
  steps?: string[];
  error?: string;
  angle: AngleMode;
}

const MAX_INPUT = 2000;

/** Every round of the reduction, as expressions: `3^2 + 4^2`, `9 + 16`, `25`. */
export function evaluationSteps(node: Node, ctx: EvalContext, limit = 12): string[] {
  const steps = [printNode(node)];
  let current = node;
  for (let i = 0; i < limit; i++) {
    const { node: next, changed } = reduceOnce(current, ctx);
    if (!changed) break;
    current = next;
    const text = printNode(current);
    if (text !== steps[steps.length - 1]) steps.push(text);
  }
  return steps;
}

export function calculate(input: string, options: CalcOptions = {}): CalcResult {
  const angle = options.angle ?? 'deg';
  const ctx = defaultContext(angle, options.vars ?? {});
  const decimals = Math.min(12, Math.max(0, options.decimals ?? 6));
  const text = String(input ?? '').slice(0, MAX_INPUT);
  const normalized = normalizeExpression(text);
  const fail = (error: string): CalcResult => ({ input: normalized || text.trim(), ok: false, value: null, exact: null, decimal: '', answer: '', error, angle });
  try {
    const node = parseExpression(text);
    const value = evaluateNode(node, ctx);
    if (Number.isNaN(value)) return fail('That does not have a numeric answer.');
    const exactValue = evaluateExact(node, ctx);
    const exact = exactValue && Math.abs(exactNumber(exactValue) - value) < 1e-9 * Math.max(1, Math.abs(value)) ? formatExact(exactValue) : null;
    const decimal = formatDecimal(value, decimals);
    const answer = exact ?? decimal;
    const result: CalcResult = {
      input: printNode(node),
      ok: true,
      value,
      exact,
      decimal,
      answer,
      angle,
    };
    if (exact && exact !== decimal) result.approx = decimal;
    if (options.steps) result.steps = evaluationSteps(node, ctx);
    return result;
  } catch (err) {
    return fail(err instanceof MathError ? err.message : err instanceof Error ? err.message : 'I could not calculate that.');
  }
}

/**
 * A length or angle written as a number, a fraction or a root ("2", "√3", "12/13") as a number,
 * keeping the text for labels. Returns null when it is not a value at all.
 */
export function measureOf(input: number | string | undefined | null, angle: AngleMode = 'deg'): { value: number; text: string } | null {
  if (input === undefined || input === null || input === '') return null;
  if (typeof input === 'number') return Number.isFinite(input) ? { value: input, text: formatDecimal(input) } : null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const result = calculate(trimmed, { angle });
  if (!result.ok || result.value === null) return null;
  return { value: result.value, text: prettyMeasure(trimmed, result) };
}

/** Keeps what the user wrote when it is already tidy (√3), otherwise the exact or decimal answer. */
function prettyMeasure(original: string, result: CalcResult): string {
  const normalized = normalizeExpression(original);
  const simple = /^[\d\s./√^()-]*$/.test(normalized) && normalized.length <= 12;
  if (simple && /[√^/]/.test(normalized)) return original.trim();
  return result.answer;
}
