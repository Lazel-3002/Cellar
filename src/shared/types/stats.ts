export type UsageRange = 'all' | '30d' | '7d';

export interface UsageModelBreakdown {
  displayName: string;
  promptTokens: number;
  completionTokens: number;
  messageCount: number;
}

export interface UsageDayTokens {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  byModel: Record<string, number>;
}

export interface UsageStats {
  range: UsageRange;
  sessions: number;
  messages: number;
  totalTokens: number;
  activeDays: number;
  peakHour: string;
  favoriteModel: string | null;
  heatmap: Array<{ date: string; count: number }>;
  models: UsageModelBreakdown[];
  dailyModelTokens: UsageDayTokens[];
}
