import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import extractZip from 'extract-zip';
import type { RuntimeDevice, RuntimeInfo, RuntimeRelease, RuntimeVariant } from '@shared/types/system';
import { all, run } from '../db/client';
import { downloadFile } from '../lib/download';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage, fetchWithTimeout, throttle } from '../lib/util';
import { settings } from '../services/settings';
import { detectHardware, recommendedVariant } from '../system/hardware';
import { paths } from '../system/paths';

const exec = promisify(execFile);
const log = logger('runtimes');
const SERVER_EXE = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';

export function parseVersionOutput(output: string): { version?: string; build?: number } {
  const line = output.split(/\r?\n/).find((l) => /^version:/i.test(l.trim()));
  if (!line) return {};
  const version = line.replace(/^version:\s*/i, '').trim();
  const build = version.match(/build (\d+)/i)?.[1] ?? version.match(/^(\d+)\b/)?.[1];
  return { version, build: build ? Number(build) : undefined };
}

export function parseDevicesOutput(output: string): RuntimeDevice[] {
  const devices: RuntimeDevice[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const m = raw.trim().match(/^([A-Za-z]+\d+):\s*(.+?)\s*\((\d+)\s*MiB,\s*(\d+)\s*MiB free\)/);
    if (m) devices.push({ id: m[1], name: m[2], totalMiB: Number(m[3]), freeMiB: Number(m[4]) });
  }
  return devices;
}

export function backendsFromFiles(files: string[]): string[] {
  const names = files.map((f) => f.toLowerCase());
  const backends: string[] = [];
  if (names.some((n) => n.startsWith('ggml-cuda'))) backends.push('CUDA');
  if (names.some((n) => n.startsWith('ggml-vulkan'))) backends.push('Vulkan');
  if (names.some((n) => n.startsWith('ggml-sycl'))) backends.push('SYCL');
  if (names.some((n) => n.startsWith('ggml-hip') || n.startsWith('ggml-rocm'))) backends.push('ROCm');
  if (names.some((n) => n.startsWith('ggml-opencl'))) backends.push('OpenCL');
  if (names.some((n) => n.startsWith('ggml-cpu') || n === 'ggml.dll')) backends.push('CPU');
  return backends;
}

function variantOf(backends: string[], files: string[]): RuntimeVariant {
  if (backends.includes('CUDA')) {
    const cudart = files.find((f) => /^cudart64_(\d+)\.dll$/i.test(f));
    const major = cudart ? Number(cudart.match(/_(\d+)/)?.[1]) : 0;
    return major >= 13 ? 'cuda-13' : major > 0 ? 'cuda-12' : 'cuda-13';
  }
  if (backends.includes('Vulkan')) return 'vulkan';
  if (backends.includes('SYCL')) return 'sycl';
  if (backends.includes('ROCm')) return 'rocm';
  if (backends.includes('CPU')) return 'cpu';
  return 'unknown';
}

const idForDir = (dir: string) => createHash('sha1').update(dir.toLowerCase()).digest('hex').slice(0, 12);

const VARIANT_LABEL: Record<RuntimeVariant, string> = {
  'cuda-13': 'CUDA 13',
  'cuda-12': 'CUDA 12',
  vulkan: 'Vulkan',
  cpu: 'CPU',
  sycl: 'SYCL',
  rocm: 'ROCm',
  unknown: 'Unknown',
};

class RuntimeManager {
  private cache: RuntimeInfo[] | null = null;
  private installing = new Set<RuntimeVariant>();

  async probe(dir: string, source: RuntimeInfo['source']): Promise<RuntimeInfo> {
    const serverPath = join(dir, SERVER_EXE);
    const files = await readdir(dir).catch(() => [] as string[]);
    const backends = backendsFromFiles(files);
    const base: RuntimeInfo = {
      id: idForDir(dir),
      source,
      label: '',
      dir,
      serverPath,
      variant: variantOf(backends, files),
      backends,
      devices: [],
      ok: false,
    };
    const sourceLabel = { cellar: 'Cellar', unsloth: 'Unsloth Studio', path: 'System PATH', custom: 'Custom folder' }[source];
    try {
      const version = await exec(serverPath, ['--version'], { cwd: dir, timeout: 20_000, windowsHide: true });
      const parsed = parseVersionOutput(`${version.stdout}\n${version.stderr}`);
      base.version = parsed.version;
      base.build = parsed.build;
      const list = await exec(serverPath, ['--list-devices'], { cwd: dir, timeout: 30_000, windowsHide: true }).catch(
        (err: { stdout?: string; stderr?: string }) => ({ stdout: err.stdout ?? '', stderr: err.stderr ?? '' }),
      );
      base.devices = parseDevicesOutput(`${list.stdout}\n${list.stderr}`);
      base.ok = true;
    } catch (err) {
      base.error = errorMessage(err);
    }
    const gpuNote = base.ok && base.devices.length === 0 ? ' · CPU only' : '';
    base.label = `${sourceLabel} · ${VARIANT_LABEL[base.variant]}${base.build ? ` · b${base.build}` : ''}${gpuNote}`;
    return base;
  }

  private async candidateDirs(): Promise<Array<{ dir: string; source: RuntimeInfo['source'] }>> {
    const found: Array<{ dir: string; source: RuntimeInfo['source'] }> = [];
    const seen = new Set<string>();
    const add = (dir: string, source: RuntimeInfo['source']) => {
      const key = dir.toLowerCase();
      if (seen.has(key) || !existsSync(join(dir, SERVER_EXE))) return;
      seen.add(key);
      found.push({ dir, source });
    };

    for (const entry of await readdir(paths().runtimes, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) continue;
      const dir = join(paths().runtimes, entry.name);
      const nested = await findServerDir(dir, 2);
      if (nested) add(nested, 'cellar');
    }
    for (const row of all<{ dir: string; source: RuntimeInfo['source'] }>('SELECT dir, source FROM runtimes')) add(row.dir, row.source);
    for (const dir of paths().unslothLlamaCppDirs) add(dir, 'unsloth');
    try {
      const { stdout } = await exec(process.platform === 'win32' ? 'where.exe' : 'which', [SERVER_EXE], { timeout: 5000, windowsHide: true });
      for (const line of stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) add(dirname(line), 'path');
    } catch {
      // not on PATH
    }
    return found;
  }

  async list(refresh = false): Promise<RuntimeInfo[]> {
    if (this.cache && !refresh) return this.cache;
    const dirs = await this.candidateDirs();
    const infos = await Promise.all(dirs.map((d) => this.probe(d.dir, d.source)));
    this.cache = infos;
    return infos;
  }

  async active(): Promise<RuntimeInfo | null> {
    const runtimes = await this.list();
    const chosen = settings.get().activeRuntimeId;
    const explicit = runtimes.find((r) => r.id === chosen && r.ok);
    if (explicit) return explicit;
    return bestRuntime(runtimes);
  }

  async setActive(id: string) {
    return settings.update({ activeRuntimeId: id });
  }

  async addCustom(dir: string): Promise<RuntimeInfo> {
    const serverDir = existsSync(join(dir, SERVER_EXE)) ? dir : await findServerDir(dir, 3);
    if (!serverDir) throw new Error(`No ${SERVER_EXE} found in ${dir}`);
    run('INSERT OR IGNORE INTO runtimes (id, source, dir, variant, created_at) VALUES (?, ?, ?, ?, ?)', idForDir(serverDir), 'custom', serverDir, null, Date.now());
    const info = await this.probe(serverDir, 'custom');
    this.cache = null;
    return info;
  }

  async remove(id: string): Promise<void> {
    const runtimes = await this.list();
    const target = runtimes.find((r) => r.id === id);
    if (!target) return;
    if (target.source === 'cellar') {
      const top = join(paths().runtimes, target.dir.slice(paths().runtimes.length + 1).split(/[\\/]/)[0]);
      await rm(top, { recursive: true, force: true });
    } else if (target.source === 'custom') {
      run('DELETE FROM runtimes WHERE id = ?', id);
    } else {
      throw new Error('Runtimes found on PATH or bundled with Unsloth Studio are managed outside Cellar.');
    }
    if (settings.get().activeRuntimeId === id) settings.update({ activeRuntimeId: null });
    this.cache = null;
  }

  async latestRelease(): Promise<RuntimeRelease> {
    const res = await fetchWithTimeout('https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=12', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Cellar' },
      timeoutMs: 15_000,
    });
    if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
    const releases = (await res.json()) as Array<{ tag_name: string; published_at: string; assets: Array<{ name: string; browser_download_url: string; size: number }> }>;
    const hw = await detectHardware();
    for (const rel of releases) {
      if (!/^b\d+$/.test(rel.tag_name)) continue;
      const parsed = parseReleaseAssets(rel.assets);
      if (parsed.length === 0) continue;
      return { tag: rel.tag_name, build: Number(rel.tag_name.slice(1)), publishedAt: rel.published_at, assets: parsed, recommended: recommendedVariant(hw) };
    }
    throw new Error('No llama.cpp release with Windows binaries was found.');
  }

  async install(variant: RuntimeVariant): Promise<RuntimeInfo> {
    if (this.installing.has(variant)) throw new Error('This runtime is already being installed.');
    this.installing.add(variant);
    const progress = throttle((stage: 'downloading' | 'extracting' | 'verifying' | 'done' | 'error', received: number, total: number, message?: string) => {
      bus.emit('runtimes:progress', { variant, stage, receivedBytes: received, totalBytes: total, message });
    }, 200);
    try {
      const release = await this.latestRelease();
      const asset = release.assets.find((a) => a.variant === variant);
      if (!asset) throw new Error(`Release ${release.tag} has no ${VARIANT_LABEL[variant]} build for Windows.`);
      const target = join(paths().runtimes, `${release.tag}-${variant}`);
      const tmpZip = join(paths().tmp, asset.name);
      const total = asset.sizeBytes + (asset.cudartSizeBytes ?? 0);

      await downloadFile({ url: asset.url, dest: tmpZip, expectedSize: asset.sizeBytes, onProgress: (r) => progress('downloading', r, total) });
      let cudartZip: string | undefined;
      if (asset.cudartUrl && asset.cudartName) {
        cudartZip = join(paths().tmp, asset.cudartName);
        await downloadFile({
          url: asset.cudartUrl,
          dest: cudartZip,
          expectedSize: asset.cudartSizeBytes,
          onProgress: (r) => progress('downloading', asset.sizeBytes + r, total),
        });
      }
      progress('extracting', total, total);
      progress.flush();
      await rm(target, { recursive: true, force: true });
      await extractZip(tmpZip, { dir: target });
      if (cudartZip) {
        const serverDir = (await findServerDir(target, 2)) ?? target;
        await extractZip(cudartZip, { dir: serverDir });
      }
      progress('verifying', total, total);
      const serverDir = await findServerDir(target, 2);
      if (!serverDir) throw new Error('The downloaded archive did not contain llama-server.');
      this.cache = null;
      const info = await this.probe(serverDir, 'cellar');
      if (!info.ok) throw new Error(info.error ?? 'The runtime failed to start.');
      const current = await this.active();
      if (!current || current.devices.length === 0 || (info.devices.length > 0 && (info.build ?? 0) >= (current.build ?? 0))) {
        settings.update({ activeRuntimeId: info.id });
      }
      await rm(tmpZip, { force: true });
      if (cudartZip) await rm(cudartZip, { force: true });
      progress('done', total, total, info.label);
      progress.flush();
      return info;
    } catch (err) {
      log.error('install failed', err);
      progress('error', 0, 0, errorMessage(err));
      progress.flush();
      throw err;
    } finally {
      this.installing.delete(variant);
    }
  }
}

export function parseReleaseAssets(assets: Array<{ name: string; browser_download_url: string; size: number }>): RuntimeRelease['assets'] {
  const out: RuntimeRelease['assets'] = [];
  const cudart = new Map<string, { url: string; name: string; size: number }>();
  for (const a of assets) {
    const m = a.name.match(/^cudart-llama-bin-win-cuda-([\d.]+)-x64\.zip$/);
    if (m) cudart.set(m[1], { url: a.browser_download_url, name: a.name, size: a.size });
  }
  for (const a of assets) {
    const m = a.name.match(/^llama-b\d+-bin-win-(cuda-([\d.]+)|vulkan|cpu|sycl|rocm-[\d.]+|hip-[\w.]+)-x64\.zip$/);
    if (!m) continue;
    let variant: RuntimeVariant;
    if (m[2]) variant = Number(m[2].split('.')[0]) >= 13 ? 'cuda-13' : 'cuda-12';
    else if (m[1] === 'vulkan') variant = 'vulkan';
    else if (m[1] === 'cpu') variant = 'cpu';
    else if (m[1] === 'sycl') variant = 'sycl';
    else variant = 'rocm';
    if (out.some((o) => o.variant === variant)) continue;
    const rt = m[2] ? cudart.get(m[2]) : undefined;
    out.push({
      variant,
      name: a.name,
      url: a.browser_download_url,
      sizeBytes: a.size,
      cudartUrl: rt?.url,
      cudartName: rt?.name,
      cudartSizeBytes: rt?.size,
    });
  }
  return out;
}

export function bestRuntime(runtimes: RuntimeInfo[]): RuntimeInfo | null {
  const usable = runtimes.filter((r) => r.ok);
  if (usable.length === 0) return null;
  const sourceRank = { cellar: 3, custom: 2, unsloth: 1, path: 0 } as const;
  return [...usable].sort((a, b) => {
    const gpu = Number(b.devices.length > 0) - Number(a.devices.length > 0);
    if (gpu !== 0) return gpu;
    const cuda = Number(b.backends.includes('CUDA')) - Number(a.backends.includes('CUDA'));
    if (cuda !== 0) return cuda;
    const build = (b.build ?? 0) - (a.build ?? 0);
    if (build !== 0) return build;
    return sourceRank[b.source] - sourceRank[a.source];
  })[0];
}

async function findServerDir(root: string, depth: number): Promise<string | null> {
  if (existsSync(join(root, SERVER_EXE))) return root;
  if (depth <= 0) return null;
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const found = await findServerDir(join(root, entry.name), depth - 1);
    if (found) return found;
  }
  return null;
}

export const runtimes = new RuntimeManager();
export const runtimeServerName = (dir: string) => join(dir, basename(SERVER_EXE));
