# Cellar

A Claude Desktop-style app for **local models**. Chat with models running on your own GPU through Cellar's built-in llama.cpp engine, or through Ollama, LM Studio, Unsloth Studio, or any OpenAI-compatible server. Find and download GGUFs from Hugging Face with LM Studio-style control over how they load.

> This build: Milestone 1 (app shell, Chat, Projects, Artifacts, incognito chats, the Model Hub and all backends), Milestone 2 (Cowork agents), Milestone 3 (Code) and Milestone 4 (Customize, Scheduled, voice).
> Coming next: Design (M5) — see [docs/ROADMAP.md](docs/ROADMAP.md).

## Features

- **Claude-style shell**: sidebar (New, Projects, Artifacts, Scheduled, Customize, chats and tasks, Design), custom title bar with back/forward, search (Ctrl+K), Chat/Code switch and the incognito ghost.
- **Chat**:
  - Streaming Markdown (code highlighting, math, Mermaid), collapsible thinking blocks and thinking-level control.
  - Retry and edit with switchable branches, stop, and auto-generated titles.
  - Attachments: images for vision models, shown as thumbnails; PDFs, text and code.
  - Generation stats (tok/s, tokens, time to first token) and a context meter.
  - With tool-capable models: web search, connector tools, skills, memory and past-chat search, with the steps shown inline.
- **Customize**:
  - **Skills**: `SKILL.md` folders; create them, import `.skill`/`.zip` files or Claude Code skills.
  - **Connectors**: MCP servers over stdio, Streamable HTTP or SSE, with per-tool Allow / Ask / Off and import from Claude Desktop.
  - **Plugins**: the Claude Code layout (skills, commands, `.mcp.json`), installed from a folder, a zip or a git URL.
  - **Slash commands**: `/tools`, `/remember` and your own Markdown commands.
  - **Memory**: facts models keep across conversations.
- **Scheduled**: prompts and Cowork tasks on cron schedules with local models, run history and notifications. A notification-area icon keeps them running when the window is closed.
- **Voice dictation**: the mic button transcribes speech on your computer with whisper.cpp (Cellar installs the build and a model).
- **Quick entry**: a global shortcut (Alt+Shift+Space) opens a small window for a quick question.
- **Cowork**: describe a task and a local model works through it inside a folder you choose.
  - Tools: list, read (including PDF, Word, PowerPoint and Excel), write and edit files, glob and grep, PowerShell commands, web search (DuckDuckGo or SearXNG) and page reading, a live plan, and Word, Excel, PowerPoint and PDF creation.
  - Permissions: ask before changes, auto-accept edits, or plan only. Approvals appear inline with the file content, a diff or the command.
  - Tools cannot reach outside the folder (junctions and links included); commands and unknown web pages always ask first.
  - A task view with steps, thinking, files created or changed, and sources. Tasks keep running in the background and notify you when they finish or need you.
  - Works with native tool calling (llama.cpp, Ollama, LM Studio, OpenAI-compatible servers) and falls back to a text protocol for other models; long tasks are summarized to fit the context window.
- **Code**: a coding agent for your repositories.
  - Each session works on its own `cellar/…` branch in a git worktree (or in the checkout or a plain folder), grouped by repository in the sidebar.
  - Modes: Ask, Plan, Code with approvals, or Code with auto-accepted edits (Shift+Tab cycles them).
  - Side panel: Changes (Monaco diff, discard, commit, merge into the base branch), Files (tree + Monaco editor), Preview (localhost dev servers and HTML files) and Terminal (PowerShell via node-pty).
  - Transcript views (normal, verbose, summary), live command output, a side chat that stays out of the session, and `CELLAR.md` project memory (`/init`, `/memory`).
  - Diagnostics: syntax problems in a file the agent just changed come back with the tool result (Python, JavaScript, TypeScript, JSON, PowerShell), and `get_diagnostics` runs tsc, pyright/ruff, `cargo check` or `go vet`.
- **Incognito chats** live only in memory and disappear when you leave them.
- **Projects**: per-project instructions and knowledge files. Files are included whole when they fit, otherwise the best-matching excerpts: SQLite FTS5, fused with embedding search when an embedding model is set (llama.cpp, Ollama or OpenAI-compatible).
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
| Code session worktrees | `~/.cellar/worktrees/<repo>-<id>/` (branches `cellar/…`) |
| Your notes for every repository | `~/.cellar/CELLAR.md` |
| Skills, plugins and slash commands | `~/.cellar/skills/`, `~/.cellar/plugins/`, `~/.cellar/commands/` |
| whisper.cpp builds and voice models | `~/.cellar/whisper/` |

## Development

| Script | Purpose |
| --- | --- |
| `npm test` | Unit tests (Vitest): stream parsers, llama.cpp args/log parsing, memory estimator, quant grouping, context fitting, branching, artifacts, downloader resume, SQLite/FTS5, the Cowork agent (path containment, tools, documents, text protocol, compaction, the agent loop), Code (worktrees, modes, changes, terminal, preview, side chat) and M4 (skills, plugins, commands, memory, a real MCP server, chat tools, diagnostics, scheduler, embeddings) |
| `npm run test:e2e` | Playwright end-to-end tests against a deterministic mock OpenAI server, including a scripted tool-calling agent (build first) |
| `npm run typecheck` | TypeScript for main/preload and renderer |
| `node scripts/screenshots.mjs "/,/models"` | Screenshot routes of the built app |
| `node scripts/chat-smoke.mjs <provider> <model or name=…> "<prompt>"` | Real-model chat through the UI |
| `node scripts/cowork-smoke.mjs <provider> <model or name=…> ["<task>"]` | Real-model Cowork task in a sample folder, approving each request (`SMOKE_MODE=plan` for plan mode) |
| `node scripts/code-smoke.mjs <provider> <model or name=…> ["<task>"]` | Real-model Code session on a sample git repository, then the Changes, Files, Terminal and Preview tabs (`SMOKE_MODE`, `SMOKE_WORKTREE=0`) |
| `node scripts/m4-smoke.mjs <provider> <chat model> [embedding model]` | Real-model M4 check: connector and web search in a chat, memory, project embeddings, whisper.cpp install and transcription (`SMOKE_SKIP=chat,rag,voice`) |
| `node scripts/verify-downloads.mjs [repo]` | Hub download, pause/resume, checksum, rescan and Ollama pull |
| `node scripts/ipc-run.mjs '[["runtimes:list", true]]'` | Call backend IPC handlers directly |
| `node scripts/verify-packaged.mjs` | Smoke-test the packaged build |

### Architecture

```
src/main        Electron main process
  agent/        Cowork: agent loop, tools, folder containment, documents, text tool protocol, compaction
  code/         Code: sessions and worktrees, prompt, changes (git/snapshots), terminal (node-pty), preview scheme, side chat, diagnostics
  customize/    skills, plugins, slash commands, memory, tool listing
  connectors/   MCP servers (SDK client manager, encrypted settings)
  scheduled/    cron schedules and the scheduler
  voice/        whisper.cpp install and transcription
  rag/          embedding index and hybrid project search
  app/          notification-area icon, background mode, quick entry
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
