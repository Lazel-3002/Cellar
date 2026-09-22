import { Blocks, Clock, Folder, MessageSquare, Sparkles, Wrench, X } from 'lucide-react';
import type { ContextInfo } from '@shared/types/chat';
import { formatContext } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Segment {
  label: string;
  tokens: number;
  percent: number;
  icon: typeof Blocks;
  fill: string;
}

interface ContextInfoPanelProps {
  info: ContextInfo;
  onClose?: () => void;
}

export function ContextInfoPanel({ info, onClose }: ContextInfoPanelProps) {
  const segments: Segment[] = [
    { label: 'System', tokens: info.systemPrompt.tokens, percent: info.systemPrompt.percent, icon: Blocks, fill: 'bg-brand' },
    { label: 'Tools', tokens: info.tools.tokens, percent: info.tools.percent, icon: Wrench, fill: 'bg-brand/75' },
    { label: 'Skills', tokens: info.skills.tokens, percent: info.skills.percent, icon: Sparkles, fill: 'bg-brand/55' },
    { label: 'Project', tokens: info.projectContext.tokens, percent: info.projectContext.percent, icon: Folder, fill: 'bg-brand/35' },
    { label: 'Messages', tokens: info.messages.tokens, percent: info.messages.percent, icon: MessageSquare, fill: 'bg-brand/20' },
  ];

  const usageColor = info.usagePercent > 80 ? 'text-danger' : info.usagePercent > 50 ? 'text-warning' : 'text-brand';
  const freePercent = Math.max(0, 100 - segments.reduce((sum, s) => sum + s.percent, 0));

  return (
    <div className="animate-fade-in rounded-xl border border-composer-border bg-background/95 p-4 shadow-lg backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[14px] font-medium text-foreground">Context Window</h3>
        {onClose && (
          <button onClick={onClose} className="flex size-5 items-center justify-center rounded hover:bg-hover">
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="mb-3 flex items-baseline gap-2">
        <span className={cn('text-2xl font-semibold tabular-nums transition-colors', usageColor)}>
          {formatContext(info.estimatedTokens)}
        </span>
        <span className="text-[13px] text-muted-foreground">
          / {formatContext(info.contextLength)} · {info.usagePercent}% used · {formatContext(info.freeTokens)} free
        </span>
      </div>

      {/* Single stacked bar: every segment plus free space adds up to the full window */}
      <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-muted/60 ring-1 ring-inset ring-composer-border/50">
        {segments.map(
          (s) =>
            s.percent > 0 && (
              <div
                key={s.label}
                title={`${s.label}: ${formatContext(s.tokens)} (${s.percent}%)`}
                className={cn(s.fill, 'h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full')}
                style={{ width: `${s.percent}%` }}
              />
            ),
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-[12px]">
            <s.icon className="size-3 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-muted-foreground">{s.label}</span>
            <span className="tabular-nums text-foreground/80">{formatContext(s.tokens)}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="size-3 shrink-0 rounded-full border border-dashed border-muted-foreground/50" />
          <span className="flex-1 truncate text-muted-foreground">Free</span>
          <span className="tabular-nums text-foreground/80">
            {formatContext(info.freeTokens)} ({freePercent}%)
          </span>
        </div>
      </div>

      {/* Reasoning time if available */}
      {info.reasoningMs != null && info.reasoningMs > 0 && (
        <div className="mt-3 flex w-fit items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-[11.5px] text-muted-foreground">
          <Clock className="size-3" />
          Thinking: {(info.reasoningMs / 1000).toFixed(1)}s
        </div>
      )}

      {/* Note about real data */}
      <div className="mt-2.5 text-[11px] text-muted-foreground/70">
        Total is real token usage from provider stats. Breakdown below is a proportional estimate of what's in the prompt.
      </div>
    </div>
  );
}
