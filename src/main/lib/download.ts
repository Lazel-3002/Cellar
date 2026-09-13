import { createHash, type Hash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

export interface DownloadOptions {
  url: string;
  dest: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  expectedSha256?: string;
  expectedSize?: number;
  /** Called with (receivedBytes, totalBytes). Total is 0 when unknown. */
  onProgress?: (received: number, total: number) => void;
}

export class ChecksumError extends Error {
  constructor(file: string) {
    super(`Checksum mismatch for ${file}; the partial download was removed.`);
    this.name = 'ChecksumError';
  }
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function hashExisting(path: string, hash: Hash, signal?: AbortSignal): Promise<void> {
  await pipeline(
    createReadStream(path),
    new Transform({
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk);
        cb();
      },
    }),
    { signal },
  );
}

/**
 * Streams a URL to disk via a `.part` file, resuming with HTTP Range when a partial file exists,
 * and verifying SHA-256 when an expected digest is supplied.
 */
export async function downloadFile(opts: DownloadOptions): Promise<{ bytes: number; sha256?: string }> {
  const part = `${opts.dest}.part`;
  await mkdir(dirname(opts.dest), { recursive: true });

  const done = await fileSize(opts.dest);
  if (done > 0 && opts.expectedSize && done === opts.expectedSize) {
    opts.onProgress?.(done, done);
    return { bytes: done };
  }

  let start = await fileSize(part);
  if (opts.expectedSize && start > opts.expectedSize) {
    await rm(part, { force: true });
    start = 0;
  }
  const hash = opts.expectedSha256 ? createHash('sha256') : null;

  const request = async (from: number) =>
    fetch(opts.url, {
      headers: { ...opts.headers, ...(from > 0 ? { Range: `bytes=${from}-` } : {}) },
      signal: opts.signal,
      redirect: 'follow',
    });

  let res = await request(start);
  if (res.status === 416 && start > 0) {
    // The part file is already complete (or the server rejects the range): restart cleanly.
    await res.body?.cancel();
    if (opts.expectedSize && start === opts.expectedSize) {
      res = new Response(null, { status: 206 });
    } else {
      await rm(part, { force: true });
      start = 0;
      res = await request(0);
    }
  }
  if (!res.ok) {
    throw new Error(`Download failed (${res.status} ${res.statusText}) for ${opts.url}`);
  }
  if (start > 0 && res.status !== 206) {
    start = 0; // server ignored Range
  }
  if (hash && start > 0) await hashExisting(part, hash, opts.signal);

  const length = Number(res.headers.get('content-length') ?? '0');
  const total = opts.expectedSize ?? (length > 0 ? start + length : 0);
  let received = start;
  opts.onProgress?.(received, total);

  if (res.body) {
    const meter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length;
        hash?.update(chunk);
        opts.onProgress?.(received, total);
        cb(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(res.body as unknown as NodeWebReadableStream<Uint8Array>),
      meter,
      createWriteStream(part, { flags: start > 0 ? 'a' : 'w' }),
      { signal: opts.signal },
    );
  }

  const digest = hash?.digest('hex');
  if (opts.expectedSha256 && digest && digest.toLowerCase() !== opts.expectedSha256.toLowerCase()) {
    await rm(part, { force: true });
    throw new ChecksumError(opts.dest);
  }
  await rm(opts.dest, { force: true });
  await rename(part, opts.dest);
  return { bytes: received, sha256: digest };
}
