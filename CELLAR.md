# Cellar — Project Memory

**Cellar** is an Electron 44 + React 19 desktop app (v7.8.0) that provides a Claude Desktop-style interface for running local AI models via llama.cpp. It features chat with message trees, code sessions with Monaco LSP, design boards, math whiteboards, browser integration, scheduled tasks, voice dictation, and an extensible plugin system. Built on Electron-Vite (Vite 7) bundling main, preload, and renderer into separate outputs.

## Install, Build, Run, Test

| Step | Command |
|------|---------|
| **Install deps** | `npm install` |
| **Dev mode** | `npm run dev` *(runs `runtime:artifacts` first)* |
| **Build (dev)** | `npm run build` *(runs `runtime:artifacts` first, then `electron-vite build`)* |
| **Preview build** | `npm run preview` |
| **Typecheck** | `npm run typecheck` — runs both `typecheck:node` and `typecheck:web` separately |
| **Unit tests** | `npm test` (alias for `vitest run`) |
| **Watch mode** | `npm run test:watch` |
| **E2E tests** | `npm run test:e2e` (Playwright) |
| **Windows bundle** | `npm run build:win` — builds then runs `electron-builder --win --x64` |

## Folder Layout

```
src/
  main/          Electron main process (~25 sub-modules: agent, browser, chat, code, db, ipc, models, etc.)
    index.ts     Entry point — app lifecycle, IPC registration, protocol handlers, shutdown
    menu.ts      App / tray menu definitions
    window.ts    Main + quick-entry window creation helpers
  preload/       Electron preload (API bridge)
  renderer/src/  React SPA — components/, pages/, stores/, hooks/, lib/, styles/globals.css
    router.tsx   TanStack Router route tree (~20 routes under AppShell)
    main.tsx     App entry, providers
  shared/        Code shared between main & renderer (types/*, ipc-contract, artifacts, etc.)
  artifact-runtime/  Standalone runtime for rendering code/markdown/SVG artifacts
tests/unit/      Vitest unit tests (22 files, `node` environment)
release/         Built app releases per version (electron-builder output)
graphify-out/    AST & graph cache from Graphify analysis tool (gitignored)
scripts/         Build helper scripts (.mjs and .ts)
build/           Electron build resources
resources/       Icons, artifact-runtime bundle (gitignored in some branches)
```

## Code Style & Conventions

- **TypeScript** — `strict: true`, `target: ES2023`, `module: ESNext`, `isolatedModules: true`. Two TS projects: `tsconfig.node.json` (main + preload + shared) and `tsconfig.web.json` (renderer + shared). Run both with `npm run typecheck`.
- **Path aliases** — `@shared/*` → `src/shared/*`; `@/*` → `src/renderer/src/*` (renderer only). Aliases are defined in tsconfig *and* in `electron.vite.config.ts` / `vitest.config.ts`.
- **State management** — Zustand stores with `persist()` middleware + `createJSONStorage(() => localStorage)`. Stores live in `stores/*.ts`.
- **Routing** — TanStack Router with hash history (`#chat/...`, `#code/...`). Route tree declared in `router.tsx`.
- **Styling** — Tailwind CSS v4 (zero-config, `@tailwindcss/vite` plugin). Global styles in `styles/globals.css`. Uses `clsx` + `tailwind-merge` for conditional classes.
- **Testing** — Vitest (`node` environment), files matching `tests/unit/**/*.test.ts`, 20 s timeout. Tests import directly from source (no build step needed).
- **Build** — Electron-Vite with a single main entry, single preload entry, and HTML-based renderer root. Custom CSP plugin injects different policies for dev vs prod.

## Things to Remember

1. `npm run dev` / `build` **always** runs `runtime:artifacts` first (`node scripts/build-artifact-runtime.mjs`). Do not skip it in CI or custom scripts.
2. Type check must run both configs separately — there is no single root TS project with all files.
3. Tests run in Node, not JSDOM / browser — don't import DOM-only code from unit tests.
4. The app uses an Electron `requestSingleInstanceLock()` pattern; a second launch just shows the existing window (unless it's a scheduled wake).
5. CSP is injected at build time by the `cellar-csp` Vite plugin — dev mode allows inline scripts + WS, prod does not.
6. Native modules (`node-pty`, etc.) are packed unpacked from ASAR via `asarUnpack`; do not change this without updating `electron-builder.yml`.
7. Electron-Vite 5 uses a different config shape than Vite 4 — the `main` and `preload` sections build separate bundles, not bundled together.
