# Changelog

Every entry here is a real released version. See `docs/ROADMAP.md` for the fuller
milestone-by-milestone story of how Cellar got here.

## 7.5.0 — 2026-09-18
**Usage stats and this changelog**

### Added
- Settings > Usage: sessions, messages, total tokens, active days, peak hour and favorite model, with an activity heatmap and a per-model token chart.
- "View changelog" in the profile menu, so you can see what changed without leaving the app.

## 7.4.0 — 2026-09-17
**Undo, git and memory**

### Added
- Undo for anything Cowork changed in your folder, from the task's Changes panel.
- Push, open pull requests, and resolve merge conflicts without leaving Code.
- Cellar now builds memory from your past chats on its own; ask for a refresh any time with `/update-memory`.

## 7.3.0 — 2026-09-17
**Fewer interruptions**

### Changed
- Pausing on repeated identical tool calls is now a toggle instead of always-on.
- Cut down on screenshot spam during browser-driven tasks.

## 7.2.0 — 2026-09-17
**Tier 3 wishlist**

### Added
- A built-in Chromium browser the agent can open, read, click and fill.
- `call(module, task)` so a chat can delegate work to Cowork, Code, Design, Math or Voice.
- Reminders a model can schedule for itself with `create_reminder`.
- Streaming voice dictation and spoken replies.

## 7.1.0 — 2026-09-17
**Seamless inline visualizations**

### Changed
- Inline visualizations render as proper chart / SVG / HTML blocks now, borderless with hover-only controls, instead of a separate fenced-off panel.

## 7.0.3 — 2026-09-16
### Changed
- Inline visualizations are borderless by default, with controls that only appear on hover.

## 7.0.2 — 2026-09-16
### Fixed
- CDN-script content inside inline visualizations wasn't actually rendering.

## 7.0.1 — 2026-09-16
### Fixed
- The HTML visualization marker regex rejected a trailing `title` attribute.

## 7.0.0 — 2026-09-16
**Inline capabilities (M7)**

### Added
- Inline visualizations: sandboxed charts, diagrams and small widgets drawn straight into a reply.
- Inline images: models can search for and drop in a relevant photo with `[[image: query]]`.

## 6.0.0 — 2026-09-16
**Math (M6)**

### Added
- Math study boards: an exact calculator, worked steps, figures, graphs, practice tests and a whiteboard.

## 5.0.0 — 2026-09-15
**Design (M5)**

### Added
- A canvas editor for mockups and slides, model design tools, and better-themed document exports.

## 4.0.0 — 2026-09-15
**Customize, Scheduled, Voice (M4)**

### Added
- Skills, MCP connectors and plugins under Customize.
- Scheduled tasks that run on their own.
- Voice dictation, spoken replies, and embeddings-based project knowledge search.

## 3.0.0 — 2026-09-14
**Code (M3)**

### Added
- Code mode: a coding agent for repositories, with worktrees, diffs, an integrated terminal and a live preview.

## 2.0.0 — 2026-09-14
**Cowork (M2)**

### Added
- Cowork: a local agent that works through a task inside a folder you choose, with its own tool suite and task view.

## 0.1.0 — 2026-09-13
**Foundation (M1)**

### Added
- First release: app shell, Chat, Projects, Artifacts, incognito mode, the Model Hub, and support for llama.cpp, Ollama, LM Studio and Unsloth Studio.
