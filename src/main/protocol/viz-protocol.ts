/**
 * Inline visualizations need a genuinely separate Content-Security-Policy from the rest of the
 * app (they may load a chart library from an allowed CDN; the main window's own CSP is locked to
 * 'self'). A `srcDoc` iframe can't do that — per spec it inherits its CSP from the document that
 * created it, so a `<meta>` CSP embedded in the srcdoc content only ever gets intersected with
 * (never replaces) the parent's stricter policy. Serving the document from a real, separate
 * `cellar-viz://` URL instead means Chromium applies only the CSP in *this* response's headers.
 */
import type { CustomScheme } from 'electron';
import { protocol } from 'electron';
import { newId } from '../lib/util';

export const VIZ_SCHEME = 'cellar-viz';

export const VIZ_SCHEME_PRIVILEGES: CustomScheme = {
  scheme: VIZ_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true },
};

/** Untrusted, model-authored HTML: only the two CDNs we allow, nothing else. */
export const VIZ_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com",
  'font-src data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net',
  'img-src data: blob: https:',
  'connect-src https://cdnjs.cloudflare.com https://cdn.jsdelivr.net',
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const MAX_ENTRIES = 300;
/** Ephemeral: a message's own saved content is the source of truth, this is just render plumbing. */
const registry = new Map<string, string>();

export function registerVizDocument(html: string): string {
  const id = newId();
  registry.set(id, html);
  while (registry.size > MAX_ENTRIES) registry.delete(registry.keys().next().value as string);
  return id;
}

export function handleVizProtocol(): void {
  protocol.handle(VIZ_SCHEME, async (request) => {
    const url = new URL(request.url);
    const id = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const html = url.hostname === 'render' ? registry.get(id) : undefined;
    if (!html) return new Response('Not found', { status: 404 });
    return new Response(html, {
      headers: { 'Content-Security-Policy': VIZ_CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' },
    });
  });
}
