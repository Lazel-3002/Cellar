# Graph Report - Cellar  (2026-09-15)

## Corpus Check
- 236 files · ~220,940 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2688 nodes · 6292 edges · 155 communities (117 shown, 38 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 96 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2ede00ff`
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
- package.json
- glob.ts
- hardware.ts
- MonacoEditor.tsx
- memory-estimate.ts
- code-changes.test.ts
- TypedBus
- @fontsource-variable/inter
- @tanstack/react-query
- @vitejs/plugin-react

## God Nodes (most connected - your core abstractions)
1. `IpcInvokeMap` - 78 edges
2. `run()` - 64 edges
3. `paths()` - 64 edges
4. `errorMessage()` - 53 edges
5. `registerIpcHandlers()` - 42 edges
6. `newId()` - 39 edges
7. `ChatOrchestrator` - 36 edges
8. `get()` - 34 edges
9. `registerM4Handlers()` - 34 edges
10. `invoke()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `runShell()` --indirect_call--> `collect()`  [INFERRED]
  src/main/agent/tools/command.ts → tests/unit/stream-parsers.test.ts
- `SideChat()` --indirect_call--> `question()`  [INFERRED]
  src/renderer/src/components/code/SideChat.tsx → tests/unit/side-chat.test.ts
- `extractDocumentText()` --references--> `jszip`  [EXTRACTED]
  src/main/agent/documents.ts → package.json
- `markdownToHtmlPage()` --references--> `marked`  [EXTRACTED]
  src/main/agent/documents.ts → package.json
- `get()` --calls--> `servePreviewRequest()`  [EXTRACTED]
  tests/unit/code-preview.test.ts → src/main/code/preview.ts

## Import Cycles
- None detected.

## Communities (155 total, 38 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.21
Nodes (12): detectReasoningStyle(), EMBEDDING_ARCHES, FILE_TYPE_NAMES, isEmbeddingModel(), num(), numOrArray(), ParsedShard, summarizeGguf() (+4 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.06
Nodes (29): sleep(), buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), formatParamCount(), freePort(), Instance (+21 more)

### Community 2 - "queries.ts"
Cohesion: 0.19
Nodes (15): effectiveThinking(), isChatCapable(), thinkingLabel(), thinkingOptions(), useAppCommands(), useSelectedModel(), useThemeSync(), onEvent() (+7 more)

### Community 3 - "ChatOrchestrator"
Cohesion: 0.06
Nodes (11): chatTaskState(), joinReasoning(), joinText(), LiveRun, stableJson(), TaskRunner, TaskRunnerHooks, ChatOrchestrator (+3 more)

### Community 4 - "engine.ts"
Cohesion: 0.16
Nodes (18): active, buildSideChatPrompt(), clipTranscript(), fitSideMessages(), FRIENDLY_ERRORS, log, parseSideChatRequest(), PENDING_RESULTS (+10 more)

### Community 5 - "run"
Cohesion: 0.07
Nodes (48): attachmentRefs(), classifyFile(), cleanupOrphanAttachments(), extractPdfText(), IMAGE_TYPES, Row, store(), TEXT_EXTENSIONS (+40 more)

### Community 6 - "scripts"
Cohesion: 0.06
Nodes (45): croner, docx, exceljs, extract-zip, @huggingface/gguf, jszip, marked, @modelcontextprotocol/sdk (+37 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.12
Nodes (24): FitResult, fitToContext(), messageTokens(), toTurns(), truncateMiddle(), buildSystemPrompt(), chatToolGuidance(), cleanTitle() (+16 more)

### Community 8 - "openai-compat.ts"
Cohesion: 0.11
Nodes (30): StoredProviderConfig, fetchWithTimeout(), log, LmsDownloadStatus, LmsModel, OllamaChatLine, OllamaPs, OllamaPullProgress (+22 more)

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
Cohesion: 0.07
Nodes (42): installPdfRenderer(), installTaskNotifications(), log, setPdfRenderer(), setSvgRasterizer(), attachCloseToTray(), backgroundActive(), createMain() (+34 more)

### Community 13 - "DownloadManager"
Cohesion: 0.05
Nodes (44): addArtboard(), addElement(), AlignEdge, alignSelection(), copySelection(), deleteArtboard(), deleteSelection(), duplicateSelection() (+36 more)

### Community 14 - "handlers.ts"
Cohesion: 0.12
Nodes (30): attachmentFromBytes(), attachmentsFromPaths(), chat, codeMode, id, log, registerCodeHandlers(), registerPreviewHandlers() (+22 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.06
Nodes (49): AppCommand, AppInfo, BackgroundStatus, EVENT_CHANNELS, EventChannel, eventChannelFlags, Handler, INVOKE_CHANNELS (+41 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.06
Nodes (43): AgentPart, ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, ConversationKind, ReasoningPart, TaskFile (+35 more)

### Community 17 - "Messages.tsx"
Cohesion: 0.11
Nodes (13): ARTIFACT_ICONS, ARTIFACT_LABELS, ArtifactCard(), AttachmentImage(), attachmentImageUrl(), Lightbox(), MessageAttachments(), escapeAttr() (+5 more)

### Community 18 - "fetchWithTimeout"
Cohesion: 0.08
Nodes (15): lmStudioInstalled(), LmStudioProvider, argumentsObject(), ollamaOptions(), OllamaProvider, ollamaThink(), parseOllamaChatStream(), toOllamaMessages() (+7 more)

### Community 19 - "button.tsx"
Cohesion: 0.12
Nodes (9): Button, ButtonProps, IconButton, IconButtonProps, Size, sizes, Variant, variants (+1 more)

### Community 20 - "router.tsx"
Cohesion: 0.09
Nodes (16): ChatPage(), CustomizePage(), DiscoverPage(), PUBLISHERS, ArtifactsPage(), RecentsPage(), ModelsPage(), SOURCE_LABEL (+8 more)

### Community 21 - "LoadSettingsDialog.tsx"
Cohesion: 0.15
Nodes (10): CapabilityIcons(), FIT_COPY, FitBadge(), MemoryBars(), PROVIDER_LABEL, providerStateDot(), ProviderStatusDot(), CONTEXT_STEPS (+2 more)

### Community 22 - "stream-parsers.ts"
Cohesion: 0.08
Nodes (23): ANSI, ESC, killTree(), runCommand, runShell(), ShellOptions, ShellResult, defineTool() (+15 more)

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.10
Nodes (7): ACCENTS, LANGUAGES, SECTIONS, SHORTCUTS, VARIANT_LABEL, Voice(), WHISPER_BUILDS

### Community 24 - "types/models.ts"
Cohesion: 0.21
Nodes (13): pdfAvailable(), agentPowerShell(), cache, findOnPath(), PowerShellEdition, chatBaseTools(), CODE_TOOLS, codeToolsFor() (+5 more)

### Community 25 - "provider-configs.ts"
Cohesion: 0.07
Nodes (45): DOCUMENT_EXTENSIONS, connectorTool(), connectorToolName(), connectorTools(), diagnosticsTool, forgetTool, objectSchema(), readChatTool (+37 more)

### Community 26 - "hub.ts"
Cohesion: 0.08
Nodes (27): DownloadFileState, DownloadJob, DownloadStatus, DownloadTarget, HfFile, HfModelSummary, HfRepoDetail, HfSearchQuery (+19 more)

### Community 27 - ".doScan"
Cohesion: 0.16
Nodes (14): errorMessage(), describeLocation(), FoundGroup, inspectLocalGguf(), LocalModel, localModelId(), LocalModelIndex, log (+6 more)

### Community 28 - "LmStudioProvider"
Cohesion: 0.09
Nodes (26): CHART_KINDS, ChartRenderOptions, clamp(), LAYOUT_NAMES, layoutContent, layoutElements(), layoutName, LAYOUTS (+18 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.15
Nodes (28): codeSession(), BASE_HEADERS, buildPreviewUrl(), canConnect(), CONTENT_TYPES, fileResponse(), installPreview(), isListening() (+20 more)

### Community 30 - "OpenAIServerProvider"
Cohesion: 0.13
Nodes (18): BUILTINS, deleteProviderConfig(), getProviderConfig(), listProviderConfigs(), Row, saveProviderConfig(), seedBuiltinProviders(), toStored() (+10 more)

### Community 31 - "MemoryChatStore"
Cohesion: 0.19
Nodes (16): buildTaskHistory(), groupRounds(), HistoryOptions, historyTokens(), latestCompaction(), resultForModel(), Round, roundsToMessages() (+8 more)

### Community 33 - "Sidebar.tsx"
Cohesion: 0.12
Nodes (13): AppShell(), CodeSidebar(), SessionFilter, DownloadsButton(), TARGET_LABEL, SearchPalette(), Icon, NavItem() (+5 more)

### Community 34 - "Provider"
Cohesion: 0.08
Nodes (25): AgentPromptInput, buildAgentPrompt(), compactionRequest(), log, newToolCallId(), RoundOptions, TaskRunInput, asObject() (+17 more)

### Community 35 - "form.tsx"
Cohesion: 0.20
Nodes (3): Input, SelectOption, Textarea

### Community 36 - "devDependencies"
Cohesion: 0.11
Nodes (19): clsx, cmdk, @fontsource-variable/source-serif-4, monaco-editor, devDependencies, clsx, cmdk, @fontsource-variable/source-serif-4 (+11 more)

### Community 37 - "chat-smoke.mjs"
Cohesion: 0.22
Nodes (8): elapsed, logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3:0.6b', prompt = 'Say hello in five words.', shot = 'chat'], started

### Community 39 - "ModelRef"
Cohesion: 0.22
Nodes (13): computeQuantFit(), fitCache, fitInflight, fitWaiters, hfHeaders(), hfJson(), quantFit(), repoCache (+5 more)

### Community 40 - "build-artifact-runtime.mjs"
Cohesion: 0.25
Nodes (6): entry, outDir, output, root, tailwindOutput, tailwindSource

### Community 41 - ".update"
Cohesion: 0.14
Nodes (7): ConnectorManager, defaultPolicy(), Live, renderToolResult(), signatureOf(), toolPolicy(), withTimeout()

### Community 42 - "window.ts"
Cohesion: 0.16
Nodes (30): checkJavaScript(), checkJsonText(), checkPowerShell(), checkPyright(), checkPython(), checkRuff(), checkTypeScriptSyntax(), findPython() (+22 more)

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
Cohesion: 0.07
Nodes (26): coworkGuidance, parseParamsBillions(), ToolPart, StreamEvent, ModelEntry, BUILTIN_PROVIDER_IDS, ProviderConfig, ProviderConfigInput (+18 more)

### Community 51 - "verify-packaged.mjs"
Cohesion: 0.40
Nodes (3): exe, local, project

### Community 52 - "DiscoverPage.tsx"
Cohesion: 0.18
Nodes (13): ancestors(), baseName(), DirState, errorText(), FilesPane(), FilesState, handledRequests, HEAVY_DIRS (+5 more)

### Community 53 - "ModelsPage.tsx"
Cohesion: 0.15
Nodes (24): normalizeChart(), canonicalFields(), clamp(), color(), FORMATS, gradient(), KEY_ALIASES, length() (+16 more)

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
Cohesion: 0.10
Nodes (36): blockElements(), cellValue(), chartFromCode(), chartTable(), createPptx(), createXlsx(), DocumentOptions, DOCX_IMAGE_TYPES (+28 more)

### Community 63 - "cmdk"
Cohesion: 0.26
Nodes (20): escapeXml(), artboardHtml(), artboardStyle(), boxStyle(), cssText(), designHtml(), elementHtml(), HtmlOptions (+12 more)

### Community 66 - "electron-vite"
Cohesion: 0.14
Nodes (11): ChatRequest, cleanup, entry, fake, FakeProvider, finished(), makeRepo(), Provider (+3 more)

### Community 67 - "@fontsource-variable/inter"
Cohesion: 0.06
Nodes (89): hideQuickEntry(), openConversation(), quickEntryShortcutActive(), builtInCommands(), changed(), commandSlug(), customCommands(), deleteCommand() (+81 more)

### Community 68 - "@fontsource-variable/source-serif-4"
Cohesion: 0.17
Nodes (19): byPath(), commitAll(), deleteNewFile(), existsInBase(), gitChangeSet(), gitDiscardFile(), gitFailure(), gitNameStatus() (+11 more)

### Community 72 - "react"
Cohesion: 0.12
Nodes (10): ChatRequest, currentEntry, fake, FakeProvider, finished(), message(), Provider, Script (+2 more)

### Community 77 - "@streamdown/mermaid"
Cohesion: 0.13
Nodes (19): ChartElement, ChartKind, ChartSeries, ChartSpec, DesignElementType, DesignExportFormat, DesignExportRequest, DesignSummary (+11 more)

### Community 81 - "@tailwindcss/browser"
Cohesion: 0.24
Nodes (14): formatSchema, registerDesignHandlers(), copyDesign(), createDesign(), DesignConflictError, designForConversation(), DesignRow, getDesign() (+6 more)

### Community 82 - "@tanstack/react-query"
Cohesion: 0.15
Nodes (12): SideChatMessage, ask(), ChatRequest, createSession(), FakeProvider, msg(), Provider, question() (+4 more)

### Community 88 - "@vitejs/plugin-react"
Cohesion: 0.24
Nodes (15): backgroundAt(), checkArtboard(), intersects(), short(), estimateLines(), estimateTextHeight(), fitFontSize(), glyphWidth() (+7 more)

### Community 90 - "zustand"
Cohesion: 0.19
Nodes (13): DesignCard(), DesignEditorPage(), DesignHeader(), DesignHomePage(), errorText(), exportDesign(), FORMAT_ICONS, IDEAS (+5 more)

### Community 94 - "agent-core.test.ts"
Cohesion: 0.17
Nodes (22): absoluteUrl(), decodeEntities(), htmlToText(), NAMED_ENTITIES, PageText, parseBraveHtml(), parseDuckDuckGoHtml(), parseSearxngJson() (+14 more)

### Community 95 - "Cellar roadmap"
Cohesion: 0.07
Nodes (26): Cellar roadmap, Known gaps and follow-ups from M1, Known gaps and follow-ups from M2, Known gaps and follow-ups from M3, Known gaps and follow-ups from M4, Known gaps and follow-ups from M5, M1 Foundation — delivered, M2 Cowork — delivered (+18 more)

### Community 96 - "services/models.ts"
Cohesion: 0.24
Nodes (14): defaultPreset(), getPreset(), resetPreset(), savePreset(), deleteModel(), listModels(), loadedModels(), loadModel() (+6 more)

### Community 97 - "cowork-smoke.mjs"
Cohesion: 0.13
Nodes (13): approvals, chips, elapsed, files, folder, logs, outDir, problems (+5 more)

### Community 98 - "tools/types.ts"
Cohesion: 0.16
Nodes (9): DAYS, describeCron(), nextFire(), pad(), parseCron(), previewCron(), Scheduler, toRun() (+1 more)

### Community 99 - "agent.ts"
Cohesion: 0.10
Nodes (32): INIT_PROMPT, IpcInvokeMap, PermissionMode, ConversationSummary, ProjectIndexStatus, ThinkingLevel, ChangedFile, ChangeSet (+24 more)

### Community 100 - "history.ts"
Cohesion: 0.14
Nodes (12): address, approvals, elapsed, logs, outDir, problems, profile, project (+4 more)

### Community 101 - "Workspace"
Cohesion: 0.16
Nodes (26): BOM, byPath(), countable(), snapshotChangeSet(), snapshotDiscardFile(), WriteOptions, countLineChanges(), countLines() (+18 more)

### Community 102 - "orchestrator.ts"
Cohesion: 0.13
Nodes (15): ActiveGeneration, log, TurnFinished, throttle(), providers, log, RunRow, TaskRow (+7 more)

### Community 103 - "util.ts"
Cohesion: 0.19
Nodes (13): clampSize(), COLOR_TOKENS, FontCategory, FORMAT_DEFAULTS, hex6(), luminance(), mixColors(), NAMED (+5 more)

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
Cohesion: 0.28
Nodes (12): ThemePanel(), chartSvg(), clamp(), formatValue(), niceScale(), r1(), truncate(), wrap() (+4 more)

### Community 111 - "ToolContext"
Cohesion: 0.09
Nodes (18): cell, createPdf, createPptx, createXlsx, DOCUMENT_EXTENSIONS, documentOptions(), documentPath(), documentTarget() (+10 more)

### Community 112 - "🎨 AI Design Engine: Concept & Specification Document"
Cohesion: 0.29
Nodes (6): 🚀 1. Overview: Bridging the Gap Between Text and Visual Design, 🧱 2. The Limitations of Current Text-Based AI, ✨ 3. The Vision: Desired Capabilities (The Next-Generation AI), 🛠️ 4. Technical Feature Checklist (The Design Specification), 🧠 5. AI Self-Assessment and Self-Identified Issues, 🎨 AI Design Engine: Concept & Specification Document

### Community 113 - "CodeModeMenu.tsx"
Cohesion: 0.52
Nodes (6): CODE_MODE_OPTIONS, codeModeKey(), CodeModeMenu(), CodeModeValue, nextCodeMode(), Option

### Community 114 - "code-changes.test.ts"
Cohesion: 0.07
Nodes (31): ChecksumError, downloadFile(), DownloadOptions, fileSize(), hashExisting(), cleanTranscript(), findCli(), modelsDir() (+23 more)

### Community 115 - "stores/code.ts"
Cohesion: 0.33
Nodes (5): CodePane, CodeUiState, EditorRequest, PreviewRequest, useCodeUi

### Community 116 - "monaco-editor"
Cohesion: 0.22
Nodes (6): project, lastUserText(), MockRequest, MockServer, sleep(), startMockServer()

### Community 120 - "@xterm/addon-fit"
Cohesion: 0.17
Nodes (12): scripts, build, build:win, dev, preview, runtime:artifacts, test, test:e2e (+4 more)

### Community 124 - "plugins.ts"
Cohesion: 0.33
Nodes (5): dot(), EmbeddingIndex, embeddingPrefixes(), fromBlob(), toBlob()

### Community 125 - "errorMessage"
Cohesion: 0.18
Nodes (8): exportDir, formatLabels, logs, outDir, problems, profile, project, [
  providerId = 'ollama',
  modelId = 'qwen3.5:9b',
  prompt = 'Create a 5-slide pitch deck for "Bean Club", a neighborhood coffee subscription: a cover, the problem, how it works, growth in members (Jan 120, Feb 180, Mar 260, Apr 410) as a chart, and a closing slide.',
  shot = 'design',
]

### Community 126 - "CustomizePage.tsx"
Cohesion: 0.17
Nodes (18): attempt(), CommandDialog(), CommandsSection(), ConnectorCard(), ConnectorDialog(), ConnectorsSection(), errorText(), ImportJsonDialog() (+10 more)

### Community 127 - "LlamaCppProvider"
Cohesion: 0.25
Nodes (10): attachmentImage(), PREVIEW_SCHEME_PRIVILEGES, ARTIFACT_CSP, escapeScript(), handleArtifactProtocol(), handleAttachmentProtocol(), registerArtifactScheme(), renderArtifactDocument() (+2 more)

### Community 128 - "memory.ts"
Cohesion: 0.24
Nodes (15): connectors, log, deleteStoredConnector(), ensureOverride(), listStoredConnectors(), pluginOverrides(), record(), Row (+7 more)

### Community 129 - "commands.ts"
Cohesion: 0.29
Nodes (9): ChangesPane(), Counts(), errorText(), FileRow(), FileRowProps, num(), splitPath(), STATUS (+1 more)

### Community 131 - "m4-handlers.ts"
Cohesion: 0.20
Nodes (8): DesignLayoutState, DesignTool, EditorState, selectedArtboard(), selectedElements(), Selection, useDesignEditor, useDesignLayout

### Community 132 - "tasks.ts"
Cohesion: 0.16
Nodes (10): prepareBranch(), describeTool(), DiffLine, DOCUMENT_TOOLS, Icon, IDEAS, PERMISSION_MODES, short() (+2 more)

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
Cohesion: 0.13
Nodes (21): exists(), inside(), Workspace, changed(), contentSchema, conversationIdSchema, listDirectory(), readWorkspaceFile() (+13 more)

### Community 137 - "quants.ts"
Cohesion: 0.36
Nodes (10): basename(), GroupedRepoFiles, groupQuantFiles(), isAuxiliaryGguf(), isMmprojFile(), parentName(), preferredMmproj(), quantBits() (+2 more)

### Community 138 - "code/ipc.ts"
Cohesion: 0.17
Nodes (25): baseBlob(), branchExists(), branchSlug(), copyWorktreeIncludes(), createWorktree(), currentBranch(), findMemoryFile(), git() (+17 more)

### Community 139 - "main.tsx"
Cohesion: 0.40
Nodes (4): queryClient, quick, QuickEntry(), router

### Community 140 - "streams.ts"
Cohesion: 0.33
Nodes (4): useIpcSync(), pending, StreamsState, useStreams

### Community 141 - "dictation.ts"
Cohesion: 0.38
Nodes (5): DictationState, encodeWav(), toSpeechWav(), useDictation(), cleanIpcError()

### Community 142 - "ArtifactPanel"
Cohesion: 0.83
Nodes (3): ArtifactPanel(), fence(), IFRAME_TYPES

### Community 145 - "package.json"
Cohesion: 0.22
Nodes (8): author, description, license, main, name, private, productName, version

### Community 146 - "glob.ts"
Cohesion: 0.33
Nodes (8): escapeRegex(), globFiles(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry, WalkOptions

### Community 147 - "hardware.ts"
Cohesion: 0.36
Nodes (8): estimateLoad(), detectHardware(), exec, log, nvidiaGpus(), otherGpus(), parseNvidiaSmi(), vramBudgetBytes()

### Community 148 - "MonacoEditor.tsx"
Cohesion: 0.39
Nodes (7): CodeEditor(), CodeEditorProps, DiffEditor(), DiffEditorProps, setModelText(), TextModel, useMonaco()

### Community 149 - "memory-estimate.ts"
Cohesion: 0.38
Nodes (6): EstimateInput, estimateMemory(), isSlidingLayer(), KV_BYTES_PER_ELEMENT, kvBytesPerLayer(), MemoryBudget

### Community 150 - "code-changes.test.ts"
Cohesion: 0.38
Nodes (5): CodeSessionInfo, BOM, commit(), makeRepo(), sh()

## Knowledge Gaps
- **636 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+631 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `paths()` connect `@fontsource-variable/inter` to `memory.ts`, `LlamaCppProvider`, `ChatOrchestrator`, `run`, `scripts`, `window.ts`, `openai-compat.ts`, `code/ipc.ts`, `main/index.ts`, `handlers.ts`, `router.tsx`, `.doScan`, `OpenAIServerProvider`, `Provider`, `.update`, `zustand`, `Workspace`, `orchestrator.ts`, `code-changes.test.ts`, `LlamaCppProvider`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `dependencies` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `errorMessage()` connect `.doScan` to `memory.ts`, `LlamaCppProvider`, `DownloadManager`, `ChatOrchestrator`, `engine.ts`, `run`, `openai-compat.ts`, `orchestrator.ts`, `main/index.ts`, `handlers.ts`, `fetchWithTimeout`, `OpenAIServerProvider`, `ProviderRegistry`, `Provider`, `ModelRef`, `.update`, `@fontsource-variable/inter`, `tools/types.ts`, `orchestrator.ts`, `code-changes.test.ts`, `plugins.ts`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `paths()` (e.g. with `Composer()` and `DesignHeader()`) actually correct?**
  _`paths()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `registerIpcHandlers()` (e.g. with `toPublicConfig()` and `.name()`) actually correct?**
  _`registerIpcHandlers()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _636 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `LlamaCppProvider` be split into smaller, more focused modules?**
  _Cohesion score 0.05727644652250146 - nodes in this community are weakly interconnected._