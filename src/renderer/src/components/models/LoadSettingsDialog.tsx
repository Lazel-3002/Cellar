import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DEFAULT_INFERENCE_PARAMS, DEFAULT_LOAD_CONFIG, KV_CACHE_TYPES, type InferenceParams, type LoadConfig, type ModelDetail } from '@shared/types/models';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, NumberInput, Segmented, Select, Slider, Switch, Textarea } from '@/components/ui/form';
import { Badge, Spinner } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { keys, useModelDetail } from '@/lib/queries';
import { formatBytes, formatContext } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { CapabilityIcons, FitBadge, MemoryBars } from './bits';

const CONTEXT_STEPS = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-divider py-2 last:border-0">
      <h3 className="pt-2 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      <div className="divide-y divide-divider/60">{children}</div>
    </section>
  );
}

function ContextControl({ cfg, set, max }: { cfg: LoadConfig; set: (patch: Partial<LoadConfig>) => void; max: number }) {
  const steps = CONTEXT_STEPS.filter((s) => s <= max);
  if (!steps.includes(max)) steps.push(max);
  const value = typeof cfg.contextLength === 'number' ? cfg.contextLength : null;
  const index = value === null ? steps.length - 1 : steps.reduce((best, s, i) => (Math.abs(s - value) < Math.abs(steps[best] - value) ? i : best), 0);
  return (
    <Field
      stacked
      label={
        <div className="flex items-center justify-between">
          <span>Context length</span>
          <span className="text-[12px] text-muted-foreground">Trained for {max.toLocaleString('en-US')} tokens</span>
        </div>
      }
      description="How many tokens the model can keep in view. Larger contexts need more memory for the KV cache."
    >
      <div className="flex items-center gap-3">
        <Slider value={index} min={0} max={steps.length - 1} onChange={(i) => set({ contextLength: steps[i] })} disabled={value === null} />
        <NumberInput value={value} min={256} max={max} onChange={(v) => set({ contextLength: v ?? 4096 })} className="w-24" placeholder="Auto" />
      </div>
      <label className="mt-2 flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <Switch checked={value === null} onCheckedChange={(auto) => set({ contextLength: auto ? 'auto' : Math.min(16384, max) })} />
        Let llama.cpp pick the largest context that fits in memory
      </label>
    </Field>
  );
}

function LlamaCppLoadSettings({ detail, cfg, set }: { detail: ModelDetail; cfg: LoadConfig; set: (patch: Partial<LoadConfig>) => void }) {
  const g = detail.gguf;
  const layers = g?.blockCount ?? 32;
  const maxContext = g?.contextLength ?? detail.entry.contextLength ?? 131072;
  const gpuMode = cfg.gpuLayers === 'auto' ? 'auto' : cfg.gpuLayers === 'all' ? 'all' : 'custom';
  const isMoe = (g?.expertCount ?? 0) > 1;
  const moeMode = cfg.moeCpuLayers === 'all' ? 'all' : cfg.moeCpuLayers > 0 ? 'custom' : 'off';

  return (
    <>
      <Group title="Memory">
        <ContextControl cfg={cfg} set={set} max={maxContext} />
        <Field stacked label="GPU offload" description="Layers to place in VRAM. Auto lets llama.cpp fit as many as possible.">
          <div className="flex items-center gap-3">
            <Segmented
              value={gpuMode}
              onChange={(m) => set({ gpuLayers: m === 'custom' ? Math.round(layers / 2) : m })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'all', label: 'All' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            {typeof cfg.gpuLayers === 'number' && (
              <>
                <Slider value={cfg.gpuLayers} min={0} max={layers} onChange={(v) => set({ gpuLayers: v })} />
                <span className="w-14 text-right text-[12.5px] tabular-nums">
                  {cfg.gpuLayers}/{layers}
                </span>
              </>
            )}
          </div>
        </Field>
        <Field label="Fit to device memory" description="llama.cpp adjusts unset values (context, layers) so the model fits, keeping this much VRAM free.">
          <div className="flex items-center gap-2">
            {cfg.fit && <NumberInput value={cfg.fitTargetMiB} onChange={(v) => set({ fitTargetMiB: v ?? 1024 })} className="w-20" />}
            {cfg.fit && <span className="text-[12px] text-muted-foreground">MiB</span>}
            <Switch checked={cfg.fit} onCheckedChange={(fit) => set({ fit })} />
          </div>
        </Field>
        <Field label="Offload KV cache to GPU" description="Keep the context cache in VRAM (faster). Turn off to save VRAM.">
          <Switch checked={cfg.kvOffload} onCheckedChange={(kvOffload) => set({ kvOffload })} />
        </Field>
        {isMoe && (
          <Field stacked label="Mixture-of-experts offload" description={`This model has ${g?.expertCount} experts. Keeping expert weights on the CPU frees a lot of VRAM with a modest speed cost.`}>
            <div className="flex items-center gap-3">
              <Segmented
                value={moeMode}
                onChange={(m) => set({ moeCpuLayers: m === 'all' ? 'all' : m === 'custom' ? Math.round(layers / 2) : 0 })}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'all', label: 'All experts on CPU' },
                  { value: 'custom', label: 'First N layers' },
                ]}
              />
              {typeof cfg.moeCpuLayers === 'number' && cfg.moeCpuLayers > 0 && (
                <>
                  <Slider value={cfg.moeCpuLayers} min={1} max={layers} onChange={(v) => set({ moeCpuLayers: v })} />
                  <span className="w-10 text-right text-[12.5px] tabular-nums">{cfg.moeCpuLayers}</span>
                </>
              )}
            </div>
          </Field>
        )}
      </Group>

      <Group title="Performance">
        <Field label="Flash attention" description="Faster, leaner attention. Required for a quantized V cache.">
          <Select value={cfg.flashAttention} onChange={(v) => set({ flashAttention: v })} options={[{ value: 'auto', label: 'Auto' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
        </Field>
        <Field label="K cache quantization" description="q8_0 halves KV memory with minimal quality loss.">
          <Select value={cfg.cacheTypeK} onChange={(v) => set({ cacheTypeK: v })} options={KV_CACHE_TYPES.map((t) => ({ value: t, label: t }))} />
        </Field>
        <Field label="V cache quantization">
          <Select value={cfg.cacheTypeV} onChange={(v) => set({ cacheTypeV: v })} options={KV_CACHE_TYPES.map((t) => ({ value: t, label: t }))} />
        </Field>
        <Field label="CPU threads" description="Leave empty for automatic.">
          <NumberInput value={cfg.threads} min={1} max={256} onChange={(threads) => set({ threads })} />
        </Field>
        <Field label="Batch size" description="Logical batch for prompt processing (default 2048).">
          <NumberInput value={cfg.batchSize} min={32} onChange={(batchSize) => set({ batchSize })} />
        </Field>
        <Field label="Micro-batch size" description="Physical batch (default 512). Larger is faster for long prompts but uses more VRAM.">
          <NumberInput value={cfg.ubatchSize} min={32} onChange={(ubatchSize) => set({ ubatchSize })} />
        </Field>
        <Field label="Parallel slots" description="Concurrent requests. Context is shared between slots.">
          <NumberInput value={cfg.parallel} min={1} max={32} onChange={(parallel) => set({ parallel })} />
        </Field>
        <Field label="Load mode" description="mlock keeps weights in RAM; mmap loads lazily from disk. With MoE offload, mmap is replaced by a full read for speed.">
          <Select
            value={cfg.loadMode}
            onChange={(loadMode) => set({ loadMode })}
            options={[
              { value: 'mmap', label: 'mmap' },
              { value: 'mlock', label: 'mlock' },
              { value: 'mmap+mlock', label: 'mmap + mlock' },
              { value: 'none', label: 'Read fully' },
            ]}
          />
        </Field>
      </Group>

      <Group title="Model">
        {detail.entry.mmprojPath && (
          <>
            <Field label="Vision projector" description={detail.entry.mmprojPath.split(/[\\/]/).pop()}>
              <Switch checked={cfg.useMmproj} onCheckedChange={(useMmproj) => set({ useMmproj })} />
            </Field>
            <Field label="Projector on GPU">
              <Switch checked={cfg.mmprojOffload} disabled={!cfg.useMmproj} onCheckedChange={(mmprojOffload) => set({ mmprojOffload })} />
            </Field>
          </>
        )}
        {detail.entry.capabilities.reasoning && (
          <Field label="Reasoning budget" description="Maximum thinking tokens. Empty = unlimited, 0 = no thinking.">
            <NumberInput value={cfg.reasoningBudget} min={0} onChange={(reasoningBudget) => set({ reasoningBudget })} placeholder="Unlimited" />
          </Field>
        )}
        <Field label="RoPE scaling" description="Only change this for context extension beyond the trained length.">
          <Select
            value={cfg.ropeScaling}
            onChange={(ropeScaling) => set({ ropeScaling })}
            options={[
              { value: 'default', label: 'Model default' },
              { value: 'none', label: 'None' },
              { value: 'linear', label: 'Linear' },
              { value: 'yarn', label: 'YaRN' },
            ]}
          />
        </Field>
        <Field label="Seed">
          <NumberInput value={cfg.seed} onChange={(seed) => set({ seed })} placeholder="Random" />
        </Field>
        <Field stacked label="Speculative decoding draft model" description="Path to a small GGUF from the same family to speed up generation.">
          <Input value={cfg.draftModelPath ?? ''} placeholder="C:\\models\\draft.gguf" onChange={(e) => set({ draftModelPath: e.target.value || null })} />
        </Field>
        <Field stacked label="Chat template override" description="Path to a .jinja file. Leave empty to use the template embedded in the GGUF.">
          <Input value={cfg.chatTemplateFile ?? ''} placeholder="Embedded template" onChange={(e) => set({ chatTemplateFile: e.target.value || null })} />
        </Field>
        <Field stacked label="Extra llama-server arguments" description="Passed verbatim, e.g. --no-context-shift -ot exps=CPU">
          <Input value={cfg.extraArgs} className="font-mono text-[12.5px]" onChange={(e) => set({ extraArgs: e.target.value })} />
        </Field>
      </Group>
    </>
  );
}

function RemoteLoadSettings({ detail, cfg, set }: { detail: ModelDetail; cfg: LoadConfig; set: (patch: Partial<LoadConfig>) => void }) {
  const kind = detail.entry.providerKind;
  const max = detail.entry.contextLength ?? 131072;
  if (kind === 'unsloth' || kind === 'openai') {
    return <p className="py-4 text-[13px] leading-relaxed text-muted-foreground">{detail.entry.providerName} decides how this model is loaded. Change GPU and context settings in that app; generation settings on the Inference tab still apply.</p>;
  }
  return (
    <Group title="Memory">
      <ContextControl cfg={cfg} set={set} max={max} />
      {kind === 'ollama' && (
        <>
          <Field label="GPU layers" description="Ollama's num_gpu. Leave on Auto unless you need to limit VRAM.">
            <Segmented
              value={cfg.gpuLayers === 'auto' ? 'auto' : cfg.gpuLayers === 'all' ? 'all' : 'custom'}
              onChange={(m) => set({ gpuLayers: m === 'custom' ? 20 : m })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'all', label: 'All' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
          </Field>
          {typeof cfg.gpuLayers === 'number' && (
            <Field label="Layers on GPU">
              <NumberInput value={cfg.gpuLayers} min={0} onChange={(v) => set({ gpuLayers: v ?? 0 })} />
            </Field>
          )}
          <Field label="CPU threads">
            <NumberInput value={cfg.threads} min={1} onChange={(threads) => set({ threads })} />
          </Field>
          <Field label="Keep loaded for" description="Minutes Ollama keeps the model in memory after the last request.">
            <NumberInput value={cfg.keepAliveMinutes} min={0} onChange={(v) => set({ keepAliveMinutes: v ?? 5 })} />
          </Field>
          <p className="py-3 text-[12px] text-muted-foreground">Flash attention and KV cache type are Ollama server settings (OLLAMA_FLASH_ATTENTION, OLLAMA_KV_CACHE_TYPE).</p>
        </>
      )}
      {kind === 'lmstudio' && (
        <>
          <Field label="Flash attention">
            <Select value={cfg.flashAttention} onChange={(v) => set({ flashAttention: v })} options={[{ value: 'auto', label: 'Default' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
          </Field>
          <Field label="Evaluation batch size">
            <NumberInput value={cfg.batchSize} min={32} onChange={(batchSize) => set({ batchSize })} />
          </Field>
          <Field label="Offload KV cache to GPU">
            <Switch checked={cfg.kvOffload} onCheckedChange={(kvOffload) => set({ kvOffload })} />
          </Field>
        </>
      )}
    </Group>
  );
}

function InferenceSettings({ detail, params, set }: { detail: ModelDetail; params: InferenceParams; set: (patch: Partial<InferenceParams>) => void }) {
  const llama = detail.entry.providerKind === 'llamacpp';
  const num = (key: keyof InferenceParams, label: string, description?: string, step?: number) => (
    <Field label={label} description={description}>
      <NumberInput value={params[key] as number | null} onChange={(v) => set({ [key]: v } as Partial<InferenceParams>)} placeholder="Default" className={step ? 'w-24' : undefined} />
    </Field>
  );
  return (
    <>
      <Group title="Prompt">
        <Field stacked label="System prompt" description="Added after Cellar's built-in instructions for every chat with this model.">
          <Textarea rows={4} value={params.systemPrompt} onChange={(e) => set({ systemPrompt: e.target.value })} placeholder="You are a concise assistant…" />
        </Field>
      </Group>
      <Group title="Sampling">
        {num('temperature', 'Temperature', 'Higher is more creative, lower is more focused.')}
        {num('topK', 'Top K')}
        {num('topP', 'Top P')}
        {num('minP', 'Min P')}
        {num('repeatPenalty', 'Repeat penalty')}
        {num('presencePenalty', 'Presence penalty')}
        {num('frequencyPenalty', 'Frequency penalty')}
        {llama && num('dryMultiplier', 'DRY multiplier', 'Discourages repeated phrases (0 = off).')}
        {llama && num('xtcProbability', 'XTC probability')}
        {llama && num('xtcThreshold', 'XTC threshold')}
        {num('seed', 'Seed')}
      </Group>
      <Group title="Output">
        {num('maxTokens', 'Max response tokens', 'Empty = until the model stops or the context fills.')}
        <Field stacked label="Stop strings" description="Comma-separated.">
          <Input value={params.stop.join(', ')} onChange={(e) => set({ stop: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
        </Field>
        <Field label="When the context is full">
          <Select
            value={params.contextOverflow}
            onChange={(contextOverflow) => set({ contextOverflow })}
            options={[
              { value: 'truncate-middle', label: 'Drop middle messages' },
              { value: 'rolling', label: 'Rolling window' },
              { value: 'stop', label: 'Stop and warn' },
            ]}
          />
        </Field>
        <Field stacked label="Structured output (JSON schema)" description="Constrain replies to this schema. Leave empty for free text.">
          <Textarea rows={3} className="font-mono text-[12px]" value={params.jsonSchema} onChange={(e) => set({ jsonSchema: e.target.value })} placeholder='{"type":"object","properties":{…}}' />
        </Field>
      </Group>
    </>
  );
}

export function LoadSettingsDialog() {
  const { loadSettingsFor: ref, openLoadSettings } = useUi();
  const qc = useQueryClient();
  const { data: detail, isLoading } = useModelDetail(ref);
  const [tab, setTab] = useState<'load' | 'inference'>('load');
  const [cfg, setCfg] = useState<LoadConfig>(DEFAULT_LOAD_CONFIG);
  const [params, setParams] = useState<InferenceParams>(DEFAULT_INFERENCE_PARAMS);
  const [busy, setBusy] = useState(false);

  const detailKey = detail ? `${detail.entry.ref.providerId}:${detail.entry.ref.modelId}` : '';
  useEffect(() => {
    if (!detail) return;
    setCfg(detail.preset.load);
    setParams(detail.preset.inference);
    setTab('load');
  }, [detailKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const debouncedCfg = useDebounced(cfg, 250);
  const isLlama = detail?.entry.providerKind === 'llamacpp';
  const { data: estimate } = useQuery({
    queryKey: ['estimate', detailKey, debouncedCfg],
    queryFn: () => invoke('models:estimate', detail!.entry.ref, debouncedCfg),
    enabled: !!detail && isLlama && !!detail.gguf,
  });

  const canLoad = !!detail && (detail.entry.providerKind === 'llamacpp' || detail.entry.providerKind === 'ollama' || detail.entry.providerKind === 'lmstudio');
  const setLoad = (patch: Partial<LoadConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const setInference = (patch: Partial<InferenceParams>) => setParams((p) => ({ ...p, ...patch }));

  const save = async () => {
    if (!detail) return;
    await invoke('models:savePreset', detail.entry.ref, { load: cfg, inference: params });
    await qc.invalidateQueries({ queryKey: keys.modelDetail(detail.entry.ref) });
  };

  const load = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await save();
      const info = await invoke('models:load', detail.entry.ref, cfg);
      toast.success(`${detail.entry.displayName} is ready`, {
        description: [info.contextLength ? `${info.contextLength.toLocaleString('en-US')} tokens` : null, info.offloadedLayers !== undefined ? `${info.offloadedLayers}/${info.totalLayers} layers on GPU` : null].filter(Boolean).join(' · '),
      });
      await qc.invalidateQueries({ queryKey: keys.models });
    } catch (err) {
      toast.error('Model failed to load', { description: err instanceof Error ? err.message : String(err), duration: 12_000 });
    } finally {
      setBusy(false);
    }
  };

  const title = useMemo(() => detail?.entry.displayName ?? 'Model settings', [detail]);

  return (
    <Dialog
      open={!!ref}
      onOpenChange={(open) => !open && openLoadSettings(null)}
      side="right"
      title={title}
      description={
        detail ? (
          <span className="flex flex-wrap items-center gap-2">
            <span>{detail.entry.providerName}</span>
            {detail.entry.quant && <Badge>{detail.entry.quant}</Badge>}
            {detail.entry.sizeBytes ? <span>{formatBytes(detail.entry.sizeBytes)}</span> : null}
            {detail.entry.contextLength ? <span>{formatContext(detail.entry.contextLength)} ctx</span> : null}
            <CapabilityIcons model={detail.entry} />
            {detail.entry.loaded && <Badge tone="success">Loaded</Badge>}
          </span>
        ) : undefined
      }
      footer={
        detail && (
          <>
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={async () => {
                const preset = await invoke('models:resetPreset', detail.entry.ref);
                setCfg(preset.load);
                setParams(preset.inference);
              }}
            >
              Reset
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void save()
                  .then(() => toast.success('Settings saved for this model'))
                  .catch((e) => toast.error(String(e)))
              }
            >
              Save
            </Button>
            {canLoad && (
              <Button variant="primary" disabled={busy} onClick={() => void load()}>
                {busy && <Spinner className="size-3.5 text-background" />}
                {detail.entry.loaded ? 'Reload with settings' : 'Load model'}
              </Button>
            )}
          </>
        )
      }
    >
      {isLoading || !detail ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div>
          {isLlama && (
            <div className="mb-3 rounded-xl border border-divider bg-card p-3">
              {estimate ? (
                <>
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-[12.5px] text-muted-foreground">Estimated memory at {estimate.contextLength.toLocaleString('en-US')} tokens</span>
                    <FitBadge fit={estimate.fit} estimate={estimate} />
                  </div>
                  <MemoryBars estimate={estimate} />
                </>
              ) : (
                <div className="text-[12.5px] text-muted-foreground">{detail.gguf ? 'Estimating…' : 'Reading the GGUF header to estimate memory…'}</div>
              )}
            </div>
          )}
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'load', label: 'Load' },
              { value: 'inference', label: 'Inference' },
            ]}
          />
          <div className="mt-1">
            {tab === 'load' ? (
              isLlama ? (
                <LlamaCppLoadSettings detail={detail} cfg={cfg} set={setLoad} />
              ) : (
                <RemoteLoadSettings detail={detail} cfg={cfg} set={setLoad} />
              )
            ) : (
              <InferenceSettings detail={detail} params={params} set={setInference} />
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
