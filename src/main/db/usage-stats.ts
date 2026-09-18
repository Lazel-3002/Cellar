import type { MessageModelInfo } from '@shared/types/chat';
import type { UsageModelBreakdown, UsageRange, UsageStats } from '@shared/types/stats';
import { safeJsonParse } from '../lib/util';
import { all } from './client';

interface UsageRow {
  conversation_id: string;
  role: string;
  model: string | null;
  stats: string | null;
  created_at: number;
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

export function getUsageStats(range: UsageRange): UsageStats {
  const rangeDays = RANGE_DAYS[range] ?? null;
  const since = rangeDays ? Date.now() - rangeDays * DAY_MS : 0;
  const rows = all<UsageRow>('SELECT conversation_id, role, model, stats, created_at FROM messages WHERE created_at >= ? ORDER BY created_at', since);

  const sessions = new Set<string>();
  const dayCounts = new Map<string, number>();
  const hourCounts = new Array(24).fill(0) as number[];
  const modelTotals = new Map<string, UsageModelBreakdown>();
  const dailyModel = new Map<string, Map<string, number>>();
  let totalTokens = 0;
  let messageCount = 0;

  for (const r of rows) {
    if (r.role !== 'user' && r.role !== 'assistant') continue;
    messageCount++;
    sessions.add(r.conversation_id);
    const day = dayKey(r.created_at);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    hourCounts[new Date(r.created_at).getHours()]++;

    if (r.role !== 'assistant') continue;
    const model = safeJsonParse<MessageModelInfo | undefined>(r.model, undefined);
    if (!model) continue;
    const stats = safeJsonParse<{ promptTokens?: number; completionTokens?: number } | undefined>(r.stats, undefined);
    const promptTokens = stats?.promptTokens ?? 0;
    const completionTokens = stats?.completionTokens ?? 0;
    totalTokens += promptTokens + completionTokens;

    const entry = modelTotals.get(model.displayName) ?? { displayName: model.displayName, promptTokens: 0, completionTokens: 0, messageCount: 0 };
    entry.promptTokens += promptTokens;
    entry.completionTokens += completionTokens;
    entry.messageCount += 1;
    modelTotals.set(model.displayName, entry);

    if (promptTokens + completionTokens > 0) {
      const byModel = dailyModel.get(day) ?? new Map<string, number>();
      byModel.set(model.displayName, (byModel.get(model.displayName) ?? 0) + promptTokens + completionTokens);
      dailyModel.set(day, byModel);
    }
  }

  const today = startOfDay(Date.now());
  const earliestAllowed = today - (MAX_HEATMAP_DAYS - 1) * DAY_MS;
  const start = rangeDays ? today - (rangeDays - 1) * DAY_MS : Math.max(startOfDay(rows[0]?.created_at ?? today), earliestAllowed);

  const heatmap: UsageStats['heatmap'] = [];
  const dailyModelTokens: UsageStats['dailyModelTokens'] = [];
  for (let ts = start; ts <= today; ts += DAY_MS) {
    const key = dayKey(ts);
    heatmap.push({ date: key, count: dayCounts.get(key) ?? 0 });
    dailyModelTokens.push({ date: key, byModel: Object.fromEntries(dailyModel.get(key) ?? []) });
  }

  const peakHour = messageCount === 0 ? '—' : formatHour(hourCounts.indexOf(Math.max(...hourCounts)));
  const models = [...modelTotals.values()].sort((a, b) => b.promptTokens + b.completionTokens - (a.promptTokens + a.completionTokens));

  return {
    range,
    sessions: sessions.size,
    messages: messageCount,
    totalTokens,
    activeDays: dayCounts.size,
    peakHour,
    favoriteModel: [...modelTotals.values()].sort((a, b) => b.messageCount - a.messageCount)[0]?.displayName ?? null,
    heatmap,
    models,
    dailyModelTokens,
  };
}
