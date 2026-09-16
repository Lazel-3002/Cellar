/** Board edits the editor makes. Every one goes through the store, so undo, autosave and the model see them. */
import { blockIds, nextBlockId, normalizeBlock } from '@shared/math/normalize';
import type { MathBlock, MathBoard, QuizQuestion, SketchStroke } from '@shared/types/math';
import { useMathEditor } from '@/stores/math';

const store = () => useMathEditor.getState();

export function addBlock(input: unknown, options: { after?: string | null; select?: boolean } = {}): string | null {
  const board = store().board;
  if (!board) return null;
  const { block } = normalizeBlock(input, blockIds(board));
  if (!block) return null;
  store().change((draft) => {
    const id = nextBlockId(blockIds(draft));
    const created = { ...block, id };
    const index = options.after ? draft.blocks.findIndex((candidate) => candidate.id === options.after) + 1 : draft.blocks.length;
    draft.blocks.splice(index < 1 ? draft.blocks.length : index, 0, created as MathBlock);
    block.id = id;
  });
  if (options.select !== false) store().select(block.id);
  return block.id;
}

export function updateBlock(id: string, mutate: (block: MathBlock) => void, options: { history?: boolean } = {}): void {
  store().change((draft) => {
    const block = draft.blocks.find((candidate) => candidate.id === id);
    if (block) mutate(block);
  }, options);
}

export function deleteBlock(id: string): void {
  store().change((draft) => {
    draft.blocks = draft.blocks.filter((block) => block.id !== id);
  });
  if (store().selectedId === id) store().select(null);
}

export function duplicateBlock(id: string): void {
  store().change((draft) => {
    const index = draft.blocks.findIndex((block) => block.id === id);
    if (index < 0) return;
    const copy = structuredClone(draft.blocks[index]);
    copy.id = nextBlockId(blockIds(draft));
    if (copy.type === 'quiz') copy.questions = copy.questions.map((question) => ({ ...question, userAnswer: undefined, revealed: false }));
    draft.blocks.splice(index + 1, 0, copy);
  });
}

export function moveBlock(id: string, direction: -1 | 1): void {
  store().change((draft) => {
    const index = draft.blocks.findIndex((block) => block.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draft.blocks.length) return;
    const [block] = draft.blocks.splice(index, 1);
    draft.blocks.splice(target, 0, block);
  });
}

/** Drag-and-drop reorder: put `id` where `beforeId` is (or at the end). */
export function reorderBlock(id: string, beforeId: string | null): void {
  store().change((draft) => {
    const index = draft.blocks.findIndex((block) => block.id === id);
    if (index < 0) return;
    const [block] = draft.blocks.splice(index, 1);
    const target = beforeId ? draft.blocks.findIndex((candidate) => candidate.id === beforeId) : draft.blocks.length;
    draft.blocks.splice(target < 0 ? draft.blocks.length : target, 0, block);
  });
}

export function setBoardMeta(patch: Partial<Pick<MathBoard, 'topic' | 'paper' | 'angleMode'>>): void {
  store().change((draft) => Object.assign(draft, patch));
}

export function answerQuestion(blockId: string, questionId: string, answer: string): void {
  updateBlock(blockId, (block) => {
    if (block.type !== 'quiz') return;
    block.questions = block.questions.map((question) => (question.id === questionId ? { ...question, userAnswer: answer } : question));
  });
}

export function revealQuestion(blockId: string, questionId: string, revealed = true): void {
  updateBlock(blockId, (block) => {
    if (block.type !== 'quiz') return;
    block.questions = block.questions.map((question) => (question.id === questionId ? { ...question, revealed } : question));
  });
}

export function resetQuiz(blockId: string): void {
  updateBlock(blockId, (block) => {
    if (block.type !== 'quiz') return;
    block.questions = block.questions.map((question) => ({ ...question, userAnswer: undefined, revealed: false }));
  });
}

export function addStroke(blockId: string, stroke: SketchStroke): void {
  updateBlock(blockId, (block) => {
    if (block.type !== 'sketch') return;
    block.strokes = [...block.strokes, stroke].slice(-4000);
  });
}

export function eraseStroke(blockId: string, index: number): void {
  updateBlock(blockId, (block) => {
    if (block.type !== 'sketch') return;
    block.strokes = block.strokes.filter((_, i) => i !== index);
  });
}

export function clearSketch(blockId: string): void {
  updateBlock(blockId, (block) => {
    if (block.type !== 'sketch') return;
    block.strokes = [];
  });
}

/** Whether the typed answer matches, ignoring spaces and the way roots and fractions are written. */
export function answerMatches(question: QuizQuestion, typed: string): boolean {
  const clean = (text: string) =>
    text
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/sqrt/g, '√')
      .replace(/[*·×]/g, '')
      .replace(/^[a-z]₁?\s*=/, '')
      .replace(/[()]/g, '');
  const answer = clean(question.answer);
  const value = clean(typed);
  if (!value) return false;
  if (answer === value) return true;
  // 1/2 and 0.5 are the same answer.
  const asNumber = (text: string) => {
    const fraction = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(text);
    if (fraction) return Number(fraction[1]) / Number(fraction[2]);
    return /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
  };
  const a = asNumber(answer);
  const b = asNumber(value);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-6;
}
