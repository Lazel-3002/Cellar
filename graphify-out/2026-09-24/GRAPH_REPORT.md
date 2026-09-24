# Graph Report - Cellar  (2026-09-23)

## Corpus Check
- 375 files · ~444,104 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4804 nodes · 11697 edges · 259 communities (196 shown, 63 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 270 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `319e418f`
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
- react
- electron-vite
- @tailwindcss/browser
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
- PreviewPane.tsx
- window.ts
- types/math.ts
- Next improvements
- zustand
- artboardsToPptx
- tools/background.ts
- command.ts
- .content
- .load
- design.test.ts
- @fontsource-variable/inter
- glob.ts
- memory.test.ts
- OpenAIServerProvider
- Parser
- lib/fonts.ts
- ArtifactPanel
- shared/artifacts.ts
- Cellar
- ErrorBoundary
- Cellar — Project Memory
- M8.1 Undo in Cowork, git beyond commit, and memory on demand (v7.4.0)
- M8 Tier 3 wishlist — delivered
- ContextInfoPanel.tsx
- @streamdown/math
- M8.2 Playground (v7.6.0)
- M5 Design — delivered
- M6 Math — delivered
- services/artifacts.ts
- M2 Cowork — delivered
- M3 Code — delivered
- M4 Customize, Scheduled, Voice — delivered
- M7.1 Seamless inline visualizations (v7.1.0)
- hi.md
- viz-export.ts
- @playwright/test
- sucrase
- tailwind-merge
- tailwindcss
- @types/react-dom
- followUps.ts
- usePacedText
- helper.cs
- M10 Computer use — built (2026-09-23, not released yet)
- .callTool
- M1 Foundation — delivered
- docx
- electron
- electron-builder
- electron-updater
- electron-vite
- exceljs
- @huggingface/gguf
- jszip
- marked
- node-pty
- pyright
- typescript
- unpdf
- zod
- radix-ui
- sonner
- @streamdown/code
- @streamdown/math
- @tailwindcss/vite
- @tanstack/react-router
- @types/react
- vscode-languageserver-protocol
- @xterm/addon-web-links
- raw.d.ts

## God Nodes (most connected - your core abstractions)
1. `IpcInvokeMap` - 116 edges
2. `run()` - 100 edges
3. `errorMessage()` - 95 edges
4. `paths()` - 83 edges
5. `Program` - 72 edges
6. `newId()` - 66 edges
7. `get()` - 62 edges
8. `registerIpcHandlers()` - 54 edges
9. `invoke()` - 52 edges
10. `registerM4Handlers()` - 51 edges

## Surprising Connections (you probably didn't know these)
- `normalizeQuestions()` --indirect_call--> `answer()`  [INFERRED]
  src/shared/math/normalize.ts → scripts/study-smoke.mjs
- `runShell()` --indirect_call--> `collect()`  [INFERRED]
  src/main/agent/tools/command.ts → tests/unit/stream-parsers.test.ts
- `FollowUpChips()` --indirect_call--> `question()`  [INFERRED]
  src/renderer/src/components/chat/Messages.tsx → tests/unit/side-chat.test.ts
- `SideChat()` --indirect_call--> `question()`  [INFERRED]
  src/renderer/src/components/code/SideChat.tsx → tests/unit/side-chat.test.ts
- `QuizView()` --indirect_call--> `question()`  [INFERRED]
  src/renderer/src/components/math/Blocks.tsx → tests/unit/side-chat.test.ts

## Import Cycles
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/call.ts -> src/main/modules/registry.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/reminder.ts -> src/main/scheduled/scheduler.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`

## Communities (259 total, 63 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.14
Nodes (28): changed(), countEntries(), describe(), enabledPlugins(), exec, expandPluginVars(), findPluginRoots(), installPlugin() (+20 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.10
Nodes (28): AgentPart, TaskStartOptions, Artifact, ArtifactSummary, AttachmentKind, AttachmentRef, ChatStreamEvent, ContextInfo (+20 more)

### Community 2 - "queries.ts"
Cohesion: 0.06
Nodes (61): ShapeSection(), annotationBox(), answeredQuestions(), ASCII_WIDTHS, blankIn(), charWidth(), exactBlank(), findText() (+53 more)

### Community 3 - "ChatOrchestrator"
Cohesion: 0.05
Nodes (32): act(), COMPUTER_TOOLS, computerClick, computerDrag, computerHandOver, computerKey, computerMove, computerOpenApp (+24 more)

### Community 4 - "engine.ts"
Cohesion: 0.05
Nodes (64): boundsSchema, registerBrowserHandlers(), tabId, url, loginStatus(), attachmentFromBytes(), attachmentRefs(), attachmentsFromPaths() (+56 more)

### Community 5 - "run"
Cohesion: 0.11
Nodes (28): escapeRegex(), globFiles(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry, WalkOptions (+20 more)

### Community 6 - "scripts"
Cohesion: 0.11
Nodes (19): croner, extract-zip, @modelcontextprotocol/sdk, dependencies, croner, extract-zip, @modelcontextprotocol/sdk, pdf-lib (+11 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.27
Nodes (9): ParsedImageTag, parseImageTags(), withImageTags(), branchPath(), childrenOf(), latestLeaf(), siblingsOf(), parseVizBlocks() (+1 more)

### Community 8 - "openai-compat.ts"
Cohesion: 0.14
Nodes (21): LmsDownloadStatus, LmsModel, authHeaders(), baseEntry(), ChatChunk, fetchEmbeddings(), fetchOpenAIModels(), guessCapabilitiesFromName() (+13 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (29): electron.vite.config.ts, electron-vite/node, node, playwright.config.ts, scripts/**/*.ts, src/main/**/*, src/preload/**/*, tests/**/* (+21 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, src/artifact-runtime/**/*, src/preload/api.d.ts, src/renderer/src/**/*, src/renderer/src/**/*.tsx, vite/client, compilerOptions (+19 more)

### Community 11 - "orchestrator.ts"
Cohesion: 0.05
Nodes (56): checkJavaScript(), checkJsonText(), checkPowerShell(), checkPyright(), checkPython(), checkRuff(), checkTypeScriptSyntax(), findPython() (+48 more)

### Community 12 - "main/index.ts"
Cohesion: 0.09
Nodes (18): webFetch, webSearch, buildDesignPrompt(), DesignPromptInput, contentSchema, createArtboardTool, deleteArtboardTool, DESIGN_TOOLS (+10 more)

### Community 13 - "DownloadManager"
Cohesion: 0.10
Nodes (12): isWholeGroup(), ChartSection(), chartToCsv(), csvToChart(), ElementPanel(), ImportFontButton(), Layers(), patch() (+4 more)

### Community 14 - "handlers.ts"
Cohesion: 0.07
Nodes (43): APP_ALIASES, asUrl(), ComputerActionKind, coordinateSpaceFor(), describeObservation(), DescribeOptions, describeSpace(), elementFrom() (+35 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.15
Nodes (16): AnnotationBase, Book, BookChat, BookSummary, HighlightAnnotation, InkAnnotation, MarkAnnotation, NoteAnnotation (+8 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.07
Nodes (32): ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, ConversationKind, ReasoningPart, TaskFile, TaskSource (+24 more)

### Community 17 - "Messages.tsx"
Cohesion: 0.06
Nodes (27): ARTIFACT_ICONS, ARTIFACT_LABELS, ArtifactCard(), AttachmentImage(), attachmentImageUrl(), Lightbox(), MessageAttachments(), InlineImage() (+19 more)

### Community 18 - "fetchWithTimeout"
Cohesion: 0.13
Nodes (13): StoredProviderConfig, argumentsObject(), OllamaChatLine, ollamaOptions(), OllamaProvider, OllamaPs, OllamaPullProgress, OllamaShow (+5 more)

### Community 19 - "button.tsx"
Cohesion: 0.12
Nodes (9): Button, ButtonProps, IconButton, IconButtonProps, Size, sizes, Variant, variants (+1 more)

### Community 20 - "router.tsx"
Cohesion: 0.09
Nodes (17): ChatPage(), CustomizePage(), DiscoverPage(), PUBLISHERS, QuantRow(), ArtifactsPage(), RecentsPage(), ModelsPage() (+9 more)

### Community 21 - "LoadSettingsDialog.tsx"
Cohesion: 0.15
Nodes (10): CapabilityIcons(), FIT_COPY, FitBadge(), MemoryBars(), PROVIDER_LABEL, providerStateDot(), ProviderStatusDot(), CONTEXT_STEPS (+2 more)

### Community 22 - "stream-parsers.ts"
Cohesion: 0.12
Nodes (20): addElement(), expandToGroups(), imagesFromFiles(), naturalSize(), placeImage(), AddArtboardButton(), Box, boxFor() (+12 more)

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.08
Nodes (8): ACCENTS, Code(), LANGUAGES, SECTIONS, SettingsPage(), SHORTCUTS, VARIANT_LABEL, WHISPER_BUILDS

### Community 24 - "types/models.ts"
Cohesion: 0.07
Nodes (58): apply(), color(), drawAnnotation(), exportBook(), fileSafe(), invert(), loadFont(), Matrix (+50 more)

### Community 25 - "provider-configs.ts"
Cohesion: 0.07
Nodes (24): browseBack, browseClearSession, browseClick, browseElements, browseFill, browseFindLink, browseForward, browseLoginStatus (+16 more)

### Community 26 - "hub.ts"
Cohesion: 0.07
Nodes (29): coworkGuidance, parseParamsBillions(), DownloadFileState, DownloadJob, DownloadStatus, DownloadTarget, HfFile, HfModelSummary (+21 more)

### Community 27 - ".doScan"
Cohesion: 0.04
Nodes (30): ToolContext, addBlocksTool, blockSchema, calculateTool, deleteBlocksTool, diagramStepSchema, drawDiagramTool, drawFigureTool (+22 more)

### Community 28 - "LmStudioProvider"
Cohesion: 0.15
Nodes (18): effectiveThinking(), isChatCapable(), thinkingLabel(), thinkingOptions(), useAppCommands(), useBrowserReveal(), useSelectedModel(), useThemeSync() (+10 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.11
Nodes (35): exists(), inside(), Workspace, listDirectory(), readWorkspaceFile(), writeWorkspaceFile(), codeSession(), CodeSessionContext (+27 more)

### Community 30 - "OpenAIServerProvider"
Cohesion: 0.16
Nodes (15): newToolCallId(), RoundOptions, asObject(), CallSplitPart, describeType(), escapeControlCharsInStrings(), ParsedTextCall, parseLooseJson() (+7 more)

### Community 31 - "MemoryChatStore"
Cohesion: 0.12
Nodes (33): bodySchema, changed(), contentSchema, conversationIdSchema, abortMerge(), commitAll(), conflictedFiles(), continueMerge() (+25 more)

### Community 32 - "ProviderRegistry"
Cohesion: 0.16
Nodes (6): joinReasoning(), TaskRunInput, TaskRunnerHooks, cleanTitle(), parseFollowUps(), ChatStore

### Community 33 - "Sidebar.tsx"
Cohesion: 0.28
Nodes (11): savePreset(), deleteModel(), listModels(), loadedModels(), loadModel(), modelDetail(), requireModel(), rescanModels() (+3 more)

### Community 34 - "Provider"
Cohesion: 0.12
Nodes (16): AutomationElement, AutomationProperty, Bitmap, bool, Color, Condition, ControlType, Dictionary (+8 more)

### Community 35 - "form.tsx"
Cohesion: 0.20
Nodes (3): Input, SelectOption, Textarea

### Community 36 - "devDependencies"
Cohesion: 0.05
Nodes (41): 0.1.0 — 2026-09-13, 2.0.0 — 2026-09-14, 3.0.0 — 2026-09-14, 4.0.0 — 2026-09-15, 5.0.0 — 2026-09-15, 6.0.0 — 2026-09-16, 7.0.0 — 2026-09-16, 7.0.1 — 2026-09-16 (+33 more)

### Community 37 - "chat-smoke.mjs"
Cohesion: 0.22
Nodes (8): elapsed, logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3:0.6b', prompt = 'Say hello in five words.', shot = 'chat'], started

### Community 40 - "build-artifact-runtime.mjs"
Cohesion: 0.25
Nodes (6): entry, outDir, output, root, tailwindOutput, tailwindSource

### Community 41 - ".update"
Cohesion: 0.14
Nodes (5): ConnectorManager, Live, signatureOf(), withTimeout(), closeOAuthServer()

### Community 42 - "window.ts"
Cohesion: 0.36
Nodes (5): buildSystemPrompt(), chatToolGuidance(), fallbackTitle(), supportsArtifactInstructions(), SystemPromptInput

### Community 43 - "AppShell.tsx"
Cohesion: 0.11
Nodes (34): invoke(), keys, useAppInfo(), useArtifacts(), useBackground(), useCheckForUpdates(), useCommands(), useConnectors() (+26 more)

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
Cohesion: 0.05
Nodes (57): addBlock(), addStroke(), answerMatches(), answerQuestion(), clearSketch(), deleteBlock(), duplicateBlock(), eraseStroke() (+49 more)

### Community 49 - "HomePage.tsx"
Cohesion: 0.40
Nodes (3): Answer(), LABELS, RESUMABLE_STOPS

### Community 50 - "providers.ts"
Cohesion: 0.04
Nodes (43): ToolPart, StreamEvent, ModelEntry, BUILTIN_PROVIDER_IDS, ProviderConfig, ProviderConfigInput, ProviderKind, ProviderState (+35 more)

### Community 51 - "verify-packaged.mjs"
Cohesion: 0.25
Nodes (6): exe, exportDir, local, pdfFile, project, studyExport

### Community 52 - "DiscoverPage.tsx"
Cohesion: 0.18
Nodes (13): ancestors(), baseName(), DirState, errorText(), FilesPane(), FilesState, handledRequests, HEAVY_DIRS (+5 more)

### Community 53 - "ModelsPage.tsx"
Cohesion: 0.12
Nodes (30): canonicalFields(), clamp(), color(), FORMATS, gradient(), imageCrop(), imageFilters(), KEY_ALIASES (+22 more)

### Community 55 - "ipc-run.mjs"
Cohesion: 0.50
Nodes (3): calls, profile, project

### Community 56 - "preload/index.ts"
Cohesion: 0.50
Nodes (3): bridge, eventsAllowed, invokeAllowed

### Community 57 - "ArtifactPanel.tsx"
Cohesion: 0.22
Nodes (19): BOM, byPath(), countable(), snapshotChangeSet(), snapshotDiscardFile(), snapshotFileDiff(), WriteOptions, folder() (+11 more)

### Community 58 - "ChatPage.tsx"
Cohesion: 0.10
Nodes (39): blockElements(), cellValue(), chartFromCode(), chartTable(), createPptx(), createXlsx(), DOCUMENT_EXTENSIONS, DocumentOptions (+31 more)

### Community 63 - "cmdk"
Cohesion: 0.21
Nodes (25): escapeXml(), findArtboard(), artboardHtml(), artboardStyle(), artboardSvg(), boxStyle(), cssText(), designHtml() (+17 more)

### Community 64 - "electron"
Cohesion: 0.13
Nodes (35): calculate(), evaluationSteps(), measureOf(), prettyMeasure(), exactZero, formatExact(), isRational(), defaultContext() (+27 more)

### Community 65 - "electron-builder"
Cohesion: 0.13
Nodes (23): BookCard(), BookSearch(), ContextBar(), coverKey(), ensureCover(), errorText(), exportBook(), forgetCover() (+15 more)

### Community 66 - "electron-vite"
Cohesion: 0.05
Nodes (49): pdfAvailable(), AgentPromptInput, buildAgentPrompt(), compactionRequest(), agentNoun(), autoApproveAction(), chatTaskState(), hostOf() (+41 more)

### Community 67 - "@fontsource-variable/inter"
Cohesion: 0.12
Nodes (17): CalcOptions, CalcResult, CalculusError, AngleMode, MathError, DerivativeInput, flipOp(), holdsFor() (+9 more)

### Community 68 - "@fontsource-variable/source-serif-4"
Cohesion: 0.14
Nodes (43): approxRational(), asRational(), Exact, exactAdd(), exactDiv(), exactFromNumber(), exactInt(), exactInverse() (+35 more)

### Community 69 - "artifact-protocol.ts"
Cohesion: 0.15
Nodes (5): DllImport, EnumWindowsProc, Func, IntPtr, StringBuilder

### Community 70 - "@playwright/test"
Cohesion: 0.15
Nodes (32): point(), value(), blockType(), FIGURE_KINDS, figureKindOf(), isObject(), LIMITS, Loose (+24 more)

### Community 71 - "radix-ui"
Cohesion: 0.07
Nodes (62): addMemory(), initAutoMemory(), log, nothing(), parseExtraction(), pending, pickBackgroundModel(), runAutoMemory() (+54 more)

### Community 72 - "react"
Cohesion: 0.12
Nodes (10): ChatRequest, currentEntry, fake, FakeProvider, finished(), message(), Provider, Script (+2 more)

### Community 73 - "react-dom"
Cohesion: 0.17
Nodes (23): textSvg(), text(), dashArray(), Atom, escapeHtml(), labelText(), mathToPlain(), prepare() (+15 more)

### Community 74 - "streamdown"
Cohesion: 0.03
Nodes (124): INIT_PROMPT, AppCommand, AppInfo, BackgroundStatus, EVENT_CHANNELS, EventChannel, eventChannelFlags, Handler (+116 more)

### Community 75 - "@streamdown/code"
Cohesion: 0.13
Nodes (24): area(), arithmetic(), Draft, fractions(), fromSolution(), generateQuiz(), GENERATORS, hashSeed() (+16 more)

### Community 76 - "@streamdown/math"
Cohesion: 0.11
Nodes (15): AppShell(), ChangelogDialog(), SECTION_TONE, CodeSidebar(), SessionFilter, DownloadsButton(), TARGET_LABEL, SearchPalette() (+7 more)

### Community 77 - "@streamdown/mermaid"
Cohesion: 0.43
Nodes (7): useIpcSync(), speak(), speakReply(), speakWithSystemVoice(), stopSpeaking(), stripForSpeech(), useSpeechVoices()

### Community 78 - "sucrase"
Cohesion: 0.06
Nodes (58): installPdfRenderer(), installTaskNotifications(), log, setGradientRasterizer(), setPdfRenderer(), setSvgRasterizer(), ActiveGeneration, chat (+50 more)

### Community 79 - "tailwind-merge"
Cohesion: 0.10
Nodes (28): awayPosition(), buildDiagram(), BuiltDiagram, clipLine(), degreesOf(), directionOf(), FONT_SIZES, LABEL_OFFSETS (+20 more)

### Community 80 - "tailwindcss"
Cohesion: 0.09
Nodes (19): InputUnion, int, KEYBDINPUT, LowLevelProc, MOUSEINPUT, MSG, POINT, RECT (+11 more)

### Community 81 - "@tailwindcss/browser"
Cohesion: 0.12
Nodes (20): active, buildSideChatPrompt(), clipTranscript(), fitSideMessages(), FRIENDLY_ERRORS, log, parseSideChatRequest(), PENDING_RESULTS (+12 more)

### Community 82 - "@tanstack/react-query"
Cohesion: 0.14
Nodes (13): FollowUpChips(), SideChatEvent, SideChatMessage, ask(), ChatRequest, FakeProvider, msg(), Provider (+5 more)

### Community 83 - "@tanstack/react-router"
Cohesion: 0.18
Nodes (13): authUrlFor(), forgetOAuth(), lastAuthUrl, log, pending, clearOAuthState(), OAuthState, Row (+5 more)

### Community 85 - "@types/react"
Cohesion: 0.08
Nodes (40): log, blockText(), handleSampling(), messageContent(), deleteStoredConnector(), ensureOverride(), listStoredConnectors(), pluginOverrides() (+32 more)

### Community 86 - "typescript"
Cohesion: 0.09
Nodes (47): attachmentImage(), artboardPreview(), ensureSession(), exportDesign(), ExportTarget, fileSafe(), imageUrls(), rasterizeGradient() (+39 more)

### Community 88 - "@vitejs/plugin-react"
Cohesion: 0.08
Nodes (30): CHART_KINDS, ChartRenderOptions, clamp(), LAYOUT_NAMES, layoutContent, layoutElements(), layoutName, LAYOUTS (+22 more)

### Community 89 - "vitest"
Cohesion: 0.10
Nodes (19): LocalModel, buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), formatParamCount(), freePort(), Instance (+11 more)

### Community 90 - "zustand"
Cohesion: 0.19
Nodes (13): DesignCard(), DesignEditorPage(), DesignHeader(), DesignHomePage(), errorText(), exportDesign(), FORMAT_ICONS, IDEAS (+5 more)

### Community 94 - "agent-core.test.ts"
Cohesion: 0.13
Nodes (29): absoluteUrl(), htmlToText(), NAMED_ENTITIES, PageText, parseBraveHtml(), parseDuckDuckGoHtml(), parseSearxngJson(), SearchResult (+21 more)

### Community 95 - "Cellar roadmap"
Cohesion: 0.14
Nodes (14): Cellar roadmap, Known gaps and follow-ups from M4, M2 Cowork — original goals, M3 Code — goals, M4 Customize, Scheduled, Voice — delivered, M4 Customize, Scheduled, Voice — goals, M5 Design — goals, M7 Inline capabilities — delivered (+6 more)

### Community 96 - "services/models.ts"
Cohesion: 0.18
Nodes (9): report(), BrowserPanel(), hostOf(), queryClient, computerPill, quick, ComputerPill(), QuickEntry() (+1 more)

### Community 97 - "cowork-smoke.mjs"
Cohesion: 0.13
Nodes (13): approvals, chips, elapsed, files, folder, logs, outDir, problems (+5 more)

### Community 98 - "tools/types.ts"
Cohesion: 0.11
Nodes (23): DAYS, describeCron(), nextFire(), pad(), parseCron(), previewCron(), configure(), escapeXml() (+15 more)

### Community 100 - "history.ts"
Cohesion: 0.14
Nodes (12): address, approvals, elapsed, logs, outDir, problems, profile, project (+4 more)

### Community 101 - "Workspace"
Cohesion: 0.07
Nodes (42): callTool, moduleId, normalizeCallArgs(), ANSI, ESC, killTree(), runCommand, runShell() (+34 more)

### Community 102 - "orchestrator.ts"
Cohesion: 0.13
Nodes (19): Rational, ALIASES, clean(), Equation, EvalContext, evaluateNode(), expandFractions(), factorial() (+11 more)

### Community 103 - "util.ts"
Cohesion: 0.19
Nodes (17): addArtboard(), AlignEdge, alignSelection(), copySelection(), deleteArtboard(), deleteSelection(), duplicateSelection(), editor() (+9 more)

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
Cohesion: 0.12
Nodes (15): answer(), blank, bookFile, chat, exported, ipc(), logs, option (+7 more)

### Community 108 - "monaco.ts"
Cohesion: 0.26
Nodes (9): alpha(), applyTheme(), cssColor(), EXTENSION_LANGUAGES, FILENAME_LANGUAGES, load(), loadMonaco(), registerJson() (+1 more)

### Community 109 - "SideChat.tsx"
Cohesion: 0.13
Nodes (3): BrowserService, getWindow(), normalizeUrl()

### Community 110 - "downloadFile"
Cohesion: 0.16
Nodes (13): ChecksumError, downloadFile(), DownloadOptions, fileSize(), hashExisting(), findPiper(), PIPER_VOICES, piperDir() (+5 more)

### Community 111 - "design/store.ts"
Cohesion: 0.13
Nodes (13): Composer(), ComposerProps, NOT_SAVED, updateMemoryFromChat(), ModelPicker(), ActiveToolChips(), APPROVAL_MODES, Switch (+5 more)

### Community 112 - "🎨 AI Design Engine: Concept & Specification Document"
Cohesion: 0.29
Nodes (6): 🚀 1. Overview: Bridging the Gap Between Text and Visual Design, 🧱 2. The Limitations of Current Text-Based AI, ✨ 3. The Vision: Desired Capabilities (The Next-Generation AI), 🛠️ 4. Technical Feature Checklist (The Design Specification), 🧠 5. AI Self-Assessment and Self-Identified Issues, 🎨 AI Design Engine: Concept & Specification Document

### Community 113 - "CodeModeMenu.tsx"
Cohesion: 0.52
Nodes (6): CODE_MODE_OPTIONS, codeModeKey(), CodeModeMenu(), CodeModeValue, nextCodeMode(), Option

### Community 114 - "code-changes.test.ts"
Cohesion: 0.11
Nodes (19): clsx, cmdk, @fontsource-variable/source-serif-4, monaco-editor, devDependencies, clsx, cmdk, @fontsource-variable/source-serif-4 (+11 more)

### Community 115 - "stores/code.ts"
Cohesion: 0.33
Nodes (5): CodePane, CodeUiState, EditorRequest, PreviewRequest, useCodeUi

### Community 116 - "monaco-editor"
Cohesion: 0.15
Nodes (11): describeModules(), MODULE_ACTIONS, ModuleAction, ModuleId, moduleReadOnly(), READ_ONLY_ACTIONS, RESERVED_ACTIONS, asString() (+3 more)

### Community 118 - "TerminalPane.tsx"
Cohesion: 0.21
Nodes (13): detectReasoningStyle(), EMBEDDING_ARCHES, FILE_TYPE_NAMES, isEmbeddingModel(), num(), numOrArray(), ParsedShard, slimMetadata() (+5 more)

### Community 119 - "@types/react-dom"
Cohesion: 0.09
Nodes (22): session(), check(), conversationIdSchema, CreateTerminalOptions, dataSchema, envValue(), findOnPath(), idSchema (+14 more)

### Community 120 - "@xterm/addon-fit"
Cohesion: 0.17
Nodes (12): scripts, build, build:win, dev, preview, runtime:artifacts, test, test:e2e (+4 more)

### Community 121 - "@xterm/addon-web-links"
Cohesion: 0.20
Nodes (15): now(), HighlightView(), hitTest(), ItemProps, MarkView(), NotePin(), OverlayProps, PageOverlay() (+7 more)

### Community 122 - "@xterm/xterm"
Cohesion: 0.19
Nodes (7): fetchWithTimeout(), lmStudioInstalled(), LmStudioProvider, DuckDuckGoImage, fetchVqd(), ImageResult, searchImage()

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
Cohesion: 0.17
Nodes (24): adaptiveSimpson(), add(), antiderivativePolynomial(), asPolynomial(), bareTermOf(), call(), collectPolynomialTerms(), definiteIntegral() (+16 more)

### Community 129 - "commands.ts"
Cohesion: 0.26
Nodes (11): DARK_ANSI, LIGHT_ANSI, message(), openLink(), previewUrl(), readTheme(), SessionTerminals(), TerminalView() (+3 more)

### Community 130 - "DownloadManager"
Cohesion: 0.08
Nodes (53): quickEntryShortcutActive(), connectors, builtInCommands(), changed(), commandSlug(), customCommands(), deleteCommand(), expandCommand() (+45 more)

### Community 131 - "m4-handlers.ts"
Cohesion: 0.20
Nodes (8): DesignLayoutState, DesignTool, EditorState, selectedArtboard(), selectedElements(), Selection, useDesignEditor, useDesignLayout

### Community 132 - "tasks.ts"
Cohesion: 0.18
Nodes (9): describeTool(), DiffLine, DOCUMENT_TOOLS, Icon, IDEAS, PERMISSION_MODES, pointTarget(), short() (+1 more)

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
Cohesion: 0.05
Nodes (62): attachCloseToTray(), backgroundActive(), createMain(), getMain(), hideQuickEntry(), iconPath(), installBackground(), isQuitting() (+54 more)

### Community 137 - "quants.ts"
Cohesion: 0.15
Nodes (10): ArtboardThumbnail(), ArtboardView(), css(), ElementView, ElementViewProps, Present(), SLIDE_OFFSET, transitionStyle() (+2 more)

### Community 139 - "design/export.ts"
Cohesion: 0.15
Nodes (31): baseBlob(), buildDiff(), byPath(), deleteNewFile(), existsInBase(), fileHasConflictMarkers(), gitChangeSet(), gitDiscardFile() (+23 more)

### Community 140 - "streams.ts"
Cohesion: 0.07
Nodes (37): BINARY_EXTENSIONS, count(), describeWrite(), editFileTool, globTool, grepTool, IMAGE_EXTENSIONS, isBinary() (+29 more)

### Community 141 - "dictation.ts"
Cohesion: 0.29
Nodes (5): DARK_PALETTE, LIGHT_PALETTE, readVizTheme(), useVizTheme(), VizTheme

### Community 142 - "ArtifactPanel"
Cohesion: 0.15
Nodes (21): angleArc(), buildFigure(), BuiltFigure, centroid(), completeRightTriangle(), DEFAULT_LABELS, figureLabel(), format() (+13 more)

### Community 144 - "electron-vite"
Cohesion: 0.21
Nodes (13): ChartElement, ChartSeries, DesignExportFormat, ElementBase, ImageElement, ImageFilters, LineElement, ShapeElement (+5 more)

### Community 145 - "package.json"
Cohesion: 0.22
Nodes (8): author, description, license, main, name, private, productName, version

### Community 146 - "code-session.test.ts"
Cohesion: 0.16
Nodes (16): diagramStepCount(), headsSvg(), arrowHead(), ellipsePoints(), LINE_STYLES, NAMED_COLORS, polylineD(), resolveColor() (+8 more)

### Community 147 - "images.ts"
Cohesion: 0.20
Nodes (11): completionKindMap(), DocInfo, docs, documentUri(), LSP_LANGUAGES, parseDocumentUri(), registerLspProviders(), SEVERITY_MAP() (+3 more)

### Community 148 - "sessions.ts"
Cohesion: 0.15
Nodes (8): ago(), CHART_COLORS, dayLabel(), formatDuration(), Heatmap(), UsageModels(), UsageOverview(), WEEKDAYS

### Community 149 - "quants.ts"
Cohesion: 0.14
Nodes (24): buildTaskHistory(), callImages(), freshScreens(), groupRounds(), HistoryOptions, historyTokens(), latestCompaction(), resultForModel() (+16 more)

### Community 150 - "terminal.test.ts"
Cohesion: 0.11
Nodes (18): 1. Backend: `src/main/plugins/marketplace.ts`, 2. Types: `src/shared/types/customize.ts`, 3. IPC Handlers: `src/main/ipc/m4-handlers.ts`, 4. UI: `src/renderer/src/pages/PluginsPage.tsx`, 5. Integration: Customize Page, Architecture Overview, Files created:, Files modified: (+10 more)

### Community 151 - "AppShell.tsx"
Cohesion: 0.15
Nodes (8): project, lastUserText(), MockRequest, MockServer, sleep(), startMockServer(), VIZ_CDN_REPLY, VIZ_REPLY

### Community 152 - "snapshots.ts"
Cohesion: 0.14
Nodes (17): clampSize(), COLOR_TOKENS, FontCategory, FORMAT_DEFAULTS, gradientStops(), hex6(), luminance(), mixColors() (+9 more)

### Community 153 - "@tanstack/react-query"
Cohesion: 0.24
Nodes (11): drawAnnotations(), renderPageCanvas(), renderPagePng(), wrapLines(), PDFViewerInstance, scaleValue(), SelectionInfo, selectionOnPage() (+3 more)

### Community 154 - "@vitejs/plugin-react"
Cohesion: 0.18
Nodes (19): DIAGRAM_LIMITS, isObject(), KIND_WORDS, kindOf(), Loose, normalizeDiagram(), normalizeElement(), pick() (+11 more)

### Community 155 - "snapshots.ts"
Cohesion: 0.13
Nodes (5): callbackPath(), CellarOAuthProvider, ensureServer(), loadOAuthState(), waitForCallback()

### Community 156 - "LmStudioProvider"
Cohesion: 0.20
Nodes (4): CacheRequest, Found, List, Rectangle

### Community 157 - "math-smoke.mjs"
Cohesion: 0.17
Nodes (9): exportDir, logs, outDir, problems, profile, project, [
  providerId = 'ollama',
  modelId = 'qwen3.5:9b',
  prompt =
    'Teach me the Pythagorean theorem: the rule, a drawing of a right triangle with legs 3 and 4, a worked example finding the hypotenuse, and one where a leg is missing and the answer is a root. Then give me 4 practice questions.',
  shot = 'math',
], quiz (+1 more)

### Community 158 - "croner"
Cohesion: 0.18
Nodes (10): BookScope, DEFAULT_SCOPE, keep(), PicturesMode, StudyEditorState, StudyLayoutState, StudyTool, StudyZoom (+2 more)

### Community 159 - "charts.ts"
Cohesion: 0.15
Nodes (21): ThemePanel(), chartSvg(), clamp(), formatValue(), niceScale(), normalizeChart(), r1(), truncate() (+13 more)

### Community 160 - "math/actions.ts"
Cohesion: 0.16
Nodes (16): PREVIEW_SCHEME_PRIVILEGES, ARTIFACT_CSP, escapeScript(), handleArtifactProtocol(), registerArtifactScheme(), renderArtifactDocument(), RUNTIME_FILES, VIZ_SCHEME_PRIVILEGES (+8 more)

### Community 161 - "MathPage.tsx"
Cohesion: 0.29
Nodes (11): BoardCard(), errorText(), exportBoard(), IDEAS, isEditableTarget(), MathBoardPage(), MathHeader(), MathHomePage() (+3 more)

### Community 162 - "downloadFile"
Cohesion: 0.28
Nodes (6): CellarBinaryData, loadPdfjs(), open, openBookDocument(), Pdfjs, ViewerModule

### Community 165 - "browser-sessions.test.ts"
Cohesion: 0.50
Nodes (3): cookies, cookieStore, FakeCookie

### Community 166 - "monaco-editor"
Cohesion: 0.16
Nodes (20): exportBoard(), ExportTarget, fileSafe(), angleMode, paper, registerMathHandlers(), topic, BoardConflictError (+12 more)

### Community 167 - "network.test.ts"
Cohesion: 0.17
Nodes (13): backendsFromFiles(), bestRuntime(), exec, findServerDir(), idForDir(), log, parseDevicesOutput(), parseReleaseAssets() (+5 more)

### Community 168 - "react"
Cohesion: 0.22
Nodes (14): GeneratedQuiz, BlockBase, DerivationBlock, DiagramBlock, FigureBlock, FormulaBlock, MathExportFormat, PlotBlock (+6 more)

### Community 169 - "electron-vite"
Cohesion: 0.07
Nodes (48): CATEGORY_KEYWORDS, computeRelevanceScore(), computeTopicVectorScores(), computeVectorSimilarity(), getTopicById(), listAllExplicitMemories(), listAllMemoryTopics(), log (+40 more)

### Community 170 - "@tailwindcss/browser"
Cohesion: 0.13
Nodes (14): 1. `src/shared/types/chat.ts` — Added `ContextInfo` interface + reasoningMs, 2. `src/shared/ipc-contract.ts` — Added IPC channel definition, 3. `src/main/customize/commands.ts` — Registered `/context` as built-in command, 4. `src/main/chat/orchestrator.ts` — Added `contextInfo()` method (~100 lines), 5. `src/main/ipc/handlers.ts` — Registered IPC handler, 6. `src/renderer/src/components/chat/ContextInfoPanel.tsx` — Visual component (137 lines, UPDATED), 7. `src/renderer/src/components/composer/Composer.tsx` — Wired up `/context` handling, Changelog of changes from initial version (+6 more)

### Community 172 - "dictation.ts"
Cohesion: 0.24
Nodes (8): DictationState, join(), toSpeechSamples(), useDictation(), FONTS_QUERY_KEY, useCustomFonts(), useFontsQuery(), cleanIpcError()

### Community 173 - "lucide-react"
Cohesion: 0.24
Nodes (15): backgroundAt(), checkArtboard(), intersects(), short(), estimateLines(), estimateTextHeight(), fitFontSize(), glyphWidth() (+7 more)

### Community 176 - "radix-ui"
Cohesion: 0.21
Nodes (11): ChangesPane(), Counts(), errorText(), FileRow(), FileRowProps, num(), splitPath(), STATUS (+3 more)

### Community 177 - "@playwright/test"
Cohesion: 0.18
Nodes (12): describeLocation(), FoundGroup, inspectLocalGguf(), localModelId(), LocalModelIndex, log, pickMmproj(), quantLabelFromName() (+4 more)

### Community 178 - "streamdown"
Cohesion: 0.40
Nodes (3): CHANGELOG, ChangelogEntry, ChangelogSection

### Community 179 - "tailwind-merge"
Cohesion: 0.26
Nodes (8): pptxgenjs, pptxgenjs, artboardsToPptx(), CHART_TYPES, hyperlinkFor(), PptxAssets, textRuns(), transparency()

### Community 181 - "@streamdown/mermaid"
Cohesion: 0.14
Nodes (12): card, errors, last, logs, option, outDir, poll, profile (+4 more)

### Community 183 - "vscode-languageserver-protocol"
Cohesion: 0.32
Nodes (11): createAppWindow(), createMainWindow(), guardNavigation(), isAppUrl(), loadRenderer(), loadState(), overlayWindows, saveState() (+3 more)

### Community 184 - "@xterm/addon-fit"
Cohesion: 0.67
Nodes (3): Known gaps and follow-ups from M9, M9 Study — delivered (2026-09-23, v8.0.0), Technical notes learned in M9

### Community 185 - "@xterm/addon-web-links"
Cohesion: 0.21
Nodes (11): displayAddress(), externalLink(), handledRequests, isPdf(), Preview(), previewPath(), PreviewState, run() (+3 more)

### Community 189 - "Next improvements"
Cohesion: 0.17
Nodes (11): 1. Math: read a photo of handwritten work into a board — small, high value ✅ shipped, 2. Cowork/Code: `run_command` cannot run anything long-lived — medium ✅ shipped, 3. `read_file` can't read legacy Office formats (.doc/.xls/.ppt) — medium ✅ shipped, differently, 4. Design: rich text spans and growing text boxes — larger ✅ shipped, 5. Math solvers: nonlinear systems and geometry beyond triangles — larger, niche ✅ shipped, Larger, still genuinely open, Next improvements, Not code work (deprioritized here) (+3 more)

### Community 190 - "zustand"
Cohesion: 0.22
Nodes (3): ComputerOverlay, displayFor(), physicalRect()

### Community 191 - "artboardsToPptx"
Cohesion: 0.22
Nodes (12): computeQuantFit(), fitCache, fitInflight, fitWaiters, hfJson(), quantFit(), repoCache, RepoInfo (+4 more)

### Community 192 - "tools/background.ts"
Cohesion: 0.21
Nodes (10): ANSI, BackgroundCommand, BackgroundCommandStatus, commands, disposeBackgroundCommands(), ESC, evictOldEnded(), killTree() (+2 more)

### Community 194 - "command.ts"
Cohesion: 0.24
Nodes (9): closeLsp(), CodeEditor(), CodeEditorProps, DiffEditor(), DiffEditorProps, Doc, setModelText(), TextModel (+1 more)

### Community 195 - ".content"
Cohesion: 0.36
Nodes (10): basename(), GroupedRepoFiles, groupQuantFiles(), isAuxiliaryGguf(), isMmprojFile(), parentName(), preferredMmproj(), quantBits() (+2 more)

### Community 196 - ".load"
Cohesion: 0.29
Nodes (4): CoworkExtras(), folderName(), HomePage(), SUGGESTIONS

### Community 197 - "design.test.ts"
Cohesion: 0.27
Nodes (9): EMPTY, historyOf(), LiveReply, newRequestId(), requestMessages(), settle(), SideChat(), SideEntry (+1 more)

### Community 200 - "memory.test.ts"
Cohesion: 0.40
Nodes (3): defaultPolicy(), toolPolicy(), hasOAuthTokens()

### Community 202 - "Parser"
Cohesion: 0.29
Nodes (6): canonicalFunction(), CONSTANTS, parseEquation(), parseInequality(), Parser, tokenize()

### Community 204 - "ArtifactPanel"
Cohesion: 0.83
Nodes (3): ArtifactPanel(), fence(), IFRAME_TYPES

### Community 205 - "shared/artifacts.ts"
Cohesion: 0.31
Nodes (9): artifactTypeFor(), deriveArtifactTitle(), LANGUAGE_TYPES, parseArtifacts(), ParsedArtifact, parseInfoString(), slugify(), TYPE_TITLES (+1 more)

### Community 206 - "Cellar"
Cohesion: 0.25
Nodes (6): Architecture, Cellar, Development, Features, Getting started, Where data lives

### Community 208 - "Cellar — Project Memory"
Cohesion: 0.33
Nodes (5): Cellar — Project Memory, Code Style & Conventions, Folder Layout, Install, Build, Run, Test, Things to Remember

### Community 209 - "M8.1 Undo in Cowork, git beyond commit, and memory on demand (v7.4.0)"
Cohesion: 0.33
Nodes (6): M8.1 Undo in Cowork, git beyond commit, and memory on demand (v7.4.0), Pushing, pull requests and conflict resolution, Technical notes learned in M8, Technical notes learned in M8.1, Undo for Cowork file changes, `/update-memory`

### Community 210 - "M8 Tier 3 wishlist — delivered"
Cohesion: 0.40
Nodes (5): 3.1 Built-in Chromium browser (`src/main/browser/`), 3.2 `call(module, task)` (`src/main/modules/`), 3.3 Self-scheduling (`create_reminder`), 3.4 Voice: streaming transcription and spoken replies, M8 Tier 3 wishlist — delivered

### Community 212 - "@streamdown/math"
Cohesion: 0.36
Nodes (8): estimateLoad(), detectHardware(), exec, log, nvidiaGpus(), otherGpus(), parseNvidiaSmi(), vramBudgetBytes()

### Community 213 - "M8.2 Playground (v7.6.0)"
Cohesion: 0.67
Nodes (3): Following up with one model (v7.7.0), M8.2 Playground (v7.6.0), Technical notes learned in M8.2

### Community 214 - "M5 Design — delivered"
Cohesion: 0.67
Nodes (3): Known gaps and follow-ups from M5, M5.1 Canvas polish, real export fidelity, and a model that can see its own canvas, M5 Design — delivered

### Community 215 - "M6 Math — delivered"
Cohesion: 0.67
Nodes (3): Known gaps and follow-ups from M6, M6 follow-up: drawing on the board step by step (2026-09-22), M6 Math — delivered

### Community 216 - "services/artifacts.ts"
Cohesion: 0.32
Nodes (4): recommendedWhisperVariant(), encodeWav(), findSilenceBoundary(), SilenceOptions

### Community 219 - "M4 Customize, Scheduled, Voice — delivered"
Cohesion: 0.38
Nodes (6): EstimateInput, estimateMemory(), isSlidingLayer(), KV_BYTES_PER_ELEMENT, kvBytesPerLayer(), MemoryBudget

### Community 222 - "viz-export.ts"
Cohesion: 0.48
Nodes (6): base64Of(), copyPng(), loadImage(), paint(), pngOnBackground(), svgToPng()

### Community 230 - "usePacedText"
Cohesion: 0.67
Nodes (3): nextWordEnd(), usePacedText(), frame()

### Community 231 - "helper.cs"
Cohesion: 0.50
Nodes (3): CellarComputer, Exception, HelperError

### Community 232 - "M10 Computer use — built (2026-09-23, not released yet)"
Cohesion: 0.67
Nodes (3): Known gaps and follow-ups from M10, M10 Computer use — built (2026-09-23, not released yet), Technical notes learned in M10

## Knowledge Gaps
- **1124 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+1119 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **63 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `value()` connect `@playwright/test` to `queries.ts`, `openai-compat.ts`, `orchestrator.ts`, `ArtifactPanel`, `fetchWithTimeout`, `SettingsPage.tsx`, `types/models.ts`, `@vitejs/plugin-react`, `OpenAIServerProvider`, `charts.ts`, `MathPage.tsx`, `CellarBridge`, `DiscoverPage.tsx`, `ModelsPage.tsx`, `PreviewPane.tsx`, `electron`, `electron-builder`, `@fontsource-variable/source-serif-4`, `radix-ui`, `tailwind-merge`, `@vitejs/plugin-react`, `Workspace`, `orchestrator.ts`, `SideChat.tsx`, `TerminalPane.tsx`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `errorMessage()` connect `.resolve` to `hf-api.ts`, `DownloadManager`, `ChatOrchestrator`, `engine.ts`, `orchestrator.ts`, `fetchWithTimeout`, `types/models.ts`, `OpenAIServerProvider`, `ProviderRegistry`, `network.test.ts`, `.update`, `electron-vite`, `@fontsource-variable/source-serif-4`, `@playwright/test`, `PreviewPane.tsx`, `zustand`, `artboardsToPptx`, `quants.ts`, `electron-vite`, `radix-ui`, `sucrase`, `@tailwindcss/browser`, `@types/react`, `tools/types.ts`, `SideChat.tsx`, `downloadFile`, `monaco-editor`, `@types/react-dom`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `run()` connect `radix-ui` to `math/actions.ts`, `Sidebar.tsx`, `tools/types.ts`, `engine.ts`, `monaco-editor`, `ModelRef`, `.resolve`, `electron-vite`, `network.test.ts`, `orchestrator.ts`, `sucrase`, `@playwright/test`, `@tanstack/react-router`, `@types/react`, `typescript`, `types/models.ts`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `paths()` (e.g. with `registerDesignHandlers()` and `registerStudyHandlers()`) actually correct?**
  _`paths()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _1124 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `hf-api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14022988505747128 - nodes in this community are weakly interconnected._
- **Should `LlamaCppProvider` be split into smaller, more focused modules?**
  _Cohesion score 0.0960591133004926 - nodes in this community are weakly interconnected._