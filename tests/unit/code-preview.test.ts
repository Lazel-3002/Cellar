import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Workspace } from '../../src/main/agent/workspace';
import { codeSession, type CodeSessionContext } from '../../src/main/code/context';
import {
  buildPreviewUrl,
  isListening,
  isLocalhostUrl,
  looksLikeWebAddress,
  normalizeLocalhostUrl,
  parseByteRange,
  parsePreviewUrl,
  previewContentType,
  resolvePreviewAddress,
  servePreviewRequest,
  stripFrameBlockingHeaders,
} from '../../src/main/code/preview';

vi.mock('electron', () => ({ protocol: {}, session: {} }));
vi.mock('../../src/main/ipc/register', () => ({ handle: vi.fn() }));
vi.mock('../../src/main/code/context', () => ({ codeSession: vi.fn() }));

const ID = '3f2a8b1c-1d2e-4f50-8a9b-0c1d2e3f4a5b';
let base = '';
let root = '';

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'cellar-preview-'));
  root = join(base, 'repo');
  await mkdir(join(root, 'sub dir'), { recursive: true });
  await mkdir(join(root, 'empty'), { recursive: true });
  await mkdir(join(base, 'outside'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><h1>root</h1>');
  await writeFile(join(root, 'sub dir', 'index.html'), '<p>sub</p>');
  await writeFile(join(root, 'data.bin'), Buffer.from('0123456789'));
  await writeFile(join(root, 'clip.mp4'), Buffer.from('0123456789'));
  await writeFile(join(root, 'tool.exe'), 'MZ');
  await writeFile(join(root, 'şarkı ünïcode.html'), '<p>unicode</p>');
  await writeFile(join(base, 'outside', 'secret.txt'), 'secret');
  await symlink(join(base, 'outside'), join(root, 'link'), 'junction');
  vi.mocked(codeSession).mockImplementation(async (conversationId) => ({ conversationId, workspace: await Workspace.open(root) }) as unknown as CodeSessionContext);
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

const get = (path: string, init?: RequestInit) => servePreviewRequest(new Request(`cellar-preview://${ID}/${path}`, init));

describe('preview URLs', () => {
  it('round-trips paths with spaces, unicode and URL characters', () => {
    for (const path of ['index.html', 'docs/my report.pdf', 'şarkı/ünïcode ✓.html', 'a#b?c%d.html', 'deep/nested/folder/page.htm']) {
      const url = buildPreviewUrl(ID, path);
      expect(url.startsWith(`cellar-preview://${ID}/`)).toBe(true);
      expect(url.slice(`cellar-preview://${ID}/`.length)).not.toMatch(/[ #?]/);
      expect(parsePreviewUrl(url)).toEqual({ conversationId: ID, path, directory: false });
    }
  });

  it('normalizes separators and keeps folder slashes', () => {
    expect(buildPreviewUrl(ID, 'docs\\sub\\page.html')).toBe(`cellar-preview://${ID}/docs/sub/page.html`);
    expect(buildPreviewUrl(ID, './docs/')).toBe(`cellar-preview://${ID}/docs/`);
    expect(buildPreviewUrl(ID, '.')).toBe(`cellar-preview://${ID}/`);
    expect(buildPreviewUrl(ID, './')).toBe(`cellar-preview://${ID}/`);
    expect(parsePreviewUrl(`cellar-preview://${ID}/`)).toEqual({ conversationId: ID, path: '.', directory: true });
    expect(parsePreviewUrl(`cellar-preview://${ID}/sub%20dir/`)).toEqual({ conversationId: ID, path: 'sub dir', directory: true });
  });

  it('rejects other schemes, encoded separators and broken escapes', () => {
    expect(parsePreviewUrl(`https://${ID}/index.html`)).toBeNull();
    expect(parsePreviewUrl('not a url')).toBeNull();
    expect(parsePreviewUrl(`cellar-preview://${ID}/a%2F..%2F..%2Fsecret`)).toBeNull();
    expect(parsePreviewUrl(`cellar-preview://${ID}/a%5C..%5Csecret`)).toBeNull();
    expect(parsePreviewUrl(`cellar-preview://${ID}/bad%E0%A4%A`)).toBeNull();
  });
});

describe('content types', () => {
  it('maps extensions case-insensitively', () => {
    expect(previewContentType('index.html')).toBe('text/html; charset=utf-8');
    expect(previewContentType('PAGE.HTM')).toBe('text/html; charset=utf-8');
    expect(previewContentType('app.mjs')).toBe('text/javascript; charset=utf-8');
    expect(previewContentType('app.js.map')).toBe('application/json; charset=utf-8');
    expect(previewContentType('logo.svg')).toBe('image/svg+xml');
    expect(previewContentType('photo.JPG')).toBe('image/jpeg');
    expect(previewContentType('docs/report.pdf')).toBe('application/pdf');
    expect(previewContentType('font.woff2')).toBe('font/woff2');
    expect(previewContentType('README.md')).toBe('text/plain; charset=utf-8');
    expect(previewContentType('module.wasm')).toBe('application/wasm');
    expect(previewContentType('clip.webm')).toBe('video/webm');
    expect(previewContentType('song.mp3')).toBe('audio/mpeg');
    expect(previewContentType('tool.exe')).toBe('application/octet-stream');
    expect(previewContentType('Makefile')).toBe('application/octet-stream');
  });
});

describe('localhost addresses', () => {
  it('normalizes dev server addresses', () => {
    expect(normalizeLocalhostUrl('localhost:5173')).toBe('http://localhost:5173/');
    expect(normalizeLocalhostUrl('  LOCALHOST:5173  ')).toBe('http://localhost:5173/');
    expect(normalizeLocalhostUrl('127.0.0.1:3000/path?x=1#top')).toBe('http://127.0.0.1:3000/path?x=1#top');
    expect(normalizeLocalhostUrl('http://localhost:8080/app')).toBe('http://localhost:8080/app');
    expect(normalizeLocalhostUrl('https://localhost:5173/')).toBe('https://localhost:5173/');
    expect(normalizeLocalhostUrl('http://[::1]:8080/x')).toBe('http://localhost:8080/x');
    expect(normalizeLocalhostUrl('[::1]:4000')).toBe('http://localhost:4000/');
    expect(normalizeLocalhostUrl('0.0.0.0:8000')).toBe('http://localhost:8000/');
    expect(normalizeLocalhostUrl('localhost')).toBe('http://localhost/');
  });

  it('rejects everything that is not this machine', () => {
    for (const input of ['', 'example.com', 'https://example.com/', 'http://localhost.example.com:3000/', 'http://localhost@evil.com/', 'http://user:pass@localhost:3000/', 'ftp://localhost/', 'file:///C:/repo/index.html', 'index.html', 'docs/report.pdf', '192.168.1.5:5173', 'C:\\repo\\index.html']) {
      expect(normalizeLocalhostUrl(input), input).toBeNull();
    }
  });

  it('recognizes framed localhost URLs only', () => {
    expect(isLocalhostUrl('http://localhost:5173/')).toBe(true);
    expect(isLocalhostUrl('https://127.0.0.1:3000/a')).toBe(true);
    expect(isLocalhostUrl('http://localhost.example.com/')).toBe(false);
    expect(isLocalhostUrl('http://10.0.0.2:3000/')).toBe(false);
    expect(isLocalhostUrl(`cellar-preview://${ID}/index.html`)).toBe(false);
    expect(isLocalhostUrl('garbage')).toBe(false);
  });

  it('tells web addresses from file paths', () => {
    for (const input of ['https://example.com', 'www.example.com', 'example.com:8080/x', '192.168.1.5:5173', 'file:///C:/x']) expect(looksLikeWebAddress(input), input).toBe(true);
    for (const input of ['index.html', 'docs/report.pdf', 'my.page.html', 'sub dir', '.']) expect(looksLikeWebAddress(input), input).toBe(false);
  });

  it('checks whether a port accepts connections', async () => {
    const server: Server = createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    expect(await isListening(`http://localhost:${port}/`)).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await isListening(`http://127.0.0.1:${port}/`, 800)).toBe(false);
  });
});

describe('byte ranges', () => {
  it('parses single ranges', () => {
    expect(parseByteRange('bytes=0-', 10)).toEqual({ start: 0, end: 9 });
    expect(parseByteRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 });
    expect(parseByteRange('bytes=8-100', 10)).toEqual({ start: 8, end: 9 });
    expect(parseByteRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    expect(parseByteRange('bytes=-30', 10)).toEqual({ start: 0, end: 9 });
  });

  it('ignores missing, invalid and multi-part ranges', () => {
    expect(parseByteRange(null, 10)).toBeNull();
    expect(parseByteRange('items=0-1', 10)).toBeNull();
    expect(parseByteRange('bytes=5-2', 10)).toBeNull();
    expect(parseByteRange('bytes=0-1,4-5', 10)).toBeNull();
    expect(parseByteRange('bytes=-', 10)).toBeNull();
  });

  it('flags unsatisfiable ranges', () => {
    expect(parseByteRange('bytes=10-', 10)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=-0', 10)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=0-', 0)).toBe('unsatisfiable');
  });
});

describe('frame-blocking headers', () => {
  it('removes X-Frame-Options and frame-ancestors, leaving everything else', () => {
    const headers = {
      'X-Frame-Options': ['DENY'],
      'Content-Security-Policy': ["default-src 'self'; frame-ancestors 'none'; img-src * data:"],
      'Content-Security-Policy-Report-Only': ["frame-ancestors 'none'"],
      'Content-Type': ['text/html'],
      'Set-Cookie': ['a=1', 'b=2'],
    };
    expect(stripFrameBlockingHeaders(headers)).toEqual({
      'Content-Security-Policy': ["default-src 'self'; img-src * data:"],
      'Content-Security-Policy-Report-Only': ["frame-ancestors 'none'"],
      'Content-Type': ['text/html'],
      'Set-Cookie': ['a=1', 'b=2'],
    });
  });

  it('handles lower-case names, policy lists and policies that only block framing', () => {
    expect(stripFrameBlockingHeaders({ 'x-frame-options': ['SAMEORIGIN'], 'content-security-policy': ["frame-ancestors 'self'"] })).toEqual({});
    expect(stripFrameBlockingHeaders({ 'content-security-policy': ["script-src 'self'; FRAME-ANCESTORS 'none', frame-ancestors https://a.test; object-src 'none'", "style-src 'self'"] })).toEqual({
      'content-security-policy': ["script-src 'self', object-src 'none'", "style-src 'self'"],
    });
  });

  it('returns null when nothing blocks framing', () => {
    expect(stripFrameBlockingHeaders({ 'content-security-policy': ["default-src 'self'"], 'content-type': ['text/html'] })).toBeNull();
    expect(stripFrameBlockingHeaders({})).toBeNull();
  });
});

describe('cellar-preview protocol', () => {
  it('serves files with type and safety headers', async () => {
    const res = await get('index.html');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toContain('<h1>root</h1>');
    expect(await (await get(encodeURIComponent('şarkı ünïcode.html'))).text()).toContain('unicode');
  });

  it('serves index.html for folders and redirects folders without a slash', async () => {
    expect(await (await get('')).text()).toContain('<h1>root</h1>');
    expect(await (await get('sub%20dir/')).text()).toContain('sub');
    const redirect = await get('sub%20dir?x=1');
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get('location')).toBe(`cellar-preview://${ID}/sub%20dir/?x=1`);
    expect((await get('empty/')).status).toBe(404);
  });

  it('answers range requests', async () => {
    const partial = await get('clip.mp4', { headers: { Range: 'bytes=2-5' } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(partial.headers.get('content-length')).toBe('4');
    expect(await partial.text()).toBe('2345');
    const full = await get('clip.mp4');
    expect(full.headers.get('accept-ranges')).toBe('bytes');
    expect(await full.text()).toBe('0123456789');
    const beyond = await get('clip.mp4', { headers: { Range: 'bytes=20-' } });
    expect(beyond.status).toBe(416);
    expect(beyond.headers.get('content-range')).toBe('bytes */10');
  });

  it('answers HEAD without a body and refuses other methods', async () => {
    const head = await get('data.bin', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('10');
    expect(head.body).toBeNull();
    expect((await get('index.html', { method: 'POST', body: 'x' })).status).toBe(405);
  });

  it('never leaves the working folder', async () => {
    expect((await get('missing.html')).status).toBe(404);
    expect((await get('..%2Foutside%2Fsecret.txt')).status).toBe(404);
    expect((await servePreviewRequest(new Request(`cellar-preview://${ID}/../outside/secret.txt`))).status).toBe(404);
    expect((await get('link/secret.txt')).status).toBe(404);
  });
});

describe('code:previewUrl', () => {
  it('resolves files and folders to preview URLs', async () => {
    expect(await resolvePreviewAddress(ID, 'index.html')).toBe(`cellar-preview://${ID}/index.html`);
    expect(await resolvePreviewAddress(ID, '/index.html#top')).toBe(`cellar-preview://${ID}/index.html#top`);
    expect(await resolvePreviewAddress(ID, 'sub dir')).toBe(`cellar-preview://${ID}/sub%20dir/`);
    expect(await resolvePreviewAddress(ID, '.')).toBe(`cellar-preview://${ID}/`);
    expect(await resolvePreviewAddress(ID, `cellar-preview://${ID}/sub%20dir/`)).toBe(`cellar-preview://${ID}/sub%20dir/`);
    expect(await resolvePreviewAddress(ID, join(root, 'data.bin').replace('data.bin', 'clip.mp4'))).toBe(`cellar-preview://${ID}/clip.mp4`);
  });

  it('explains what cannot be previewed', async () => {
    await expect(resolvePreviewAddress(ID, 'missing.html')).rejects.toThrow(/not found/);
    await expect(resolvePreviewAddress(ID, 'empty')).rejects.toThrow(/no index\.html/);
    await expect(resolvePreviewAddress(ID, 'tool.exe')).rejects.toThrow(/cannot be shown/);
    await expect(resolvePreviewAddress(ID, '../outside/secret.txt')).rejects.toThrow(/outside the working folder/);
    await expect(resolvePreviewAddress(ID, 'link/secret.txt')).rejects.toThrow(/outside the working folder/);
    await expect(resolvePreviewAddress(ID, 'https://example.com/')).rejects.toThrow(/Only localhost/);
    await expect(resolvePreviewAddress(ID, 'www.example.com')).rejects.toThrow(/Only localhost/);
  });

  it('returns localhost addresses only when a server is listening', async () => {
    const server: Server = createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    expect(await resolvePreviewAddress(ID, `localhost:${port}/app`)).toBe(`http://localhost:${port}/app`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await expect(resolvePreviewAddress(ID, `127.0.0.1:${port}`)).rejects.toThrow(/Nothing is running at 127\.0\.0\.1:\d+/);
  });
});
