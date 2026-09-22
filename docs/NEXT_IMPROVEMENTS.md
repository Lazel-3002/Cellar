# Next improvements

> **Checked against the code on 2026-09-23 (release 8.0.0): several items below say "shipped" but are not
> in the source.** There is no ODF/EPUB/RTF reading (`odsText`, `extractEpub`, `rtfToText`), no
> `reflowArtboard`, no `solveGeometry` or `solveNonlinearSystem`, and `src/main/agent/tools/background.ts`
> exists but is not wired into `run_command` (no `read_command_output` / `stop_command` tools). The
> versions 7.9.0 and 7.10.0 mentioned below were never released. Treat those items as still open.

Investigated by reading the actual gap in code (not just restating ROADMAP prose), most important
first. "Effort" is relative to the milestones already shipped, not absolute.

Items 1–5 below were the list as of 2026-09-18. Everything except the two "larger" tails is now
shipped in 7.9.0; what is left is at the bottom under **Still open**.

## 1. Math: read a photo of handwritten work into a board — small, high value ✅ shipped

The only item from the original Creator Ideas math note that M6 didn't deliver ("a photo of a page
cannot be read into a board yet"). Turns out the plumbing already exists: the Math composer
(`Composer.tsx`, `variant="math"`) already lets you attach an image, and `history.ts`'s
`withAttachments`/vision path already forwards it to a vision-capable model exactly like Chat does.
The actual gap is one file: `src/main/math/prompt.ts` never tells the model an attached photo is
something to *transcribe into board blocks* rather than just describe in prose.

**Done:** added rule 6 to `buildMathPrompt`'s rule list — read an attached photo/screenshot and
rebuild it as real blocks (formula, given values, a figure for any drawn shape), still recomputing
every number through `calculate` rather than trusting a number seen in the image, and asking rather
than guessing if part of it is unreadable.

## 2. Cowork/Code: `run_command` cannot run anything long-lived — medium ✅ shipped

`src/main/agent/tools/command.ts` only offers a fully blocking `runShell` with a 600s hard cap, so a
model can't start a dev server and keep talking to it — Code's Terminal pane (node-pty) can do this,
but Cowork's agent tools can't. Add a background mode: `run_command({ background: true })` spawns
detached, returns a `command_id` immediately, and two new tools (`read_command_output`,
`stop_command`) poll/kill it, mirroring the `task_id` pattern the M8 `call()` module already uses for
long-running work.

**Done:** `src/main/agent/tools/background.ts` is a small in-process registry (spawn detached,
capture output up to the same 2MB cap `runShell` uses, evict the oldest 20+ ended entries so it can't
grow forever). `run_command` takes `background: true` and returns a `command_id` immediately instead
of waiting; `read_command_output`/`stop_command` poll and kill it. Wired into the same places
`run_command` already was (Cowork, Code, and Chat when "Run commands" is on), the `/tools` listing,
and the transcript's tool-step labels. Background commands for a conversation are killed when that
conversation is deleted (same place `terminals.killForConversation` already runs) and on app quit
(same place `terminals.disposeAll()` already runs). Code's own system prompt, which used to tell the
model outright not to start servers with `run_command`, now points it at `background: true` for
anything it needs to poll itself, while still sending the user to the Terminal tab when *they* want to
watch or use the server. Covered by two new tests in `tests/unit/agent-tools.test.ts`; full suite
(307 tests) still green.

## 3. `read_file` can't read legacy Office formats (.doc/.xls/.ppt) — medium ✅ shipped, differently

The original note proposed adding SheetJS to parse legacy `.xls`. That was reconsidered: the npm
`xlsx` package is pinned at 0.18.5 with known prototype-pollution/ReDoS advisories, and it buys one
obsolete format. The same effort spent on **formats that need no dependency at all** covers far more
of what people actually have on disk.

**Done:** `DOCUMENT_EXTENSIONS` now also covers `.odt`, `.ods`, `.odp`, `.epub` and `.rtf`.
OpenDocument and EPUB are ZIP + XML exactly like OOXML, so JSZip (already a dependency) reads them:
`odfText` handles ODF's tab/break/repeated-space tags, `odsText` expands the run-length encoding ODF
uses for repeated cells and rows (and drops the million empty tail rows Calc writes), `odpText` splits
on `draw:page`, and `extractEpub` reads `META-INF/container.xml` → the OPF manifest and spine so
chapters come back in reading order. RTF is parsed directly by `rtfToText`: a group walker that skips
the destinations that are never body text (`fonttbl`, `pict`, `object`, …) and decodes `\par`, `\tab`,
`\'hh` and `\uN` — including the `\ucN` fallback characters that follow a `\uN`, which is the part
naive RTF strippers get wrong.

`.doc`/`.xls`/`.ppt` are in `DOCUMENT_EXTENSIONS` too, not because they can be read but so the answer
is useful: the bytes are sniffed first, so a modern file someone renamed to a legacy extension (or an
RTF or PDF wearing a `.doc` name) is read normally, and only a genuine OLE/CFB file gets the
explanation "Word DOC is the old binary format… save as .docx, then read that."

## 4. Design: rich text spans and growing text boxes — larger ✅ shipped

Known gaps since M5: inline formatting was bold-only, and a text box that overflowed didn't push
sibling elements down.

**Done (spans):** `inlineRuns` in `src/shared/design/text.ts` was a single `**bold**` regex; it is now
a small recursive tokenizer producing runs with `bold`/`italic`/`strike`/`code`/`link`, nested in any
order (`**bold _and italic_**` works). Backticked text is literal, so `` `code **stays**` `` keeps its
asterisks; an underscore only opens a span at a word boundary so `snake_case_name` survives; an
unmatched marker stays as the text it is. Inline `[label](url)` hrefs are restricted to
`http(s):`/`mailto:`/fragment/root-relative — the text comes from a model, so a `javascript:` URL is
dropped and the label kept as plain text. All four consumers render the new runs: the canvas
(`ArtboardView.tsx`), HTML/PDF export (`render.ts`, links become real `<a>`), PowerPoint
(`pptx.ts`, mapped to pptxgenjs `italic`/`strike`/`fontFace`/`hyperlink`), and `plainText` — which
feeds every height estimate and layout check — now strips all of the new markers rather than just
asterisks.

**Done (growing boxes):** `reflowArtboard` in `src/shared/design/layouts.ts` grows any text box past
the same overflow tolerance `checkArtboard` complains about, then pushes down only the elements that
start below it *and* overlap it horizontally, so a caption in the next column isn't dragged along. It
is idempotent, and deliberately allowed to grow past the artboard edge — `checkArtboard` then reports
that, which is the more useful complaint. Exposed as `edit_elements({ reflow: true })`.

**Not done:** inline *color* runs within a line, and reflow as an automatic always-on behavior rather
than an opt-in flag. Both are follow-ups; the second especially wants care, since silently moving
elements under a person mid-edit is worse than leaving the layout check to say so.

## 5. Math solvers: nonlinear systems and geometry beyond triangles — larger, niche ✅ shipped

`solve.ts` covered linear/quadratic/log/exp/trig equations and linear systems, but not nonlinear
systems or non-triangle geometry.

**Done (geometry):** `solveGeometry` covers 15 shapes across the plane and solid syllabus. The
arithmetic runs on a small `Quantity` type — the existing exact `a·√r` engine plus a π exponent —
so `25π`, `6√3` and `36π` come out as themselves rather than decimals, with the decimal relegated to
the note. A regular polygon's area is exact for n = 3, 4 and 6 (where `tan(180°/n)` is) and numeric
otherwise, which is stated rather than hidden. Triangles take either three sides (Heron, with the
triangle inequality actually checked) or a base and height.

**Done (nonlinear systems):** `solveNonlinearSystem` prefers the school method — if either equation is
linear, solve it for one unknown, substitute (a real tree substitution, so the printed step is the
substituted equation), and take exact roots of the resulting linear/quadratic. Otherwise it falls back
to Newton's method from a grid of starts, de-duplicated, with each surviving pair checked back into
both equations and the residual shown. Pairs are always reported left-to-right in the first unknown,
and the unknowns are sorted alphabetically, so the answer reads as `(x, y)` however the equations
were written.

**This uncovered a real bug in shipped code.** `linearCoefficients` confirmed linearity by sampling a
single point (all variables = 1). `x² + y²` passes that check by coincidence — `1 + 1` is also
`1·1 + 1·1` — so `solveSystem` accepted `x² + y² = 25` as linear and solved it as `x + y = 25`,
silently returning a wrong answer. It now checks five points that a quadratic cannot fake. Regression
test added.

## Still open

Inline colour runs shipped in 7.10.0. The rest of this list is what six read-only audits
(2026-09-19/20, covering agent tools + Code + browser, chat/providers/runtimes, customize/connectors/
scheduled/voice/rag, the renderer, the maths engine, and Design + exports) turned up and that was
**deliberately not done** in that pass — everything else they found is in the 7.10.0 changelog.

### Worth doing next

- **PowerPoint drops image opacity, CSS filters and corner radius.** The canvas and every
  Chromium-rendered export share `imageStyle`, which applies `brightness`/`contrast`/`saturate` and a
  border radius; `pptx.ts`'s image branch reads none of them, and `opacity` is dropped for lines,
  charts and SVGs too. A dimmed hero photo behind white text exports at full brightness and the text
  becomes unreadable. Opacity and full-round radius are direct pptxgenjs options; filters want the
  existing `PptxAssets.gradient` rasterizer generalised to composite an `<img style="filter:…">`.
  Medium.
- **The SVG export only renders in a web browser.** `artboardSvg` wraps the HTML in a
  `<foreignObject>`, which is blank in Illustrator, Figma, Inkscape, resvg, and even in an `<img>`
  tag — i.e. everywhere someone would actually open a vector export. It also silently drops hotspots.
  Either emit real SVG primitives (shapes and charts already have exact geometry; text needs
  `<text>`/`<tspan>` per run using the existing wrap estimate) or label the menu item "SVG (web)".
  Large for the honest fix.
- **PNG export cannot produce a transparent background** even though an artboard's background can be
  set to `transparent` — the capture `BrowserWindow` is opaque, so it silently flattens to white.
  Needs `transparent: true` on the png path plus per-platform verification.
- **A failed secret decryption yields empty credentials, and saving then destroys them.**
  `openSecret` returns `''` both when the codec is unavailable and when decryption fails, so after a
  Windows profile change the connector editor shows an empty Environment box — and saving overwrites
  the ciphertext. Low frequency, unrecoverable. Needs `openSecret` to report failure and the store to
  skip those columns, the way `saveProviderConfig` already does for an undefined `apiKey`. Medium.
- **MCP sampling is unguarded.** Every connector is advertised as sampling-capable and wired straight
  to the default model with the server's own `maxTokens`, no rate limit, no approval and nothing in
  the UI. The app already has `moduleCallsPerMinute` for the analogous `call()` path. Clamping the
  token count and adding a per-connector token bucket is small; a `sampling: ask | allow | off`
  policy is medium.
- **No way to continue an answer cut off by `finish_reason: "length"`.** With a 16k default context a
  reasoning model stops mid-sentence and the only recourse is typing "continue", which usually makes
  it restart. The Playground already has the Continue affordance for agent-loop stops — `'length'`
  just is not in its resumable list, and chat has no button at all. Medium, and the continuation
  semantics need one decision per provider flavour.
- **`markdownToDocx` turns WebP and SVG images into `[alt]` text.** `DOCX_IMAGE_TYPES` covers only
  png/jpg/gif/bmp, and `fetch_image` explicitly accepts WebP. The SVG rasterizer is already wired up
  and PPTX already uses it; DOCX just does not. Small–medium.
- **`syncCron` can wipe a user's crontab.** `crontab -l` exits non-zero both for "no crontab" and for
  a real failure, and the code treats both as empty before rewriting the file. Linux-only and Cellar
  ships Windows-only today, so it is filed rather than fixed — but it is unrecoverable data loss
  outside the app, so fix it before any Linux build.

### Smaller, verified

- Model-authored raw HTML flows unfiltered into the PDF page (`marked.parse`), so a model-written
  `<style>` can override the theme or wreck pagination. Script execution is already blocked by
  `javascript: false`, so this is a misrender risk, not XSS.
- `export.ts` and `desktop.ts` both install a `webRequest.onBeforeRequest` handler on the same
  session partition; Electron keeps only the last. The two filters are identical today, so nothing is
  broken — but a future divergence would be invisible.
- `patchElement` with `weight: null` lands on 100 rather than clearing the weight.
- `lmstudio.ts` never clears its "loading the model…" status, so the reported time-to-first-token
  includes the whole model load.
- `%` is always percent and never remainder — `17 % 5` answers `17/20`. Defensible, but a model
  writing it for a remainder gets a confident wrong number; either reject it as ambiguous or document
  `mod(17, 5)`.

### Larger, still genuinely open

- **Design: automatic reflow** rather than the opt-in `reflow: true` flag. Needs a decision about
  what happens while a person is editing on the canvas.
- **Math: solid geometry beyond the common solids** (frustums, spherical caps, oblique prisms) and
  3+-unknown nonlinear systems. Genuinely niche; the current set covers the syllabus the Creator
  Ideas notes asked for.
- **Legacy `.doc`/`.ppt` body text.** Still unreadable by design (see item 3). Only worth revisiting
  if a maintained, non-vulnerable pure-JS CFB reader appears.

## Not code work (deprioritized here)

- **Code signing the Windows installer** — flagged as a gap since M1; needs a purchased cert and an
  external signing step, not something to implement in the repo.
- **LM Studio / Unsloth Studio live verification** — needs those actually installed and exercised by
  hand; a testing/QA task, not a code change.
