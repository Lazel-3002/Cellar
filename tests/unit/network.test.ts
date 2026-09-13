import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamEvent } from '../../src/shared/types/chat';
import { ChecksumError, downloadFile } from '../../src/main/lib/download';
import { streamChatCompletion } from '../../src/main/providers/openai-compat';

const payload = Buffer.alloc(256 * 1024);
for (let i = 0; i < payload.length; i++) payload[i] = i % 251;
const sha = createHash('sha256').update(payload).digest('hex');

let server: Server;
let base = '';
let lastRange: string | undefined;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/file') {
      lastRange = req.headers.range;
      const m = req.headers.range?.match(/bytes=(\d+)-/);
      const start = m ? Number(m[1]) : 0;
      res.writeHead(m ? 206 : 200, { 'Content-Length': payload.length - start, 'Accept-Ranges': 'bytes' });
      res.end(payload.subarray(start));
      return;
    }
    if (req.url === '/v1/chat/completions') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const parsed = JSON.parse(body) as { stream: boolean; model: string };
        if (parsed.model === 'broken') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'model not loaded' } }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const chunks = [
          { choices: [{ delta: { reasoning_content: 'thinking…' } }] },
          { choices: [{ delta: { content: 'Hel' } }] },
          { choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }] },
          { choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 }, timings: { prompt_n: 12, predicted_n: 3, predicted_per_second: 42.5 } },
        ];
        for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
        res.end('data: [DONE]\n\n');
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('downloadFile', () => {
  it('resumes from a partial file with a Range request and verifies the checksum', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cellar-dl-'));
    try {
      const dest = join(dir, 'model.gguf');
      // Simulate an interrupted download.
      await writeFile(`${dest}.part`, payload.subarray(0, 100_000));
      const progress: number[] = [];
      const result = await downloadFile({ url: `${base}/file`, dest, expectedSha256: sha, expectedSize: payload.length, onProgress: (r) => progress.push(r) });
      expect(lastRange).toBe('bytes=100000-');
      expect(result.sha256).toBe(sha);
      expect((await readFile(dest)).equals(payload)).toBe(true);
      expect(progress[0]).toBe(100_000);
      expect(progress[progress.length - 1]).toBe(payload.length);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('removes the partial file on a checksum mismatch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cellar-dl-'));
    try {
      const dest = join(dir, 'model.gguf');
      await expect(downloadFile({ url: `${base}/file`, dest, expectedSha256: '0'.repeat(64) })).rejects.toBeInstanceOf(ChecksumError);
      await expect(readFile(`${dest}.part`)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('streamChatCompletion', () => {
  it('normalizes reasoning, text, usage and llama.cpp timings', async () => {
    const events: StreamEvent[] = [];
    for await (const e of streamChatCompletion({ baseUrl: `${base}/v1`, body: { model: 'm', messages: [] }, signal: new AbortController().signal, reasoningStyle: 'toggle' })) {
      events.push(e);
    }
    expect(events.filter((e) => e.type === 'reasoning')).toEqual([{ type: 'reasoning', delta: 'thinking…' }]);
    expect(events.filter((e) => e.type === 'text').map((e) => (e as { delta: string }).delta).join('')).toBe('Hello');
    expect(events.find((e) => e.type === 'stats')).toEqual({ type: 'stats', stats: { promptTokens: 12, completionTokens: 3, tokensPerSecond: 42.5 } });
    expect(events[events.length - 1]).toEqual({ type: 'done', stopReason: 'stop' });
  });

  it('surfaces provider error messages', async () => {
    const run = async () => {
      for await (const _ of streamChatCompletion({ baseUrl: base, body: { model: 'broken', messages: [] }, signal: new AbortController().signal, reasoningStyle: 'none' })) {
        // drain
      }
    };
    await expect(run()).rejects.toThrow('model not loaded');
  });
});
