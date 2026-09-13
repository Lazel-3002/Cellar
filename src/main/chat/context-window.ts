import type { ContextOverflowPolicy } from '@shared/types/models';
import type { ProviderMessage } from '../providers/types';

const IMAGE_TOKENS = 768;

/** Rough token estimate (~3.6 characters per token for mixed English/code). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6);
}

export function messageTokens(m: ProviderMessage): number {
  return estimateTokens(m.content) + 6 + (m.images?.length ?? 0) * IMAGE_TOKENS;
}

export interface FitResult {
  messages: ProviderMessage[];
  dropped: number;
  estimatedTokens: number;
  overflow: boolean;
}

export function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const keep = Math.max(0, maxChars - 80);
  const head = Math.ceil(keep * 0.6);
  const tail = keep - head;
  return `${text.slice(0, head)}\n\n[… ${text.length - keep} characters omitted to fit the context window …]\n\n${text.slice(text.length - tail)}`;
}

/** Group messages into turns that each start with a user message, so dropping never breaks role alternation. */
function toTurns(history: ProviderMessage[]): ProviderMessage[][] {
  const turns: ProviderMessage[][] = [];
  for (const m of history) {
    if (m.role === 'user' || turns.length === 0) turns.push([m]);
    else turns[turns.length - 1].push(m);
  }
  return turns;
}

/**
 * Keep a conversation within `budget` tokens.
 * - stop: report overflow and change nothing
 * - rolling: drop the oldest turns first
 * - truncate-middle: keep the opening turn and the latest turns, dropping from the middle
 */
export function fitToContext(system: ProviderMessage | null, history: ProviderMessage[], budget: number, policy: ContextOverflowPolicy): FitResult {
  const systemTokens = system ? messageTokens(system) : 0;
  const cost = (turns: ProviderMessage[][]) => systemTokens + turns.flat().reduce((sum, m) => sum + messageTokens(m), 0);
  const assemble = (turns: ProviderMessage[][]) => (system ? [system, ...turns.flat()] : turns.flat());

  let turns = toTurns(history);
  const initialCount = history.length;
  let tokens = cost(turns);
  if (tokens <= budget) return { messages: assemble(turns), dropped: 0, estimatedTokens: tokens, overflow: false };
  if (policy === 'stop' || turns.length === 0) return { messages: assemble(turns), dropped: 0, estimatedTokens: tokens, overflow: true };

  const protectFirst = policy === 'truncate-middle' && turns.length > 2 ? 1 : 0;
  while (tokens > budget && turns.length > protectFirst + 1) {
    turns.splice(protectFirst, 1);
    tokens = cost(turns);
  }
  while (tokens > budget && turns.length > 1) {
    turns.splice(0, 1);
    tokens = cost(turns);
  }
  if (tokens > budget) {
    const last = turns[turns.length - 1];
    const finalMessage = last[last.length - 1];
    const others = tokens - messageTokens(finalMessage);
    const allowedChars = Math.max(1000, Math.floor((budget - others) * 3.6));
    turns = [...turns.slice(0, -1), [...last.slice(0, -1), { ...finalMessage, content: truncateMiddle(finalMessage.content, allowedChars) }]];
    tokens = cost(turns);
  }
  const messages = assemble(turns);
  return { messages, dropped: initialCount - turns.flat().length, estimatedTokens: tokens, overflow: tokens > budget };
}
