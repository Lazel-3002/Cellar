# Graph Report - Cellar  (2026-09-16)

## Corpus Check
- 268 files · ~271,890 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3123 nodes · 7461 edges · 166 communities (133 shown, 33 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 122 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0e478dda`
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
- OpenAIServerProvider
- MonacoEditor.tsx
- quants.ts
- code-changes.test.ts
- Panel.tsx
- @fontsource-variable/inter
- @tanstack/react-query
- @vitejs/plugin-react
- snapshots.ts
- LmStudioProvider
- math-smoke.mjs
- stores/math.ts
- charts.ts
- math/actions.ts
- MathPage.tsx
- Sketch.tsx
- agent-core.test.ts
- Renderer
- zustand

## God Nodes (most connected - your core abstractions)
1. `IpcInvokeMap` - 82 edges
2. `run()` - 67 edges
3. `paths()` - 66 edges
4. `errorMessage()` - 53 edges
5. `registerIpcHandlers()` - 45 edges
6. `newId()` - 45 edges
7. `ChatOrchestrator` - 38 edges
8. `get()` - 37 edges
9. `registerM4Handlers()` - 34 edges
10. `invoke()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `runShell()` --indirect_call--> `collect()`  [INFERRED]
  src/main/agent/tools/command.ts → tests/unit/stream-parsers.test.ts
- `SideChat()` --indirect_call--> `question()`  [INFERRED]
  src/renderer/src/components/code/SideChat.tsx → tests/unit/side-chat.test.ts
- `QuizView()` --indirect_call--> `question()`  [INFERRED]
  src/renderer/src/components/math/Blocks.tsx → tests/unit/side-chat.test.ts
- `answerOf()` --calls--> `calculate()`  [EXTRACTED]
  tests/unit/math.test.ts → src/shared/math/calc.ts
- `extractDocumentText()` --references--> `jszip`  [EXTRACTED]
  src/main/agent/documents.ts → package.json

## Import Cycles
- None detected.

## Communities (166 total, 33 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.06
Nodes (44): DownloadManager, computeQuantFit(), fitCache, fitInflight, fitWaiters, hfHeaders(), hfJson(), quantFit() (+36 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.10
Nodes (20): LocalModel, buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), formatParamCount(), freePort(), Instance (+12 more)

### Community 2 - "queries.ts"
Cohesion: 0.28
Nodes (6): buildSystemPrompt(), chatToolGuidance(), cleanTitle(), fallbackTitle(), supportsArtifactInstructions(), SystemPromptInput

### Community 3 - "ChatOrchestrator"
Cohesion: 0.12
Nodes (3): ChatOrchestrator, prepareDesignSession(), prepareMathSession()

### Community 4 - "engine.ts"
Cohesion: 0.12
Nodes (21): active, buildSideChatPrompt(), clipTranscript(), fitSideMessages(), FRIENDLY_ERRORS, log, parseSideChatRequest(), PENDING_RESULTS (+13 more)

### Community 5 - "run"
Cohesion: 0.25
Nodes (13): copyDesign(), createDesign(), DesignConflictError, designForConversation(), DesignRow, getDesign(), listDesigns(), saveDesign() (+5 more)

### Community 6 - "scripts"
Cohesion: 0.08
Nodes (25): croner, docx, exceljs, extract-zip, @huggingface/gguf, jszip, marked, @modelcontextprotocol/sdk (+17 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.14
Nodes (18): artifactTypeFor(), deriveArtifactTitle(), LANGUAGE_TYPES, parseArtifacts(), ParsedArtifact, parseInfoString(), slugify(), TYPE_TITLES (+10 more)

### Community 8 - "openai-compat.ts"
Cohesion: 0.19
Nodes (20): LmsDownloadStatus, LmsModel, authHeaders(), baseEntry(), ChatChunk, fetchEmbeddings(), fetchOpenAIModels(), guessCapabilitiesFromName() (+12 more)

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
Nodes (49): attachCloseToTray(), backgroundActive(), createMain(), getMain(), iconPath(), installBackground(), isQuitting(), log (+41 more)

### Community 13 - "DownloadManager"
Cohesion: 0.05
Nodes (44): addArtboard(), addElement(), AlignEdge, alignSelection(), copySelection(), deleteArtboard(), deleteSelection(), duplicateSelection() (+36 more)

### Community 14 - "handlers.ts"
Cohesion: 0.08
Nodes (35): cleanupOrphanAttachments(), ConversationPatch, ConversationRow, kindOf(), listConversations(), MessagePatch, MessageRow, SqliteChatStore (+27 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.05
Nodes (74): Window, AppCommand, AppInfo, BackgroundStatus, CellarBridge, EVENT_CHANNELS, EventChannel, eventChannelFlags (+66 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.11
Nodes (26): ConversationKind, TaskStartOptions, TaskStatus, Artifact, AttachmentKind, AttachmentRef, Conversation, ConversationFilter (+18 more)

### Community 17 - "Messages.tsx"
Cohesion: 0.09
Nodes (17): ARTIFACT_ICONS, ARTIFACT_LABELS, ArtifactCard(), AttachmentImage(), attachmentImageUrl(), Lightbox(), MessageAttachments(), InlineImage() (+9 more)

### Community 18 - "fetchWithTimeout"
Cohesion: 0.21
Nodes (7): fetchWithTimeout(), OllamaProvider, readErrorBody(), DuckDuckGoImage, fetchVqd(), ImageResult, searchImage()

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
Cohesion: 0.12
Nodes (26): pdfAvailable(), AgentPromptInput, buildAgentPrompt(), compactionRequest(), log, stableJson(), TaskRunInput, agentPowerShell() (+18 more)

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.09
Nodes (8): ACCENTS, LANGUAGES, SECTIONS, SettingsPage(), SHORTCUTS, VARIANT_LABEL, Voice(), WHISPER_BUILDS

### Community 25 - "provider-configs.ts"
Cohesion: 0.13
Nodes (23): connectorTool(), connectorToolName(), connectorTools(), diagnosticsTool, forgetTool, objectSchema(), readChatTool, readSkillFileTool (+15 more)

### Community 26 - "hub.ts"
Cohesion: 0.08
Nodes (27): DownloadFileState, DownloadJob, DownloadStatus, DownloadTarget, HfFile, HfModelSummary, HfRepoDetail, HfSearchQuery (+19 more)

### Community 27 - ".doScan"
Cohesion: 0.18
Nodes (12): describeLocation(), FoundGroup, inspectLocalGguf(), localModelId(), LocalModelIndex, log, pickMmproj(), quantLabelFromName() (+4 more)

### Community 28 - "LmStudioProvider"
Cohesion: 0.11
Nodes (20): ChartRenderOptions, clamp(), LAYOUT_NAMES, layoutContent, layoutElements(), layoutName, LAYOUTS, Raw (+12 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.15
Nodes (26): codeSession(), BASE_HEADERS, buildPreviewUrl(), CONTENT_TYPES, fileResponse(), installPreview(), isLocalhostUrl(), LOCALHOST_PATTERNS (+18 more)

### Community 30 - "OpenAIServerProvider"
Cohesion: 0.18
Nodes (13): newToolCallId(), asObject(), CallSplitPart, describeType(), escapeControlCharsInStrings(), ParsedTextCall, parseLooseJson(), parseTextToolCall() (+5 more)

### Community 31 - "MemoryChatStore"
Cohesion: 0.06
Nodes (88): hideQuickEntry(), openConversation(), quickEntryShortcutActive(), builtInCommands(), changed(), commandSlug(), customCommands(), deleteCommand() (+80 more)

### Community 32 - "ProviderRegistry"
Cohesion: 0.14
Nodes (5): RoundOptions, FitResult, SideChatPrompt, Provider, ProviderMessage

### Community 33 - "Sidebar.tsx"
Cohesion: 0.26
Nodes (11): DARK_ANSI, LIGHT_ANSI, message(), openLink(), previewUrl(), readTheme(), SessionTerminals(), TerminalView() (+3 more)

### Community 34 - "Provider"
Cohesion: 0.10
Nodes (32): installPdfRenderer(), installTaskNotifications(), log, setPdfRenderer(), setSvgRasterizer(), attachmentFromBytes(), attachmentRefs(), attachmentsFromPaths() (+24 more)

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
Cohesion: 0.09
Nodes (40): chat, removeWorktree(), codeMode, id, log, registerCodeHandlers(), registerPreviewHandlers(), terminals (+32 more)

### Community 40 - "build-artifact-runtime.mjs"
Cohesion: 0.25
Nodes (6): entry, outDir, output, root, tailwindOutput, tailwindSource

### Community 41 - ".update"
Cohesion: 0.06
Nodes (29): ConnectorManager, defaultPolicy(), Live, log, renderToolResult(), signatureOf(), toolPolicy(), withTimeout() (+21 more)

### Community 42 - "window.ts"
Cohesion: 0.17
Nodes (29): checkJavaScript(), checkJsonText(), checkPowerShell(), checkPyright(), checkPython(), checkRuff(), checkTypeScriptSyntax(), findPython() (+21 more)

### Community 43 - "AppShell.tsx"
Cohesion: 0.13
Nodes (28): invoke(), keys, useAppInfo(), useArtifacts(), useBackground(), useCommands(), useConnectors(), useConversation() (+20 more)

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
Cohesion: 0.17
Nodes (13): answerMatches(), answerQuestion(), resetQuiz(), revealQuestion(), updateBlock(), DerivationView(), EDITABLE, FormulaView() (+5 more)

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
Cohesion: 0.16
Nodes (22): normalizeChart(), canonicalFields(), clamp(), color(), FORMATS, gradient(), KEY_ALIASES, length() (+14 more)

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

### Community 64 - "electron"
Cohesion: 0.10
Nodes (48): approxRational(), Exact, exactAdd(), exactDiv(), exactFromNumber(), exactInt(), exactInverse(), exactIsZero() (+40 more)

### Community 66 - "electron-vite"
Cohesion: 0.14
Nodes (11): ChatRequest, cleanup, entry, fake, FakeProvider, finished(), makeRepo(), Provider (+3 more)

### Community 67 - "@fontsource-variable/inter"
Cohesion: 0.07
Nodes (24): ANSI, ESC, killTree(), runCommand, runShell(), ShellOptions, ShellResult, AgentTool (+16 more)

### Community 68 - "@fontsource-variable/source-serif-4"
Cohesion: 0.16
Nodes (21): baseBlob(), byPath(), commitAll(), deleteNewFile(), existsInBase(), gitChangeSet(), gitDiscardFile(), gitFailure() (+13 more)

### Community 70 - "@playwright/test"
Cohesion: 0.11
Nodes (41): blockType(), FIGURE_KINDS, figureKindOf(), isObject(), LIMITS, Loose, measureList(), nextBlockId() (+33 more)

### Community 71 - "radix-ui"
Cohesion: 0.13
Nodes (20): ChecksumError, downloadFile(), DownloadOptions, fileSize(), hashExisting(), cleanTranscript(), CLI_NAMES, findCli() (+12 more)

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

### Community 76 - "@streamdown/math"
Cohesion: 0.12
Nodes (13): AppShell(), CodeSidebar(), SessionFilter, DownloadsButton(), TARGET_LABEL, SearchPalette(), Icon, NavItem() (+5 more)

### Community 77 - "@streamdown/mermaid"
Cohesion: 0.13
Nodes (19): ChartElement, ChartKind, ChartSeries, ChartSpec, ColorToken, DesignElementType, DesignExportFormat, DesignFormat (+11 more)

### Community 81 - "@tailwindcss/browser"
Cohesion: 0.13
Nodes (19): exists(), inside(), Workspace, changed(), contentSchema, conversationIdSchema, listDirectory(), writeWorkspaceFile() (+11 more)

### Community 82 - "@tanstack/react-query"
Cohesion: 0.13
Nodes (15): AgentPart, ChatStreamEvent, Message, SideChatEvent, SideChatMessage, ask(), ChatRequest, FakeProvider (+7 more)

### Community 83 - "@tanstack/react-router"
Cohesion: 0.13
Nodes (18): attachmentImage(), ARTIFACT_CSP, escapeScript(), handleArtifactProtocol(), handleAttachmentProtocol(), registerArtifactScheme(), renderArtifactDocument(), RUNTIME_FILES (+10 more)

### Community 86 - "typescript"
Cohesion: 0.19
Nodes (17): angleMode, paper, registerMathHandlers(), topic, BoardConflictError, boardForConversation(), BoardRow, copyBoard() (+9 more)

### Community 87 - "vite"
Cohesion: 0.18
Nodes (15): effectiveThinking(), thinkingLabel(), thinkingOptions(), useAppCommands(), useSelectedModel(), useThemeSync(), cleanIpcError(), onEvent() (+7 more)

### Community 88 - "@vitejs/plugin-react"
Cohesion: 0.24
Nodes (15): backgroundAt(), checkArtboard(), intersects(), short(), estimateLines(), estimateTextHeight(), fitFontSize(), glyphWidth() (+7 more)

### Community 89 - "vitest"
Cohesion: 0.23
Nodes (14): buildTaskHistory(), groupRounds(), HistoryOptions, historyTokens(), latestCompaction(), resultForModel(), Round, roundsToMessages() (+6 more)

### Community 90 - "zustand"
Cohesion: 0.19
Nodes (13): DesignCard(), DesignEditorPage(), DesignHeader(), DesignHomePage(), errorText(), exportDesign(), FORMAT_ICONS, IDEAS (+5 more)

### Community 94 - "agent-core.test.ts"
Cohesion: 0.21
Nodes (20): absoluteUrl(), decodeEntities(), htmlToText(), NAMED_ENTITIES, PageText, parseBraveHtml(), parseDuckDuckGoHtml(), parseSearxngJson() (+12 more)

### Community 95 - "Cellar roadmap"
Cohesion: 0.06
Nodes (30): Cellar roadmap, Known gaps and follow-ups from M1, Known gaps and follow-ups from M2, Known gaps and follow-ups from M3, Known gaps and follow-ups from M4, Known gaps and follow-ups from M5, Known gaps and follow-ups from M6, M1 Foundation — delivered (+22 more)

### Community 96 - "services/models.ts"
Cohesion: 0.25
Nodes (14): defaultPreset(), getPreset(), resetPreset(), savePreset(), deleteModel(), listModels(), loadedModels(), loadModel() (+6 more)

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
Cohesion: 0.19
Nodes (6): Composer(), ComposerProps, ModelPicker(), ToolsDialog(), ToolsMenu(), isChatCapable()

### Community 103 - "util.ts"
Cohesion: 0.40
Nodes (4): queryClient, quick, QuickEntry(), router

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
Cohesion: 0.13
Nodes (18): CHART_KINDS, ARTBOARD_PRESETS, clampSize(), COLOR_TOKENS, customizeTheme(), FontCategory, FORMAT_DEFAULTS, hex6() (+10 more)

### Community 111 - "ToolContext"
Cohesion: 0.09
Nodes (18): cell, createDocx, createPdf, createPptx, DOCUMENT_EXTENSIONS, documentOptions(), documentPath(), documentTarget() (+10 more)

### Community 112 - "🎨 AI Design Engine: Concept & Specification Document"
Cohesion: 0.29
Nodes (6): 🚀 1. Overview: Bridging the Gap Between Text and Visual Design, 🧱 2. The Limitations of Current Text-Based AI, ✨ 3. The Vision: Desired Capabilities (The Next-Generation AI), 🛠️ 4. Technical Feature Checklist (The Design Specification), 🧠 5. AI Self-Assessment and Self-Identified Issues, 🎨 AI Design Engine: Concept & Specification Document

### Community 113 - "CodeModeMenu.tsx"
Cohesion: 0.52
Nodes (6): CODE_MODE_OPTIONS, codeModeKey(), CodeModeMenu(), CodeModeValue, nextCodeMode(), Option

### Community 114 - "code-changes.test.ts"
Cohesion: 0.13
Nodes (20): errorMessage(), backendsFromFiles(), bestRuntime(), exec, findServerDir(), idForDir(), log, parseDevicesOutput() (+12 more)

### Community 115 - "stores/code.ts"
Cohesion: 0.33
Nodes (5): CodePane, CodeUiState, EditorRequest, PreviewRequest, useCodeUi

### Community 116 - "monaco-editor"
Cohesion: 0.20
Nodes (6): project, lastUserText(), MockRequest, MockServer, sleep(), startMockServer()

### Community 118 - "@tailwindcss/vite"
Cohesion: 0.60
Nodes (4): DictationState, encodeWav(), toSpeechWav(), useDictation()

### Community 120 - "@xterm/addon-fit"
Cohesion: 0.17
Nodes (12): scripts, build, build:win, dev, preview, runtime:artifacts, test, test:e2e (+4 more)

### Community 122 - "@xterm/xterm"
Cohesion: 0.17
Nodes (21): angleArc(), buildFigure(), BuiltFigure, centroid(), completeRightTriangle(), DEFAULT_LABELS, figureLabel(), format() (+13 more)

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
Cohesion: 0.10
Nodes (14): addBlocksTool, blockSchema, calculateTool, deleteBlocksTool, drawFigureTool, figureSchema, getBoardTool, makeQuizTool (+6 more)

### Community 131 - "m4-handlers.ts"
Cohesion: 0.20
Nodes (8): DesignLayoutState, DesignTool, EditorState, selectedArtboard(), selectedElements(), Selection, useDesignEditor, useDesignLayout

### Community 132 - "tasks.ts"
Cohesion: 0.15
Nodes (12): ArtifactPanel(), fence(), IFRAME_TYPES, describeTool(), DiffLine, DOCUMENT_TOOLS, Icon, IDEAS (+4 more)

### Community 133 - "m4-smoke.mjs"
Cohesion: 0.17
Nodes (8): logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3.5:9b', embeddingId = 'nomic-embed-text:latest'], results, skip

### Community 134 - "window.ts"
Cohesion: 0.23
Nodes (6): parseNDJSON(), parseSSE(), partialSuffix(), readLines(), SplitPart, ThinkTagSplitter

### Community 135 - "ScheduledPage.tsx"
Cohesion: 0.27
Nodes (9): buildCron(), DAYS, errorText(), formatWhen(), Frequency, parseSchedule(), RunHistory(), ScheduledPage() (+1 more)

### Community 136 - ".resolve"
Cohesion: 0.13
Nodes (7): chatTaskState(), joinReasoning(), joinText(), LiveRun, TaskRunner, TaskRunnerHooks, ChatStore

### Community 138 - "code/ipc.ts"
Cohesion: 0.16
Nodes (25): branchExists(), branchSlug(), copyWorktreeIncludes(), createWorktree(), currentBranch(), findMemoryFile(), git(), gitAvailable() (+17 more)

### Community 145 - "package.json"
Cohesion: 0.22
Nodes (8): author, description, license, main, name, private, productName, version

### Community 146 - "glob.ts"
Cohesion: 0.09
Nodes (30): DOCUMENT_EXTENSIONS, escapeRegex(), globFiles(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry (+22 more)

### Community 147 - "OpenAIServerProvider"
Cohesion: 0.17
Nodes (3): StoredProviderConfig, OpenAIFlavor, OpenAIServerProvider

### Community 148 - "MonacoEditor.tsx"
Cohesion: 0.14
Nodes (23): pptxgenjs, pptxgenjs, ensureSession(), exportDesign(), ExportTarget, fileSafe(), imageUrls(), rasterizeSvg() (+15 more)

### Community 150 - "code-changes.test.ts"
Cohesion: 0.09
Nodes (21): INIT_PROMPT, ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, ReasoningPart, TaskFile, TaskSource (+13 more)

### Community 151 - "Panel.tsx"
Cohesion: 0.19
Nodes (9): addBlock(), MathText(), SvgFigure(), Calculator(), FIGURE_KINDS, InsertTab(), KEYS, TABS (+1 more)

### Community 154 - "@vitejs/plugin-react"
Cohesion: 0.34
Nodes (4): canonicalFunction(), CONSTANTS, Parser, tokenize()

### Community 155 - "snapshots.ts"
Cohesion: 0.30
Nodes (14): snapshotDiscardFile(), deleteSnapshots(), folder(), forgetSnapshot(), manifestPath(), queues, readManifest(), serial() (+6 more)

### Community 157 - "math-smoke.mjs"
Cohesion: 0.17
Nodes (9): exportDir, logs, outDir, problems, profile, project, [
  providerId = 'ollama',
  modelId = 'qwen3.5:9b',
  prompt =
    'Teach me the Pythagorean theorem: the rule, a drawing of a right triangle with legs 3 and 4, a worked example finding the hypotenuse, and one where a leg is missing and the answer is a root. Then give me 4 practice questions.',
  shot = 'math',
], quiz (+1 more)

### Community 158 - "stores/math.ts"
Cohesion: 0.18
Nodes (9): PropertiesTab(), MathChat(), EditorState, MathLayoutState, PanelTab, PEN_COLORS, selectedBlock(), useMathEditor (+1 more)

### Community 159 - "charts.ts"
Cohesion: 0.28
Nodes (12): ThemePanel(), chartSvg(), clamp(), formatValue(), niceScale(), r1(), truncate(), wrap() (+4 more)

### Community 160 - "math/actions.ts"
Cohesion: 0.54
Nodes (7): deleteBlock(), duplicateBlock(), moveBlock(), reorderBlock(), setBoardMeta(), store(), BlockShell()

### Community 161 - "MathPage.tsx"
Cohesion: 0.29
Nodes (11): BoardCard(), errorText(), exportBoard(), IDEAS, isEditableTarget(), MathBoardPage(), MathHeader(), MathHomePage() (+3 more)

### Community 162 - "Sketch.tsx"
Cohesion: 0.36
Nodes (8): addStroke(), clearSketch(), eraseStroke(), distanceTo(), pathsOf(), SketchCanvas(), SketchToolbar(), TOOLS

### Community 163 - "agent-core.test.ts"
Cohesion: 0.23
Nodes (10): argumentsObject(), OllamaChatLine, ollamaOptions(), OllamaPs, OllamaPullProgress, OllamaShow, OllamaTag, ollamaThink() (+2 more)

## Knowledge Gaps
- **723 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+718 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `errorMessage()` connect `code-changes.test.ts` to `hf-api.ts`, `Provider`, `ChatOrchestrator`, `engine.ts`, `agent-core.test.ts`, `tools/types.ts`, `ModelRef`, `.resolve`, `.update`, `radix-ui`, `orchestrator.ts`, `main/index.ts`, `handlers.ts`, `stream-parsers.ts`, `.doScan`, `plugins.ts`, `OpenAIServerProvider`, `MemoryChatStore`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `dependencies` connect `scripts` to `package.json`, `MonacoEditor.tsx`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `paths()` connect `Provider` to `ChatOrchestrator`, `.resolve`, `openai-compat.ts`, `code/ipc.ts`, `main/index.ts`, `handlers.ts`, `OpenAIServerProvider`, `MonacoEditor.tsx`, `router.tsx`, `stream-parsers.ts`, `.doScan`, `snapshots.ts`, `MemoryChatStore`, `ModelRef`, `.update`, `radix-ui`, `@tanstack/react-router`, `zustand`, `orchestrator.ts`, `code-changes.test.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `paths()` (e.g. with `Composer()` and `DesignHeader()`) actually correct?**
  _`paths()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `registerIpcHandlers()` (e.g. with `toPublicConfig()` and `.name()`) actually correct?**
  _`registerIpcHandlers()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _723 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `hf-api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06394230769230769 - nodes in this community are weakly interconnected._