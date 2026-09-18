# Graph Report - Cellar  (2026-09-18)

## Corpus Check
- 308 files · ~329,615 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3766 nodes · 9196 edges · 182 communities (154 shown, 28 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 182 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9c95d4c0`
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
- network.test.ts
- electron-vite
- TypedBus
- lucide-react
- @fontsource-variable/source-serif-4
- radix-ui
- streamdown
- @streamdown/code
- @streamdown/math
- @streamdown/mermaid
- sucrase
- vscode-languageserver-protocol
- @xterm/addon-fit
- zustand
- quants.ts
- @fontsource-variable/inter

## God Nodes (most connected - your core abstractions)
1. `IpcInvokeMap` - 101 edges
2. `run()` - 80 edges
3. `errorMessage()` - 77 edges
4. `paths()` - 74 edges
5. `newId()` - 56 edges
6. `registerIpcHandlers()` - 52 edges
7. `get()` - 44 edges
8. `invoke()` - 44 edges
9. `BrowserService` - 42 edges
10. `registerM4Handlers()` - 41 edges

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
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/reminder.ts -> src/main/scheduled/scheduler.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/call.ts -> src/main/modules/registry.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`

## Communities (182 total, 28 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.16
Nodes (20): resetPreset(), savePreset(), deleteModel(), estimateLoad(), listModels(), loadedModels(), loadModel(), modelDetail() (+12 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.09
Nodes (21): sleep(), LocalModel, buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), formatParamCount(), freePort() (+13 more)

### Community 2 - "queries.ts"
Cohesion: 0.05
Nodes (43): DOCUMENT_EXTENSIONS, BINARY_EXTENSIONS, count(), describeWrite(), editFileTool, globTool, grepTool, IMAGE_EXTENSIONS (+35 more)

### Community 3 - "ChatOrchestrator"
Cohesion: 0.07
Nodes (9): joinReasoning(), TaskRunInput, TaskRunnerHooks, ChatOrchestrator, ChatStore, MemoryChatStore, prepareDesignSession(), prepareMathSession() (+1 more)

### Community 4 - "engine.ts"
Cohesion: 0.08
Nodes (55): registerBrowserHandlers(), attachmentFromBytes(), attachmentRefs(), attachmentsFromPaths(), classifyFile(), extractPdfText(), IMAGE_TYPES, Row (+47 more)

### Community 5 - "run"
Cohesion: 0.19
Nodes (17): angleMode, paper, registerMathHandlers(), topic, BoardConflictError, boardForConversation(), BoardRow, copyBoard() (+9 more)

### Community 6 - "scripts"
Cohesion: 0.06
Nodes (35): croner, docx, electron-updater, exceljs, extract-zip, @huggingface/gguf, jszip, marked (+27 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.08
Nodes (34): buildSystemPrompt(), chatToolGuidance(), cleanTitle(), fallbackTitle(), supportsArtifactInstructions(), SystemPromptInput, artifactTypeFor(), deriveArtifactTitle() (+26 more)

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
Cohesion: 0.18
Nodes (27): calculate(), evaluationSteps(), measureOf(), prettyMeasure(), exactZero, defaultContext(), formatDecimal(), Node (+19 more)

### Community 12 - "main/index.ts"
Cohesion: 0.10
Nodes (16): webSearch, buildDesignPrompt(), DesignPromptInput, contentSchema, createArtboardTool, deleteArtboardTool, DESIGN_TOOLS, designOutline() (+8 more)

### Community 13 - "DownloadManager"
Cohesion: 0.11
Nodes (11): isWholeGroup(), ChartSection(), chartToCsv(), csvToChart(), ElementPanel(), Layers(), patch(), Properties() (+3 more)

### Community 14 - "handlers.ts"
Cohesion: 0.13
Nodes (31): blockText(), handleSampling(), messageContent(), ExtractedTopic, initAutoMemory(), log, nothing(), parseExtraction() (+23 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.05
Nodes (91): AppCommand, AppInfo, BackgroundStatus, EVENT_CHANNELS, EventChannel, eventChannelFlags, Handler, INVOKE_CHANNELS (+83 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.10
Nodes (28): AgentPart, TaskStartOptions, Artifact, ArtifactSummary, AttachmentKind, AttachmentRef, ChatStreamEvent, ConversationSettings (+20 more)

### Community 17 - "Messages.tsx"
Cohesion: 0.07
Nodes (20): ARTIFACT_ICONS, ARTIFACT_LABELS, ArtifactCard(), AttachmentImage(), attachmentImageUrl(), Lightbox(), MessageAttachments(), InlineImage() (+12 more)

### Community 18 - "fetchWithTimeout"
Cohesion: 0.20
Nodes (8): fetchWithTimeout(), ollamaOptions(), OllamaProvider, readErrorBody(), DuckDuckGoImage, fetchVqd(), ImageResult, searchImage()

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
Nodes (19): addElement(), expandToGroups(), imagesFromFiles(), naturalSize(), placeImage(), AddArtboardButton(), Box, boxFor() (+11 more)

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.07
Nodes (10): ACCENTS, CHART_COLORS, dayLabel(), Heatmap(), LANGUAGES, SECTIONS, SHORTCUTS, UsageModels() (+2 more)

### Community 24 - "types/models.ts"
Cohesion: 0.13
Nodes (22): CalcOptions, CalcResult, approxRational(), isRational(), AngleMode, checkPythagoras(), coefficients(), DerivativeInput (+14 more)

### Community 25 - "provider-configs.ts"
Cohesion: 0.07
Nodes (24): browseBack, browseClearSession, browseClick, browseElements, browseFill, browseFindLink, browseForward, browseLoginStatus (+16 more)

### Community 26 - "hub.ts"
Cohesion: 0.08
Nodes (27): DownloadFileState, DownloadJob, DownloadStatus, DownloadTarget, HfFile, HfModelSummary, HfRepoDetail, HfSearchQuery (+19 more)

### Community 27 - ".doScan"
Cohesion: 0.12
Nodes (25): Rational, ALIASES, clean(), dependsOn(), Equation, EvalContext, evaluateNode(), expandFractions() (+17 more)

### Community 28 - "LmStudioProvider"
Cohesion: 0.18
Nodes (16): effectiveThinking(), isChatCapable(), thinkingLabel(), thinkingOptions(), useAppCommands(), useBrowserReveal(), useSelectedModel(), useThemeSync() (+8 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.11
Nodes (35): exists(), inside(), Workspace, listDirectory(), writeWorkspaceFile(), codeSession(), CodeSessionContext, BASE_HEADERS (+27 more)

### Community 30 - "OpenAIServerProvider"
Cohesion: 0.19
Nodes (14): chartFromCode(), newToolCallId(), RoundOptions, asObject(), describeType(), escapeControlCharsInStrings(), ParsedTextCall, parseLooseJson() (+6 more)

### Community 31 - "MemoryChatStore"
Cohesion: 0.05
Nodes (99): quickEntryShortcutActive(), builtInCommands(), changed(), commandSlug(), customCommands(), deleteCommand(), expandCommand(), expandTemplate() (+91 more)

### Community 32 - "ProviderRegistry"
Cohesion: 0.13
Nodes (3): ProviderRegistry, withTimeout(), Provider

### Community 33 - "Sidebar.tsx"
Cohesion: 0.32
Nodes (13): snapshotDiscardFile(), folder(), forgetSnapshot(), manifestPath(), queues, readManifest(), serial(), snapshotBeforeChange() (+5 more)

### Community 34 - "Provider"
Cohesion: 0.18
Nodes (28): abortMerge(), baseBlob(), byPath(), commitAll(), conflictedFiles(), continueMerge(), deleteNewFile(), existsInBase() (+20 more)

### Community 35 - "form.tsx"
Cohesion: 0.20
Nodes (3): Input, SelectOption, Textarea

### Community 36 - "devDependencies"
Cohesion: 0.06
Nodes (33): 0.1.0 — 2026-09-13, 2.0.0 — 2026-09-14, 3.0.0 — 2026-09-14, 4.0.0 — 2026-09-15, 5.0.0 — 2026-09-15, 6.0.0 — 2026-09-16, 7.0.0 — 2026-09-16, 7.0.1 — 2026-09-16 (+25 more)

### Community 37 - "chat-smoke.mjs"
Cohesion: 0.22
Nodes (8): elapsed, logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3:0.6b', prompt = 'Say hello in five words.', shot = 'chat'], started

### Community 39 - "ModelRef"
Cohesion: 0.11
Nodes (10): callbackPath(), CellarOAuthProvider, ensureServer(), forgetOAuth(), lastAuthUrl, log, pending, clearOAuthState() (+2 more)

### Community 40 - "build-artifact-runtime.mjs"
Cohesion: 0.25
Nodes (6): entry, outDir, output, root, tailwindOutput, tailwindSource

### Community 41 - ".update"
Cohesion: 0.11
Nodes (8): ConnectorManager, Live, renderToolResult(), signatureOf(), toolResultImages(), withTimeout(), authUrlFor(), closeOAuthServer()

### Community 42 - "window.ts"
Cohesion: 0.16
Nodes (30): checkJavaScript(), checkJsonText(), checkPowerShell(), checkPyright(), checkPython(), checkRuff(), checkTypeScriptSyntax(), findPython() (+22 more)

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
Cohesion: 0.14
Nodes (15): answerMatches(), answerQuestion(), resetQuiz(), revealQuestion(), updateBlock(), DerivationView(), EDITABLE, FormulaView() (+7 more)

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
Cohesion: 0.08
Nodes (33): ChangesPane(), Counts(), errorText(), FileRow(), FileRowProps, num(), splitPath(), STATUS (+25 more)

### Community 53 - "ModelsPage.tsx"
Cohesion: 0.10
Nodes (32): ShapeSection(), CHART_KINDS, normalizeChart(), LAYOUT_NAMES, canonicalFields(), clamp(), color(), FORMATS (+24 more)

### Community 55 - "ipc-run.mjs"
Cohesion: 0.50
Nodes (3): calls, profile, project

### Community 56 - "preload/index.ts"
Cohesion: 0.50
Nodes (3): bridge, eventsAllowed, invokeAllowed

### Community 57 - "ArtifactPanel.tsx"
Cohesion: 0.15
Nodes (24): bodySchema, changed(), contentSchema, conversationIdSchema, writeRepoFile(), gitBase(), messageSchema, pathSchema (+16 more)

### Community 58 - "ChatPage.tsx"
Cohesion: 0.10
Nodes (35): blockElements(), cellValue(), chartTable(), createPptx(), createXlsx(), DocumentOptions, DOCX_IMAGE_TYPES, DocxContext (+27 more)

### Community 63 - "cmdk"
Cohesion: 0.22
Nodes (23): escapeXml(), backgroundAt(), checkArtboard(), intersects(), artboardHtml(), artboardStyle(), artboardSvg(), boxStyle() (+15 more)

### Community 64 - "electron"
Cohesion: 0.15
Nodes (39): asRational(), Exact, exactAdd(), exactDiv(), exactFromNumber(), exactInt(), exactInverse(), exactIsZero() (+31 more)

### Community 65 - "electron-builder"
Cohesion: 0.40
Nodes (3): defaultPolicy(), toolPolicy(), hasOAuthTokens()

### Community 66 - "electron-vite"
Cohesion: 0.06
Nodes (39): pdfAvailable(), historyTokens(), ToolProtocol, AgentPromptInput, buildAgentPrompt(), compactionRequest(), agentNoun(), autoApproveAction() (+31 more)

### Community 67 - "@fontsource-variable/inter"
Cohesion: 0.19
Nodes (18): installPdfRenderer(), setPdfRenderer(), setSvgRasterizer(), ensureSession(), exportDesign(), ExportTarget, fileSafe(), imageUrls() (+10 more)

### Community 68 - "@fontsource-variable/source-serif-4"
Cohesion: 0.13
Nodes (25): relPath(), branchExists(), branchSlug(), createWorktree(), findMemoryFile(), gitAvailable(), GitError, GitOptions (+17 more)

### Community 69 - "artifact-protocol.ts"
Cohesion: 0.15
Nodes (18): NormalizeResult, GeneratedQuiz, BlockBase, DerivationBlock, DerivationStep, FigureBlock, FormulaBlock, MathBlock (+10 more)

### Community 70 - "@playwright/test"
Cohesion: 0.17
Nodes (27): blockType(), boardOutline(), describeBlock(), FIGURE_KINDS, figureKindOf(), isObject(), LIMITS, Loose (+19 more)

### Community 71 - "radix-ui"
Cohesion: 0.16
Nodes (12): ConversationPatch, ConversationRow, kindOf(), listConversations(), MessagePatch, MessageRow, searchMessages(), toConversation() (+4 more)

### Community 72 - "react"
Cohesion: 0.12
Nodes (10): ChatRequest, currentEntry, fake, FakeProvider, finished(), message(), Provider, Script (+2 more)

### Community 73 - "react-dom"
Cohesion: 0.11
Nodes (26): cleanupOrphanAttachments(), log, deleteStoredConnector(), ensureOverride(), listStoredConnectors(), pluginOverrides(), record(), Row (+18 more)

### Community 74 - "streamdown"
Cohesion: 0.20
Nodes (18): Atom, escapeHtml(), mathToPlain(), prepare(), renderMath(), superscript(), SUPERSCRIPT_DIGITS, SYMBOLS (+10 more)

### Community 75 - "@streamdown/code"
Cohesion: 0.11
Nodes (25): area(), arithmetic(), Draft, fractions(), fromSolution(), generateQuiz(), GENERATORS, hashSeed() (+17 more)

### Community 76 - "@streamdown/math"
Cohesion: 0.11
Nodes (15): AppShell(), ChangelogDialog(), SECTION_TONE, CodeSidebar(), SessionFilter, DownloadsButton(), TARGET_LABEL, SearchPalette() (+7 more)

### Community 77 - "@streamdown/mermaid"
Cohesion: 0.24
Nodes (9): useIpcSync(), speak(), speakReply(), speakWithSystemVoice(), stopSpeaking(), stripForSpeech(), pending, StreamsState (+1 more)

### Community 78 - "sucrase"
Cohesion: 0.09
Nodes (33): downloadFile(), DownloadOptions, fileSize(), hashExisting(), errorMessage(), recommendedWhisperVariant(), EXE_NAMES, findPiper() (+25 more)

### Community 80 - "tailwindcss"
Cohesion: 0.31
Nodes (5): clamp(), defaults(), SettingsService, uniqueStrings(), useSpeechVoices()

### Community 81 - "@tailwindcss/browser"
Cohesion: 0.09
Nodes (27): FitResult, fitToContext(), messageTokens(), toTurns(), truncateMiddle(), chat, active, buildSideChatPrompt() (+19 more)

### Community 82 - "@tanstack/react-query"
Cohesion: 0.16
Nodes (11): SideChatMessage, ask(), ChatRequest, FakeProvider, msg(), Provider, question(), Script (+3 more)

### Community 83 - "@tanstack/react-router"
Cohesion: 0.23
Nodes (19): BOM, byPath(), countable(), readWorkspaceFile(), snapshotChangeSet(), snapshotFileDiff(), WriteOptions, buildDiff() (+11 more)

### Community 85 - "@types/react"
Cohesion: 0.24
Nodes (11): OAuthState, Row, saveClientInformation(), saveCodeVerifier(), saveDiscoveryState(), saveTokens(), upsert(), openSecret() (+3 more)

### Community 86 - "typescript"
Cohesion: 0.38
Nodes (5): DictationState, join(), toSpeechSamples(), useDictation(), cleanIpcError()

### Community 88 - "@vitejs/plugin-react"
Cohesion: 0.11
Nodes (27): ChartRenderOptions, short(), clamp(), layoutContent, layoutElements(), layoutName, LAYOUTS, Raw (+19 more)

### Community 89 - "vitest"
Cohesion: 0.22
Nodes (14): addBlock(), deleteBlock(), duplicateBlock(), moveBlock(), reorderBlock(), setBoardMeta(), store(), BlockShell() (+6 more)

### Community 90 - "zustand"
Cohesion: 0.19
Nodes (13): DesignCard(), DesignEditorPage(), DesignHeader(), DesignHomePage(), errorText(), exportDesign(), FORMAT_ICONS, IDEAS (+5 more)

### Community 94 - "agent-core.test.ts"
Cohesion: 0.12
Nodes (30): absoluteUrl(), decodeEntities(), htmlToText(), NAMED_ENTITIES, PageText, parseBraveHtml(), parseDuckDuckGoHtml(), parseSearxngJson() (+22 more)

### Community 95 - "Cellar roadmap"
Cohesion: 0.04
Nodes (43): 3.1 Built-in Chromium browser (`src/main/browser/`), 3.2 `call(module, task)` (`src/main/modules/`), 3.3 Self-scheduling (`create_reminder`), 3.4 Voice: streaming transcription and spoken replies, Cellar roadmap, Known gaps and follow-ups from M1, Known gaps and follow-ups from M2, Known gaps and follow-ups from M3 (+35 more)

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
Cohesion: 0.07
Nodes (37): ANSI, ESC, killTree(), runCommand, runShell(), ShellOptions, ShellResult, connectorTool() (+29 more)

### Community 102 - "orchestrator.ts"
Cohesion: 0.29
Nodes (13): buildTaskHistory(), callImages(), groupRounds(), HistoryOptions, latestCompaction(), resultForModel(), Round, roundsToMessages() (+5 more)

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
Cohesion: 0.09
Nodes (23): AgentParts(), Block, toBlocks(), ChangeDiff(), ChangesSection(), errorText(), run(), searchLabel() (+15 more)

### Community 107 - "TaskSidePanel.tsx"
Cohesion: 0.07
Nodes (31): appRoot, bundled(), configure(), detectLanguage(), fromLspRange(), fromUri(), LANGUAGE_IDS, LanguageServer (+23 more)

### Community 108 - "monaco.ts"
Cohesion: 0.26
Nodes (9): alpha(), applyTheme(), cssColor(), EXTENSION_LANGUAGES, FILENAME_LANGUAGES, load(), loadMonaco(), registerJson() (+1 more)

### Community 109 - "SideChat.tsx"
Cohesion: 0.06
Nodes (20): BrowserService, getWindow(), normalizeUrl(), EMPTY, historyOf(), LiveReply, newRequestId(), requestMessages() (+12 more)

### Community 110 - "downloadFile"
Cohesion: 0.16
Nodes (16): ChartElement, ChartSeries, ColorToken, DesignElementType, DesignExportFormat, ElementBase, GradientStop, ImageElement (+8 more)

### Community 111 - "design/store.ts"
Cohesion: 0.24
Nodes (14): formatSchema, registerDesignHandlers(), copyDesign(), createDesign(), DesignConflictError, designForConversation(), DesignRow, getDesign() (+6 more)

### Community 112 - "🎨 AI Design Engine: Concept & Specification Document"
Cohesion: 0.29
Nodes (6): 🚀 1. Overview: Bridging the Gap Between Text and Visual Design, 🧱 2. The Limitations of Current Text-Based AI, ✨ 3. The Vision: Desired Capabilities (The Next-Generation AI), 🛠️ 4. Technical Feature Checklist (The Design Specification), 🧠 5. AI Self-Assessment and Self-Identified Issues, 🎨 AI Design Engine: Concept & Specification Document

### Community 113 - "CodeModeMenu.tsx"
Cohesion: 0.52
Nodes (6): CODE_MODE_OPTIONS, codeModeKey(), CodeModeMenu(), CodeModeValue, nextCodeMode(), Option

### Community 114 - "code-changes.test.ts"
Cohesion: 0.06
Nodes (35): clsx, cmdk, electron, electron-builder, electron-vite, monaco-editor, devDependencies, clsx (+27 more)

### Community 115 - "stores/code.ts"
Cohesion: 0.33
Nodes (5): CodePane, CodeUiState, EditorRequest, PreviewRequest, useCodeUi

### Community 116 - "monaco-editor"
Cohesion: 0.24
Nodes (4): ModuleId, asString(), ModuleRegistry, optString()

### Community 118 - "TerminalPane.tsx"
Cohesion: 0.21
Nodes (8): describeLocation(), inspectLocalGguf(), localModelId(), LocalModelIndex, pickMmproj(), quantLabelFromName(), toModel(), walk()

### Community 119 - "@types/react-dom"
Cohesion: 0.06
Nodes (33): check(), conversationIdSchema, CreateTerminalOptions, dataSchema, envValue(), findOnPath(), idSchema, log (+25 more)

### Community 120 - "@xterm/addon-fit"
Cohesion: 0.17
Nodes (12): scripts, build, build:win, dev, preview, runtime:artifacts, test, test:e2e (+4 more)

### Community 121 - "@xterm/addon-web-links"
Cohesion: 0.18
Nodes (9): PropertiesTab(), MathChat(), EditorState, MathLayoutState, PanelTab, PEN_COLORS, selectedBlock(), useMathEditor (+1 more)

### Community 122 - "@xterm/xterm"
Cohesion: 0.17
Nodes (21): angleArc(), buildFigure(), BuiltFigure, centroid(), completeRightTriangle(), DEFAULT_LABELS, figureLabel(), format() (+13 more)

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
Cohesion: 0.10
Nodes (15): addBlocksTool, blockSchema, calculateTool, deleteBlocksTool, drawFigureTool, figureSchema, getBoardTool, makeQuizTool (+7 more)

### Community 128 - "memory.ts"
Cohesion: 0.15
Nodes (26): adaptiveSimpson(), add(), antiderivativePolynomial(), asPolynomial(), bareTermOf(), CalculusError, call(), collectPolynomialTerms() (+18 more)

### Community 131 - "m4-handlers.ts"
Cohesion: 0.20
Nodes (8): DesignLayoutState, DesignTool, EditorState, selectedArtboard(), selectedElements(), Selection, useDesignEditor, useDesignLayout

### Community 132 - "tasks.ts"
Cohesion: 0.14
Nodes (12): report(), BrowserPanel(), hostOf(), describeTool(), DiffLine, DOCUMENT_TOOLS, Icon, IDEAS (+4 more)

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
Nodes (52): installTaskNotifications(), attachCloseToTray(), backgroundActive(), createMain(), getMain(), hideQuickEntry(), iconPath(), installBackground() (+44 more)

### Community 137 - "quants.ts"
Cohesion: 0.24
Nodes (4): ArtboardView(), css(), ElementView, ElementViewProps

### Community 139 - "design/export.ts"
Cohesion: 0.29
Nodes (7): pptxgenjs, pptxgenjs, artboardsToPptx(), CHART_TYPES, PptxAssets, textRuns(), transparency()

### Community 140 - "streams.ts"
Cohesion: 0.29
Nodes (9): escapeRegex(), globFiles(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry, WalkOptions (+1 more)

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
Cohesion: 0.07
Nodes (30): INIT_PROMPT, ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, PermissionMode, ReasoningPart, TaskFile (+22 more)

### Community 147 - "images.ts"
Cohesion: 0.20
Nodes (11): completionKindMap(), DocInfo, docs, documentUri(), LSP_LANGUAGES, parseDocumentUri(), registerLspProviders(), SEVERITY_MAP() (+3 more)

### Community 148 - "sessions.ts"
Cohesion: 0.33
Nodes (9): clearDomainSession(), cookieUrl(), DIR, ensureDir(), fileFor(), loadAllSessions(), log, saveDomainSession() (+1 more)

### Community 151 - "AppShell.tsx"
Cohesion: 0.17
Nodes (8): project, lastUserText(), MockRequest, MockServer, sleep(), startMockServer(), VIZ_CDN_REPLY, VIZ_REPLY

### Community 152 - "snapshots.ts"
Cohesion: 0.14
Nodes (19): clampSize(), COLOR_TOKENS, contrastRatio(), FontCategory, FORMAT_DEFAULTS, gradientCss(), gradientStops(), hex6() (+11 more)

### Community 153 - "@tanstack/react-query"
Cohesion: 0.36
Nodes (8): addStroke(), clearSketch(), eraseStroke(), distanceTo(), pathsOf(), SketchCanvas(), SketchToolbar(), TOOLS

### Community 154 - "@vitejs/plugin-react"
Cohesion: 0.31
Nodes (5): canonicalFunction(), CONSTANTS, parseInequality(), Parser, tokenize()

### Community 155 - "snapshots.ts"
Cohesion: 0.48
Nodes (6): base64Of(), copyPng(), loadImage(), paint(), pngOnBackground(), svgToPng()

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
Cohesion: 0.83
Nodes (3): ArtifactPanel(), fence(), IFRAME_TYPES

### Community 159 - "charts.ts"
Cohesion: 0.25
Nodes (13): ThemePanel(), chartSvg(), clamp(), formatValue(), niceScale(), r1(), truncate(), wrap() (+5 more)

### Community 161 - "MathPage.tsx"
Cohesion: 0.29
Nodes (11): BoardCard(), errorText(), exportBoard(), IDEAS, isEditableTarget(), MathBoardPage(), MathHeader(), MathHomePage() (+3 more)

### Community 162 - "downloadFile"
Cohesion: 0.40
Nodes (3): ChecksumError, payload, sha

### Community 165 - "browser-sessions.test.ts"
Cohesion: 0.50
Nodes (3): cookies, cookieStore, FakeCookie

### Community 167 - "network.test.ts"
Cohesion: 0.15
Nodes (11): backendsFromFiles(), bestRuntime(), exec, findServerDir(), idForDir(), parseDevicesOutput(), parseReleaseAssets(), parseVersionOutput() (+3 more)

### Community 169 - "electron-vite"
Cohesion: 0.35
Nodes (5): dot(), EmbeddingIndex, embeddingPrefixes(), fromBlob(), toBlob()

### Community 172 - "TypedBus"
Cohesion: 0.14
Nodes (11): SideChatPrompt, StoredProviderConfig, argumentsObject(), OllamaChatLine, OllamaPs, OllamaPullProgress, OllamaShow, OllamaTag (+3 more)

### Community 173 - "lucide-react"
Cohesion: 0.09
Nodes (40): log, ActiveGeneration, log, TurnFinished, all(), db(), p(), transaction() (+32 more)

### Community 176 - "radix-ui"
Cohesion: 0.13
Nodes (19): callTool, moduleId, normalizeCallArgs(), describeModules(), MODULE_ACTIONS, MODULE_IDS, ModuleAction, moduleReadOnly() (+11 more)

### Community 178 - "streamdown"
Cohesion: 0.40
Nodes (3): CHANGELOG, ChangelogEntry, ChangelogSection

### Community 193 - "quants.ts"
Cohesion: 0.06
Nodes (44): DownloadManager, computeQuantFit(), fitCache, fitInflight, fitWaiters, hfHeaders(), hfJson(), quantFit() (+36 more)

## Knowledge Gaps
- **876 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+871 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `errorMessage()` connect `sucrase` to `ChatOrchestrator`, `engine.ts`, `.resolve`, `handlers.ts`, `fetchWithTimeout`, `sessions.ts`, `OpenAIServerProvider`, `MemoryChatStore`, `ProviderRegistry`, `network.test.ts`, `.update`, `electron-vite`, `TypedBus`, `lucide-react`, `radix-ui`, `quants.ts`, `electron-vite`, `@fontsource-variable/source-serif-4`, `react-dom`, `@tailwindcss/browser`, `tools/types.ts`, `TaskSidePanel.tsx`, `SideChat.tsx`, `monaco-editor`, `TerminalPane.tsx`, `@types/react-dom`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `dependencies` connect `scripts` to `package.json`, `design/export.ts`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `paths()` connect `MemoryChatStore` to `ChatOrchestrator`, `engine.ts`, `.resolve`, `openai-compat.ts`, `router.tsx`, `Sidebar.tsx`, `network.test.ts`, `.update`, `lucide-react`, `radix-ui`, `electron-vite`, `@fontsource-variable/inter`, `@fontsource-variable/source-serif-4`, `react-dom`, `sucrase`, `tailwindcss`, `zustand`, `tools/types.ts`, `SideChat.tsx`, `monaco-editor`, `TerminalPane.tsx`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `paths()` (e.g. with `Composer()` and `DesignHeader()`) actually correct?**
  _`paths()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _876 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `LlamaCppProvider` be split into smaller, more focused modules?**
  _Cohesion score 0.09413067552602436 - nodes in this community are weakly interconnected._
- **Should `queries.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._