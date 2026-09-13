import { ArrowDownToLine, FolderOpen, Pause, Play, RotateCcw, X } from 'lucide-react';
import type { DownloadJob } from '@shared/types/hub';
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/menu';
import { Badge, EmptyState, Progress, Tip } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { useDownloads } from '@/lib/queries';
import { cn, formatBytes, formatDuration } from '@/lib/utils';

const TARGET_LABEL = { cellar: 'llama.cpp', ollama: 'Ollama', lmstudio: 'LM Studio' } as const;

export function DownloadRow({ job }: { job: DownloadJob }) {
  const pct = job.totalBytes ? (job.receivedBytes / job.totalBytes) * 100 : 0;
  const active = job.status === 'downloading' || job.status === 'queued' || job.status === 'verifying';
  return (
    <div className="rounded-lg px-2.5 py-2 hover:bg-hover">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-foreground">{job.repoId.split('/')[1] ?? job.repoId}</div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span>{job.label}</span>
            <span>·</span>
            <span>{TARGET_LABEL[job.target]}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          {job.status === 'downloading' && job.target === 'cellar' && (
            <Tip label="Pause">
              <button className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground" onClick={() => void invoke('downloads:pause', job.id)}>
                <Pause className="size-3.5" />
              </button>
            </Tip>
          )}
          {(job.status === 'paused' || job.status === 'error') && (
            <Tip label={job.status === 'error' ? 'Retry' : 'Resume'}>
              <button className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground" onClick={() => void invoke('downloads:resume', job.id)}>
                {job.status === 'error' ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
              </button>
            </Tip>
          )}
          {job.status === 'completed' && job.destDir && (
            <Tip label="Show in folder">
              <button className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground" onClick={() => void invoke('system:showInFolder', job.destDir!)}>
                <FolderOpen className="size-3.5" />
              </button>
            </Tip>
          )}
          {(active || job.status === 'paused') && (
            <Tip label="Cancel">
              <button className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-danger" onClick={() => void invoke('downloads:cancel', job.id)}>
                <X className="size-3.5" />
              </button>
            </Tip>
          )}
        </div>
      </div>
      {job.status !== 'completed' && job.status !== 'canceled' && (
        <>
          <Progress value={pct} className="mt-1.5" tone={job.status === 'error' ? 'danger' : job.status === 'paused' ? 'muted' : 'brand'} />
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>
              {formatBytes(job.receivedBytes)} / {job.totalBytes ? formatBytes(job.totalBytes) : '…'}
            </span>
            <span>
              {job.status === 'downloading' && job.speedBps > 0 ? `${formatBytes(job.speedBps)}/s · ${formatDuration(job.etaSeconds)} left` : job.status}
            </span>
          </div>
        </>
      )}
      {job.status === 'completed' && <Badge tone="success" className="mt-1">Downloaded</Badge>}
      {job.status === 'canceled' && <Badge className="mt-1">Canceled</Badge>}
      {job.error && <div className="mt-1 text-[11.5px] text-danger">{job.error}</div>}
    </div>
  );
}

export function DownloadsButton() {
  const { data: jobs = [] } = useDownloads();
  const active = jobs.filter((j) => ['downloading', 'queued', 'verifying'].includes(j.status));
  const hasFinished = jobs.some((j) => ['completed', 'canceled', 'error'].includes(j.status));
  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <button aria-label="Downloads" className="no-drag relative flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground">
          <ArrowDownToLine className="size-4" strokeWidth={1.75} />
          {active.length > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand" />}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[360px] p-1.5">
        <div className="flex items-center justify-between px-2.5 pt-1 pb-2">
          <span className="text-[13px] font-medium">Downloads</span>
          {hasFinished && (
            <button className="text-[12px] text-muted-foreground hover:text-foreground" onClick={() => void invoke('downloads:clear')}>
              Clear finished
            </button>
          )}
        </div>
        <div className={cn('max-h-[420px] overflow-y-auto', jobs.length === 0 && 'py-2')}>
          {jobs.length === 0 ? (
            <EmptyState className="py-6" title="No downloads" description="Models you download from Discover appear here." />
          ) : (
            jobs.map((job) => <DownloadRow key={job.id} job={job} />)
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
