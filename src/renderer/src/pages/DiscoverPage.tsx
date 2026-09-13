import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ChevronDown, ExternalLink, Heart, Lock, Search, Telescope } from 'lucide-react';
import { toast } from 'sonner';
import type { DownloadTarget, HfSort, QuantFit, QuantOption } from '@shared/types/hub';
import { Markdown } from '@/components/chat/Markdown';
import { FitBadge } from '@/components/models/bits';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/menu';
import { Badge, EmptyState, Spinner } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { keys, useDownloads, useProviders } from '@/lib/queries';
import { cn, formatBytes, formatCompact, formatContext, relativeTime } from '@/lib/utils';

const PUBLISHERS = ['unsloth', 'ggml-org', 'bartowski', 'lmstudio-community', 'mradermacher'];

function QuantRow({ repoId, quant, hasMmproj, recommended, fit, fitLoading }: { repoId: string; quant: QuantOption; hasMmproj: boolean; recommended: boolean; fit?: QuantFit; fitLoading: boolean }) {
  const isLoading = fitLoading;
  const { data: providers = [] } = useProviders();
  const { data: jobs = [] } = useDownloads();
  const job = jobs.find((j) => j.repoId === repoId && j.label === quant.label && ['queued', 'downloading', 'verifying', 'paused'].includes(j.status));
  const online = (kind: string) => providers.find((p) => p.kind === kind)?.state === 'online';

  const start = async (target: DownloadTarget) => {
    try {
      await invoke('downloads:start', { repoId, quantLabel: quant.label, target, includeMmproj: hasMmproj });
      toast.success('Download started', { description: `${repoId} · ${quant.label}` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <tr className={cn('border-t border-divider', recommended && 'bg-brand/5')}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12.5px] text-foreground">{quant.label}</span>
          {quant.isDynamic && <Badge tone="brand">Unsloth Dynamic</Badge>}
          {recommended && <Badge tone="success">Best fit</Badge>}
        </div>
        {quant.files.length > 1 && <div className="text-[11px] text-muted-foreground">{quant.files.length} parts</div>}
      </td>
      <td className="px-3 py-2 text-fg-2 tabular-nums">{formatBytes(quant.sizeBytes)}</td>
      <td className="px-3 py-2">{isLoading ? <Spinner className="size-3.5" /> : fit ? <FitBadge fit={fit.fit} estimate={fit.estimate} /> : null}</td>
      <td className="px-3 py-2 text-right">
        {job ? (
          <span className="text-[12px] text-muted-foreground tabular-nums">
            {job.status === 'paused' ? 'Paused' : `${job.totalBytes ? Math.round((job.receivedBytes / job.totalBytes) * 100) : 0}%`}
          </span>
        ) : (
          <div className="inline-flex">
            <Button size="sm" variant="secondary" className="rounded-r-none" onClick={() => void start('cellar')}>
              <ArrowDownToLine className="size-3.5" /> Download
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <Button size="sm" variant="secondary" className="rounded-l-none border-l border-background/40 px-1.5" aria-label="Download to…">
                  <ChevronDown className="size-3.5" />
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuLabel>Download to</MenuLabel>
                <MenuItem onSelect={() => void start('cellar')}>Cellar · llama.cpp</MenuItem>
                <MenuItem disabled={!online('ollama')} onSelect={() => void start('ollama')}>
                  Ollama{online('ollama') ? '' : ' (not running)'}
                </MenuItem>
                <MenuItem disabled={!online('lmstudio')} onSelect={() => void start('lmstudio')}>
                  LM Studio{online('lmstudio') ? '' : ' (not running)'}
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        )}
      </td>
    </tr>
  );
}

function RepoDetail({ repoId }: { repoId: string }) {
  const { data: repo, isLoading, error } = useQuery({ queryKey: keys.hubRepo(repoId), queryFn: () => invoke('hub:repo', repoId), staleTime: 5 * 60_000 });
  const { data: readme } = useQuery({ queryKey: keys.hubReadme(repoId), queryFn: () => invoke('hub:readme', repoId), staleTime: 30 * 60_000 });
  const [showReadme, setShowReadme] = useState(false);
  const fitQueries = useQueries({
    queries: (repo?.quants ?? []).map((q) => ({
      queryKey: keys.quantFit(repoId, q.label),
      queryFn: () => invoke('hub:quantFit', repoId, q.label),
      staleTime: Infinity,
    })),
  });
  const fits = { data: fitQueries.map((q) => q.data).filter((f): f is QuantFit => !!f) };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (error || !repo) return <EmptyState title="Could not load this repository" description={error instanceof Error ? error.message : undefined} />;

  const fullFits = (fits.data ?? []).filter((f) => f.fit === 'full');
  const bestFull = [...fullFits].sort((a, b) => (b.estimate?.weightsBytes ?? 0) - (a.estimate?.weightsBytes ?? 0))[0];
  const recommended = bestFull?.label ?? (fits.data ?? []).filter((f) => f.fit === 'partial').sort((a, b) => (a.estimate?.cpuBytes ?? 0) - (b.estimate?.cpuBytes ?? 0))[0]?.label;
  const tags = repo.tags.filter((t) => !t.startsWith('base_model:') && !t.startsWith('region:') && !['gguf', 'endpoints_compatible'].includes(t)).slice(0, 8);

  return (
    <div className="px-8 py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[12.5px] text-muted-foreground">{repo.author}</div>
          <h2 className="mt-0.5 truncate text-[22px] font-semibold">{repo.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12.5px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <ArrowDownToLine className="size-3.5" /> {formatCompact(repo.downloads)}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="size-3.5" /> {formatCompact(repo.likes)}
            </span>
            {repo.lastModified && <span>Updated {relativeTime(repo.lastModified)}</span>}
            {repo.architecture && <span>{repo.architecture}</span>}
            {repo.contextLength && <span>{formatContext(repo.contextLength)} context</span>}
            {repo.license && <span>{repo.license}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {repo.gated && (
              <Badge tone="warning">
                <Lock className="size-3" /> Gated
              </Badge>
            )}
            {repo.mmproj.length > 0 && <Badge tone="brand">Vision</Badge>}
            {tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void invoke('system:openExternal', `https://huggingface.co/${repo.id}`)}>
          <ExternalLink className="size-3.5" /> Hugging Face
        </Button>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-divider">
        <table className="w-full text-[13px]">
          <thead className="bg-card text-left text-[11.5px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Quantization</th>
              <th className="w-28 px-3 py-2 font-medium">Size</th>
              <th className="w-48 px-3 py-2 font-medium">On this PC</th>
              <th className="w-44 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {repo.quants.map((q, i) => (
              <QuantRow
                key={q.label}
                repoId={repo.id}
                quant={q}
                hasMmproj={repo.mmproj.length > 0}
                recommended={q.label === recommended}
                fit={fitQueries[i]?.data}
                fitLoading={!!fitQueries[i]?.isLoading}
              />
            ))}
          </tbody>
        </table>
        {repo.quants.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-muted-foreground">No GGUF files in this repository.</div>}
      </div>
      {repo.mmproj.length > 0 && <p className="mt-2 text-[12px] text-muted-foreground">The vision projector ({repo.mmproj[0].path.split('/').pop()}) is downloaded automatically with llama.cpp downloads.</p>}

      {readme && (
        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[14px] font-medium">Model card</h3>
            <button className="text-[12.5px] text-muted-foreground hover:text-foreground" onClick={() => setShowReadme((s) => !s)}>
              {showReadme ? 'Collapse' : 'Expand'}
            </button>
          </div>
          <div className={cn('relative overflow-hidden rounded-xl border border-divider bg-card px-6 py-4', !showReadme && 'max-h-80')}>
            <Markdown content={readme} artifacts={false} className="text-[14.5px]" />
            {!showReadme && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent" />}
          </div>
        </div>
      )}
    </div>
  );
}

export function DiscoverPage() {
  const search = useSearch({ from: '/discover' });
  const navigate = useNavigate();
  const [text, setText] = useState(search.q ?? '');
  const [query, setQuery] = useState(search.q ?? '');
  const [author, setAuthor] = useState<string | undefined>(search.author ?? 'unsloth');
  const [sort, setSort] = useState<HfSort>('trendingScore');

  useEffect(() => {
    const t = setTimeout(() => setQuery(text), 350);
    return () => clearTimeout(t);
  }, [text]);

  const { data: results = [], isLoading, error } = useQuery({
    queryKey: keys.hubSearch({ search: query, author, sort }),
    queryFn: () => invoke('hub:search', { search: query, author, sort, limit: 40 }),
    staleTime: 5 * 60_000,
  });

  const selectRepo = (repo: string) => void navigate({ to: '/discover', search: { ...search, repo }, replace: true });

  return (
    <div className="flex h-full min-w-0 pt-9">
      <div className="flex w-[360px] shrink-0 flex-col border-r border-divider">
        <div className="space-y-2.5 px-4 pt-4 pb-3">
          <h1 className="font-serif text-[26px]">Discover</h1>
          <div className="relative">
            <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search GGUF models on Hugging Face" className="pl-8" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setAuthor(undefined)} className={cn('h-6 rounded-full border border-composer-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground', !author && 'border-brand/60 text-foreground')}>
              All
            </button>
            {PUBLISHERS.map((p) => (
              <button key={p} onClick={() => setAuthor(author === p ? undefined : p)} className={cn('h-6 rounded-full border border-composer-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground', author === p && 'border-brand/60 text-foreground')}>
                {p}
              </button>
            ))}
          </div>
          <Select
            value={sort}
            onChange={setSort}
            className="w-full"
            options={[
              { value: 'trendingScore', label: 'Trending' },
              { value: 'downloads', label: 'Most downloads' },
              { value: 'likes', label: 'Most likes' },
              { value: 'lastModified', label: 'Recently updated' },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}
          {error && <div className="px-3 py-4 text-[13px] text-danger">{error instanceof Error ? error.message : String(error)}</div>}
          {!isLoading && results.length === 0 && !error && <div className="px-3 py-4 text-[13px] text-muted-foreground">No GGUF repositories match.</div>}
          {results.map((r) => (
            <button key={r.id} onClick={() => selectRepo(r.id)} className={cn('block w-full rounded-lg px-3 py-2 text-left hover:bg-hover', search.repo === r.id && 'bg-selected hover:bg-selected')}>
              <div className="truncate text-[13.5px] text-foreground">{r.name}</div>
              <div className="mt-0.5 flex items-center gap-2.5 text-[11.5px] text-muted-foreground">
                <span className="truncate">{r.author}</span>
                <span className="flex items-center gap-0.5">
                  <ArrowDownToLine className="size-3" />
                  {formatCompact(r.downloads)}
                </span>
                <span className="flex items-center gap-0.5">
                  <Heart className="size-3" />
                  {formatCompact(r.likes)}
                </span>
                {r.pipelineTag && /image|any-to-any/.test(r.pipelineTag) && <span className="text-brand">vision</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {search.repo ? (
          <RepoDetail key={search.repo} repoId={search.repo} />
        ) : (
          <EmptyState
            className="h-full"
            icon={<Telescope className="size-5" />}
            title="Find a model to run locally"
            description="Pick a repository to see its quantizations. Cellar reads each GGUF header to estimate whether it fits your GPU before you download."
          />
        )}
      </div>
    </div>
  );
}
