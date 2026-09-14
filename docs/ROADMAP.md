# Cellar roadmap

Source of truth for milestone goals. The original Milestone 1 plan is at
`C:\Users\w11\.claude\plans\cellar-cellar-is-an-glowing-jellyfish.md`.

| Milestone | Scope | Status |
| --- | --- | --- |
| **M1 Foundation** | App shell, Chat, Projects, Artifacts, incognito, Model Hub, all backends | ✅ Done 2026-09-13 |
| **M2 Cowork** | Local agent that works inside a folder you choose | ✅ Done 2026-09-13 |
| **M3 Code** | Coding agent for repositories | ✅ Done 2026-09-14 |
| **M4 Customize, Scheduled, Voice** | Skills, MCP connectors, plugins, scheduled tasks, dictation, embeddings RAG | Next |
| **M5 Design** (optional) | Canvas for mockups and slides | Planned |

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

## M5 Design (optional) — goals

Multi-artboard canvas for mockups, slides and visual layouts generated by local models; visual editing of elements; PNG/PDF export.

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