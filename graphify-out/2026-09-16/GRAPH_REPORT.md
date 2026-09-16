# Graph Report - Cellar  (2026-09-16)

## Corpus Check
- 262 files · ~268,818 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3095 nodes · 7408 edges · 173 communities (139 shown, 34 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 121 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `178c4cd9`
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
- snapshots.ts
- LmStudioProvider
- math-smoke.mjs
- attachments.ts
- run
- TerminalManager
- MathPage.tsx
- terminal.test.ts
- agent-core.test.ts
- AppShell.tsx
- shared/artifacts.ts
- Renderer
- registerTerminalHandlers
- @fontsource-variable/source-serif-4
- @streamdown/mermaid
- @tailwindcss/browser
- @xterm/addon-fit
- zustand

## God Nodes (most connected - your core abstractions)
1. `IpcInvokeMap` - 82 edges
2. `run()` - 67 edges
3. `paths()` - 66 edges
4. `errorMessage()` - 53 edges
5. `registerIpcHandlers()` - 43 edges
6. `newId()` - 43 edges
7. `ChatOrchestrator` - 38 edges
8. `get()` - 37 edges
9. `registerM4Handlers()` - 34 edges
10. `invoke()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `runShell()` --indirect_call--> `collect()`  [INFERRED]
  src/main/agent/tools/command.ts → tests/unit/stream-parsers.test.ts
- `waitFor()` --calls--> `check()`  [EXTRACTED]
  tests/unit/terminal.test.ts → src/main/code/terminal.ts
- `SideChat()` --indirect_call--> `question()`  [INFERRED]
  src/renderer/src/components/code/SideChat.tsx → tests/unit/side-chat.test.ts
- `QuizView()` --indirect_call--> `question()`  [INFERRED]
  src/renderer/src/components/math/Blocks.tsx → tests/unit/side-chat.test.ts
- `answerOf()` --calls--> `calculate()`  [EXTRACTED]
  tests/unit/math.test.ts → src/shared/math/calc.ts

## Import Cycles
- None detected.

## Communities (173 total, 34 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.23
Nodes (11): detectReasoningStyle(), EMBEDDING_ARCHES, FILE_TYPE_NAMES, isEmbeddingModel(), num(), numOrArray(), summarizeGguf(), tensorBytes() (+3 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.10
Nodes (19): LocalModel, buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), formatParamCount(), freePort(), Instance (+11 more)

### Community 2 - "queries.ts"
Cohesion: 0.17
Nodes (16): effectiveThinking(), isChatCapable(), thinkingLabel(), thinkingOptions(), useAppCommands(), useSelectedModel(), useThemeSync(), cleanIpcError() (+8 more)

### Community 3 - "ChatOrchestrator"
Cohesion: 0.12
Nodes (5): ChatOrchestrator, prepareDesignSession(), newId(), prepareMathSession(), discardIncognitoArtifacts()

### Community 4 - "engine.ts"
Cohesion: 0.15
Nodes (20): active, buildSideChatPrompt(), clipTranscript(), fitSideMessages(), FRIENDLY_ERRORS, log, parseSideChatRequest(), PENDING_RESULTS (+12 more)

### Community 5 - "run"
Cohesion: 0.13
Nodes (22): PREVIEW_SCHEME_PRIVILEGES, all(), db(), get(), migrate(), openDatabase(), p(), migrations (+14 more)

### Community 6 - "scripts"
Cohesion: 0.08
Nodes (25): croner, docx, exceljs, extract-zip, @huggingface/gguf, jszip, marked, @modelcontextprotocol/sdk (+17 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.15
Nodes (20): estimateTokens(), FitResult, fitToContext(), messageTokens(), toTurns(), truncateMiddle(), ActiveGeneration, log (+12 more)

### Community 8 - "openai-compat.ts"
Cohesion: 0.10
Nodes (19): StoredProviderConfig, LmsDownloadStatus, LmsModel, lmStudioInstalled(), authHeaders(), baseEntry(), ChatChunk, fetchEmbeddings() (+11 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (29): electron.vite.config.ts, electron-vite/node, node, playwright.config.ts, scripts/**/*.ts, src/main/**/*, src/preload/**/*, tests/**/* (+21 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, src/artifact-runtime/**/*, src/preload/api.d.ts, src/renderer/src/**/*, src/renderer/src/**/*.tsx, vite/client, compilerOptions (+19 more)

### Community 11 - "orchestrator.ts"
Cohesion: 0.14
Nodes (17): conversationIdSchema, CreateTerminalOptions, dataSchema, envValue(), findOnPath(), idSchema, log, lstatExists() (+9 more)

### Community 12 - "main/index.ts"
Cohesion: 0.10
Nodes (34): attachCloseToTray(), backgroundActive(), createMain(), getMain(), hideQuickEntry(), iconPath(), installBackground(), isQuitting() (+26 more)

### Community 13 - "DownloadManager"
Cohesion: 0.05
Nodes (43): addArtboard(), addElement(), AlignEdge, alignSelection(), copySelection(), deleteArtboard(), deleteSelection(), duplicateSelection() (+35 more)

### Community 14 - "handlers.ts"
Cohesion: 0.13
Nodes (32): registerPreviewHandlers(), registerSideChatHandlers(), listConversations(), ftsQuery(), transaction(), readme(), repoDetail(), searchModels() (+24 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.05
Nodes (74): Window, AppCommand, AppInfo, BackgroundStatus, CellarBridge, EVENT_CHANNELS, EventChannel, eventChannelFlags (+66 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.11
Nodes (26): ConversationKind, TaskStartOptions, TaskStatus, Artifact, AttachmentKind, AttachmentRef, Conversation, ConversationFilter (+18 more)

### Community 17 - "Messages.tsx"
Cohesion: 0.11
Nodes (13): ARTIFACT_ICONS, ARTIFACT_LABELS, ArtifactCard(), AttachmentImage(), attachmentImageUrl(), Lightbox(), MessageAttachments(), escapeAttr() (+5 more)

### Community 18 - "fetchWithTimeout"
Cohesion: 0.16
Nodes (13): fetchWithTimeout(), argumentsObject(), OllamaChatLine, ollamaOptions(), OllamaProvider, OllamaPs, OllamaPullProgress, OllamaShow (+5 more)

### Community 19 - "button.tsx"
Cohesion: 0.12
Nodes (9): Button, ButtonProps, IconButton, IconButtonProps, Size, sizes, Variant, variants (+1 more)

### Community 20 - "router.tsx"
Cohesion: 0.09
Nodes (15): ChatPage(), CustomizePage(), DiscoverPage(), PUBLISHERS, ArtifactsPage(), RecentsPage(), ModelsPage(), SOURCE_LABEL (+7 more)

### Community 21 - "LoadSettingsDialog.tsx"
Cohesion: 0.15
Nodes (10): CapabilityIcons(), FIT_COPY, FitBadge(), MemoryBars(), PROVIDER_LABEL, providerStateDot(), ProviderStatusDot(), CONTEXT_STEPS (+2 more)

### Community 22 - "stream-parsers.ts"
Cohesion: 0.08
Nodes (23): ANSI, ESC, killTree(), runCommand, runShell(), ShellOptions, ShellResult, cleanSchema() (+15 more)

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.09
Nodes (8): ACCENTS, LANGUAGES, SECTIONS, SettingsPage(), SHORTCUTS, VARIANT_LABEL, Voice(), WHISPER_BUILDS

### Community 25 - "provider-configs.ts"
Cohesion: 0.08
Nodes (41): pdfAvailable(), connectorTool(), connectorToolName(), connectorTools(), diagnosticsTool, forgetTool, objectSchema(), readChatTool (+33 more)

### Community 26 - "hub.ts"
Cohesion: 0.08
Nodes (27): DownloadFileState, DownloadJob, DownloadStatus, DownloadTarget, HfFile, HfModelSummary, HfRepoDetail, HfSearchQuery (+19 more)

### Community 27 - ".doScan"
Cohesion: 0.16
Nodes (14): ParsedShard, describeLocation(), FoundGroup, inspectLocalGguf(), localModelId(), LocalModelIndex, localModels, log (+6 more)

### Community 28 - "LmStudioProvider"
Cohesion: 0.09
Nodes (26): CHART_KINDS, ChartRenderOptions, clamp(), LAYOUT_NAMES, layoutContent, layoutElements(), layoutName, LAYOUTS (+18 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.10
Nodes (34): exists(), inside(), PathAccessError, Workspace, listDirectory(), writeWorkspaceFile(), CodeSessionContext, BASE_HEADERS (+26 more)

### Community 30 - "OpenAIServerProvider"
Cohesion: 0.13
Nodes (18): BUILTINS, deleteProviderConfig(), getProviderConfig(), listProviderConfigs(), Row, saveProviderConfig(), seedBuiltinProviders(), toPublicConfig() (+10 more)

### Community 31 - "MemoryChatStore"
Cohesion: 0.31
Nodes (12): buildTaskHistory(), groupRounds(), HistoryOptions, latestCompaction(), resultForModel(), Round, roundsToMessages(), transcriptForSummary() (+4 more)

### Community 32 - "ProviderRegistry"
Cohesion: 0.13
Nodes (3): ProviderRegistry, withTimeout(), Provider

### Community 33 - "Sidebar.tsx"
Cohesion: 0.21
Nodes (8): SessionFilter, DownloadsButton(), TARGET_LABEL, Icon, NavItem(), ProfileMenuContent(), RecentFilter, RowMarker()

### Community 34 - "Provider"
Cohesion: 0.08
Nodes (31): AgentPromptInput, buildAgentPrompt(), compactionRequest(), log, newToolCallId(), RoundOptions, agentPowerShell(), cache (+23 more)

### Community 35 - "form.tsx"
Cohesion: 0.20
Nodes (3): Input, SelectOption, Textarea

### Community 36 - "devDependencies"
Cohesion: 0.07
Nodes (29): clsx, cmdk, electron, @fontsource-variable/inter, devDependencies, clsx, cmdk, electron (+21 more)

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
Cohesion: 0.11
Nodes (21): ConnectorManager, defaultPolicy(), Live, log, renderToolResult(), signatureOf(), toolPolicy(), withTimeout() (+13 more)

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

### Community 48 - "CellarBridge"
Cohesion: 0.07
Nodes (46): addBlock(), addStroke(), answerMatches(), answerQuestion(), clearSketch(), deleteBlock(), duplicateBlock(), eraseStroke() (+38 more)

### Community 49 - "HomePage.tsx"
Cohesion: 0.29
Nodes (4): CoworkExtras(), folderName(), HomePage(), SUGGESTIONS

### Community 50 - "providers.ts"
Cohesion: 0.06
Nodes (27): coworkGuidance, parseParamsBillions(), ToolPart, StreamEvent, ModelEntry, BUILTIN_PROVIDER_IDS, ProviderConfig, ProviderConfigInput (+19 more)

### Community 51 - "verify-packaged.mjs"
Cohesion: 0.33
Nodes (4): exe, exportDir, local, project

### Community 52 - "DiscoverPage.tsx"
Cohesion: 0.09
Nodes (29): ChangesPane(), Counts(), errorText(), FileRow(), FileRowProps, num(), splitPath(), STATUS (+21 more)

### Community 53 - "ModelsPage.tsx"
Cohesion: 0.14
Nodes (25): normalizeChart(), canonicalFields(), clamp(), color(), FORMATS, gradient(), KEY_ALIASES, length() (+17 more)

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
Cohesion: 0.12
Nodes (31): blockElements(), cellValue(), chartFromCode(), chartTable(), createXlsx(), DOCX_IMAGE_TYPES, escapeHtml(), excelCellText() (+23 more)

### Community 63 - "cmdk"
Cohesion: 0.26
Nodes (20): escapeXml(), artboardHtml(), artboardStyle(), boxStyle(), cssText(), designHtml(), elementHtml(), HtmlOptions (+12 more)

### Community 64 - "electron"
Cohesion: 0.10
Nodes (48): approxRational(), Exact, exactAdd(), exactDiv(), exactFromNumber(), exactInt(), exactInverse(), exactIsZero() (+40 more)

### Community 66 - "electron-vite"
Cohesion: 0.14
Nodes (11): ChatRequest, cleanup, entry, fake, FakeProvider, finished(), makeRepo(), Provider (+3 more)

### Community 67 - "@fontsource-variable/inter"
Cohesion: 0.22
Nodes (25): activeSkills(), allSkills(), changed(), claudeSkillsAvailable(), copySkill(), deleteSkill(), findActiveSkill(), findSkillFolders() (+17 more)

### Community 68 - "@fontsource-variable/source-serif-4"
Cohesion: 0.15
Nodes (31): changed(), contentSchema, conversationIdSchema, snapshotDiscardFile(), baseBlob(), byPath(), commitAll(), deleteNewFile() (+23 more)

### Community 70 - "@playwright/test"
Cohesion: 0.11
Nodes (41): blockType(), FIGURE_KINDS, figureKindOf(), isObject(), LIMITS, Loose, measureList(), nextBlockId() (+33 more)

### Community 72 - "react"
Cohesion: 0.12
Nodes (10): ChatRequest, currentEntry, fake, FakeProvider, finished(), message(), Provider, Script (+2 more)

### Community 73 - "react-dom"
Cohesion: 0.14
Nodes (37): CalcOptions, CalcResult, calculate(), evaluationSteps(), measureOf(), prettyMeasure(), formatExact(), AngleMode (+29 more)

### Community 74 - "streamdown"
Cohesion: 0.12
Nodes (28): Atom, escapeHtml(), mathToPlain(), prepare(), renderMath(), superscript(), SUPERSCRIPT_DIGITS, SYMBOLS (+20 more)

### Community 75 - "@streamdown/code"
Cohesion: 0.11
Nodes (26): area(), arithmetic(), Draft, fractions(), fromSolution(), GeneratedQuiz, generateQuiz(), GENERATORS (+18 more)

### Community 77 - "@streamdown/mermaid"
Cohesion: 0.19
Nodes (14): ChartElement, ChartKind, ChartSeries, ChartSpec, DesignExportFormat, ElementBase, ImageElement, LineElement (+6 more)

### Community 80 - "tailwindcss"
Cohesion: 0.10
Nodes (10): ConversationPatch, ConversationRow, deleteConversations(), kindOf(), MemoryChatStore, MessagePatch, MessageRow, searchMessages() (+2 more)

### Community 81 - "@tailwindcss/browser"
Cohesion: 0.14
Nodes (25): attachmentImage(), ensureSession(), exportDesign(), ExportTarget, fileSafe(), imageUrls(), renderSession(), withPage() (+17 more)

### Community 82 - "@tanstack/react-query"
Cohesion: 0.13
Nodes (15): AgentPart, ChatStreamEvent, Message, SideChatEvent, SideChatMessage, ask(), ChatRequest, FakeProvider (+7 more)

### Community 86 - "typescript"
Cohesion: 0.16
Nodes (22): renderPdf(), renderPng(), exportBoard(), ExportTarget, fileSafe(), angleMode, paper, registerMathHandlers() (+14 more)

### Community 87 - "vite"
Cohesion: 0.19
Nodes (23): changed(), countEntries(), describe(), enabledPlugins(), exec, expandPluginVars(), findPluginRoots(), installPlugin() (+15 more)

### Community 88 - "@vitejs/plugin-react"
Cohesion: 0.24
Nodes (15): backgroundAt(), checkArtboard(), intersects(), short(), estimateLines(), estimateTextHeight(), fitFontSize(), glyphWidth() (+7 more)

### Community 89 - "vitest"
Cohesion: 0.14
Nodes (14): backendsFromFiles(), bestRuntime(), exec, findServerDir(), idForDir(), log, parseDevicesOutput(), parseReleaseAssets() (+6 more)

### Community 90 - "zustand"
Cohesion: 0.19
Nodes (13): DesignCard(), DesignEditorPage(), DesignHeader(), DesignHomePage(), errorText(), exportDesign(), FORMAT_ICONS, IDEAS (+5 more)

### Community 94 - "agent-core.test.ts"
Cohesion: 0.19
Nodes (21): absoluteUrl(), decodeEntities(), htmlToText(), NAMED_ENTITIES, PageText, parseBraveHtml(), parseDuckDuckGoHtml(), parseSearxngJson() (+13 more)

### Community 95 - "Cellar roadmap"
Cohesion: 0.06
Nodes (29): Cellar roadmap, Known gaps and follow-ups from M1, Known gaps and follow-ups from M2, Known gaps and follow-ups from M3, Known gaps and follow-ups from M4, Known gaps and follow-ups from M5, Known gaps and follow-ups from M6, M1 Foundation — delivered (+21 more)

### Community 96 - "services/models.ts"
Cohesion: 0.26
Nodes (12): resetPreset(), savePreset(), deleteModel(), listModels(), loadedModels(), loadModel(), modelDetail(), requireModel() (+4 more)

### Community 97 - "cowork-smoke.mjs"
Cohesion: 0.13
Nodes (13): approvals, chips, elapsed, files, folder, logs, outDir, problems (+5 more)

### Community 98 - "tools/types.ts"
Cohesion: 0.16
Nodes (9): DAYS, describeCron(), nextFire(), pad(), parseCron(), previewCron(), Scheduler, toRun() (+1 more)

### Community 99 - "agent.ts"
Cohesion: 0.15
Nodes (15): PermissionMode, MessageModelInfo, ProjectIndexStatus, ModelRef, CronPreview, ScheduledRun, ScheduledRunStatus, ScheduledTask (+7 more)

### Community 100 - "history.ts"
Cohesion: 0.14
Nodes (12): address, approvals, elapsed, logs, outDir, problems, profile, project (+4 more)

### Community 101 - "Workspace"
Cohesion: 0.25
Nodes (17): BOM, byPath(), countable(), readWorkspaceFile(), snapshotChangeSet(), snapshotFileDiff(), WriteOptions, buildDiff() (+9 more)

### Community 102 - "orchestrator.ts"
Cohesion: 0.12
Nodes (14): stableJson(), chat, TurnFinished, ACTIVE, log, Row, errorMessage(), sleep() (+6 more)

### Community 103 - "util.ts"
Cohesion: 0.16
Nodes (15): clampSize(), COLOR_TOKENS, FontCategory, FORMAT_DEFAULTS, hex6(), luminance(), mixColors(), NAMED (+7 more)

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
Cohesion: 0.06
Nodes (37): ChecksumError, downloadFile(), DownloadOptions, fileSize(), hashExisting(), cleanTranscript(), CLI_NAMES, findCli() (+29 more)

### Community 115 - "stores/code.ts"
Cohesion: 0.33
Nodes (5): CodePane, CodeUiState, EditorRequest, PreviewRequest, useCodeUi

### Community 116 - "monaco-editor"
Cohesion: 0.20
Nodes (6): project, lastUserText(), MockRequest, MockServer, sleep(), startMockServer()

### Community 120 - "@xterm/addon-fit"
Cohesion: 0.17
Nodes (12): scripts, build, build:win, dev, preview, runtime:artifacts, test, test:e2e (+4 more)

### Community 122 - "@xterm/xterm"
Cohesion: 0.17
Nodes (21): angleArc(), buildFigure(), BuiltFigure, centroid(), completeRightTriangle(), DEFAULT_LABELS, figureLabel(), format() (+13 more)

### Community 124 - "plugins.ts"
Cohesion: 0.28
Nodes (7): ChunkRow, dot(), EmbeddingIndex, embeddingPrefixes(), fromBlob(), log, toBlob()

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
Cohesion: 0.10
Nodes (15): addBlocksTool, blockSchema, calculateTool, deleteBlocksTool, drawFigureTool, figureSchema, getBoardTool, makeQuizTool (+7 more)

### Community 128 - "memory.ts"
Cohesion: 0.16
Nodes (22): connectors, assistantContext, addMemory(), changed(), clean(), clearMemories(), deleteMemory(), findMemory() (+14 more)

### Community 129 - "commands.ts"
Cohesion: 0.25
Nodes (16): builtInCommands(), changed(), commandSlug(), customCommands(), deleteCommand(), expandCommand(), expandTemplate(), getCommand() (+8 more)

### Community 131 - "m4-handlers.ts"
Cohesion: 0.20
Nodes (8): DesignLayoutState, DesignTool, EditorState, selectedArtboard(), selectedElements(), Selection, useDesignEditor, useDesignLayout

### Community 132 - "tasks.ts"
Cohesion: 0.18
Nodes (9): describeTool(), DiffLine, DOCUMENT_TOOLS, Icon, IDEAS, PERMISSION_MODES, short(), text() (+1 more)

### Community 133 - "m4-smoke.mjs"
Cohesion: 0.17
Nodes (8): logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3.5:9b', embeddingId = 'nomic-embed-text:latest'], results, skip

### Community 134 - "window.ts"
Cohesion: 0.23
Nodes (7): streamChatCompletion(), parseNDJSON(), parseSSE(), partialSuffix(), readLines(), SplitPart, ThinkTagSplitter

### Community 135 - "ScheduledPage.tsx"
Cohesion: 0.27
Nodes (9): buildCron(), DAYS, errorText(), formatWhen(), Frequency, parseSchedule(), RunHistory(), ScheduledPage() (+1 more)

### Community 136 - ".resolve"
Cohesion: 0.11
Nodes (11): historyTokens(), ToolProtocol, agentNoun(), chatTaskState(), joinReasoning(), joinText(), LiveRun, TaskRunInput (+3 more)

### Community 137 - "quants.ts"
Cohesion: 0.36
Nodes (10): basename(), GroupedRepoFiles, groupQuantFiles(), isAuxiliaryGguf(), isMmprojFile(), parentName(), preferredMmproj(), quantBits() (+2 more)

### Community 138 - "code/ipc.ts"
Cohesion: 0.12
Nodes (29): codeSession(), branchExists(), branchSlug(), copyWorktreeIncludes(), createWorktree(), currentBranch(), findMemoryFile(), gitAvailable() (+21 more)

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

### Community 145 - "package.json"
Cohesion: 0.22
Nodes (8): author, description, license, main, name, private, productName, version

### Community 146 - "glob.ts"
Cohesion: 0.15
Nodes (18): DOCUMENT_EXTENSIONS, escapeRegex(), globFiles(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry (+10 more)

### Community 147 - "hardware.ts"
Cohesion: 0.36
Nodes (8): estimateLoad(), detectHardware(), exec, log, nvidiaGpus(), otherGpus(), parseNvidiaSmi(), vramBudgetBytes()

### Community 148 - "MonacoEditor.tsx"
Cohesion: 0.19
Nodes (12): pptxgenjs, pptxgenjs, createPptx(), DocumentOptions, DocxContext, ResolvedDocumentAssets, ResolvedImage, artboardsToPptx() (+4 more)

### Community 149 - "memory-estimate.ts"
Cohesion: 0.38
Nodes (6): EstimateInput, estimateMemory(), isSlidingLayer(), KV_BYTES_PER_ELEMENT, kvBytesPerLayer(), MemoryBudget

### Community 150 - "code-changes.test.ts"
Cohesion: 0.09
Nodes (21): INIT_PROMPT, ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, ReasoningPart, TaskFile, TaskSource (+13 more)

### Community 151 - "TypedBus"
Cohesion: 0.11
Nodes (18): installPdfRenderer(), installTaskNotifications(), log, setPdfRenderer(), setSvgRasterizer(), rasterizeSvg(), assertTrusted(), forwardBusToWindows() (+10 more)

### Community 154 - "@vitejs/plugin-react"
Cohesion: 0.34
Nodes (4): canonicalFunction(), CONSTANTS, Parser, tokenize()

### Community 155 - "snapshots.ts"
Cohesion: 0.35
Nodes (12): folder(), forgetSnapshot(), manifestPath(), queues, readManifest(), serial(), snapshotBeforeChange(), SnapshotEntry (+4 more)

### Community 157 - "math-smoke.mjs"
Cohesion: 0.17
Nodes (9): exportDir, logs, outDir, problems, profile, project, [
  providerId = 'ollama',
  modelId = 'qwen3.5:9b',
  prompt =
    'Teach me the Pythagorean theorem: the rule, a drawing of a right triangle with legs 3 and 4, a worked example finding the hypotenuse, and one where a leg is missing and the answer is a root. Then give me 4 practice questions.',
  shot = 'math',
], quiz (+1 more)

### Community 158 - "attachments.ts"
Cohesion: 0.26
Nodes (11): attachmentFromBytes(), attachmentRefs(), attachmentsFromPaths(), classifyFile(), cleanupOrphanAttachments(), extractPdfText(), IMAGE_TYPES, Row (+3 more)

### Community 159 - "run"
Cohesion: 0.27
Nodes (4): SqliteChatStore, toMessage(), run(), createSession()

### Community 161 - "MathPage.tsx"
Cohesion: 0.29
Nodes (11): BoardCard(), errorText(), exportBoard(), IDEAS, isEditableTarget(), MathBoardPage(), MathHeader(), MathHomePage() (+3 more)

### Community 162 - "terminal.test.ts"
Cohesion: 0.22
Nodes (3): OutputBuffer, Emitted, waitFor()

### Community 163 - "agent-core.test.ts"
Cohesion: 0.36
Nodes (5): parseOllamaChatStream(), samplingBody(), thinkingBody(), toolsBody(), toOpenAIMessages()

### Community 164 - "AppShell.tsx"
Cohesion: 0.24
Nodes (5): AppShell(), CodeSidebar(), SearchPalette(), Sidebar(), TitleBar()

### Community 165 - "shared/artifacts.ts"
Cohesion: 0.31
Nodes (9): artifactTypeFor(), deriveArtifactTitle(), LANGUAGE_TYPES, parseArtifacts(), ParsedArtifact, parseInfoString(), slugify(), TYPE_TITLES (+1 more)

## Knowledge Gaps
- **716 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+711 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `errorMessage()` connect `orchestrator.ts` to `DownloadManager`, `ChatOrchestrator`, `engine.ts`, `chat.test.ts`, `.resolve`, `openai-compat.ts`, `code/ipc.ts`, `orchestrator.ts`, `main/index.ts`, `handlers.ts`, `fetchWithTimeout`, `TypedBus`, `.doScan`, `TerminalManager`, `ProviderRegistry`, `Provider`, `registerTerminalHandlers`, `ModelRef`, `.update`, `@fontsource-variable/inter`, `vite`, `vitest`, `tools/types.ts`, `code-changes.test.ts`, `plugins.ts`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `dependencies` connect `scripts` to `package.json`, `MonacoEditor.tsx`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `paths()` connect `@fontsource-variable/inter` to `memory.ts`, `commands.ts`, `ChatOrchestrator`, `run`, `.resolve`, `openai-compat.ts`, `code/ipc.ts`, `main/index.ts`, `handlers.ts`, `router.tsx`, `TypedBus`, `.doScan`, `snapshots.ts`, `attachments.ts`, `OpenAIServerProvider`, `Provider`, `.update`, `@tailwindcss/browser`, `vite`, `vitest`, `zustand`, `orchestrator.ts`, `code-changes.test.ts`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `paths()` (e.g. with `Composer()` and `DesignHeader()`) actually correct?**
  _`paths()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `registerIpcHandlers()` (e.g. with `toPublicConfig()` and `.name()`) actually correct?**
  _`registerIpcHandlers()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _716 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `LlamaCppProvider` be split into smaller, more focused modules?**
  _Cohesion score 0.10128205128205128 - nodes in this community are weakly interconnected._