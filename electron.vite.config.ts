import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

const shared = resolve(__dirname, 'src/shared');

const baseCsp = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Code preview: session files and localhost dev servers (CSP cannot list IPv6 literals; [::1] is opened as localhost).
  'frame-src cellar-artifact: cellar-preview: http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:*',
  "worker-src 'self' blob:",
];

/** Dev needs inline scripts (React refresh) and the Vite websocket; builds get the strict policy. */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'cellar-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const policy = ctx.server
          ? [...baseCsp, "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", "connect-src 'self' ws: http://localhost:*"]
          : [...baseCsp, "script-src 'self' 'wasm-unsafe-eval'", "connect-src 'self'"];
        return html.replace('%CELLAR_CSP%', policy.join('; '));
      },
    },
  };
}

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': shared,
      },
    },
    plugins: [contentSecurityPolicy(), react(), tailwindcss()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
  },
});
