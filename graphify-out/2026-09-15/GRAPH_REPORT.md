# Graph Report - Cellar  (2026-09-15)

## Corpus Check
- 209 files · ~175,392 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2343 nodes · 5450 edges · 145 communities (99 shown, 46 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 79 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c5c18a3c`
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
- plugins.ts
- errorMessage
- CustomizePage.tsx
- LlamaCppProvider
- memory.ts
- commands.ts
- DownloadManager
- m4-handlers.ts
- tasks.ts
- m4-smoke.mjs
- window.ts
- ScheduledPage.tsx
- .resolve
- quants.ts
- code/ipc.ts
- main.tsx
- streams.ts
- dictation.ts
- ArtifactPanel
- mcp-server.mjs
- electron-vite

## God Nodes (most connected - your core abstractions)
1. `IpcInvokeMap` - 74 edges
2. `run()` - 61 edges
3. `paths()` - 59 edges
4. `errorMessage()` - 53 edges
5. `registerIpcHandlers()` - 40 edges
6. `ChatOrchestrator` - 34 edges
7. `registerM4Handlers()` - 34 edges
8. `invoke()` - 34 edges
9. `newId()` - 33 edges
10. `get()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `runShell()` --indirect_call--> `collect()`  [INFERRED]
  src/main/agent/tools/command.ts → tests/unit/stream-parsers.test.ts
- `SideChat()` --indirect_call--> `question()`  [INFERRED]
  src/renderer/src/components/code/SideChat.tsx → tests/unit/side-chat.test.ts
- `extractDocumentText()` --references--> `jszip`  [EXTRACTED]
  src/main/agent/documents.ts → package.json
- `get()` --calls--> `servePreviewRequest()`  [EXTRACTED]
  tests/unit/code-preview.test.ts → src/main/code/preview.ts
- `waitFor()` --calls--> `check()`  [EXTRACTED]
  tests/unit/terminal.test.ts → src/main/code/terminal.ts

## Import Cycles
- None detected.

## Communities (145 total, 46 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.15
Nodes (17): detectReasoningStyle(), EMBEDDING_ARCHES, FILE_TYPE_NAMES, isEmbeddingModel(), num(), numOrArray(), summarizeGguf(), tensorBytes() (+9 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.19
Nodes (15): buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), freePort(), Instance, log, sameConfig() (+7 more)

### Community 2 - "queries.ts"
Cohesion: 0.17
Nodes (16): effectiveThinking(), isChatCapable(), thinkingLabel(), thinkingOptions(), useAppCommands(), useSelectedModel(), useThemeSync(), cleanIpcError() (+8 more)

### Community 3 - "ChatOrchestrator"
Cohesion: 0.08
Nodes (6): joinReasoning(), TaskRunInput, TaskRunnerHooks, ChatOrchestrator, ChatStore, MemoryChatStore

### Community 4 - "engine.ts"
Cohesion: 0.11
Nodes (21): active, buildSideChatPrompt(), clipTranscript(), fitSideMessages(), FRIENDLY_ERRORS, log, parseSideChatRequest(), PENDING_RESULTS (+13 more)

### Community 5 - "run"
Cohesion: 0.08
Nodes (32): ConversationPatch, ConversationRow, MessagePatch, MessageRow, SqliteChatStore, toConversation(), toMessage(), all() (+24 more)

### Community 6 - "scripts"
Cohesion: 0.04
Nodes (45): croner, docx, exceljs, extract-zip, @huggingface/gguf, jszip, marked, @modelcontextprotocol/sdk (+37 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.15
Nodes (18): buildSystemPrompt(), chatToolGuidance(), cleanTitle(), fallbackTitle(), SystemPromptInput, artifactTypeFor(), deriveArtifactTitle(), LANGUAGE_TYPES (+10 more)

### Community 8 - "openai-compat.ts"
Cohesion: 0.20
Nodes (19): LmsDownloadStatus, LmsModel, authHeaders(), baseEntry(), ChatChunk, fetchEmbeddings(), fetchOpenAIModels(), guessCapabilitiesFromName() (+11 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (29): electron.vite.config.ts, electron-vite/node, node, playwright.config.ts, scripts/**/*.ts, src/main/**/*, src/preload/**/*, tests/**/* (+21 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, src/artifact-runtime/**/*, src/preload/api.d.ts, src/renderer/src/**/*, src/renderer/src/**/*.tsx, vite/client, compilerOptions (+19 more)

### Community 11 - "orchestrator.ts"
Cohesion: 0.08
Nodes (23): session(), check(), conversationIdSchema, CreateTerminalOptions, dataSchema, envValue(), findOnPath(), idSchema (+15 more)

### Community 12 - "main/index.ts"
Cohesion: 0.09
Nodes (29): installTaskNotifications(), attachCloseToTray(), backgroundActive(), createMain(), getMain(), iconPath(), installBackground(), isQuitting() (+21 more)

### Community 13 - "DownloadManager"
Cohesion: 0.18
Nodes (9): backendsFromFiles(), bestRuntime(), exec, findServerDir(), idForDir(), parseDevicesOutput(), parseVersionOutput(), RuntimeManager (+1 more)

### Community 14 - "handlers.ts"
Cohesion: 0.09
Nodes (50): attachmentFromBytes(), attachmentRefs(), attachmentsFromPaths(), classifyFile(), cleanupOrphanAttachments(), extractPdfText(), IMAGE_TYPES, Row (+42 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.06
Nodes (67): AppCommand, AppInfo, BackgroundStatus, EVENT_CHANNELS, EventChannel, eventChannelFlags, Handler, INVOKE_CHANNELS (+59 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.11
Nodes (28): AgentPart, ConversationKind, TaskStartOptions, TaskState, TaskStatus, Artifact, ArtifactSummary, AttachmentKind (+20 more)

### Community 17 - "Messages.tsx"
Cohesion: 0.11
Nodes (13): ARTIFACT_ICONS, ARTIFACT_LABELS, ArtifactCard(), AttachmentImage(), attachmentImageUrl(), Lightbox(), MessageAttachments(), escapeAttr() (+5 more)

### Community 18 - "fetchWithTimeout"
Cohesion: 0.31
Nodes (3): fetchWithTimeout(), OllamaProvider, readErrorBody()

### Community 19 - "button.tsx"
Cohesion: 0.12
Nodes (9): Button, ButtonProps, IconButton, IconButtonProps, Size, sizes, Variant, variants (+1 more)

### Community 20 - "router.tsx"
Cohesion: 0.11
Nodes (15): ChatPage(), CustomizePage(), DiscoverPage(), PUBLISHERS, ArtifactsPage(), COMING, ComingSoonPage(), RecentsPage() (+7 more)

### Community 21 - "LoadSettingsDialog.tsx"
Cohesion: 0.15
Nodes (10): CapabilityIcons(), FIT_COPY, FitBadge(), MemoryBars(), PROVIDER_LABEL, providerStateDot(), ProviderStatusDot(), CONTEXT_STEPS (+2 more)

### Community 22 - "stream-parsers.ts"
Cohesion: 0.21
Nodes (7): parseNDJSON(), parseSSE(), partialSuffix(), readLines(), SplitPart, ThinkTagSplitter, collect()

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.09
Nodes (8): ACCENTS, LANGUAGES, SECTIONS, SettingsPage(), SHORTCUTS, VARIANT_LABEL, Voice(), WHISPER_BUILDS

### Community 24 - "types/models.ts"
Cohesion: 0.08
Nodes (30): pdfAvailable(), AgentPromptInput, buildAgentPrompt(), compactionRequest(), agentNoun(), chatTaskState(), joinText(), LiveRun (+22 more)

### Community 25 - "provider-configs.ts"
Cohesion: 0.06
Nodes (51): DOCUMENT_EXTENSIONS, ANSI, ESC, killTree(), runCommand, runShell(), ShellOptions, ShellResult (+43 more)

### Community 26 - "hub.ts"
Cohesion: 0.08
Nodes (26): DownloadFileState, DownloadStatus, DownloadTarget, HfFile, HfModelSummary, HfRepoDetail, HfSearchQuery, HfSort (+18 more)

### Community 27 - ".doScan"
Cohesion: 0.18
Nodes (12): describeLocation(), FoundGroup, inspectLocalGguf(), localModelId(), LocalModelIndex, log, pickMmproj(), quantLabelFromName() (+4 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.10
Nodes (37): attachmentImage(), codeSession(), CodeSessionContext, BASE_HEADERS, buildPreviewUrl(), canConnect(), CONTENT_TYPES, fileResponse() (+29 more)

### Community 31 - "MemoryChatStore"
Cohesion: 0.15
Nodes (21): buildTaskHistory(), groupRounds(), HistoryOptions, historyTokens(), latestCompaction(), resultForModel(), Round, roundsToMessages() (+13 more)

### Community 33 - "Sidebar.tsx"
Cohesion: 0.12
Nodes (13): AppShell(), CodeSidebar(), SessionFilter, DownloadsButton(), TARGET_LABEL, SearchPalette(), Icon, NavItem() (+5 more)

### Community 34 - "Provider"
Cohesion: 0.19
Nodes (14): newToolCallId(), RoundOptions, asObject(), CallSplitPart, describeType(), escapeControlCharsInStrings(), ParsedTextCall, parseLooseJson() (+6 more)

### Community 35 - "form.tsx"
Cohesion: 0.20
Nodes (3): Input, SelectOption, Textarea

### Community 36 - "devDependencies"
Cohesion: 0.22
Nodes (9): clsx, @fontsource-variable/inter, devDependencies, clsx, @fontsource-variable/inter, @tanstack/react-query, @vitejs/plugin-react, @tanstack/react-query (+1 more)

### Community 37 - "chat-smoke.mjs"
Cohesion: 0.22
Nodes (8): elapsed, logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3:0.6b', prompt = 'Say hello in five words.', shot = 'chat'], started

### Community 39 - "ModelRef"
Cohesion: 0.12
Nodes (24): computeQuantFit(), fitCache, fitInflight, fitWaiters, hfHeaders(), hfJson(), quantFit(), repoCache (+16 more)

### Community 40 - "build-artifact-runtime.mjs"
Cohesion: 0.25
Nodes (6): entry, outDir, output, root, tailwindOutput, tailwindSource

### Community 41 - ".update"
Cohesion: 0.07
Nodes (29): ConnectorManager, defaultPolicy(), Live, log, renderToolResult(), signatureOf(), toolPolicy(), withTimeout() (+21 more)

### Community 42 - "window.ts"
Cohesion: 0.12
Nodes (37): escapeRegex(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry, WalkOptions, checkJavaScript() (+29 more)

### Community 43 - "AppShell.tsx"
Cohesion: 0.14
Nodes (26): invoke(), keys, useAppInfo(), useArtifacts(), useBackground(), useCommands(), useConnectors(), useConversation() (+18 more)

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
Cohesion: 0.05
Nodes (37): coworkGuidance, parseParamsBillions(), ToolPart, StreamEvent, ModelEntry, BUILTIN_PROVIDER_IDS, ProviderConfig, ProviderConfigInput (+29 more)

### Community 51 - "verify-packaged.mjs"
Cohesion: 0.40
Nodes (3): exe, local, project

### Community 52 - "DiscoverPage.tsx"
Cohesion: 0.05
Nodes (40): dot(), EmbeddingIndex, embeddingPrefixes(), fromBlob(), toBlob(), ChangesPane(), Counts(), errorText() (+32 more)

### Community 55 - "ipc-run.mjs"
Cohesion: 0.50
Nodes (3): calls, profile, project

### Community 56 - "preload/index.ts"
Cohesion: 0.50
Nodes (3): bridge, eventsAllowed, invokeAllowed

### Community 57 - "ArtifactPanel.tsx"
Cohesion: 0.21
Nodes (11): displayAddress(), externalLink(), handledRequests, isPdf(), Preview(), previewPath(), PreviewState, run() (+3 more)

### Community 58 - "ChatPage.tsx"
Cohesion: 0.15
Nodes (24): blockElements(), cellValue(), createXlsx(), DocxContext, escapeHtml(), excelCellText(), extractDocumentText(), HEADINGS (+16 more)

### Community 66 - "electron-vite"
Cohesion: 0.13
Nodes (14): CodeSessionInfo, BOM, commit(), makeRepo(), sh(), ChatRequest, cleanup, entry (+6 more)

### Community 67 - "@fontsource-variable/inter"
Cohesion: 0.23
Nodes (24): allSkills(), changed(), claudeSkillsAvailable(), copySkill(), deleteSkill(), findActiveSkill(), findSkillFolders(), getSkill() (+16 more)

### Community 82 - "@tanstack/react-query"
Cohesion: 0.16
Nodes (11): SideChatMessage, ask(), ChatRequest, FakeProvider, msg(), Provider, question(), Script (+3 more)

### Community 94 - "agent-core.test.ts"
Cohesion: 0.20
Nodes (19): absoluteUrl(), htmlToText(), NAMED_ENTITIES, PageText, parseBraveHtml(), parseDuckDuckGoHtml(), parseSearxngJson(), SearchResult (+11 more)

### Community 95 - "Cellar roadmap"
Cohesion: 0.08
Nodes (23): Cellar roadmap, Known gaps and follow-ups from M1, Known gaps and follow-ups from M2, Known gaps and follow-ups from M3, Known gaps and follow-ups from M4, M1 Foundation — delivered, M2 Cowork — delivered, M2 Cowork — original goals (+15 more)

### Community 96 - "services/models.ts"
Cohesion: 0.20
Nodes (15): localModels, defaultPreset(), getPreset(), resetPreset(), savePreset(), deleteModel(), listModels(), loadedModels() (+7 more)

### Community 97 - "cowork-smoke.mjs"
Cohesion: 0.13
Nodes (13): approvals, chips, elapsed, files, folder, logs, outDir, problems (+5 more)

### Community 98 - "tools/types.ts"
Cohesion: 0.16
Nodes (9): DAYS, describeCron(), nextFire(), pad(), parseCron(), previewCron(), Scheduler, toRun() (+1 more)

### Community 99 - "agent.ts"
Cohesion: 0.08
Nodes (26): INIT_PROMPT, ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, PermissionMode, ReasoningPart, TaskFile (+18 more)

### Community 100 - "history.ts"
Cohesion: 0.14
Nodes (12): address, approvals, elapsed, logs, outDir, problems, profile, project (+4 more)

### Community 101 - "Workspace"
Cohesion: 0.06
Nodes (84): globFiles(), changed(), contentSchema, conversationIdSchema, BOM, byPath(), countable(), listDirectory() (+76 more)

### Community 102 - "orchestrator.ts"
Cohesion: 0.13
Nodes (24): installPdfRenderer(), log, setPdfRenderer(), ActiveGeneration, log, TurnFinished, ACTIVE, log (+16 more)

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
Cohesion: 0.12
Nodes (15): AgentParts(), Block, toBlocks(), ApprovalCard(), durationLabel(), errorText(), FILE_TOOLS, OpenFileContext (+7 more)

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
Cohesion: 0.09
Nodes (19): pptxgenjs, pptxgenjs, createPptx(), cell, createDocx, createPdf, createPptx, createXlsx (+11 more)

### Community 112 - "🎨 AI Design Engine: Concept & Specification Document"
Cohesion: 0.29
Nodes (6): 🚀 1. Overview: Bridging the Gap Between Text and Visual Design, 🧱 2. The Limitations of Current Text-Based AI, ✨ 3. The Vision: Desired Capabilities (The Next-Generation AI), 🛠️ 4. Technical Feature Checklist (The Design Specification), 🧠 5. AI Self-Assessment and Self-Identified Issues, 🎨 AI Design Engine: Concept & Specification Document

### Community 113 - "CodeModeMenu.tsx"
Cohesion: 0.52
Nodes (6): CODE_MODE_OPTIONS, codeModeKey(), CodeModeMenu(), CodeModeValue, nextCodeMode(), Option

### Community 114 - "code-changes.test.ts"
Cohesion: 0.12
Nodes (16): DARK_ANSI, LIGHT_ANSI, message(), openLink(), previewUrl(), readTheme(), SessionTerminals(), TerminalView() (+8 more)

### Community 115 - "stores/code.ts"
Cohesion: 0.33
Nodes (5): CodePane, CodeUiState, EditorRequest, PreviewRequest, useCodeUi

### Community 124 - "plugins.ts"
Cohesion: 0.19
Nodes (23): changed(), countEntries(), describe(), enabledPlugins(), exec, expandPluginVars(), findPluginRoots(), installPlugin() (+15 more)

### Community 125 - "errorMessage"
Cohesion: 0.19
Nodes (15): errorMessage(), cleanTranscript(), CLI_NAMES, findCli(), installing, log, modelsDir(), progressEmitter() (+7 more)

### Community 126 - "CustomizePage.tsx"
Cohesion: 0.17
Nodes (18): attempt(), CommandDialog(), CommandsSection(), ConnectorCard(), ConnectorDialog(), ConnectorsSection(), errorText(), ImportJsonDialog() (+10 more)

### Community 127 - "LlamaCppProvider"
Cohesion: 0.15
Nodes (5): sleep(), LocalModel, formatParamCount(), LlamaCppProvider, prettyModelName()

### Community 128 - "memory.ts"
Cohesion: 0.23
Nodes (16): connectors, assistantContext, addMemory(), changed(), clean(), clearMemories(), deleteMemory(), findMemory() (+8 more)

### Community 129 - "commands.ts"
Cohesion: 0.25
Nodes (16): builtInCommands(), changed(), commandSlug(), customCommands(), deleteCommand(), expandCommand(), expandTemplate(), getCommand() (+8 more)

### Community 131 - "m4-handlers.ts"
Cohesion: 0.17
Nodes (11): hideQuickEntry(), openConversation(), quickEntryShortcutActive(), connectorSchema, focusedWindow(), modelRef, policy, scheduledSchema (+3 more)

### Community 132 - "tasks.ts"
Cohesion: 0.18
Nodes (9): describeTool(), DiffLine, DOCUMENT_TOOLS, Icon, IDEAS, PERMISSION_MODES, short(), text() (+1 more)

### Community 133 - "m4-smoke.mjs"
Cohesion: 0.17
Nodes (8): logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3.5:9b', embeddingId = 'nomic-embed-text:latest'], results, skip

### Community 134 - "window.ts"
Cohesion: 0.32
Nodes (11): createAppWindow(), createMainWindow(), guardNavigation(), isAppUrl(), loadRenderer(), loadState(), overlayWindows, saveState() (+3 more)

### Community 135 - "ScheduledPage.tsx"
Cohesion: 0.27
Nodes (9): buildCron(), DAYS, errorText(), formatWhen(), Frequency, parseSchedule(), RunHistory(), ScheduledPage() (+1 more)

### Community 136 - ".resolve"
Cohesion: 0.27
Nodes (4): exists(), inside(), PathAccessError, Workspace

### Community 137 - "quants.ts"
Cohesion: 0.36
Nodes (10): basename(), GroupedRepoFiles, groupQuantFiles(), isAuxiliaryGguf(), isMmprojFile(), parentName(), preferredMmproj(), quantBits() (+2 more)

### Community 138 - "code/ipc.ts"
Cohesion: 0.25
Nodes (7): chat, findMemoryFile(), removeWorktree(), codeMode, id, log, terminals

### Community 139 - "main.tsx"
Cohesion: 0.40
Nodes (4): queryClient, quick, QuickEntry(), router

### Community 140 - "streams.ts"
Cohesion: 0.33
Nodes (4): useIpcSync(), pending, StreamsState, useStreams

### Community 141 - "dictation.ts"
Cohesion: 0.60
Nodes (4): DictationState, encodeWav(), toSpeechWav(), useDictation()

### Community 142 - "ArtifactPanel"
Cohesion: 0.83
Nodes (3): ArtifactPanel(), fence(), IFRAME_TYPES

## Knowledge Gaps
- **562 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+557 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **46 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `paths()` connect `@fontsource-variable/inter` to `commands.ts`, `m4-handlers.ts`, `Workspace`, `orchestrator.ts`, `window.ts`, `openai-compat.ts`, `.update`, `main/index.ts`, `DownloadManager`, `handlers.ts`, `code-changes.test.ts`, `router.tsx`, `errorMessage`, `types/models.ts`, `.doScan`, `plugins.ts`, `app.spec.ts`, `OpenAIServerProvider`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `dependencies` connect `scripts` to `ToolContext`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `errorMessage()` connect `errorMessage` to `DownloadManager`, `ChatOrchestrator`, `engine.ts`, `code/ipc.ts`, `orchestrator.ts`, `main/index.ts`, `DownloadManager`, `handlers.ts`, `types/models.ts`, `.doScan`, `ProviderRegistry`, `Provider`, `ModelRef`, `.update`, `DiscoverPage.tsx`, `@fontsource-variable/inter`, `tools/types.ts`, `orchestrator.ts`, `util.ts`, `plugins.ts`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `paths()` (e.g. with `Composer()` and `ProjectDetailPage()`) actually correct?**
  _`paths()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `registerIpcHandlers()` (e.g. with `toPublicConfig()` and `.name()`) actually correct?**
  _`registerIpcHandlers()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _562 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ChatOrchestrator` be split into smaller, more focused modules?**
  _Cohesion score 0.07826546800634585 - nodes in this community are weakly interconnected._