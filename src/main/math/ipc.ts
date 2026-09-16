import { BrowserWindow } from 'electron';
import { z } from 'zod';
import { generateQuiz } from '@shared/math/quiz';
import { calculate } from '@shared/math/calc';
import { solve, solutionText } from '@shared/math/solve';
import type { MathBoard } from '@shared/types/math';
import { chat } from '../chat/orchestrator';
import { handle } from '../ipc/register';
import { exportBoard } from './export';
import { boardForConversation, listBoards, saveBoard } from './store';

const paper = z.enum(['grid', 'dots', 'lined', 'plain']);
const angleMode = z.enum(['deg', 'rad']);
const topic = z.enum(['arithmetic', 'fractions', 'powers', 'pythagoras', 'trig-ratios', 'special-angles', 'linear', 'quadratic', 'area', 'mixed']);

export function registerMathHandlers(): void {
  handle('math:list', () => listBoards());
  handle('math:get', (conversationId) => {
    const board = boardForConversation(z.string().min(1).parse(conversationId));
    if (!board) throw new Error('This board is gone. It may have been deleted.');
    return board;
  });
  handle('math:create', (options) => {
    const input = z.object({ topic: z.string().max(400).optional(), paper: paper.optional(), angleMode: angleMode.optional(), title: z.string().max(200).optional() }).parse(options ?? {});
    return chat.createBoard(input);
  });
  handle('math:save', (board, baseVersion) => {
    if (!board || typeof board !== 'object' || typeof (board as MathBoard).id !== 'string') throw new Error('The board could not be read.');
    if (JSON.stringify(board).length > 40_000_000) throw new Error('This board is too large to save.');
    return saveBoard(board as MathBoard, z.number().int().parse(baseVersion));
  });
  handle('math:duplicate', (conversationId) => chat.duplicateBoard(z.string().min(1).parse(conversationId)));
  handle('math:export', (request) => {
    const input = z
      .object({ boardId: z.string().min(1), format: z.enum(['pdf', 'png', 'md']), answers: z.boolean().optional(), scale: z.number().min(0.25).max(4).optional() })
      .parse(request);
    return exportBoard(input, { window: BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] });
  });

  // The calculator, the solvers and the test generator, for the editor's own panels.
  handle('math:calculate', (expression, options) => {
    const input = z.object({ angle: angleMode.optional(), steps: z.boolean().optional(), decimals: z.number().min(0).max(12).optional() }).parse(options ?? {});
    return calculate(z.string().max(2000).parse(expression), input);
  });
  handle('math:solve', (request) => {
    const input = z
      .object({
        kind: z.enum(['auto', 'expression', 'equation', 'linear', 'quadratic', 'pythagoras', 'trig']).optional(),
        input: z.string().max(2000).optional(),
        sides: z.record(z.string(), z.unknown()).optional(),
        triangle: z.record(z.string(), z.unknown()).optional(),
        angle: angleMode.optional(),
      })
      .parse(request);
    const solution = solve(input as never);
    return { ...solution, text: solutionText(solution) };
  });
  handle('math:quiz', (request) => {
    const input = z
      .object({
        topic: topic.optional(),
        count: z.number().min(1).max(20).optional(),
        difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
        choices: z.boolean().optional(),
        seed: z.union([z.number(), z.string().max(80)]).optional(),
      })
      .parse(request ?? {});
    return generateQuiz(input);
  });
}
