import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Check, ChevronDown, Cpu, SlidersHorizontal, Telescope } from 'lucide-react';
import type { ModelEntry, ModelRef } from '@shared/types/models';
import { CapabilityIcons, ProviderStatusDot } from '@/components/models/bits';
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/menu';
import { Spinner, StatusDot, Tip } from '@/components/ui/misc';
import { effectiveThinking, isChatCapable, thinkingLabel, thinkingOptions } from '@/lib/hooks';
import { useModels, useProviders } from '@/lib/queries';
import { cn, formatBytes } from '@/lib/utils';
import { useUi } from '@/stores/ui';

function ModelRow({ model, selected, onSelect, dim }: { model: ModelEntry; selected: boolean; onSelect: () => void; dim?: boolean }) {
  const meta = [model.quant, model.paramsLabel, model.sizeBytes ? formatBytes(model.sizeBytes) : undefined, dim ? 'no native tool calling' : undefined].filter(Boolean).join(' · ');
  return (
    <button
      onClick={onSelect}
      data-testid="model-option"
      data-provider={model.ref.providerId}
      data-model-id={model.ref.modelId}
      className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-hover', selected && 'bg-hover', dim && 'opacity-60 hover:opacity-100')}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] text-foreground">{model.displayName}</span>
          {model.loading && <Spinner className="size-3" />}
          {model.loaded && !model.loading && (
            <Tip label={model.loadedContextLength ? `Loaded · ${model.loadedContextLength.toLocaleString('en-US')} tokens` : 'Loaded'}>
              <span>
                <StatusDot state="online" className="size-1.5" />
              </span>
            </Tip>
          )}
        </div>
        {meta && <div className="truncate text-[11.5px] text-muted-foreground">{meta}</div>}
      </div>
      <CapabilityIcons model={model} />
      <span className="flex size-4 items-center justify-center">{selected && <Check className="size-4 text-foreground" />}</span>
    </button>
  );
}

/** `preferTools` (Cowork) lists models with native tool calling first. `onSelect` (Playground) picks for one side instead of the whole app. */
export function ModelPicker({ model, compact, preferTools, onSelect }: { model: ModelEntry | null; compact?: boolean; preferTools?: boolean; onSelect?: (ref: ModelRef) => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data: models = [] } = useModels();
  const { data: statuses = [] } = useProviders();
  const { thinking, setThinking, setModel, openLoadSettings } = useUi();

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return statuses
      .map((status) => {
        const list = models.filter(
          (m) => m.ref.providerId === status.id && isChatCapable(m) && (!q || m.displayName.toLowerCase().includes(q) || m.repo?.toLowerCase().includes(q) || m.publisher?.toLowerCase().includes(q)),
        );
        return { status, models: preferTools ? [...list].sort((a, b) => Number(b.capabilities.tools) - Number(a.capabilities.tools)) : list };
      })
      .filter((g) => g.models.length > 0 || (!q && (g.status.state === 'online' || g.status.kind === 'llamacpp')));
  }, [models, statuses, query, preferTools]);

  const options = model ? thinkingOptions(model.reasoningStyle) : [];
  const label = model ? thinkingLabel(model.reasoningStyle, thinking) : '';
  const totalModels = models.filter(isChatCapable).length;

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button data-testid="model-picker" className="no-drag flex h-7 max-w-[260px] items-center gap-1.5 rounded-md px-1.5 text-[13.5px] hover:bg-hover">
          <span className="truncate text-fg-2">{model ? model.displayName : totalModels ? 'Choose a model' : 'No models yet'}</span>
          {label && !compact && <span className="shrink-0 text-muted-foreground">{label}</span>}
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        collisionPadding={12}
        className="flex max-h-[min(560px,var(--radix-popover-content-available-height))] w-[400px] flex-col p-1.5"
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search models"
          className="mb-1 h-8 rounded-lg bg-transparent px-2.5 text-[13.5px] outline-none placeholder:text-muted-foreground"
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.map(({ status, models: list }) => (
            <div key={status.id} className="pb-1">
              <div className="flex items-center gap-2 px-2.5 pt-2 pb-1 text-[11.5px] font-medium text-muted-foreground">
                <ProviderStatusDot state={status.state} />
                <span>{status.name}</span>
                {status.state !== 'online' && <span className="truncate font-normal">— {status.message ?? status.state}</span>}
              </div>
              {list.map((m) => (
                <ModelRow
                  key={`${m.ref.providerId}:${m.ref.modelId}`}
                  model={m}
                  dim={preferTools && !m.capabilities.tools}
                  selected={!!model && model.ref.providerId === m.ref.providerId && model.ref.modelId === m.ref.modelId}
                  onSelect={() => {
                    if (onSelect) onSelect(m.ref);
                    else setModel(m.ref);
                    setOpen(false);
                  }}
                />
              ))}
              {list.length === 0 && status.kind === 'llamacpp' && (
                <button className="w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-muted-foreground hover:bg-hover" onClick={() => { setOpen(false); void navigate({ to: '/discover', search: {} }); }}>
                  No GGUF files found yet — download one from Discover
                </button>
              )}
            </div>
          ))}
        </div>
        {model && options.length > 0 && (
          <div className="mt-1 flex items-center justify-between border-t border-menu-border px-2.5 pt-2 pb-1">
            <span className="text-[12.5px] text-muted-foreground">Thinking</span>
            <div className="flex rounded-lg bg-track p-0.5">
              {options.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setThinking(o.value)}
                  className={cn(
                    'h-6 rounded-md border border-transparent px-2.5 text-[12.5px] text-muted-foreground hover:text-foreground',
                    effectiveThinking(model.reasoningStyle, thinking) === o.value && 'border-track-border bg-track-active text-foreground',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {model?.reasoningStyle === 'always' && <div className="mt-1 border-t border-menu-border px-2.5 pt-2 pb-1 text-[12px] text-muted-foreground">This model always thinks before answering.</div>}
        <div className="mt-1 flex items-center gap-1 border-t border-menu-border pt-1.5">
          <button
            disabled={!model}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px] text-fg-2 hover:bg-hover disabled:opacity-40"
            onClick={() => {
              setOpen(false);
              if (model) openLoadSettings(model.ref);
            }}
          >
            <SlidersHorizontal className="size-3.5" /> Load settings
          </button>
          <button className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px] text-fg-2 hover:bg-hover" onClick={() => { setOpen(false); void navigate({ to: '/models' }); }}>
            <Cpu className="size-3.5" /> Models
          </button>
          <button className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px] text-fg-2 hover:bg-hover" onClick={() => { setOpen(false); void navigate({ to: '/discover', search: {} }); }}>
            <Telescope className="size-3.5" /> Discover
          </button>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
