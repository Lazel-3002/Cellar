import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calculate, measureOf } from '../../src/shared/math/calc';
import { exactZero, formatExact, simplifySqrt } from '../../src/shared/math/exact';
import { normalizeExpression, specialTrig } from '../../src/shared/math/expr';
import { buildFigure } from '../../src/shared/math/figure';
import { mathToPlain, renderMath } from '../../src/shared/math/mathtext';
import { boardOutline, describeBlock, normalizeBlock, patchBlock } from '../../src/shared/math/normalize';
import { buildPlot } from '../../src/shared/math/plot';
import { generateQuiz } from '../../src/shared/math/quiz';
import { boardHtml, boardMarkdown, strokeGeometry } from '../../src/shared/math/render';
import {
  solve,
  solveDerivative,
  solveInequality,
  solveIntegral,
  solveLinear,
  solveLogarithmic,
  solvePythagoras,
  solveQuadratic,
  solveSystem,
  solveTrigEquation,
  solveTrigRatios,
} from '../../src/shared/math/solve';
import type { StreamEvent } from '../../src/shared/types/chat';
import type { MathBoard } from '../../src/shared/types/math';
import type { ModelEntry } from '../../src/shared/types/models';
import type { ProviderStatus } from '../../src/shared/types/providers';

process.env.CELLAR_HOME = join(tmpdir(), `cellar-math-home-${process.pid}`);

const { initPaths } = await import('../../src/main/system/paths');
const { closeDatabase, openDatabase } = await import('../../src/main/db/client');
const { settings } = await import('../../src/main/services/settings');
const { providers } = await import('../../src/main/providers/registry');
const { chat } = await import('../../src/main/chat/orchestrator');
const { boardForConversation, listBoards, saveBoard } = await import('../../src/main/math/store');
const { chatBaseTools } = await import('../../src/main/agent/tools');
type ChatRequest = import('../../src/main/providers/types').ChatRequest;

const answerOf = (input: string, angle: 'deg' | 'rad' = 'deg') => calculate(input, { angle }).answer;

describe('calculator', () => {
  it('keeps fractions and roots exact', () => {
    // The sum from the notebook: sin B + sin C on a 5-12-13 triangle.
    expect(answerOf('12/13 + 5/13')).toBe('17/13');
    expect(answerOf('4 - 3')).toBe('1');
    expect(answerOf('sqrt(3)^2')).toBe('3');
    expect(answerOf('3/5')).toBe('3/5');
    expect(answerOf('sqrt(12)')).toBe('2√3');
    expect(answerOf('1/sqrt(3)')).toBe('√3/3');
    expect(answerOf('sqrt(2)/2 · sqrt(2)')).toBe('1');
    expect(answerOf('2/4 + 1/4')).toBe('3/4');
  });

  it('keeps sums of different radicals exact instead of falling to a decimal', () => {
    expect(answerOf('sqrt(2) + sqrt(3)')).toBe('√2 + √3');
    expect(answerOf('2 - sqrt(5)')).toBe('2 - √5');
    expect(answerOf('sqrt(8) + sqrt(2)')).toBe('3√2'); // 2√2 + √2 merges into one term
    expect(answerOf('(sqrt(2) + sqrt(3))^2')).toBe('5 + 2√6'); // cross term √2·√3 = √6
    expect(answerOf('1/(sqrt(2) + sqrt(3))')).toBe('-√2 + √3'); // rationalized via the conjugate (terms sort by radicand)
    expect(answerOf('(sqrt(2) + sqrt(3)) - sqrt(3)')).toBe('√2');
    // Three distinct radicals can't be rationalized in this family; decimal is the honest answer.
    expect(answerOf('1/(sqrt(2) + sqrt(3) + sqrt(5))')).toMatch(/^0\./);
  });

  it('knows the exact values at the angles school problems use', () => {
    expect(answerOf('cos(30)')).toBe('√3/2');
    expect(answerOf('sin 30')).toBe('1/2');
    expect(answerOf('tan(60)')).toBe('√3');
    expect(answerOf('cot(30)')).toBe('√3');
    expect(answerOf('sin(45)')).toBe('√2/2');
    expect(answerOf('cos(120)')).toBe('-1/2');
    expect(specialTrig('sin', 180)).toEqual(exactZero);
    expect(formatExact(specialTrig('tan', 45)!)).toBe('1');
  });

  it('reads what people and models actually write', () => {
    expect(answerOf('2(3+4)')).toBe('14');
    expect(answerOf('3√2 · √2')).toBe('6');
    expect(answerOf('2^3^2')).toBe('512'); // right associative
    expect(answerOf('-4^2')).toBe('-16');
    expect(answerOf('5!')).toBe('120');
    expect(answerOf('200 · 15%')).toBe('30');
    expect(answerOf('\\frac{\\sqrt{3}}{2}')).toBe('√3/2');
    expect(answerOf('\\sqrt{16} + 2^{3}')).toBe('12');
    expect(answerOf('hypot(3,4)')).toBe('5');
    expect(answerOf('gcd(12, 18) + lcm(4, 6)')).toBe('18');
    expect(answerOf('pi', 'rad')).toBe('3.141593');
    expect(normalizeExpression('a² + b²')).toBe('a^2 + b^2');
  });

  it('formats decimals in en-US and shows both forms', () => {
    const third = calculate('1/3');
    expect(third.exact).toBe('1/3');
    expect(third.decimal).toBe('0.333333');
    const root = calculate('sqrt(3)');
    expect(root.exact).toBe('√3');
    expect(root.approx).toBe('1.732051');
    expect(calculate('1234.5 + 0.25').decimal).toBe('1234.75');
  });

  it('explains what went wrong instead of guessing', () => {
    expect(calculate('2 +').ok).toBe(false);
    expect(calculate('sqrt(-4)').error).toMatch(/not a real number/);
    expect(calculate('1/0').error).toMatch(/Division by zero/);
    expect(calculate('3x').error).toMatch(/I do not know what "x" is/);
    expect(calculate('x + 1', { vars: { x: 4 } }).answer).toBe('5');
  });

  it('shows the reduction step by step', () => {
    expect(calculate('3^2 + 4^2', { steps: true }).steps).toEqual(['3^2 + 4^2', '9 + 16', '25']);
    expect(calculate('(2 + 3) · 4 - 6/3', { steps: true }).steps).toEqual(['(2 + 3)·4 - 6/3', '5·4 - 2', '20 - 2', '18']);
  });

  it('reads lengths written as roots', () => {
    expect(measureOf('√3')).toEqual({ value: Math.sqrt(3), text: '√3' });
    expect(measureOf(5)).toEqual({ value: 5, text: '5' });
    expect(measureOf('')).toBeNull();
  });

  it('simplifies square roots', () => {
    expect(simplifySqrt(72n)).toEqual({ k: 6n, r: 2n });
    expect(simplifySqrt(17n)).toEqual({ k: 1n, r: 17n });
  });
});

describe('solvers', () => {
  it('writes the Pythagoras derivation the way the notebook does', () => {
    const solution = solvePythagoras({ b: '√3', c: 2, names: { a: 'a' } });
    const lines = solution.steps.map((step) => step.math);
    expect(lines).toEqual(['a^2 + b^2 = c^2', 'a^2 + (√3)^2 = 2^2', 'a^2 + 3 = 4', 'a^2 = 4 - 3', 'a^2 = 1', 'a = 1']);
    expect(solution.result).toBe('a = 1');
  });

  it('finds a hypotenuse and keeps an irrational one exact', () => {
    expect(solvePythagoras({ a: 3, b: 4 }).result).toBe('c = 5');
    const exact = solvePythagoras({ a: 1, b: 1 });
    expect(exact.result).toBe('c = √2');
    expect(exact.note).toMatch(/≈ 1.4142/);
    expect(() => solvePythagoras({ a: 3 })).toThrow(/two of the three sides/);
    expect(() => solvePythagoras({ b: 5, c: 3 })).toThrow(/hypotenuse has to be longer/);
  });

  it('takes a letter for the side to find, and checks three given sides', () => {
    // A small model often writes the unknown as a letter rather than leaving it out.
    const named = solvePythagoras({ a: 'x', b: 4, c: 5 });
    expect(named.result).toBe('x = 3');
    expect(named.steps[1].math).toBe('x^2 + 4^2 = 5^2');
    const check = solvePythagoras({ a: 3, b: 4, c: 5 });
    expect(check.result).toBe('It is a right triangle.');
    const wrong = solvePythagoras({ a: 3, b: 4, c: 6 });
    expect(wrong.result).toBe('These sides do not make a right triangle.');
    expect(() => solvePythagoras({ a: 'not a length at all', b: 4, c: 5 })).toThrow(/not a length I can use/);
  });

  it('gives the trigonometric ratios of a right triangle', () => {
    const solution = solveTrigRatios({ opposite: 3, adjacent: 4, angleName: 'C' });
    expect(solution.result).toBe('sin C = 3/5, cos C = 4/5, tan C = 3/4, cot C = 4/3');
    expect(solution.steps[0].math).toMatch(/hypotenuse = √\(3\^2 \+ 4\^2\) = 5/);
    const exact = solveTrigRatios({ opposite: 1, adjacent: '√3', angleName: 'A', ratios: ['tan', 'cot'] });
    expect(exact.result).toBe('tan A = √3/3, cot A = √3');
  });

  it('solves linear and quadratic equations with steps', () => {
    const linear = solveLinear('3x + 5 = 20');
    expect(linear.steps.map((step) => step.math)).toEqual(['3x + 5 = 20', '3x = 15', 'x = 15/3', 'x = 5']);
    expect(solveLinear('2x + 1 = 4').result).toBe('x = 3/2');
    const quadratic = solveQuadratic('x^2 - 5x + 6 = 0');
    expect(quadratic.result).toBe('x₁ = 3, x₂ = 2');
    expect(quadratic.steps.some((step) => step.math.includes('Δ = b^2 - 4ac'))).toBe(true);
    expect(solveQuadratic('x^2 + 1 = 0').result).toBe('no real solution');
    expect(solveQuadratic('x^2 - 2 = 0').result).toBe('x₁ = √2, x₂ = -√2');
    expect(() => solveLinear('x + y = 2')).toThrow(/more than one unknown/);
  });

  it('picks the solver from what it was given', () => {
    expect(solve({ input: '2 + 2 · 3' }).result).toBe('8');
    expect(solve({ input: '4x = 12' }).result).toBe('x = 3');
    expect(solve({ sides: { a: 6, b: 8 } }).result).toBe('c = 10');
    expect(solve({ triangle: { opposite: 5, hypotenuse: 13, ratios: ['sin'] } }).result).toBe('sin A = 5/13');
  });

  it('solves systems of linear equations by Gaussian elimination', () => {
    const two = solveSystem({ equations: ['2x + y = 5', 'x - y = 1'] });
    expect(two.result).toBe('x = 2, y = 1');
    const three = solveSystem({ equations: ['x + y + z = 6', '2y + 5z = -4', '2x + 5y - z = 27'] });
    expect(three.result).toBe('x = 5, y = 3, z = -2');
    expect(() => solveSystem({ equations: ['x + y = 1'] })).toThrow(/at least two/);
    expect(() => solveSystem({ equations: ['x + y = 1', 'x + z = 2'] })).toThrow(/unknowns/);
    expect(() => solveSystem({ equations: ['x + y = 1', '2x + 2y = 2'] })).toThrow(/does not have exactly one solution/);
    expect(solve({ system: { equations: ['x + y = 3', 'x - y = 1'] } }).result).toBe('x = 2, y = 1');
  });

  it('solves linear and quadratic inequalities, flipping the sign when dividing by a negative', () => {
    expect(solveInequality('2x + 3 < 11').result).toBe('x < 4');
    expect(solveInequality('-2x + 3 < 11').result).toBe('x > -4'); // dividing by -2 flips <
    expect(solveInequality('2x + 1 >= 2x - 5').result).toBe('all real numbers'); // x cancels; always true
    expect(solveInequality('x^2 - 5x + 6 > 0').result).toBe('x < 2 or x > 3'); // opens up, outside the roots
    expect(solveInequality('x^2 - 5x + 6 < 0').result).toBe('2 < x < 3'); // opens up, between the roots
    expect(solveInequality('x^2 + 1 < 0').result).toBe('no solution'); // never negative
    expect(solveInequality('x^2 + 1 > 0').result).toBe('all real numbers'); // always positive
    expect(solveInequality('x^2 - 4x + 4 >= 0').result).toBe('all real numbers'); // (x-2)^2, touches zero once
    expect(solveInequality('x^2 - 4x + 4 > 0').result).toBe('all real numbers except x = 2');
    expect(solveInequality('-x^2 + 4 > 0').result).toBe('-2 < x < 2'); // opens down, between the roots
  });

  it('solves logarithmic and exponential equations by undoing them', () => {
    expect(solveLogarithmic('log(x) = 2').result).toBe('x = 100');
    expect(solveLogarithmic('ln(x) = 0').result).toBe('x = 1');
    expect(solveLogarithmic('log(2x + 1, 3) = 2').result).toBe('x = 4');
    expect(solveLogarithmic('2^x = 8').result).toBe('x = 3');
    expect(solveLogarithmic('3^(x+1) = 81').result).toBe('x = 3');
    expect(() => solveLogarithmic('x + 1 = 2')).toThrow(/one logarithm or one exponential/);
  });

  it('gives the general solution of a trigonometric equation', () => {
    const solution = solveTrigEquation('sin(x) = 0.5');
    expect(solution.result).toBe('x = 30° + k·360°,  k ∈ ℤ;  x = 150° + k·360°,  k ∈ ℤ');
    expect(solveTrigEquation('tan(x) = 1').result).toBe('x = 45° + k·180°,  k ∈ ℤ');
    expect(solveTrigEquation('sin(x) = 2').result).toBe('no solution');
    // The angle is 2x, so the x-period is half the angle's period.
    const scaled = solveTrigEquation('cos(2x) = 1');
    expect(scaled.result).toContain('k·180°');
  });

  it('differentiates symbolically with the standard rules', () => {
    expect(solveDerivative({ expression: 'x^3' }).result).toBe("f'(x) = 3·x^2");
    expect(solveDerivative({ expression: '3*x^2 + 2*x' }).result).toMatch(/f'\(x\) =/);
    const atPoint = solveDerivative({ expression: 'x^2', at: 3 });
    expect(atPoint.result).toBe('f\'(3) = 6');
    const trig = solveDerivative({ expression: 'sin(x)' });
    expect(trig.result).toBe("f'(x) = cos(x)");
    expect(trig.note).toMatch(/radians/);
    expect(() => solveDerivative({ expression: 'x^x' })).toThrow(/constant/);
  });

  it('evaluates definite integrals exactly for polynomials and numerically otherwise', () => {
    const polynomial = solveIntegral({ expression: 'x^2', from: 0, to: 3 });
    expect(polynomial.result).toBe('9');
    expect(polynomial.steps.some((s) => s.math.includes('F(x)'))).toBe(true);
    expect(solveIntegral({ expression: '2*x + 1', from: 0, to: 2 }).result).toBe('6');
    const numeric = solveIntegral({ expression: 'sin(x)', from: 0, to: Math.PI });
    expect(Number(numeric.result)).toBeCloseTo(2, 4);
    expect(numeric.note).toMatch(/Numerical/);
  });
});

describe('figures and graphs', () => {
  it('completes a right triangle and marks the right angle', () => {
    const built = buildFigure({ kind: 'right-triangle', labels: ['A', 'B', 'C'], sides: [3, 4], size: 200 });
    expect(built.notes[0]).toBe('hypotenuse = √(3² + 4²) = 5');
    expect(built.svg).toContain('<svg');
    expect(built.svg).toContain('>A<');
    expect(built.svg).toContain('>C<');
    // The right-angle square is drawn as its own path.
    expect((built.svg.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(built.width).toBeGreaterThan(100);
  });

  it('draws squares, circles and labelled angles', () => {
    expect(buildFigure({ kind: 'square', sides: ['a'] }).svg).toContain('>a<');
    const circle = buildFigure({ kind: 'circle', radius: 'r', labels: ['O'] });
    expect(circle.svg).toContain('<circle');
    expect(circle.svg).toContain('>r<');
    expect(buildFigure({ kind: 'angle', degrees: 60 }).svg).toContain('>60°<');
    expect(buildFigure({ kind: 'polygon', corners: 6 }).svg).toContain('<path');
  });

  it('recovers when the right angle is put where the sides say it cannot be', () => {
    // A model that says "right angle at C" but lists 3 and 4 as the first two sides meant a 3-4-5 triangle.
    const built = buildFigure({ kind: 'right-triangle', labels: ['A', 'B', 'C'], sides: [3, 4], rightAngleAt: 'C' });
    expect(built.notes.join(' ')).toMatch(/both are legs/);
    expect(built.svg).toContain('<svg');
  });

  it('refuses lengths that cannot make a triangle', () => {
    expect(() => buildFigure({ kind: 'triangle', sides: [1, 1, 9] })).toThrow(/cannot make a triangle/);
    expect(() => buildFigure({ kind: 'right-triangle', sides: [3] })).toThrow(/two of its three sides/);
  });

  it('plots functions on axes', () => {
    const plot = buildPlot({ functions: [{ expr: 'x^2 - 2' }, { expr: 'y = 2x + 1' }], xMin: -4, xMax: 4 });
    expect(plot.svg).toContain('<svg');
    expect((plot.svg.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(plot.svg).toContain('clip-path="url(#plot-area)"');
    const withUnknown = buildPlot({ functions: [{ expr: 'a·x' }] });
    expect(withUnknown.notes[0]).toMatch(/I do not know what a is/);
  });
});

describe('maths typesetting', () => {
  it('builds fractions, roots and powers', () => {
    const html = renderMath('a^2 + sqrt(3)^2 = 2^2');
    expect(html).toContain('<sup>2</sup>');
    expect(html).toContain('m-sqrt');
    expect(renderMath('3/5')).toContain('m-frac');
    expect(renderMath('\\frac{\\sqrt{3}}{2}')).toContain('m-radicand');
    expect(renderMath('sin A = karşı/hip')).toContain('m-frac');
  });

  it('escapes anything that is not maths', () => {
    expect(renderMath('<script>alert(1)</script>')).not.toContain('<script>');
    expect(renderMath('a < b')).toContain('&lt;');
  });

  it('writes one-line maths for exports', () => {
    expect(mathToPlain('a^2 + b^2 = c^2')).toBe('a² + b² = c²');
    expect(mathToPlain('sqrt(3)/2')).toBe('√(3)/2');
    expect(mathToPlain('\\frac{1}{2} \\cdot x')).toBe('1/2 · x');
  });
});

describe('practice tests', () => {
  it('generates the same test for the same seed, with answers and steps', () => {
    const first = generateQuiz({ topic: 'pythagoras', count: 4, difficulty: 'medium', seed: 'cellar' });
    const second = generateQuiz({ topic: 'pythagoras', count: 4, difficulty: 'medium', seed: 'cellar' });
    expect(first).toEqual(second);
    expect(first.questions).toHaveLength(4);
    for (const question of first.questions) {
      expect(question.prompt.length).toBeGreaterThan(10);
      expect(question.answer).toBeTruthy();
      expect(question.steps?.length).toBeGreaterThan(1);
      expect(question.figure?.kind).toBe('right-triangle');
    }
  });

  it('covers every topic and can ask multiple choice', () => {
    const topics = ['arithmetic', 'fractions', 'powers', 'pythagoras', 'trig-ratios', 'special-angles', 'linear', 'quadratic', 'area', 'mixed'] as const;
    for (const topic of topics) {
      const quiz = generateQuiz({ topic, count: 3, seed: `seed-${topic}` });
      expect(quiz.questions).toHaveLength(3);
      for (const question of quiz.questions) expect(question.answer).toBeTruthy();
    }
    const choices = generateQuiz({ topic: 'arithmetic', count: 2, choices: true, seed: 7 });
    for (const question of choices.questions) {
      expect(question.choices?.length).toBe(4);
      expect(question.choices).toContain(question.answer);
    }
  });
});

describe('board blocks', () => {
  const ids = () => new Set<string>();

  it('reads blocks the way models write them', () => {
    const derivation = normalizeBlock({ type: 'steps', title: 'Find a', steps: ['a^2 + 3 = 4', { math: 'a^2 = 1', reason: 'move the 3' }, 'a = 1 // take the root'], answer: 'a = 1' }, ids()).block;
    expect(derivation).toMatchObject({
      id: 'b1',
      type: 'derivation',
      title: 'Find a',
      result: 'a = 1',
      steps: [{ math: 'a^2 + 3 = 4' }, { math: 'a^2 = 1', reason: 'move the 3' }, { math: 'a = 1', reason: 'take the root' }],
    });
    const figure = normalizeBlock({ type: 'right triangle', legs: [3, 4], hypotenuse: 5, vertices: ['A', 'B', 'C'] }, ids()).block;
    expect(figure).toMatchObject({ type: 'figure', figure: { kind: 'right-triangle', sides: [3, 4, 5], labels: ['A', 'B', 'C'], rightAngleAt: 1 } });
    const table = normalizeBlock({ type: 'table', rows: [{ angle: '30°', sin: '1/2' }, { angle: '45°', sin: '√2/2' }] }, ids()).block;
    expect(table).toMatchObject({ type: 'table', columns: ['angle', 'sin'], rows: [['30°', '1/2'], ['45°', '√2/2']] });
    expect(normalizeBlock('Just a note', ids()).block).toMatchObject({ type: 'text', body: 'Just a note' });
    expect(normalizeBlock({ type: 'graph', functions: ['sin(x)'] }, ids()).block).toMatchObject({ type: 'plot', plot: { functions: [{ expr: 'sin(x)' }] } });
  });

  it('guesses the block type when the model invents a word for it', () => {
    expect(normalizeBlock({ type: 'block', formula: 'a^2 + b^2 = c^2' }, ids()).block).toMatchObject({ type: 'formula' });
    expect(normalizeBlock({ type: 'section', content: 'A right triangle has one 90° angle.' }, ids()).block).toMatchObject({ type: 'text', body: 'A right triangle has one 90° angle.' });
    expect(normalizeBlock({ type: 'concept', heading: 'Hypotenuse' }, ids()).block).toMatchObject({ type: 'text', heading: 'Hypotenuse' });
  });

  it('says what is wrong instead of dropping the block', () => {
    expect(normalizeBlock({ type: 'derivation' }, ids()).error).toMatch(/needs steps/);
    expect(normalizeBlock({ type: 'quiz', questions: [] }, ids()).error).toMatch(/needs questions/);
    expect(normalizeBlock({ hello: 'world' }, ids()).error).toMatch(/could not tell what kind of block/);
  });

  it('patches only the fields it is given', () => {
    const block = normalizeBlock({ type: 'derivation', steps: ['x = 1'] }, ids()).block!;
    const { block: patched, changed } = patchBlock(block, { addSteps: ['x = 2'], result: 'x = 2' });
    expect(changed).toEqual(['steps', 'result']);
    expect(patched).toMatchObject({ type: 'derivation', steps: [{ math: 'x = 1' }, { math: 'x = 2' }], result: 'x = 2' });
  });

  it('describes a board for the model', () => {
    const board = sampleBoard();
    const outline = boardOutline(board);
    expect(outline).toContain('Topic: Right triangles');
    expect(outline).toContain('[b1] formula');
    expect(outline).toContain('[b2] derivation "Find a": 3 steps');
    expect(describeBlock(board.blocks[2], 2)).toContain('right-triangle');
  });
});

describe('board export', () => {
  it('renders the whole board as a printable page', () => {
    const html = boardHtml(sampleBoard());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Right triangles');
    expect(html).toContain('m-frac');
    expect(html).toContain('<svg');
    expect(html).toContain('Answer:');
    expect(html).toContain('@page');
  });

  it('prints a test paper without answers, with a key at the end', () => {
    const html = boardHtml(sampleBoard(), { answers: false });
    expect(html).not.toContain('Answer:</strong> 5');
    expect(html).toContain('answer-key');
    expect(html).toContain('Answer key');
  });

  it('writes a Markdown study sheet', () => {
    const markdown = boardMarkdown(sampleBoard());
    expect(markdown).toContain('# Trigonometry');
    expect(markdown).toContain('> a² + b² = c²');
    expect(markdown).toContain('**Answer:** 5');
    expect(markdown).toContain('| angle | sin |');
  });

  it('turns strokes into path data', () => {
    expect(strokeGeometry({ tool: 'line', color: '#000', width: 2, points: [0, 0, 10, 10] }).d).toBe('M0 0L10 10');
    expect(strokeGeometry({ tool: 'rect', color: '#000', width: 2, points: [0, 0, 10, 20] }).d).toBe('M0 0h10v20h-10Z');
    expect(strokeGeometry({ tool: 'arrow', color: '#000', width: 2, points: [0, 0, 20, 0] }).head).toContain('L20 0L');
    expect(strokeGeometry({ tool: 'pen', color: '#000', width: 2, points: [0, 0, 5, 5, 10, 0] }).d).toContain('Q');
  });
});

function sampleBoard(): MathBoard {
  const now = Date.now();
  return {
    id: 'board1',
    conversationId: 'conv1',
    title: 'Trigonometry',
    topic: 'Right triangles and trigonometric ratios',
    paper: 'grid',
    angleMode: 'deg',
    version: 1,
    createdAt: now,
    updatedAt: now,
    blocks: [
      { id: 'b1', type: 'formula', title: 'Pythagorean theorem', formula: 'a^2 + b^2 = c^2', where: ['c: the hypotenuse'] },
      {
        id: 'b2',
        type: 'derivation',
        title: 'Find a',
        steps: [{ math: 'a^2 + (√3)^2 = 2^2' }, { math: 'a^2 + 3 = 4' }, { math: 'a = 1', reason: 'take the square root' }],
        result: 'a = 1',
      },
      { id: 'b3', type: 'figure', figure: { kind: 'right-triangle', sides: [3, 4, 5], labels: ['A', 'B', 'C'], rightAngleAt: 1 }, caption: 'sin C = 3/5' },
      { id: 'b4', type: 'table', title: 'Special angles', columns: ['angle', 'sin'], rows: [['30°', '1/2'], ['45°', '√2/2']], math: true },
      { id: 'b5', type: 'quiz', title: 'Practice', instructions: 'Work these out.', questions: [{ id: 'q1', prompt: 'Legs 3 and 4 — how long is the hypotenuse?', answer: '5', steps: ['3² + 4² = c²', 'c = 5'], points: 1 }] },
      { id: 'b6', type: 'sketch', height: 300, strokes: [{ tool: 'pen', color: '#d97757', width: 2, points: [10, 10, 40, 40, 80, 20] }] },
    ],
  };
}

describe('math sessions', () => {
  class FakeProvider {
    readonly id = 'fake';
    readonly kind = 'openai' as const;
    readonly name = 'Fake';
    readonly canManageModels = false;
    readonly canDownload = false;
    script: (req: ChatRequest) => StreamEvent[] = () => [{ type: 'text', delta: 'ok' }];
    async status(): Promise<ProviderStatus> {
      return { id: this.id, kind: this.kind, name: this.name, baseUrl: '', state: 'online', canManageModels: false, canDownload: false };
    }
    async listModels(): Promise<ModelEntry[]> {
      return [];
    }
    async *chat(req: ChatRequest): AsyncGenerator<StreamEvent> {
      for (const event of this.script(req)) yield event;
      yield { type: 'done', stopReason: 'stop' };
    }
  }
  const fake = new FakeProvider();
  const entry: ModelEntry = {
    ref: { providerId: 'fake', modelId: 'tutor' },
    providerKind: 'openai',
    providerName: 'Fake',
    displayName: 'Fake Tutor',
    contextLength: 32768,
    capabilities: { vision: false, tools: true, reasoning: false, embedding: false },
    reasoningStyle: 'none',
    loaded: true,
  };
  let userData: string;
  const call = (name: string, args: unknown): StreamEvent => ({ type: 'tool_call', id: `c${Math.random()}`, name, argumentsDelta: JSON.stringify(args) });
  const toolResults = (req: ChatRequest) =>
    req.messages
      .slice(req.messages.map((m) => m.role).lastIndexOf('user'))
      .filter((m) => m.role === 'tool')
      .map((m) => m.content);

  async function finished(conversationId: string, messageId: string) {
    for (let i = 0; i < 500; i++) {
      const message = chat.getConversation(conversationId).messages.find((candidate) => candidate.id === messageId)!;
      if (message.status !== 'streaming') return message;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('timed out');
  }

  beforeAll(async () => {
    userData = await mkdtemp(join(tmpdir(), 'cellar-math-data-'));
    initPaths(userData, userData);
    closeDatabase();
    openDatabase(':memory:');
    settings.update({ autoTitle: false, coworkNotifications: false });
    (providers as unknown as { get: () => FakeProvider }).get = () => fake;
    (providers as unknown as { findModel: () => Promise<ModelEntry> }).findModel = async () => entry;
  });

  afterAll(async () => {
    chat.stopAll();
    await rm(userData, { recursive: true, force: true }).catch(() => undefined);
    await rm(process.env.CELLAR_HOME!, { recursive: true, force: true }).catch(() => undefined);
  });

  it('builds a board through the agent loop, with the maths worked out by Cellar', async () => {
    fake.script = (req) => {
      const results = toolResults(req);
      if (results.length === 0) {
        return [
          { type: 'text', delta: 'Let me set this up.' },
          call('set_board', { topic: 'Right triangles', paper: 'grid' }),
          call('add_blocks', { blocks: [{ type: 'formula', title: 'Pythagorean theorem', formula: 'a^2 + b^2 = c^2', where: ['c: the hypotenuse'] }] }),
        ];
      }
      if (results.length === 2) {
        return [
          call('draw_figure', { kind: 'right-triangle', labels: ['A', 'B', 'C'], sides: ['a', '√3', 2], rightAngleAt: 'B', caption: 'Find a' }),
          call('solve_steps', { sides: { b: '√3', c: 2 }, title: 'Find a' }),
        ];
      }
      if (results.length === 4) return [call('make_quiz', { topic: 'pythagoras', count: 3, seed: 'test' })];
      return [{ type: 'text', delta: 'There you go.' }];
    };
    const first = await chat.send({ content: 'Teach me the Pythagorean theorem', attachmentIds: [], model: entry.ref, thinking: 'off', math: { paper: 'grid' } });
    const done = await finished(first.conversationId, first.assistantMessageId);
    expect(done.status).toBe('complete');
    expect(chat.getConversation(first.conversationId).conversation.kind).toBe('math');

    const board = boardForConversation(first.conversationId)!;
    expect(board.topic).toBe('Right triangles');
    expect(board.blocks.map((block) => block.type)).toEqual(['formula', 'figure', 'derivation', 'quiz']);
    const derivation = board.blocks[2];
    if (derivation.type !== 'derivation') throw new Error('expected a derivation');
    // Cellar produced the steps, so the arithmetic is right whatever the model would have written.
    expect(derivation.steps.map((step) => step.math)).toEqual(['a^2 + b^2 = c^2', 'a^2 + (√3)^2 = 2^2', 'a^2 + 3 = 4', 'a^2 = 4 - 3', 'a^2 = 1', 'a = 1']);
    expect(derivation.result).toBe('a = 1');
    const quiz = board.blocks[3];
    if (quiz.type !== 'quiz') throw new Error('expected a quiz');
    expect(quiz.questions).toHaveLength(3);
    for (const question of quiz.questions) expect(question.answer).toBeTruthy();
    const figure = board.blocks[1];
    if (figure.type !== 'figure') throw new Error('expected a figure');
    expect(figure.figure).toMatchObject({ kind: 'right-triangle', rightAngleAt: 'B', sides: ['a', '√3', 2] });
  });

  it('works on the block the user has selected and reports mistakes back to the model', async () => {
    const board = boardForConversation(listBoards()[0].conversationId)!;
    const target = board.blocks[0].id;
    let sawError = '';
    fake.script = (req) => {
      const results = toolResults(req);
      if (results.length === 0) return [call('update_block', { block: target, title: 'Pisagor teoremi' }), call('solve_steps', { sides: { a: 3 } })];
      sawError = results[1] ?? '';
      return [{ type: 'text', delta: 'Renamed it.' }];
    };
    const followUp = await chat.send({
      conversationId: board.conversationId,
      content: 'Rename this in Turkish',
      attachmentIds: [],
      model: entry.ref,
      thinking: 'off',
      mathSelection: { blockId: target },
    });
    await finished(followUp.conversationId, followUp.assistantMessageId);
    const updated = boardForConversation(board.conversationId)!;
    expect(updated.blocks[0]).toMatchObject({ type: 'formula', title: 'Pisagor teoremi' });
    // A solver that cannot work is explained to the model rather than crashing the turn.
    expect(sawError).toMatch(/two of the three sides/);
  });

  it('keeps board edits and model changes from overwriting each other', async () => {
    const board = boardForConversation(listBoards()[0].conversationId)!;
    const edited = { ...board, blocks: [...board.blocks, { id: 'bx', type: 'text' as const, body: 'My own note' }] };
    const saved = saveBoard(edited, board.version);
    expect(saved.version).toBe(board.version + 1);
    expect(saved.blocks.at(-1)).toMatchObject({ type: 'text', body: 'My own note' });
    expect(() => saveBoard(edited, board.version)).toThrow(/changed while you were editing/);
  });

  it('creates a blank board and duplicates one without its chat', async () => {
    const blank = await chat.createBoard({ topic: 'Fractions', paper: 'lined', angleMode: 'rad', title: 'Fractions' });
    const board = boardForConversation(blank.conversationId)!;
    expect(board).toMatchObject({ topic: 'Fractions', paper: 'lined', angleMode: 'rad', blocks: [] });
    expect(chat.getConversation(blank.conversationId).messages).toHaveLength(0);

    const source = boardForConversation(listBoards().find((summary) => summary.conversationId !== blank.conversationId)!.conversationId)!;
    const copy = await chat.duplicateBoard(source.conversationId);
    const copied = boardForConversation(copy.conversationId)!;
    expect(copied.blocks.map((block) => block.type)).toEqual(source.blocks.map((block) => block.type));
    expect(copied.id).not.toBe(source.id);
    expect(chat.getConversation(copy.conversationId).conversation.title).toContain('(copy)');
  });

  it('offers the calculator in ordinary chats too', () => {
    expect(chatBaseTools({ chatWebSearch: false }).map((tool) => tool.name)).toEqual(['calculate']);
    expect(chatBaseTools({ chatWebSearch: true }).map((tool) => tool.name)).toContain('calculate');
  });
});

