# Graph Report - Cellar  (2026-09-17)

## Corpus Check
- 298 files · ~317,138 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3625 nodes · 8831 edges · 181 communities (147 shown, 34 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 180 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a53a84d7`
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
- code-changes.test.ts
- app.spec.ts
- snapshots.ts
- @tanstack/react-query
- @vitejs/plugin-react
- snapshots.ts
- LmStudioProvider
- math-smoke.mjs
- MemoryChatStore
- charts.ts
- math/actions.ts
- MathPage.tsx
- downloadFile
- agent-core.test.ts
- @vitejs/plugin-react
- browser-sessions.test.ts
- zustand
- network.test.ts
- stores/math.ts
- Provider
- updater.ts
- viz.ts
- TypedBus
- lucide-react
- @fontsource-variable/source-serif-4
- @streamdown/mermaid
- vscode-languageserver-protocol
- @xterm/addon-fit
- DownloadManager
- quants.ts
- @fontsource-variable/inter

## God Nodes (most connected - your core abstractions)
1. `IpcInvokeMap` - 92 edges
2. `paths()` - 74 edges
3. `run()` - 73 edges
4. `errorMessage()` - 72 edges
5. `newId()` - 54 edges
6. `registerIpcHandlers()` - 47 edges
7. `BrowserService` - 42 edges
8. `invoke()` - 42 edges
9. `ChatOrchestrator` - 40 edges
10. `get()` - 39 edges

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
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/call.ts -> src/main/modules/registry.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/reminder.ts -> src/main/scheduled/scheduler.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`

## Communities (181 total, 34 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.09
Nodes (39): computeQuantFit(), fitCache, fitInflight, fitWaiters, hfHeaders(), hfJson(), quantFit(), readme() (+31 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.10
Nodes (20): LocalModel, buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), formatParamCount(), freePort(), Instance (+12 more)

### Community 2 - "queries.ts"
Cohesion: 0.06
Nodes (38): BINARY_EXTENSIONS, count(), describeWrite(), editFileTool, globTool, grepTool, IMAGE_EXTENSIONS, isBinary() (+30 more)

### Community 4 - "engine.ts"
Cohesion: 0.05
Nodes (77): attachmentFromBytes(), attachmentRefs(), attachmentsFromPaths(), classifyFile(), cleanupOrphanAttachments(), extractPdfText(), IMAGE_TYPES, Row (+69 more)

### Community 5 - "run"
Cohesion: 0.06
Nodes (61): pptxgenjs, pptxgenjs, attachmentImage(), ensureSession(), exportDesign(), ExportTarget, fileSafe(), imageUrls() (+53 more)

### Community 6 - "scripts"
Cohesion: 0.06
Nodes (35): croner, docx, electron-updater, exceljs, extract-zip, @huggingface/gguf, jszip, marked (+27 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.14
Nodes (18): FitResult, fitToContext(), messageTokens(), toTurns(), truncateMiddle(), buildSystemPrompt(), chatToolGuidance(), cleanTitle() (+10 more)

### Community 8 - "openai-compat.ts"
Cohesion: 0.17
Nodes (22): RoundOptions, LmsDownloadStatus, LmsModel, authHeaders(), baseEntry(), ChatChunk, fetchOpenAIModels(), guessCapabilitiesFromName() (+14 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (29): electron.vite.config.ts, electron-vite/node, node, playwright.config.ts, scripts/**/*.ts, src/main/**/*, src/preload/**/*, tests/**/* (+21 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, src/artifact-runtime/**/*, src/preload/api.d.ts, src/renderer/src/**/*, src/renderer/src/**/*.tsx, vite/client, compilerOptions (+19 more)

### Community 11 - "orchestrator.ts"
Cohesion: 0.06
Nodes (33): session(), check(), conversationIdSchema, CreateTerminalOptions, dataSchema, envValue(), findOnPath(), idSchema (+25 more)

### Community 12 - "main/index.ts"
Cohesion: 0.16
Nodes (17): addBlock(), deleteBlock(), duplicateBlock(), moveBlock(), reorderBlock(), setBoardMeta(), store(), BlockShell() (+9 more)

### Community 13 - "DownloadManager"
Cohesion: 0.11
Nodes (11): isWholeGroup(), ChartSection(), chartToCsv(), csvToChart(), ElementPanel(), Layers(), patch(), Properties() (+3 more)

### Community 14 - "handlers.ts"
Cohesion: 0.22
Nodes (19): changed(), countEntries(), describe(), exec, expandPluginVars(), findPluginRoots(), installPlugin(), isDir() (+11 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.05
Nodes (65): AppCommand, AppInfo, BackgroundStatus, EVENT_CHANNELS, EventChannel, eventChannelFlags, Handler, INVOKE_CHANNELS (+57 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.06
Nodes (46): AgentPart, ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, ConversationKind, ReasoningPart, TaskFile (+38 more)

### Community 17 - "Messages.tsx"
Cohesion: 0.07
Nodes (20): ARTIFACT_ICONS, ARTIFACT_LABELS, ArtifactCard(), AttachmentImage(), attachmentImageUrl(), Lightbox(), MessageAttachments(), InlineImage() (+12 more)

### Community 18 - "fetchWithTimeout"
Cohesion: 0.28
Nodes (3): ollamaOptions(), OllamaProvider, readErrorBody()

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
Nodes (20): addElement(), expandToGroups(), imagesFromFiles(), naturalSize(), placeImage(), AddArtboardButton(), Box, boxFor() (+12 more)

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.09
Nodes (7): ACCENTS, LANGUAGES, SECTIONS, SettingsPage(), SHORTCUTS, VARIANT_LABEL, WHISPER_BUILDS

### Community 24 - "types/models.ts"
Cohesion: 0.09
Nodes (60): CalcOptions, CalcResult, calculate(), evaluationSteps(), measureOf(), prettyMeasure(), antiderivativePolynomial(), evalPolynomial() (+52 more)

### Community 25 - "provider-configs.ts"
Cohesion: 0.07
Nodes (24): browseBack, browseClearSession, browseClick, browseElements, browseFill, browseFindLink, browseForward, browseLoginStatus (+16 more)

### Community 26 - "hub.ts"
Cohesion: 0.07
Nodes (29): coworkGuidance, parseParamsBillions(), DownloadFileState, DownloadJob, DownloadStatus, DownloadTarget, HfFile, HfModelSummary (+21 more)

### Community 27 - ".doScan"
Cohesion: 0.17
Nodes (13): ParsedShard, describeLocation(), FoundGroup, inspectLocalGguf(), localModelId(), LocalModelIndex, log, pickMmproj() (+5 more)

### Community 28 - "LmStudioProvider"
Cohesion: 0.18
Nodes (16): effectiveThinking(), isChatCapable(), thinkingLabel(), thinkingOptions(), useAppCommands(), useBrowserReveal(), useSelectedModel(), useThemeSync() (+8 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.11
Nodes (34): exists(), inside(), PathAccessError, Workspace, codeSession(), CodeSessionContext, BASE_HEADERS, buildPreviewUrl() (+26 more)

### Community 30 - "OpenAIServerProvider"
Cohesion: 0.20
Nodes (13): chartFromCode(), newToolCallId(), asObject(), CallSplitPart, describeType(), escapeControlCharsInStrings(), ParsedTextCall, parseLooseJson() (+5 more)

### Community 31 - "MemoryChatStore"
Cohesion: 0.08
Nodes (67): quickEntryShortcutActive(), builtInCommands(), changed(), commandSlug(), customCommands(), deleteCommand(), expandCommand(), expandTemplate() (+59 more)

### Community 34 - "Provider"
Cohesion: 0.15
Nodes (22): baseBlob(), buildDiff(), byPath(), commitAll(), deleteNewFile(), existsInBase(), gitChangeSet(), gitFailure() (+14 more)

### Community 35 - "form.tsx"
Cohesion: 0.20
Nodes (3): Input, SelectOption, Textarea

### Community 36 - "devDependencies"
Cohesion: 0.06
Nodes (35): cmdk, electron, electron-builder, electron-vite, monaco-editor, devDependencies, cmdk, electron (+27 more)

### Community 37 - "chat-smoke.mjs"
Cohesion: 0.22
Nodes (8): elapsed, logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3:0.6b', prompt = 'Say hello in five words.', shot = 'chat'], started

### Community 39 - "ModelRef"
Cohesion: 0.12
Nodes (5): callbackPath(), CellarOAuthProvider, ensureServer(), loadOAuthState(), waitForCallback()

### Community 40 - "build-artifact-runtime.mjs"
Cohesion: 0.25
Nodes (6): entry, outDir, output, root, tailwindOutput, tailwindSource

### Community 41 - ".update"
Cohesion: 0.12
Nodes (9): ConnectorManager, Live, renderToolResult(), signatureOf(), toolResultImages(), withTimeout(), authUrlFor(), closeOAuthServer() (+1 more)

### Community 42 - "window.ts"
Cohesion: 0.05
Nodes (59): escapeRegex(), globFiles(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry, WalkOptions (+51 more)

### Community 43 - "AppShell.tsx"
Cohesion: 0.12
Nodes (30): invoke(), keys, useAppInfo(), useArtifacts(), useBackground(), useCheckForUpdates(), useCommands(), useConnectors() (+22 more)

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
Cohesion: 0.14
Nodes (20): addStroke(), answerMatches(), answerQuestion(), clearSketch(), eraseStroke(), resetQuiz(), revealQuestion(), updateBlock() (+12 more)

### Community 49 - "HomePage.tsx"
Cohesion: 0.29
Nodes (4): CoworkExtras(), folderName(), HomePage(), SUGGESTIONS

### Community 50 - "providers.ts"
Cohesion: 0.07
Nodes (25): ToolPart, StreamEvent, ModelEntry, BUILTIN_PROVIDER_IDS, ProviderConfig, ProviderConfigInput, ProviderKind, ProviderState (+17 more)

### Community 51 - "verify-packaged.mjs"
Cohesion: 0.33
Nodes (4): exe, exportDir, local, project

### Community 52 - "DiscoverPage.tsx"
Cohesion: 0.08
Nodes (31): ChangesPane(), Counts(), errorText(), FileRow(), FileRowProps, num(), splitPath(), STATUS (+23 more)

### Community 53 - "ModelsPage.tsx"
Cohesion: 0.15
Nodes (24): ShapeSection(), normalizeChart(), canonicalFields(), clamp(), color(), FORMATS, gradient(), KEY_ALIASES (+16 more)

### Community 55 - "ipc-run.mjs"
Cohesion: 0.50
Nodes (3): calls, profile, project

### Community 56 - "preload/index.ts"
Cohesion: 0.50
Nodes (3): bridge, eventsAllowed, invokeAllowed

### Community 57 - "ArtifactPanel.tsx"
Cohesion: 0.19
Nodes (12): ensureOverride(), listStoredConnectors(), pluginOverrides(), record(), Row, saveStoredConnector(), sealRecord(), setStoredEnabled() (+4 more)

### Community 58 - "ChatPage.tsx"
Cohesion: 0.10
Nodes (37): blockElements(), cellValue(), chartTable(), createPptx(), createXlsx(), DOCUMENT_EXTENSIONS, DocumentOptions, DOCX_IMAGE_TYPES (+29 more)

### Community 63 - "cmdk"
Cohesion: 0.26
Nodes (21): escapeXml(), artboardHtml(), artboardStyle(), artboardSvg(), boxStyle(), cssText(), designHtml(), elementHtml() (+13 more)

### Community 64 - "electron"
Cohesion: 0.12
Nodes (47): asRational(), Exact, exactAdd(), exactDiv(), exactFromNumber(), exactInt(), exactInverse(), exactIsZero() (+39 more)

### Community 65 - "electron-builder"
Cohesion: 0.40
Nodes (3): defaultPolicy(), toolPolicy(), hasOAuthTokens()

### Community 66 - "electron-vite"
Cohesion: 0.08
Nodes (38): pdfAvailable(), AgentPromptInput, buildAgentPrompt(), compactionRequest(), agentNoun(), autoApproveBrowser(), hostOf(), joinReasoning() (+30 more)

### Community 67 - "@fontsource-variable/inter"
Cohesion: 0.18
Nodes (11): ANSI, ESC, killTree(), runCommand, runShell(), ShellOptions, ShellResult, report() (+3 more)

### Community 68 - "@fontsource-variable/source-serif-4"
Cohesion: 0.14
Nodes (27): branchExists(), branchSlug(), createWorktree(), currentBranch(), findMemoryFile(), git(), gitAvailable(), GitOptions (+19 more)

### Community 69 - "lucide-react"
Cohesion: 0.29
Nodes (6): describeModules(), MODULE_ACTIONS, ModuleAction, moduleReadOnly(), READ_ONLY_ACTIONS, RESERVED_ACTIONS

### Community 70 - "@playwright/test"
Cohesion: 0.11
Nodes (41): blockType(), FIGURE_KINDS, figureKindOf(), isObject(), LIMITS, Loose, measureList(), nextBlockId() (+33 more)

### Community 71 - "radix-ui"
Cohesion: 0.22
Nodes (13): changed(), contentSchema, conversationIdSchema, listDirectory(), readWorkspaceFile(), writeWorkspaceFile(), gitDiscardFile(), restoreFromBase() (+5 more)

### Community 72 - "react"
Cohesion: 0.12
Nodes (10): ChatRequest, currentEntry, fake, FakeProvider, finished(), message(), Provider, Script (+2 more)

### Community 73 - "react-dom"
Cohesion: 0.15
Nodes (11): CHART_KINDS, LAYOUT_NAMES, resizeArtboard(), measureSvg(), sanitizeSvg(), sizedSvg(), ARTBOARD_PRESETS, THEMES (+3 more)

### Community 74 - "streamdown"
Cohesion: 0.09
Nodes (33): exactZero, Node, text(), Atom, escapeHtml(), mathToPlain(), prepare(), Renderer (+25 more)

### Community 75 - "@streamdown/code"
Cohesion: 0.11
Nodes (27): area(), arithmetic(), Draft, fractions(), fromSolution(), GeneratedQuiz, generateQuiz(), GENERATORS (+19 more)

### Community 76 - "@streamdown/math"
Cohesion: 0.12
Nodes (13): AppShell(), CodeSidebar(), SessionFilter, DownloadsButton(), TARGET_LABEL, SearchPalette(), Icon, NavItem() (+5 more)

### Community 77 - "@streamdown/mermaid"
Cohesion: 0.22
Nodes (10): useIpcSync(), speak(), speakReply(), speakWithSystemVoice(), stopSpeaking(), stripForSpeech(), useSpeechVoices(), pending (+2 more)

### Community 78 - "sucrase"
Cohesion: 0.09
Nodes (35): downloadFile(), DownloadOptions, fileSize(), hashExisting(), errorMessage(), recommendedWhisperVariant(), EXE_NAMES, findPiper() (+27 more)

### Community 80 - "tailwindcss"
Cohesion: 0.43
Nodes (3): clamp(), SettingsService, uniqueStrings()

### Community 81 - "@tailwindcss/browser"
Cohesion: 0.08
Nodes (34): browser, boundsSchema, registerBrowserHandlers(), tabId, url, loginStatus(), registerPreviewHandlers(), active (+26 more)

### Community 82 - "@tanstack/react-query"
Cohesion: 0.15
Nodes (12): SideChatEvent, SideChatMessage, ask(), ChatRequest, FakeProvider, msg(), Provider, question() (+4 more)

### Community 83 - "@tanstack/react-router"
Cohesion: 0.15
Nodes (29): BOM, byPath(), countable(), snapshotChangeSet(), snapshotDiscardFile(), snapshotFileDiff(), WriteOptions, countLineChanges() (+21 more)

### Community 85 - "@types/react"
Cohesion: 0.19
Nodes (15): lastAuthUrl, log, pending, clearOAuthState(), OAuthState, Row, saveClientInformation(), saveCodeVerifier() (+7 more)

### Community 86 - "typescript"
Cohesion: 0.38
Nodes (5): DictationState, join(), toSpeechSamples(), useDictation(), cleanIpcError()

### Community 88 - "@vitejs/plugin-react"
Cohesion: 0.13
Nodes (17): ChartRenderOptions, clamp(), layoutContent, layoutElements(), layoutName, LAYOUTS, Raw, newElementId() (+9 more)

### Community 89 - "vitest"
Cohesion: 0.10
Nodes (18): buildTaskHistory(), callImages(), groupRounds(), HistoryOptions, historyTokens(), latestCompaction(), resultForModel(), Round (+10 more)

### Community 90 - "zustand"
Cohesion: 0.19
Nodes (13): DesignCard(), DesignEditorPage(), DesignHeader(), DesignHomePage(), errorText(), exportDesign(), FORMAT_ICONS, IDEAS (+5 more)

### Community 94 - "agent-core.test.ts"
Cohesion: 0.07
Nodes (41): absoluteUrl(), htmlToText(), NAMED_ENTITIES, PageText, parseBraveHtml(), parseDuckDuckGoHtml(), parseSearxngJson(), SearchResult (+33 more)

### Community 95 - "Cellar roadmap"
Cohesion: 0.05
Nodes (38): 3.1 Built-in Chromium browser (`src/main/browser/`), 3.2 `call(module, task)` (`src/main/modules/`), 3.3 Self-scheduling (`create_reminder`), 3.4 Voice: streaming transcription and spoken replies, Cellar roadmap, Known gaps and follow-ups from M1, Known gaps and follow-ups from M2, Known gaps and follow-ups from M3 (+30 more)

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
Cohesion: 0.10
Nodes (34): INIT_PROMPT, IpcInvokeMap, PermissionMode, ConversationSummary, ProjectIndexStatus, ThinkingLevel, ChangedFile, ChangeSet (+26 more)

### Community 100 - "history.ts"
Cohesion: 0.14
Nodes (12): address, approvals, elapsed, logs, outDir, problems, profile, project (+4 more)

### Community 101 - "Workspace"
Cohesion: 0.08
Nodes (34): callTool, moduleId, normalizeCallArgs(), connectorTool(), connectorToolName(), connectorTools(), diagnosticsTool, forgetTool (+26 more)

### Community 102 - "orchestrator.ts"
Cohesion: 0.07
Nodes (45): attachCloseToTray(), backgroundActive(), createMain(), getMain(), hideQuickEntry(), iconPath(), installBackground(), isQuitting() (+37 more)

### Community 103 - "util.ts"
Cohesion: 0.20
Nodes (17): addArtboard(), AlignEdge, alignSelection(), copySelection(), deleteArtboard(), deleteSelection(), duplicateSelection(), editor() (+9 more)

### Community 104 - "client.ts"
Cohesion: 0.20
Nodes (11): CodeHomePage(), CodeSessionPage(), errorText(), folderName(), IDEAS, PANES, PlanReady(), RepoPicker() (+3 more)

### Community 105 - "TaskPage.tsx"
Cohesion: 0.40
Nodes (4): errorText(), PlanReady(), STATUS, TaskPage()

### Community 106 - "ToolStep.tsx"
Cohesion: 0.12
Nodes (15): AgentParts(), Block, toBlocks(), ApprovalCard(), durationLabel(), errorText(), FILE_TOOLS, OpenFileContext (+7 more)

### Community 107 - "TaskSidePanel.tsx"
Cohesion: 0.47
Nodes (4): run(), searchLabel(), SOURCE_LABELS, TaskSidePanel()

### Community 108 - "monaco.ts"
Cohesion: 0.23
Nodes (10): alpha(), applyTheme(), cssColor(), EXTENSION_LANGUAGES, FILENAME_LANGUAGES, load(), loadMonaco(), Monaco (+2 more)

### Community 109 - "SideChat.tsx"
Cohesion: 0.09
Nodes (12): BrowserService, getWindow(), normalizeUrl(), EMPTY, historyOf(), LiveReply, newRequestId(), requestMessages() (+4 more)

### Community 110 - "downloadFile"
Cohesion: 0.13
Nodes (19): ChartElement, ChartKind, ChartSeries, ColorToken, DesignElementType, DesignExportFormat, DesignFormat, ElementBase (+11 more)

### Community 111 - "ToolContext"
Cohesion: 0.31
Nodes (9): artifactTypeFor(), deriveArtifactTitle(), LANGUAGE_TYPES, parseArtifacts(), ParsedArtifact, parseInfoString(), slugify(), TYPE_TITLES (+1 more)

### Community 112 - "🎨 AI Design Engine: Concept & Specification Document"
Cohesion: 0.29
Nodes (6): 🚀 1. Overview: Bridging the Gap Between Text and Visual Design, 🧱 2. The Limitations of Current Text-Based AI, ✨ 3. The Vision: Desired Capabilities (The Next-Generation AI), 🛠️ 4. Technical Feature Checklist (The Design Specification), 🧠 5. AI Self-Assessment and Self-Identified Issues, 🎨 AI Design Engine: Concept & Specification Document

### Community 113 - "CodeModeMenu.tsx"
Cohesion: 0.52
Nodes (6): CODE_MODE_OPTIONS, codeModeKey(), CodeModeMenu(), CodeModeValue, nextCodeMode(), Option

### Community 115 - "stores/code.ts"
Cohesion: 0.33
Nodes (5): CodePane, CodeUiState, EditorRequest, PreviewRequest, useCodeUi

### Community 116 - "monaco-editor"
Cohesion: 0.22
Nodes (5): ModuleId, asString(), Job, ModuleRegistry, optString()

### Community 120 - "@xterm/addon-fit"
Cohesion: 0.17
Nodes (12): scripts, build, build:win, dev, preview, runtime:artifacts, test, test:e2e (+4 more)

### Community 122 - "@xterm/xterm"
Cohesion: 0.16
Nodes (20): angleArc(), buildFigure(), BuiltFigure, centroid(), completeRightTriangle(), DEFAULT_LABELS, figureLabel(), format() (+12 more)

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
Cohesion: 0.17
Nodes (23): adaptiveSimpson(), add(), asPolynomial(), bareTermOf(), CalculusError, call(), collectPolynomialTerms(), definiteIntegral() (+15 more)

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
Cohesion: 0.07
Nodes (47): installPdfRenderer(), installTaskNotifications(), log, setPdfRenderer(), setSvgRasterizer(), installBrowser(), log, Tab (+39 more)

### Community 137 - "quants.ts"
Cohesion: 0.24
Nodes (4): ArtboardView(), css(), ElementView, ElementViewProps

### Community 139 - "design/export.ts"
Cohesion: 0.14
Nodes (3): StoredProviderConfig, fetchEmbeddings(), OpenAIServerProvider

### Community 140 - "streams.ts"
Cohesion: 0.24
Nodes (15): backgroundAt(), checkArtboard(), intersects(), short(), estimateLines(), estimateTextHeight(), fitFontSize(), glyphWidth() (+7 more)

### Community 141 - "dictation.ts"
Cohesion: 0.29
Nodes (6): DARK_PALETTE, LIGHT_PALETTE, readVizTheme(), useVizTheme(), vizCssVariables(), VizTheme

### Community 144 - "electron-vite"
Cohesion: 0.16
Nodes (10): encodeWav(), findSilenceBoundary(), SilenceOptions, GpuInfo, HardwareInfo, RuntimeDevice, RuntimeInfo, RuntimeInstallProgress (+2 more)

### Community 145 - "package.json"
Cohesion: 0.22
Nodes (8): author, description, license, main, name, private, productName, version

### Community 146 - "code-session.test.ts"
Cohesion: 0.10
Nodes (16): CodeSessionInfo, BOM, commit(), makeRepo(), sh(), ChatRequest, cleanup, entry (+8 more)

### Community 147 - "images.ts"
Cohesion: 0.22
Nodes (10): completionKindMap(), DocInfo, docs, documentUri(), LSP_LANGUAGES, parseDocumentUri(), registerLspProviders(), SEVERITY_MAP() (+2 more)

### Community 148 - "sessions.ts"
Cohesion: 0.33
Nodes (9): clearDomainSession(), cookieUrl(), DIR, ensureDir(), fileFor(), loadAllSessions(), log, saveDomainSession() (+1 more)

### Community 150 - "code-changes.test.ts"
Cohesion: 0.21
Nodes (11): displayAddress(), externalLink(), handledRequests, isPdf(), Preview(), previewPath(), PreviewState, run() (+3 more)

### Community 151 - "app.spec.ts"
Cohesion: 0.17
Nodes (8): project, lastUserText(), MockRequest, MockServer, sleep(), startMockServer(), VIZ_CDN_REPLY, VIZ_REPLY

### Community 152 - "snapshots.ts"
Cohesion: 0.19
Nodes (13): clampSize(), COLOR_TOKENS, FontCategory, FORMAT_DEFAULTS, gradientStops(), hex6(), luminance(), mixColors() (+5 more)

### Community 153 - "@tanstack/react-query"
Cohesion: 0.21
Nodes (9): argumentsObject(), OllamaChatLine, OllamaPs, OllamaPullProgress, OllamaShow, OllamaTag, ollamaThink(), parseOllamaChatStream() (+1 more)

### Community 154 - "@vitejs/plugin-react"
Cohesion: 0.31
Nodes (5): canonicalFunction(), CONSTANTS, parseInequality(), Parser, tokenize()

### Community 155 - "snapshots.ts"
Cohesion: 0.19
Nodes (5): ComposerProps, ModelPicker(), BROWSER_APPROVAL_MODES, ToolsDialog(), ToolsMenu()

### Community 156 - "LmStudioProvider"
Cohesion: 0.21
Nodes (7): fetchWithTimeout(), lmStudioInstalled(), LmStudioProvider, DuckDuckGoImage, fetchVqd(), ImageResult, searchImage()

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
Cohesion: 0.28
Nodes (12): ThemePanel(), chartSvg(), clamp(), formatValue(), niceScale(), r1(), truncate(), wrap() (+4 more)

### Community 161 - "MathPage.tsx"
Cohesion: 0.29
Nodes (11): BoardCard(), errorText(), exportBoard(), IDEAS, isEditableTarget(), MathBoardPage(), MathHeader(), MathHomePage() (+3 more)

### Community 162 - "downloadFile"
Cohesion: 0.40
Nodes (3): ChecksumError, payload, sha

### Community 165 - "browser-sessions.test.ts"
Cohesion: 0.50
Nodes (3): cookies, cookieStore, FakeCookie

### Community 166 - "zustand"
Cohesion: 0.35
Nodes (5): dot(), EmbeddingIndex, embeddingPrefixes(), fromBlob(), toBlob()

### Community 167 - "network.test.ts"
Cohesion: 0.15
Nodes (14): throttle(), backendsFromFiles(), bestRuntime(), exec, findServerDir(), idForDir(), log, parseDevicesOutput() (+6 more)

### Community 168 - "stores/math.ts"
Cohesion: 0.18
Nodes (9): PropertiesTab(), MathChat(), EditorState, MathLayoutState, PanelTab, PEN_COLORS, selectedBlock(), useMathEditor (+1 more)

### Community 170 - "updater.ts"
Cohesion: 0.31
Nodes (9): autoCheckTick(), AutoUpdater, check(), loadAutoUpdater(), log, runCheck(), setState(), state (+1 more)

### Community 171 - "viz.ts"
Cohesion: 0.27
Nodes (9): ChartSpec, ChatChartSpec, parseChartSpec(), ParsedViz, parseVizBlocks(), tolerantJson(), vizFileName(), VizKind (+1 more)

### Community 193 - "quants.ts"
Cohesion: 0.12
Nodes (25): basename(), GroupedRepoFiles, groupQuantFiles(), isAuxiliaryGguf(), isMmprojFile(), parentName(), preferredMmproj(), quantBits() (+17 more)

## Knowledge Gaps
- **832 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+827 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `errorMessage()` connect `sucrase` to `hf-api.ts`, `engine.ts`, `.resolve`, `orchestrator.ts`, `handlers.ts`, `fetchWithTimeout`, `sessions.ts`, `@tanstack/react-query`, `.doScan`, `OpenAIServerProvider`, `MemoryChatStore`, `ProviderRegistry`, `Sidebar.tsx`, `zustand`, `network.test.ts`, `.update`, `window.ts`, `updater.ts`, `DownloadManager`, `electron-vite`, `@fontsource-variable/source-serif-4`, `@tailwindcss/browser`, `@tanstack/react-router`, `vitest`, `tools/types.ts`, `orchestrator.ts`, `SideChat.tsx`, `monaco-editor`, `@tailwindcss/vite`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `dependencies` connect `scripts` to `package.json`, `run`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `paths()` connect `MemoryChatStore` to `engine.ts`, `run`, `.resolve`, `openai-compat.ts`, `design/export.ts`, `handlers.ts`, `router.tsx`, `.doScan`, `ModelRef`, `network.test.ts`, `ArtifactPanel.tsx`, `electron-vite`, `@fontsource-variable/source-serif-4`, `sucrase`, `@tanstack/react-router`, `vitest`, `zustand`, `tools/types.ts`, `orchestrator.ts`, `monaco-editor`, `@tailwindcss/vite`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `paths()` (e.g. with `Composer()` and `DesignHeader()`) actually correct?**
  _`paths()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _832 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `hf-api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08859357696567 - nodes in this community are weakly interconnected._
- **Should `LlamaCppProvider` be split into smaller, more focused modules?**
  _Cohesion score 0.0975609756097561 - nodes in this community are weakly interconnected._