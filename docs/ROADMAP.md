# Cellar roadmap

Source of truth for milestone goals. The original Milestone 1 plan is at
`C:\Users\w11\.claude\plans\cellar-cellar-is-an-glowing-jellyfish.md`.

| Milestone | Scope | Status |
| --- | --- | --- |
| **M1 Foundation** | App shell, Chat, Projects, Artifacts, incognito, Model Hub, all backends | ✅ Done 2026-09-13 |
| **M2 Cowork** | Local agent that works inside a folder you choose | ✅ Done 2026-09-13 |
| **M3 Code** | Coding agent for repositories | ✅ Done 2026-09-14 |
| **M4 Customize, Scheduled, Voice** | Skills, MCP connectors, plugins, scheduled tasks, dictation, embeddings RAG | ✅ Done 2026-09-15 |
| **M5 Design** | Canvas for mockups and slides, better-designed documents | ✅ Done 2026-09-15 |
| **M6 Math** | Study boards: exact calculator, worked steps, figures, graphs, practice tests, whiteboard | ✅ Done 2026-09-16 |
| **M7 Inline capabilities** | Inline visualizations (sandboxed HTML rendered live in chat) and inline images ([[image: query]] via DuckDuckGo search) | ✅ Done 2026-09-16 |
| **M8 Tier 3 wishlist** | Built-in Chromium browser, `call(module, task)` delegation, self-scheduling reminders, streaming dictation + spoken replies | ✅ Done 2026-09-17 |
| **M8.1 Undo, git and memory** | Undo for Cowork file changes; push, pull requests and merge-conflict resolution in Code; `/update-memory` | ✅ Done 2026-09-17 |

Product goal throughout: behave almost 1:1 like Claude Desktop (Chat / Cowork / Code), but every model runs locally — built-in llama.cpp, Ollama, LM Studio, Unsloth Studio, or any OpenAI-compatible server — with LM Studio-grade control over how models load. Cellar keeps its own logo; no Anthropic branding.

---

## M1 Foundation — delivered

Shell, chat (streaming, thinking, branches, attachments, stats), incognito, projects with knowledge, artifacts panel, Discover with fit badges and resumable downloads, LM Studio-style load settings, runtime installer, connections, settings, Windows installer. Tests: `npm test` (unit), `npm run test:e2e` (Playwright + mock server).

Verified on the dev machine (RTX 5060 8 GB):
- **Ollama:** qwen3:0.6b at ~290 tok/s.
- **Vulkan build:** gemma-4-E2B at ~108 tok/s.
- **CUDA 13 build:** Qwen3.6-35B-A3B with `--cpu-moe` at ~26 tok/s.
- **Downloads:** pause/resume, checksum verification and the Ollama pull all work.

### Known gaps and follow-ups from M1
- **LM Studio** connector is not live-tested (LM Studio wasn't installed). **Unsloth Studio** chat is not tested with a real API key; only the 401 "unauthorized" state was verified.
- **Project knowledge** uses SQLite FTS5 (BM25) only, with no embeddings yet (M4).
- **React artifacts** can import only `react`, `react-dom` and `lucide-react` (no recharts or shadcn yet).
- **Mic button** is a disabled placeholder (M4).
- **Placeholders:** Scheduled, Customize, Code and Design pages are "coming soon" screens.
- **Release:** auto-update via `electron-updater` + GitHub Releases (background check, download, "restart to update"); still no code signing — see TODOs in `electron-builder.yml` and `src/main/services/updater.ts`.

---

## M2 Cowork — delivered

Cowork mode on the home screen starts a task: pick a folder (or a project's instructions), or skip and Cellar makes a task folder. The agent plans, works through tool calls, asks before changes, and reports back. Tasks live under "Chats and tasks" with a live status marker (working / needs approval / failed).

- **Agent loop** (`src/main/agent/runner.ts`): one assistant message per turn holding ordered parts (text, thinking, tool steps, compaction), streamed to the UI and saved after every step.
  - Native tool calling on llama.cpp (`--jinja`, `parallel_tool_calls`), Ollama (`tools`, whole calls with ids) and OpenAI-compatible servers; a `<tool_call>` JSON text protocol (with stop sequences) for models without native tools, also used to rescue calls a server left in the text.
  - Tolerant argument handling: loose JSON repair, name aliases (`ReadFile`, `functions.read_file`), argument aliases, zod validation with readable errors fed back to the model.
  - Step limit (default 40, then "Paused… reply continue"), loop detection (4 identical calls stop the task; the counter resets after any change), empty-reply nudge, cancel everywhere (model stream, approvals, running commands).
  - Context: tool output sized to ~30% of the window; older results trimmed first, then earlier work is summarized into a `compaction` part placed in front of the latest request; a clear error when even that cannot fit.
- **Tools** (`src/main/agent/tools/`): `list_dir`, `read_file` (text plus PDF/DOCX/PPTX/XLSX extraction, paged), `write_file`, `edit_file` (exact unique match, CRLF-aware), `glob`, `grep`, `todo_write`, `run_command` (Windows PowerShell, UTF-8 output, timeout, process-tree kill), `web_search` (DuckDuckGo HTML with Brave fallback, or SearXNG JSON; retried with 1s/2s/4s backoff and a longer wait on HTTP 429, results cached per query for 1h, each result tagged with its source engine), `web_fetch` (readable text + links, PDFs), `create_docx` (Markdown → Word via `docx`), `create_xlsx` (`exceljs`, header row + formulas), `create_pptx` (`pptxgenjs`, title/bullets/notes), `create_pdf` (Markdown → HTML → Chromium `printToPDF` in an offline, script-free window).
- **Containment:** `Workspace.resolve` refuses paths outside the folder, including `..`, other drives, UNC/device paths, drive-relative paths, alternate data streams, reserved device names and junctions/symlinks that lead elsewhere. Plan mode removes edit and command tools. Commands always ask unless "Always allow commands" was chosen for that task. `web_fetch` asks for URLs that did not come from the user or a search result (blocks data exfiltration through crafted URLs) and refuses local/private addresses; redirects are re-checked. The Files panel only reveals, never runs, executables and scripts. Switching one task's mode never changes the default for new tasks.
- **Permissions:** Ask / Auto-accept edits / Plan only, chosen on the home composer (default for new tasks) and per task. Inline approval cards show the file content, a line diff for edits, the command or the URL, with Allow, Allow-all (edits / commands / that site) and Deny with an optional note for the model.
- **Task view** (`/task/:id`): transcript with grouped, expandable steps (arguments, diffs, output, "show full output"), thinking blocks, approval cards, compaction note; side panel with Progress (todo list), working folder, Files (open / show in folder / save a copy) and Sources; "Plan ready" banner that switches mode and carries the plan out.
- **Background work:** tasks keep running while you switch pages; a toast (in-app) or a desktop notification (window in the background) says when a task finishes, fails or needs approval, and opens it on click.
- **Model guidance:** in Cowork, tool-capable models are listed first and others are dimmed; the home screen warns about models without native tool calling, under ~3B parameters, or with less than 8K context.
- **Settings → Cowork:** default permissions, step limit, notifications, web access on/off, DuckDuckGo or SearXNG (+ URL), recent folders.
- **Data:** migration 2 adds `conversations.kind`, `conversations.task` (JSON task state) and `messages.parts`. Scratch task folders live in `~/.cellar/tasks/<date>-<id>/`.

Tests: 92 unit tests (42 new: path containment incl. a real junction escape, globs, text protocol, HTML/search parsing, SSE tool-call assembly, Ollama mapping, history rebuild and compaction, every tool on a temp folder, document round-trips, PowerShell encoding/timeout, and the full agent loop with a scripted model) and 11 Playwright tests (2 new: approval flow writing into a real folder; background task with toast). Real-model runs through the UI with `scripts/cowork-smoke.mjs`:
- **Ollama qwen3.5:9b** — notes → `summary.md` + `action-items.xlsx` (53 s, 40 tok/s); web research → `fit-report.docx` with headings, lists and linked sources (46 s); plan mode produced a 4-step plan and changed nothing.
- **llama.cpp gemma-4-E2B** — same notes task (20 s, 143 tok/s); PowerShell file count + `status.pdf` with a table (18 s).
- **llama.cpp Qwen3.6-35B-A3B** (`--cpu-moe`, 32K, q8_0 KV) — kept a plan, built a 5-slide `deck.pptx` with speaker notes, edited `notes/ideas.txt`, re-read it to verify (89 s including load, 32 tok/s).

### Known gaps and follow-ups from M2
- **Text protocol** is covered by unit tests but not by a real model: every model on the dev machine supports native tool calling.
- **Undo** for agent file changes was added in M8.1 (Changes section in the task panel); `run_command` output is still shown when the command ends, not streamed.
- **Office documents** are generated with fixed, clean styling; no templates, images in slides, or charts yet. Legacy `.doc/.xls/.ppt` cannot be read.
- **Tasks cannot be incognito**, and retry/edit branching is not offered in the task view (follow-ups steer instead).
- **Scratch task folders** are kept when a task is deleted, so outputs are never lost silently.
- **Windows desktop notifications** need the installed app (Start-menu shortcut with the app ID); in development the in-app toast covers it.
- **Search:** DuckDuckGo's HTML endpoint can rate-limit bursts (one retry is built in); SearXNG is the robust option.
- **Dependencies:** `npm audit` flags `image-size` (via `pptxgenjs`, only reachable when adding images to slides, which Cellar does not do) and `uuid` (via `exceljs`, only with caller-supplied buffers); `extract-zip` (M1) is used only for official llama.cpp releases.

---

## M3 Code — delivered

The Code switch in the title bar opens a coding agent for repositories. It shares the M2 agent loop: conversations of kind `code` with `task.code` (repository, branch, worktree, base commit, mode).

- **Sessions** (`src/main/code/session.ts`, `git.ts`)
  - Pick a repository (recent list or folder picker) and a base branch.
  - By default each session gets its own git worktree in `~/.cellar/worktrees/<repo>-<id>` on a `cellar/<slug>-<id>` branch, so the checkout stays untouched. Ignored files listed in `.worktreeinclude` (such as `.env`) are copied in.
  - Without a worktree, the agent works in the checkout. Outside git, the original of every file the agent changes is saved (`snapshots.ts`) for diffs and undo.
  - The Code sidebar groups sessions by repository, with filters for active or starred sessions and for one repository. Deleting a session can also remove its worktree and branch, with a warning when there are uncommitted changes or commits.
- **Modes:** Ask (read-only answers), Plan (read-only plan with a "Start coding" banner), Code with approvals, and Code with auto-accepted edits. Change modes from the composer menu or with Shift+Tab; the change applies from the next model step.
- **Tools:** list/read/write/edit files, glob, grep, todo, PowerShell commands (PowerShell 7 when installed) with live output while they run, and web search/fetch when web access is on.
  - Names other agents use (`Read`, `Bash`, `str_replace`, `LS`…) are mapped to Cellar's tools.
  - A Code-specific prompt (`src/main/code/prompt.ts`) covers conventions, verifying with tests, no commits or destructive commands unless asked, and dev servers in the terminal.
- **Panes** (resizable right side panel):
  - Changes: git diff against the session's base commit (renames, untracked files, +/− counts), Monaco diff editor (split or unified), discard per file, commit, and merge into the base branch (`changes*.ts`, `ChangesPane.tsx`).
  - Files: lazy tree plus a Monaco editor with tabs, Ctrl+S save and reload on disk changes (`FilesPane.tsx`, `lib/monaco.ts`).
  - IntelliSense for TypeScript/JavaScript and Python: real language servers (`typescript-language-server` over tsserver, `pyright`), one per (language, session), spoken to over LSP/JSON-RPC on stdio (`code/lsp.ts`, `lib/lsp.ts`). Autocomplete, live diagnostics, go-to-definition and find-references; cross-file navigation opens the target file in the Files pane via `monaco.editor.registerEditorOpener`. TypeScript prefers the project's own installed `typescript` and falls back to Cellar's bundled copy.
  - Preview: localhost dev servers and HTML/SVG/image files through the `cellar-preview://<session>/<path>` scheme, with back/forward, reload, device widths, and `X-Frame-Options`/`frame-ancestors` removed only for localhost frames (`preview.ts`).
  - Terminal: node-pty shells in the working folder with xterm.js tabs, restart, clickable links (localhost links open in Preview) and scrollback replay (`terminal.ts`, `TerminalPane.tsx`).
- **View modes:** normal, verbose (every step and thought expanded) and summary (requests, one-line step summaries and final answers).
- **Side chat:** questions about the session with its transcript as context. There are no tools and nothing is added to the session (`side-chat.ts`, `SideChat.tsx`; `/btw <question>`).
- **Project memory:** `CELLAR.md` at the top of the repository (or `AGENTS.md` / `CLAUDE.md`) plus `~/.cellar/CELLAR.md`, included in every turn. `/init` has the agent write it; `/memory` opens it in the editor.
- **Settings → Code:** default mode, worktrees on/off, step limit (default 80), shell, recent repositories.

Tests: 168 unit tests and 12 Playwright tests. New unit tests cover:
- git helpers, worktrees and `.worktreeinclude`
- the Code prompt, tools per mode and tool-name aliases
- a full session in a worktree, Ask mode refusals and mode switching, snapshots, live command output
- the changes backend (git and snapshots: diffs, discard, commit, merge), preview URL and header helpers, the terminal manager, and the side-chat prompt and streaming

The new Playwright test covers a scripted bug fix in a worktree with approval, the Changes diff, a terminal in the worktree, summary view, a side chat that leaves the session untouched, and deletion with worktree and branch removal.

Real model through the UI (`scripts/code-smoke.mjs`), Ollama qwen3.5:9b: given "tests fail, fix src/math.js", it read `test.js` and `math.js`, found the off-by-one loop, edited it, ran `node test.js` (all tests passed) and summarized, at 32 tok/s. The checkout stayed untouched, and Preview rendered `index.html`.

### Known gaps and follow-ups from M3
- **Real models:** only qwen3.5:9b through Ollama was run in this milestone; llama.cpp models and larger refactors are untested with Code.
- **Commands:** `run_command` has no background mode: long-running servers belong in the Terminal tab. The agent cannot read terminal output.
- **Git:** pushing, pull requests (through `gh`) and conflict resolution arrived in M8.1. Merge still refuses and explains when the base checkout is dirty.
- **Snapshots** track only edits made through the file tools and the editor, not files changed by commands (git sessions see everything).
- **Preview:** PDFs do not render in the sandboxed preview frame (use "Open"). Non-localhost web pages open in the browser.
- **Editor:** IntelliSense now covers TypeScript/JavaScript and Python (see above); other languages Monaco can highlight still have no language server. "Go to definition" on an import specifier lands on the local import binding, not the re-exported source (tsserver's own `textDocument/definition` behavior) — same-file jumps and find-references work as expected. Peek-references previews are blank for files not already open (standalone Monaco doesn't resolve a model for them, though clicking still navigates correctly via the Files pane).
- **Packaging:** node-pty's prebuilt N-API binaries are unpacked from the asar; the installer is not code signed.

---

## M4 Customize, Scheduled, Voice — delivered

Customize (skills, connectors, plugins, commands, memory), tools in Chat, Scheduled tasks with a notification-area icon, voice dictation, semantic project search and a quick entry window. It also fixes the issues noted in `docs/Creator Ideas - important things/`: attached images now show in the conversation, Chat has web search and `/tools`, and Code sees syntax errors after it writes code.

- **Tools in Chat** (`agent/runner.ts`, `chat/orchestrator.ts`)
  - A chat whose model has native tool calling runs through the agent loop when any chat tool is on. The loop uses a throwaway task state and saves no task data. Tool steps, thinking and approvals render inline in the chat (`AgentParts.tsx`). Branching, retry, incognito and artifacts work as before.
  - Chat tools: `web_search` / `web_fetch` (on by default, toggle in the composer's tools menu), connector tools, skills, `remember` / `forget`, and `search_chats` / `read_chat`. A chat allows 16 model calls per turn. Models without native tools keep the plain chat path, which still includes saved memories.
  - Web search: DuckDuckGo falls back to Brave Search when it refuses automated requests or finds nothing. Brave is also selectable.
- **Slash commands** in every composer: `/tools` (dialog listing the tools for this chat, task or session, grouped by source, with connector permissions and notes such as "this model has no native tool calling"), `/remember <fact>`, Code's `/init`, `/memory` and `/btw`, plus custom commands (`customize/commands.ts`). Custom commands are Markdown files in `~/.cellar/commands` or in a plugin's `commands/` folder, in Claude Code format (`description`, `argument-hint`, `$ARGUMENTS`, `$1…$9`).
- **Skills** (`customize/skills.ts`): folders with a `SKILL.md` in `~/.cellar/skills` or a plugin's `skills/`.
  - Create and edit them in the app, import a folder or a `.zip` / `.skill` archive, or import from Claude Code (`~/.claude/skills`), and turn each one on or off.
  - Models see each skill's name and description, load the instructions with the `skill` tool, and read helper files with `read_skill_file`.
- **Connectors** (`connectors/manager.ts`, `store.ts`): MCP servers through `@modelcontextprotocol/sdk` 1.30.
  - Transports: stdio, Streamable HTTP (falls back to SSE) and SSE. Enabled connectors connect at startup; changed settings reconnect.
  - Tools are named `<connector>__<tool>`. Read-only tools (`readOnlyHint`) run without asking; others show an approval card with "Always allow". Each tool has an Allow / Ask / Off policy.
  - Plan, Ask and read-only modes keep only read-only connector tools. Server instructions go into the prompt.
  - Environment variables and headers are encrypted with safeStorage.
  - Import from Claude Desktop's `claude_desktop_config.json` or a pasted `mcpServers` JSON.
- **Plugins** (`customize/plugins.ts`): the Claude Code plugin layout (`.claude-plugin/plugin.json`, `skills/`, `commands/`, `.mcp.json` with `${CLAUDE_PLUGIN_ROOT}` and `${VAR:-default}`).
  - Install from a folder, a `.zip` or a git URL (a marketplace repository installs every plugin it lists).
  - Enable, disable or remove a plugin; its skills, commands and connectors follow.
- **Memory** (`customize/memory.ts`): short facts in SQLite, included in chat, task and Code prompts (newest first, 6,000-character budget).
  - Models save and delete memories only when asked; you can add, edit and delete them in Customize → Memory.
  - Incognito chats never read or write memory. Past-chat search is a separate switch.
- **Scheduled tasks** (`scheduled/scheduler.ts`, `cron.ts`, `ScheduledPage.tsx`)
  - Five-field cron schedules (croner 10) with presets (hourly, daily, weekdays, weekly, monthly) and a live preview.
  - A task runs as a chat or as a Cowork task: a chosen folder or a new one, a permission mode, and optionally commands without asking.
  - Model and project are per task. Each run gets its own titled conversation.
  - A 20-second timer fires due tasks. A run missed while Cellar was closed happens once at startup, marked as a missed run. "Run now" is also available.
  - Run history links to each run. Notifications fire when a scheduled chat finishes or a run cannot start.
  - `scheduled/os-scheduler.ts` mirrors enabled tasks into `~/.cellar/scheduled_tasks.json` and keeps one OS-level wake job (Task Scheduler / launchd / cron) pointed at the earliest one, so it relaunches Cellar — quietly, in the tray, via `--scheduled-wake` — even if the app was fully quit.
- **Background and quick entry** (`app/background.ts`)
  - A notification-area icon (Open, New chat, Quick entry, Scheduled, Quit). With "Keep running in the notification area" on, closing the window hides it.
  - The global shortcut (default Alt+Shift+Space, changeable) opens a small always-on-top window. Enter sends the message, and the conversation opens in the main window.
- **Voice dictation** (`voice/whisper.ts`, `lib/dictation.ts`)
  - The mic button records with MediaRecorder, which the renderer decodes and resamples to 16 kHz mono WAV. whisper-cli transcribes it, and the text is inserted into the composer (Esc cancels).
  - Settings → Voice installs an official ggml-org/whisper.cpp build (CPU, OpenBLAS or CUDA 12) and downloads a ggml model (Tiny to Large v3 Turbo) from Hugging Face. The language is set there too.
- **Semantic project search** (`rag/embeddings.ts`)
  - Choose an embedding model in Settings → Models. Project chunks are embedded into `project_vectors` (normalized float32 blobs, per model).
  - Embeddings come from Ollama `/api/embed`, an OpenAI-compatible `/v1/embeddings`, or llama.cpp started with `--embedding` (which does not count toward the loaded-model limit).
  - Retrieval fuses BM25 and cosine rankings (reciprocal rank fusion). Models with a known query prefix get it (nomic, e5, bge/mxbai).
  - The project page shows the index status and a Reindex button.
- **Code diagnostics** (`code/diagnostics.ts`)
  - After `write_file` / `edit_file` (Code and Cowork), a quick check runs on the changed file, and problems are appended to the tool result ("app.py:1:12 error: …").
    - Python: `compile()`, plus ruff when installed.
    - JavaScript: `node --check` via Electron's own Node.
    - TypeScript: syntax errors, using the project's own `typescript`.
    - JSON (comments allowed) and PowerShell (the parser API).
  - `get_diagnostics` checks one file, or the project with the checkers that are installed: tsc, pyright or ruff, Python syntax, `cargo check`, `go vet`.
- **Attachments:** images appear as thumbnails in the composer and in sent messages (chat, task and Code transcripts), served by a `cellar-attachment://image/<id>` scheme limited to the attachments folder. Click an image to see it full size.
- **Data:** migration 3 adds `connectors`, `memories`, `scheduled_tasks`, `scheduled_runs` and `project_vectors`. Skills, plugins, commands and whisper.cpp live under `~/.cellar/`.

Tests: 188 unit tests (20 new) and 14 Playwright tests (2 new). New unit tests cover:
- frontmatter, skills (including `.skill` import), plugin install with skills, commands and connectors, command expansion, memory
- a real stdio MCP server (`tests/fixtures/mcp-server.mjs`): tools, policies and calls
- a chat that uses a skill, a connector tool with approval and "Always allow", and `remember`
- JSON import of connectors
- diagnostics (JavaScript, JSON, Python, problems in `write_file` results, tsc/cargo output)
- cron descriptions, previews and a scheduler catch-up run
- embedding retrieval that finds a chunk by meaning, not keywords
- Brave result parsing and transcript cleanup

The new Playwright tests cover:
- a dropped image shown in the message and the lightbox, `/tools`, and adding the MCP server in Customize → Connectors, then a chat calling its tool
- creating a skill, `/remember` without a model call, a scheduled chat run from the Scheduled page, and memory and skills in the prompt

Real software (`scripts/m4-smoke.mjs`, Ollama, throwaway profile):
- **qwen3.5:9b chat:** called the test connector's tool (5.7 s). Searched the web and read two GitHub pages to answer with the latest llama.cpp release (23.7 s). Saved "favorite language is Rust" to memory when asked.
- **nomic-embed-text:** embedded a project's files (10 / 10 chunks).
- **whisper.cpp:** CPU build b5130 and `ggml-base.bin` installed in 14 s. A Windows TTS recording came back as "Please remind me to water the tomatoes tomorrow morning." in 0.7 s.
- **Code session:** given a `physics.py` with stray `\n` escapes (qwen3.5:9b, `scripts/code-smoke.mjs`), the model read, edited and ran the file, then called `get_diagnostics`. The fixed file prints 2.02.
- **Quick entry:** a real Alt+Shift+Space keypress opened the window.

### Known gaps and follow-ups from M4
- **Connectors:** no OAuth sign-in for remote servers (use headers with a token); MCP resources, prompts and sampling are not used; image results from tools are described as text, not shown to vision models.
- **Plugins:** hooks and agents in Claude Code plugins are ignored; there is no marketplace browser (install from a git URL instead).
- **Chat tools** need native tool calling; models on the text protocol chat without tools. DuckDuckGo and Brave now retry with backoff and back off harder on HTTP 429 (see `agent/tools/web.ts`), but a sustained block still falls through to the error message; SearXNG remains the most robust choice for heavy use.
- **Scheduled tasks** now sync a single OS-level wake job (Task Scheduler with `WakeToRun` on Windows, launchd on macOS, cron on Linux — `scheduled/os-scheduler.ts`) and a `~/.cellar/scheduled_tasks.json` registry, so a due task relaunches Cellar even if it was fully quit. Actual wake-from-hardware-sleep still depends on the OS/hardware honoring that (e.g. Windows power settings allowing wake timers); a Cowork run in Ask mode still waits for approval while you are away.
- **Voice:** whisper.cpp's official Windows CUDA build still tops out at compute capability 9.0 (no x64 build covers Blackwell/RTX 50 series yet); Settings → Voice now detects this and recommends the CPU build there instead — measured on an RTX 5060, the CUDA 12 build fell back to slow PTX JIT and was ~70x slower than CPU for the same clip. Dictation now shows a rough live preview (greedy decoding, re-transcribed every 2.5s) while recording, with the final insert always a full-quality pass. Spoken replies exist via the browser's built-in speech synthesis (Settings → Voice → Spoken replies) — whisper.cpp itself is speech-to-text only, so it can't produce the voice output; this uses the OS's own TTS voices instead, offline.
- **Diagnostics:** the agent's own `get_diagnostics` tool still only does syntax checks plus an on-demand `tsc`/`pyright`/`ruff` pass (`code/diagnostics.ts`); the editor's live squiggles now come from the real language servers described under M3's Editor bullet.
- **Design ideas:** the "AI design engine" note in `docs/Creator Ideas - important things/` (styled documents, charts, themes and layouts in PDF/PPTX/DOCX) was delivered in M5.

---

## M5 Design — delivered

Design in the sidebar opens a canvas where a local model builds slides, pages, posters, web pages and app screens, and you refine them by hand. It also covers the "AI design engine" note in `docs/Creator Ideas - important things/`: themes (palette, font pairing, backgrounds), charts and images in the document flow, typography control and absolute positioning, for designs and for the documents Cowork writes.

- **Design model** (`src/shared/design/`, `types/design.ts`), shared by the main process and the editor
  - A design has a format (slides, document, social, poster, web, mobile), a theme and artboards. Artboards hold absolutely positioned elements: text, rectangles, ellipses, lines, images, charts and SVG.
  - Elements store theme color names (`primary`, `muted`…) and `heading`/`body` fonts, so changing the theme restyles everything. 10 presets use fonts that ship with Windows and Office (`theme.ts`).
  - `normalize.ts` accepts what models write: aliases (`fontSize`, `backgroundColor`, `left`, `width`…), `"50%"`, `"center"`, weight names, Chart.js-style datasets and missing heights (measured from the text).
  - Layouts (`layouts.ts`) turn content into positioned elements for 15 layouts (title, section, bullets, two-column, image-left/right, chart, quote, stats, cards, closing, article, hero, app screen, poster, blank). Sizes scale with the artboard. Missing content is left out instead of placeholder copy.
  - `check.ts` reports text that probably overflows its box, overlapping text, elements off the artboard, unreadably small text and low contrast.
  - `charts.ts` draws bar, horizontal bar, line, area, pie and donut charts as SVG. `svg.ts` removes scripts, handlers and outside references from model-written SVG.
- **Design sessions** (`src/main/design/`): conversations of kind `design` with `task.design = { designId, selection }`. They run through the M2 agent loop.
  - Tools: `get_design`, `set_theme`, `create_artboard` (layout + content, extra elements, or a copy), `update_artboard` (rename, resize with scaling, rebuild), `edit_elements` (partial changes by id, add, delete, reorder), `delete_artboard`. Every change returns the artboard outline and the layout check, so the model can fix problems.
  - The prompt includes the current design outline, the user's canvas selection ("make this bigger") and attached images as `attachment:<id>` sources.
  - Designs live in the `designs` table (migration 4) with a version number. Model changes emit `design:changed`, and the editor adopts them. A save from the editor must be based on the latest version, and the editor saves pending edits before sending a message.
- **Editor** (`pages/DesignPage.tsx`, `components/design/`)
  - Home: prompt with format chips and a theme picker, a blank canvas, ideas, and the list of designs with live thumbnails.
  - Canvas: pan (wheel, space or middle drag), zoom at the pointer (Ctrl+wheel), fit (Shift+1, Shift+2), artboards side by side with labels.
  - Selecting: click or Shift+click, marquee, move with snapping guides to artboard and element edges and centers.
  - Shaping: 8 resize handles (Shift keeps proportions), line endpoints, double-click or Enter to edit text in place, tools for text, rectangle, ellipse and line (V/H/T/R/O/L).
  - Editing: arrow nudging, Ctrl+D/C/V/A, Delete, undo/redo (model changes can be undone too), image drop and paste. Text that does not fit its box gets a red outline.
  - Inspector: position, rotation and opacity, typography, theme or custom colors, fill, border, radius, shadow, image fit, chart type/data (CSV)/values/legend/stacking, alignment, order, lock and duplicate. It also has artboard size presets, background and speaker notes, and the theme presets, colors and fonts.
  - Layers: hide, lock and select. Chat panel with the selection chip and suggestions. Present mode (F5).
- **Export** (`export.ts`, `pptx.ts`)
  - PDF: one page per artboard, at the artboard's size.
  - PNG: one artboard or all, at 2×. Large images are captured in tiles and stitched.
  - PowerPoint: editable text boxes with theme fonts, shapes, native charts, images (SVG rasterized) and speaker notes.
- **Designed documents in Cowork** (`agent/documents.ts`, `tools/plan-docs.ts`)
  - `create_pdf`, `create_docx` and `create_pptx` take a `theme` (a preset or custom colors and fonts).
  - PDF and Word: ```chart blocks with JSON become charts (SVG in PDF, PNG in Word, a data table when no renderer is available), and `![caption](path)` embeds images from the working folder (never outside it or from the web). Tables, headings, quotes and rules follow the theme, and PDF backgrounds reach the page edges on every page.
  - `create_pptx` slides take a layout plus content (kicker, bullets, image, chart, stats, columns, items, quote) and extra elements positioned on a 1920×1080 slide. Slides are built with the Design layouts and PowerPoint exporter.
- **Also:** `/tools` lists Design tools, search and history show designs, the sidebar stays closed in the editor (Ctrl+B opens it), and design notifications are suppressed while that design is open. Windows no longer registers edit-menu accelerators, which kept Ctrl+Z/C/V from reaching the canvas.

Tests: 198 unit tests (10 new) and 15 Playwright tests (1 new). New unit tests cover:
- element normalization and partial changes
- all layouts on slide, A4 and phone sizes staying inside the artboard without overlapping text, and no placeholder copy when content is missing
- layout checks and artboard scaling
- charts of every kind, SVG cleaning, PDF page rules, theme customization
- PowerPoint export with native charts and images
- a Design session through the agent loop: the theme, two layouts and extra elements, then a follow-up that sees the selection and edits by id, version conflicts, blank and duplicated designs
- themed PDF HTML with inline charts and images, a themed Word file with pictures and chart data, layout-based slides, and images outside the working folder refused

The new Playwright test drives the whole flow:
- a scripted model builds two slides
- the title is selected on the canvas, resized in the inspector, undone, nudged and edited in place
- a follow-up recolors the selection
- PDF, PowerPoint and PNG exports are written, and the design appears on the Design page

Real software (throwaway profiles, Ollama qwen3.5:9b):
- **Pitch deck** (`scripts/design-smoke.mjs`): theme plus 5 slides from layouts in 75 s. One `create_artboard` call failed validation, and the model retried it correctly. The follow-up "make this title shorter and use the accent color" on the selected title took 25 s. PDF (5 pages at 1920×1080 px), PowerPoint (checked by rendering the slides in PowerPoint 2021) and PNG exported in 1.5–3 s.
- **Landing page** (web format, Ocean theme): hero and feature cards in 76 s, including the model's own spacing fixes after the layout checks. The headline follow-up took 16 s.
- **Cowork** (`scripts/cowork-smoke.mjs`): from meeting notes, a one-page `status.pdf` in the corporate theme with a styled table and a bar chart, and `sync.pptx` with cover, stats and cards slides.

### Known gaps and follow-ups from M5
- **Canvas:** no groups, rotation handle (rotation is set in the inspector), gradient editing or rich text within a line beyond **bold** spans. Text boxes do not push other elements when they grow.
- **Layout estimates:** text heights are estimated before a browser measures them. The canvas outlines real overflow, but the model only sees the estimate.
- **Models:** small models often write long final summaries despite the instruction. Vision models do not yet see a rendered image of the canvas.
- **Export:** PowerPoint slides use the first artboard's proportions (others are letterboxed). Gradients export as their first color. No SVG or HTML export. Fonts are Windows/Office fonts, so other systems substitute.
- **Documents:** Word charts need the app's renderer (in tests they become data tables). Remote images are not downloaded.
- **Testing:** an e2e chat test can time out picking a model while Ollama is busy unloading a large model. It passes on rerun.

## M6 Math — delivered

Math in the sidebar opens a study board: a page of blocks a local model fills while teaching, and you work on by hand. It comes from the creator's notes and photos of a maths notebook (`docs/Creator Ideas - important things/`): a whiteboard, a calculator, drawn triangles and squares, arithmetic the model does not have to do itself, "make me a test", and step-by-step derivations written the way they are on paper.

The rule behind the whole milestone: **a local model never does the arithmetic**. Every number on a board is worked out by Cellar's own engine, so a 2B model can still hand you a correct study sheet.

- **Maths engine** (`src/shared/math/`), shared by the main process and the editor
  - `exact.ts`: every value is a sum of `c · √r` terms (one per distinct square-free radicand, `c` a bigint fraction), so `12/13 + 5/13 = 17/13`, `√12 = 2√3`, `1/√3 = √3/3`, `(√3)² = 3`, and now `√2 + √3` and `1/(√2 + √3) = -√2 + √3` (rationalized via the conjugate) stay exact too — decimals only where the answer really is irrational or the sum has 3+ distinct radicals (rationalizing those needs nested conjugates).
  - `expr.ts`: one tolerant parser for what people and models write — `2(3+4)`, `3√2·√2`, `sin30`, `a^2`, `-4^2 = -16`, LaTeX (`\frac{\sqrt{3}}{2}`, `\sqrt{16}`), Unicode (`√3`, `a²`, `≤`) — plus a numeric and an exact evaluator over the same tree, exact values at the school angles (0–360 in steps of 30 and 45), a one-round reducer that gives the classic `3² + 4²` → `9 + 16` → `25`, and `parseInequality`/`dependsOn` for the inequality and calculus solvers below.
  - `calculus.ts`: symbolic differentiation (sum/product/quotient/power/chain rules; sin/cos/tan/cot/sec/csc/ln/log/exp/sqrt) over the same tree, and definite integrals — an exact antiderivative via the power rule when the integrand is a polynomial (including expanding `(x+1)^3`-style powers), adaptive Simpson's rule otherwise.
  - `solve.ts`: step-by-step solvers for expressions, linear and quadratic equations (discriminant and exact roots) and inequalities, systems of linear equations (up to 4 unknowns, exact Gaussian elimination), logarithmic/exponential equations (`log(f(x)) = k`, `a^f(x) = k`, unknown linear inside), trigonometric equations (general solution of `sin/cos/tan/cot(linear) = value`), derivatives and definite integrals, the Pythagorean theorem and the trigonometric ratios of a right triangle. The Pythagoras derivation is written exactly as in the notebook photo: `a² + b² = c²` → `a² + (√3)² = 2²` → `a² + 3 = 4` → `a² = 4 - 3` → `a² = 1` → `a = 1`.
  - `figure.ts`: labelled geometry from what a problem says. Side lengths may be numbers, roots (`√3`) or letters (`a`, `x`); a right triangle with two sides gets the third from Pythagoras and a right-angle mark, and triangles are built by SSS with a clear error when the lengths cannot make one. Squares, rectangles, circles, polygons, angles and segments, with angle arcs, extra lines (a height, a diagonal) and optional squared paper.
  - `plot.ts`: function graphs on labelled axes with nice tick steps, clipping and asymptote breaks.
  - `quiz.ts`: seeded test generation for nine topics (arithmetic, fractions, powers, Pythagoras, trigonometric ratios, special angles, linear, quadratic, area) with the answers and worked solutions from the solvers, optional multiple choice, and figures where they help.
  - `mathtext.ts`: maths text typeset as stacked fractions, radical signs and superscripts, from ASCII, a LaTeX subset or Unicode. It only ever emits Cellar's own markup around escaped text.
  - `normalize.ts` and `render.ts`: loose model input turned into blocks (aliases for every field, types guessed from the words used, an error the model can act on instead of a crash), plus the board as a printable page, a Markdown study sheet and the shared CSS the editor uses, so screen and print match.
- **Math sessions** (`src/main/math/`): conversations of kind `math` with `task.math = { boardId, selection }`, running through the M2 agent loop.
  - Tools: `calculate`, `get_board`, `set_board`, `add_blocks`, `update_block`, `delete_blocks`, `solve_steps`, `draw_figure`, `plot_graph`, `make_quiz`. The ones that produce maths (`solve_steps`, `make_quiz`, `draw_figure`) compute it in Cellar and hand the model back what was added.
  - `calculate` is also in Chat and Cowork, so any chat can work out `17/13` or `cos 30°` exactly.
  - The prompt carries the board outline, the block the user selected ("explain this step"), and which test questions they got wrong.
  - Boards live in the `boards` table (migration 5) with a version number. Model changes emit `math:changed` and the editor adopts them; a save from the editor must be based on the latest version, and pending edits are flushed before a message is sent.
- **Board editor** (`pages/MathPage.tsx`, `components/math/`)
  - Home: a prompt with paper choices (squared, dotted, lined, plain), ideas, an empty board, and your boards with the first line of maths as the preview.
  - Blocks: explanation, formula (with what the letters mean), derivation (steps with arrows and reasons, highlighted result), figure, graph, table, practice test and whiteboard. Every block can be edited in place, reordered by drag or arrows, duplicated and deleted; undo/redo covers model changes too.
  - Practice tests are answered on the board: typed or multiple choice, checked against the answer (1/2 and 0.5 both count), with "show the answer" revealing the worked solution and a score for the block.
  - Whiteboard: pen, line, arrow, rectangle, circle, triangle and eraser, five colours and widths, on squared paper, stored in a fixed coordinate space so it looks the same on screen and in exports.
  - Right panel: a calculator with a keypad, exact and decimal answers, history and "add to the board"; an Insert tab with every block type and a test generator (topic, count, level, multiple choice); a Properties tab for the selected figure or graph and for the board itself (topic, paper, degrees/radians).
  - Chat panel with the selection chip, the same transcript as everywhere else, and suggestions.
- **Export** (`export.ts`): PDF and PNG through the offline Chromium renderer that Design uses, and a Markdown study sheet. A test paper (answers off) prints the questions with answer lines and puts the answer key on its own page.

Tests: 233 unit tests (35 new) and 16 Playwright tests (1 new). The new unit tests cover exact arithmetic and the parser (including the notebook's own sums), the solvers line by line, figures (a completed right triangle, symbolic sides, impossible triangles), graphs, typesetting and escaping, seeded test generation across every topic, block normalization from loose model input, board export, and a Math session through the agent loop with a scripted model — the board, the selection, tool errors reported back, save conflicts, blank boards and duplication.

The new Playwright test drives the whole flow: a scripted tutor sets the topic, adds the rule, draws the triangle, works the derivation out and generates a test; a question is answered and revealed; the calculator's `12/13 + 5/13` lands on the board; a whiteboard stroke is drawn with the mouse; a follow-up with a block selected adds a note to it; and a test-paper PDF and a Markdown study sheet are exported.

Real software (throwaway profile, Ollama gemma4:e4b — a 4B model, deliberately small):
- **"Teach me the Pythagorean theorem…"** (`scripts/math-smoke.mjs`): the board came back with the rule, two worked derivations (`c = 5` and `b = 2√10`) and a four-question test, in 55 s. Both derivations and every test answer were re-checked against the engine and matched, a question answered in the UI was marked correct, and PDF, test paper and Markdown exports took under 2 s. The follow-up on a selected block took 12 s.
- The first run of that prompt exposed three things a small model gets wrong, all now handled rather than refused: block types it invents (`type: "block"`, `type: "section"`) are guessed from the fields, `solve_steps` takes a letter for the side to find and verifies three given sides instead of erroring, and a right-angle vertex that contradicts the given sides falls back to treating them as the legs.
- **Packaged build** (`scripts/verify-packaged.mjs`): the installed 6.0.0 app produces the same notebook derivation, `17/13` and `√3/2` from the calculator, and board PDF, test-paper PDF and Markdown exports.

### Known gaps and follow-ups from M6
- **Solvers** now also cover systems of linear equations, inequalities, logarithmic/exponential and trigonometric equations, and basic calculus (derivatives, definite integrals) — see `solve.ts` above. Still not solved step by step: geometry beyond triangles, nonlinear systems, and calculus beyond polynomials/the listed function rules (general antiderivatives fall back to a numeric definite integral; indefinite integrals of non-polynomials aren't attempted). Derivatives throw rather than guess for a factorial, a remainder, `|x|`, or a power where both the base and the exponent vary.
- **Exact arithmetic** now handles sums of distinct radicals (`√2 + √3`) and rationalizes a two-term irrational denominator; three or more distinct radicals in a denominator still fall back to a decimal (would need nested conjugates).
- **PNG export** measures the page from the blocks rather than from the browser, so a very long board can get extra white space at the bottom; PDF is the exact one.
- **Whiteboard** strokes are not pressure-sensitive and there is no shape recognition or text tool; the eraser removes whole strokes.
- **Handwriting and photos:** a photo of a page cannot be read into a board yet (attach it in Chat with a vision model instead).
- **Real models:** verified with scripted models end to end; the real-model run is `scripts/math-smoke.mjs`.

---

---

## M2 Cowork — original goals

Give Cellar an agent mode like Claude Cowork: describe an outcome, the model plans, works through steps using tools in a chosen folder, and you watch progress and steer.

- **Agent loop (main process)**
  - Uses native OpenAI-style tool calling: llama.cpp `--jinja`, Ollama `tools`, LM Studio.
  - Falls back to an XML/JSON tool protocol for models without native tools.
  - Limits: step limit, cancel, streamed tool events.
  - Context: compaction / summarization when it fills up.
- **Folder access**
  - The home screen "Project or folder" / "Skip" row becomes real.
  - Tools stay scoped to the chosen folder; paths outside it are refused.
- **Tools**
  - Files: `list_dir`, `read_file`, `write_file`, `edit_file` (search/replace), `glob`, `grep`.
  - Commands: `run_command` (PowerShell) with approval.
  - Web: `web_fetch`, `web_search` (DuckDuckGo or SearXNG).
  - Planning: todo/plan tool.
  - Documents: create docx/xlsx/pptx/pdf with Node libraries.
- **Permissions**
  - Modes: ask each time / auto-accept edits / plan only.
  - Approvals appear inline in the task view.
- **Task view:** live plan steps, files created or changed, sources used, and final outputs. Tasks appear under "Chats and tasks" with their status.
- **Other UX**
  - Background tasks keep running while you switch chats, with a desktop notification when done.
  - "Ideas for you" starter tasks work.
- **Model guidance:** highlight tool-capable models (GGUF chat template / Ollama capabilities), and warn when a model is too small for agent work.

## M3 Code — goals

A Claude Code-style coding agent for repositories, sharing the M2 agent loop.

- **Sessions**
  - One session per repo, each in its own git worktree.
  - Session sidebar grouped by project, with filters.
- **Modes:** Ask, Code, Plan.
- **Tools:** Read, Write, Edit, Bash/PowerShell, Glob, Grep, TodoWrite.
- **Panes**
  - Diff viewer for changes.
  - Integrated terminal (node-pty + xterm).
  - Monaco editor for spot edits.
  - Preview pane for localhost apps, HTML and PDF.
- **View modes:** normal / verbose / summary.
- **Side chat:** questions that don't pollute the main thread.
- **Project memory:** a `CELLAR.md` file, like CLAUDE.md.

## M4 Customize, Scheduled, Voice — goals

- **Skills:** folders with `SKILL.md` + helper files (compatible with the Claude skills format).
- **Connectors:** MCP servers (stdio and HTTP via `@modelcontextprotocol/sdk`), usable from Chat, Cowork and Code.
- **Plugins:** bundles of skills, connectors and commands. Also a memory feature.
- **Scheduled tasks**
  - Cron-style schedules (croner) that run prompts / Cowork tasks with local models.
  - A tray icon keeps them running with the window closed.
  - Run history and notifications.
- **Voice dictation:** whisper.cpp (downloaded CUDA build + ggml models) behind the mic button.
- **Embeddings RAG** for project knowledge: llama.cpp `--embedding` or Ollama `nomic-embed-text`.
- **Quick entry:** a global hotkey window for fast questions.

## M5 Design — goals

- **Canvas:** multi-artboard canvas for mockups, slides and visual layouts generated by local models, with visual editing of elements and PNG/PDF export.
- **Better-designed documents**, from the creator note in `docs/Creator Ideas - important things/`:
  - themes (palette, font pairing, backgrounds) for PDF, PPTX and DOCX output
  - charts and images placed in the document flow
  - precise typography and layout control
  - absolute positioning on slides

---

## Technical notes learned in M1

Things that are easy to get wrong when continuing:

- **Build tooling**
  - electron-vite 5 supports Vite ≤ 7 only, so use `@vitejs/plugin-react` 5.x.
  - Electron 44 downloads its binary on first `require('electron')` (no postinstall).
- **Database:** `node:sqlite` (with FTS5) works inside Electron 44 — the app has no native modules.
- **llama.cpp**
  - Newer llama-server builds print timestamped logs. Cellar passes `-lv 4`, otherwise offloaded layers and buffer sizes are not printed.
  - `--fit on` is the default.
  - `--cpu-moe` with mmap triggers a warning, so Cellar switches to `--load-mode none`.
- **Runtimes on this machine**
  - Unsloth Studio's bundled llama.cpp is CPU-only when run outside Studio.
  - The official ggml-org CUDA 13.3 release plus its `cudart` zip works on the RTX 5060.
- **Locale:** the dev machine uses a Turkish locale — always format numbers and dates with `'en-US'`.
- **Renderer**
  - `requestAnimationFrame` is paused in hidden or occluded windows; the stream store has a timer fallback.
  - Tailwind v4: unlayered global CSS beats utilities, so base rules go in `@layer base`.
  - lucide-react v1 renamed icons: `Trash2`→`Trash`, `Loader2`→`LoaderCircle`, `MoreHorizontal`→`Ellipsis`; import `Image as ImageIcon`.
  - streamdown v2 needs `@streamdown/code`, `/math` and `/mermaid`. Artifact cards are rendered through `allowedTags` + `components`.
- **Testing**
  - Node 24 `IncomingMessage` emits `close` once the body is read, so mock servers must watch `res` for disconnects.
  - Playwright restarts the worker after a failing test, and `beforeAll` runs again with a fresh profile.

## Technical notes learned in M2

- **Tool calling on the wire**
  - OpenAI-style streams send a call's `id` only in its first chunk; later argument chunks carry just `index`, so accumulate by index (the M1 parser split calls).
  - Ollama 0.34 streams each call whole: `message.tool_calls[{id, function:{index, name, arguments:{object}}}]`, and accepts results as `{role:'tool', tool_call_id, tool_name}` plus `thinking` on assistant turns.
  - llama-server parses only one call per turn unless the request sets `parallel_tool_calls: true`; it accepts `reasoning_content` on assistant tool-call turns for templates with interleaved thinking.
  - Cellar issues its own 9-character alphanumeric call ids (Mistral templates reject other formats; some servers reuse `call_0`).
- **Small-model behavior seen in real runs**
  - Models often pass `"/"` for the working folder, so a single leading slash maps to the folder root.
  - Given only `rows`, models skip spreadsheet headers; a separate `columns` field fixed it.
  - A model picked `create_docx` for `summary.md`; document tools now refuse a mismatched known extension and name the right tool instead of appending `.docx`.
  - Verification re-reads after edits are normal; loop detection must reset after changes.
- **Windows**
  - Windows PowerShell prints in the OEM code page (cp857 on a Turkish locale): set `[Console]::OutputEncoding` to UTF-8 and pass the script with `-EncodedCommand` (UTF-16LE base64). `Out-String -Width 220 -Stream` keeps tables readable.
  - `fs.symlink(target, path, 'junction')` works without admin rights, which lets tests exercise junction escapes.
- **Web**
  - `html.duckduckgo.com` answers automated requests with a browser user agent; `lite.duckduckgo.com` returns 202 (blocked). Result links are `//duckduckgo.com/l/?uddg=<url>`; ads point at `y.js`.
- **Libraries and build**
  - `marked` 18 is ESM-only; Electron 44's Node `require(esm)` loads it from the externalized main bundle.
  - `pptxgenjs` writes with `write({ outputType: 'nodebuffer' })`; `exceljs` reads with `xlsx.load(buffer)`; DOCX/PPTX text extraction only needs `jszip`.
  - zod 4's `z.toJSONSchema(schema, { io: 'input' })` produces tool parameter schemas (strip `$schema` and the ±2^53 integer bounds).
  - Writing `\uXXXX` escapes for invisible characters through the editing tools can insert the literal character; build them with `String.fromCharCode` instead.
- **Budget:** the 14 native tool schemas cost ~2,100 tokens and the agent prompt ~450 (text protocol ~960), so 16K context leaves ~9K tokens for work after the reply reserve.

## Technical notes learned in M3

- **node-pty 1.1** ships N-API prebuilds (win32-x64 conpty), so it needs no rebuild for Electron 44. Keep `npmRebuild: false`, unpack `node_modules/node-pty/**` from the asar and exclude its `.pdb` files and other-platform prebuilds.
- **App execution aliases:** `pwsh.exe` installed from the Store lives in `%LOCALAPPDATA%\Microsoft\WindowsApps` as an alias. `fs.statSync`/`existsSync` fail on it (EACCES), but `lstatSync` works and `spawn` runs it.
- **Privileged schemes:** Electron keeps only the last `protocol.registerSchemesAsPrivileged` call, so `cellar-artifact` and `cellar-preview` are registered together.
- **Git on this machine** has `core.autocrlf=true`: worktree checkouts get CRLF files (`edit_file` handles that). Run git with `LC_ALL=C`, `GIT_TERMINAL_PROMPT=0` and `core.quotepath=false` so its output is parseable.
- **Worktree removal on Windows:** a terminal whose working folder is the worktree keeps it locked for a moment after the pty is killed. `fs.rm` with `maxRetries` covers it.
- **Monaco 0.56** loads from its ESM entry points with only `editor.worker`; it works under the renderer CSP (`worker-src 'self' blob:`, no eval). Load it lazily so the main bundle stays small.
- **Radix dropdown check items** have the ARIA role `menuitem`, not `menuitemcheckbox`.

## Technical notes learned in M4

- **MCP SDK 1.30:** import `@modelcontextprotocol/sdk/client/index.js` (and `/stdio.js`, `/streamableHttp.js`, `/sse.js`); the `./*` export maps CJS for the main bundle.
  - `StdioClientTransport` uses cross-spawn, so `npx` works on Windows, and passes only a short list of default environment variables (add your own through `env`).
  - `stderr: 'pipe'` gives useful connection errors.
  - `callTool(params, undefined, { signal, timeout, resetTimeoutOnProgress })`.
- **Tool names:** connector tools need `[A-Za-z0-9_-]{1,64}`. `normalizeArgs` must not touch connector arguments, because strict schemas reject extra keys.
- **Global shortcuts:** Claude Desktop holds Ctrl+Alt+Space on Windows, and `globalShortcut.register` then returns false. Cellar defaults to Alt+Shift+Space and says in Settings when a shortcut is taken. Ctrl+Alt+letter clashes with AltGr characters on Turkish and other layouts.
- **Windows sessions:** `setTitleBarOverlay` throws on windows created without an overlay (the quick entry window), so track which windows have one. In background mode the window only hides, so `window-all-closed` never fires; quit explicitly when the main window really closes without a tray.
- **Search:** DuckDuckGo's HTML endpoint answers GET but refuses POST and bursts with a 202 anomaly page. Brave Search serves results server-rendered in `data-type="web"` blocks. Match class names by their first word, because `result-content` also contains `content`. Bing's automated HTML results were irrelevant.
- **Croner 10:** `new Cron(pattern, { paused: true })` with `nextRun(date)` / `nextRuns(n, date)`. The `mode` option works at runtime but is not in `CronOptions` types, so validate five fields yourself.
- **Diagnostics:**
  - Electron runs `--check` and helper scripts as Node with `ELECTRON_RUN_AS_NODE=1`.
  - `where python` can return the Microsoft Store stub in `WindowsApps`; skip it and probe with `-c "print(1)"`.
  - `node --check` reports some errors a line after where they start (for example `function f( {`).
- **Embeddings:** llama-server embedding requests must fit one physical batch, so embedding servers start with `-b/-ub 4096`. Ollama's `/api/embed` takes an array input and `truncate: true`.
- **Dictation:** MediaRecorder (webm/opus), then `decodeAudioData`, then an `OfflineAudioContext` at 16 kHz gives mono PCM for WAV without an AudioWorklet (which the CSP would block). The renderer CSP needs `media-src blob:`. whisper-cli prints plain text with `-nt -np`.

## Technical notes learned in M5

- **Window size limit:** on Windows, a `BrowserWindow` never grows past the screen, even hidden, with `enableLargerThanScreen` or with `offscreen: true`. A 3840×2160 capture of a 1920×1080 screen got a quarter of the page.
  - Cellar captures large PNGs in screen-sized tiles instead. `webContents.insertCSS` shifts and scales the body (it works with `javascript: false`), and the tiles are copied with `toBitmap()` into one buffer for `nativeImage.createFromBitmap`.
  - The body needs the full page size (`overflow: visible`); `overflow: hidden` on the body clips everything past the first tile.
  - Offscreen windows throw `UnknownVizError` from `capturePage` after `insertCSS`; hidden normal windows work.
- **printToPDF:**
  - With `preferCSSPageSize`, named pages (`@page p0 { size: 1920px 1080px }` plus `page: p0`) give each artboard its own page size.
  - A non-zero `@page` margin paints white, whatever the root background. Themed documents use zero page margins and body padding with `box-decoration-break: clone`, which repeats the padding on every page.
- **pptxgenjs 4:**
  - `rectRadius` is in inches.
  - `sizing: { type: 'cover', w, h }` only uses the ratio of the image's own `w`/`h`, so pass the natural proportions and the box in `sizing`.
  - Charts take `chartColors` without `#`.
  - PowerPoint 2021 renders the result faithfully, and COM automation (`Slide.Export`) is a quick way to check.
- **docx 9:** `ImageRun` needs `type` (png/jpg/gif/bmp; SVG needs a PNG fallback). Heading styles are overridden through `styles.default.heading1…6`, `title` and `hyperlink`.
- **marked 18:** renderer overrides receive tokens (`code({ text, lang })`, `image({ href, text })`), and returning `false` falls back to the default renderer.
- **Pointer capture** retargets `click`/`dblclick` to the capturing element, so the canvas finds what was double-clicked with `document.elementsFromPoint`.
- **Menus:** registering the `editMenu` role on Windows can keep Ctrl+Z/C/V from reaching page handlers. Chromium handles those keys in text fields without the menu.
- **Model tolerance:** a strict `kind` in the chart schema rejected a model's `type: "line"`. Optional fields plus normalization after validation work better than enums in tool schemas.
- **Races with the model:** an edit made less than the save debounce before sending a message was overwritten by the model's next tool change. Flush pending saves before sending, and keep the replaced state on the undo stack.

## Technical notes learned in M6

- **Exact arithmetic beats a bigger model.** Writing every value as `c · √r` over bigint fractions covers the whole school syllabus (fractions, simplified roots, rationalized denominators, the special angles) in about 200 lines, and it is what lets a 2B model produce a correct study sheet: the model chooses what to teach, Cellar computes it.
- **Parsing what models write** needs more tolerance than a calculator grammar: `sqrt3` and `sin30` tokenize as one identifier, so a known function name followed by digits is split; `log2` must stay one name. `-4^2` is `-(4^2)`, so unary minus binds looser than `^`. `rac{\sqrt{3}}{2}` needs a brace-balanced expansion — a regex for `frac{…}{…}` cannot see nested braces.
- **Rounding for tidiness is not free:** clamping every result to 13 significant digits made `√3` come back as 1.732050807569. Only trigonometry needs that cleanup (so `tan 45° = 1`); roots and logarithms keep full precision.
- **Figures have to accept letters.** Real problems label sides `a`, `x` or `√3`, so a length is a value *and* a label: a right triangle with one symbolic side still gets drawn by measuring the other two, and an all-symbolic triangle falls back to a 3-4-5 shape so the labels sit where they belong.
- **Typesetting without a library:** stacked fractions (`inline-flex` column with a `border-top`) and radicals (a `√` glyph plus an overlined radicand) are enough for a notebook, work in the export window with scripts disabled, and avoid shipping KaTeX into the PDF renderer. Unicode letters must be part of the "name" token, or `karşı/hip` never becomes a fraction.
- **A strict IPC schema silently drops new fields.** `chat:send` validates with a zod object, so a new `math`/`mathSelection` pair on `SendMessageInput` reaches the orchestrator only after the schema learns about it — the symptom is a conversation created as a plain chat and the editor redirecting home.
- **PNG capture needs a height up front**, and the render window has JavaScript disabled, so the page cannot measure itself. Estimating from the blocks (figures and graphs report their real pixel size) is close enough; PDF stays the exact export.

## M7 Inline capabilities — delivered

Two more opt-in, off-by-default Settings → Capabilities toggles, following the existing `artifacts`/`chatWebSearch` pattern end to end (settings → system prompt → renderer):

- **Inline visualizations** (`inlineVisualizations`): when on, models may emit a self-contained HTML chart/diagram/widget in a fenced ` ```html viz ` block (`src/shared/viz.ts`, parsed the same streaming-safe way as artifact fences). The renderer (`Markdown.tsx` → `InlineViz.tsx`) shows it truly inline — a sandboxed `<iframe sandbox="allow-scripts">` via `srcDoc` (deliberately no `allow-same-origin`, so it has no access to app internals), with a CSP limited to `cdnjs.cloudflare.com`/`cdn.jsdelivr.net`. A `window.onerror` bootstrap script posts a message back to the parent frame; on failure (or nothing rendering) it falls back to a plain code view instead of a blank panel. Gated by `supportsArtifactInstructions` (≥3B params), same reasoning as Artifacts.
- **Inline images** (`inlineImages`): when on, models may write `[[image: short query]]` on its own line, sparingly. `src/shared/inline-images.ts` has a forgiving regex, renders the first 2 matches (`InlineImage.tsx`, via a new `images:search` IPC call), and strips the rest plus any trailing broken tag once the message is final. `src/main/services/image-search.ts` resolves it with a DuckDuckGo image scrape (mints a `vqd` token from the HTML page, then calls `i.js`) — no API key, matching how `web_search` already works. Not gated on model size; emitting a short tag is trivial even for tiny models.
- Verified end to end with a real local model (Ollama, `qwen3.5:9b`) via a throwaway-profile Playwright run: both toggles flip through the real `settings:update` IPC call, a dictated `html viz` block renders inside the sandboxed iframe, and three `[[image: ...]]` tags resolve to exactly two real photos with no raw tag syntax left in the transcript.
- **Technical note:** small (~1B) local models do not reliably echo dictated text verbatim when tools are enabled — they will hallucinate a fake tool-call-shaped string instead of a plain reply. Disabling `chatWebSearch`/`memoryEnabled`/`searchPastChats` (forcing the non-agentic `generate()` path) and using a larger instruction-following model made the behavior deterministic for verification.
- **v7.0.1 fix:** verifying against real Chart.js/cdnjs sample files (user-supplied, mirroring Claude.ai's own inline chart pattern) surfaced a real bug: `parseVizBlocks`'s marker regex was `^\s*html\s+viz\s*$`, an exact match. A model that tacks on a `title="..."` attribute — the same convention it already knows from the `artifact` marker — produced an info string like `html viz title="Pie chart"` that silently failed to match, so the block rendered as a plain code box instead of a chart. Loosened to `^\s*html\s+viz(\s|$)` (still anchored so `vizard` etc. can't false-positive). Even with the fix, local models still occasionally drop the `viz` keyword entirely on long/complex content — inherent model instruction-following variance, not a rendering bug.
- **v7.0.2 fix — the actual chart wasn't drawing:** the user reported the panel/title showed but the chart itself never appeared, and that the same HTML worked fine opened directly as a file. Root cause: `iframe.srcDoc` documents are **not** a fresh navigation — per the CSP spec they inherit the Content-Security-Policy of the document that created them, so the `<meta http-equiv="Content-Security-Policy">` embedded in the srcdoc content only ever got *intersected with* (never replaced) the main window's own strict `script-src 'self'` policy, silently blocking both the cdnjs `<script src>` and Chart.js's own inline script. A `<meta>` CSP inside `srcdoc`/`data:` content can only ever get stricter, never looser, than its parent. Fix: added a new `cellar-viz://` scheme (`src/main/protocol/viz-protocol.ts`, registered the same way as `cellar-artifact://`) that serves a real, separately-navigated document with its permissive CSP delivered as a genuine HTTP response header, which is not subject to inheritance; the renderer now calls `viz:register` over IPC to stash the built document and points the iframe's `src` (not `srcDoc`) at it. Also had to add `cellar-viz:` to the main window's own `frame-src` (in `electron.vite.config.ts`), since a scheme that isn't explicitly allowed to be framed can't be embedded at all regardless of its own CSP. Verified by writing a message directly into the conversation DB (bypassing model generation, which turned out to be too unreliable at reproducing a literal marker to use as a test oracle) and confirming a real Chart.js pie chart renders pixels inside the sandboxed `cellar-viz://` iframe.
- **v7.0.3 styling:** the always-visible "Visualization / Preview / Code / reload" header bar didn't match the seamless, borderless look of the reference pattern (chart floating directly in the message, no toolbar). Reworked `InlineViz.tsx`: no persistent header in the success case — the Preview/Code toggle and reload button are a small `absolute`-positioned overlay in the top-right corner, hidden (`opacity-0`, `pointer-events-none`) until the card is hovered (`group/viz` + `group-hover/viz:` Tailwind named group). The failure banner stays always-visible (with its own retry button), since silently losing the one indicator that something went wrong would be worse than a little extra chrome. Confirmed the compiled CSS rule targets the right selector; **could not get a clean automated screenshot of the hover state** — Playwright's synthetic `mouse.move()` doesn't reliably propagate `:hover` across a sandboxed/opaque-origin iframe's hit-test boundary (confirmed by the identical mechanism working fine on a plain non-iframe sidebar link in the same run), a known category of CDP/iframe automation limitation, not a product bug.
- **Playwright:** `[data-block-type="figure"] svg` also matches every Lucide icon in the block toolbar — match the figure's own class. A block added below the fold needs `scrollIntoViewIfNeeded()` before `boundingBox()`, or the synthetic mouse draws outside the window and nothing is drawn.

## M7.1 Seamless inline visualizations (v7.1.0)

The M7 blocks rendered, but they read as *panels pasted into* a message rather than part of it: a bordered card, a fixed 320px frame with its own white page inside, a Preview/Code toggle, and a single `html viz` block that asked every model to hand-write a whole Chart.js page. Reworked so a visual sits in the conversation the way a paragraph does, and so a 2B local model can produce one.

- **Three block types instead of one** (`src/shared/viz.ts`, one tolerant info-string parser):
  - ` ```chart ` — a JSON spec Cellar draws itself with the existing `chartSvg` from the Design page. No model-written drawing code, so it cannot come out broken; `normalizeChart` already accepts Chart.js-shaped `datasets`/`data`, string numbers and `[{label,value}]` pairs, and `parseChartSpec` adds repairs for the JSON mistakes models actually make (`//` comments, trailing commas, a sentence wrapped around the object). This is the "classic graph maker": the model chooses what to show, Cellar computes and draws it — the same division of labour as the M6 calculator.
  - ` ```svg viz ` — mounted **directly in the message DOM** (sanitized by the existing `sanitizeSvg`), not in an iframe, so text is real page text, it inherits the chat's font and `currentColor`, stays crisp at any zoom, and downloads as a true vector.
  - ` ```html viz ` — still the sandboxed `cellar-viz://` frame, now only for things that must react to the user.
- **Seamless by construction:** no border, no card, no background, full message width. The frame serves a transparent document with the chat's own CSS variables injected under the names models already reach for (`--text-primary`, `--text-secondary`, `--border`, `--accent`, `--chart-1…8`) plus `color-scheme`, so native range inputs and scrollbars match the theme. Everything follows the live theme/accent/font through `useVizTheme` (a `MutationObserver` on `data-theme`/`style`, the `TerminalPane` pattern).
- **The frame is exactly as tall as its content.** A bootstrap script reports `document.body.scrollHeight` back over `postMessage` and the parent sizes the iframe to it — no inner scrollbar, no empty band, no fixed height to guess.
- **Chart.js arrives pre-themed.** `Object.defineProperty(window, 'Chart', …)` intercepts the CDN's assignment before the model's own script runs and sets colors, fonts, grid, arc borders and legend placement, plus a small plugin that fills in `backgroundColor`/`borderColor` from Cellar's palette when the model named none. A bare `new Chart(el, {type:'pie', data})` now comes out looking like the rest of the app in both themes.
- **Hover-only `⋯` menu** (Copy to clipboard / Download PNG / Download SVG / Show code / Copy code / Reload), matching the reference. Vector kinds export from their own source; the sandboxed frame is asked for its drawing over `postMessage` (`XMLSerializer` for an SVG, `canvas.toDataURL()` for a canvas). PNGs are painted at 2× onto the chat background through the new `viz:saveAs` IPC.
- Verified end to end against the user's own Claude-produced files (`radial_geometric_pattern.svg`, `minimax_tree.svg`, the Chart.js pie/stacked-bar/compound-interest fragments): all render pixel-close to the originals in both themes, and Download PNG/SVG produce a real 1360×640 PNG and a sized vector.

### Technical notes learned in M7.1

- **`MenuTrigger asChild` cannot wrap `IconButton`.** `IconButton` renders its child inside `Tip`, a plain function component that only forwards `children` — the trigger props Radix passes through `asChild` are silently dropped and the menu never opens. Every other menu in the app wraps a bare `<button>`; do the same.
- **`requestAnimationFrame` does not run in an off-screen cross-origin iframe.** Chromium throttles rendering there, so an rAF-based throttle (`if (queued) return; queued = true; rAF(...)`) latches `queued` at true forever and the frame stays at its placeholder height the moment it is scrolled out of view. Timers still fire; throttle with `setTimeout`. Reproduced only when another test scrolled the block away first — a single-test run passed.
- **A backtick in a comment inside a template literal ends the template.** The injected bootstrap script is one big
  template string; writing ``// ...would leave `queued` stuck...`` in it silently turned the tail of the script into
  an expression. `npm run build` accepted it (esbuild does not resolve identifiers) and the e2e suite still passed,
  so only `tsc` caught it — run the typecheck before trusting a green build when editing that string.
- **`sanitizeSvg` writes `width="100%"`**, and a size parser that reads the leading digits off an attribute turns a 680-wide diagram into a 100×100 export. Prefer the `viewBox`, and reject any width/height that is not plain pixels.
- **`fetch('data:…')` is blocked by the renderer's `connect-src 'self'`**, so a data URL has to be decoded by hand (`atob` → `Uint8Array` → `Blob`) before it can go on the clipboard.
- **SVG rasterized through an `<img>` cannot load the app's bundled webfonts** (external resources are blocked inside an SVG image), so exported PNGs fall back to the system sans. Claude's own exports have the same limitation.
- **`sanitizeSvg` keeps in-document `url(#id)` references**, so `<marker>` arrowheads and gradients survive; only external ones are dropped.
- **Playwright:** `[data-viz="…"] svg` also matches the Lucide icon in the hover menu — filter with `:not(.lucide)` (same trap as the Math figure toolbar). An element `.screenshot()` scrolls, which drops `:hover`, so re-hover immediately before clicking hover-revealed chrome.
- **Mock server:** a fixture prompt keyed on a word like `viz` will also match a test that *pastes markup containing that word*. The paste-through branch (a prompt that is itself a fenced block comes back verbatim) has to be checked first.

## M8 Tier 3 wishlist — delivered

Four capabilities from the Tier 3 list, each opt-in and each reusing machinery the app already had
rather than growing a parallel one.

### 3.1 Built-in Chromium browser (`src/main/browser/`)

The "browser extension" idea is replaced by a browser Cellar owns. Each tab is a `WebContentsView`
parented to the app window and painted over a rectangle the new side panel reports, so pages share
the app's **default session** — its cookies, its logins, its proxy — with no second sign-in and no
extension to install.

- **Panel** (`BrowserPanel.tsx`): tab strip, address bar, back/forward/reload, resizable, with a
  `ResizeObserver` keeping the native view over the panel's rectangle (scaled by the window's zoom
  factor, since the panel measures in CSS pixels and view bounds are window pixels). Openable by hand
  from the composer tools menu; a browser tool also reveals it, so the user watches what the model does.
- **Tools:** `browse_open`, `browse_read`, `browse_url`, `browse_back`, `browse_forward`,
  `browse_reload`, `browse_click`, `browse_fill`, `browse_scroll`, `browse_tabs` (8 tabs max).
  `browse_read` runs the page's `outerHTML` through the same `htmlToText` reader `web_fetch` uses.
- **Containment:** pages load sandboxed, context-isolated, with no preload and node integration off;
  permission requests (camera, microphone, location, notifications) are denied; navigation is
  http(s) only, so a page can never hand a URL to the operating system; a window-open becomes a new
  tab. Opening a host the user did not name asks first, and "always allow" remembers that host for
  the task. Plan and Ask modes drop `browse_click` and `browse_fill`.
- **Off by default** (Settings → Capabilities): ten tool schemas are a real slice of a 16K context,
  and browsing the user's own logged-in session is something to opt into. The panel itself is always
  available.

### 3.2 `call(module, task)` (`src/main/modules/`)

One interface for a chat to hand work to the rest of Cellar. Every module takes `{ action, params }`
and answers `{ status, result, stdout? }`.

- `cellar-math` (`calculate` / `solve` / `quiz` answered by Cellar's own exact calculator, plus
  `create_board` and `export`), `cellar-design` (`create`, `export`), `cellar-code` (`run`,
  `diagnostics`), `cellar-cowork` (`run`), `cellar-voice` (`info`, `transcribe`, `speak`).
- **Long-running work** cannot finish inside a tool call, so those actions start a real conversation,
  answer with a `task_id`, and the caller polls `{ action: "status", params: { task_id } }`
  (`cancel` and `actions` too). The delegated conversation appears in the sidebar, so the user can
  watch it and answer its approval cards. Delegated exports land in `~/.cellar/chat/exports`.
- **Rate limited** per module on a sliding one-minute window (5 by default, Settings →
  Capabilities); polling a job is never limited. Anything not read-only asks the user first.
- `normalizeCallArgs` absorbs the shapes models actually send: a flattened `{module, action, params}`,
  a `task` that arrived as a JSON string, a bare action name, `arguments` instead of `params`, and a
  module name without the `cellar-` prefix.

### 3.3 Self-scheduling (`create_reminder`)

A reminder is a **one-shot row in the scheduled-task table** with a `fire_at` instant instead of a
cron schedule (migration 7 adds `one_shot`, `fire_at`, `reminder`). Riding on 1.3's machinery is the
point: the reminder survives the session that made it, the app being quit and the machine sleeping,
and the same OS wake job relaunches Cellar for it.

- `create_reminder(delay_seconds, message?, task?, email_check?)`: `message` posts a note into the
  conversation, `task` comes back to the model as a new request in it, `email_check` asks the model
  to read a named inbox **through whatever email connector the user has** and summarize what is new —
  Cellar has no mail client of its own, and the prompt says plainly not to invent messages when no
  connector offers email.
- The tick disarms a one-shot before running it, so a slow run can never fire it twice, and an exact
  timer covers reminders due sooner than the next 20s tick. Delays are parsed the way models write
  them ("10 minutes", "1h 30m", 600) and clamped to 10s–31 days.
- Reminders that run work ask first; a plain note does not. Incognito chats cannot set one (nowhere
  to fire). They show under Scheduled as "Once · at <time>", where they can be cancelled.

### 3.4 Voice: streaming transcription and spoken replies

- **Newer whisper.cpp builds.** `VARIANT_ASSETS` learns the CUDA 13 Windows x64 asset, and Cellar
  asks GitHub which builds a recent release actually ships (cached 6h) instead of assuming: Settings
  lists only those, and says when a newer release exists for the installed build.
  `recommendedWhisperVariant` sends Blackwell (compute ≥ 10 with an R580+ driver) to CUDA 13 and,
  when there is no CUDA 13 to send it to, to **CPU** rather than CUDA 12 — whose kernels stop at
  compute 9.0 and JIT into the ~70× regression measured on the RTX 5060.
- **Streaming transcription.** Dictation used to re-transcribe the whole clip every 2.5s, so each
  tick got slower as you talked. Now the tail past the last commit is re-transcribed every ~1.2s for
  the preview, and once that tail passes ~8s the text up to the last natural pause is transcribed at
  full quality and *frozen* — `findSilenceBoundary` (`src/shared/audio.ts`) picks the cut, keeping
  clear of the first 2s and last 0.9s so it never splits a word. Work per tick is bounded however
  long someone talks; stopping transcribes only what is uncommitted. A short recording commits
  nothing and is still transcribed whole in one pass.
- **Spoken replies.** "Speak replies" stays off by default and the system voices stay the default
  engine; picking piper downloads the rhasspy build and one voice, and main renders each utterance
  to a WAV the renderer plays (it owns the audio output). If piper is missing or fails, speech falls
  back to the system voices instead of going silent.

## M8.1 Undo in Cowork, git beyond commit, and memory on demand

Two gaps carried since M2 and M3, plus a way to ask for memory rather than wait for it — each closed
by extending machinery that was already there rather than adding a parallel one.

### Undo for Cowork file changes

Code sessions outside git already saved the original of every file before first changing it
(`code/snapshots.ts`, driven by `ToolContext.beforeChange`), which is what let their Changes pane
diff and discard without a repository. Cowork tasks passed `beforeChange: undefined`, so nothing was
kept and nothing could be undone.

- `agent/runner.ts` now installs the hook for **any** task without git (`!code || !code.isGit`), so
  Cowork gets snapshots on the same code path. Git Code sessions still pass `undefined` — the
  checkout's own history is the better record there.
- New `tasks:changes` / `tasks:fileDiff` / `tasks:revertFile` handlers reuse `snapshotChangeSet`,
  `snapshotFileDiff` and `snapshotDiscardFile` unchanged; Cowork never uses git, so the snapshot path
  is the only one they need.
- A **Changes** section in the task side panel lists what the task changed with +/− counts, expands
  to the diff (the existing `DiffView`, not Monaco — it has to read in a 320px panel), and undoes one
  file at a time behind a confirm step. Reverting an edit restores the original; reverting a created
  file deletes it.
- `chat:delete` now drops a conversation's snapshots, the way `code:deleteSession` already did.

### `/update-memory`

Memory generated from chats already existed as a background pass (`customize/memory-auto.ts`), but it
only ran on its own, 90 seconds after a conversation went idle and only with the setting on. The same
extraction is now also reachable on demand.

- `runAutoMemory` takes a `force` flag and returns what it did (`MemoryUpdateResult`: titles saved,
  titles removed, or a reason nothing was kept). The automatic and on-demand paths are the same code.
- `/update-memory` is a built-in command in every composer. It runs the pass whether or not automatic
  memory is on, and whether or not the conversation changed since the last pass — the user asked for
  it. **Incognito chats still refuse**, as they do everywhere else.
- Saving nothing is a normal outcome, not a failure: "Nothing saved — nothing here was worth
  remembering" rather than an error, so the command is safe to type on any chat.

### Pushing, pull requests and conflict resolution

- **Push** (`code:push`): `git push -u origin <branch>` the first time, plain `git push` once the
  branch tracks. Offered whenever the session has a branch and a remote is configured.
- **Pull requests** (`code:createPullRequest`, `code/gh.ts`): shells out to the **GitHub CLI**, so
  Cellar never handles a token — `gh` already carries the user's own sign-in. The button appears only
  for a worktree session on a GitHub remote whose branch differs from its base; a missing or
  signed-out `gh` comes back as instructions rather than a failure. An existing PR for the branch is
  detected (`gh pr view`) and offered as "View pull request" instead.
- **Conflicts:** `mergeSession` no longer aborts when a merge conflicts. It leaves `MERGE_HEAD` in
  place and reports the conflicted files, and a "Resolve merge conflicts" dialog edits them with
  git's own `<<<<<<<` markers in a Monaco editor — the same thing a person does on the command line,
  which is why no three-way merge editor was needed. "Continue merge" refuses while any marker is
  left, then stages **only** the conflicted paths and commits; "Abort merge" is always available.
  Any other merge failure still aborts and cleans up as before.
- A merge already sitting in the checkout (one Cellar did not start) surfaces as a banner with a
  Resolve button instead of opening the dialog by itself.

Tests: 296 unit tests (8 new: the agent loop snapshotting and undoing a Cowork edit end to end, the
conflict continue/abort flows, GitHub remote-URL matching, a real push to a local bare remote, and
`/update-memory` keeping, dropping and refusing) and 20 Playwright tests (1 new). The Cowork test now
also undoes the file it wrote; the memory test types `/update-memory` on a chat worth remembering and
on one that is not; the new Code test commits, pushes to a bare remote, hits a real conflict, resolves
it in the dialog's editor and continues the merge.

### Technical notes learned in M8.1

- **Conflict resolution happens in the repository, not the session's worktree.** A worktree session
  merges its branch into the base branch checked out in `repoRoot`, so the conflicted files are in
  `repoRoot` — which the Files pane (scoped to `workspace.root`) cannot reach at all. The dialog
  needs its own repoRoot-scoped IPC, with containment checked through `Workspace.open(repoRoot)` and
  the path verified against the live conflicted-file list rather than trusted from the renderer.
- **`git add -A` after resolving is too broad**: it sweeps unrelated files in the checkout into the
  merge commit. Stage the conflicted paths explicitly (`add -A -- <paths>`, which still handles a
  delete/modify conflict).
- **The e2e suite runs the built bundle** (`out/`, via `package.json`'s `main`), not the sources —
  `npm run build` before `npx playwright test`, or Playwright silently tests the previous build.
- **A Code session that is still open holds its worktree on Windows**, so a test that does not delete
  the session through the UI must clean up with `rmSync(..., { maxRetries, retryDelay })` inside a
  try/catch — the same lock `removeWorktree` already retries around.

### Technical notes learned in M8

- **`WebContentsView` bounds are window pixels, the renderer measures CSS pixels.** They differ by
  `webContents.getZoomFactor()`, so a zoomed window puts the page in the wrong place unless the
  panel's rectangle is scaled by it.
- **A native view floats above the whole renderer.** Leaving the browser panel open changes every
  later layout — an end-to-end test that opened it and walked away made a *different* test's approval
  button unclickable. The panel closes the artifact panel and vice versa for the same reason.
- **`executeJavaScriptInIsolatedWorld` shares the DOM but not the JavaScript context**, which is what
  makes `click`/`fill`/`read` safe against a page that has redefined `Element.prototype.click` or
  `JSON.stringify`.
- **A circular import bites at module-evaluation time, not at call time.** `tools/index.ts` →
  `call.ts` → `modules/registry.ts` → `chat/orchestrator.ts` → `runner.ts` → `tools/index.ts` left
  `MODULE_IDS` undefined inside `z.enum(...)`, which fails with "Cannot convert undefined or null to
  object" from zod rather than anything about imports. The fix is a leaf module (`modules/catalog.ts`)
  holding what both ends need at load time; function bodies can keep the cycle.
- **`tsconfig.node.json` does not include `src/renderer`**, so a unit test cannot import a renderer
  module even when the code in it is pure. Pure helpers that tests want belong in `src/shared`.
- **A one-shot schedule needs an instant, not a cron expression.** Five-field cron has minute
  granularity and repeats yearly, so `fire_at` plus `one_shot` is simpler than trying to express
  "once, in 90 seconds" as a pattern — and the row still feeds the existing OS wake job unchanged.
