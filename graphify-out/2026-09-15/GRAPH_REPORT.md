# Graph Report - Cellar  (2026-09-14)

## Corpus Check
- 178 files · ~137,802 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1899 nodes · 4148 edges · 124 communities (81 shown, 43 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 50 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8f76eadc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- hf-api.ts
- LlamaCppProvider
- queries.ts
- ChatOrchestrator
- engine.ts
- run
- scripts
- chat.test.ts
- openai-compat.ts
- compilerOptions
- compilerOptions
- orchestrator.ts
- main/index.ts
- DownloadManager
- handlers.ts
- ipc-contract.ts
- IpcInvokeMap
- Messages.tsx
- fetchWithTimeout
- button.tsx
- router.tsx
- LoadSettingsDialog.tsx
- stream-parsers.ts
- SettingsPage.tsx
- types/models.ts
- provider-configs.ts
- hub.ts
- .doScan
- LmStudioProvider
- app.spec.ts
- OpenAIServerProvider
- MemoryChatStore
- ProviderRegistry
- Sidebar.tsx
- Provider
- form.tsx
- devDependencies
- chat-smoke.mjs
- ModelRef
- build-artifact-runtime.mjs
- .update
- window.ts
- AppShell.tsx
- screenshots.mjs
- verify-downloads.mjs
- react-runtime.tsx
- CellarBridge
- HomePage.tsx
- providers.ts
- verify-packaged.mjs
- DiscoverPage.tsx
- ModelsPage.tsx
- electron.vite.config.ts
- ipc-run.mjs
- preload/index.ts
- ArtifactPanel.tsx
- ChatPage.tsx
- make-icon.mjs
- screens-models.mjs
- dialog.tsx
- tsconfig.json
- cmdk
- electron
- electron-builder
- electron-vite
- @fontsource-variable/inter
- @fontsource-variable/source-serif-4
- lucide-react
- @playwright/test
- radix-ui
- react
- react-dom
- streamdown
- @streamdown/code
- @streamdown/math
- @streamdown/mermaid
- sucrase
- tailwind-merge
- tailwindcss
- @tailwindcss/browser
- @tanstack/react-query
- @tanstack/react-router
- @types/node
- @types/react
- typescript
- vite
- @vitejs/plugin-react
- vitest
- zustand
- agent-core.test.ts
- Cellar roadmap
- services/models.ts
- cowork-smoke.mjs
- tools/types.ts
- agent.ts
- history.ts
- Workspace
- orchestrator.ts
- util.ts
- client.ts
- TaskPage.tsx
- ToolStep.tsx
- TaskSidePanel.tsx
- monaco.ts
- SideChat.tsx
- downloadFile
- ToolContext
- 🎨 AI Design Engine: Concept & Specification Document
- CodeModeMenu.tsx
- code-changes.test.ts
- stores/code.ts
- monaco-editor
- sonner
- @tailwindcss/vite
- @types/react-dom
- @xterm/addon-fit
- @xterm/addon-web-links
- @xterm/xterm

## God Nodes (most connected - your core abstractions)
1. `IpcInvokeMap` - 52 edges
2. `run()` - 39 edges
3. `registerIpcHandlers()` - 38 edges
4. `errorMessage()` - 32 edges
5. `paths()` - 32 edges
6. `ChatOrchestrator` - 31 edges
7. `TaskRunner` - 27 edges
8. `ChatStore` - 25 edges
9. `Provider` - 24 edges
10. `invoke()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `SideChat()` --indirect_call--> `question()`  [INFERRED]
  src/renderer/src/components/code/SideChat.tsx → tests/unit/side-chat.test.ts
- `extractDocumentText()` --references--> `jszip`  [EXTRACTED]
  src/main/agent/documents.ts → package.json
- `runShell()` --indirect_call--> `collect()`  [INFERRED]
  src/main/agent/tools/command.ts → tests/unit/stream-parsers.test.ts
- `get()` --calls--> `servePreviewRequest()`  [EXTRACTED]
  tests/unit/code-preview.test.ts → src/main/code/preview.ts
- `waitFor()` --calls--> `check()`  [EXTRACTED]
  tests/unit/terminal.test.ts → src/main/code/terminal.ts

## Import Cycles
- None detected.

## Communities (124 total, 43 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.06
Nodes (45): DownloadManager, computeQuantFit(), fitCache, fitInflight, fitWaiters, hfHeaders(), hfJson(), quantFit() (+37 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.10
Nodes (19): LocalModel, buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), formatParamCount(), freePort(), Instance (+11 more)

### Community 2 - "queries.ts"
Cohesion: 0.07
Nodes (40): Composer(), ComposerProps, ModelPicker(), effectiveThinking(), isChatCapable(), thinkingLabel(), thinkingOptions(), useAppCommands() (+32 more)

### Community 3 - "ChatOrchestrator"
Cohesion: 0.05
Nodes (19): ToolProtocol, AgentPromptInput, buildAgentPrompt(), compactionRequest(), agentNoun(), joinReasoning(), joinText(), LiveRun (+11 more)

### Community 4 - "engine.ts"
Cohesion: 0.09
Nodes (34): chat, removeWorktree(), codeMode, id, log, registerCodeHandlers(), active, buildSideChatPrompt() (+26 more)

### Community 5 - "run"
Cohesion: 0.09
Nodes (28): attachmentFromBytes(), attachmentRefs(), attachmentsFromPaths(), classifyFile(), cleanupOrphanAttachments(), extractPdfText(), IMAGE_TYPES, Row (+20 more)

### Community 6 - "scripts"
Cohesion: 0.05
Nodes (41): docx, exceljs, extract-zip, @huggingface/gguf, jszip, marked, node-pty, author (+33 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.13
Nodes (22): fitToContext(), messageTokens(), toTurns(), truncateMiddle(), buildSystemPrompt(), cleanTitle(), fallbackTitle(), supportsArtifactInstructions() (+14 more)

### Community 8 - "openai-compat.ts"
Cohesion: 0.21
Nodes (17): LmsDownloadStatus, LmsModel, authHeaders(), baseEntry(), ChatChunk, fetchOpenAIModels(), guessCapabilitiesFromName(), OpenAIModelList (+9 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (29): electron.vite.config.ts, electron-vite/node, node, playwright.config.ts, scripts/**/*.ts, src/main/**/*, src/preload/**/*, tests/**/* (+21 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, src/artifact-runtime/**/*, src/preload/api.d.ts, src/renderer/src/**/*, src/renderer/src/**/*.tsx, vite/client, compilerOptions (+19 more)

### Community 11 - "orchestrator.ts"
Cohesion: 0.09
Nodes (22): check(), conversationIdSchema, CreateTerminalOptions, dataSchema, envValue(), findOnPath(), idSchema, log (+14 more)

### Community 12 - "main/index.ts"
Cohesion: 0.10
Nodes (28): installPdfRenderer(), installTaskNotifications(), setPdfRenderer(), PREVIEW_SCHEME_PRIVILEGES, terminals, downloads, log, handlers (+20 more)

### Community 13 - "DownloadManager"
Cohesion: 0.13
Nodes (19): backendsFromFiles(), bestRuntime(), exec, findServerDir(), idForDir(), log, parseDevicesOutput(), parseReleaseAssets() (+11 more)

### Community 14 - "handlers.ts"
Cohesion: 0.10
Nodes (41): registerPreviewHandlers(), kindOf(), listConversations(), searchMessages(), ftsQuery(), transaction(), BUILTINS, deleteProviderConfig() (+33 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.11
Nodes (25): AppCommand, AppInfo, EVENT_CHANNELS, EventChannel, eventChannelFlags, Handler, INVOKE_CHANNELS, InvokeChannel (+17 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.10
Nodes (27): AgentPart, ConversationKind, TaskStartOptions, TaskState, Artifact, ArtifactSummary, AttachmentKind, AttachmentRef (+19 more)

### Community 17 - "Messages.tsx"
Cohesion: 0.13
Nodes (9): ARTIFACT_ICONS, ARTIFACT_LABELS, ArtifactCard(), escapeAttr(), Markdown, MarkdownProps, plugins, withArtifactCards() (+1 more)

### Community 18 - "fetchWithTimeout"
Cohesion: 0.32
Nodes (3): fetchWithTimeout(), OllamaProvider, readErrorBody()

### Community 19 - "button.tsx"
Cohesion: 0.12
Nodes (9): Button, ButtonProps, IconButton, IconButtonProps, Size, sizes, Variant, variants (+1 more)

### Community 20 - "router.tsx"
Cohesion: 0.10
Nodes (16): queryClient, ChatPage(), DiscoverPage(), PUBLISHERS, ArtifactsPage(), COMING, ComingSoonPage(), RecentsPage() (+8 more)

### Community 21 - "LoadSettingsDialog.tsx"
Cohesion: 0.15
Nodes (10): CapabilityIcons(), FIT_COPY, FitBadge(), MemoryBars(), PROVIDER_LABEL, providerStateDot(), ProviderStatusDot(), CONTEXT_STEPS (+2 more)

### Community 22 - "stream-parsers.ts"
Cohesion: 0.23
Nodes (6): parseNDJSON(), parseSSE(), partialSuffix(), readLines(), SplitPart, ThinkTagSplitter

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.11
Nodes (5): ACCENTS, SECTIONS, SettingsPage(), SHORTCUTS, VARIANT_LABEL

### Community 24 - "types/models.ts"
Cohesion: 0.09
Nodes (20): coworkGuidance, parseParamsBillions(), ContextOverflowPolicy, DEFAULT_INFERENCE_PARAMS, KV_CACHE_TYPES, KvCacheType, LoadConfig, LoadedModelInfo (+12 more)

### Community 25 - "provider-configs.ts"
Cohesion: 0.09
Nodes (34): pptxgenjs, pptxgenjs, createPptx(), editFileTool, globTool, grepTool, listDir, readFileTool (+26 more)

### Community 26 - "hub.ts"
Cohesion: 0.16
Nodes (14): DownloadFileState, DownloadStatus, DownloadTarget, HfFile, HfModelSummary, HfRepoDetail, HfSearchQuery, HfSort (+6 more)

### Community 27 - ".doScan"
Cohesion: 0.18
Nodes (12): describeLocation(), FoundGroup, inspectLocalGguf(), localModelId(), LocalModelIndex, log, pickMmproj(), quantLabelFromName() (+4 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.08
Nodes (39): exists(), inside(), PathAccessError, Workspace, codeSession(), CodeSessionContext, BASE_HEADERS, buildPreviewUrl() (+31 more)

### Community 30 - "OpenAIServerProvider"
Cohesion: 0.17
Nodes (3): StoredProviderConfig, OpenAIFlavor, OpenAIServerProvider

### Community 33 - "Sidebar.tsx"
Cohesion: 0.21
Nodes (8): SessionFilter, DownloadsButton(), TARGET_LABEL, Icon, NavItem(), ProfileMenuContent(), RecentFilter, RowMarker()

### Community 34 - "Provider"
Cohesion: 0.13
Nodes (24): buildTaskHistory(), groupRounds(), HistoryOptions, latestCompaction(), resultForModel(), Round, roundsToMessages(), transcriptForSummary() (+16 more)

### Community 35 - "form.tsx"
Cohesion: 0.20
Nodes (3): Input, SelectOption, Textarea

### Community 36 - "devDependencies"
Cohesion: 0.22
Nodes (9): clsx, electron-vite, devDependencies, clsx, electron-vite, @tanstack/react-query, @vitejs/plugin-react, @tanstack/react-query (+1 more)

### Community 37 - "chat-smoke.mjs"
Cohesion: 0.22
Nodes (8): elapsed, logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3:0.6b', prompt = 'Say hello in five words.', shot = 'chat'], started

### Community 39 - "ModelRef"
Cohesion: 0.11
Nodes (28): CODE_SLASH_COMMANDS, INIT_PROMPT, SlashCommand, IpcInvokeMap, PermissionMode, ConversationSummary, ThinkingLevel, ChangedFile (+20 more)

### Community 40 - "build-artifact-runtime.mjs"
Cohesion: 0.25
Nodes (6): entry, outDir, output, root, tailwindOutput, tailwindSource

### Community 41 - ".update"
Cohesion: 0.21
Nodes (7): openSecret(), sealSecret(), SecretCodec, setSecretCodec(), clamp(), defaults(), SettingsService

### Community 42 - "window.ts"
Cohesion: 0.16
Nodes (16): escapeRegex(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry, WalkOptions, BINARY_EXTENSIONS (+8 more)

### Community 43 - "AppShell.tsx"
Cohesion: 0.24
Nodes (5): AppShell(), CodeSidebar(), SearchPalette(), Sidebar(), TitleBar()

### Community 45 - "screenshots.mjs"
Cohesion: 0.29
Nodes (6): logs, outDir, problems, profile, project, routes

### Community 46 - "verify-downloads.mjs"
Cohesion: 0.38
Nodes (5): ipc(), profile, project, sleep(), waitFor()

### Community 47 - "react-runtime.tsx"
Cohesion: 0.33
Nodes (3): ErrorBoundary, modules, mount()

### Community 49 - "HomePage.tsx"
Cohesion: 0.29
Nodes (4): CoworkExtras(), folderName(), HomePage(), SUGGESTIONS

### Community 50 - "providers.ts"
Cohesion: 0.12
Nodes (10): ChatRequest, currentEntry, fake, FakeProvider, finished(), message(), Provider, Script (+2 more)

### Community 51 - "verify-packaged.mjs"
Cohesion: 0.40
Nodes (3): exe, local, project

### Community 52 - "DiscoverPage.tsx"
Cohesion: 0.09
Nodes (29): ChangesPane(), Counts(), errorText(), FileRow(), FileRowProps, num(), splitPath(), STATUS (+21 more)

### Community 55 - "ipc-run.mjs"
Cohesion: 0.50
Nodes (3): calls, profile, project

### Community 56 - "preload/index.ts"
Cohesion: 0.50
Nodes (3): bridge, eventsAllowed, invokeAllowed

### Community 57 - "ArtifactPanel.tsx"
Cohesion: 0.06
Nodes (35): prepareBranch(), ArtifactPanel(), fence(), IFRAME_TYPES, displayAddress(), externalLink(), handledRequests, isPdf() (+27 more)

### Community 58 - "ChatPage.tsx"
Cohesion: 0.13
Nodes (25): blockElements(), cellValue(), createXlsx(), DOCUMENT_EXTENSIONS, DocxContext, escapeHtml(), excelCellText(), extractDocumentText() (+17 more)

### Community 66 - "electron-vite"
Cohesion: 0.14
Nodes (14): ToolPart, StreamEvent, ProviderStatus, ChatRequest, cleanup, entry, fake, FakeProvider (+6 more)

### Community 82 - "@tanstack/react-query"
Cohesion: 0.15
Nodes (12): SideChatMessage, ask(), ChatRequest, createSession(), FakeProvider, msg(), Provider, question() (+4 more)

### Community 88 - "@vitejs/plugin-react"
Cohesion: 0.14
Nodes (7): RoundOptions, FitResult, SideChatPrompt, Provider, ProviderMessage, ProviderToolCall, ToolSchema

### Community 94 - "agent-core.test.ts"
Cohesion: 0.19
Nodes (19): absoluteUrl(), decodeEntities(), htmlToText(), NAMED_ENTITIES, PageText, parseDuckDuckGoHtml(), parseSearxngJson(), SearchResult (+11 more)

### Community 95 - "Cellar roadmap"
Cohesion: 0.09
Nodes (20): Cellar roadmap, Known gaps and follow-ups from M1, Known gaps and follow-ups from M2, Known gaps and follow-ups from M3, M1 Foundation — delivered, M2 Cowork — delivered, M2 Cowork — original goals, M3 Code — delivered (+12 more)

### Community 96 - "services/models.ts"
Cohesion: 0.22
Nodes (16): safeJsonParse(), localModels, defaultPreset(), getPreset(), resetPreset(), savePreset(), deleteModel(), listModels() (+8 more)

### Community 97 - "cowork-smoke.mjs"
Cohesion: 0.13
Nodes (13): approvals, chips, elapsed, files, folder, logs, outDir, problems (+5 more)

### Community 98 - "tools/types.ts"
Cohesion: 0.16
Nodes (12): ANSI, ESC, killTree(), runCommand, runShell(), ShellOptions, ShellResult, cleanSchema() (+4 more)

### Community 99 - "agent.ts"
Cohesion: 0.14
Nodes (13): ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, ReasoningPart, TaskFile, TaskSource, TaskStatus (+5 more)

### Community 100 - "history.ts"
Cohesion: 0.14
Nodes (12): address, approvals, elapsed, logs, outDir, problems, profile, project (+4 more)

### Community 101 - "Workspace"
Cohesion: 0.05
Nodes (89): globFiles(), changed(), contentSchema, conversationIdSchema, BOM, byPath(), countable(), listDirectory() (+81 more)

### Community 102 - "orchestrator.ts"
Cohesion: 0.14
Nodes (23): log, historyTokens(), log, estimateTokens(), ActiveGeneration, log, ACTIVE, log (+15 more)

### Community 103 - "util.ts"
Cohesion: 0.23
Nodes (10): argumentsObject(), OllamaChatLine, ollamaOptions(), OllamaPs, OllamaPullProgress, OllamaShow, OllamaTag, ollamaThink() (+2 more)

### Community 104 - "client.ts"
Cohesion: 0.20
Nodes (11): CodeHomePage(), CodeSessionPage(), errorText(), folderName(), IDEAS, PANES, PlanReady(), RepoPicker() (+3 more)

### Community 105 - "TaskPage.tsx"
Cohesion: 0.40
Nodes (4): errorText(), PlanReady(), STATUS, TaskPage()

### Community 106 - "ToolStep.tsx"
Cohesion: 0.13
Nodes (14): ApprovalCard(), durationLabel(), errorText(), FILE_TOOLS, OpenFileContext, ResultBlock(), ToolStep(), AgentTurn() (+6 more)

### Community 108 - "monaco.ts"
Cohesion: 0.23
Nodes (10): alpha(), applyTheme(), cssColor(), EXTENSION_LANGUAGES, FILENAME_LANGUAGES, load(), loadMonaco(), Monaco (+2 more)

### Community 109 - "SideChat.tsx"
Cohesion: 0.27
Nodes (9): EMPTY, historyOf(), LiveReply, newRequestId(), requestMessages(), settle(), SideChat(), SideEntry (+1 more)

### Community 110 - "downloadFile"
Cohesion: 0.31
Nodes (7): ChecksumError, downloadFile(), DownloadOptions, fileSize(), hashExisting(), payload, sha

### Community 111 - "ToolContext"
Cohesion: 0.22
Nodes (4): documentPath(), documentTarget(), writeDocument(), ToolContext

### Community 112 - "🎨 AI Design Engine: Concept & Specification Document"
Cohesion: 0.29
Nodes (6): 🚀 1. Overview: Bridging the Gap Between Text and Visual Design, 🧱 2. The Limitations of Current Text-Based AI, ✨ 3. The Vision: Desired Capabilities (The Next-Generation AI), 🛠️ 4. Technical Feature Checklist (The Design Specification), 🧠 5. AI Self-Assessment and Self-Identified Issues, 🎨 AI Design Engine: Concept & Specification Document

### Community 113 - "CodeModeMenu.tsx"
Cohesion: 0.52
Nodes (6): CODE_MODE_OPTIONS, codeModeKey(), CodeModeMenu(), CodeModeValue, nextCodeMode(), Option

### Community 114 - "code-changes.test.ts"
Cohesion: 0.38
Nodes (5): CodeSessionInfo, BOM, commit(), makeRepo(), sh()

### Community 115 - "stores/code.ts"
Cohesion: 0.33
Nodes (5): CodePane, CodeUiState, EditorRequest, PreviewRequest, useCodeUi

## Knowledge Gaps
- **493 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+488 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **43 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `scripts` to `provider-configs.ts`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Why does `paths()` connect `main/index.ts` to `queries.ts`, `ChatOrchestrator`, `Workspace`, `run`, `orchestrator.ts`, `openai-compat.ts`, `.update`, `DownloadManager`, `handlers.ts`, `router.tsx`, `.doScan`, `OpenAIServerProvider`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `scripts`, `cmdk`, `electron`, `electron-builder`, `@fontsource-variable/inter`, `@fontsource-variable/source-serif-4`, `lucide-react`, `@playwright/test`, `radix-ui`, `react`, `react-dom`, `streamdown`, `@streamdown/code`, `@streamdown/math`, `@streamdown/mermaid`, `sucrase`, `tailwind-merge`, `tailwindcss`, `@tailwindcss/browser`, `@tanstack/react-router`, `@types/node`, `@types/react`, `typescript`, `vite`, `vitest`, `zustand`, `monaco-editor`, `sonner`, `@tailwindcss/vite`, `@types/react-dom`, `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/xterm`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `registerIpcHandlers()` (e.g. with `toPublicConfig()` and `.name()`) actually correct?**
  _`registerIpcHandlers()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _493 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `hf-api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06247086247086247 - nodes in this community are weakly interconnected._
- **Should `LlamaCppProvider` be split into smaller, more focused modules?**
  _Cohesion score 0.10128205128205128 - nodes in this community are weakly interconnected._