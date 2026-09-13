import { Brain, Eye, Wrench } from 'lucide-react';
import type { FitLevel, MemoryEstimate, ModelEntry } from '@shared/types/models';
import type { ProviderKind, ProviderState } from '@shared/types/providers';
import { Badge, StatusDot, Tip } from '@/components/ui/misc';
import { cn, formatBytes } from '@/lib/utils';

export function CapabilityIcons({ model, className }: { model: Pick<ModelEntry, 'capabilities' | 'reasoningStyle'>; className?: string }) {
  const { vision, tools, reasoning } = model.capabilities;
  return (
    <span className={cn('inline-flex items-center gap-1 text-muted-foreground', className)}>
      {vision && (
        <Tip label="Vision: can see images">
          <Eye className="size-3.5" />
        </Tip>
      )}
      {tools && (
        <Tip label="Tool use">
          <Wrench className="size-3.5" />
        </Tip>
      )}
      {reasoning && (
        <Tip label={model.reasoningStyle === 'always' ? 'Reasoning (always thinks)' : 'Reasoning (thinking can be adjusted)'}>
          <Brain className="size-3.5" />
        </Tip>
      )}
    </span>
  );
}

const FIT_COPY: Record<FitLevel, { label: string; tone: 'success' | 'warning' | 'danger' | 'default'; hint: string }> = {
  full: { label: 'Full GPU offload', tone: 'success', hint: 'Weights and context fit in VRAM.' },
  partial: { label: 'Partial offload', tone: 'warning', hint: 'Some layers run on the CPU; expect slower generation.' },
  'too-large': { label: 'Likely too large', tone: 'danger', hint: 'Probably will not fit in VRAM + RAM with these settings.' },
  unknown: { label: 'Fit unknown', tone: 'default', hint: 'Could not estimate memory for this file.' },
};

export function FitBadge({ fit, estimate, compact }: { fit: FitLevel; estimate?: MemoryEstimate; compact?: boolean }) {
  const copy = FIT_COPY[fit];
  const detail = estimate
    ? `${copy.hint} ≈ ${formatBytes(estimate.gpuBytes)} GPU · ${formatBytes(estimate.cpuBytes)} RAM at ${estimate.contextLength.toLocaleString('en-US')} tokens (${estimate.gpuLayers}/${estimate.totalLayers} layers on GPU)`
    : copy.hint;
  return (
    <Tip label={detail}>
      <span>
        <Badge tone={copy.tone}>{compact ? copy.label.split(' ')[0] : copy.label}</Badge>
      </span>
    </Tip>
  );
}

export function MemoryBars({ estimate }: { estimate: MemoryEstimate }) {
  const vram = estimate.vramBudgetBytes;
  const gpuPct = vram ? (estimate.gpuBytes / vram) * 100 : 0;
  const ramPct = estimate.ramBudgetBytes ? (estimate.cpuBytes / estimate.ramBudgetBytes) * 100 : 0;
  const bar = (pct: number) => (pct > 100 ? 'bg-danger' : pct > 88 ? 'bg-warning' : 'bg-brand');
  return (
    <div className="space-y-2.5">
      <div>
        <div className="mb-1 flex justify-between text-[12px] text-muted-foreground">
          <span>GPU memory</span>
          <span className="tabular-nums">
            {formatBytes(estimate.gpuBytes)} / {vram ? formatBytes(vram) : 'no GPU'}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-track">
          <div className={cn('h-full rounded-full transition-[width]', bar(gpuPct))} style={{ width: `${Math.min(100, gpuPct)}%` }} />
        </div>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[12px] text-muted-foreground">
          <span>System RAM</span>
          <span className="tabular-nums">
            {formatBytes(estimate.cpuBytes)} / {formatBytes(estimate.ramBudgetBytes)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-track">
          <div className={cn('h-full rounded-full transition-[width]', bar(ramPct))} style={{ width: `${Math.min(100, ramPct)}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[12px] text-muted-foreground">
        <div>
          Weights <span className="block text-foreground tabular-nums">{formatBytes(estimate.weightsBytes)}</span>
        </div>
        <div>
          KV cache <span className="block text-foreground tabular-nums">{formatBytes(estimate.kvBytes)}</span>
        </div>
        <div>
          GPU layers{' '}
          <span className="block text-foreground tabular-nums">
            {estimate.gpuLayers}/{estimate.totalLayers}
          </span>
        </div>
      </div>
    </div>
  );
}

export function providerStateDot(state?: ProviderState): 'online' | 'offline' | 'warning' {
  if (state === 'online') return 'online';
  if (state === 'unauthorized' || state === 'error') return 'warning';
  return 'offline';
}

export function ProviderStatusDot({ state }: { state?: ProviderState }) {
  return <StatusDot state={providerStateDot(state)} />;
}

export const PROVIDER_LABEL: Record<ProviderKind, string> = {
  llamacpp: 'llama.cpp',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  unsloth: 'Unsloth Studio',
  openai: 'OpenAI-compatible',
};
