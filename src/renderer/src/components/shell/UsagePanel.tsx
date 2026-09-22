import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Flame, Gauge, Timer, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import type { UsageRange, UsageStats } from '@shared/types/stats';
import { Segmented } from '@/components/ui/form';
import { Spinner, Tip } from '@/components/ui/misc';
import { useUsageStats } from '@/lib/queries';
import { conversationRoute } from '@/lib/tasks';
import { cn, formatCompact, parseLocalDate } from '@/lib/utils';

const CHART_COLORS = ['#D97757', '#2563EB', '#7C3AED', '#0D9488', '#DB2777', '#65A30D', '#B45309', '#C2410C'];
/** Roughly 47,000 words at ~1.35 tokens/word — a fun scale for the token count, nothing precise. */
const GATSBY_TOKENS = 63_000;
/** Blended $/1M tokens for a mid-tier hosted model — a rough "what this would have cost in the cloud". */
const CLOUD_IN_PER_M = 3;
const CLOUD_OUT_PER_M = 15;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Card({ children }: { children: ReactNode }) {
  return <section className="mb-5 rounded-xl border border-divider bg-card px-5 py-2">{children}</section>;
}

const dayLabel = (s: string): string => parseLocalDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const ago = (ts: number): string => {
  const d = Math.floor((Date.now() - ts) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
};

function Delta({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined) return null;
  if (before === 0) return null;
  const pct = ((now - before) / before) * 100;
  if (Math.abs(pct) < 1) return <span className="text-[11.5px] text-muted-foreground">±0%</span>;
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <Tip label="vs. the previous period of the same length">
      <span className={cn('inline-flex items-center gap-0.5 text-[11.5px] tabular-nums', up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
        <Icon className="size-3" />
        {Math.abs(pct).toFixed(0)}%
      </span>
    </Tip>
  );
}

function StatTile({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-divider bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="truncate text-[20px] font-medium tabular-nums">{value}</span>
        {hint}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[12.5px] font-medium text-muted-foreground">{children}</div>;
}

function Heatmap({ days }: { days: UsageStats['heatmap'] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const levelClass = ['bg-track', 'bg-brand/25', 'bg-brand/50', 'bg-brand/75', 'bg-brand'];
  const level = (c: number) => (c === 0 ? 0 : Math.min(4, Math.ceil((c / max) * 4)));
  // Pad the front so each column starts on Monday.
  const pad = days.length ? (parseLocalDate(days[0].date).getDay() + 6) % 7 : 0;
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-[3px] overflow-x-auto pb-1" style={{ gridAutoColumns: '11px' }}>
      {Array.from({ length: pad }, (_, i) => (
        <div key={`pad${i}`} className="size-[11px]" />
      ))}
      {days.map((d) => (
        <Tip key={d.date} label={`${d.count} message${d.count === 1 ? '' : 's'} · ${dayLabel(d.date)}`}>
          <div className={cn('size-[11px] rounded-[2px]', levelClass[level(d.count)])} />
        </Tip>
      ))}
    </div>
  );
}

function Bars({ values, labels, tip }: { values: number[]; labels: string[]; tip: (i: number) => string }) {
  const max = Math.max(1, ...values);
  return (
    <>
      <div className="flex h-[90px] items-end gap-[3px]">
        {values.map((v, i) => (
          <Tip key={i} label={tip(i)}>
            <div className="flex h-full flex-1 items-end">
              <div className={cn('w-full rounded-[2px]', v === max && v > 0 ? 'bg-brand' : 'bg-brand/40')} style={{ height: `${Math.max(v ? 3 : 1, (v / max) * 100)}%` }} />
            </div>
          </Tip>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </>
  );
}

function UsageOverview({ stats }: { stats: UsageStats }) {
  const multiplier = stats.totalTokens > 0 ? Math.round(stats.totalTokens / GATSBY_TOKENS) : 0;
  const cloudCost = (stats.promptTokens / 1e6) * CLOUD_IN_PER_M + (stats.completionTokens / 1e6) * CLOUD_OUT_PER_M;
  const p = stats.previous ?? undefined;
  return (
    <>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatTile label="Sessions" value={stats.sessions.toLocaleString()} hint={<Delta now={stats.sessions} before={p?.sessions} />} />
        <StatTile label="Messages" value={stats.messages.toLocaleString()} hint={<Delta now={stats.messages} before={p?.messages} />} />
        <StatTile
          label="Total tokens"
          value={<Tip label={`${formatCompact(stats.promptTokens)} in · ${formatCompact(stats.completionTokens)} out`}><span>{formatCompact(stats.totalTokens)}</span></Tip>}
          hint={<Delta now={stats.totalTokens} before={p?.totalTokens} />}
        />
        <StatTile icon={<Flame className="size-3.5 text-brand" />} label="Streak" value={`${stats.currentStreak}d`} hint={<span className="text-[11.5px] text-muted-foreground">best {stats.longestStreak}d</span>} />
        <StatTile icon={<Zap className="size-3.5" />} label="Avg speed" value={stats.avgTokensPerSecond ? `${stats.avgTokensPerSecond.toFixed(1)} tok/s` : '—'} />
        <StatTile icon={<Timer className="size-3.5" />} label="Time generating" value={stats.generationMs ? formatDuration(stats.generationMs) : '—'} />
        <StatTile label="Active days" value={stats.activeDays.toLocaleString()} />
        <StatTile label="Peak hour" value={stats.peakHour} />
        <StatTile label="Favorite model" value={stats.favoriteModel ?? '—'} />
      </div>

      <Card>
        <div className="py-4">
          <Heatmap days={stats.heatmap} />
          <div className="mt-3 space-y-0.5 text-[12px] text-muted-foreground">
            {multiplier > 1 && <div>You've used ~{multiplier.toLocaleString()}× more tokens than The Great Gatsby.</div>}
            {cloudCost >= 0.01 && (
              <div>
                Running locally saved you roughly <span className="font-medium text-foreground">${cloudCost.toFixed(2)}</span> at typical hosted-model prices (${CLOUD_IN_PER_M}/M in, $
                {CLOUD_OUT_PER_M}/M out).
              </div>
            )}
          </div>
        </div>
      </Card>

      {stats.topConversations.length > 0 && (
        <>
          <SectionTitle>Heaviest conversations</SectionTitle>
          <Card>
            <div className="divide-y divide-divider">
              {stats.topConversations.map((c) => (
                <Link
                  key={c.id}
                  to={conversationRoute(c.kind)}
                  params={{ conversationId: c.id }}
                  className="flex items-center gap-3 py-2 text-[13px] hover:text-brand"
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {c.kind !== 'chat' && <span className="rounded bg-track px-1.5 text-[11px] capitalize text-muted-foreground">{c.kind}</span>}
                  <span className="text-[12px] text-muted-foreground tabular-nums">{c.messages} msgs</span>
                  <span className="w-14 text-right text-[12px] font-medium tabular-nums">{formatCompact(c.tokens)}</span>
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}

function UsageModels({ stats }: { stats: UsageStats }) {
  const names = stats.models.map((m) => m.displayName);
  const colorFor = (name: string) => CHART_COLORS[names.indexOf(name) % CHART_COLORS.length];
  const totalAll = stats.models.reduce((s, m) => s + m.promptTokens + m.completionTokens, 0);
  const fastest = Math.max(0, ...stats.models.map((m) => m.avgTokensPerSecond ?? 0));

  const groupSize = Math.max(1, Math.ceil(stats.dailyModelTokens.length / 24));
  const groups: Array<{ label: string; byModel: Record<string, number>; total: number }> = [];
  for (let i = 0; i < stats.dailyModelTokens.length; i += groupSize) {
    const slice = stats.dailyModelTokens.slice(i, i + groupSize);
    const byModel: Record<string, number> = {};
    for (const day of slice) for (const [name, tokens] of Object.entries(day.byModel)) byModel[name] = (byModel[name] ?? 0) + tokens;
    const total = Object.values(byModel).reduce((s, v) => s + v, 0);
    groups.push({ label: dayLabel(slice[0].date), byModel, total });
  }
  const maxTotal = Math.max(1, ...groups.map((g) => g.total));

  if (stats.models.length === 0) {
    return (
      <Card>
        <div className="py-8 text-center text-[13px] text-muted-foreground">No usage in this period yet.</div>
      </Card>
    );
  }

  return (
    <>
      {totalAll > 0 && (
        <Card>
          <div className="py-4">
            <div className="flex h-[180px] items-end gap-[3px]">
              {groups.map((g, i) => (
                <Tip
                  key={i}
                  label={
                    g.total === 0
                      ? g.label
                      : `${g.label}: ${formatCompact(g.total)} tokens\n${names
                          .filter((n) => g.byModel[n])
                          .map((n) => `${n}: ${formatCompact(g.byModel[n])}`)
                          .join('\n')}`
                  }
                >
                  <div className="flex h-full flex-1 flex-col justify-end gap-px">
                    {names
                      .filter((n) => g.byModel[n])
                      .map((n) => (
                        <div key={n} style={{ height: `${(g.byModel[n] / maxTotal) * 100}%`, background: colorFor(n) }} className="min-h-px w-full rounded-[1px]" />
                      ))}
                  </div>
                </Tip>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>{groups[0]?.label}</span>
              <span>{groups[groups.length - 1]?.label}</span>
            </div>
          </div>
        </Card>
      )}

      <SectionTitle>Per model</SectionTitle>
      <div className="mb-5 space-y-2">
        {stats.models.map((m) => {
          const total = m.promptTokens + m.completionTokens;
          const pct = totalAll ? (total / totalAll) * 100 : 0;
          const failRate = m.messageCount ? (m.failed / m.messageCount) * 100 : 0;
          return (
            <div key={m.displayName} className="rounded-xl border border-divider bg-card px-4 py-3">
              <div className="flex items-center gap-2 text-[13.5px]">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorFor(m.displayName) }} />
                <span className="min-w-0 flex-1 truncate font-medium">{m.displayName}</span>
                {m.avgTokensPerSecond !== null && m.avgTokensPerSecond === fastest && stats.models.length > 1 && (
                  <span className="rounded bg-brand/15 px-1.5 text-[11px] text-brand">fastest</span>
                )}
                <span className="text-[12px] text-muted-foreground">{ago(m.lastUsed)}</span>
                <span className="w-12 text-right text-[12px] font-medium tabular-nums">{pct.toFixed(1)}%</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-track">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colorFor(m.displayName) }} />
              </div>
              <div className="mt-2 grid grid-cols-5 gap-2 text-[12px] tabular-nums">
                <Metric label="Replies" value={m.messageCount.toLocaleString()} />
                <Metric label="Tokens in / out" value={`${formatCompact(m.promptTokens)} / ${formatCompact(m.completionTokens)}`} />
                <Metric icon={<Gauge className="size-3" />} label="Speed" value={m.avgTokensPerSecond ? `${m.avgTokensPerSecond.toFixed(1)} t/s` : '—'} />
                <Metric label="First token" value={m.medianTtftMs !== null ? formatDuration(m.medianTtftMs) : '—'} />
                <Metric
                  label="Stopped / failed"
                  value={<span className={cn(failRate >= 20 && 'text-rose-600 dark:text-rose-400')}>{m.failed ? `${m.failed} (${failRate.toFixed(0)}%)` : '0'}</span>}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Metric({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="truncate">{value}</div>
    </div>
  );
}

function UsageActivity({ stats }: { stats: UsageStats }) {
  const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
  const totalKind = stats.kinds.reduce((s, k) => s + k.messages, 0);
  return (
    <>
      <SectionTitle>Time of day</SectionTitle>
      <Card>
        <div className="py-4">
          <Bars values={stats.hours} labels={['12a', '6a', '12p', '6p', '11p']} tip={(i) => `${hourLabel(i)}: ${stats.hours[i]} messages`} />
        </div>
      </Card>
      <SectionTitle>Day of week</SectionTitle>
      <Card>
        <div className="py-4">
          <Bars values={stats.weekdays} labels={WEEKDAYS} tip={(i) => `${WEEKDAYS[i]}: ${stats.weekdays[i]} messages`} />
        </div>
      </Card>
      {stats.kinds.length > 0 && (
        <>
          <SectionTitle>Where you spend it</SectionTitle>
          <Card>
            <div className="space-y-2 py-3">
              {stats.kinds.map((k) => {
                const pct = totalKind ? (k.messages / totalKind) * 100 : 0;
                return (
                  <div key={k.kind} className="flex items-center gap-3 text-[13px]">
                    <span className="w-14 capitalize">{k.kind}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-track">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-28 text-right text-[12px] text-muted-foreground tabular-nums">
                      {k.sessions} sessions · {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </>
  );
}

export function Usage() {
  const [range, setRange] = useState<UsageRange>('30d');
  const [tab, setTab] = useState<'overview' | 'models' | 'activity'>('overview');
  const { data, isLoading } = useUsageStats(range);
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'models', label: 'Models' },
            { value: 'activity', label: 'Activity' },
          ]}
        />
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: 'all', label: 'All' },
            { value: '30d', label: '30d' },
            { value: '7d', label: '7d' },
          ]}
        />
      </div>
      {isLoading || !data ? (
        <div className="py-10">
          <Spinner />
        </div>
      ) : tab === 'overview' ? (
        <UsageOverview stats={data} />
      ) : tab === 'models' ? (
        <UsageModels stats={data} />
      ) : (
        <UsageActivity stats={data} />
      )}
    </>
  );
}
