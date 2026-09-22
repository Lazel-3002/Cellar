import type { ConversationKind } from './agent';

export type UsageRange = 'all' | '30d' | '7d';

export interface UsageModelBreakdown {
  displayName: string;
  promptTokens: number;
  completionTokens: number;
  messageCount: number;
  /** Mean generation speed over replies that reported one. */
  avgTokensPerSecond: number | null;
  /** Median time to first token, ms. */
  medianTtftMs: number | null;
  /** Wall-clock time spent generating, ms. */
  generationMs: number;
  /** Replies that ended stopped or errored. */
  failed: number;
  lastUsed: number;
}

export interface UsageDayTokens {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  byModel: Record<string, number>;
}

export interface UsageConversation {
  id: string;
  title: string;
  kind: ConversationKind;
  tokens: number;
  messages: number;
}

export interface UsagePrevious {
  messages: number;
  totalTokens: number;
  sessions: number;
}

export interface UsageStats {
  range: UsageRange;
  sessions: number;
  messages: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  activeDays: number;
  peakHour: string;
  favoriteModel: string | null;
  /** Total time models spent generating, ms. */
  generationMs: number;
  avgTokensPerSecond: number | null;
  currentStreak: number;
  longestStreak: number;
  /** The same-length window just before this one; null for "all". */
  previous: UsagePrevious | null;
  /** Messages per hour of day, 0–23. */
  hours: number[];
  /** Messages per weekday, Monday first. */
  weekdays: number[];
  kinds: Array<{ kind: ConversationKind; sessions: number; messages: number }>;
  topConversations: UsageConversation[];
  heatmap: Array<{ date: string; count: number }>;
  models: UsageModelBreakdown[];
  dailyModelTokens: UsageDayTokens[];
}
