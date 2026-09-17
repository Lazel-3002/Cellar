import { z } from 'zod';
import { calculate } from '@shared/math/calc';
import { buildFigure } from '@shared/math/figure';
import { mathToPlain } from '@shared/math/mathtext';
import { blockIds, boardOutline, describeBlock, findBlock, LIMITS, normalizeBlock, nextBlockId, patchBlock } from '@shared/math/normalize';
import { buildPlot } from '@shared/math/plot';
import { generateQuiz, QUIZ_TOPICS } from '@shared/math/quiz';
import { solve, solutionText } from '@shared/math/solve';
import type { DerivationBlock, FigureBlock, MathBlock, MathBoard, PlotBlock, QuizBlock } from '@shared/types/math';
import { defineTool, ToolError, type AgentTool, type ToolContext } from '../agent/tools/types';
import { getBoard, updateBoard } from './store';

const num = z.union([z.number(), z.string()]);
const measure = z.union([z.number(), z.string()]).describe('A length: a number, a root like "√3", or a letter like "a"');

const figureSchema = z.looseObject({
  kind: z.string().optional().describe('triangle, right-triangle, square, rectangle, circle, polygon, angle or segment'),
  labels: z.array(z.string()).optional().describe('Vertex names in order, e.g. ["A","B","C"]'),
  sides: z.array(measure).optional().describe('Side i runs from vertex i to vertex i+1. A right triangle needs two of its three sides'),
  angles: z.array(measure).optional().describe('Angle at each vertex, for an arc with a label'),
  rightAngleAt: num.optional().describe('Vertex with the right angle (index or label)'),
  radius: measure.optional(),
  width: measure.optional(),
  height: measure.optional(),
  corners: z.number().optional().describe('Regular polygon corner count'),
  degrees: measure.optional().describe('The angle to draw, for kind "angle"'),
  marks: z.array(z.looseObject({ from: num, to: num, label: z.string().optional(), dashed: z.boolean().optional() })).optional().describe('Extra lines: a height, a diagonal, a median'),
  grid: z.boolean().optional().describe('Squared paper behind the figure'),
  fill: z.boolean().optional(),
  size: z.number().optional().describe('Longest side in pixels (140–560, default 260)'),
});

const blockSchema = z
  .looseObject({
    type: z.string().describe('text, formula, derivation, figure, plot, table, quiz or sketch'),
    title: z.string().optional(),
    body: z.string().optional().describe('text: the explanation. Blank lines start paragraphs, "- " lines make a list'),
    tone: z.string().optional().describe('text: note, tip or warning for a coloured block'),
    formula: z.string().optional().describe('formula: one formula per line, e.g. "a^2 + b^2 = c^2"'),
    where: z.array(z.string()).optional().describe('formula: what the letters mean, e.g. "c: the hypotenuse"'),
    steps: z.array(z.union([z.string(), z.looseObject({ math: z.string(), reason: z.string().optional() })])).optional().describe('derivation: one line per step'),
    result: z.string().optional().describe('derivation: the answer, highlighted at the end'),
    figure: figureSchema.optional(),
    plot: z.looseObject({ functions: z.array(z.union([z.string(), z.looseObject({ expr: z.string(), label: z.string().optional() })])).optional(), xMin: z.number().optional(), xMax: z.number().optional() }).optional(),
    columns: z.array(z.string()).optional().describe('table: header cells'),
    rows: z.array(z.array(z.string())).optional().describe('table: one array of cells per row'),
    questions: z.array(z.looseObject({ prompt: z.string(), answer: z.string().optional(), choices: z.array(z.string()).optional(), steps: z.array(z.string()).optional() })).optional(),
    height: z.number().optional().describe('sketch: drawing height in pixels'),
    note: z.string().optional().describe('A short remark under the block'),
  })
  .describe('A block on the board');

function boardId(ctx: ToolContext): string {
  const id = ctx.task.math?.boardId;
  if (!id) throw new ToolError('Math tools only work in a Math session.');
  return id;
}

function blockOrThrow(board: MathBoard, ref: unknown, ctx: ToolContext): MathBlock {
  if (ref === undefined || ref === null || ref === '') {
    // No id given: the block the user had selected when they sent the message.
    const selected = board.blocks.find((block) => block.id === ctx.task.math?.selection?.blockId);
    if (selected) return selected;
    throw new ToolError(board.blocks.length ? `Say which block: ${board.blocks.map((block) => block.id).join(', ')}.` : 'The board has no blocks yet. Add one with add_blocks.');
  }
  const found = findBlock(board, ref as string | number);
  if (!found) throw new ToolError(`No block "${String(ref)}". Blocks: ${board.blocks.map((block) => block.id).join(', ') || 'none yet'}.`);
  return found;
}

function insertAt(board: MathBoard, after: unknown): number {
  if (after === undefined || after === null || after === '') return board.blocks.length;
  if (typeof after === 'string' && (after === 'start' || after === 'top')) return 0;
  const target = findBlock(board, after as string | number);
  return target ? board.blocks.findIndex((block) => block.id === target.id) + 1 : board.blocks.length;
}

function summary(board: MathBoard): string {
  return `The board now has ${board.blocks.length} block${board.blocks.length === 1 ? '' : 's'}.`;
}

const added = (blocks: MathBlock[], board: MathBoard) =>
  blocks.map((block) => describeBlock(block, board.blocks.findIndex((candidate) => candidate.id === block.id))).join('\n');

export const calculateTool = defineTool({
  name: 'calculate',
  description:
    'Work out arithmetic exactly instead of guessing: + - × ÷, powers, roots, fractions, percentages, trigonometry, gcd/lcm, factorials. Fractions and square roots stay exact (12/13 + 5/13 = 17/13, cos 30 = √3/2) and a decimal is given too. Use it for every calculation you are about to write down.',
  category: 'read',
  input: z.object({
    expressions: z.union([z.string(), z.array(z.string()).max(20)]).describe('One expression, or several, e.g. ["3^2 + 4^2", "sqrt(3)/2", "12/13 + 5/13"]'),
    steps: z.boolean().optional().describe('Also return the reduction, one line per round (3^2 + 4^2 → 9 + 16 → 25)'),
    angle: z.enum(['deg', 'rad']).optional().describe('Angle unit for sin, cos, tan (default: the board setting, otherwise degrees)'),
    variables: z.record(z.string(), z.number()).optional().describe('Values for letters in the expression, e.g. { "x": 4 }'),
  }),
  async run(args, ctx) {
    const list = (Array.isArray(args.expressions) ? args.expressions : [args.expressions]).map((value) => String(value)).filter((value) => value.trim());
    if (!list.length) throw new ToolError('Give at least one expression to calculate.');
    const angle = args.angle ?? (ctx.task.math ? getBoard(ctx.task.math.boardId).angleMode : 'deg');
    const lines = list.map((expression) => {
      const result = calculate(expression, { angle, steps: args.steps, vars: args.variables, decimals: 6 });
      if (!result.ok) return `${expression} → error: ${result.error}`;
      const steps = result.steps && result.steps.length > 2 ? `\n   ${result.steps.join(' = ')}` : '';
      return `${result.input} = ${result.answer}${result.approx ? ` (≈ ${result.approx})` : ''}${steps}`;
    });
    return lines.join('\n');
  },
});

export const getBoardTool = defineTool({
  name: 'get_board',
  description: 'Read the board: its topic and every block with its id. Pass a block id to get that block as full JSON.',
  category: 'read',
  input: z.object({ block: z.string().optional().describe('Block id for the full contents') }),
  async run(args, ctx) {
    const board = getBoard(boardId(ctx));
    if (args.block) {
      const block = blockOrThrow(board, args.block, ctx);
      return `${describeBlock(block, board.blocks.indexOf(block))}\n${JSON.stringify(block)}`;
    }
    return boardOutline(board, Math.min(12_000, ctx.maxResultChars));
  },
});

export const setBoardTool = defineTool({
  name: 'set_board',
  description: 'Set what the board is about, the paper it is written on and whether angles are in degrees or radians.',
  category: 'math',
  input: z.object({
    topic: z.string().max(400).optional().describe('What the board covers, e.g. "Right triangles and trigonometric ratios"'),
    paper: z.enum(['grid', 'dots', 'lined', 'plain']).optional().describe('Background (default grid, like squared paper)'),
    angleMode: z.enum(['deg', 'rad']).optional(),
  }),
  async run(args, ctx) {
    const { board } = updateBoard(boardId(ctx), (draft) => {
      if (args.topic !== undefined) draft.topic = args.topic.slice(0, 400);
      if (args.paper) draft.paper = args.paper;
      if (args.angleMode) draft.angleMode = args.angleMode;
    });
    return `Board set: ${board.topic || 'no topic'}, ${board.paper} paper, angles in ${board.angleMode === 'deg' ? 'degrees' : 'radians'}.`;
  },
});

export const addBlocksTool = defineTool({
  name: 'add_blocks',
  description:
    'Add blocks to the board: an explanation (text), a boxed rule (formula), worked steps (derivation), a geometry figure, a graph, a table of values, a practice test or an empty whiteboard to draw on. Blocks are shown top to bottom in the order you give.',
  category: 'math',
  input: z.object({
    blocks: z.array(blockSchema).min(1).max(20),
    after: z.string().optional().describe('Insert after this block id ("start" puts them first); default is at the end'),
  }),
  async run(args, ctx) {
    const errors: string[] = [];
    const { board, result } = updateBoard(boardId(ctx), (draft) => {
      const ids = blockIds(draft);
      const created: MathBlock[] = [];
      for (const [index, input] of args.blocks.entries()) {
        if (draft.blocks.length + created.length >= LIMITS.blocks) {
          errors.push(`The board is full (${LIMITS.blocks} blocks).`);
          break;
        }
        const { block, error } = normalizeBlock(input, ids);
        if (block) created.push(block);
        else errors.push(`Block ${index + 1}: ${error}`);
      }
      const at = insertAt(draft, args.after);
      draft.blocks.splice(at, 0, ...created);
      return created;
    });
    if (!result.length) throw new ToolError(errors.join(' ') || 'No block could be read.');
    return [`Added ${result.length} block${result.length === 1 ? '' : 's'}:`, added(result, board), ...errors.map((error) => `Error: ${error}`), summary(board)].join('\n');
  },
});

export const updateBlockTool = defineTool({
  name: 'update_block',
  description: 'Change one block. Give only the fields that change; everything else stays as it is. Use addSteps to append to a derivation.',
  category: 'math',
  input: z
    .looseObject({
      block: z.string().describe('The block id'),
      title: z.string().optional(),
      body: z.string().optional(),
      formula: z.string().optional(),
      steps: z.array(z.union([z.string(), z.looseObject({ math: z.string(), reason: z.string().optional() })])).optional(),
      addSteps: z.array(z.union([z.string(), z.looseObject({ math: z.string(), reason: z.string().optional() })])).optional().describe('Append these steps to a derivation'),
      result: z.string().optional(),
      figure: figureSchema.optional(),
      note: z.string().optional(),
    })
    .describe('The block id plus the fields to change'),
  async run(args, ctx) {
    let changed: string[] = [];
    let describe = '';
    const { board } = updateBoard(boardId(ctx), (draft) => {
      const block = blockOrThrow(draft, args.block, ctx);
      const index = draft.blocks.indexOf(block);
      const { block: next, changed: fields } = patchBlock(block, args);
      draft.blocks[index] = next;
      changed = fields;
      describe = describeBlock(next, index);
    });
    if (!changed.length) return `Nothing changed on ${args.block}. Fields I can change: title, body, formula, steps, addSteps, result, figure, note.\n${describe}`;
    return `Updated ${changed.join(', ')} on ${args.block}.\n${describe}\n${summary(board)}`;
  },
});

export const deleteBlocksTool = defineTool({
  name: 'delete_blocks',
  description: 'Remove blocks from the board.',
  category: 'math',
  input: z.object({ blocks: z.union([z.string(), z.array(z.string()).max(40)]).describe('Block ids') }),
  async run(args, ctx) {
    const refs = Array.isArray(args.blocks) ? args.blocks : [args.blocks];
    const removed: string[] = [];
    const { board } = updateBoard(boardId(ctx), (draft) => {
      for (const ref of refs) {
        const block = findBlock(draft, ref);
        if (!block) continue;
        draft.blocks = draft.blocks.filter((candidate) => candidate.id !== block.id);
        removed.push(block.id);
      }
    });
    if (!removed.length) throw new ToolError(`No block matched ${refs.join(', ')}. Blocks: ${board.blocks.map((block) => block.id).join(', ') || 'none'}.`);
    return `Deleted ${removed.join(', ')}. ${summary(board)}`;
  },
});

export const solveStepsTool = defineTool({
  name: 'solve_steps',
  description:
    'Work a problem out step by step and put the steps on the board. Cellar does the maths, so the steps are right: an expression, equation, inequality (input, e.g. "2x + 3 < 11"), a logarithmic or exponential equation (input, kind logarithmic), a trigonometric equation (input, kind trig-equation, general solution), a system of linear equations (system: one equation per unknown), a derivative (derivative: expression, optional point) or a definite integral (integral: expression and limits), the Pythagorean theorem (sides: give two of a, b, c and leave out the one to find), or the trigonometric ratios of a right triangle (triangle: two of opposite, adjacent, hypotenuse).',
  category: 'math',
  input: z.object({
    kind: z.enum(['auto', 'expression', 'equation', 'linear', 'quadratic', 'inequality', 'logarithmic', 'trig-equation', 'pythagoras', 'trig', 'system', 'derivative', 'integral']).optional().describe('Default auto: picked from what you give'),
    input: z.string().optional().describe('An expression ("3^2 + 4^2"), an equation ("3x + 5 = 20"), an inequality ("2x + 3 < 11"), a logarithmic/exponential equation ("log(x) = 2", "2^x = 8") or a trig equation ("sin(x) = 0.5")'),
    sides: z
      .looseObject({
        a: measure.optional().describe('One leg'),
        b: measure.optional().describe('The other leg'),
        c: measure.optional().describe('The hypotenuse'),
        names: z.looseObject({ a: z.string().optional(), b: z.string().optional(), c: z.string().optional() }).optional().describe('Letters to use in the derivation'),
      })
      .optional()
      .describe('Pythagoras: two of the three sides; leave out the unknown one'),
    triangle: z
      .looseObject({
        opposite: measure.optional(),
        adjacent: measure.optional(),
        hypotenuse: measure.optional(),
        angleName: z.string().optional().describe('The angle being described, e.g. "A"'),
        ratios: z.array(z.enum(['sin', 'cos', 'tan', 'cot'])).optional(),
      })
      .optional()
      .describe('Trigonometry: two sides of a right triangle'),
    system: z
      .looseObject({ equations: z.array(z.string()).min(2).max(4).describe('One linear equation per unknown, e.g. ["2x + y = 5", "x - y = 1"]') })
      .optional()
      .describe('A system of linear equations (up to 4 unknowns)'),
    derivative: z
      .looseObject({
        expression: z.string().describe('A function of the variable, e.g. "x^3 - 2x"'),
        variable: z.string().max(8).optional().describe('Default "x"'),
        at: z.number().optional().describe('Also evaluate the derivative at this point'),
      })
      .optional()
      .describe('A derivative (basic rules: sum, product, quotient, power, chain — sin/cos/tan/ln/exp/sqrt); trig assumes radians'),
    integral: z
      .looseObject({
        expression: z.string().describe('A function of the variable, e.g. "x^2 + 1"'),
        variable: z.string().max(8).optional().describe('Default "x"'),
        from: num.describe('Lower limit'),
        to: num.describe('Upper limit'),
      })
      .optional()
      .describe('A definite integral: exact for a polynomial, numerical (adaptive Simpson) otherwise'),
    title: z.string().max(200).optional(),
    insert: z.boolean().optional().describe('Put the steps on the board as a derivation block (default true)'),
    after: z.string().optional().describe('Insert after this block id'),
  }),
  async run(args, ctx) {
    const board = getBoard(boardId(ctx));
    let solution;
    try {
      solution = solve({
        kind: args.kind,
        input: args.input,
        sides: args.sides as never,
        triangle: args.triangle as never,
        system: args.system as never,
        derivative: args.derivative as never,
        integral: args.integral as never,
        angle: board.angleMode,
      });
    } catch (err) {
      throw new ToolError(err instanceof Error ? err.message : 'I could not solve that.');
    }
    if (args.insert === false) return solutionText(solution);
    const block: DerivationBlock = {
      id: nextBlockId(blockIds(board)),
      type: 'derivation',
      title: args.title?.slice(0, 200) || solution.title,
      steps: solution.steps,
      result: solution.result,
      ...(solution.note ? { note: solution.note } : {}),
    };
    const { board: next } = updateBoard(board.id, (draft) => {
      block.id = nextBlockId(blockIds(draft));
      draft.blocks.splice(insertAt(draft, args.after), 0, block);
    });
    return `Added derivation ${block.id}:\n${solutionText(solution)}\n${summary(next)}`;
  },
});

export const drawFigureTool = defineTool({
  name: 'draw_figure',
  description:
    'Draw a labelled geometry figure on the board: a triangle (right triangles get the right-angle mark, and a missing side is worked out with Pythagoras), a square, a rectangle, a circle, a polygon, an angle or a segment. Lengths can be numbers, roots like "√3" or letters like "a".',
  category: 'math',
  input: figureSchema.extend({
    title: z.string().max(200).optional(),
    caption: z.string().max(400).optional().describe('A line under the figure, e.g. "sin C = 3/5"'),
    after: z.string().optional().describe('Insert after this block id'),
  }),
  async run(args, ctx) {
    const board = getBoard(boardId(ctx));
    const { block, error } = normalizeBlock({ type: 'figure', ...args }, blockIds(board));
    if (!block || block.type !== 'figure') throw new ToolError(error ?? 'I could not read that figure.');
    let built;
    try {
      built = buildFigure(block.figure);
    } catch (err) {
      throw new ToolError(`${err instanceof Error ? err.message : 'I could not draw that figure.'} Give the sides as numbers, roots or letters.`);
    }
    const figure = block as FigureBlock;
    const { board: next } = updateBoard(board.id, (draft) => {
      figure.id = nextBlockId(blockIds(draft));
      draft.blocks.splice(insertAt(draft, args.after), 0, figure);
    });
    return [`Drew ${figure.figure.kind} as ${figure.id} (${built.width}×${built.height} px).`, ...built.notes, summary(next)].join('\n');
  },
});

export const plotGraphTool = defineTool({
  name: 'plot_graph',
  description: 'Draw a graph of one or more functions of x on labelled axes, e.g. ["x^2 - 2", "sin(x)"].',
  category: 'math',
  input: z.object({
    functions: z.array(z.union([z.string(), z.looseObject({ expr: z.string(), label: z.string().optional() })])).min(1).max(5).describe('Functions of x, e.g. ["x^2 - 2"] or [{ "expr": "2x + 1", "label": "line" }]'),
    xMin: z.number().optional().describe('Left edge (default -10)'),
    xMax: z.number().optional().describe('Right edge (default 10)'),
    yMin: z.number().optional(),
    yMax: z.number().optional(),
    points: z.array(z.looseObject({ x: z.number(), y: z.number(), label: z.string().optional() })).max(40).optional().describe('Points to mark'),
    title: z.string().max(200).optional(),
    caption: z.string().max(400).optional(),
    after: z.string().optional(),
  }),
  async run(args, ctx) {
    const board = getBoard(boardId(ctx));
    const { block, error } = normalizeBlock({ type: 'plot', ...args }, blockIds(board));
    if (!block || block.type !== 'plot') throw new ToolError(error ?? 'I could not read that graph.');
    const built = buildPlot(block.plot);
    const plot = block as PlotBlock;
    const { board: next } = updateBoard(board.id, (draft) => {
      plot.id = nextBlockId(blockIds(draft));
      draft.blocks.splice(insertAt(draft, args.after), 0, plot);
    });
    return [`Drew the graph as ${plot.id}: ${(plot.plot.functions ?? []).map((fn) => fn.expr).join(', ')}.`, ...built.notes, summary(next)].join('\n');
  },
});

export const makeQuizTool = defineTool({
  name: 'make_quiz',
  description:
    'Put a practice test on the board. Give a topic and Cellar writes the questions with correct answers and worked solutions (and a figure where it helps), so the test is right even for a small model. Pass your own questions instead when the test has to cover something specific.',
  category: 'math',
  input: z.object({
    topic: z.enum(['arithmetic', 'fractions', 'powers', 'pythagoras', 'trig-ratios', 'special-angles', 'linear', 'quadratic', 'area', 'mixed']).optional().describe(
      Object.entries(QUIZ_TOPICS)
        .map(([key, description]) => `${key}: ${description}`)
        .join('; '),
    ),
    count: z.number().min(1).max(20).optional().describe('How many questions (default 5)'),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    choices: z.boolean().optional().describe('Multiple choice instead of a written answer'),
    seed: z.union([z.number(), z.string()]).optional().describe('Same seed, same test'),
    title: z.string().max(200).optional(),
    questions: z
      .array(z.looseObject({ prompt: z.string(), answer: z.string(), choices: z.array(z.string()).optional(), steps: z.array(z.string()).optional(), figure: figureSchema.optional() }))
      .max(40)
      .optional()
      .describe('Your own questions; each needs a prompt and the answer. Work every answer out with calculate first'),
    after: z.string().optional(),
  }),
  async run(args, ctx) {
    const board = getBoard(boardId(ctx));
    let quiz: QuizBlock;
    if (args.questions?.length) {
      const { block, error } = normalizeBlock({ type: 'quiz', title: args.title, questions: args.questions }, blockIds(board));
      if (!block || block.type !== 'quiz') throw new ToolError(error ?? 'Each question needs a prompt and an answer.');
      quiz = block;
    } else {
      const generated = generateQuiz({ topic: args.topic, count: args.count, difficulty: args.difficulty, choices: args.choices, seed: args.seed ?? `${board.id}-${board.blocks.length}` });
      quiz = { id: 'q', type: 'quiz', title: args.title?.slice(0, 200) || generated.title, instructions: generated.instructions, questions: generated.questions };
    }
    const { board: next } = updateBoard(board.id, (draft) => {
      quiz.id = nextBlockId(blockIds(draft));
      draft.blocks.splice(insertAt(draft, args.after), 0, quiz);
    });
    const listed = quiz.questions.map((question, index) => `${index + 1}. ${mathToPlain(question.prompt)} → ${mathToPlain(question.answer)}`).join('\n');
    return [`Added test ${quiz.id} with ${quiz.questions.length} question${quiz.questions.length === 1 ? '' : 's'}:`, listed, 'The answers are hidden until the user reveals them.', summary(next)].join('\n');
  },
});

export const MATH_TOOLS: AgentTool[] = [
  calculateTool,
  getBoardTool,
  setBoardTool,
  addBlocksTool,
  updateBlockTool,
  deleteBlocksTool,
  solveStepsTool,
  drawFigureTool,
  plotGraphTool,
  makeQuizTool,
] as AgentTool[];
