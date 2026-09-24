import { SCREEN_MARKER } from '@shared/computer';
import type { AgentPart, CompactionPart, ToolPart } from '@shared/types/agent';
import type { Message } from '@shared/types/chat';
import { attachmentImage, withAttachments } from '../chat/attachments';
import { estimateTokens } from '../chat/context-window';
import type { ProviderMessage } from '../providers/types';
import { renderTextToolCall, renderToolResponse } from './text-protocol';
import { clip } from './tools/types';

export type ToolProtocol = 'native' | 'text';

export interface HistoryOptions {
  protocol: ToolProtocol;
  vision: boolean;
  /** Shorten tool results outside the most recent rounds. */
  trimOldResults: boolean;
  /** Tool results longer than this are clipped everywhere (last resort when context is tight). */
  hardResultLimit?: number;
  /** Computer use: most looks at the screen kept whole (fewer for a small context window). */
  freshScreens?: number;
}

interface Round {
  index: number;
  text: string;
  reasoning: string;
  calls: ToolPart[];
}

export function groupRounds(parts: AgentPart[], fromRound = 0): Round[] {
  const rounds = new Map<number, Round>();
  for (const part of parts) {
    if (part.type === 'compaction' || part.round < fromRound) continue;
    let round = rounds.get(part.round);
    if (!round) {
      round = { index: part.round, text: '', reasoning: '', calls: [] };
      rounds.set(part.round, round);
    }
    if (part.type === 'text') round.text += part.text;
    else if (part.type === 'reasoning') round.reasoning += part.text;
    else round.calls.push(part);
  }
  return [...rounds.values()].sort((a, b) => a.index - b.index);
}

/** What the model is told a call produced, including calls that never ran. */
export function resultForModel(call: ToolPart): string {
  if (call.result !== undefined) return call.result;
  if (call.status === 'denied') return 'The user denied this action.';
  if (call.error) return `Error: ${call.error}`;
  return 'This call did not run because the task was stopped.';
}

const RECENT_ROUNDS_IN_FULL = 2;
/** Computer use: at most this many of the latest looks at the screen keep their screenshot and element list. */
const FRESH_SCREENS = 3;

/**
 * The computer-use steps whose look at the screen is still current. Older ones are cut to what the
 * step did: a screen from ten steps ago only misleads, and each screenshot costs ~900 tokens.
 * Cutting happens in batches (the window grows 1, 2, 3 and starts again at 1) rather than one look
 * per step: a local server reuses its cache for everything before the first changed message, so
 * two steps out of three only process the new screenshot instead of re-reading the previous ones.
 */
export function freshScreens(branch: Message[], max = FRESH_SCREENS): Set<string> {
  const ids: string[] = [];
  for (const m of branch) for (const p of m.parts ?? []) if (p.type === 'tool' && p.category === 'computer' && (p.resultImages?.length || p.result?.includes(SCREEN_MARKER))) ids.push(p.id);
  if (!ids.length) return new Set();
  const window = Math.max(1, Math.round(max));
  return new Set(ids.slice(-(((ids.length - 1) % window) + 1)));
}

const staleScreen = (call: ToolPart, fresh: Set<string>) => call.category === 'computer' && !fresh.has(call.id);

/** Images a tool call's result carried, as base64 (only when the model can see images). */
async function callImages(call: ToolPart, vision: boolean, fresh: Set<string>): Promise<NonNullable<ProviderMessage['images']>> {
  if (!vision || !call.resultImages?.length || staleScreen(call, fresh)) return [];
  const loaded = await Promise.all(call.resultImages.map((id) => attachmentImage(id)));
  return loaded.filter((img): img is NonNullable<typeof img> => !!img).map((img) => ({ mime: img.mime, base64: img.bytes.toString('base64') }));
}

async function roundsToMessages(rounds: Round[], options: HistoryOptions, keepReasoning: boolean, recentFull: boolean, fresh: Set<string>): Promise<ProviderMessage[]> {
  const out: ProviderMessage[] = [];
  for (const [i, round] of rounds.entries()) {
    const recent = recentFull && i >= rounds.length - RECENT_ROUNDS_IN_FULL;
    const result = (call: ToolPart) => {
      let text = resultForModel(call);
      if (staleScreen(call, fresh) && text.includes(SCREEN_MARKER)) text = `${text.slice(0, text.indexOf(SCREEN_MARKER))}
(An older look at the screen, no longer shown.)`;
      if (options.trimOldResults && !recent) text = clip(text, 700, 'older output shortened');
      if (options.hardResultLimit) text = clip(text, options.hardResultLimit);
      return text;
    };
    if (options.protocol === 'native') {
      if (round.calls.length) {
        out.push({
          role: 'assistant',
          content: round.text.trim(),
          toolCalls: round.calls.map((c) => ({ id: c.id, name: c.name, arguments: JSON.stringify(c.args ?? {}) })),
          reasoning: keepReasoning && round.reasoning ? round.reasoning : undefined,
        });
        for (const call of round.calls) {
          out.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: result(call) });
          const images = await callImages(call, options.vision, fresh);
          if (images.length) out.push({ role: 'user', content: `Image${images.length > 1 ? 's' : ''} returned by ${call.name}:`, images });
        }
      } else if (round.text.trim()) {
        out.push({ role: 'assistant', content: round.text.trim() });
      }
    } else {
      const content = [round.text.trim(), ...round.calls.map((c) => renderTextToolCall(c.name, c.args ?? {}))].filter(Boolean).join('\n\n');
      if (content) out.push({ role: 'assistant', content });
      if (round.calls.length) out.push({ role: 'user', content: round.calls.map((c) => renderToolResponse(c.name, result(c))).join('\n\n') });
      for (const call of round.calls) {
        const images = await callImages(call, options.vision, fresh);
        if (images.length) out.push({ role: 'user', content: `Image${images.length > 1 ? 's' : ''} returned by ${call.name}:`, images });
      }
    }
  }
  return out;
}

export function latestCompaction(branch: Message[]): { messageIndex: number; part: CompactionPart } | null {
  for (let i = branch.length - 1; i >= 0; i--) {
    const parts = branch[i].parts ?? [];
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j];
      if (part.type === 'compaction') return { messageIndex: i, part };
    }
  }
  return null;
}

/**
 * Provider messages for a task conversation (without the system prompt). Everything before the
 * latest compaction is replaced by its summary, which is placed in front of the user request
 * that the compacted turn was answering.
 */
export async function buildTaskHistory(branch: Message[], options: HistoryOptions): Promise<ProviderMessage[]> {
  const compaction = latestCompaction(branch);
  const out: ProviderMessage[] = [];
  const lastAssistant = branch.map((m) => m.role).lastIndexOf('assistant');
  const fresh = freshScreens(branch, options.freshScreens);
  for (let i = 0; i < branch.length; i++) {
    const m = branch[i];
    const summaryHost = compaction && m.role === 'user' && i === compaction.messageIndex - 1;
    if (compaction && i < compaction.messageIndex && !summaryHost) continue;
    if (m.role === 'user') {
      const body = await withAttachments(m.content, m.attachments, options.vision);
      if (summaryHost) body.content = `<context_summary>\nEarlier work on this task, summarized to save space:\n${compaction.part.summary}\n</context_summary>\n\n${body.content}`;
      out.push({ role: 'user', ...body });
    } else if (m.role === 'assistant') {
      if (m.parts?.length) {
        const fromRound = compaction && i === compaction.messageIndex ? compaction.part.round : 0;
        out.push(...(await roundsToMessages(groupRounds(m.parts, fromRound), options, i === lastAssistant, i === lastAssistant, fresh)));
      } else if (m.content.trim() && m.status !== 'error') {
        out.push({ role: 'assistant', content: m.content });
      }
    }
  }
  return out;
}

export function historyTokens(messages: ProviderMessage[]): number {
  return messages.reduce((sum, m) => {
    const calls = m.toolCalls?.reduce((s, c) => s + estimateTokens(c.arguments) + 8, 0) ?? 0;
    return sum + estimateTokens(m.content) + 6 + calls + (m.images?.length ?? 0) * 768;
  }, 0);
}

/** Plain-text rendering of the work being compacted, for the summarization request. */
export function transcriptForSummary(branch: Message[], currentMessageId: string, beforeRound: number, maxChars: number): string {
  const lines: string[] = [];
  const compaction = latestCompaction(branch);
  if (compaction) lines.push(`[Summary of even earlier work]\n${compaction.part.summary}`);
  for (let i = compaction ? compaction.messageIndex - 1 : 0; i < branch.length; i++) {
    const m = branch[i];
    if (!m) continue;
    if (m.role === 'user') {
      lines.push(`User: ${m.content}`);
      continue;
    }
    if (m.role !== 'assistant') continue;
    const isCurrent = m.id === currentMessageId;
    const fromRound = compaction && i === compaction.messageIndex ? compaction.part.round : 0;
    for (const round of groupRounds(m.parts ?? [], fromRound)) {
      if (isCurrent && round.index >= beforeRound) break;
      if (round.text.trim()) lines.push(`Assistant: ${round.text.trim()}`);
      for (const call of round.calls) lines.push(`Tool ${call.name}(${clip(JSON.stringify(call.args ?? {}), 300)}) → ${clip(resultForModel(call), 500)}`);
    }
    if (!m.parts?.length && m.content.trim()) lines.push(`Assistant: ${m.content.trim()}`);
  }
  return clip(lines.join('\n\n'), maxChars, 'middle of the history omitted');
}
