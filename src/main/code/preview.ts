/**
 * Preview pane backend: the `cellar-preview://<conversationId>/<path>` scheme serves files from a
 * Code session's working folder, `code:previewUrl` turns an address into a URL for the pane, and a
 * response-header rule lets localhost dev servers render inside the pane's iframe.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { connect } from 'node:net';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { protocol, session, type CustomScheme } from 'electron';
import { z } from 'zod';
import type { Workspace } from '../agent/workspace';
import { handle } from '../ipc/register';
import { codeSession } from './context';

export const PREVIEW_SCHEME = 'cellar-preview';

/**
 * Registered in the same `registerSchemesAsPrivileged` call as the artifact scheme, because a second
 * call replaces the first. Standard + secure gives every session its own origin, so relative links,
 * module scripts, fetch and storage work. Without `corsEnabled`, other origins cannot read the files.
 */
export const PREVIEW_SCHEME_PRIVILEGES: CustomScheme = {
  scheme: PREVIEW_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
};

const TEXT = 'text/plain; charset=utf-8';
const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  xhtml: 'application/xhtml+xml; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  cjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wasm: 'application/wasm',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
};
// Source and data files show as text instead of starting a download.
for (const ext of 'txt md markdown csv tsv log ts tsx jsx vue svelte py rb go rs java kt c h cpp cs php sh ps1 bat yml yaml toml ini cfg conf sql graphql gql diff patch lock'.split(' ')) {
  CONTENT_TYPES[ext] = TEXT;
}

export const OCTET_STREAM = 'application/octet-stream';

export function previewContentType(path: string): string {
  return CONTENT_TYPES[extname(path).slice(1).toLowerCase()] ?? OCTET_STREAM;
}

/** `cellar-preview://<conversationId>/<encoded segments>`; a trailing slash on `relPath` is kept. */
export function buildPreviewUrl(conversationId: string, relPath: string): string {
  const segments = relPath.split(/[\\/]+/).filter((s) => s && s !== '.');
  const trailing = segments.length > 0 && /[\\/]$/.test(relPath) ? '/' : '';
  return `${PREVIEW_SCHEME}://${conversationId}/${segments.map(encodeURIComponent).join('/')}${trailing}`;
}

export interface PreviewTarget {
  conversationId: string;
  /** Relative to the working folder with forward slashes; "." for the folder itself. */
  path: string;
  /** The URL path ends with a slash. */
  directory: boolean;
}

export function parsePreviewUrl(url: string): PreviewTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${PREVIEW_SCHEME}:` || !parsed.hostname) return null;
  try {
    const segments = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    // Encoded separators or parent references would make the URL and the file disagree.
    if (segments.some((s) => /[\\/\0]/.test(s) || s === '..' || s === '.')) return null;
    const path = segments.join('/') || '.';
    return { conversationId: parsed.hostname.toLowerCase(), path, directory: path === '.' || parsed.pathname.endsWith('/') };
  } catch {
    return null;
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0', '[::]']);
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

/**
 * `localhost:5173`, `127.0.0.1:3000/app` or a full http(s) URL on this machine → canonical URL.
 * Returns null for anything else. IPv6 loopback and 0.0.0.0 become `localhost`: Chromium's CSP cannot
 * list IPv6 literals, and 0.0.0.0 is a listen address rather than somewhere to connect to.
 */
export function normalizeLocalhostUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(text) ? text : `http://${text}`);
  } catch {
    return null;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!LOOPBACK_HOSTS.has(host)) return null;
  url.hostname = host === '127.0.0.1' ? host : 'localhost';
  return url.toString();
}

/** The dev-server URLs the pane frames (after normalization). */
export function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

/** A web address rather than a file path: a URL with a scheme, `www.…`, `host.tld:port` or an IPv4 address. */
export function looksLikeWebAddress(input: string): boolean {
  const text = input.trim();
  return HAS_SCHEME.test(text) || /^(www\.[^\s/]+|[a-z\d-]+(\.[a-z\d-]+)+:\d+|(\d{1,3}\.){3}\d{1,3})([:/?#]|$)/i.test(text);
}

/** A single `bytes=` range as inclusive offsets; null serves the whole file, 'unsatisfiable' answers 416. */
export function parseByteRange(header: string | null | undefined, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!match || (!match[1] && !match[2])) return null;
  let start: number;
  let end = size - 1;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
  } else {
    start = Number(match[1]);
    if (match[2]) {
      if (Number(match[2]) < start) return null;
      end = Math.min(Number(match[2]), size - 1);
    }
  }
  if (start >= size) return 'unsatisfiable';
  return { start, end };
}

function withoutFrameAncestors(policy: string): string {
  return policy
    .split(',')
    .map((single) =>
      single
        .split(';')
        .filter((directive) => !/^\s*frame-ancestors(\s|$)/i.test(directive))
        .join(';')
        .trim(),
    )
    .filter((single) => single.replace(/;/g, '').trim())
    .join(', ');
}

/**
 * Drops `X-Frame-Options` and the `frame-ancestors` directive of `Content-Security-Policy`, which
 * stop dev servers from rendering in an iframe. Returns null when nothing had to change.
 */
export function stripFrameBlockingHeaders(headers: Record<string, string[]>): Record<string, string[]> | null {
  let changed = false;
  const result: Record<string, string[]> = {};
  for (const [name, values] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === 'x-frame-options') {
      changed = true;
      continue;
    }
    if (lower === 'content-security-policy' && values.some((v) => /frame-ancestors/i.test(v))) {
      changed = true;
      const kept = values.map((v) => (/frame-ancestors/i.test(v) ? withoutFrameAncestors(v) : v)).filter(Boolean);
      if (kept.length) result[name] = kept;
      continue;
    }
    result[name] = values;
  }
  return changed ? result : null;
}

function canConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** Whether something accepts connections at a localhost URL's port (IPv4 or IPv6 loopback). */
export function isListening(url: string, timeoutMs = 1500): Promise<boolean> {
  const parsed = new URL(url);
  const port = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80);
  const hosts = parsed.hostname === 'localhost' ? ['127.0.0.1', '::1'] : [parsed.hostname.replace(/^\[|\]$/g, '')];
  return new Promise((resolve) => {
    let pending = hosts.length;
    for (const host of hosts) {
      void canConnect(host, port, timeoutMs).then((ok) => {
        pending -= 1;
        if (ok) resolve(true);
        else if (pending === 0) resolve(false);
      });
    }
  });
}

// A page load asks for many files; look the session's folder up once every few seconds, not per file.
const WORKSPACE_TTL_MS = 5000;
const workspaces = new Map<string, { at: number; workspace: Promise<Workspace> }>();

function sessionWorkspace(conversationId: string): Promise<Workspace> {
  const cached = workspaces.get(conversationId);
  if (cached && Date.now() - cached.at < WORKSPACE_TTL_MS) return cached.workspace;
  const entry = { at: Date.now(), workspace: codeSession(conversationId).then((context) => context.workspace) };
  workspaces.set(conversationId, entry);
  entry.workspace.catch(() => {
    if (workspaces.get(conversationId) === entry) workspaces.delete(conversationId);
  });
  return entry.workspace;
}

const BASE_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin' };

const plain = (status: number, text: string) => new Response(text, { status, headers: { ...BASE_HEADERS, 'Content-Type': TEXT } });

function fileResponse(file: string, size: number, request: Request): Response {
  const headers: Record<string, string> = { ...BASE_HEADERS, 'Content-Type': previewContentType(file), 'Accept-Ranges': 'bytes' };
  const range = parseByteRange(request.headers.get('range'), size);
  if (range === 'unsatisfiable') return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const length = size === 0 ? 0 : end - start + 1;
  headers['Content-Length'] = String(length);
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  const body = request.method === 'HEAD' || length === 0 ? null : (Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream<Uint8Array>);
  return new Response(body, { status: range ? 206 : 200, headers });
}

/** Serves one `cellar-preview://` request from the session's working folder. */
export async function servePreviewRequest(request: Request): Promise<Response> {
  const target = parsePreviewUrl(request.url);
  if (!target) return plain(404, 'Not found');
  if (request.method !== 'GET' && request.method !== 'HEAD') return plain(405, 'Method not allowed');
  try {
    const workspace = await sessionWorkspace(target.conversationId);
    let file = await workspace.resolve(target.path);
    let info = await stat(file);
    if (info.isDirectory()) {
      // Without the trailing slash, relative links in the folder's index.html would resolve one level up.
      if (!target.directory) {
        const location = `${buildPreviewUrl(target.conversationId, `${target.path}/`)}${new URL(request.url).search}`;
        return new Response(null, { status: 308, headers: { ...BASE_HEADERS, Location: location } });
      }
      file = await workspace.resolve(target.path === '.' ? 'index.html' : `${target.path}/index.html`);
      info = await stat(file);
    }
    if (!info.isFile()) return plain(404, 'Not found');
    return fileResponse(file, info.size, request);
  } catch {
    return plain(404, 'Not found');
  }
}

async function locate(workspace: Workspace, path: string): Promise<{ abs: string; directory: boolean } | null> {
  const abs = await workspace.resolve(path);
  const info = await stat(abs).catch(() => null);
  return info ? { abs, directory: info.isDirectory() } : null;
}

/**
 * What the address bar or a preview request points at → the URL the pane loads: a localhost address
 * with a server behind it, or an HTML, PDF, image or other viewable file in the session's folder.
 */
export async function resolvePreviewAddress(conversationId: string, input: string): Promise<string> {
  const local = normalizeLocalhostUrl(input);
  if (local) {
    if (!(await isListening(local))) throw new Error(`Nothing is running at ${new URL(local).host} yet. Start your dev server in the Terminal tab, then try again.`);
    return local;
  }
  let path = input.trim();
  const preview = parsePreviewUrl(path);
  if (preview) path = preview.path + (preview.directory && preview.path !== '.' ? '/' : '');
  else if (/^file:\/\//i.test(path)) path = fileURLToPath(path);
  else if (looksLikeWebAddress(path)) throw new Error('Only localhost addresses can be previewed here. Open other sites in your browser.');

  const { workspace } = await codeSession(conversationId);
  let suffix = '';
  let found = await locate(workspace, path);
  const cut = path.search(/[?#]/);
  if (!found && cut > 0) {
    found = await locate(workspace, path.slice(0, cut));
    suffix = path.slice(cut);
  }
  if (!found) throw new Error(`${path} was not found in the working folder.`);
  const rel = workspace.relative(found.abs);
  if (found.directory) {
    if (!(await locate(workspace, rel === '.' ? 'index.html' : `${rel}/index.html`))) {
      throw new Error(rel === '.' ? 'The working folder has no index.html to preview.' : `${rel} has no index.html to preview.`);
    }
    return `${buildPreviewUrl(conversationId, `${rel}/`)}${suffix}`;
  }
  if (previewContentType(rel) === OCTET_STREAM) throw new Error(`${rel} cannot be shown in the preview. Open it from the Files tab instead.`);
  return `${buildPreviewUrl(conversationId, rel)}${suffix}`;
}

/** No-op: the scheme is registered together with the artifact scheme (see `PREVIEW_SCHEME_PRIVILEGES`). */
export function registerPreviewScheme(): void {}

/** Chrome match patterns without a port match every port. */
const LOCALHOST_PATTERNS = ['http://localhost/*', 'https://localhost/*', 'http://127.0.0.1/*', 'https://127.0.0.1/*'];

/** After app ready: protocol handler and header rules. */
export function installPreview(): void {
  protocol.handle(PREVIEW_SCHEME, servePreviewRequest);
  // Only one onHeadersReceived listener is allowed per session; add other rules here instead of registering another.
  session.defaultSession.webRequest.onHeadersReceived({ urls: LOCALHOST_PATTERNS, types: ['subFrame'] }, (details, callback) => {
    const headers = details.resourceType === 'subFrame' && details.responseHeaders && isLocalhostUrl(details.url) ? stripFrameBlockingHeaders(details.responseHeaders) : null;
    callback(headers ? { responseHeaders: headers } : {});
  });
}

const previewUrlArgs = z.tuple([z.string().min(1).max(200), z.string().trim().min(1, 'Type a localhost address or a file path.').max(4096)]);

export function registerPreviewHandlers(): void {
  handle('code:previewUrl', (conversationId, path) => {
    const [id, address] = previewUrlArgs.parse([conversationId, path]);
    return resolvePreviewAddress(id, address);
  });
}
