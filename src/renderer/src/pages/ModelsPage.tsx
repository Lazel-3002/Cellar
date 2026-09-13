import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Cpu, Ellipsis, FolderOpen, RefreshCw, ScrollText, SlidersHorizontal, Star, Telescope, Trash } from 'lucide-react';
import { toast } from 'sonner';
import type { ModelEntry } from '@shared/types/models';
import { CapabilityIcons, ProviderStatusDot } from '@/components/models/bits';
import { Button, IconButton } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/form';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Badge, EmptyState, Spinner } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { keys, useHardware, useModels, useProviders, useRuntimes, useSettings } from '@/lib/queries';
import { cn, formatBytes, formatContext } from '@/lib/utils';
import { useUi } from '@/stores/ui';

function LogsDialog({ model, onClose }: { model: ModelEntry | null; onClose: () => void }) {
  const [lines, setLines] = useState<string[] | null>(null);
  if (model && lines === null) void invoke('models:logs', model.ref).then(setLines);
  return (
    <Dialog open={!!model} onOpenChange={(o) => { if (!o) { setLines(null); onClose(); } }} title="llama.cpp log" description={model?.displayName} className="w-[min(900px,calc(100vw-40px))]">
      <pre className="selectable max-h-[60vh] overflow-auto rounded-lg bg-code p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-fg-2">{lines?.length ? lines.join('\n') : 'No log output yet.'}</pre>
    </Dialog>
  );
}

function ModelRowActions({ model, onLogs }: { model: ModelEntry; onLogs: () => void }) {
  const qc = useQueryClient();
  const { openLoadSettings, setModel } = useUi();
  const [busy, setBusy] = useState(false);
  const canManage = model.providerKind === 'llamacpp' || model.providerKind === 'ollama' || model.providerKind === 'lmstudio';

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
      await qc.invalidateQueries({ queryKey: keys.models });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { duration: 10_000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {canManage &&
        (model.loaded ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => invoke('models:unload', model.ref), `Unloaded ${model.displayName}`)}>
            {busy && <Spinner className="size-3" />} Eject
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={busy || model.loading} onClick={() => void run(() => invoke('models:load', model.ref), `${model.displayName} loaded`)}>
            {(busy || model.loading) && <Spinner className="size-3" />} Load
          </Button>
        ))}
      <IconButton label="Load settings" onClick={() => openLoadSettings(model.ref)}>
        <SlidersHorizontal className="size-4" />
      </IconButton>
      <Menu>
        <MenuTrigger asChild>
          <button aria-label="More" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground">
            <Ellipsis className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<Cpu />} onSelect={() => setModel(model.ref)}>
            Use in new chats
          </MenuItem>
          <MenuItem icon={<Star />} onSelect={() => void invoke('settings:update', { defaultModel: model.ref }).then(() => toast.success('Default model updated'))}>
            Set as default
          </MenuItem>
          {model.path && (
            <MenuItem icon={<FolderOpen />} onSelect={() => void invoke('system:showInFolder', model.path!)}>
              Show in folder
            </MenuItem>
          )}
          {model.providerKind === 'llamacpp' && (
            <MenuItem icon={<ScrollText />} onSelect={onLogs}>
              View llama.cpp log
            </MenuItem>
          )}
          {(model.providerKind === 'llamacpp' ? model.source === 'cellar' || model.source === 'folder' : model.providerKind === 'ollama') && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={<Trash />}
                destructive
                onSelect={() => {
                  if (window.confirm(`Delete ${model.displayName}? This removes the files from disk.`)) void run(() => invoke('models:delete', model.ref), 'Model deleted');
                }}
              >
                Delete from disk
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = { cellar: 'Cellar', 'hf-cache': 'HF cache', lmstudio: 'LM Studio folder', folder: 'Folder', remote: '' };

export function ModelsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: models = [], isLoading } = useModels();
  const { data: providers = [] } = useProviders();
  const { data: hardware } = useHardware();
  const { data: runtimes = [] } = useRuntimes();
  const { data: settings } = useSettings();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'loaded'>('all');
  const [scanning, setScanning] = useState(false);
  const [logsFor, setLogsFor] = useState<ModelEntry | null>(null);

  const activeRuntime = runtimes.find((r) => r.id === settings?.activeRuntimeId) ?? runtimes.find((r) => r.ok && r.devices.length) ?? runtimes.find((r) => r.ok);
  const gpu = hardware?.gpus[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => (tab === 'loaded' ? m.loaded : true) && (!q || `${m.displayName} ${m.publisher ?? ''} ${m.architecture ?? ''} ${m.quant ?? ''}`.toLowerCase().includes(q)));
  }, [models, query, tab]);

  const groups = providers.map((p) => ({ provider: p, models: filtered.filter((m) => m.ref.providerId === p.id) })).filter((g) => g.models.length > 0);

  return (
    <div className="h-full overflow-y-auto pt-9">
      <div className="mx-auto max-w-[1100px] px-8 pt-6 pb-16">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-serif text-[30px]">Models</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              disabled={scanning}
              onClick={async () => {
                setScanning(true);
                try {
                  await invoke('models:rescan');
                  await invoke('providers:status', true);
                  await qc.invalidateQueries({ queryKey: keys.models });
                  await qc.invalidateQueries({ queryKey: keys.providers });
                } finally {
                  setScanning(false);
                }
              }}
            >
              <RefreshCw className={cn('size-4', scanning && 'animate-spin')} /> Rescan
            </Button>
            <Button variant="primary" onClick={() => void navigate({ to: '/discover', search: {} })}>
              <Telescope className="size-4" /> Discover models
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border border-divider bg-card p-4">
            <div className="text-[12px] text-muted-foreground">Built-in engine</div>
            <div className="mt-1 flex items-center gap-2 text-[14px]">
              <ProviderStatusDot state={activeRuntime ? 'online' : 'not-installed'} />
              {activeRuntime ? activeRuntime.label : 'No llama.cpp runtime installed'}
            </div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">
              {gpu ? `${gpu.name} · ${formatBytes(gpu.vramTotalBytes)} VRAM` : 'No GPU detected'} · {hardware ? `${formatBytes(hardware.ramTotalBytes)} RAM` : ''}
            </div>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void navigate({ to: '/settings/$section', params: { section: 'engines' } })}>
              Manage runtimes
            </Button>
          </div>
          <div className="rounded-xl border border-divider bg-card p-4">
            <div className="text-[12px] text-muted-foreground">Connections</div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {providers.map((p) => (
                <div key={p.id} className="flex min-w-0 items-center gap-2 text-[13px]">
                  <ProviderStatusDot state={p.state} />
                  <span className="truncate">{p.name}</span>
                  <span className="truncate text-[11.5px] text-muted-foreground">{p.state === 'online' ? p.version ?? '' : p.state}</span>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void navigate({ to: '/settings/$section', params: { section: 'connections' } })}>
              Manage connections
            </Button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <div className="flex rounded-lg bg-track p-0.5">
            {(['all', 'loaded'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn('h-7 rounded-md border border-transparent px-3 text-[13px] text-muted-foreground', tab === t && 'border-track-border bg-track-active text-foreground')}>
                {t === 'all' ? `Library (${models.length})` : `Loaded (${models.filter((m) => m.loaded).length})`}
              </button>
            ))}
          </div>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter models" className="max-w-xs" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Cpu className="size-5" />}
            title={tab === 'loaded' ? 'No models are loaded' : 'No models found'}
            description={tab === 'loaded' ? 'Load a model from the library, or just start chatting — Cellar loads models on demand.' : 'Download GGUFs from Discover, add a models folder in Settings, or start Ollama / LM Studio.'}
          />
        ) : (
          groups.map(({ provider, models: list }) => (
            <section key={provider.id} className="mt-6">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-fg-2">
                <ProviderStatusDot state={provider.state} />
                {provider.name}
                <span className="font-normal text-muted-foreground">{list.length}</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-divider">
                <table className="w-full table-fixed text-[13px]">
                  <thead className="bg-card text-left text-[11.5px] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="w-28 px-3 py-2 font-medium">Quant</th>
                      <th className="w-20 px-3 py-2 font-medium">Params</th>
                      <th className="w-24 px-3 py-2 font-medium">Size</th>
                      <th className="w-24 px-3 py-2 font-medium">Context</th>
                      <th className="w-20 px-3 py-2 font-medium" />
                      <th className="w-52 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((m) => (
                      <tr key={m.ref.modelId} className="border-t border-divider hover:bg-hover/50">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-foreground">{m.displayName}</span>
                            {m.loaded && <Badge tone="success">Loaded{m.loadedContextLength ? ` · ${formatContext(m.loadedContextLength)}` : ''}</Badge>}
                            {m.capabilities.embedding && <Badge>Embedding</Badge>}
                          </div>
                          <div className="truncate text-[11.5px] text-muted-foreground">
                            {[m.publisher, m.architecture, m.source ? SOURCE_LABEL[m.source] : undefined].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-fg-2">{m.quant ?? '—'}</td>
                        <td className="px-3 py-2 text-fg-2">{m.paramsLabel ?? '—'}</td>
                        <td className="px-3 py-2 text-fg-2 tabular-nums">{m.sizeBytes ? formatBytes(m.sizeBytes) : '—'}</td>
                        <td className="px-3 py-2 text-fg-2">{formatContext(m.contextLength)}</td>
                        <td className="px-3 py-2">
                          <CapabilityIcons model={m} />
                        </td>
                        <td className="px-3 py-2">
                          <ModelRowActions model={m} onLogs={() => setLogsFor(m)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
      </div>
      <LogsDialog model={logsFor} onClose={() => setLogsFor(null)} />
    </div>
  );
}
