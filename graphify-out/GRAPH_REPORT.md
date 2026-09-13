# Graph Report - Cellar  (2026-09-13)

## Corpus Check
- 142 files · ~95,644 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1444 nodes · 3094 edges · 108 communities (69 shown, 39 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d5a8f632`
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

## God Nodes (most connected - your core abstractions)
1. `IpcInvokeMap` - 41 edges
2. `run()` - 39 edges
3. `registerIpcHandlers()` - 33 edges
4. `ChatOrchestrator` - 29 edges
5. `paths()` - 27 edges
6. `TaskRunner` - 25 edges
7. `errorMessage()` - 24 edges
8. `Provider` - 24 edges
9. `ChatStore` - 23 edges
10. `invoke()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `extractDocumentText()` --references--> `jszip`  [EXTRACTED]
  src/main/agent/documents.ts → package.json
- `runShell()` --indirect_call--> `collect()`  [INFERRED]
  src/main/agent/tools/command.ts → tests/unit/stream-parsers.test.ts
- `Composer()` --indirect_call--> `paths()`  [INFERRED]
  src/renderer/src/components/composer/Composer.tsx → src/main/system/paths.ts
- `createPptx()` --references--> `pptxgenjs`  [EXTRACTED]
  src/main/agent/documents.ts → package.json
- `createPptx()` --indirect_call--> `text()`  [INFERRED]
  src/main/agent/documents.ts → src/renderer/src/lib/tasks.ts

## Import Cycles
- None detected.

## Communities (108 total, 39 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.06
Nodes (51): ACTIVE, DownloadManager, computeQuantFit(), fitCache, fitInflight, fitWaiters, hfHeaders(), hfJson() (+43 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.10
Nodes (20): sleep(), LocalModel, buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), formatParamCount(), freePort() (+12 more)

### Community 2 - "queries.ts"
Cohesion: 0.07
Nodes (39): Composer(), ComposerProps, ModelPicker(), effectiveThinking(), isChatCapable(), thinkingLabel(), thinkingOptions(), useAppCommands() (+31 more)

### Community 3 - "ChatOrchestrator"
Cohesion: 0.08
Nodes (9): joinText(), LiveRun, TaskRunner, chat, ChatOrchestrator, ChatStore, TypedBus, errorMessage() (+1 more)

### Community 4 - "engine.ts"
Cohesion: 0.14
Nodes (15): downloads, log, Row, assertTrusted(), forwardBusToWindows(), HandlerFn, log, setTrustedOrigin() (+7 more)

### Community 5 - "run"
Cohesion: 0.16
Nodes (8): ConversationPatch, ConversationRow, MessagePatch, MessageRow, SqliteChatStore, toConversation(), toMessage(), run()

### Community 6 - "scripts"
Cohesion: 0.05
Nodes (39): docx, exceljs, extract-zip, @huggingface/gguf, jszip, marked, author, dependencies (+31 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.12
Nodes (23): FitResult, fitToContext(), messageTokens(), toTurns(), truncateMiddle(), buildSystemPrompt(), cleanTitle(), fallbackTitle() (+15 more)

### Community 8 - "openai-compat.ts"
Cohesion: 0.18
Nodes (20): LmsDownloadStatus, LmsModel, authHeaders(), baseEntry(), ChatChunk, fetchOpenAIModels(), guessCapabilitiesFromName(), OpenAIFlavor (+12 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (29): electron.vite.config.ts, electron-vite/node, node, playwright.config.ts, scripts/**/*.ts, src/main/**/*, src/preload/**/*, tests/**/* (+21 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, src/artifact-runtime/**/*, src/preload/api.d.ts, src/renderer/src/**/*, src/renderer/src/**/*.tsx, vite/client, compilerOptions (+19 more)

### Community 11 - "orchestrator.ts"
Cohesion: 0.16
Nodes (24): attachmentRefs(), classifyFile(), cleanupOrphanAttachments(), extractPdfText(), IMAGE_TYPES, Row, store(), TEXT_EXTENSIONS (+16 more)

### Community 12 - "main/index.ts"
Cohesion: 0.13
Nodes (22): installPdfRenderer(), installTaskNotifications(), log, setPdfRenderer(), log, handlers, ARTIFACT_CSP, escapeScript() (+14 more)

### Community 13 - "DownloadManager"
Cohesion: 0.10
Nodes (21): ChecksumError, downloadFile(), DownloadOptions, fileSize(), hashExisting(), backendsFromFiles(), bestRuntime(), exec (+13 more)

### Community 14 - "handlers.ts"
Cohesion: 0.13
Nodes (27): attachmentFromBytes(), attachmentsFromPaths(), deleteConversations(), BUILTINS, deleteProviderConfig(), getProviderConfig(), listProviderConfigs(), Row (+19 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.12
Nodes (22): AppCommand, AppInfo, EVENT_CHANNELS, EventChannel, eventChannelFlags, Handler, INVOKE_CHANNELS, InvokeChannel (+14 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.13
Nodes (29): IpcInvokeMap, AgentPart, ConversationKind, TaskStartOptions, TaskState, TaskStatus, Artifact, ArtifactSummary (+21 more)

### Community 17 - "Messages.tsx"
Cohesion: 0.13
Nodes (9): ARTIFACT_ICONS, ARTIFACT_LABELS, ArtifactCard(), escapeAttr(), Markdown, MarkdownProps, plugins, withArtifactCards() (+1 more)

### Community 18 - "fetchWithTimeout"
Cohesion: 0.29
Nodes (4): fetchWithTimeout(), ollamaOptions(), OllamaProvider, readErrorBody()

### Community 19 - "button.tsx"
Cohesion: 0.12
Nodes (9): Button, ButtonProps, IconButton, IconButtonProps, Size, sizes, Variant, variants (+1 more)

### Community 20 - "router.tsx"
Cohesion: 0.13
Nodes (14): queryClient, ChatPage(), ArtifactsPage(), COMING, ComingSoonPage(), RecentsPage(), ProjectDetailPage(), ProjectsPage() (+6 more)

### Community 21 - "LoadSettingsDialog.tsx"
Cohesion: 0.15
Nodes (10): CapabilityIcons(), FIT_COPY, FitBadge(), MemoryBars(), PROVIDER_LABEL, providerStateDot(), ProviderStatusDot(), CONTEXT_STEPS (+2 more)

### Community 22 - "stream-parsers.ts"
Cohesion: 0.21
Nodes (7): parseOllamaChatStream(), parseNDJSON(), parseSSE(), partialSuffix(), readLines(), SplitPart, ThinkTagSplitter

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.12
Nodes (5): ACCENTS, SECTIONS, SettingsPage(), SHORTCUTS, VARIANT_LABEL

### Community 24 - "types/models.ts"
Cohesion: 0.09
Nodes (20): coworkGuidance, parseParamsBillions(), ContextOverflowPolicy, DEFAULT_INFERENCE_PARAMS, KV_CACHE_TYPES, KvCacheType, LoadConfig, LoadedModelInfo (+12 more)

### Community 25 - "provider-configs.ts"
Cohesion: 0.09
Nodes (32): pptxgenjs, pptxgenjs, createPptx(), editFileTool, globTool, readFileTool, ALL_TOOLS, findTool() (+24 more)

### Community 26 - "hub.ts"
Cohesion: 0.16
Nodes (14): DownloadFileState, DownloadStatus, DownloadTarget, HfFile, HfModelSummary, HfRepoDetail, HfSearchQuery, HfSort (+6 more)

### Community 27 - ".doScan"
Cohesion: 0.18
Nodes (12): describeLocation(), FoundGroup, inspectLocalGguf(), localModelId(), LocalModelIndex, log, pickMmproj(), quantLabelFromName() (+4 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.22
Nodes (6): project, lastUserText(), MockRequest, MockServer, sleep(), startMockServer()

### Community 31 - "MemoryChatStore"
Cohesion: 0.13
Nodes (3): MemoryChatStore, searchMessages(), closeDatabase()

### Community 32 - "ProviderRegistry"
Cohesion: 0.11
Nodes (5): StoredProviderConfig, log, ProviderRegistry, withTimeout(), Provider

### Community 33 - "Sidebar.tsx"
Cohesion: 0.20
Nodes (4): DownloadsButton(), TARGET_LABEL, Icon, RecentFilter

### Community 34 - "Provider"
Cohesion: 0.12
Nodes (24): historyTokens(), ToolProtocol, AgentPromptInput, buildAgentPrompt(), compactionRequest(), joinReasoning(), log, newToolCallId() (+16 more)

### Community 35 - "form.tsx"
Cohesion: 0.20
Nodes (3): Input, SelectOption, Textarea

### Community 36 - "devDependencies"
Cohesion: 0.22
Nodes (9): clsx, devDependencies, clsx, sonner, @tailwindcss/vite, @types/react-dom, sonner, @tailwindcss/vite (+1 more)

### Community 37 - "chat-smoke.mjs"
Cohesion: 0.22
Nodes (8): elapsed, logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3:0.6b', prompt = 'Say hello in five words.', shot = 'chat'], started

### Community 39 - "ModelRef"
Cohesion: 0.28
Nodes (8): PermissionMode, MessageModelInfo, ModelRef, AppSettings, AppSettingsPatch, ChatFont, ThemePreference, WebSearchProvider

### Community 40 - "build-artifact-runtime.mjs"
Cohesion: 0.25
Nodes (6): entry, outDir, output, root, tailwindOutput, tailwindSource

### Community 41 - ".update"
Cohesion: 0.19
Nodes (9): openSecret(), sealSecret(), SecretCodec, setSecretCodec(), clamp(), defaults(), settings, SettingsService (+1 more)

### Community 42 - "window.ts"
Cohesion: 0.11
Nodes (22): escapeRegex(), globFiles(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry, WalkOptions (+14 more)

### Community 43 - "AppShell.tsx"
Cohesion: 0.28
Nodes (4): AppShell(), SearchPalette(), Sidebar(), TitleBar()

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
Cohesion: 0.32
Nodes (5): ChatSuggestions(), CoworkExtras(), folderName(), HomePage(), SUGGESTIONS

### Community 50 - "providers.ts"
Cohesion: 0.12
Nodes (13): ToolPart, StreamEvent, ProviderStatus, ChatRequest, currentEntry, fake, FakeProvider, finished() (+5 more)

### Community 51 - "verify-packaged.mjs"
Cohesion: 0.40
Nodes (3): exe, local, project

### Community 55 - "ipc-run.mjs"
Cohesion: 0.50
Nodes (3): calls, profile, project

### Community 56 - "preload/index.ts"
Cohesion: 0.50
Nodes (3): bridge, eventsAllowed, invokeAllowed

### Community 57 - "ArtifactPanel.tsx"
Cohesion: 0.14
Nodes (12): ArtifactPanel(), fence(), IFRAME_TYPES, describeTool(), DiffLine, DOCUMENT_TOOLS, Icon, IDEAS (+4 more)

### Community 58 - "ChatPage.tsx"
Cohesion: 0.13
Nodes (25): blockElements(), cellValue(), createXlsx(), DOCUMENT_EXTENSIONS, DocxContext, escapeHtml(), excelCellText(), extractDocumentText() (+17 more)

### Community 94 - "agent-core.test.ts"
Cohesion: 0.22
Nodes (17): absoluteUrl(), decodeEntities(), htmlToText(), NAMED_ENTITIES, PageText, parseDuckDuckGoHtml(), parseSearxngJson(), SearchResult (+9 more)

### Community 95 - "Cellar roadmap"
Cohesion: 0.11
Nodes (17): Cellar roadmap, Known gaps and follow-ups from M1, Known gaps and follow-ups from M2, M1 Foundation — delivered, M2 Cowork — delivered, M2 Cowork — original goals, M3 Code — goals, M4 Customize, Scheduled, Voice — goals (+9 more)

### Community 96 - "services/models.ts"
Cohesion: 0.24
Nodes (15): safeJsonParse(), defaultPreset(), getPreset(), resetPreset(), savePreset(), deleteModel(), listModels(), loadedModels() (+7 more)

### Community 97 - "cowork-smoke.mjs"
Cohesion: 0.13
Nodes (13): approvals, chips, elapsed, files, folder, logs, outDir, problems (+5 more)

### Community 98 - "tools/types.ts"
Cohesion: 0.18
Nodes (11): ANSI, ESC, killTree(), runCommand, runShell(), ShellResult, cleanSchema(), defineTool() (+3 more)

### Community 99 - "agent.ts"
Cohesion: 0.15
Nodes (12): ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, ReasoningPart, TaskFile, TaskSource, TextPart (+4 more)

### Community 100 - "history.ts"
Cohesion: 0.33
Nodes (11): buildTaskHistory(), groupRounds(), HistoryOptions, latestCompaction(), resultForModel(), Round, roundsToMessages(), transcriptForSummary() (+3 more)

### Community 101 - "Workspace"
Cohesion: 0.27
Nodes (4): exists(), inside(), PathAccessError, Workspace

### Community 102 - "orchestrator.ts"
Cohesion: 0.24
Nodes (10): ActiveGeneration, log, providers, artifactsForConversation(), discardIncognitoArtifacts(), getArtifact(), memory, Row (+2 more)

### Community 103 - "util.ts"
Cohesion: 0.18
Nodes (8): argumentsObject(), OllamaChatLine, OllamaPs, OllamaPullProgress, OllamaShow, OllamaTag, ollamaThink(), toOllamaMessages()

### Community 104 - "client.ts"
Cohesion: 0.35
Nodes (9): all(), db(), get(), migrate(), openDatabase(), p(), transaction(), migrations (+1 more)

### Community 105 - "TaskPage.tsx"
Cohesion: 0.24
Nodes (7): Block, errorText(), PlanReady(), STATUS, TaskPage(), TaskTurn(), toBlocks()

### Community 106 - "ToolStep.tsx"
Cohesion: 0.27
Nodes (5): ApprovalCard(), durationLabel(), errorText(), ResultBlock(), ToolStep()

## Knowledge Gaps
- **371 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+366 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **39 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `paths()` connect `main/index.ts` to `Provider`, `ChatOrchestrator`, `queries.ts`, `openai-compat.ts`, `.update`, `orchestrator.ts`, `DownloadManager`, `handlers.ts`, `router.tsx`, `.doScan`, `OpenAIServerProvider`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Why does `dependencies` connect `scripts` to `provider-configs.ts`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `ProjectDetailPage()` connect `router.tsx` to `main/index.ts`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `registerIpcHandlers()` (e.g. with `toPublicConfig()` and `.name()`) actually correct?**
  _`registerIpcHandlers()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _371 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `hf-api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05745814307458143 - nodes in this community are weakly interconnected._
- **Should `LlamaCppProvider` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._