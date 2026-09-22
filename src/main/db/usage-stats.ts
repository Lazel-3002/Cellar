import type { ConversationKind } from '@shared/types/agent';
import type { GenerationStats, MessageModelInfo } from '@shared/types/chat';
import type { UsageConversation, UsageModelBreakdown, UsageRange, UsageStats } from '@shared/types/stats';
import { safeJsonParse } from '../lib/util';
import { all } from './client';

interface UsageRow {
  conversation_id: string;
  role: string;
  model: string | null;
  stats: string | null;
  status: string;
  created_at: number;
  title: string | null;
  kind: ConversationKind | null;
}

const RANGE_DAYS: Record<UsageRange, number | null> = { all: null, '30d': 30, '7d': 7 };
const DAY_MS = 86_400_000;
/** Caps the "all time" heatmap at roughly a year, matching the usual contribution-graph span. */
const MAX_HEATMAP_DAYS = 365;

const dayKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const startOfDay = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const formatHour = (hour: number): string => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'AM' : 'PM'}`;

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const QUERY = `SELECT m.conversation_id, m.role, m.model, m.stats, m.status, m.created_at, c.title, c.kind
  FROM messages m LEFT JOIN conversations c ON c.id = m.conversation_id
  WHERE m.created_at >= ? AND m.created_at < ? ORDER BY m.created_at`;

/** Streaks over every day with activity, ending today (or yesterday, so a streak survives until you skip a whole day). */
function streaks(): { current: number; longest: number } {
  const days = new Set(all<{ created_at: number }>("SELECT created_at FROM messages WHERE role = 'user'").map((r) => dayKey(r.created_at)));
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const key of [...days].sort()) {
    const ts = new Date(`${key}T00:00:00`).getTime();
    run = prev !== null && Math.round((ts - prev) / DAY_MS) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = ts;
  }
  let current = 0;
  let cursor = startOfDay(Date.now());
  if (!days.has(dayKey(cursor))) cursor -= DAY_MS;
  while (days.has(dayKey(cursor))) {
    current++;
    cursor -= DAY_MS;
  }
  return { current, longest };
}

export function getUsageStats(range: UsageRange): UsageStats {
  const rangeDays = RANGE_DAYS[range] ?? null;
  const now = Date.now();
  const since = rangeDays ? now - rangeDays * DAY_MS : 0;
  const rows = all<UsageRow>(QUERY, since, now + DAY_MS);

  const sessions = new Set<string>();
  const dayCounts = new Map<string, number>();
  const hours = new Array(24).fill(0) as number[];
  const weekdays = new Array(7).fill(0) as number[];
  const modelTotals = new Map<string, UsageModelBreakdown & { tps: number[]; ttft: number[] }>();
  const dailyModel = new Map<string, Map<string, number>>();
  const convs = new Map<string, UsageConversation>();
  const kinds = new Map<ConversationKind, { sessions: Set<string>; messages: number }>();
  let promptTotal = 0;
  let completionTotal = 0;
  let generationMs = 0;
  let messageCount = 0;
  const allTps: number[] = [];

  for (const r of rows) {
    if (r.role !== 'user' && r.role !== 'assistant') continue;
    messageCount++;
    sessions.add(r.conversation_id);
    const day = dayKey(r.created_at);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    const date = new Date(r.created_at);
    hours[date.getHours()]++;
    weekdays[(date.getDay() + 6) % 7]++;

    const kind = r.kind ?? 'chat';
    const k = kinds.get(kind) ?? { sessions: new Set(), messages: 0 };
    k.sessions.add(r.conversation_id);
    k.messages++;
    kinds.set(kind, k);

    const conv = convs.get(r.conversation_id) ?? { id: r.conversation_id, title: r.title || 'Untitled', kind, tokens: 0, messages: 0 };
    conv.messages++;
    convs.set(r.conversation_id, conv);

    if (r.role !== 'assistant') continue;
    const model = safeJsonParse<MessageModelInfo | undefined>(r.model, undefined);
    if (!model) continue;
    const stats = safeJsonParse<GenerationStats | undefined>(r.stats, undefined);
    const promptTokens = stats?.promptTokens ?? 0;
    const completionTokens = stats?.completionTokens ?? 0;
    promptTotal += promptTokens;
    completionTotal += completionTokens;
    conv.tokens += promptTokens + completionTokens;
    generationMs += stats?.totalMs ?? 0;

    const entry = modelTotals.get(model.displayName) ?? {
      displayName: model.displayName,
      promptTokens: 0,
      completionTokens: 0,
      messageCount: 0,
      avgTokensPerSecond: null,
      medianTtftMs: null,
      generationMs: 0,
      failed: 0,
      lastUsed: 0,
      tps: [],
      ttft: [],
    };
    entry.promptTokens += promptTokens;
    entry.completionTokens += completionTokens;
    entry.messageCount += 1;
    entry.generationMs += stats?.totalMs ?? 0;
    entry.lastUsed = Math.max(entry.lastUsed, r.created_at);
    if (r.status === 'error' || r.status === 'stopped') entry.failed++;
    if (stats?.tokensPerSecond && Number.isFinite(stats.tokensPerSecond)) {
      entry.tps.push(stats.tokensPerSecond);
      allTps.push(stats.tokensPerSecond);
    }
    if (stats?.ttftMs && Number.isFinite(stats.ttftMs)) entry.ttft.push(stats.ttftMs);
    modelTotals.set(model.displayName, entry);

    if (promptTokens + completionTokens > 0) {
      const byModel = dailyModel.get(day) ?? new Map<string, number>();
      byModel.set(model.displayName, (byModel.get(model.displayName) ?? 0) + promptTokens + completionTokens);
      dailyModel.set(day, byModel);
    }
  }

  const today = startOfDay(now);
  const earliestAllowed = today - (MAX_HEATMAP_DAYS - 1) * DAY_MS;
  const start = rangeDays ? today - (rangeDays - 1) * DAY_MS : Math.max(startOfDay(rows[0]?.created_at ?? today), earliestAllowed);

  const heatmap: UsageStats['heatmap'] = [];
  const dailyModelTokens: UsageStats['dailyModelTokens'] = [];
  for (let ts = start; ts <= today; ts += DAY_MS) {
    const key = dayKey(ts);
    heatmap.push({ date: key, count: dayCounts.get(key) ?? 0 });
    dailyModelTokens.push({ date: key, byModel: Object.fromEntries(dailyModel.get(key) ?? []) });
  }

  let previous: UsageStats['previous'] = null;
  if (rangeDays) {
    const prevRows = all<UsageRow>(QUERY, since - rangeDays * DAY_MS, since);
    const prevSessions = new Set<string>();
    previous = { messages: 0, totalTokens: 0, sessions: 0 };
    for (const r of prevRows) {
      if (r.role !== 'user' && r.role !== 'assistant') continue;
      previous.messages++;
      prevSessions.add(r.conversation_id);
      if (r.role === 'assistant') {
        const s = safeJsonParse<GenerationStats | undefined>(r.stats, undefined);
        previous.totalTokens += (s?.promptTokens ?? 0) + (s?.completionTokens ?? 0);
      }
    }
    previous.sessions = prevSessions.size;
  }

  const peakHour = messageCount === 0 ? '—' : formatHour(hours.indexOf(Math.max(...hours)));
  const models: UsageModelBreakdown[] = [...modelTotals.values()]
    .map(({ tps, ttft, ...m }) => ({ ...m, avgTokensPerSecond: mean(tps), medianTtftMs: median(ttft) }))
    .sort((a, b) => b.promptTokens + b.completionTokens - (a.promptTokens + a.completionTokens));
  const { current, longest } = streaks();

  return {
    range,
    sessions: sessions.size,
    messages: messageCount,
    totalTokens: promptTotal + completionTotal,
    promptTokens: promptTotal,
    completionTokens: completionTotal,
    activeDays: dayCounts.size,
    peakHour,
    favoriteModel: [...models].sort((a, b) => b.messageCount - a.messageCount)[0]?.displayName ?? null,
    generationMs,
    avgTokensPerSecond: mean(allTps),
    currentStreak: current,
    longestStreak: longest,
    previous,
    hours,
    weekdays,
    kinds: [...kinds.entries()].map(([kind, v]) => ({ kind, sessions: v.sessions.size, messages: v.messages })).sort((a, b) => b.messages - a.messages),
    topConversations: [...convs.values()].sort((a, b) => b.tokens - a.tokens || b.messages - a.messages).slice(0, 8),
    heatmap,
    models,
    dailyModelTokens,
  };
}
