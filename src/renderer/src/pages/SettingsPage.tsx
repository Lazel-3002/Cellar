import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FolderOpen, Plus, RefreshCw, Trash } from 'lucide-react';
import { toast } from 'sonner';
import type { ProviderConfig, ProviderStatus } from '@shared/types/providers';
import type { RuntimeInstallProgress, RuntimeVariant } from '@shared/types/system';
import { CellarMark } from '@/components/brand/Logo';
import { ProviderStatusDot } from '@/components/models/bits';
import { Button } from '@/components/ui/button';
import { Field, Input, NumberInput, Segmented, Switch, Textarea } from '@/components/ui/form';
import { Badge, Kbd, Progress, Spinner } from '@/components/ui/misc';
import { invoke, onEvent } from '@/lib/ipc';
import { keys, useAppInfo, useHardware, useProviderConfigs, useProviders, useRuntimes, useSettings, useUpdateSettings } from '@/lib/queries';
import { cn, formatBytes } from '@/lib/utils';

const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'cowork', label: 'Cowork' },
  { id: 'code', label: 'Code' },
  { id: 'models', label: 'Models' },
  { id: 'engines', label: 'Engines & runtimes' },
  { id: 'connections', label: 'Connections' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'data', label: 'Data & privacy' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'about', label: 'About' },
] as const;

function Card({ title, description, children, actions }: { title?: string; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="mb-5 rounded-xl border border-divider bg-card px-5 py-2">
      {title && (
        <div className="flex items-center justify-between gap-4 border-b border-divider py-3">
          <div>
            <h2 className="text-[14px] font-medium">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="divide-y divide-divider">{children}</div>
    </section>
  );
}

function General() {
  const { data: s } = useSettings();
  const update = useUpdateSettings();
  const [name, setName] = useState(s?.userName ?? '');
  const [prefs, setPrefs] = useState(s?.personalPreferences ?? '');
  useEffect(() => {
    setName(s?.userName ?? '');
    setPrefs(s?.personalPreferences ?? '');
  }, [s?.userName, s?.personalPreferences]);
  if (!s) return null;
  return (
    <>
      <Card title="Profile">
        <Field label="What should Cellar call you?">
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== s.userName && update.mutate({ userName: name })} className="w-64" />
        </Field>
        <Field stacked label="Personal preferences" description="Shared with every model in every chat — how you like answers, your background, languages you speak.">
          <Textarea rows={5} value={prefs} onChange={(e) => setPrefs(e.target.value)} placeholder="e.g. I'm a game developer on Windows. Keep answers short and show code first." />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="primary" disabled={prefs === s.personalPreferences} onClick={() => update.mutate({ personalPreferences: prefs }, { onSuccess: () => toast.success('Preferences saved') })}>
              Save preferences
            </Button>
          </div>
        </Field>
      </Card>
      <Card title="Chat">
        <Field label="Send with Enter" description="When off, use Ctrl+Enter to send and Enter for new lines.">
          <Switch checked={s.sendWithEnter} onCheckedChange={(v) => update.mutate({ sendWithEnter: v })} />
        </Field>
        <Field label="Name chats automatically" description="Ask the model for a short title after the first reply.">
          <Switch checked={s.autoTitle} onCheckedChange={(v) => update.mutate({ autoTitle: v })} />
        </Field>
        <Field label="Show generation stats" description="Tokens per second, token counts and time to first token under each reply.">
          <Switch checked={s.showGenerationStats} onCheckedChange={(v) => update.mutate({ showGenerationStats: v })} />
        </Field>
        <Field label="Artifacts" description="Ask models to put web pages, SVGs, React components, diagrams and long documents in a side panel. Skipped automatically for models under 3B parameters.">
          <Switch checked={s.artifacts} onCheckedChange={(v) => update.mutate({ artifacts: v })} />
        </Field>
      </Card>
    </>
  );
}

const ACCENTS = ['#D97757', '#C2410C', '#B45309', '#65A30D', '#0D9488', '#2563EB', '#7C3AED', '#DB2777'];

function Appearance() {
  const { data: s } = useSettings();
  const update = useUpdateSettings();
  if (!s) return null;
  return (
    <Card title="Appearance">
      <Field label="Theme">
        <Segmented value={s.theme} onChange={(theme) => update.mutate({ theme })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
      </Field>
      <Field label="Accent color">
        <div className="flex items-center gap-1.5">
          {ACCENTS.map((c) => (
            <button key={c} aria-label={c} onClick={() => update.mutate({ accent: c })} className="flex size-6 items-center justify-center rounded-full" style={{ background: c }}>
              {s.accent.toLowerCase() === c.toLowerCase() && <Check className="size-3.5 text-white" />}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Chat font" description="Font used for model responses.">
        <Segmented value={s.chatFont} onChange={(chatFont) => update.mutate({ chatFont })} options={[{ value: 'default', label: 'Default' }, { value: 'sans', label: 'Sans' }, { value: 'system', label: 'System' }]} />
      </Field>
    </Card>
  );
}

function Cowork() {
  const { data: s } = useSettings();
  const update = useUpdateSettings();
  const [searxng, setSearxng] = useState(s?.searxngUrl ?? '');
  useEffect(() => setSearxng(s?.searxngUrl ?? ''), [s?.searxngUrl]);
  if (!s) return null;
  return (
    <>
      <Card title="Tasks" description="Cowork runs an agent that works through a task with tools, inside a folder you choose.">
        <Field label="Permissions for new tasks" description="You can switch this at any time from the task's composer.">
          <Segmented
            value={s.coworkPermissionMode}
            onChange={(coworkPermissionMode) => update.mutate({ coworkPermissionMode })}
            options={[
              { value: 'ask', label: 'Ask' },
              { value: 'auto-edits', label: 'Auto-accept edits' },
              { value: 'plan', label: 'Plan only' },
            ]}
          />
        </Field>
        <Field label="Step limit" description="Model calls per turn before a task pauses. Reply “continue” to let it keep going.">
          <NumberInput value={s.coworkMaxSteps} min={5} max={500} onChange={(v) => v && update.mutate({ coworkMaxSteps: v })} />
        </Field>
        <Field label="Notifications" description="Let me know when a task finishes, fails or needs approval while Cellar is in the background.">
          <Switch checked={s.coworkNotifications} onCheckedChange={(v) => update.mutate({ coworkNotifications: v })} />
        </Field>
        {s.recentFolders.length > 0 && (
          <Field label="Recent folders" description={s.recentFolders.join(' · ')}>
            <Button size="sm" variant="ghost" onClick={() => update.mutate({ recentFolders: [] })}>
              Clear
            </Button>
          </Field>
        )}
      </Card>
      <Card title="Web access" description="Search queries go to the provider below; pages are fetched directly from this computer.">
        <Field label="Let tasks search the web and read pages">
          <Switch checked={s.coworkWebAccess} onCheckedChange={(v) => update.mutate({ coworkWebAccess: v })} />
        </Field>
        <Field label="Search provider">
          <Segmented
            value={s.webSearchProvider}
            onChange={(webSearchProvider) => update.mutate({ webSearchProvider })}
            options={[
              { value: 'duckduckgo', label: 'DuckDuckGo' },
              { value: 'searxng', label: 'SearXNG' },
            ]}
          />
        </Field>
        {s.webSearchProvider === 'searxng' && (
          <Field stacked label="SearXNG server" description='Your own instance, for example http://127.0.0.1:8080. Add "json" to search.formats in its settings.yml.'>
            <Input value={searxng} onChange={(e) => setSearxng(e.target.value)} onBlur={() => searxng !== s.searxngUrl && update.mutate({ searxngUrl: searxng })} placeholder="http://127.0.0.1:8080" />
          </Field>
        )}
      </Card>
      <Card title="How Cellar keeps tasks contained">
        <ul className="space-y-2 py-3 text-[13px] leading-relaxed text-fg-2">
          <li>File tools only reach the folder you picked. Paths outside it, including through links and junctions, are refused.</li>
          <li>Commands run in Windows PowerShell and always ask first, unless you choose “Always allow commands” for a task.</li>
          <li>A page that did not come from a web search or your own message needs your OK before it opens. Local and private network addresses are blocked.</li>
          <li>Plan only mode never changes files or runs commands.</li>
        </ul>
      </Card>
    </>
  );
}

function Code() {
  const { data: s } = useSettings();
  const update = useUpdateSettings();
  if (!s) return null;
  return (
    <>
      <Card title="Sessions" description="Code runs a coding agent in a repository, usually on its own branch in a git worktree.">
        <Field label="Mode for new sessions" description="Switch any time from the composer, or press Shift+Tab.">
          <Segmented
            value={s.codeMode === 'code' && s.codeAutoAcceptEdits ? 'code-auto' : s.codeMode}
            onChange={(value) => update.mutate(value === 'code-auto' ? { codeMode: 'code', codeAutoAcceptEdits: true } : { codeMode: value, codeAutoAcceptEdits: false })}
            options={[
              { value: 'ask', label: 'Ask' },
              { value: 'plan', label: 'Plan' },
              { value: 'code', label: 'Code' },
              { value: 'code-auto', label: 'Auto-accept edits' },
            ]}
          />
        </Field>
        <Field label="Use a worktree for new sessions" description="Each session gets a cellar/… branch in ~/.cellar/worktrees, so your checkout stays untouched. List ignored files a worktree needs (like .env) in a .worktreeinclude file.">
          <Switch checked={s.codeUseWorktrees} onCheckedChange={(v) => update.mutate({ codeUseWorktrees: v })} />
        </Field>
        <Field label="Step limit" description="Model calls per turn before a session pauses. Reply “continue” to let it keep going.">
          <NumberInput value={s.codeMaxSteps} min={5} max={500} onChange={(v) => v && update.mutate({ codeMaxSteps: v })} />
        </Field>
        <Field label="Shell" description="Used by the Terminal tab and the agent's commands (the agent always uses PowerShell; Automatic picks PowerShell 7 when it is installed).">
          <Segmented
            value={s.terminalShell}
            onChange={(terminalShell) => update.mutate({ terminalShell })}
            options={[
              { value: 'auto', label: 'Automatic' },
              { value: 'pwsh', label: 'PowerShell 7' },
              { value: 'powershell', label: 'Windows PowerShell' },
              { value: 'cmd', label: 'Command Prompt' },
            ]}
          />
        </Field>
        {s.recentRepos.length > 0 && (
          <Field label="Recent repositories" description={s.recentRepos.join(' · ')}>
            <Button size="sm" variant="ghost" onClick={() => update.mutate({ recentRepos: [] })}>
              Clear
            </Button>
          </Field>
        )}
      </Card>
      <Card title="Project memory">
        <ul className="space-y-2 py-3 text-[13px] leading-relaxed text-fg-2">
          <li>CELLAR.md at the top of a repository is included in every session there (AGENTS.md or CLAUDE.md are used when there is no CELLAR.md). Type /init to have the agent write one, or /memory to edit it.</li>
          <li>~/.cellar/CELLAR.md holds notes for all your repositories.</li>
          <li>Web access and notifications follow the Cowork settings.</li>
        </ul>
      </Card>
    </>
  );
}

function Models() {
  const { data: s } = useSettings();
  const update = useUpdateSettings();
  const [token, setToken] = useState('');
  if (!s) return null;
  const pickDir = async (onPick: (dir: string) => void) => {
    const dir = await invoke('system:pickDirectory', 'Choose a folder');
    if (dir) onPick(dir);
  };
  return (
    <>
      <Card title="Loading">
        <Field label="Default context length" description="Used when a model has no saved settings. Can be changed per model in Load settings.">
          <NumberInput value={s.defaultContextLength} min={512} onChange={(v) => v && update.mutate({ defaultContextLength: v })} />
        </Field>
        <Field label="Load models on demand" description="Start llama.cpp automatically when you send a message to an unloaded model.">
          <Switch checked={s.jitLoad} onCheckedChange={(v) => update.mutate({ jitLoad: v })} />
        </Field>
        <Field label="Unload idle models after (minutes)" description="Frees VRAM for games and other apps. 0 keeps models loaded.">
          <NumberInput value={s.idleUnloadMinutes} min={0} onChange={(v) => update.mutate({ idleUnloadMinutes: v ?? 0 })} />
        </Field>
        <Field label="Models loaded at once" description="Loading another model unloads the least recently used one.">
          <NumberInput value={s.maxLoadedModels} min={1} max={8} onChange={(v) => v && update.mutate({ maxLoadedModels: v })} />
        </Field>
      </Card>
      <Card title="Model folders" description="Cellar finds GGUF files in these locations.">
        <Field stacked label="Download folder" description="New downloads go to <folder>/<publisher>/<repo>/.">
          <div className="flex gap-2">
            <Input value={s.modelsDir} readOnly />
            <Button variant="outline" onClick={() => void pickDir((dir) => update.mutate({ modelsDir: dir }))}>
              Change
            </Button>
            <Button variant="ghost" onClick={() => void invoke('system:showInFolder', s.modelsDir)}>
              <FolderOpen className="size-4" />
            </Button>
          </div>
        </Field>
        <Field stacked label="Extra folders">
          <div className="space-y-2">
            {s.extraModelDirs.map((dir) => (
              <div key={dir} className="flex items-center gap-2">
                <Input value={dir} readOnly />
                <Button variant="ghost" onClick={() => update.mutate({ extraModelDirs: s.extraModelDirs.filter((d) => d !== dir) })}>
                  <Trash className="size-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => void pickDir((dir) => update.mutate({ extraModelDirs: [...s.extraModelDirs, dir] }))}>
              <Plus className="size-3.5" /> Add folder
            </Button>
          </div>
        </Field>
        <Field label="Include the Hugging Face cache" description="Models downloaded by huggingface-cli, llama.cpp -hf or Unsloth.">
          <Switch checked={s.scanHfCache} onCheckedChange={(v) => update.mutate({ scanHfCache: v })} />
        </Field>
        <Field label="Include LM Studio's models folder">
          <Switch checked={s.scanLmStudio} onCheckedChange={(v) => update.mutate({ scanLmStudio: v })} />
        </Field>
      </Card>
      <Card title="Hugging Face">
        <Field stacked label="Access token" description={s.hasHfToken ? 'A token is saved (encrypted with Windows credentials). Enter a new one to replace it.' : 'Needed only for gated or private repositories.'}>
          <div className="flex gap-2">
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={s.hasHfToken ? '••••••••••••' : 'hf_…'} />
            <Button variant="primary" disabled={!token} onClick={() => update.mutate({ hfToken: token }, { onSuccess: () => { setToken(''); toast.success('Token saved'); } })}>
              Save
            </Button>
            {s.hasHfToken && (
              <Button variant="ghost" onClick={() => update.mutate({ hfToken: '' })}>
                Remove
              </Button>
            )}
          </div>
        </Field>
        <Field label="Parallel downloads">
          <NumberInput value={s.concurrentDownloads} min={1} max={4} onChange={(v) => v && update.mutate({ concurrentDownloads: v })} />
        </Field>
      </Card>
    </>
  );
}

const VARIANT_LABEL: Record<RuntimeVariant, string> = { 'cuda-13': 'CUDA 13', 'cuda-12': 'CUDA 12', vulkan: 'Vulkan', cpu: 'CPU', sycl: 'SYCL (Intel)', rocm: 'ROCm (AMD)', unknown: 'Unknown' };

function Engines() {
  const qc = useQueryClient();
  const { data: s } = useSettings();
  const { data: runtimes = [], isFetching } = useRuntimes();
  const { data: release, isLoading: releaseLoading, error: releaseError } = useQuery({ queryKey: keys.release, queryFn: () => invoke('runtimes:latestRelease'), staleTime: 30 * 60_000 });
  const [progress, setProgress] = useState<RuntimeInstallProgress | null>(null);

  useEffect(() => onEvent('runtimes:progress', (p) => setProgress(p.stage === 'done' || p.stage === 'error' ? null : p)), []);

  const refresh = async () => {
    qc.setQueryData(keys.runtimes, await invoke('runtimes:list', true));
  };
  const install = async (variant: RuntimeVariant) => {
    try {
      const info = await invoke('runtimes:install', variant);
      toast.success('llama.cpp installed', { description: info.label });
      await refresh();
      await qc.invalidateQueries({ queryKey: keys.settings });
      await qc.invalidateQueries({ queryKey: keys.providers });
    } catch (err) {
      toast.error('Install failed', { description: err instanceof Error ? err.message : String(err) });
    }
  };
  const activeId = s?.activeRuntimeId ?? runtimes.find((r) => r.ok && r.devices.length)?.id;

  return (
    <>
      <Card
        title="Installed llama.cpp runtimes"
        description="Cellar runs GGUF models with llama-server. It also finds builds bundled with Unsloth Studio or on your PATH."
        actions={
          <Button size="sm" variant="ghost" onClick={() => void refresh()}>
            <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} /> Rescan
          </Button>
        }
      >
        {runtimes.length === 0 && <div className="py-4 text-[13px] text-muted-foreground">No runtimes found yet. Install one below.</div>}
        {runtimes.map((r) => (
          <div key={r.id} className="flex items-start gap-3 py-3">
            <button
              aria-label="Use this runtime"
              disabled={!r.ok}
              onClick={() => void invoke('runtimes:setActive', r.id).then(() => qc.invalidateQueries({ queryKey: keys.settings }))}
              className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-composer-border disabled:opacity-40', activeId === r.id && 'border-brand bg-brand')}
            >
              {activeId === r.id && <span className="size-1.5 rounded-full bg-white" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13.5px]">
                {r.label}
                {r.ok ? r.devices.length ? <Badge tone="success">GPU</Badge> : <Badge tone="warning">CPU only</Badge> : <Badge tone="danger">Broken</Badge>}
              </div>
              <div className="truncate text-[12px] text-muted-foreground">{r.dir}</div>
              {r.devices.map((d) => (
                <div key={d.id} className="text-[12px] text-muted-foreground">
                  {d.id}: {d.name} {d.totalMiB ? `· ${formatBytes(d.totalMiB * 1048576)}` : ''}
                </div>
              ))}
              {r.source === 'unsloth' && r.ok && r.devices.length === 0 && (
                <div className="text-[12px] text-warning">This build needs CUDA DLLs that only Unsloth Studio provides, so it runs on the CPU here. Install the official CUDA build below.</div>
              )}
              {r.error && <div className="text-[12px] text-danger">{r.error}</div>}
            </div>
            {(r.source === 'cellar' || r.source === 'custom') && (
              <Button size="sm" variant="ghost" onClick={() => void invoke('runtimes:remove', r.id).then(refresh)}>
                <Trash className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
        <div className="py-3">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const dir = await invoke('system:pickDirectory', 'Folder containing llama-server');
              if (!dir) return;
              try {
                await invoke('runtimes:addCustom', dir);
                await refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            <Plus className="size-3.5" /> Add a llama.cpp folder
          </Button>
        </div>
      </Card>

      <Card title="Install from ggml-org/llama.cpp" description={release ? `Latest build ${release.tag} · ${new Date(release.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Official prebuilt Windows binaries from GitHub.'}>
        {releaseLoading && (
          <div className="py-4">
            <Spinner />
          </div>
        )}
        {releaseError && <div className="py-3 text-[13px] text-danger">{releaseError instanceof Error ? releaseError.message : String(releaseError)}</div>}
        {progress && (
          <div className="py-3">
            <div className="mb-1 flex justify-between text-[12.5px] text-muted-foreground">
              <span>
                {progress.stage === 'downloading' ? 'Downloading' : progress.stage === 'extracting' ? 'Extracting' : 'Verifying'} {VARIANT_LABEL[progress.variant]}…
              </span>
              <span className="tabular-nums">
                {formatBytes(progress.receivedBytes)} / {formatBytes(progress.totalBytes)}
              </span>
            </div>
            <Progress value={progress.totalBytes ? (progress.receivedBytes / progress.totalBytes) * 100 : 0} />
          </div>
        )}
        {release?.assets.map((a) => (
          <div key={a.variant} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13.5px]">
                {VARIANT_LABEL[a.variant]}
                {release.recommended === a.variant && <Badge tone="brand">Recommended for your GPU</Badge>}
              </div>
              <div className="text-[12px] text-muted-foreground">
                {a.name} · {formatBytes(a.sizeBytes + (a.cudartSizeBytes ?? 0))}
                {a.cudartName ? ' (includes CUDA runtime)' : ''}
              </div>
            </div>
            <Button size="sm" variant={release.recommended === a.variant ? 'primary' : 'outline'} disabled={!!progress} onClick={() => void install(a.variant)}>
              Install
            </Button>
          </div>
        ))}
      </Card>
    </>
  );
}

function ConnectionRow({ config, status }: { config: ProviderConfig; status?: ProviderStatus }) {
  const qc = useQueryClient();
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [name, setName] = useState(config.name);
  const [apiKey, setApiKey] = useState('');
  const dirty = baseUrl !== config.baseUrl || apiKey !== '' || name !== config.name;
  const save = async (patch: Partial<{ enabled: boolean }> = {}) => {
    try {
      await invoke('providers:save', { id: config.id, kind: config.kind, name, baseUrl, apiKey: apiKey || undefined, enabled: patch.enabled ?? config.enabled });
      setApiKey('');
      await qc.invalidateQueries({ queryKey: keys.providerConfigs });
      await qc.invalidateQueries({ queryKey: keys.providers });
      await qc.invalidateQueries({ queryKey: keys.models });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };
  const needsKey = config.kind === 'unsloth' || config.kind === 'openai' || config.kind === 'lmstudio';
  return (
    <div className="py-4">
      <div className="flex items-center gap-2">
        <ProviderStatusDot state={status?.state} />
        {config.builtin ? <span className="text-[14px] font-medium">{config.name}</span> : <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 w-56" />}
        <span className="text-[12px] text-muted-foreground">{status ? (status.state === 'online' ? `Connected${status.version ? ` · ${status.version}` : ''}` : status.message ?? status.state) : ''}</span>
        <div className="flex-1" />
        <Switch checked={config.enabled} onCheckedChange={(enabled) => void save({ enabled })} label="Enabled" />
      </div>
      <div className="mt-2.5 flex gap-2">
        <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="flex-1" />
        {needsKey && <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={config.hasApiKey ? 'API key saved' : config.kind === 'unsloth' ? 'sk-unsloth-…' : 'API key (optional)'} className="w-56" />}
        <Button variant="primary" disabled={!dirty} onClick={() => void save()}>
          Save
        </Button>
        {!config.builtin && (
          <Button variant="ghost" onClick={() => void invoke('providers:delete', config.id).then(() => qc.invalidateQueries({ queryKey: keys.providerConfigs }))}>
            <Trash className="size-4" />
          </Button>
        )}
      </div>
      {config.kind === 'unsloth' && status?.state !== 'online' && (
        <div className="mt-2 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          {status?.state === 'offline' && (
            <Button size="sm" variant="outline" onClick={() => void invoke('providers:startUnsloth').then(() => toast('Starting Unsloth Studio…', { description: 'This can take a minute the first time.' }))}>
              Start Unsloth Studio
            </Button>
          )}
          <span>Create an API key in Unsloth Studio → Settings → API, then paste it here.</span>
        </div>
      )}
      {config.kind === 'lmstudio' && status?.state === 'offline' && <div className="mt-2 text-[12.5px] text-muted-foreground">In LM Studio open the Developer tab and start the server on port 1234.</div>}
    </div>
  );
}

function Connections() {
  const qc = useQueryClient();
  const { data: configs = [] } = useProviderConfigs();
  const { data: statuses = [] } = useProviders();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', baseUrl: 'http://127.0.0.1:8000', apiKey: '' });
  return (
    <Card
      title="Connections"
      description="Cellar talks to these apps over their local APIs. Models from every running connection appear in the model picker."
      actions={
        <Button size="sm" variant="ghost" onClick={() => void invoke('providers:status', true).then((s) => qc.setQueryData(keys.providers, s))}>
          <RefreshCw className="size-3.5" /> Check again
        </Button>
      }
    >
      {configs.map((c) => (
        <ConnectionRow key={c.id} config={c} status={statuses.find((s) => s.id === c.id)} />
      ))}
      <div className="py-4">
        {adding ? (
          <div className="space-y-2">
            <div className="text-[13.5px] font-medium">Add an OpenAI-compatible server</div>
            <div className="flex gap-2">
              <Input placeholder="Name (e.g. vLLM)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-48" />
              <Input placeholder="http://127.0.0.1:8000" value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} className="flex-1" />
              <Input type="password" placeholder="API key (optional)" value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} className="w-48" />
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={async () => {
                  try {
                    await invoke('providers:save', { kind: 'openai', name: draft.name, baseUrl: draft.baseUrl, apiKey: draft.apiKey || undefined, enabled: true });
                    setAdding(false);
                    setDraft({ name: '', baseUrl: 'http://127.0.0.1:8000', apiKey: '' });
                    await qc.invalidateQueries({ queryKey: keys.providerConfigs });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err));
                  }
                }}
              >
                Add connection
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> Add OpenAI-compatible server
          </Button>
        )}
      </div>
    </Card>
  );
}

function Hardware() {
  const qc = useQueryClient();
  const { data: hw, isFetching } = useHardware();
  return (
    <Card
      title="This computer"
      actions={
        <Button size="sm" variant="ghost" onClick={() => void invoke('system:hardware', true).then((h) => qc.setQueryData(keys.hardware, h))}>
          <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} /> Refresh
        </Button>
      }
    >
      {!hw ? (
        <div className="py-4">
          <Spinner />
        </div>
      ) : (
        <>
          {hw.gpus.length === 0 && <Field label="GPU">No dedicated GPU detected</Field>}
          {hw.gpus.map((g) => (
            <Field key={g.index} label={`GPU ${g.index}`} description={[g.driverVersion && `Driver ${g.driverVersion}`, g.computeCapability && `Compute ${g.computeCapability}`].filter(Boolean).join(' · ')}>
              <div className="text-right text-[13px]">
                <div>{g.name}</div>
                <div className="text-muted-foreground">
                  {formatBytes(g.vramTotalBytes)} VRAM{g.vramFreeBytes !== undefined ? ` · ${formatBytes(g.vramFreeBytes)} free` : ''}
                </div>
              </div>
            </Field>
          ))}
          <Field label="CPU">
            <span className="text-[13px]">
              {hw.cpu.brand} · {hw.cpu.physicalCores} cores / {hw.cpu.threads} threads
            </span>
          </Field>
          <Field label="Memory">
            <span className="text-[13px]">
              {formatBytes(hw.ramTotalBytes)} · {formatBytes(hw.ramFreeBytes)} available
            </span>
          </Field>
          <Field label="System">
            <span className="text-[13px]">{hw.os}</span>
          </Field>
        </>
      )}
    </Card>
  );
}

function DataSection() {
  const { data: info } = useAppInfo();
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <>
      <Card title="Where your data lives" description="Everything stays on this computer. Cellar never sends your chats anywhere.">
        {info && (
          <>
            <Field label="Chats, projects and settings" description={info.userDataDir}>
              <Button size="sm" variant="outline" onClick={() => void invoke('system:showInFolder', info.userDataDir)}>
                Open
              </Button>
            </Field>
            <Field label="Downloaded models" description={info.modelsDir}>
              <Button size="sm" variant="outline" onClick={() => void invoke('system:showInFolder', info.modelsDir)}>
                Open
              </Button>
            </Field>
            <Field label="Logs" description={info.logsDir}>
              <Button size="sm" variant="outline" onClick={() => void invoke('system:showInFolder', info.logsDir)}>
                Open
              </Button>
            </Field>
          </>
        )}
      </Card>
      <Card title="Danger zone">
        <Field label="Delete all chats" description="Removes every conversation and its artifacts. Projects and models are kept.">
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm('Delete all chats? This cannot be undone.')) return;
              const all = await invoke('chat:list', { limit: 100_000 });
              await invoke('chat:delete', all.map((c) => c.id));
              await qc.invalidateQueries();
              toast.success('All chats deleted');
              void navigate({ to: '/' });
            }}
          >
            Delete all chats
          </Button>
        </Field>
      </Card>
    </>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ['New chat', 'Ctrl+N'],
  ['New incognito chat', 'Ctrl+Shift+N'],
  ['Search', 'Ctrl+K'],
  ['Toggle sidebar', 'Ctrl+B'],
  ['Settings', 'Ctrl+,'],
  ['My models', 'Ctrl+Shift+M'],
  ['Discover models', 'Ctrl+Shift+D'],
  ['Stop generating', 'Esc'],
  ['New line in message', 'Shift+Enter'],
  ['Zoom in / out / reset', 'Ctrl+= / Ctrl+- / Ctrl+0'],
];

function About() {
  const { data: info } = useAppInfo();
  return (
    <Card>
      <div className="flex items-center gap-4 py-5">
        <CellarMark className="size-12" />
        <div>
          <div className="font-serif text-[24px]">Cellar</div>
          <div className="text-[13px] text-muted-foreground">
            Version {info?.version} · Milestone 2 {info?.isDev ? '· development build' : ''}
          </div>
        </div>
      </div>
      <p className="py-4 text-[13.5px] leading-relaxed text-muted-foreground">
        A Claude Desktop-style home for local models. Chat and Cowork run on llama.cpp, Ollama, LM Studio, Unsloth Studio or any OpenAI-compatible server. Code, Scheduled tasks and Customize are planned for upcoming milestones.
      </p>
    </Card>
  );
}

export function SettingsPage() {
  const { section } = useParams({ from: '/settings/$section' });
  const content: Record<string, ReactNode> = {
    general: <General />,
    appearance: <Appearance />,
    cowork: <Cowork />,
    code: <Code />,
    models: <Models />,
    engines: <Engines />,
    connections: <Connections />,
    hardware: <Hardware />,
    data: <DataSection />,
    shortcuts: (
      <Card title="Keyboard shortcuts">
        {SHORTCUTS.map(([label, keysText]) => (
          <Field key={label} label={label}>
            <span className="flex gap-1">
              {keysText.split(' / ').map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </Field>
        ))}
      </Card>
    ),
    about: <About />,
  };
  return (
    <div className="flex h-full pt-9">
      <nav className="w-56 shrink-0 px-3 pt-6">
        <h1 className="mb-4 px-2 font-serif text-[26px]">Settings</h1>
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            to="/settings/$section"
            params={{ section: s.id }}
            className={cn('flex h-8 items-center rounded-md px-2.5 text-[14px] text-fg-2 hover:bg-hover hover:text-foreground', section === s.id && 'bg-selected text-foreground hover:bg-selected')}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="max-w-[760px] px-8 pt-[70px] pb-16">{content[section] ?? content.general}</div>
      </div>
    </div>
  );
}
