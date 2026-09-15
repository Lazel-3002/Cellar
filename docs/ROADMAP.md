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
- **Release:** no auto-update and no code signing.

---

## M2 Cowork — delivered

Cowork mode on the home screen starts a task: pick a folder (or a project's instructions), or skip and Cellar makes a task folder. The agent plans, works through tool calls, asks before changes, and reports back. Tasks live under "Chats and tasks" with a live status marker (working / needs approval / failed).

- **Agent loop** (`src/main/agent/runner.ts`): one assistant message per turn holding ordered parts (text, thinking, tool steps, compaction), streamed to the UI and saved after every step.
  - Native tool calling on llama.cpp (`--jinja`, `parallel_tool_calls`), Ollama (`tools`, whole calls with ids) and OpenAI-compatible servers; a `<tool_call>` JSON text protocol (with stop sequences) for models without native tools, also used to rescue calls a server left in the text.
  - Tolerant argument handling: loose JSON repair, name aliases (`ReadFile`, `functions.read_file`), argument aliases, zod validation with readable errors fed back to the model.
  - Step limit (default 40, then "Paused… reply continue"), loop detection (4 identical calls stop the task; the counter resets after any change), empty-reply nudge, cancel everywhere (model stream, approvals, running commands).
  - Context: tool output sized to ~30% of the window; older results trimmed first, then earlier work is summarized into a `compaction` part placed in front of the latest request; a clear error when even that cannot fit.
- **Tools** (`src/main/agent/tools/`): `list_dir`, `read_file` (text plus PDF/DOCX/PPTX/XLSX extraction, paged), `write_file`, `edit_file` (exact unique match, CRLF-aware), `glob`, `grep`, `todo_write`, `run_command` (Windows PowerShell, UTF-8 output, timeout, process-tree kill), `web_search` (DuckDuckGo HTML or SearXNG JSON), `web_fetch` (readable text + links, PDFs), `create_docx` (Markdown → Word via `docx`), `create_xlsx` (`exceljs`, header row + formulas), `create_pptx` (`pptxgenjs`, title/bullets/notes), `create_pdf` (Markdown → HTML → Chromium `printToPDF` in an offline, script-free window).
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
- **No undo** for agent file changes (M3's diff viewer and worktrees are the place for that); `run_command` output is shown when the command ends, not streamed.
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
- **Git:** no pull requests, pushes or conflict resolution UI. Merge refuses and explains when the base checkout is dirty or conflicts appear.
- **Snapshots** track only edits made through the file tools and the editor, not files changed by commands (git sessions see everything).
- **Preview:** PDFs do not render in the sandboxed preview frame (use "Open"). Non-localhost web pages open in the browser.
- **Editor:** Monaco has syntax highlighting only (no language servers or IntelliSense).
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
- **Chat tools** need native tool calling; models on the text protocol chat without tools. DuckDuckGo and Brave can still rate-limit bursts; SearXNG remains the robust choice.
- **Scheduled tasks** run only while Cellar is running (in the notification area); there is no wake-from-sleep or Windows Task Scheduler integration. A Cowork run in Ask mode waits for approval while you are away.
- **Voice:** the CUDA 12 whisper.cpp build predates RTX 50-series support (the CPU build is recommended there); there is no streaming transcription or voice mode for replies.
- **Diagnostics:** TypeScript files get syntax checks only (type errors need `get_diagnostics`, which runs tsc); no language servers.
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
