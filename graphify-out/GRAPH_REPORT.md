# Graph Report - Cellar  (2026-09-23)

## Corpus Check
- 359 files · ~412,164 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4407 nodes · 10763 edges · 216 communities (179 shown, 37 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 251 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a5653220`
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
- quants.ts
- command.ts
- .content
- .load
- TtsService
- @fontsource-variable/inter
- glob.ts
- OpenAIServerProvider
- Parser
- Cellar
- ErrorBoundary
- Cellar — Project Memory
- M8.1 Undo in Cowork, git beyond commit, and memory on demand (v7.4.0)
- M8 Tier 3 wishlist — delivered
- ContextInfoPanel.tsx
- M8.2 Playground (v7.6.0)
- M5 Design — delivered
- M6 Math — delivered
- M2 Cowork — delivered
- M3 Code — delivered
- M4 Customize, Scheduled, Voice — delivered
- M7.1 Seamless inline visualizations (v7.1.0)
- hi.md

## God Nodes (most connected - your core abstractions)
1. `IpcInvokeMap` - 113 edges
2. `run()` - 100 edges
3. `errorMessage()` - 87 edges
4. `paths()` - 82 edges
5. `newId()` - 66 edges
6. `get()` - 62 edges
7. `registerIpcHandlers()` - 53 edges
8. `invoke()` - 52 edges
9. `registerM4Handlers()` - 51 edges
10. `ChatOrchestrator` - 43 edges

## Surprising Connections (you probably didn't know these)
- `normalizeQuestions()` --indirect_call--> `answer()`  [INFERRED]
  src/shared/math/normalize.ts → scripts/study-smoke.mjs
- `runShell()` --indirect_call--> `collect()`  [INFERRED]
  src/main/agent/tools/command.ts → tests/unit/stream-parsers.test.ts
- `SideChat()` --indirect_call--> `question()`  [INFERRED]
  src/renderer/src/components/code/SideChat.tsx → tests/unit/side-chat.test.ts
- `QuizView()` --indirect_call--> `question()`  [INFERRED]
  src/renderer/src/components/math/Blocks.tsx → tests/unit/side-chat.test.ts
- `extractDocumentText()` --references--> `jszip`  [EXTRACTED]
  src/main/agent/documents.ts → package.json

## Import Cycles
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/call.ts -> src/main/modules/registry.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/reminder.ts -> src/main/scheduled/scheduler.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`

## Communities (216 total, 37 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.19
Nodes (23): changed(), countEntries(), describe(), enabledPlugins(), exec, expandPluginVars(), findPluginRoots(), installPlugin() (+15 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.15
Nodes (5): formatParamCount(), freePort(), LlamaCppProvider, prettyModelName(), sameConfig()

### Community 2 - "queries.ts"
Cohesion: 0.06
Nodes (61): ShapeSection(), annotationBox(), answeredQuestions(), ASCII_WIDTHS, blankIn(), charWidth(), exactBlank(), findText() (+53 more)

### Community 3 - "ChatOrchestrator"
Cohesion: 0.05
Nodes (14): chatTaskState(), joinText(), LiveRun, TaskRunner, ChatOrchestrator, buildSystemPrompt(), chatToolGuidance(), cleanTitle() (+6 more)

### Community 4 - "engine.ts"
Cohesion: 0.05
Nodes (73): registerBrowserHandlers(), attachmentFromBytes(), attachmentRefs(), attachmentsFromPaths(), classifyFile(), extractPdfText(), IMAGE_TYPES, Row (+65 more)

### Community 5 - "run"
Cohesion: 0.17
Nodes (20): exportBoard(), ExportTarget, fileSafe(), angleMode, paper, registerMathHandlers(), topic, BoardConflictError (+12 more)

### Community 6 - "scripts"
Cohesion: 0.05
Nodes (41): croner, docx, electron-updater, exceljs, extract-zip, @huggingface/gguf, jszip, marked (+33 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.11
Nodes (25): fitToContext(), messageTokens(), toTurns(), truncateMiddle(), normalizeChart(), measureSvg(), sanitizeSvg(), sizedSvg() (+17 more)

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
Cohesion: 0.11
Nodes (39): escapeRegex(), globFiles(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry, WalkOptions (+31 more)

### Community 12 - "main/index.ts"
Cohesion: 0.18
Nodes (4): hostOf(), stableJson(), ToolContext, attachPreview()

### Community 13 - "DownloadManager"
Cohesion: 0.10
Nodes (12): isWholeGroup(), ChartSection(), chartToCsv(), csvToChart(), ElementPanel(), ImportFontButton(), Layers(), patch() (+4 more)

### Community 14 - "handlers.ts"
Cohesion: 0.16
Nodes (17): hideQuickEntry(), openConversation(), quickEntryShortcutActive(), connectorSchema, focusedWindow(), modelRef, policy, registerM4Handlers() (+9 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.04
Nodes (75): AppCommand, AppInfo, BackgroundStatus, EVENT_CHANNELS, EventChannel, eventChannelFlags, Handler, INVOKE_CHANNELS (+67 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.09
Nodes (29): ConversationKind, TaskStartOptions, Artifact, ArtifactSummary, AttachmentKind, AttachmentRef, ContextInfo, Conversation (+21 more)

### Community 17 - "Messages.tsx"
Cohesion: 0.06
Nodes (24): ARTIFACT_ICONS, ARTIFACT_LABELS, ArtifactCard(), AttachmentImage(), attachmentImageUrl(), Lightbox(), MessageAttachments(), InlineImage() (+16 more)

### Community 18 - "fetchWithTimeout"
Cohesion: 0.28
Nodes (3): ollamaOptions(), OllamaProvider, readErrorBody()

### Community 19 - "button.tsx"
Cohesion: 0.12
Nodes (9): Button, ButtonProps, IconButton, IconButtonProps, Size, sizes, Variant, variants (+1 more)

### Community 20 - "router.tsx"
Cohesion: 0.09
Nodes (17): ChatPage(), CustomizePage(), DiscoverPage(), PUBLISHERS, ArtifactsPage(), RecentsPage(), ModelsPage(), SOURCE_LABEL (+9 more)

### Community 21 - "LoadSettingsDialog.tsx"
Cohesion: 0.15
Nodes (10): CapabilityIcons(), FIT_COPY, FitBadge(), MemoryBars(), PROVIDER_LABEL, providerStateDot(), ProviderStatusDot(), CONTEXT_STEPS (+2 more)

### Community 22 - "stream-parsers.ts"
Cohesion: 0.13
Nodes (17): expandToGroups(), imagesFromFiles(), AddArtboardButton(), Box, boxFor(), DesignCanvas(), Drag, elementBox() (+9 more)

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.07
Nodes (12): ACCENTS, CHART_COLORS, Code(), dayLabel(), Heatmap(), LANGUAGES, SECTIONS, SHORTCUTS (+4 more)

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
Cohesion: 0.05
Nodes (30): AgentTool, addBlocksTool, blockSchema, calculateTool, deleteBlocksTool, diagramStepSchema, drawDiagramTool, drawFigureTool (+22 more)

### Community 28 - "LmStudioProvider"
Cohesion: 0.18
Nodes (15): effectiveThinking(), thinkingLabel(), thinkingOptions(), useAppCommands(), useBrowserReveal(), useSelectedModel(), useThemeSync(), onEvent() (+7 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.11
Nodes (34): exists(), inside(), Workspace, listDirectory(), writeWorkspaceFile(), codeSession(), CodeSessionContext, BASE_HEADERS (+26 more)

### Community 30 - "OpenAIServerProvider"
Cohesion: 0.12
Nodes (26): buildTaskHistory(), callImages(), groupRounds(), HistoryOptions, latestCompaction(), resultForModel(), Round, roundsToMessages() (+18 more)

### Community 31 - "MemoryChatStore"
Cohesion: 0.16
Nodes (27): assistantContext, AssistantContextOptions, formatMemoryBlock(), activeSkills(), allSkills(), changed(), claudeSkillsAvailable(), copySkill() (+19 more)

### Community 33 - "Sidebar.tsx"
Cohesion: 0.10
Nodes (28): browser, installBrowser(), log, Tab, boundsSchema, tabId, url, clearDomainSession() (+20 more)

### Community 34 - "Provider"
Cohesion: 0.19
Nodes (25): abortMerge(), baseBlob(), byPath(), commitAll(), deleteNewFile(), existsInBase(), gitChangeSet(), gitDiscardFile() (+17 more)

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
Cohesion: 0.06
Nodes (33): AgentPart, ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, ReasoningPart, TaskFile, TaskSource (+25 more)

### Community 40 - "build-artifact-runtime.mjs"
Cohesion: 0.25
Nodes (6): entry, outDir, output, root, tailwindOutput, tailwindSource

### Community 41 - ".update"
Cohesion: 0.06
Nodes (16): ConnectorManager, defaultPolicy(), Live, renderToolResult(), signatureOf(), toolPolicy(), toolResultImages(), withTimeout() (+8 more)

### Community 42 - "window.ts"
Cohesion: 0.19
Nodes (17): backgroundAt(), checkArtboard(), intersects(), short(), clamp(), layoutElements(), LAYOUTS, Raw (+9 more)

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
Cohesion: 0.13
Nodes (10): isChatCapable(), CoworkExtras(), folderName(), HomePage(), SUGGESTIONS, Answer(), LABELS, PlaygroundPage() (+2 more)

### Community 50 - "providers.ts"
Cohesion: 0.06
Nodes (29): StreamEvent, ModelEntry, BUILTIN_PROVIDER_IDS, ProviderConfig, ProviderConfigInput, ProviderKind, ProviderState, ProviderStatus (+21 more)

### Community 51 - "verify-packaged.mjs"
Cohesion: 0.33
Nodes (4): exe, exportDir, local, project

### Community 52 - "DiscoverPage.tsx"
Cohesion: 0.08
Nodes (33): ChangesPane(), Counts(), errorText(), FileRow(), FileRowProps, num(), splitPath(), STATUS (+25 more)

### Community 53 - "ModelsPage.tsx"
Cohesion: 0.13
Nodes (28): canonicalFields(), clamp(), color(), FORMATS, gradient(), imageCrop(), imageFilters(), KEY_ALIASES (+20 more)

### Community 55 - "ipc-run.mjs"
Cohesion: 0.50
Nodes (3): calls, profile, project

### Community 56 - "preload/index.ts"
Cohesion: 0.50
Nodes (3): bridge, eventsAllowed, invokeAllowed

### Community 57 - "ArtifactPanel.tsx"
Cohesion: 0.14
Nodes (28): bodySchema, changed(), contentSchema, conversationIdSchema, conflictedFiles(), continueMerge(), fileHasConflictMarkers(), mergeInProgress() (+20 more)

### Community 58 - "ChatPage.tsx"
Cohesion: 0.10
Nodes (39): blockElements(), cellValue(), chartFromCode(), chartTable(), createPptx(), createXlsx(), DOCUMENT_EXTENSIONS, DocumentOptions (+31 more)

### Community 63 - "cmdk"
Cohesion: 0.24
Nodes (23): escapeXml(), findArtboard(), artboardHtml(), artboardStyle(), artboardSvg(), boxStyle(), cssText(), designHtml() (+15 more)

### Community 64 - "electron"
Cohesion: 0.06
Nodes (115): CalcOptions, CalcResult, calculate(), evaluationSteps(), measureOf(), prettyMeasure(), antiderivativePolynomial(), evalPolynomial() (+107 more)

### Community 65 - "electron-builder"
Cohesion: 0.15
Nodes (22): BookCard(), BookSearch(), ContextBar(), coverKey(), ensureCover(), errorText(), exportBook(), forgetCover() (+14 more)

### Community 66 - "electron-vite"
Cohesion: 0.07
Nodes (50): pdfAvailable(), historyTokens(), ToolProtocol, AgentPromptInput, buildAgentPrompt(), compactionRequest(), agentNoun(), autoApproveAction() (+42 more)

### Community 67 - "@fontsource-variable/inter"
Cohesion: 0.13
Nodes (19): callTool, moduleId, normalizeCallArgs(), describeModules(), MODULE_ACTIONS, MODULE_IDS, ModuleAction, moduleReadOnly() (+11 more)

### Community 68 - "@fontsource-variable/source-serif-4"
Cohesion: 0.16
Nodes (19): branchExists(), branchSlug(), createWorktree(), findMemoryFile(), gitAvailable(), GitError, GitOptions, GitResult (+11 more)

### Community 69 - "artifact-protocol.ts"
Cohesion: 0.22
Nodes (9): argumentsObject(), OllamaChatLine, OllamaPs, OllamaPullProgress, OllamaShow, OllamaTag, ollamaThink(), parseOllamaChatStream() (+1 more)

### Community 70 - "@playwright/test"
Cohesion: 0.07
Nodes (65): diagramStepCount(), DIAGRAM_LIMITS, isObject(), KIND_WORDS, kindOf(), Loose, normalizeDiagram(), normalizeElement() (+57 more)

### Community 71 - "radix-ui"
Cohesion: 0.11
Nodes (37): initAutoMemory(), log, nothing(), parseExtraction(), pending, runAutoMemory(), scheduleAutoMemory(), updateMemoryFromConversation() (+29 more)

### Community 72 - "react"
Cohesion: 0.12
Nodes (10): ChatRequest, currentEntry, fake, FakeProvider, finished(), message(), Provider, Script (+2 more)

### Community 73 - "react-dom"
Cohesion: 0.24
Nodes (18): BOM, byPath(), countable(), readWorkspaceFile(), snapshotChangeSet(), snapshotFileDiff(), WriteOptions, buildDiff() (+10 more)

### Community 74 - "streamdown"
Cohesion: 0.08
Nodes (49): textSvg(), Node, angleArc(), buildFigure(), BuiltFigure, centroid(), completeRightTriangle(), DEFAULT_LABELS (+41 more)

### Community 75 - "@streamdown/code"
Cohesion: 0.11
Nodes (28): area(), arithmetic(), Draft, fractions(), fromSolution(), GeneratedQuiz, generateQuiz(), GENERATORS (+20 more)

### Community 76 - "@streamdown/math"
Cohesion: 0.09
Nodes (17): AppShell(), ChangelogDialog(), SECTION_TONE, CodeSidebar(), SessionFilter, DownloadsButton(), TARGET_LABEL, SearchPalette() (+9 more)

### Community 77 - "@streamdown/mermaid"
Cohesion: 0.43
Nodes (7): useIpcSync(), speak(), speakReply(), speakWithSystemVoice(), stopSpeaking(), stripForSpeech(), useSpeechVoices()

### Community 78 - "sucrase"
Cohesion: 0.14
Nodes (22): downloadFile(), DownloadOptions, fileSize(), hashExisting(), ALL_VARIANTS, cleanTranscript(), CLI_NAMES, fetchReleases() (+14 more)

### Community 79 - "tailwind-merge"
Cohesion: 0.08
Nodes (42): awayPosition(), buildDiagram(), BuiltDiagram, clipLine(), degreesOf(), directionOf(), FONT_SIZES, headsSvg() (+34 more)

### Community 80 - "tailwindcss"
Cohesion: 0.83
Nodes (3): niceStep(), Rulers(), STEPS

### Community 81 - "@tailwindcss/browser"
Cohesion: 0.12
Nodes (19): active, buildSideChatPrompt(), clipTranscript(), fitSideMessages(), FRIENDLY_ERRORS, log, parseSideChatRequest(), PENDING_RESULTS (+11 more)

### Community 82 - "@tanstack/react-query"
Cohesion: 0.15
Nodes (12): SideChatEvent, SideChatMessage, ask(), ChatRequest, FakeProvider, msg(), Provider, question() (+4 more)

### Community 83 - "@tanstack/react-router"
Cohesion: 0.32
Nodes (13): snapshotDiscardFile(), folder(), forgetSnapshot(), manifestPath(), queues, readManifest(), serial(), snapshotBeforeChange() (+5 more)

### Community 85 - "@types/react"
Cohesion: 0.07
Nodes (45): cleanupOrphanAttachments(), log, forgetOAuth(), lastAuthUrl, log, pending, clearOAuthState(), OAuthState (+37 more)

### Community 86 - "typescript"
Cohesion: 0.24
Nodes (17): attachmentImage(), artboardPreview(), ensureSession(), exportDesign(), ExportTarget, fileSafe(), imageUrls(), rasterizeGradient() (+9 more)

### Community 88 - "@vitejs/plugin-react"
Cohesion: 0.11
Nodes (20): CHART_KINDS, LAYOUT_NAMES, layoutContent, layoutName, newArtboardId(), newElementId(), newGroupId(), cloneElements() (+12 more)

### Community 89 - "vitest"
Cohesion: 0.22
Nodes (17): addMemory(), pickBackgroundModel(), changed(), clean(), clearMemories(), deleteMemory(), editMemoryWithText(), log (+9 more)

### Community 90 - "zustand"
Cohesion: 0.19
Nodes (13): DesignCard(), DesignEditorPage(), DesignHeader(), DesignHomePage(), errorText(), exportDesign(), FORMAT_ICONS, IDEAS (+5 more)

### Community 94 - "agent-core.test.ts"
Cohesion: 0.07
Nodes (42): absoluteUrl(), htmlToText(), NAMED_ENTITIES, PageText, parseBraveHtml(), parseDuckDuckGoHtml(), parseSearxngJson(), SearchResult (+34 more)

### Community 95 - "Cellar roadmap"
Cohesion: 0.14
Nodes (14): Cellar roadmap, Known gaps and follow-ups from M1, M1 Foundation — delivered, M2 Cowork — original goals, M3 Code — goals, M4 Customize, Scheduled, Voice — goals, M5 Design — goals, M7 Inline capabilities — delivered (+6 more)

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
Cohesion: 0.07
Nodes (47): INIT_PROMPT, IpcInvokeMap, PermissionMode, ConversationSummary, ProjectIndexStatus, ThinkingLevel, ChangedFile, ChangeSet (+39 more)

### Community 100 - "history.ts"
Cohesion: 0.14
Nodes (12): address, approvals, elapsed, logs, outDir, problems, profile, project (+4 more)

### Community 101 - "Workspace"
Cohesion: 0.10
Nodes (28): connectorTool(), connectorToolName(), connectorTools(), diagnosticsTool, forgetTool, objectSchema(), readChatTool, readSkillFileTool (+20 more)

### Community 102 - "orchestrator.ts"
Cohesion: 0.16
Nodes (13): buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), Instance, describeStage(), emptyLoadInfo(), failureHint() (+5 more)

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
Cohesion: 0.12
Nodes (15): answer(), blank, bookFile, chat, exported, ipc(), logs, option (+7 more)

### Community 108 - "monaco.ts"
Cohesion: 0.23
Nodes (10): alpha(), applyTheme(), cssColor(), EXTENSION_LANGUAGES, FILENAME_LANGUAGES, load(), loadMonaco(), Monaco (+2 more)

### Community 109 - "SideChat.tsx"
Cohesion: 0.13
Nodes (3): BrowserService, getWindow(), normalizeUrl()

### Community 110 - "downloadFile"
Cohesion: 0.12
Nodes (20): ChartElement, ChartKind, ChartSeries, ColorToken, DesignElementType, DesignExportFormat, DesignFormat, DesignTransition (+12 more)

### Community 111 - "design/store.ts"
Cohesion: 0.15
Nodes (28): addFontFile(), addGoogleFont(), fontFaceCss(), FontRow, FORMATS, listFonts(), removeFont(), sniffFont() (+20 more)

### Community 112 - "🎨 AI Design Engine: Concept & Specification Document"
Cohesion: 0.29
Nodes (6): 🚀 1. Overview: Bridging the Gap Between Text and Visual Design, 🧱 2. The Limitations of Current Text-Based AI, ✨ 3. The Vision: Desired Capabilities (The Next-Generation AI), 🛠️ 4. Technical Feature Checklist (The Design Specification), 🧠 5. AI Self-Assessment and Self-Identified Issues, 🎨 AI Design Engine: Concept & Specification Document

### Community 113 - "CodeModeMenu.tsx"
Cohesion: 0.52
Nodes (6): CODE_MODE_OPTIONS, codeModeKey(), CodeModeMenu(), CodeModeValue, nextCodeMode(), Option

### Community 114 - "code-changes.test.ts"
Cohesion: 0.05
Nodes (37): cmdk, electron, electron-builder, electron-vite, monaco-editor, devDependencies, cmdk, electron (+29 more)

### Community 115 - "stores/code.ts"
Cohesion: 0.33
Nodes (5): CodePane, CodeUiState, EditorRequest, PreviewRequest, useCodeUi

### Community 116 - "monaco-editor"
Cohesion: 0.24
Nodes (4): ModuleId, asString(), ModuleRegistry, optString()

### Community 118 - "TerminalPane.tsx"
Cohesion: 0.14
Nodes (16): describeLocation(), FoundGroup, inspectLocalGguf(), LocalModel, localModelId(), LocalModelIndex, localModels, log (+8 more)

### Community 119 - "@types/react-dom"
Cohesion: 0.05
Nodes (34): session(), bundled(), detectLanguage(), fromLspRange(), fromUri(), LanguageServer, LspManager, normalizeLocations() (+26 more)

### Community 120 - "@xterm/addon-fit"
Cohesion: 0.17
Nodes (12): scripts, build, build:win, dev, preview, runtime:artifacts, test, test:e2e (+4 more)

### Community 121 - "@xterm/addon-web-links"
Cohesion: 0.21
Nodes (14): now(), HighlightView(), hitTest(), ItemProps, MarkView(), NotePin(), OverlayProps, PageOverlay() (+6 more)

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
Cohesion: 0.26
Nodes (11): DARK_ANSI, LIGHT_ANSI, message(), openLink(), previewUrl(), readTheme(), SessionTerminals(), TerminalView() (+3 more)

### Community 130 - "DownloadManager"
Cohesion: 0.17
Nodes (15): AnnotationBase, Book, BookChat, BookSummary, HighlightAnnotation, InkAnnotation, MarkAnnotation, NoteAnnotation (+7 more)

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
Nodes (6): parseNDJSON(), parseSSE(), partialSuffix(), readLines(), SplitPart, ThinkTagSplitter

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
Cohesion: 0.06
Nodes (39): BINARY_EXTENSIONS, count(), describeWrite(), editFileTool, globTool, grepTool, IMAGE_EXTENSIONS, isBinary() (+31 more)

### Community 141 - "dictation.ts"
Cohesion: 0.29
Nodes (5): DARK_PALETTE, LIGHT_PALETTE, readVizTheme(), useVizTheme(), VizTheme

### Community 144 - "electron-vite"
Cohesion: 0.16
Nodes (8): Composer(), ComposerProps, NOT_SAVED, updateMemoryFromChat(), ModelPicker(), APPROVAL_MODES, ToolsDialog(), ToolsMenu()

### Community 145 - "package.json"
Cohesion: 0.22
Nodes (8): author, description, license, main, name, private, productName, version

### Community 146 - "code-session.test.ts"
Cohesion: 0.16
Nodes (10): encodeWav(), findSilenceBoundary(), SilenceOptions, GpuInfo, HardwareInfo, RuntimeDevice, RuntimeInfo, RuntimeInstallProgress (+2 more)

### Community 147 - "images.ts"
Cohesion: 0.22
Nodes (10): completionKindMap(), DocInfo, docs, documentUri(), LSP_LANGUAGES, parseDocumentUri(), registerLspProviders(), SEVERITY_MAP() (+2 more)

### Community 148 - "sessions.ts"
Cohesion: 0.25
Nodes (11): detectReasoningStyle(), EMBEDDING_ARCHES, FILE_TYPE_NAMES, isEmbeddingModel(), num(), numOrArray(), slimMetadata(), summarizeGguf() (+3 more)

### Community 149 - "quants.ts"
Cohesion: 0.14
Nodes (5): RoundOptions, FitResult, SideChatPrompt, Provider, ProviderMessage

### Community 150 - "terminal.test.ts"
Cohesion: 0.11
Nodes (18): 1. Backend: `src/main/plugins/marketplace.ts`, 2. Types: `src/shared/types/customize.ts`, 3. IPC Handlers: `src/main/ipc/m4-handlers.ts`, 4. UI: `src/renderer/src/pages/PluginsPage.tsx`, 5. Integration: Customize Page, Architecture Overview, Files created:, Files modified: (+10 more)

### Community 151 - "AppShell.tsx"
Cohesion: 0.15
Nodes (8): project, lastUserText(), MockRequest, MockServer, sleep(), startMockServer(), VIZ_CDN_REPLY, VIZ_REPLY

### Community 152 - "snapshots.ts"
Cohesion: 0.13
Nodes (18): ThemePanel(), clampSize(), COLOR_TOKENS, FontCategory, FONTS, FORMAT_DEFAULTS, gradientStops(), hex6() (+10 more)

### Community 153 - "@tanstack/react-query"
Cohesion: 0.26
Nodes (10): drawAnnotations(), renderPageCanvas(), renderPagePng(), wrapLines(), PDFViewerInstance, SelectionInfo, selectionOnPage(), StudyViewer() (+2 more)

### Community 154 - "@vitejs/plugin-react"
Cohesion: 0.36
Nodes (10): basename(), GroupedRepoFiles, groupQuantFiles(), isAuxiliaryGguf(), isMmprojFile(), parentName(), preferredMmproj(), quantBits() (+2 more)

### Community 155 - "snapshots.ts"
Cohesion: 0.48
Nodes (6): base64Of(), copyPng(), loadImage(), paint(), pngOnBackground(), svgToPng()

### Community 156 - "LmStudioProvider"
Cohesion: 0.25
Nodes (16): builtInCommands(), changed(), commandSlug(), customCommands(), deleteCommand(), expandCommand(), expandTemplate(), getCommand() (+8 more)

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
Cohesion: 0.20
Nodes (9): BookScope, DEFAULT_SCOPE, keep(), PicturesMode, StudyEditorState, StudyLayoutState, StudyTool, useStudyEditor (+1 more)

### Community 159 - "charts.ts"
Cohesion: 0.26
Nodes (13): ChartRenderOptions, chartSvg(), clamp(), formatValue(), niceScale(), r1(), truncate(), wrap() (+5 more)

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
Cohesion: 0.43
Nodes (6): dayKey(), formatHour(), getUsageStats(), RANGE_DAYS, startOfDay(), UsageRow

### Community 167 - "network.test.ts"
Cohesion: 0.17
Nodes (13): backendsFromFiles(), bestRuntime(), exec, findServerDir(), idForDir(), log, parseDevicesOutput(), parseReleaseAssets() (+5 more)

### Community 168 - "react"
Cohesion: 0.53
Nodes (5): fetchWithTimeout(), DuckDuckGoImage, fetchVqd(), ImageResult, searchImage()

### Community 169 - "electron-vite"
Cohesion: 0.07
Nodes (45): CATEGORY_KEYWORDS, computeRelevanceScore(), computeTopicVectorScores(), computeVectorSimilarity(), getTopicById(), listAllExplicitMemories(), listAllMemoryTopics(), log (+37 more)

### Community 170 - "@tailwindcss/browser"
Cohesion: 0.13
Nodes (14): 1. `src/shared/types/chat.ts` — Added `ContextInfo` interface + reasoningMs, 2. `src/shared/ipc-contract.ts` — Added IPC channel definition, 3. `src/main/customize/commands.ts` — Registered `/context` as built-in command, 4. `src/main/chat/orchestrator.ts` — Added `contextInfo()` method (~100 lines), 5. `src/main/ipc/handlers.ts` — Registered IPC handler, 6. `src/renderer/src/components/chat/ContextInfoPanel.tsx` — Visual component (137 lines, UPDATED), 7. `src/renderer/src/components/composer/Composer.tsx` — Wired up `/context` handling, Changelog of changes from initial version (+6 more)

### Community 171 - "@tanstack/react-router"
Cohesion: 0.40
Nodes (5): EstimateInput, isSlidingLayer(), KV_BYTES_PER_ELEMENT, kvBytesPerLayer(), MemoryBudget

### Community 172 - "dictation.ts"
Cohesion: 0.24
Nodes (8): DictationState, join(), toSpeechSamples(), useDictation(), FONTS_QUERY_KEY, useCustomFonts(), useFontsQuery(), cleanIpcError()

### Community 173 - "lucide-react"
Cohesion: 0.20
Nodes (17): blockText(), handleSampling(), messageContent(), defaultPreset(), getPreset(), resetPreset(), savePreset(), deleteModel() (+9 more)

### Community 176 - "radix-ui"
Cohesion: 0.47
Nodes (4): BOM, commit(), makeRepo(), sh()

### Community 178 - "streamdown"
Cohesion: 0.40
Nodes (3): CHANGELOG, ChangelogEntry, ChangelogSection

### Community 181 - "@streamdown/mermaid"
Cohesion: 0.40
Nodes (3): ChecksumError, payload, sha

### Community 183 - "vscode-languageserver-protocol"
Cohesion: 0.83
Nodes (3): ArtifactPanel(), fence(), IFRAME_TYPES

### Community 184 - "@xterm/addon-fit"
Cohesion: 0.67
Nodes (3): Known gaps and follow-ups from M9, M9 Study — delivered (2026-09-23), Technical notes learned in M9

### Community 186 - "PreviewPane.tsx"
Cohesion: 0.21
Nodes (11): displayAddress(), externalLink(), handledRequests, isPdf(), Preview(), previewPath(), PreviewState, run() (+3 more)

### Community 189 - "Next improvements"
Cohesion: 0.17
Nodes (11): 1. Math: read a photo of handwritten work into a board — small, high value ✅ shipped, 2. Cowork/Code: `run_command` cannot run anything long-lived — medium ✅ shipped, 3. `read_file` can't read legacy Office formats (.doc/.xls/.ppt) — medium ✅ shipped, differently, 4. Design: rich text spans and growing text boxes — larger ✅ shipped, 5. Math solvers: nonlinear systems and geometry beyond triangles — larger, niche ✅ shipped, Larger, still genuinely open, Next improvements, Not code work (deprioritized here) (+3 more)

### Community 191 - "artboardsToPptx"
Cohesion: 0.26
Nodes (8): pptxgenjs, pptxgenjs, artboardsToPptx(), CHART_TYPES, hyperlinkFor(), PptxAssets, textRuns(), transparency()

### Community 192 - "tools/background.ts"
Cohesion: 0.21
Nodes (10): ANSI, BackgroundCommand, BackgroundCommandStatus, commands, disposeBackgroundCommands(), ESC, evictOldEnded(), killTree() (+2 more)

### Community 193 - "quants.ts"
Cohesion: 0.11
Nodes (28): ACTIVE, downloads, log, Row, computeQuantFit(), fitCache, fitInflight, fitWaiters (+20 more)

### Community 194 - "command.ts"
Cohesion: 0.18
Nodes (11): ANSI, ESC, killTree(), runCommand, runShell(), ShellOptions, ShellResult, report() (+3 more)

### Community 195 - ".content"
Cohesion: 0.27
Nodes (9): EMPTY, historyOf(), LiveReply, newRequestId(), requestMessages(), settle(), SideChat(), SideEntry (+1 more)

### Community 197 - "TtsService"
Cohesion: 0.10
Nodes (25): ActiveGeneration, chat, log, TurnFinished, throttle(), log, RunRow, TaskRow (+17 more)

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

### Community 213 - "M8.2 Playground (v7.6.0)"
Cohesion: 0.67
Nodes (3): Following up with one model (v7.7.0), M8.2 Playground (v7.6.0), Technical notes learned in M8.2

### Community 214 - "M5 Design — delivered"
Cohesion: 0.67
Nodes (3): Known gaps and follow-ups from M5, M5.1 Canvas polish, real export fidelity, and a model that can see its own canvas, M5 Design — delivered

### Community 215 - "M6 Math — delivered"
Cohesion: 0.67
Nodes (3): Known gaps and follow-ups from M6, M6 follow-up: drawing on the board step by step (2026-09-22), M6 Math — delivered

## Knowledge Gaps
- **1064 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+1059 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `value()` connect `@playwright/test` to `queries.ts`, `chat.test.ts`, `openai-compat.ts`, `handlers.ts`, `fetchWithTimeout`, `sessions.ts`, `SettingsPage.tsx`, `types/models.ts`, `OpenAIServerProvider`, `charts.ts`, `ProviderRegistry`, `MathPage.tsx`, `window.ts`, `CellarBridge`, `DiscoverPage.tsx`, `ModelsPage.tsx`, `electron`, `electron-builder`, `TtsService`, `streamdown`, `tailwind-merge`, `Workspace`, `SideChat.tsx`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Why does `paths()` connect `TtsService` to `hf-api.ts`, `ChatOrchestrator`, `engine.ts`, `.resolve`, `openai-compat.ts`, `DownloadManager`, `handlers.ts`, `electron-vite`, `router.tsx`, `types/models.ts`, `LmStudioProvider`, `MemoryChatStore`, `network.test.ts`, `.update`, `electron-vite`, `@fontsource-variable/inter`, `@fontsource-variable/source-serif-4`, `OpenAIServerProvider`, `sucrase`, `@tanstack/react-router`, `@types/react`, `typescript`, `zustand`, `tools/types.ts`, `design/store.ts`, `monaco-editor`, `TerminalPane.tsx`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `errorMessage()` connect `Sidebar.tsx` to `hf-api.ts`, `ChatOrchestrator`, `engine.ts`, `.resolve`, `main/index.ts`, `ArtifactPanel`, `handlers.ts`, `fetchWithTimeout`, `types/models.ts`, `OpenAIServerProvider`, `MemoryChatStore`, `ProviderRegistry`, `network.test.ts`, `.update`, `electron-vite`, `quants.ts`, `electron-vite`, `@fontsource-variable/inter`, `TtsService`, `artifact-protocol.ts`, `radix-ui`, `sucrase`, `@tailwindcss/browser`, `@types/react`, `vitest`, `tools/types.ts`, `SideChat.tsx`, `monaco-editor`, `TerminalPane.tsx`, `@types/react-dom`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `paths()` (e.g. with `registerDesignHandlers()` and `registerStudyHandlers()`) actually correct?**
  _`paths()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _1064 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `queries.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06169772256728778 - nodes in this community are weakly interconnected._
- **Should `ChatOrchestrator` be split into smaller, more focused modules?**
  _Cohesion score 0.05025773195876289 - nodes in this community are weakly interconnected._