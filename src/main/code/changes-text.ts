import { open, readFile, stat } from 'node:fs/promises';

/** Diffs and line counts are skipped for files above this size. */
export const MAX_DIFF_BYTES = 2 * 1024 * 1024;
/** The editor refuses to open files above this size. */
export const MAX_EDITOR_BYTES = 5 * 1024 * 1024;

export const isBinary = (buf: Buffer): boolean => buf.subarray(0, 8000).includes(0);

export function hasBom(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

/** UTF-8 text without a byte order mark. */
export function decodeText(buf: Buffer): string {
  return (hasBom(buf) ? buf.subarray(3) : buf).toString('utf8');
}

export interface FileRead {
  exists: boolean;
  isFile: boolean;
  size: number;
  /** Null when the file is missing, not a file, or larger than the limit. */
  content: Buffer | null;
}

/** Read a file unless it is larger than `limit` bytes. */
export async function readLimited(abs: string, limit: number): Promise<FileRead> {
  const info = await stat(abs).catch(() => null);
  if (!info) return { exists: false, isFile: false, size: 0, content: null };
  if (!info.isFile()) return { exists: true, isFile: false, size: 0, content: null };
  if (info.size > limit) return { exists: true, isFile: true, size: info.size, content: null };
  const content = await readFile(abs).catch(() => null);
  return { exists: true, isFile: true, size: content?.length ?? info.size, content };
}

/** Whether the file starts with a UTF-8 byte order mark (false when it does not exist). */
export async function fileHasBom(abs: string): Promise<boolean> {
  const handle = await open(abs, 'r').catch(() => null);
  if (!handle) return false;
  try {
    const buf = Buffer.alloc(3);
    const { bytesRead } = await handle.read(buf, 0, 3, 0);
    return bytesRead === 3 && hasBom(buf);
  } finally {
    await handle.close();
  }
}

/** Lines as git counts them: a missing final newline makes the last line differ from one that has it. */
function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  else lines[lines.length - 1] += '\0';
  return lines;
}

/** Lines in a new text file, as `git diff --numstat` reports them. */
export function countLines(text: string): number {
  return splitLines(text).length;
}

const MAX_DIFF_WORK = 40_000_000;

/**
 * Added and removed lines between two texts: the length of the shortest edit script (Myers).
 * Very different large inputs fall back to "everything changed" instead of running for long.
 */
export function countLineChanges(before: string, after: string): { additions: number; deletions: number } {
  const ids = new Map<string, number>();
  const toIds = (lines: string[]) =>
    lines.map((line) => {
      let id = ids.get(line);
      if (id === undefined) ids.set(line, (id = ids.size));
      return id;
    });
  let a = toIds(splitLines(before));
  let b = toIds(splitLines(after));

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  a = a.slice(start, endA);
  b = b.slice(start, endB);
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return { additions: m, deletions: n };

  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  let work = 0;
  for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        // d = additions + deletions and m - n = additions - deletions.
        return { additions: (d + m - n) / 2, deletions: (d - m + n) / 2 };
      }
    }
    work += (2 * d + 1) + n + m;
    if (work > MAX_DIFF_WORK) break;
  }
  return { additions: m, deletions: n };
}
