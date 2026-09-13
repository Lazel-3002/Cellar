// Builds the offline runtime used by React/HTML artifacts (React + lucide + sucrase, and Tailwind's browser build).
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'resources/artifact-runtime');
const entry = resolve(root, 'src/artifact-runtime/react-runtime.tsx');
const output = resolve(outDir, 'react-runtime.js');
const tailwindSource = resolve(root, 'node_modules/@tailwindcss/browser/dist/index.global.js');
const tailwindOutput = resolve(outDir, 'tailwind.js');

const mtime = async (file) => (await stat(file).catch(() => null))?.mtimeMs ?? 0;

await mkdir(outDir, { recursive: true });

if ((await mtime(output)) < (await mtime(entry)) || process.argv.includes('--force')) {
  await build({
    configFile: false,
    logLevel: 'warn',
    plugins: [react()],
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      outDir,
      emptyOutDir: false,
      minify: true,
      lib: { entry, formats: ['iife'], name: 'CellarArtifactRuntime', fileName: () => 'react-runtime.js' },
    },
  });
  console.log('artifact runtime built');
}

if ((await mtime(tailwindOutput)) < (await mtime(tailwindSource))) {
  await copyFile(tailwindSource, tailwindOutput);
}
