/**
 * Practice tests built here rather than by the model: the questions, the answers and the worked
 * solutions all come from the solvers, so a 2B model can still hand you a test that is correct.
 * The generator is seeded, so the same seed gives the same paper back.
 */
import { calculate } from './calc';
import { solveExpression, solveLinear, solvePythagoras, solveQuadratic, solveTrigRatios, type Solution } from './solve';
import type { FigureSpec, QuizDifficulty, QuizQuestion, QuizTopic } from '../types/math';

export interface QuizRequest {
  topic?: QuizTopic;
  count?: number;
  difficulty?: QuizDifficulty;
  /** Same seed, same test. */
  seed?: number | string;
  /** Multiple choice instead of a written answer. */
  choices?: boolean;
}

export interface GeneratedQuiz {
  title: string;
  instructions: string;
  questions: QuizQuestion[];
}

export const QUIZ_TOPICS: Record<QuizTopic, string> = {
  arithmetic: 'order of operations with + − × ÷ and powers',
  fractions: 'adding, subtracting and multiplying fractions',
  powers: 'powers and square roots',
  pythagoras: 'the Pythagorean theorem in a right triangle',
  'trig-ratios': 'sin, cos, tan and cot from the sides of a right triangle',
  'special-angles': 'exact values at 30°, 45° and 60°',
  linear: 'linear equations with one unknown',
  quadratic: 'quadratic equations',
  area: 'area and perimeter',
  mixed: 'a bit of everything',
};

const TRIPLES: Array<[number, number, number]> = [
  [3, 4, 5],
  [6, 8, 10],
  [5, 12, 13],
  [9, 12, 15],
  [8, 15, 17],
  [7, 24, 25],
  [20, 21, 29],
  [12, 16, 20],
  [10, 24, 26],
];

function hashSeed(seed: number | string | undefined): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.floor(Math.abs(seed)) || 1;
  const text = String(seed ?? Date.now());
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) || 1;
}

class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Whole number between min and max, both included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(values: readonly T[]): T {
    return values[Math.floor(this.next() * values.length) % values.length];
  }

  shuffle<T>(values: T[]): T[] {
    const out = [...values];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

const stepsOf = (solution: Solution): string[] => solution.steps.map((step) => (step.reason ? `${step.math}   (${step.reason})` : step.math));

type Draft = Omit<QuizQuestion, 'id'>;

function fromSolution(prompt: string, solution: Solution, extra: Partial<Draft> = {}): Draft {
  return { prompt, answer: solution.result, steps: stepsOf(solution), ...extra };
}

function arithmetic(rng: Rng, difficulty: QuizDifficulty): Draft {
  const scale = difficulty === 'easy' ? 12 : difficulty === 'medium' ? 30 : 60;
  const a = rng.int(2, scale);
  const b = rng.int(2, scale);
  const c = rng.int(2, 12);
  const expression =
    difficulty === 'easy'
      ? `${a} + ${b} · ${c}`
      : difficulty === 'medium'
        ? `${a} + ${b} · ${c} - ${rng.int(2, 20)}`
        : `(${a} + ${b}) · ${c} - ${rng.int(2, 9)}^2`;
  return fromSolution(`Calculate: ${expression}`, solveExpression(expression));
}

function fractions(rng: Rng, difficulty: QuizDifficulty): Draft {
  const denominators = difficulty === 'easy' ? [2, 3, 4, 5, 6] : difficulty === 'medium' ? [3, 4, 5, 6, 8, 10, 12] : [7, 9, 11, 12, 13, 15];
  const d1 = rng.pick(denominators);
  const d2 = rng.pick(denominators.filter((d) => d !== d1).concat(d1));
  const n1 = rng.int(1, d1 - 1 || 1);
  const n2 = rng.int(1, d2 - 1 || 1);
  const operator = difficulty === 'easy' ? rng.pick(['+', '-']) : rng.pick(['+', '-', '·', '/']);
  const expression = `${n1}/${d1} ${operator} ${n2}/${d2}`;
  return fromSolution(`Work out and simplify: ${expression}`, solveExpression(expression));
}

function powers(rng: Rng, difficulty: QuizDifficulty): Draft {
  const mode = rng.int(0, 2);
  if (mode === 0) {
    const base = rng.int(2, difficulty === 'hard' ? 9 : 6);
    const exponent = rng.int(2, difficulty === 'easy' ? 3 : 5);
    const expression = `${base}^${exponent}`;
    return fromSolution(`Calculate: ${expression}`, solveExpression(expression));
  }
  if (mode === 1) {
    const root = rng.pick(difficulty === 'easy' ? [4, 9, 16, 25, 36, 49] : [64, 81, 100, 121, 144, 169, 196, 225]);
    const expression = `sqrt(${root})`;
    return fromSolution(`Calculate: √${root}`, solveExpression(expression));
  }
  const inner = rng.pick([2, 3, 5, 6, 7, 8, 10, 12, 18, 20, 27, 32, 50]);
  const expression = `sqrt(${inner})^2`;
  return fromSolution(`Simplify: (√${inner})²`, solveExpression(expression));
}

function triangleFigure(a: number | string, b: number | string, c: number | string, labels = ['A', 'B', 'C'], unknown?: 'a' | 'b' | 'c'): FigureSpec {
  const sides: Array<number | string> = [a, b, c];
  if (unknown === 'a') sides[0] = '?';
  if (unknown === 'b') sides[1] = '?';
  if (unknown === 'c') sides[2] = '?';
  return { kind: 'right-triangle', labels, sides: sides.map((side) => (side === '?' ? 'x' : side)), rightAngleAt: 1, size: 200 };
}

function pythagoras(rng: Rng, difficulty: QuizDifficulty): Draft {
  if (difficulty === 'hard' && rng.next() < 0.5) {
    // An irrational answer, the way `a² + (√3)² = 2²` works out in a notebook.
    const leg = rng.pick([1, 2, 3, 4, 5]);
    const hypotenuse = leg + rng.int(1, 3);
    const solution = solvePythagoras({ b: leg, c: hypotenuse, names: { a: 'x' } });
    return fromSolution(`In a right triangle one leg is ${leg} and the hypotenuse is ${hypotenuse}. How long is the other leg x?`, solution, {
      figure: { kind: 'right-triangle', labels: ['A', 'B', 'C'], sides: ['x', leg, hypotenuse], rightAngleAt: 1, size: 200 },
    });
  }
  const [x, y, z] = rng.pick(TRIPLES);
  const hide = rng.next() < 0.6 ? 'c' : 'a';
  if (hide === 'c') {
    const solution = solvePythagoras({ a: x, b: y, names: { c: 'x' } });
    return fromSolution(`A right triangle has legs ${x} and ${y}. How long is the hypotenuse x?`, solution, {
      figure: { kind: 'right-triangle', labels: ['A', 'B', 'C'], sides: [x, y, 'x'], rightAngleAt: 1, size: 200 },
    });
  }
  const solution = solvePythagoras({ b: y, c: z, names: { a: 'x' } });
  return fromSolution(`A right triangle has a leg of ${y} and a hypotenuse of ${z}. How long is the other leg x?`, solution, {
    figure: { kind: 'right-triangle', labels: ['A', 'B', 'C'], sides: ['x', y, z], rightAngleAt: 1, size: 200 },
  });
}

function trigRatios(rng: Rng, difficulty: QuizDifficulty): Draft {
  const [opposite, adjacent, hypotenuse] = rng.pick(TRIPLES);
  const ratios = difficulty === 'easy' ? ([rng.pick(['sin', 'cos'] as const)] as Array<'sin' | 'cos'>) : difficulty === 'medium' ? (['sin', 'cos'] as const) : (['sin', 'cos', 'tan', 'cot'] as const);
  const name = 'A';
  const solution = solveTrigRatios({ opposite, adjacent, hypotenuse, angleName: name, ratios: [...ratios] });
  const asked = ratios.map((ratio) => `${ratio} ${name}`).join(', ');
  return fromSolution(`In the right triangle the side opposite ${name} is ${opposite}, the side next to it is ${adjacent} and the hypotenuse is ${hypotenuse}. Find ${asked}.`, solution, {
    figure: triangleFigure(opposite, adjacent, hypotenuse, [name, 'B', 'C']),
  });
}

function specialAngles(rng: Rng, difficulty: QuizDifficulty): Draft {
  const fn = rng.pick(difficulty === 'easy' ? (['sin', 'cos'] as const) : (['sin', 'cos', 'tan', 'cot'] as const));
  const angle = rng.pick(difficulty === 'hard' ? [30, 45, 60, 120, 135, 150] : [30, 45, 60]);
  const expression = `${fn}(${angle})`;
  const result = calculate(expression, { angle: 'deg' });
  const answer = result.exact ?? result.decimal;
  return {
    prompt: `Write the exact value: ${fn} ${angle}°`,
    answer,
    steps: [`${fn} ${angle}° = ${answer}`, result.approx ? `≈ ${result.approx}` : ''].filter(Boolean),
  };
}

function linear(rng: Rng, difficulty: QuizDifficulty): Draft {
  const a = rng.int(2, difficulty === 'easy' ? 6 : 12);
  const x = rng.int(-6, 9) || 2;
  const b = rng.int(-15, 20);
  const right = a * x + b;
  const equation = difficulty === 'hard' ? `${a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${right - rng.int(1, 5)} + ${rng.int(1, 5)}` : `${a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${right}`;
  return fromSolution(`Solve for x: ${equation}`, solveLinear(equation));
}

function quadratic(rng: Rng, difficulty: QuizDifficulty): Draft {
  if (difficulty === 'hard' && rng.next() < 0.45) {
    const a = 1;
    const b = rng.int(-8, 8) || 3;
    const c = rng.int(-9, 9) || -4;
    const equation = `x^2 ${b < 0 ? '-' : '+'} ${Math.abs(b)}x ${c < 0 ? '-' : '+'} ${Math.abs(c)} = 0`;
    return fromSolution(`Solve for x: ${equation}`, solveQuadratic(equation), { points: 2 * a });
  }
  const r1 = rng.int(-7, 7);
  const r2 = rng.int(-7, 7);
  const b = -(r1 + r2);
  const c = r1 * r2;
  const equation = `x^2 ${b < 0 ? '-' : '+'} ${Math.abs(b)}x ${c < 0 ? '-' : '+'} ${Math.abs(c)} = 0`.replace(' + 0x', '').replace(' - 0x', '').replace(' + 0', '').replace(' - 0', '');
  return fromSolution(`Solve for x: ${equation}`, solveQuadratic(equation), { points: 2 });
}

function area(rng: Rng, difficulty: QuizDifficulty): Draft {
  const shape = rng.pick(['square', 'rectangle', 'triangle', 'circle'] as const);
  if (shape === 'square') {
    const side = rng.int(3, difficulty === 'easy' ? 12 : 25);
    const solution = solveExpression(`${side}^2`);
    return fromSolution(`A square has side ${side}. What is its area?`, solution, { figure: { kind: 'square', sides: [side], labels: ['A', 'B', 'C', 'D'], size: 170 } });
  }
  if (shape === 'rectangle') {
    const width = rng.int(3, 18);
    const height = rng.int(3, 18);
    const solution = solveExpression(`${width} · ${height}`);
    return fromSolution(`A rectangle is ${width} wide and ${height} high. What is its area?`, solution, {
      figure: { kind: 'rectangle', width, height, labels: ['A', 'B', 'C', 'D'], size: 190 },
    });
  }
  if (shape === 'triangle') {
    const base = rng.pick([4, 6, 8, 10, 12, 14]);
    const height = rng.int(3, 14);
    const solution = solveExpression(`${base} · ${height} / 2`);
    return fromSolution(`A triangle has base ${base} and height ${height}. What is its area?`, solution);
  }
  const radius = rng.int(2, 12);
  const solution = solveExpression(`${radius}^2`);
  return {
    prompt: `A circle has radius ${radius}. What is its area? (Leave π in the answer.)`,
    answer: `${radius * radius}π`,
    steps: [`A = πr²`, `A = π · ${radius}²`, `A = ${radius * radius}π`],
    figure: { kind: 'circle', radius, labels: ['O'], size: 170 },
  };
}

const GENERATORS: Record<Exclude<QuizTopic, 'mixed'>, (rng: Rng, difficulty: QuizDifficulty) => Draft> = {
  arithmetic,
  fractions,
  powers,
  pythagoras,
  'trig-ratios': trigRatios,
  'special-angles': specialAngles,
  linear,
  quadratic,
  area,
};

function withChoices(draft: Draft, rng: Rng): Draft {
  const answer = draft.answer;
  const numeric = calculate(answer, { angle: 'deg' });
  const options = new Set<string>([answer]);
  if (numeric.ok && numeric.value !== null) {
    const base = numeric.value;
    const offsets = [1, -1, 2, -2, 3];
    for (const offset of rng.shuffle(offsets)) {
      if (options.size >= 4) break;
      const candidate = base + offset * (Math.abs(base) > 20 ? Math.max(1, Math.round(Math.abs(base) * 0.1)) : 1);
      const text = calculate(String(candidate), { angle: 'deg' }).answer;
      if (text && text !== answer) options.add(text);
    }
  }
  while (options.size < 4) options.add(`${options.size + 1}`);
  return { ...draft, choices: rng.shuffle([...options]) };
}

export function generateQuiz(request: QuizRequest = {}): GeneratedQuiz {
  const topic: QuizTopic = request.topic && (request.topic in GENERATORS || request.topic === 'mixed') ? request.topic : 'mixed';
  const difficulty: QuizDifficulty = request.difficulty === 'easy' || request.difficulty === 'hard' ? request.difficulty : 'medium';
  const count = Math.min(20, Math.max(1, Math.round(Number(request.count) || 5)));
  const rng = new Rng(hashSeed(request.seed));
  const topics = Object.keys(GENERATORS) as Array<Exclude<QuizTopic, 'mixed'>>;
  const questions: QuizQuestion[] = [];
  const seen = new Set<string>();
  for (let i = 0; questions.length < count && i < count * 8; i++) {
    const pick = topic === 'mixed' ? rng.pick(topics) : (topic as Exclude<QuizTopic, 'mixed'>);
    let draft: Draft;
    try {
      draft = GENERATORS[pick](rng, difficulty);
    } catch {
      continue;
    }
    if (seen.has(draft.prompt)) continue;
    seen.add(draft.prompt);
    const final = request.choices ? withChoices(draft, rng) : draft;
    questions.push({ id: `q${questions.length + 1}`, points: final.points ?? 1, ...final });
  }
  if (!questions.length) throw new Error('I could not build questions for that topic.');
  const label = topic === 'mixed' ? 'Mixed practice' : QUIZ_TOPICS[topic].charAt(0).toUpperCase() + QUIZ_TOPICS[topic].slice(1);
  return {
    title: `${label} — ${questions.length} question${questions.length === 1 ? '' : 's'} (${difficulty})`,
    instructions: request.choices ? 'Pick the right answer for each question.' : 'Work each question out, then check your answer.',
    questions,
  };
}
