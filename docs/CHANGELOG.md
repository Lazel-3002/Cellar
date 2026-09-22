# Changelog

Every entry here is a real released version. See `docs/ROADMAP.md` for the fuller
milestone-by-milestone story of how Cellar got here.

## 8.0.0 — 2026-09-23
**Study: your book beside a tutor**

### Added
- Study, a new mode in the sidebar: open a PDF — a textbook, a worksheet, your notes — with the tutor on the left and the pages on the right. Cellar keeps its own copy; your original file is never changed.
- Write on the pages like paper: highlighter, pen, marker, typing on the page, sticky notes, eraser and undo. Select text to highlight it, ask about it or have it explained. Zoom with the menu or Ctrl + mouse wheel; the page opens fitted to the view.
- Choose what the tutor reads with your message: this page, from the chapter start to here, pages you type, or the whole book (searched for your question when it is too long), with a token estimate.
- Tutor mode gives hints and checks your work like a teacher — a ✓ or ✗ with a few words next to your answer — without giving away questions you have not tried. Solve mode writes the answers onto the page in its own colour, right on the printed blank.
- Page numbers in the tutor's replies are links that turn the page, and vision models get a picture of the page when it is scanned or has your handwriting on it.
- Export with my notes: a copy of the PDF with your writing, the tutor's marks and notes drawn in.
- Design: named version history, a grid and rulers, transitions in Present, image crop and filters, your own fonts (from a file or Google Fonts, embedded in exports), and clickable hotspots that link to another artboard or a web page.
- Design: a vision-capable model is shown a screenshot of the artboard it just made or changed, instead of only the text outline.
- Math: step-by-step diagrams the board draws in one step at a time, with a unit-circle preset for sin, cos, tan and cot; dashed, dotted, zigzag and see-through lines; a whiteboard highlighter and text tool.
- A plugin marketplace page that searches GitHub for plugins.
- `/context` shows how full the model's context window is and what fills it.
- Memory recalls the topics that matter to what you are asking, by meaning, instead of sending all of them.

### Fixed
- Design → PowerPoint: gradient fills used to flatten to their first colour; they are now exported as a picture of the exact gradient. Cowork's `create_pptx` shares the fix.

## 7.7.0 — 2026-09-18
**Following up with one model**

### Added
- Playground: carry on with one model on its own. **Follow up** under an answer aims the next prompt at that side only, and a turn the agent loop paused (a model stuck repeating the same tool call, or out of steps) now has a **Continue** button that picks it up where it stopped instead of leaving you to guess. The other model sits the round out and its column says so.
- Playground: the tools menu from the composer — web search, memory, run commands, approval mode, the browser, connectors and skills — so both sides can be compared with the same tools on.

## 7.6.0 — 2026-09-18
**Playground**

### Added
- Playground: ask two models the same prompt and read their answers side by side, with tok/s, tokens and time to first token under each. They take turns — the second model starts only once the first has finished, so neither is slowed down by sharing the GPU — and both sides run as incognito chats, so nothing is saved.
- A search box over the Settings sections.

### Changed
- A GGUF that llama.cpp cannot load now says what is usually wrong — a vendor-specific low-bit quant needing a custom llama.cpp fork — instead of only the raw loader error.

## 7.5.1 — 2026-09-18
### Fixed
- "Check for updates" always failed silently: `electron-updater`'s `autoUpdater` export is a lazy getter that Node's CJS/ESM interop doesn't surface as a named export, so it was always `undefined`. Auto-update had never actually worked before this fix.

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
