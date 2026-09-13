import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DownloadFileState, DownloadJob, DownloadStatus, StartDownloadInput } from '@shared/types/hub';
import { all, run } from '../db/client';
import { downloadFile } from '../lib/download';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage, newId, safeJsonParse, sleep, throttle } from '../lib/util';
import { localModels } from '../models/local-index';
import type { LmStudioProvider } from '../providers/lmstudio';
import type { OllamaProvider } from '../providers/ollama';
import { providers } from '../providers/registry';
import { settings } from '../services/settings';
import { hfHeaders, repoWithFiles, resolveUrl } from './hf-api';
import { preferredMmproj } from './quants';

const log = logger('downloads');

interface Row {
  id: string;
  repo_id: string;
  label: string;
  target: DownloadJob['target'];
  files: string;
  status: DownloadStatus;
  total_bytes: number;
  received_bytes: number;
  error: string | null;
  dest_dir: string | null;
  created_at: number;
  updated_at: number;
}

const ACTIVE: DownloadStatus[] = ['queued', 'downloading', 'verifying'];

class DownloadManager {
  private jobs = new Map<string, DownloadJob>();
  private controllers = new Map<string, AbortController>();
  private running = new Set<string>();
  private speedSamples = new Map<string, { at: number; bytes: number }>();
  private emit = throttle(() => bus.emit('downloads:changed', this.list()), 250);

  init(): void {
    for (const row of all<Row>('SELECT * FROM downloads ORDER BY created_at DESC LIMIT 200')) {
      const job: DownloadJob = {
        id: row.id,
        repoId: row.repo_id,
        label: row.label,
        target: row.target,
        files: safeJsonParse<DownloadFileState[]>(row.files, []),
        status: ACTIVE.includes(row.status) ? 'queued' : row.status,
        totalBytes: row.total_bytes,
        receivedBytes: row.received_bytes,
        speedBps: 0,
        error: row.error ?? undefined,
        destDir: row.dest_dir ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      this.jobs.set(job.id, job);
    }
    this.pump();
  }

  list(): DownloadJob[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  private persist(job: DownloadJob): void {
    job.updatedAt = Date.now();
    run(
      `INSERT INTO downloads (id, repo_id, label, target, files, status, total_bytes, received_bytes, error, dest_dir, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET files = excluded.files, status = excluded.status, total_bytes = excluded.total_bytes,
         received_bytes = excluded.received_bytes, error = excluded.error, updated_at = excluded.updated_at`,
      job.id,
      job.repoId,
      job.label,
      job.target,
      JSON.stringify(job.files),
      job.status,
      job.totalBytes,
      job.receivedBytes,
      job.error,
      job.destDir,
      job.createdAt,
      job.updatedAt,
    );
  }

  async start(input: StartDownloadInput): Promise<DownloadJob> {
    const duplicate = this.list().find(
      (j) => j.repoId === input.repoId && j.label === input.quantLabel && j.target === input.target && (ACTIVE.includes(j.status) || j.status === 'paused'),
    );
    if (duplicate) return duplicate;

    const { detail } = await repoWithFiles(input.repoId);
    const quant = detail.quants.find((q) => q.label === input.quantLabel);
    if (!quant) throw new Error(`${input.quantLabel} is not available in ${input.repoId}.`);

    const { files: treeFiles } = await repoWithFiles(input.repoId);
    const sizeOf = (path: string) => treeFiles.find((t) => t.path === path)?.size ?? 0;
    const files: DownloadFileState[] = quant.files.map((path, i) => ({ path, sizeBytes: sizeOf(path), receivedBytes: 0, sha256: quant.sha256[i], done: false }));
    let destDir: string | undefined;
    if (input.target === 'cellar') {
      destDir = join(settings.get().modelsDir, detail.author, detail.name);
      const projector = input.includeMmproj ? preferredMmproj(detail.mmproj) : undefined;
      if (projector) files.push({ path: projector.path, sizeBytes: projector.size, receivedBytes: 0, sha256: projector.sha256, done: false });
    }

    const job: DownloadJob = {
      id: newId(),
      repoId: input.repoId,
      label: input.quantLabel,
      target: input.target,
      files: input.target === 'cellar' ? files : [],
      status: 'queued',
      totalBytes: files.reduce((s, f) => s + f.sizeBytes, 0),
      receivedBytes: 0,
      speedBps: 0,
      destDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.jobs.set(job.id, job);
    this.persist(job);
    this.emit();
    this.pump();
    return job;
  }

  pause(id: string): void {
    const job = this.jobs.get(id);
    if (!job || !(ACTIVE.includes(job.status))) return;
    if (job.target !== 'cellar') throw new Error('Downloads handled by Ollama or LM Studio cannot be paused from Cellar.');
    job.status = 'paused';
    this.controllers.get(id)?.abort(new Error('paused'));
    this.persist(job);
    this.emit();
  }

  resume(id: string): void {
    const job = this.jobs.get(id);
    if (!job || !['paused', 'error'].includes(job.status)) return;
    job.status = 'queued';
    job.error = undefined;
    this.persist(job);
    this.emit();
    this.pump();
  }

  async cancel(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    const wasActive = ACTIVE.includes(job.status) || job.status === 'paused';
    job.status = 'canceled';
    this.controllers.get(id)?.abort(new Error('canceled'));
    this.persist(job);
    this.emit();
    if (wasActive && job.target === 'cellar' && job.destDir) {
      await sleep(300);
      for (const f of job.files) if (!f.done) await rm(join(job.destDir, `${f.path}.part`), { force: true });
    }
  }

  clear(): void {
    for (const job of this.list()) {
      if (['completed', 'canceled', 'error'].includes(job.status)) {
        this.jobs.delete(job.id);
        run('DELETE FROM downloads WHERE id = ?', job.id);
      }
    }
    this.emit();
  }

  private pump(): void {
    const limit = settings.get().concurrentDownloads;
    for (const job of this.list().reverse()) {
      if (this.running.size >= limit) break;
      if (job.status === 'queued' && !this.running.has(job.id)) void this.run(job);
    }
  }

  private track(job: DownloadJob): void {
    const now = Date.now();
    const prev = this.speedSamples.get(job.id);
    if (!prev) this.speedSamples.set(job.id, { at: now, bytes: job.receivedBytes });
    else if (now - prev.at >= 1000) {
      const instant = ((job.receivedBytes - prev.bytes) * 1000) / (now - prev.at);
      job.speedBps = job.speedBps ? job.speedBps * 0.6 + instant * 0.4 : instant;
      job.etaSeconds = job.speedBps > 0 && job.totalBytes > 0 ? Math.round((job.totalBytes - job.receivedBytes) / job.speedBps) : undefined;
      this.speedSamples.set(job.id, { at: now, bytes: job.receivedBytes });
    }
    this.emit();
  }

  private async run(job: DownloadJob): Promise<void> {
    this.running.add(job.id);
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    job.status = 'downloading';
    job.speedBps = 0;
    this.speedSamples.delete(job.id);
    this.persist(job);
    this.emit();
    let lastPersist = Date.now();

    try {
      if (job.target === 'cellar') await this.runCellar(job, controller.signal, () => {
        if (Date.now() - lastPersist > 3000) {
          lastPersist = Date.now();
          this.persist(job);
        }
      });
      else if (job.target === 'ollama') await this.runOllama(job, controller.signal);
      else await this.runLmStudio(job, controller.signal);
      if (controller.signal.aborted) return;
      job.status = 'completed';
      job.receivedBytes = job.totalBytes || job.receivedBytes;
      job.speedBps = 0;
      job.etaSeconds = undefined;
      if (job.target === 'cellar') void localModels.scan();
      else bus.emit('models:changed', { reason: 'download' });
    } catch (err) {
      if (!controller.signal.aborted) {
        log.error('download failed', job.repoId, job.label, err);
        job.status = 'error';
        job.error = errorMessage(err);
      }
    } finally {
      this.controllers.delete(job.id);
      this.running.delete(job.id);
      job.speedBps = 0;
      this.persist(job);
      this.emit();
      this.emit.flush();
      this.pump();
    }
  }

  private async runCellar(job: DownloadJob, signal: AbortSignal, checkpoint: () => void): Promise<void> {
    if (!job.destDir) throw new Error('Missing destination folder.');
    const doneBytes = () => job.files.reduce((s, f) => s + (f.done ? f.sizeBytes : f.receivedBytes), 0);
    for (const file of job.files) {
      if (file.done) continue;
      await downloadFile({
        url: resolveUrl(job.repoId, file.path),
        dest: join(job.destDir, file.path),
        headers: hfHeaders(),
        signal,
        expectedSha256: file.sha256,
        expectedSize: file.sizeBytes || undefined,
        onProgress: (received) => {
          file.receivedBytes = received;
          job.receivedBytes = doneBytes();
          this.track(job);
          checkpoint();
        },
      });
      file.done = true;
      file.receivedBytes = file.sizeBytes;
      job.receivedBytes = doneBytes();
      this.persist(job);
    }
  }

  private async runOllama(job: DownloadJob, signal: AbortSignal): Promise<void> {
    const ollama = providers.get('ollama') as OllamaProvider;
    const layers = new Map<string, { total: number; completed: number }>();
    for await (const progress of ollama.pull(`hf.co/${job.repoId}:${job.label}`, signal)) {
      if (progress.digest && progress.total) {
        layers.set(progress.digest, { total: progress.total, completed: progress.completed ?? 0 });
        job.totalBytes = [...layers.values()].reduce((s, l) => s + l.total, 0);
        job.receivedBytes = [...layers.values()].reduce((s, l) => s + l.completed, 0);
        this.track(job);
      }
    }
  }

  private async runLmStudio(job: DownloadJob, signal: AbortSignal): Promise<void> {
    const lms = providers.get('lmstudio') as LmStudioProvider;
    const started = await lms.startDownload(job.repoId, job.label);
    if (started.status === 'already_downloaded' || started.status === 'completed') return;
    if (!started.job_id) throw new Error('LM Studio did not return a download job.');
    job.totalBytes = started.total_size_bytes ?? 0;
    for (;;) {
      await sleep(1000, signal);
      const status = await lms.downloadStatus(started.job_id);
      job.totalBytes = status.total_size_bytes ?? job.totalBytes;
      job.receivedBytes = status.downloaded_bytes ?? job.receivedBytes;
      if (status.bytes_per_second) job.speedBps = status.bytes_per_second;
      this.track(job);
      if (status.status === 'completed' || status.status === 'already_downloaded') return;
      if (status.status === 'failed') throw new Error('LM Studio reported that the download failed.');
    }
  }
}

export const downloads = new DownloadManager();
