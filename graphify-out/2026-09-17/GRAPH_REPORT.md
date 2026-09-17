# Graph Report - Cellar  (2026-09-17)

## Corpus Check
- 298 files · ~315,977 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3620 nodes · 8821 edges · 180 communities (150 shown, 30 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 180 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ab8d3c9a`
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
- types/math.ts
- @fontsource-variable/source-serif-4
- @streamdown/mermaid
- vscode-languageserver-protocol
- @xterm/addon-fit
- DownloadManager
- artifact-protocol.ts
- models.test.ts
- quants.ts
- Renderer
- viz-export.ts
- @fontsource-variable/inter

## God Nodes (most connected - your core abstractions)
1. `IpcInvokeMap` - 92 edges
2. `paths()` - 74 edges
3. `run()` - 73 edges
4. `errorMessage()` - 71 edges
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
- `extractDocumentText()` --references--> `jszip`  [EXTRACTED]
  src/main/agent/documents.ts → package.json
- `markdownToHtmlPage()` --references--> `marked`  [EXTRACTED]
  src/main/agent/documents.ts → package.json

## Import Cycles
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/call.ts -> src/main/modules/registry.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/reminder.ts -> src/main/scheduled/scheduler.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`

## Communities (180 total, 30 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.14
Nodes (20): ACTIVE, downloads, log, Row, computeQuantFit(), fitCache, fitInflight, fitWaiters (+12 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.10
Nodes (19): LocalModel, buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), formatParamCount(), freePort(), Instance (+11 more)

### Community 2 - "queries.ts"
Cohesion: 0.05
Nodes (48): escapeRegex(), globFiles(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry, WalkOptions (+40 more)

### Community 3 - "ChatOrchestrator"
Cohesion: 0.08
Nodes (8): TaskRunner, chat, ChatOrchestrator, ChatStore, prepareDesignSession(), errorMessage(), newId(), prepareMathSession()

### Community 4 - "engine.ts"
Cohesion: 0.06
Nodes (54): addMemory(), changed(), clean(), clearMemories(), deleteMemory(), Row, toItem(), updateMemory() (+46 more)

### Community 5 - "run"
Cohesion: 0.13
Nodes (24): ActiveGeneration, log, buildSystemPrompt(), chatToolGuidance(), cleanTitle(), fallbackTitle(), SystemPromptInput, angleMode (+16 more)

### Community 6 - "scripts"
Cohesion: 0.06
Nodes (35): croner, docx, electron-updater, exceljs, extract-zip, @huggingface/gguf, jszip, marked (+27 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.14
Nodes (18): measureSvg(), sizedSvg(), ParsedImageTag, parseImageTags(), withImageTags(), branchPath(), childrenOf(), latestLeaf() (+10 more)

### Community 8 - "openai-compat.ts"
Cohesion: 0.14
Nodes (22): LmsDownloadStatus, LmsModel, authHeaders(), baseEntry(), ChatChunk, fetchEmbeddings(), fetchOpenAIModels(), guessCapabilitiesFromName() (+14 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (29): electron.vite.config.ts, electron-vite/node, node, playwright.config.ts, scripts/**/*.ts, src/main/**/*, src/preload/**/*, tests/**/* (+21 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, src/artifact-runtime/**/*, src/preload/api.d.ts, src/renderer/src/**/*, src/renderer/src/**/*.tsx, vite/client, compilerOptions (+19 more)

### Community 11 - "orchestrator.ts"
Cohesion: 0.06
Nodes (23): check(), OutputBuffer, registerTerminalHandlers(), releaseExitedPty(), TerminalManager, DARK_ANSI, LIGHT_ANSI, message() (+15 more)

### Community 12 - "main/index.ts"
Cohesion: 0.24
Nodes (14): formatSchema, registerDesignHandlers(), copyDesign(), createDesign(), DesignConflictError, designForConversation(), DesignRow, getDesign() (+6 more)

### Community 13 - "DownloadManager"
Cohesion: 0.11
Nodes (12): isWholeGroup(), ChartSection(), chartToCsv(), csvToChart(), ElementPanel(), Layers(), patch(), Properties() (+4 more)

### Community 14 - "handlers.ts"
Cohesion: 0.12
Nodes (31): registerBrowserHandlers(), registerCodeHandlers(), registerPreviewHandlers(), BUILTINS, deleteProviderConfig(), getProviderConfig(), listProviderConfigs(), Row (+23 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.04
Nodes (73): AppCommand, AppInfo, BackgroundStatus, EVENT_CHANNELS, EventChannel, eventChannelFlags, Handler, INVOKE_CHANNELS (+65 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.06
Nodes (49): AgentPart, ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, ConversationKind, ReasoningPart, TaskFile (+41 more)

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
Cohesion: 0.10
Nodes (14): ChatPage(), DiscoverPage(), PUBLISHERS, ArtifactsPage(), RecentsPage(), ModelsPage(), SOURCE_LABEL, ProjectDetailPage() (+6 more)

### Community 21 - "LoadSettingsDialog.tsx"
Cohesion: 0.15
Nodes (10): CapabilityIcons(), FIT_COPY, FitBadge(), MemoryBars(), PROVIDER_LABEL, providerStateDot(), ProviderStatusDot(), CONTEXT_STEPS (+2 more)

### Community 22 - "stream-parsers.ts"
Cohesion: 0.13
Nodes (19): addElement(), expandToGroups(), imagesFromFiles(), naturalSize(), placeImage(), AddArtboardButton(), Box, boxFor() (+11 more)

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.09
Nodes (7): ACCENTS, LANGUAGES, SECTIONS, SettingsPage(), SHORTCUTS, VARIANT_LABEL, WHISPER_BUILDS

### Community 24 - "types/models.ts"
Cohesion: 0.13
Nodes (23): CalcOptions, CalcResult, approxRational(), isRational(), AngleMode, checkPythagoras(), DerivativeInput, exactOf() (+15 more)

### Community 25 - "provider-configs.ts"
Cohesion: 0.07
Nodes (24): browseBack, browseClearSession, browseClick, browseElements, browseFill, browseFindLink, browseForward, browseLoginStatus (+16 more)

### Community 26 - "hub.ts"
Cohesion: 0.08
Nodes (27): DownloadFileState, DownloadJob, DownloadStatus, DownloadTarget, HfFile, HfModelSummary, HfRepoDetail, HfSearchQuery (+19 more)

### Community 27 - ".doScan"
Cohesion: 0.18
Nodes (12): describeLocation(), FoundGroup, inspectLocalGguf(), localModelId(), LocalModelIndex, log, pickMmproj(), quantLabelFromName() (+4 more)

### Community 28 - "LmStudioProvider"
Cohesion: 0.16
Nodes (17): effectiveThinking(), isChatCapable(), thinkingLabel(), thinkingOptions(), useAppCommands(), useBrowserReveal(), useSelectedModel(), useThemeSync() (+9 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.10
Nodes (35): exists(), inside(), Workspace, listDirectory(), writeWorkspaceFile(), codeSession(), CodeSessionContext, BASE_HEADERS (+27 more)

### Community 30 - "OpenAIServerProvider"
Cohesion: 0.21
Nodes (12): newToolCallId(), asObject(), CallSplitPart, describeType(), escapeControlCharsInStrings(), ParsedTextCall, parseLooseJson(), parseTextToolCall() (+4 more)

### Community 31 - "MemoryChatStore"
Cohesion: 0.06
Nodes (81): chatTaskState(), quickEntryShortcutActive(), builtInCommands(), changed(), commandSlug(), customCommands(), deleteCommand(), expandCommand() (+73 more)

### Community 32 - "ProviderRegistry"
Cohesion: 0.13
Nodes (3): ProviderRegistry, withTimeout(), Provider

### Community 33 - "Sidebar.tsx"
Cohesion: 0.16
Nodes (30): checkJavaScript(), checkJsonText(), checkPowerShell(), checkPyright(), checkPython(), checkRuff(), checkTypeScriptSyntax(), findPython() (+22 more)

### Community 34 - "Provider"
Cohesion: 0.12
Nodes (32): changed(), contentSchema, conversationIdSchema, snapshotDiscardFile(), baseBlob(), byPath(), commitAll(), deleteNewFile() (+24 more)

### Community 35 - "form.tsx"
Cohesion: 0.20
Nodes (3): Input, SelectOption, Textarea

### Community 36 - "devDependencies"
Cohesion: 0.06
Nodes (35): cmdk, electron, electron-builder, electron-vite, lucide-react, monaco-editor, devDependencies, cmdk (+27 more)

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
Cohesion: 0.17
Nodes (4): ConnectorManager, Live, signatureOf(), closeOAuthServer()

### Community 42 - "window.ts"
Cohesion: 0.07
Nodes (32): appRoot, bundled(), configure(), detectLanguage(), fromLspRange(), fromUri(), LANGUAGE_IDS, LanguageServer (+24 more)

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
Cohesion: 0.08
Nodes (31): ChangesPane(), Counts(), errorText(), FileRow(), FileRowProps, num(), splitPath(), STATUS (+23 more)

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
Cohesion: 0.19
Nodes (12): ensureOverride(), listStoredConnectors(), pluginOverrides(), record(), Row, saveStoredConnector(), sealRecord(), setStoredEnabled() (+4 more)

### Community 58 - "ChatPage.tsx"
Cohesion: 0.10
Nodes (37): blockElements(), cellValue(), chartFromCode(), chartTable(), createPptx(), createXlsx(), DOCUMENT_EXTENSIONS, DocumentOptions (+29 more)

### Community 63 - "cmdk"
Cohesion: 0.25
Nodes (22): escapeXml(), artboardHtml(), artboardStyle(), artboardSvg(), boxStyle(), cssText(), designHtml(), elementHtml() (+14 more)

### Community 64 - "electron"
Cohesion: 0.16
Nodes (36): asRational(), Exact, exactAdd(), exactDiv(), exactFromNumber(), exactInt(), exactInverse(), exactIsZero() (+28 more)

### Community 65 - "electron-builder"
Cohesion: 0.18
Nodes (9): defaultPolicy(), log, renderToolResult(), toolPolicy(), toolResultImages(), withTimeout(), authUrlFor(), hasOAuthTokens() (+1 more)

### Community 66 - "electron-vite"
Cohesion: 0.08
Nodes (36): pdfAvailable(), AgentPromptInput, buildAgentPrompt(), compactionRequest(), agentNoun(), hostOf(), joinReasoning(), joinText() (+28 more)

### Community 67 - "@fontsource-variable/inter"
Cohesion: 0.08
Nodes (20): webFetch, webSearch, buildDesignPrompt(), DesignPromptInput, contentSchema, createArtboardTool, deleteArtboardTool, DESIGN_TOOLS (+12 more)

### Community 68 - "@fontsource-variable/source-serif-4"
Cohesion: 0.13
Nodes (28): branchExists(), branchSlug(), copyWorktreeIncludes(), createWorktree(), currentBranch(), findMemoryFile(), git(), gitAvailable() (+20 more)

### Community 69 - "lucide-react"
Cohesion: 0.14
Nodes (18): callTool, moduleId, normalizeCallArgs(), describeModules(), MODULE_ACTIONS, MODULE_IDS, ModuleAction, moduleReadOnly() (+10 more)

### Community 70 - "@playwright/test"
Cohesion: 0.16
Nodes (28): blockType(), boardOutline(), describeBlock(), FIGURE_KINDS, figureKindOf(), isObject(), LIMITS, Loose (+20 more)

### Community 71 - "radix-ui"
Cohesion: 0.21
Nodes (18): exactZero, defaultContext(), Node, parseEquation(), variablesOf(), buildPlot(), BuiltPlot, niceStep() (+10 more)

### Community 72 - "react"
Cohesion: 0.12
Nodes (10): ChatRequest, currentEntry, fake, FakeProvider, finished(), message(), Provider, Script (+2 more)

### Community 73 - "react-dom"
Cohesion: 0.11
Nodes (38): calculate(), evaluationSteps(), measureOf(), prettyMeasure(), formatExact(), Rational, ALIASES, canonicalFunction() (+30 more)

### Community 74 - "streamdown"
Cohesion: 0.20
Nodes (18): Atom, escapeHtml(), mathToPlain(), prepare(), renderMath(), superscript(), SUPERSCRIPT_DIGITS, SYMBOLS (+10 more)

### Community 75 - "@streamdown/code"
Cohesion: 0.12
Nodes (25): area(), arithmetic(), Draft, fractions(), fromSolution(), generateQuiz(), GENERATORS, hashSeed() (+17 more)

### Community 76 - "@streamdown/math"
Cohesion: 0.12
Nodes (13): AppShell(), CodeSidebar(), SessionFilter, DownloadsButton(), TARGET_LABEL, SearchPalette(), Icon, NavItem() (+5 more)

### Community 77 - "@streamdown/mermaid"
Cohesion: 0.24
Nodes (9): useIpcSync(), speak(), speakReply(), speakWithSystemVoice(), stopSpeaking(), stripForSpeech(), pending, StreamsState (+1 more)

### Community 78 - "sucrase"
Cohesion: 0.15
Nodes (19): ALL_VARIANTS, cleanTranscript(), CLI_NAMES, fetchReleases(), findCli(), installing, log, modelsDir() (+11 more)

### Community 80 - "tailwindcss"
Cohesion: 0.31
Nodes (5): clamp(), defaults(), SettingsService, uniqueStrings(), useSpeechVoices()

### Community 81 - "@tailwindcss/browser"
Cohesion: 0.09
Nodes (29): active, buildSideChatPrompt(), clipTranscript(), fitSideMessages(), FRIENDLY_ERRORS, log, parseSideChatRequest(), PENDING_RESULTS (+21 more)

### Community 82 - "@tanstack/react-query"
Cohesion: 0.17
Nodes (9): SideChatEvent, SideChatMessage, ask(), ChatRequest, FakeProvider, Provider, question(), Script (+1 more)

### Community 83 - "@tanstack/react-router"
Cohesion: 0.25
Nodes (17): BOM, byPath(), countable(), readWorkspaceFile(), snapshotChangeSet(), snapshotFileDiff(), WriteOptions, buildDiff() (+9 more)

### Community 85 - "@types/react"
Cohesion: 0.18
Nodes (16): forgetOAuth(), lastAuthUrl, log, pending, clearOAuthState(), OAuthState, Row, saveClientInformation() (+8 more)

### Community 86 - "typescript"
Cohesion: 0.60
Nodes (4): DictationState, join(), toSpeechSamples(), useDictation()

### Community 88 - "@vitejs/plugin-react"
Cohesion: 0.09
Nodes (25): CHART_KINDS, ChartRenderOptions, clamp(), LAYOUT_NAMES, layoutContent, layoutElements(), layoutName, LAYOUTS (+17 more)

### Community 89 - "vitest"
Cohesion: 0.15
Nodes (24): buildTaskHistory(), callImages(), groupRounds(), HistoryOptions, historyTokens(), latestCompaction(), resultForModel(), Round (+16 more)

### Community 90 - "zustand"
Cohesion: 0.19
Nodes (13): DesignCard(), DesignEditorPage(), DesignHeader(), DesignHomePage(), errorText(), exportDesign(), FORMAT_ICONS, IDEAS (+5 more)

### Community 94 - "agent-core.test.ts"
Cohesion: 0.13
Nodes (29): absoluteUrl(), decodeEntities(), htmlToText(), NAMED_ENTITIES, PageText, parseBraveHtml(), parseDuckDuckGoHtml(), parseSearxngJson() (+21 more)

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
Cohesion: 0.10
Nodes (27): TurnFinished, DAYS, describeCron(), nextFire(), pad(), parseCron(), previewCron(), configure() (+19 more)

### Community 99 - "agent.ts"
Cohesion: 0.10
Nodes (34): INIT_PROMPT, IpcInvokeMap, PermissionMode, ConversationSummary, ProjectIndexStatus, ThinkingLevel, ChangedFile, ChangeSet (+26 more)

### Community 100 - "history.ts"
Cohesion: 0.14
Nodes (12): address, approvals, elapsed, logs, outDir, problems, profile, project (+4 more)

### Community 101 - "Workspace"
Cohesion: 0.08
Nodes (36): ANSI, ESC, killTree(), runCommand, runShell(), ShellOptions, ShellResult, connectorTool() (+28 more)

### Community 102 - "orchestrator.ts"
Cohesion: 0.06
Nodes (60): installPdfRenderer(), installTaskNotifications(), log, setPdfRenderer(), setSvgRasterizer(), attachCloseToTray(), backgroundActive(), createMain() (+52 more)

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
Cohesion: 0.09
Nodes (32): clampSize(), COLOR_TOKENS, customizeTheme(), FontCategory, FORMAT_DEFAULTS, gradientStops(), hex6(), luminance() (+24 more)

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
Cohesion: 0.24
Nodes (4): ModuleId, asString(), ModuleRegistry, optString()

### Community 118 - "@tailwindcss/vite"
Cohesion: 0.26
Nodes (12): resetPreset(), savePreset(), deleteModel(), listModels(), loadedModels(), loadModel(), modelDetail(), requireModel() (+4 more)

### Community 120 - "@xterm/addon-fit"
Cohesion: 0.17
Nodes (12): scripts, build, build:win, dev, preview, runtime:artifacts, test, test:e2e (+4 more)

### Community 122 - "@xterm/xterm"
Cohesion: 0.16
Nodes (22): angleArc(), buildFigure(), BuiltFigure, centroid(), completeRightTriangle(), DEFAULT_LABELS, figureLabel(), format() (+14 more)

### Community 125 - "errorMessage"
Cohesion: 0.18
Nodes (8): exportDir, formatLabels, logs, outDir, problems, profile, project, [
  providerId = 'ollama',
  modelId = 'qwen3.5:9b',
  prompt = 'Create a 5-slide pitch deck for "Bean Club", a neighborhood coffee subscription: a cover, the problem, how it works, growth in members (Jan 120, Feb 180, Mar 260, Apr 410) as a chart, and a closing slide.',
  shot = 'design',
]

### Community 126 - "CustomizePage.tsx"
Cohesion: 0.16
Nodes (19): attempt(), CommandDialog(), CommandsSection(), ConnectorCard(), ConnectorDialog(), ConnectorsSection(), CustomizePage(), errorText() (+11 more)

### Community 127 - "LlamaCppProvider"
Cohesion: 0.10
Nodes (15): addBlocksTool, blockSchema, calculateTool, deleteBlocksTool, drawFigureTool, figureSchema, getBoardTool, makeQuizTool (+7 more)

### Community 128 - "memory.ts"
Cohesion: 0.15
Nodes (27): adaptiveSimpson(), add(), antiderivativePolynomial(), asPolynomial(), bareTermOf(), CalculusError, call(), collectPolynomialTerms() (+19 more)

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
Cohesion: 0.20
Nodes (9): throttle(), EXE_NAMES, findPiper(), installing, PIPER_VOICES, piperDir(), progress(), TtsService (+1 more)

### Community 137 - "quants.ts"
Cohesion: 0.24
Nodes (4): ArtboardView(), css(), ElementView, ElementViewProps

### Community 139 - "design/export.ts"
Cohesion: 0.23
Nodes (16): ensureSession(), exportDesign(), ExportTarget, fileSafe(), imageUrls(), rasterizeSvg(), renderPdf(), renderPng() (+8 more)

### Community 140 - "streams.ts"
Cohesion: 0.23
Nodes (15): backgroundAt(), checkArtboard(), intersects(), short(), estimateLines(), estimateTextHeight(), fitFontSize(), glyphWidth() (+7 more)

### Community 141 - "dictation.ts"
Cohesion: 0.29
Nodes (6): DARK_PALETTE, LIGHT_PALETTE, readVizTheme(), useVizTheme(), vizCssVariables(), VizTheme

### Community 144 - "electron-vite"
Cohesion: 0.18
Nodes (12): estimateLoad(), detectHardware(), exec, log, nvidiaGpus(), otherGpus(), parseNvidiaSmi(), recommendedWhisperVariant() (+4 more)

### Community 145 - "package.json"
Cohesion: 0.22
Nodes (8): author, description, license, main, name, private, productName, version

### Community 146 - "code-session.test.ts"
Cohesion: 0.14
Nodes (11): ChatRequest, cleanup, entry, fake, FakeProvider, finished(), makeRepo(), Provider (+3 more)

### Community 147 - "images.ts"
Cohesion: 0.22
Nodes (10): completionKindMap(), DocInfo, docs, documentUri(), LSP_LANGUAGES, parseDocumentUri(), registerLspProviders(), SEVERITY_MAP() (+2 more)

### Community 148 - "sessions.ts"
Cohesion: 0.18
Nodes (14): browser, boundsSchema, tabId, url, clearDomainSession(), cookieUrl(), DIR, ensureDir() (+6 more)

### Community 150 - "code-changes.test.ts"
Cohesion: 0.16
Nodes (15): conversationIdSchema, CreateTerminalOptions, dataSchema, envValue(), findOnPath(), idSchema, log, lstatExists() (+7 more)

### Community 151 - "app.spec.ts"
Cohesion: 0.17
Nodes (8): project, lastUserText(), MockRequest, MockServer, sleep(), startMockServer(), VIZ_CDN_REPLY, VIZ_REPLY

### Community 152 - "snapshots.ts"
Cohesion: 0.32
Nodes (13): deleteSnapshots(), folder(), forgetSnapshot(), manifestPath(), queues, readManifest(), serial(), snapshotBeforeChange() (+5 more)

### Community 153 - "@tanstack/react-query"
Cohesion: 0.17
Nodes (9): StoredProviderConfig, argumentsObject(), OllamaChatLine, OllamaPs, OllamaPullProgress, OllamaShow, OllamaTag, ollamaThink() (+1 more)

### Community 155 - "snapshots.ts"
Cohesion: 0.29
Nodes (7): pptxgenjs, pptxgenjs, artboardsToPptx(), CHART_TYPES, PptxAssets, textRuns(), transparency()

### Community 156 - "LmStudioProvider"
Cohesion: 0.19
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
Cohesion: 0.25
Nodes (13): ThemePanel(), chartSvg(), clamp(), formatValue(), niceScale(), r1(), truncate(), wrap() (+5 more)

### Community 161 - "MathPage.tsx"
Cohesion: 0.29
Nodes (11): BoardCard(), errorText(), exportBoard(), IDEAS, isEditableTarget(), MathBoardPage(), MathHeader(), MathHomePage() (+3 more)

### Community 162 - "downloadFile"
Cohesion: 0.31
Nodes (7): ChecksumError, downloadFile(), DownloadOptions, fileSize(), hashExisting(), payload, sha

### Community 165 - "browser-sessions.test.ts"
Cohesion: 0.50
Nodes (3): cookies, cookieStore, FakeCookie

### Community 167 - "network.test.ts"
Cohesion: 0.16
Nodes (13): backendsFromFiles(), bestRuntime(), exec, findServerDir(), idForDir(), log, parseDevicesOutput(), parseReleaseAssets() (+5 more)

### Community 174 - "types/math.ts"
Cohesion: 0.15
Nodes (18): NormalizeResult, GeneratedQuiz, BlockBase, DerivationBlock, FigureBlock, FormulaBlock, MathBlock, MathBlockType (+10 more)

### Community 187 - "artifact-protocol.ts"
Cohesion: 0.10
Nodes (25): attachmentFromBytes(), attachmentImage(), attachmentRefs(), attachmentsFromPaths(), classifyFile(), cleanupOrphanAttachments(), extractPdfText(), IMAGE_TYPES (+17 more)

### Community 188 - "models.test.ts"
Cohesion: 0.23
Nodes (11): detectReasoningStyle(), EMBEDDING_ARCHES, FILE_TYPE_NAMES, isEmbeddingModel(), num(), numOrArray(), ParsedShard, summarizeGguf() (+3 more)

### Community 193 - "quants.ts"
Cohesion: 0.18
Nodes (17): basename(), GroupedRepoFiles, groupQuantFiles(), isAuxiliaryGguf(), isMmprojFile(), parentName(), preferredMmproj(), quantBits() (+9 more)

### Community 196 - "viz-export.ts"
Cohesion: 0.48
Nodes (6): base64Of(), copyPng(), loadImage(), paint(), pngOnBackground(), svgToPng()

## Knowledge Gaps
- **830 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+825 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `scripts` to `package.json`, `snapshots.ts`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `paths()` connect `MemoryChatStore` to `ChatOrchestrator`, `engine.ts`, `openai-compat.ts`, `.resolve`, `design/export.ts`, `orchestrator.ts`, `handlers.ts`, `router.tsx`, `snapshots.ts`, `.doScan`, `ModelRef`, `network.test.ts`, `ArtifactPanel.tsx`, `artifact-protocol.ts`, `electron-builder`, `electron-vite`, `@fontsource-variable/source-serif-4`, `lucide-react`, `sucrase`, `tailwindcss`, `zustand`, `tools/types.ts`, `orchestrator.ts`, `monaco-editor`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `errorMessage()` connect `ChatOrchestrator` to `hf-api.ts`, `engine.ts`, `run`, `.resolve`, `orchestrator.ts`, `handlers.ts`, `fetchWithTimeout`, `sessions.ts`, `code-changes.test.ts`, `@tanstack/react-query`, `.doScan`, `OpenAIServerProvider`, `MemoryChatStore`, `ProviderRegistry`, `network.test.ts`, `.update`, `window.ts`, `DownloadManager`, `electron-builder`, `electron-vite`, `@fontsource-variable/source-serif-4`, `lucide-react`, `sucrase`, `@tailwindcss/browser`, `tools/types.ts`, `orchestrator.ts`, `SideChat.tsx`, `monaco-editor`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `paths()` (e.g. with `Composer()` and `DesignHeader()`) actually correct?**
  _`paths()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _830 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `hf-api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `LlamaCppProvider` be split into smaller, more focused modules?**
  _Cohesion score 0.09878048780487805 - nodes in this community are weakly interconnected._