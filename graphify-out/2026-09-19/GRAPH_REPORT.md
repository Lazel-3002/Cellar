# Graph Report - Cellar  (2026-09-19)

## Corpus Check
- 316 files · ~344,575 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3870 nodes · 9423 edges · 185 communities (152 shown, 33 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 191 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `30a0249a`
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
- artifact-protocol.ts
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
- design/store.ts
- 🎨 AI Design Engine: Concept & Specification Document
- CodeModeMenu.tsx
- code-changes.test.ts
- stores/code.ts
- monaco-editor
- sonner
- TerminalPane.tsx
- @types/react-dom
- @xterm/addon-fit
- @xterm/addon-web-links
- @xterm/xterm
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
- design/export.ts
- streams.ts
- dictation.ts
- ArtifactPanel
- mcp-server.mjs
- electron-vite
- package.json
- code-session.test.ts
- images.ts
- sessions.ts
- quants.ts
- terminal.test.ts
- AppShell.tsx
- snapshots.ts
- @tanstack/react-query
- @vitejs/plugin-react
- snapshots.ts
- LmStudioProvider
- math-smoke.mjs
- croner
- charts.ts
- math/actions.ts
- MathPage.tsx
- downloadFile
- agent-core.test.ts
- @vitejs/plugin-react
- browser-sessions.test.ts
- monaco-editor
- network.test.ts
- electron-vite
- @tanstack/react-router
- dictation.ts
- lucide-react
- lucide-react
- @fontsource-variable/source-serif-4
- radix-ui
- @playwright/test
- streamdown
- tailwind-merge
- @tanstack/react-query
- @streamdown/mermaid
- sucrase
- vscode-languageserver-protocol
- @xterm/addon-fit
- @xterm/addon-web-links
- @fontsource-variable/inter

## God Nodes (most connected - your core abstractions)
1. `IpcInvokeMap` - 103 edges
2. `run()` - 85 edges
3. `errorMessage()` - 77 edges
4. `paths()` - 76 edges
5. `newId()` - 60 edges
6. `registerIpcHandlers()` - 53 edges
7. `get()` - 48 edges
8. `invoke()` - 47 edges
9. `BrowserService` - 42 edges
10. `registerM4Handlers()` - 41 edges

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
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/call.ts -> src/main/modules/registry.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/reminder.ts -> src/main/scheduled/scheduler.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`

## Communities (185 total, 33 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.19
Nodes (23): changed(), countEntries(), describe(), enabledPlugins(), exec, expandPluginVars(), findPluginRoots(), installPlugin() (+15 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.10
Nodes (20): LocalModel, buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), formatParamCount(), freePort(), Instance (+12 more)

### Community 2 - "queries.ts"
Cohesion: 0.16
Nodes (22): angleArc(), buildFigure(), BuiltFigure, centroid(), completeRightTriangle(), DEFAULT_LABELS, figureLabel(), format() (+14 more)

### Community 3 - "ChatOrchestrator"
Cohesion: 0.08
Nodes (7): chatTaskState(), joinText(), LiveRun, TaskRunner, ChatOrchestrator, ChatStore, discardIncognitoArtifacts()

### Community 4 - "engine.ts"
Cohesion: 0.03
Nodes (94): disposeBackgroundCommands(), boundsSchema, registerBrowserHandlers(), tabId, url, loginStatus(), attachmentFromBytes(), attachmentRefs() (+86 more)

### Community 5 - "run"
Cohesion: 0.06
Nodes (52): pptxgenjs, pptxgenjs, attachmentImage(), artboardPreview(), ensureSession(), exportDesign(), ExportTarget, fileSafe() (+44 more)

### Community 6 - "scripts"
Cohesion: 0.06
Nodes (35): croner, docx, electron-updater, exceljs, extract-zip, @huggingface/gguf, jszip, marked (+27 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.09
Nodes (30): fitToContext(), messageTokens(), toTurns(), truncateMiddle(), buildSystemPrompt(), chatToolGuidance(), cleanTitle(), fallbackTitle() (+22 more)

### Community 8 - "openai-compat.ts"
Cohesion: 0.18
Nodes (21): LmsDownloadStatus, LmsModel, authHeaders(), baseEntry(), ChatChunk, fetchEmbeddings(), fetchOpenAIModels(), guessCapabilitiesFromName() (+13 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (29): electron.vite.config.ts, electron-vite/node, node, playwright.config.ts, scripts/**/*.ts, src/main/**/*, src/preload/**/*, tests/**/* (+21 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, src/artifact-runtime/**/*, src/preload/api.d.ts, src/renderer/src/**/*, src/renderer/src/**/*.tsx, vite/client, compilerOptions (+19 more)

### Community 11 - "orchestrator.ts"
Cohesion: 0.20
Nodes (19): defaultContext(), Node, parseEquation(), variablesOf(), buildPlot(), BuiltPlot, niceStep(), PLOT_COLORS (+11 more)

### Community 12 - "main/index.ts"
Cohesion: 0.10
Nodes (23): ANSI, BackgroundCommand, BackgroundCommandStatus, commands, ESC, evictOldEnded(), killTree(), readBackgroundCommand() (+15 more)

### Community 13 - "DownloadManager"
Cohesion: 0.10
Nodes (10): ChartSection(), chartToCsv(), csvToChart(), ElementPanel(), ImportFontButton(), Layers(), patch(), TextSection() (+2 more)

### Community 14 - "handlers.ts"
Cohesion: 0.15
Nodes (25): ExtractedTopic, initAutoMemory(), log, nothing(), parseExtraction(), pending, pickBackgroundModel(), runAutoMemory() (+17 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.04
Nodes (94): AppCommand, AppInfo, BackgroundStatus, EVENT_CHANNELS, EventChannel, eventChannelFlags, Handler, INVOKE_CHANNELS (+86 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.11
Nodes (26): AgentPart, TaskStartOptions, Artifact, ArtifactSummary, AttachmentKind, AttachmentRef, ChatStreamEvent, ConversationSettings (+18 more)

### Community 17 - "Messages.tsx"
Cohesion: 0.07
Nodes (20): ARTIFACT_ICONS, ARTIFACT_LABELS, ArtifactCard(), AttachmentImage(), attachmentImageUrl(), Lightbox(), MessageAttachments(), InlineImage() (+12 more)

### Community 18 - "fetchWithTimeout"
Cohesion: 0.16
Nodes (11): argumentsObject(), OllamaChatLine, ollamaOptions(), OllamaProvider, OllamaPs, OllamaPullProgress, OllamaShow, OllamaTag (+3 more)

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
Cohesion: 0.13
Nodes (18): expandToGroups(), imagesFromFiles(), isWholeGroup(), AddArtboardButton(), Box, boxFor(), DesignCanvas(), Drag (+10 more)

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.07
Nodes (10): ACCENTS, CHART_COLORS, dayLabel(), Heatmap(), LANGUAGES, SECTIONS, SHORTCUTS, UsageModels() (+2 more)

### Community 24 - "types/models.ts"
Cohesion: 0.11
Nodes (26): CalcOptions, CalcResult, antiderivativePolynomial(), evalPolynomial(), printPolynomial(), approxRational(), isRational(), AngleMode (+18 more)

### Community 25 - "provider-configs.ts"
Cohesion: 0.07
Nodes (24): browseBack, browseClearSession, browseClick, browseElements, browseFill, browseFindLink, browseForward, browseLoginStatus (+16 more)

### Community 26 - "hub.ts"
Cohesion: 0.08
Nodes (27): DownloadFileState, DownloadJob, DownloadStatus, DownloadTarget, HfFile, HfModelSummary, HfRepoDetail, HfSearchQuery (+19 more)

### Community 27 - ".doScan"
Cohesion: 0.07
Nodes (17): ToolContext, attachPreview(), addBlocksTool, blockSchema, calculateTool, deleteBlocksTool, drawFigureTool, figureSchema (+9 more)

### Community 28 - "LmStudioProvider"
Cohesion: 0.18
Nodes (16): effectiveThinking(), isChatCapable(), thinkingLabel(), thinkingOptions(), useAppCommands(), useBrowserReveal(), useSelectedModel(), useThemeSync() (+8 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.10
Nodes (35): exists(), inside(), PathAccessError, Workspace, listDirectory(), codeSession(), CodeSessionContext, BASE_HEADERS (+27 more)

### Community 30 - "OpenAIServerProvider"
Cohesion: 0.21
Nodes (12): newToolCallId(), asObject(), CallSplitPart, describeType(), escapeControlCharsInStrings(), ParsedTextCall, parseLooseJson(), parseTextToolCall() (+4 more)

### Community 31 - "MemoryChatStore"
Cohesion: 0.08
Nodes (67): hideQuickEntry(), openConversation(), quickEntryShortcutActive(), connectors, builtInCommands(), changed(), commandSlug(), customCommands() (+59 more)

### Community 33 - "Sidebar.tsx"
Cohesion: 0.17
Nodes (19): clearDomainSession(), cookieUrl(), DIR, ensureDir(), fileFor(), loadAllSessions(), log, saveDomainSession() (+11 more)

### Community 34 - "Provider"
Cohesion: 0.18
Nodes (28): abortMerge(), baseBlob(), byPath(), commitAll(), conflictedFiles(), continueMerge(), deleteNewFile(), existsInBase() (+20 more)

### Community 35 - "form.tsx"
Cohesion: 0.20
Nodes (3): Input, SelectOption, Textarea

### Community 36 - "devDependencies"
Cohesion: 0.05
Nodes (41): 0.1.0 — 2026-09-13, 2.0.0 — 2026-09-14, 3.0.0 — 2026-09-14, 4.0.0 — 2026-09-15, 5.0.0 — 2026-09-15, 6.0.0 — 2026-09-16, 7.0.0 — 2026-09-16, 7.0.1 — 2026-09-16 (+33 more)

### Community 37 - "chat-smoke.mjs"
Cohesion: 0.22
Nodes (8): elapsed, logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3:0.6b', prompt = 'Say hello in five words.', shot = 'chat'], started

### Community 39 - "ModelRef"
Cohesion: 0.14
Nodes (5): callbackPath(), CellarOAuthProvider, ensureServer(), loadOAuthState(), waitForCallback()

### Community 40 - "build-artifact-runtime.mjs"
Cohesion: 0.25
Nodes (6): entry, outDir, output, root, tailwindOutput, tailwindSource

### Community 41 - ".update"
Cohesion: 0.12
Nodes (7): ConnectorManager, Live, signatureOf(), withTimeout(), authUrlFor(), closeOAuthServer(), listStoredConnectors()

### Community 42 - "window.ts"
Cohesion: 0.16
Nodes (17): NormalizeResult, GeneratedQuiz, BlockBase, DerivationBlock, FigureBlock, FormulaBlock, MathAngleMode, MathBlock (+9 more)

### Community 43 - "AppShell.tsx"
Cohesion: 0.12
Nodes (32): invoke(), keys, useAppInfo(), useArtifacts(), useBackground(), useCheckForUpdates(), useCommands(), useConnectors() (+24 more)

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
Cohesion: 0.05
Nodes (40): coworkGuidance, parseParamsBillions(), ToolPart, StreamEvent, ModelEntry, BUILTIN_PROVIDER_IDS, ProviderConfig, ProviderConfigInput (+32 more)

### Community 51 - "verify-packaged.mjs"
Cohesion: 0.33
Nodes (4): exe, exportDir, local, project

### Community 52 - "DiscoverPage.tsx"
Cohesion: 0.18
Nodes (13): ancestors(), baseName(), DirState, errorText(), FilesPane(), FilesState, handledRequests, HEAVY_DIRS (+5 more)

### Community 53 - "ModelsPage.tsx"
Cohesion: 0.11
Nodes (32): canonicalFields(), clamp(), color(), FORMATS, gradient(), imageCrop(), imageFilters(), KEY_ALIASES (+24 more)

### Community 55 - "ipc-run.mjs"
Cohesion: 0.50
Nodes (3): calls, profile, project

### Community 56 - "preload/index.ts"
Cohesion: 0.50
Nodes (3): bridge, eventsAllowed, invokeAllowed

### Community 57 - "ArtifactPanel.tsx"
Cohesion: 0.17
Nodes (21): bodySchema, changed(), contentSchema, conversationIdSchema, writeRepoFile(), gitBase(), messageSchema, pathSchema (+13 more)

### Community 58 - "ChatPage.tsx"
Cohesion: 0.10
Nodes (39): blockElements(), cellValue(), chartFromCode(), chartTable(), createPptx(), createXlsx(), DOCUMENT_EXTENSIONS, DocumentOptions (+31 more)

### Community 63 - "cmdk"
Cohesion: 0.21
Nodes (26): escapeXml(), findArtboard(), artboardHtml(), artboardStyle(), artboardSvg(), boxStyle(), cssText(), designHtml() (+18 more)

### Community 64 - "electron"
Cohesion: 0.16
Nodes (36): asRational(), Exact, exactAdd(), exactDiv(), exactFromNumber(), exactInt(), exactInverse(), exactIsZero() (+28 more)

### Community 65 - "electron-builder"
Cohesion: 0.40
Nodes (3): defaultPolicy(), toolPolicy(), hasOAuthTokens()

### Community 66 - "electron-vite"
Cohesion: 0.07
Nodes (39): pdfAvailable(), AgentPromptInput, buildAgentPrompt(), compactionRequest(), autoApproveAction(), hostOf(), joinReasoning(), log (+31 more)

### Community 67 - "@fontsource-variable/inter"
Cohesion: 0.16
Nodes (15): conversationIdSchema, CreateTerminalOptions, dataSchema, envValue(), findOnPath(), idSchema, log, lstatExists() (+7 more)

### Community 68 - "@fontsource-variable/source-serif-4"
Cohesion: 0.18
Nodes (17): branchExists(), branchSlug(), createWorktree(), gitAvailable(), GitError, GitOptions, GitResult, headCommit() (+9 more)

### Community 70 - "@playwright/test"
Cohesion: 0.20
Nodes (24): blockType(), FIGURE_KINDS, figureKindOf(), isObject(), LIMITS, Loose, measureList(), nextBlockId() (+16 more)

### Community 71 - "radix-ui"
Cohesion: 0.16
Nodes (10): encodeWav(), findSilenceBoundary(), SilenceOptions, GpuInfo, HardwareInfo, RuntimeDevice, RuntimeInfo, RuntimeInstallProgress (+2 more)

### Community 72 - "react"
Cohesion: 0.12
Nodes (10): ChatRequest, currentEntry, fake, FakeProvider, finished(), message(), Provider, Script (+2 more)

### Community 73 - "react-dom"
Cohesion: 0.30
Nodes (16): calculate(), evaluationSteps(), measureOf(), prettyMeasure(), formatExact(), formatDecimal(), literal(), normalizeExpression() (+8 more)

### Community 74 - "streamdown"
Cohesion: 0.15
Nodes (22): Atom, escapeHtml(), mathToPlain(), prepare(), renderMath(), superscript(), SUPERSCRIPT_DIGITS, SYMBOLS (+14 more)

### Community 75 - "@streamdown/code"
Cohesion: 0.12
Nodes (25): area(), arithmetic(), Draft, fractions(), fromSolution(), generateQuiz(), GENERATORS, hashSeed() (+17 more)

### Community 76 - "@streamdown/math"
Cohesion: 0.21
Nodes (8): SessionFilter, DownloadsButton(), TARGET_LABEL, Icon, NavItem(), ProfileMenuContent(), RecentFilter, RowMarker()

### Community 77 - "@streamdown/mermaid"
Cohesion: 0.52
Nodes (6): useIpcSync(), speak(), speakReply(), speakWithSystemVoice(), stopSpeaking(), stripForSpeech()

### Community 78 - "sucrase"
Cohesion: 0.06
Nodes (50): computeQuantFit(), fitCache, fitInflight, fitWaiters, hfHeaders(), hfJson(), quantFit(), readme() (+42 more)

### Community 79 - "tailwind-merge"
Cohesion: 0.32
Nodes (13): snapshotDiscardFile(), folder(), forgetSnapshot(), manifestPath(), queues, readManifest(), serial(), snapshotBeforeChange() (+5 more)

### Community 80 - "tailwindcss"
Cohesion: 0.24
Nodes (7): clamp(), SettingsService, uniqueStrings(), niceStep(), Rulers(), STEPS, useSpeechVoices()

### Community 81 - "@tailwindcss/browser"
Cohesion: 0.12
Nodes (20): active, buildSideChatPrompt(), clipTranscript(), fitSideMessages(), FRIENDLY_ERRORS, log, parseSideChatRequest(), PENDING_RESULTS (+12 more)

### Community 82 - "@tanstack/react-query"
Cohesion: 0.17
Nodes (9): SideChatEvent, SideChatMessage, ask(), ChatRequest, FakeProvider, Provider, question(), Script (+1 more)

### Community 83 - "@tanstack/react-router"
Cohesion: 0.22
Nodes (20): BOM, byPath(), countable(), readWorkspaceFile(), snapshotChangeSet(), snapshotFileDiff(), WriteOptions, writeWorkspaceFile() (+12 more)

### Community 85 - "@types/react"
Cohesion: 0.16
Nodes (16): forgetOAuth(), lastAuthUrl, log, pending, clearOAuthState(), OAuthState, Row, saveClientInformation() (+8 more)

### Community 88 - "@vitejs/plugin-react"
Cohesion: 0.10
Nodes (32): backgroundAt(), checkArtboard(), intersects(), short(), clamp(), LAYOUT_NAMES, layoutContent, layoutElements() (+24 more)

### Community 89 - "vitest"
Cohesion: 0.22
Nodes (11): errorText(), MergeConflictsDialog(), closeLsp(), CodeEditor(), CodeEditorProps, DiffEditor(), DiffEditorProps, Doc (+3 more)

### Community 90 - "zustand"
Cohesion: 0.19
Nodes (13): DesignCard(), DesignEditorPage(), DesignHeader(), DesignHomePage(), errorText(), exportDesign(), FORMAT_ICONS, IDEAS (+5 more)

### Community 94 - "agent-core.test.ts"
Cohesion: 0.07
Nodes (42): absoluteUrl(), htmlToText(), NAMED_ENTITIES, PageText, parseBraveHtml(), parseDuckDuckGoHtml(), parseSearxngJson(), SearchResult (+34 more)

### Community 95 - "Cellar roadmap"
Cohesion: 0.04
Nodes (47): 3.1 Built-in Chromium browser (`src/main/browser/`), 3.2 `call(module, task)` (`src/main/modules/`), 3.3 Self-scheduling (`create_reminder`), 3.4 Voice: streaming transcription and spoken replies, Cellar roadmap, Following up with one model (v7.7.0), Known gaps and follow-ups from M1, Known gaps and follow-ups from M2 (+39 more)

### Community 96 - "services/models.ts"
Cohesion: 0.40
Nodes (4): queryClient, quick, QuickEntry(), router

### Community 97 - "cowork-smoke.mjs"
Cohesion: 0.13
Nodes (13): approvals, chips, elapsed, files, folder, logs, outDir, problems (+5 more)

### Community 98 - "tools/types.ts"
Cohesion: 0.11
Nodes (23): DAYS, describeCron(), nextFire(), pad(), parseCron(), previewCron(), configure(), escapeXml() (+15 more)

### Community 99 - "agent.ts"
Cohesion: 0.13
Nodes (15): AppSettings, AppSettingsPatch, ChatFont, TerminalShell, ThemePreference, WebSearchProvider, PiperVoiceInfo, TranscriptionResult (+7 more)

### Community 100 - "history.ts"
Cohesion: 0.14
Nodes (12): address, approvals, elapsed, logs, outDir, problems, profile, project (+4 more)

### Community 101 - "Workspace"
Cohesion: 0.08
Nodes (34): callTool, moduleId, normalizeCallArgs(), connectorTool(), connectorToolName(), connectorTools(), diagnosticsTool, forgetTool (+26 more)

### Community 102 - "orchestrator.ts"
Cohesion: 0.19
Nodes (16): buildTaskHistory(), callImages(), groupRounds(), HistoryOptions, historyTokens(), latestCompaction(), resultForModel(), Round (+8 more)

### Community 103 - "util.ts"
Cohesion: 0.18
Nodes (20): addArtboard(), addElement(), AlignEdge, alignSelection(), copySelection(), deleteArtboard(), deleteSelection(), duplicateSelection() (+12 more)

### Community 104 - "client.ts"
Cohesion: 0.20
Nodes (11): CodeHomePage(), CodeSessionPage(), errorText(), folderName(), IDEAS, PANES, PlanReady(), RepoPicker() (+3 more)

### Community 105 - "TaskPage.tsx"
Cohesion: 0.40
Nodes (4): errorText(), PlanReady(), STATUS, TaskPage()

### Community 106 - "ToolStep.tsx"
Cohesion: 0.09
Nodes (23): AgentParts(), Block, toBlocks(), ChangeDiff(), ChangesSection(), errorText(), run(), searchLabel() (+15 more)

### Community 107 - "TaskSidePanel.tsx"
Cohesion: 0.05
Nodes (59): escapeRegex(), globFiles(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry, WalkOptions (+51 more)

### Community 108 - "monaco.ts"
Cohesion: 0.26
Nodes (9): alpha(), applyTheme(), cssColor(), EXTENSION_LANGUAGES, FILENAME_LANGUAGES, load(), loadMonaco(), registerJson() (+1 more)

### Community 109 - "SideChat.tsx"
Cohesion: 0.09
Nodes (12): BrowserService, getWindow(), normalizeUrl(), EMPTY, historyOf(), LiveReply, newRequestId(), requestMessages() (+4 more)

### Community 110 - "downloadFile"
Cohesion: 0.13
Nodes (18): ChartElement, ChartKind, ChartSeries, DesignElementType, DesignExportFormat, DesignFormat, DesignTransition, ElementBase (+10 more)

### Community 111 - "design/store.ts"
Cohesion: 0.08
Nodes (51): log, deleteStoredConnector(), ensureOverride(), pluginOverrides(), record(), Row, saveStoredConnector(), sealRecord() (+43 more)

### Community 112 - "🎨 AI Design Engine: Concept & Specification Document"
Cohesion: 0.29
Nodes (6): 🚀 1. Overview: Bridging the Gap Between Text and Visual Design, 🧱 2. The Limitations of Current Text-Based AI, ✨ 3. The Vision: Desired Capabilities (The Next-Generation AI), 🛠️ 4. Technical Feature Checklist (The Design Specification), 🧠 5. AI Self-Assessment and Self-Identified Issues, 🎨 AI Design Engine: Concept & Specification Document

### Community 113 - "CodeModeMenu.tsx"
Cohesion: 0.52
Nodes (6): CODE_MODE_OPTIONS, codeModeKey(), CodeModeMenu(), CodeModeValue, nextCodeMode(), Option

### Community 114 - "code-changes.test.ts"
Cohesion: 0.06
Nodes (35): cmdk, electron, electron-builder, electron-vite, monaco-editor, devDependencies, cmdk, electron (+27 more)

### Community 115 - "stores/code.ts"
Cohesion: 0.33
Nodes (5): CodePane, CodeUiState, EditorRequest, PreviewRequest, useCodeUi

### Community 116 - "monaco-editor"
Cohesion: 0.23
Nodes (5): ModuleId, asString(), Job, ModuleRegistry, optString()

### Community 118 - "TerminalPane.tsx"
Cohesion: 0.18
Nodes (12): describeLocation(), FoundGroup, inspectLocalGguf(), localModelId(), LocalModelIndex, log, pickMmproj(), quantLabelFromName() (+4 more)

### Community 119 - "@types/react-dom"
Cohesion: 0.25
Nodes (4): session(), check(), registerTerminalHandlers(), TerminalManager

### Community 120 - "@xterm/addon-fit"
Cohesion: 0.17
Nodes (12): scripts, build, build:win, dev, preview, runtime:artifacts, test, test:e2e (+4 more)

### Community 121 - "@xterm/addon-web-links"
Cohesion: 0.21
Nodes (11): displayAddress(), externalLink(), handledRequests, isPdf(), Preview(), previewPath(), PreviewState, run() (+3 more)

### Community 125 - "errorMessage"
Cohesion: 0.18
Nodes (8): exportDir, formatLabels, logs, outDir, problems, profile, project, [
  providerId = 'ollama',
  modelId = 'qwen3.5:9b',
  prompt = 'Create a 5-slide pitch deck for "Bean Club", a neighborhood coffee subscription: a cover, the problem, how it works, growth in members (Jan 120, Feb 180, Mar 260, Apr 410) as a chart, and a closing slide.',
  shot = 'design',
]

### Community 126 - "CustomizePage.tsx"
Cohesion: 0.14
Nodes (21): attempt(), CATEGORY_LABEL, CATEGORY_ORDER, CommandDialog(), CommandsSection(), ConnectorCard(), ConnectorDialog(), ConnectorsSection() (+13 more)

### Community 127 - "LlamaCppProvider"
Cohesion: 0.19
Nodes (11): PlaygroundState, Round, RoundCell, settled(), Side, SideSetup, usePlayground, isLive() (+3 more)

### Community 128 - "memory.ts"
Cohesion: 0.18
Nodes (22): adaptiveSimpson(), add(), asPolynomial(), bareTermOf(), CalculusError, call(), collectPolynomialTerms(), definiteIntegral() (+14 more)

### Community 129 - "commands.ts"
Cohesion: 0.10
Nodes (19): DARK_ANSI, LIGHT_ANSI, message(), openLink(), previewUrl(), readTheme(), SessionTerminals(), TerminalView() (+11 more)

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
Cohesion: 0.21
Nodes (7): parseOllamaChatStream(), parseNDJSON(), parseSSE(), partialSuffix(), readLines(), SplitPart, ThinkTagSplitter

### Community 135 - "ScheduledPage.tsx"
Cohesion: 0.27
Nodes (9): buildCron(), DAYS, errorText(), formatWhen(), Frequency, parseSchedule(), RunHistory(), ScheduledPage() (+1 more)

### Community 136 - ".resolve"
Cohesion: 0.05
Nodes (62): installPdfRenderer(), installTaskNotifications(), log, setGradientRasterizer(), setPdfRenderer(), setSvgRasterizer(), attachCloseToTray(), backgroundActive() (+54 more)

### Community 137 - "quants.ts"
Cohesion: 0.15
Nodes (10): ArtboardThumbnail(), ArtboardView(), css(), ElementView, ElementViewProps, Present(), SLIDE_OFFSET, transitionStyle() (+2 more)

### Community 139 - "design/export.ts"
Cohesion: 0.31
Nodes (9): artifactTypeFor(), deriveArtifactTitle(), LANGUAGE_TYPES, parseArtifacts(), ParsedArtifact, parseInfoString(), slugify(), TYPE_TITLES (+1 more)

### Community 140 - "streams.ts"
Cohesion: 0.07
Nodes (37): BINARY_EXTENSIONS, count(), describeWrite(), editFileTool, globTool, grepTool, IMAGE_EXTENSIONS, isBinary() (+29 more)

### Community 141 - "dictation.ts"
Cohesion: 0.29
Nodes (6): DARK_PALETTE, LIGHT_PALETTE, readVizTheme(), useVizTheme(), vizCssVariables(), VizTheme

### Community 144 - "electron-vite"
Cohesion: 0.19
Nodes (7): AppShell(), ChangelogDialog(), SECTION_TONE, CodeSidebar(), SearchPalette(), Sidebar(), TitleBar()

### Community 145 - "package.json"
Cohesion: 0.22
Nodes (8): author, description, license, main, name, private, productName, version

### Community 146 - "code-session.test.ts"
Cohesion: 0.07
Nodes (30): INIT_PROMPT, ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, PermissionMode, ReasoningPart, TaskFile (+22 more)

### Community 147 - "images.ts"
Cohesion: 0.20
Nodes (11): completionKindMap(), DocInfo, docs, documentUri(), LSP_LANGUAGES, parseDocumentUri(), registerLspProviders(), SEVERITY_MAP() (+3 more)

### Community 148 - "sessions.ts"
Cohesion: 0.12
Nodes (25): basename(), GroupedRepoFiles, groupQuantFiles(), isAuxiliaryGguf(), isMmprojFile(), parentName(), preferredMmproj(), quantBits() (+17 more)

### Community 149 - "quants.ts"
Cohesion: 0.26
Nodes (9): ChangesPane(), Counts(), errorText(), FileRow(), FileRowProps, num(), splitPath(), STATUS (+1 more)

### Community 151 - "AppShell.tsx"
Cohesion: 0.17
Nodes (8): project, lastUserText(), MockRequest, MockServer, sleep(), startMockServer(), VIZ_CDN_REPLY, VIZ_REPLY

### Community 152 - "snapshots.ts"
Cohesion: 0.12
Nodes (19): ThemePanel(), ARTBOARD_PRESETS, clampSize(), COLOR_TOKENS, FontCategory, FONTS, FORMAT_DEFAULTS, gradientStops() (+11 more)

### Community 153 - "@tanstack/react-query"
Cohesion: 0.22
Nodes (3): OutputBuffer, Emitted, waitFor()

### Community 154 - "@vitejs/plugin-react"
Cohesion: 0.12
Nodes (23): isInteger(), Rational, ALIASES, canonicalFunction(), clean(), CONSTANTS, Equation, EvalContext (+15 more)

### Community 155 - "snapshots.ts"
Cohesion: 0.25
Nodes (7): 1. Math: read a photo of handwritten work into a board — small, high value, 2. Cowork/Code: `run_command` cannot run anything long-lived — medium, 3. `read_file` can't read legacy Office formats (.doc/.xls/.ppt) — medium, 4. Design: rich text spans and growing text boxes — larger, 5. Math solvers: nonlinear systems and geometry beyond triangles — larger, niche, Next improvements, Not code work (deprioritized here)

### Community 156 - "LmStudioProvider"
Cohesion: 0.13
Nodes (5): RoundOptions, FitResult, SideChatPrompt, Provider, ProviderMessage

### Community 157 - "math-smoke.mjs"
Cohesion: 0.17
Nodes (9): exportDir, logs, outDir, problems, profile, project, [
  providerId = 'ollama',
  modelId = 'qwen3.5:9b',
  prompt =
    'Teach me the Pythagorean theorem: the rule, a drawing of a right triangle with legs 3 and 4, a worked example finding the hypotenuse, and one where a leg is missing and the answer is a root. Then give me 4 practice questions.',
  shot = 'math',
], quiz (+1 more)

### Community 159 - "charts.ts"
Cohesion: 0.24
Nodes (14): CHART_KINDS, ChartRenderOptions, chartSvg(), clamp(), formatValue(), niceScale(), r1(), truncate() (+6 more)

### Community 161 - "MathPage.tsx"
Cohesion: 0.29
Nodes (11): BoardCard(), errorText(), exportBoard(), IDEAS, isEditableTarget(), MathBoardPage(), MathHeader(), MathHomePage() (+3 more)

### Community 165 - "browser-sessions.test.ts"
Cohesion: 0.50
Nodes (3): cookies, cookieStore, FakeCookie

### Community 167 - "network.test.ts"
Cohesion: 0.08
Nodes (30): ChecksumError, downloadFile(), DownloadOptions, fileSize(), hashExisting(), throttle(), backendsFromFiles(), bestRuntime() (+22 more)

### Community 169 - "electron-vite"
Cohesion: 0.33
Nodes (5): dot(), EmbeddingIndex, embeddingPrefixes(), fromBlob(), toBlob()

### Community 171 - "@tanstack/react-router"
Cohesion: 0.29
Nodes (5): Answer(), LABELS, PlaygroundPage(), RESUMABLE_STOPS, SIDES

### Community 172 - "dictation.ts"
Cohesion: 0.24
Nodes (8): DictationState, join(), toSpeechSamples(), useDictation(), FONTS_QUERY_KEY, useCustomFonts(), useFontsQuery(), cleanIpcError()

### Community 173 - "lucide-react"
Cohesion: 0.07
Nodes (47): ActiveGeneration, chat, log, TurnFinished, blockText(), handleSampling(), messageContent(), seedBuiltinProviders() (+39 more)

### Community 176 - "radix-ui"
Cohesion: 0.29
Nodes (6): describeModules(), MODULE_ACTIONS, ModuleAction, moduleReadOnly(), READ_ONLY_ACTIONS, RESERVED_ACTIONS

### Community 178 - "streamdown"
Cohesion: 0.40
Nodes (3): CHANGELOG, ChangelogEntry, ChangelogSection

## Knowledge Gaps
- **910 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+905 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `paths()` connect `MemoryChatStore` to `hf-api.ts`, `commands.ts`, `ChatOrchestrator`, `engine.ts`, `run`, `.resolve`, `openai-compat.ts`, `DownloadManager`, `router.tsx`, `network.test.ts`, `.update`, `lucide-react`, `electron-vite`, `@fontsource-variable/source-serif-4`, `artifact-protocol.ts`, `sucrase`, `tailwind-merge`, `zustand`, `tools/types.ts`, `design/store.ts`, `monaco-editor`, `TerminalPane.tsx`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `dependencies` connect `scripts` to `package.json`, `run`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `code-changes.test.ts` to `DownloadManager`, `ArtifactPanel`, `package.json`, `math/actions.ts`, `agent-core.test.ts`, `@vitejs/plugin-react`, `monaco-editor`, `lucide-react`, `@fontsource-variable/source-serif-4`, `@playwright/test`, `tailwind-merge`, `@tanstack/react-query`, `@streamdown/mermaid`, `sucrase`, `vscode-languageserver-protocol`, `@xterm/addon-fit`, `@xterm/addon-web-links`, `@fontsource-variable/inter`, `@types/node`, `sonner`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `paths()` (e.g. with `registerDesignHandlers()` and `Composer()`) actually correct?**
  _`paths()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _910 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `LlamaCppProvider` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `ChatOrchestrator` be split into smaller, more focused modules?**
  _Cohesion score 0.07525150905432595 - nodes in this community are weakly interconnected._