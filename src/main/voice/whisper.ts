/**
 * Voice dictation with whisper.cpp: Cellar downloads an official ggml-org/whisper.cpp Windows build and a
 * ggml model from Hugging Face, and transcribes 16 kHz WAV recordings from the mic button with whisper-cli.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import extractZip from 'extract-zip';
import type { TranscriptionResult, VoiceStatus, WhisperModelInfo, WhisperRuntime, WhisperVariant } from '@shared/types/voice';
import { downloadFile } from '../lib/download';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage, fetchWithTimeout, newId, safeJsonParse, throttle } from '../lib/util';
import { settings } from '../services/settings';
import { detectHardware, recommendedWhisperVariant } from '../system/hardware';
import { paths } from '../system/paths';

const log = logger('voice');
const CLI_NAMES = ['whisper-cli.exe', 'whisper-cli', 'main.exe'];

export const WHISPER_MODELS: Array<Omit<WhisperModelInfo, 'installed'>> = [
  { id: 'ggml-tiny.bin', label: 'Tiny', sizeBytes: 77_691_713, multilingual: true, description: 'Fastest, rough accuracy. Any language.' },
  { id: 'ggml-base.bin', label: 'Base', sizeBytes: 147_951_465, multilingual: true, description: 'Fast and good for clear speech. Any language. Recommended.' },
  { id: 'ggml-base.en.bin', label: 'Base (English)', sizeBytes: 147_964_211, multilingual: false, description: 'Like Base, a little more accurate for English only.' },
  { id: 'ggml-small.bin', label: 'Small', sizeBytes: 487_601_967, multilingual: true, description: 'Noticeably better, still quick on a modern CPU. Any language.' },
  { id: 'ggml-large-v3-turbo-q5_0.bin', label: 'Large v3 Turbo (Q5)', sizeBytes: 574_041_195, multilingual: true, description: 'Best accuracy; slower on CPU. Any language.' },
];

/**
 * Windows x64 assets in the official ggml-org/whisper.cpp releases. CUDA 13 is what Blackwell
 * (RTX 50 series) needs; the project did not ship an x64 CUDA 13 build for a long time, so Cellar
 * asks GitHub which of these actually exist in a recent release instead of assuming.
 */
const VARIANT_ASSETS: Record<WhisperVariant, RegExp> = {
  cpu: /^whisper-bin-x64\.zip$/,
  blas: /^whisper-blas-bin-x64\.zip$/,
  'cuda-12': /^whisper-cublas-12[\d.]*-bin-x64\.zip$/,
  'cuda-13': /^whisper-cublas-13[\d.]*-bin-x64\.zip$/,
};

const ALL_VARIANTS = Object.keys(VARIANT_ASSETS) as WhisperVariant[];

interface RuntimeRecord {
  variant: WhisperVariant;
  tag: string;
}

interface ReleaseInfo {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string; size: number }>;
}

/** GitHub's release list, cached: `status()` is called often and must not hit the network each time. */
const RELEASES_TTL_MS = 6 * 60 * 60 * 1000;
let releaseCache: { at: number; releases: ReleaseInfo[] } | null = null;
let releasesInFlight: Promise<ReleaseInfo[]> | null = null;

async function fetchReleases(): Promise<ReleaseInfo[]> {
  const res = await fetchWithTimeout('https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=30', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Cellar' },
    timeoutMs: 15_000,
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
  const releases = (await res.json()) as ReleaseInfo[];
  releaseCache = { at: Date.now(), releases };
  return releases;
}

/** Cached releases, refreshing in the background when stale. `null` when nothing has been fetched yet. */
function releases(options: { refresh?: boolean } = {}): ReleaseInfo[] | null {
  const stale = !releaseCache || Date.now() - releaseCache.at > RELEASES_TTL_MS;
  if ((stale || options.refresh) && !releasesInFlight) {
    releasesInFlight = fetchReleases()
      .catch((err) => {
        log.warn('could not list whisper.cpp releases', errorMessage(err));
        return releaseCache?.releases ?? [];
      })
      .finally(() => {
        releasesInFlight = null;
      });
  }
  return releaseCache?.releases ?? null;
}

/** The newest release that ships this build, or null when none of the recent ones do. */
function newestWith(variant: WhisperVariant, list: ReleaseInfo[]): { release: ReleaseInfo; asset: ReleaseInfo['assets'][number] } | null {
  for (const release of list) {
    const asset = release.assets.find((a) => VARIANT_ASSETS[variant].test(a.name));
    if (asset) return { release, asset };
  }
  return null;
}

const runtimeRoot = () => join(paths().whisper, 'runtime');
const modelsDir = () => join(paths().whisper, 'models');
const recordFile = () => join(runtimeRoot(), 'runtime.json');

async function findCli(dir: string, depth = 3): Promise<string | null> {
  for (const name of CLI_NAMES) if (existsSync(join(dir, name))) return join(dir, name);
  if (depth <= 0) return null;
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const found = await findCli(join(dir, entry.name), depth - 1);
    if (found) return found;
  }
  return null;
}

const installing = new Set<string>();

function progressEmitter(kind: 'runtime' | 'model', id: string) {
  return throttle((stage: 'downloading' | 'extracting' | 'done' | 'error', receivedBytes: number, totalBytes: number, message?: string) => {
    bus.emit('voice:progress', { kind, id, stage, receivedBytes, totalBytes, message });
  }, 200);
}

class VoiceService {
  async runtime(): Promise<WhisperRuntime | null> {
    const record = safeJsonParse<RuntimeRecord | null>(await readFile(recordFile(), 'utf8').catch(() => ''), null);
    if (!record) return null;
    const dir = join(runtimeRoot(), record.variant);
    const cliPath = await findCli(dir);
    return cliPath ? { variant: record.variant, tag: record.tag, dir, cliPath } : null;
  }

  async status(): Promise<VoiceStatus> {
    const runtime = await this.runtime();
    const app = settings.get();
    const models = WHISPER_MODELS.map((m) => ({ ...m, installed: existsSync(join(modelsDir(), m.id)) }));
    const model = app.voiceModel;
    // Kicks off a background refresh when stale; whatever is cached answers this call.
    const list = releases();
    const availableVariants = list ? ALL_VARIANTS.filter((v) => !!newestWith(v, list)) : ALL_VARIANTS;
    const recommendedVariant = recommendedWhisperVariant(await detectHardware(), availableVariants);
    const newest = runtime && list ? newestWith(runtime.variant, list) : null;
    return {
      runtime: runtime && newest && newest.release.tag_name !== runtime.tag ? { ...runtime, updateAvailable: newest.release.tag_name } : runtime,
      models,
      model,
      language: app.voiceLanguage,
      ready: !!runtime && existsSync(join(modelsDir(), model)),
      recommendedVariant,
      availableVariants,
      latestTag: list?.[0]?.tag_name,
    };
  }

  async installRuntime(variant: WhisperVariant): Promise<WhisperRuntime> {
    const key = `runtime:${variant}`;
    if (installing.has(key)) throw new Error('This build is already being installed.');
    installing.add(key);
    const progress = progressEmitter('runtime', variant);
    try {
      // Always look at the live list: installing is exactly when a stale cache would be wrong.
      const list = await fetchReleases();
      const found = newestWith(variant, list);
      if (!found) {
        throw new Error(
          variant === 'cuda-13'
            ? 'whisper.cpp does not currently publish a Windows x64 CUDA 13 build. Install the CPU build instead — on an RTX 50 series card it is faster than the CUDA 12 one anyway.'
            : 'No whisper.cpp release with Windows binaries was found.',
        );
      }
      const { asset } = found;
      const tag = found.release.tag_name;
      const zip = join(paths().tmp, asset.name);
      await downloadFile({ url: asset.browser_download_url, dest: zip, expectedSize: asset.size, onProgress: (r) => progress('downloading', r, asset.size) });
      progress('extracting', asset.size, asset.size);
      progress.flush();
      const target = join(runtimeRoot(), variant);
      await rm(target, { recursive: true, force: true });
      await extractZip(zip, { dir: target });
      await rm(zip, { force: true });
      const cliPath = await findCli(target);
      if (!cliPath) throw new Error('The download did not contain whisper-cli.');
      await mkdir(runtimeRoot(), { recursive: true });
      await writeFile(recordFile(), JSON.stringify({ variant, tag } satisfies RuntimeRecord), 'utf8');
      // Keep only the build in use.
      for (const other of Object.keys(VARIANT_ASSETS)) if (other !== variant) await rm(join(runtimeRoot(), other), { recursive: true, force: true }).catch(() => undefined);
      progress('done', asset.size, asset.size, tag);
      progress.flush();
      return { variant, tag, dir: target, cliPath };
    } catch (err) {
      progress('error', 0, 0, errorMessage(err));
      progress.flush();
      throw err;
    } finally {
      installing.delete(key);
    }
  }

  async downloadModel(id: string): Promise<void> {
    const model = WHISPER_MODELS.find((m) => m.id === id);
    if (!model) throw new Error('Unknown voice model.');
    const key = `model:${id}`;
    if (installing.has(key)) throw new Error('This model is already downloading.');
    installing.add(key);
    const progress = progressEmitter('model', id);
    try {
      await downloadFile({
        url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${id}`,
        dest: join(modelsDir(), id),
        onProgress: (received, total) => progress('downloading', received, total || model.sizeBytes),
      });
      settings.update({ voiceModel: id });
      progress('done', model.sizeBytes, model.sizeBytes);
      progress.flush();
    } catch (err) {
      progress('error', 0, 0, errorMessage(err));
      progress.flush();
      throw err;
    } finally {
      installing.delete(key);
    }
  }

  async deleteModel(id: string): Promise<void> {
    if (!WHISPER_MODELS.some((m) => m.id === id)) throw new Error('Unknown voice model.');
    await rm(join(modelsDir(), id), { force: true });
  }

  /**
   * Transcribe 16 kHz mono 16-bit WAV bytes. `partial` is used for the live preview while the mic
   * is still recording: greedy decoding (beam/best-of 1) instead of the default beam search trades
   * some accuracy for speed and steadier latency on repeated calls against a growing clip. The
   * final call on stop always uses full quality regardless of what the preview showed.
   */
  async transcribe(wav: Uint8Array, language?: string, partial = false): Promise<TranscriptionResult> {
    const status = await this.status();
    if (!status.runtime) throw new Error('Voice dictation needs whisper.cpp. Install it in Settings → Voice.');
    const modelPath = join(modelsDir(), status.model);
    if (!existsSync(modelPath)) throw new Error('Download a voice model in Settings → Voice first.');
    if (wav.byteLength < 44 + 16000 * 2 * 0.2) return { text: '', durationMs: 0 };
    const file = join(paths().tmp, `dictation-${newId()}.wav`);
    await writeFile(file, wav);
    const lang = language ?? status.language;
    const multilingual = WHISPER_MODELS.find((m) => m.id === status.model)?.multilingual ?? true;
    const args = ['-m', modelPath, '-f', file, '-nt', '-np', '-l', multilingual ? lang || 'auto' : 'en', '-t', String(Math.max(2, Math.min(8, availableParallelism() - 1)))];
    if (partial) args.push('-bs', '1', '-bo', '1');
    const started = Date.now();
    try {
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(status.runtime!.cliPath, args, { cwd: status.runtime!.dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        const timer = setTimeout(() => child.kill(), partial ? 15_000 : 5 * 60_000);
        child.stdout.on('data', (c: Buffer) => out.push(c));
        child.stderr.on('data', (c: Buffer) => err.push(c));
        child.on('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve(Buffer.concat(out).toString('utf8'));
          else reject(new Error(`whisper.cpp failed (exit code ${code}): ${Buffer.concat(err).toString('utf8').trim().split('\n').slice(-3).join(' ')}`));
        });
      });
      return { text: cleanTranscript(output), durationMs: Date.now() - started };
    } catch (err) {
      log.warn('transcription failed', errorMessage(err));
      throw err;
    } finally {
      await rm(file, { force: true }).catch(() => undefined);
    }
  }
}

/** whisper-cli output without timestamps → one paragraph; drops the "[BLANK_AUDIO]"-style markers. */
export function cleanTranscript(output: string): string {
  return output
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\[[\d:.,\s>-]+\]\s*/, '').trim())
    .filter((line) => line && !/^[[(](blank_audio|silence|music|no speech|inaudible|applause|laughter)[\])]$/i.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const voice = new VoiceService();
