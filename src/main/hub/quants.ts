import { parseGGUFQuantLabel, parseGgufShardFilename } from '@huggingface/gguf';
import type { HfFile, QuantOption } from '@shared/types/hub';

const basename = (path: string) => path.split('/').pop() ?? path;
const parentName = (path: string) => {
  const parts = path.split('/');
  return parts.length > 1 ? parts[parts.length - 2] : '';
};

export function isMmprojFile(path: string): boolean {
  return /mmproj/i.test(basename(path));
}

export function isAuxiliaryGguf(path: string): boolean {
  const name = basename(path);
  return /^mtp[-_]/i.test(name) || /(^|\/)MTP\//i.test(path) || /imatrix/i.test(name);
}

export function quantLabelForPath(path: string): string | undefined {
  const name = basename(path);
  const label = parseGGUFQuantLabel(name) ?? parseGGUFQuantLabel(`${parentName(path)}.gguf`);
  if (!label) return undefined;
  return /(^|[-_./])UD-/i.test(path) && !/^UD-/i.test(label) ? `UD-${label}` : label;
}

const SIZE_SUFFIX: Record<string, number> = { XXS: -0.3, XS: -0.2, S: -0.1, M: 0, L: 0.1, XL: 0.2, XXL: 0.3 };

/** Approximate bits-per-weight used purely for ordering and display. */
export function quantBits(label: string): number {
  const core = label.replace(/^UD-/i, '').toUpperCase();
  if (core === 'F32') return 32;
  if (core === 'F16' || core === 'BF16') return 16;
  if (core.startsWith('MXFP4') || core.startsWith('NVFP4')) return 4.25;
  const tq = core.match(/^TQ(\d)_0/);
  if (tq) return Number(tq[1]) + 0.6;
  const m = core.match(/^I?Q(\d)(?:_K)?(?:_(\d))?(?:_(XXS|XS|S|M|L|XL|XXL))?/);
  if (!m) return 99;
  const base = Number(m[1]);
  const sub = m[3] ? SIZE_SUFFIX[m[3]] ?? 0 : m[2] ? Number(m[2]) * 0.05 : 0;
  return base + 0.5 + sub;
}

export interface GroupedRepoFiles {
  quants: QuantOption[];
  mmproj: HfFile[];
  other: HfFile[];
}

export function groupQuantFiles(files: HfFile[]): GroupedRepoFiles {
  const mmproj: HfFile[] = [];
  const other: HfFile[] = [];
  const groups = new Map<string, { label: string; files: HfFile[]; shardPrefix?: string }>();

  for (const file of files) {
    if (!file.path.toLowerCase().endsWith('.gguf')) {
      other.push(file);
      continue;
    }
    if (isMmprojFile(file.path)) {
      mmproj.push(file);
      continue;
    }
    if (isAuxiliaryGguf(file.path)) {
      other.push(file);
      continue;
    }
    const name = basename(file.path);
    const shard = parseGgufShardFilename(name);
    const label = quantLabelForPath(file.path) ?? name.replace(/\.gguf$/i, '');
    const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
    const identity = shard ? `${dir}/${shard.prefix}` : file.path;

    let key = label;
    const existing = groups.get(key);
    if (existing && existing.shardPrefix !== identity) key = `${label} · ${shard ? shard.prefix : name}`;
    const group = groups.get(key) ?? { label: key, files: [], shardPrefix: identity };
    group.files.push(file);
    groups.set(key, group);
  }

  const quants: QuantOption[] = [...groups.values()].map((g) => {
    const sorted = [...g.files].sort((a, b) => a.path.localeCompare(b.path));
    return {
      label: g.label,
      bits: quantBits(g.label),
      files: sorted.map((f) => f.path),
      sizeBytes: sorted.reduce((sum, f) => sum + f.size, 0),
      isDynamic: /^UD-/i.test(g.label),
      sha256: sorted.map((f) => f.sha256),
    };
  });
  quants.sort((a, b) => a.bits - b.bits || a.sizeBytes - b.sizeBytes);
  mmproj.sort((a, b) => a.size - b.size);
  return { quants, mmproj, other };
}

/** Choose the projector to download alongside a quant: prefer F16, then the smallest. */
export function preferredMmproj(mmproj: HfFile[]): HfFile | undefined {
  return mmproj.find((f) => /f16/i.test(basename(f.path)) && !/bf16/i.test(basename(f.path))) ?? mmproj[0];
}
