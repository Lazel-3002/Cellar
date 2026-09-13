# Cellar

A Claude Desktop-style app for **local models**. Chat with models running on your own GPU through Cellar's built-in llama.cpp engine, or through Ollama, LM Studio, Unsloth Studio, or any OpenAI-compatible server. Find and download GGUFs from Hugging Face with LM Studio-style control over how they load.

> This build: Milestone 1 (app shell, Chat, Projects, Artifacts, incognito chats, the Model Hub and all backends) and Milestone 2 (Cowork agents).
> Coming next: Code (M3), Customize / Scheduled / voice (M4), Design (M5) — see [docs/ROADMAP.md](docs/ROADMAP.md).

## Features

- **Claude-style shell**: sidebar (New, Projects, Artifacts, Scheduled, Customize, chats and tasks, Design), custom title bar with back/forward, search (Ctrl+K), Chat/Code switch and the incognito ghost.
- **Chat**: streaming Markdown (code highlighting, math, Mermaid), collapsible thinking blocks, thinking-level control, retry/edit with switchable branches, stop, attachments (images for vision models, PDFs, text and code), generation stats (tok/s, tokens, time to first token), a context meter, and auto-generated titles.
- **Cowork**: describe a task and a local model works through it inside a folder you choose.
  - Tools: list, read (including PDF, Word, PowerPoint and Excel), write and edit files, glob and grep, PowerShell commands, web search (DuckDuckGo or SearXNG) and page reading, a live plan, and Word, Excel, PowerPoint and PDF creation.
  - Permissions: ask before changes, auto-accept edits, or plan only. Approvals appear inline with the file content, a diff or the command.
  - Tools cannot reach outside the folder (junctions and links included); commands and unknown web pages always ask first.
  - A task view with steps, thinking, files created or changed, and sources. Tasks keep running in the background and notify you when they finish or need you.
  - Works with native tool calling (llama.cpp, Ollama, LM Studio, OpenAI-compatible servers) and falls back to a text protocol for other models; long tasks are summarized to fit the context window.
- **Incognito chats** live only in memory and disappear when you leave them.
- **Projects**: per-project instructions and knowledge files. Files are included whole when they fit, otherwise the best-matching excerpts via SQLite FTS5.
- **Artifacts**: HTML, SVG and React output opens in a sandboxed side panel served from an offline `cellar-artifact://` protocol (bundled React, lucide-react, Tailwind). Artifacts keep versions and are collected on the Artifacts page.
- **Built-in llama.cpp engine**:
  - One `llama-server` process per loaded model, loaded on demand.
  - Idle unload and least-recently-used eviction.
  - Load progress parsed from the server logs, plus a log viewer.
  - Cellar detects existing builds (PATH/winget, Unsloth Studio) and installs official ggml-org releases matched to your GPU, including CUDA 13 for RTX 50-series cards.
- **Load settings like LM Studio**:
  - Memory: context length, GPU offload, fit-to-memory margin, KV cache offload.
  - Performance: flash attention, K/V cache quantization, threads, batch sizes, parallel slots, load mode.
  - MoE: experts on the CPU (all, or the first N layers).
  - Model extras: vision projector, reasoning budget, RoPE scaling, speculative draft model, chat template override, extra arguments.
  - Inference: sampling parameters, stop strings, JSON-schema output, and the context overflow policy.
  - A live VRAM/RAM estimate computed from the GGUF header.
- **Discover**:
  - Hugging Face search with publisher filters (unsloth, ggml-org, bartowski, …).
  - A quant table with Unsloth Dynamic labels and per-quant fit badges, read from remote GGUF headers.
  - Downloads to Cellar (resumable, SHA-256 verified, projector included), to Ollama (`hf.co/…` pull) or to LM Studio.
- **Connections**: Ollama (native API, `num_ctx`/`think`/keep-alive), LM Studio (REST v1 load/unload/download), Unsloth Studio (API key), custom OpenAI-compatible servers. API keys and the HF token are encrypted with Windows credentials (safeStorage).

## Getting started

Requirements: Windows 10/11 x64 and Node 22.12+ (Node 24 recommended).

```bash
npm install
npm run dev          # run with hot reload
npm run build:win    # build release/<version>/Cellar-Setup-<version>.exe
```

On first launch:

1. **Engine:** open **Settings → Engines & runtimes** and install the recommended llama.cpp build (CUDA 13 for recent NVIDIA drivers).
2. **Models:** open **Discover** to download a GGUF, or start Ollama / LM Studio / Unsloth Studio. Cellar also finds GGUFs in your Hugging Face cache and LM Studio folder.
3. **Unsloth Studio:** create an API key in Studio → Settings → API and paste it into **Settings → Connections**.

## Where data lives

| What | Location |
| --- | --- |
| Chats, projects, settings (SQLite) | `%APPDATA%\Cellar` (override with `CELLAR_USER_DATA`) |
| Downloaded models | `~/.cellar/models/<publisher>/<repo>/` (configurable) |
| llama.cpp runtimes | `~/.cellar/runtimes/llama.cpp/` (override the home with `CELLAR_HOME`) |
| Files from Cowork tasks without a chosen folder | `~/.cellar/tasks/<date>-<id>/` |

## Development

| Script | Purpose |
| --- | --- |
| `npm test` | Unit tests (Vitest): stream parsers, llama.cpp args/log parsing, memory estimator, quant grouping, context fitting, branching, artifacts, downloader resume, SQLite/FTS5, and the Cowork agent (path containment, tools, documents, text protocol, compaction, the agent loop) |
| `npm run test:e2e` | Playwright end-to-end tests against a deterministic mock OpenAI server, including a scripted tool-calling agent (build first) |
| `npm run typecheck` | TypeScript for main/preload and renderer |
| `node scripts/screenshots.mjs "/,/models"` | Screenshot routes of the built app |
| `node scripts/chat-smoke.mjs <provider> <model or name=…> "<prompt>"` | Real-model chat through the UI |
| `node scripts/cowork-smoke.mjs <provider> <model or name=…> ["<task>"]` | Real-model Cowork task in a sample folder, approving each request (`SMOKE_MODE=plan` for plan mode) |
| `node scripts/verify-downloads.mjs [repo]` | Hub download, pause/resume, checksum, rescan and Ollama pull |
| `node scripts/ipc-run.mjs '[["runtimes:list", true]]'` | Call backend IPC handlers directly |
| `node scripts/verify-packaged.mjs` | Smoke-test the packaged build |

### Architecture

```
src/main        Electron main process
  agent/        Cowork: agent loop, tools, folder containment, documents, text tool protocol, compaction
  providers/    llama.cpp engine, Ollama, LM Studio, OpenAI-compatible (Unsloth, custom), registry
  runtimes/     llama.cpp build detection and installation
  models/       local GGUF index, header summaries, memory estimator, presets
  hub/          Hugging Face API, quant grouping, download manager
  chat/         orchestrator, context fitting, prompts, attachments
  services/     settings, projects, artifacts, model operations
  db/           node:sqlite schema, migrations, chat stores (SQLite + in-memory incognito)
  protocol/     sandboxed cellar-artifact:// protocol
src/preload     typed, allow-listed IPC bridge
src/shared      IPC contract, types, message tree, artifact parser
src/renderer    React 19 + Tailwind 4 UI (TanStack Router/Query, Radix, streamdown)
src/artifact-runtime  offline React runtime for artifacts
```
