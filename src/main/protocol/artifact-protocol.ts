import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { protocol } from 'electron';
import type { Artifact } from '@shared/types/chat';
import { getArtifact } from '../services/artifacts';
import { paths } from '../system/paths';

export const ARTIFACT_SCHEME = 'cellar-artifact';

/** Artifacts run offline: inline scripts are allowed, but no network or navigation. */
export const ARTIFACT_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' ${ARTIFACT_SCHEME}:`,
  `style-src 'unsafe-inline' ${ARTIFACT_SCHEME}:`,
  `img-src data: blob: ${ARTIFACT_SCHEME}:`,
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const RUNTIME_FILES: Record<string, string> = {
  'react-runtime.js': 'text/javascript',
  'tailwind.js': 'text/javascript',
};

export function registerArtifactScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ARTIFACT_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

const escapeScript = (code: string) => code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const BASE_STYLE = `<style>html,body{margin:0;padding:0;background:#ffffff;color:#1f1f1e;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}</style>`;

export function renderArtifactDocument(artifact: Pick<Artifact, 'type' | 'content' | 'title'>): string {
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${artifact.title.replace(/</g, '&lt;')}</title>`;
  switch (artifact.type) {
    case 'html': {
      let html = artifact.content.replace(
        /<script[^>]+src=["']https:\/\/(?:cdn\.tailwindcss\.com|unpkg\.com\/@tailwindcss\/browser[^"']*|cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser[^"']*)[^"']*["'][^>]*>\s*<\/script>/gi,
        `<script src="${ARTIFACT_SCHEME}://runtime/tailwind.js"></script>`,
      );
      if (!/<html[\s>]/i.test(html)) html = `<!doctype html><html><head>${head}${BASE_STYLE}</head><body>${html}</body></html>`;
      return html;
    }
    case 'svg':
      return `<!doctype html><html><head>${head}<style>html,body{margin:0;height:100%;background:#fff}body{display:grid;place-items:center}svg{max-width:100%;max-height:100vh;height:auto}</style></head><body>${artifact.content}</body></html>`;
    case 'react':
      return `<!doctype html><html><head>${head}${BASE_STYLE}<script src="${ARTIFACT_SCHEME}://runtime/tailwind.js"></script><script src="${ARTIFACT_SCHEME}://runtime/react-runtime.js"></script></head><body><div id="root"></div><script type="text/plain" id="artifact-source">${escapeScript(
        artifact.content,
      )}</script><script>window.CellarArtifact.mount(document.getElementById('artifact-source').textContent);</script></body></html>`;
    default:
      return `<!doctype html><html><head>${head}${BASE_STYLE}</head><body><pre style="white-space:pre-wrap;padding:16px">${artifact.content.replace(/</g, '&lt;')}</pre></body></html>`;
  }
}

export function handleArtifactProtocol(): void {
  protocol.handle(ARTIFACT_SCHEME, async (request) => {
    const url = new URL(request.url);
    const headers = { 'Content-Security-Policy': ARTIFACT_CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
    try {
      if (url.hostname === 'runtime') {
        const name = url.pathname.replace(/^\//, '');
        const type = RUNTIME_FILES[name];
        if (!type) return new Response('Not found', { status: 404 });
        const body = await readFile(join(paths().artifactRuntime, name));
        return new Response(body, { headers: { ...headers, 'Content-Type': type } });
      }
      if (url.hostname === 'view') {
        const artifact = getArtifact(decodeURIComponent(url.pathname.replace(/^\//, '')));
        return new Response(renderArtifactDocument(artifact), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return new Response('Not found', { status: 404 });
    } catch (err) {
      return new Response(`Artifact unavailable: ${err instanceof Error ? err.message : String(err)}`, { status: 404, headers });
    }
  });
}
