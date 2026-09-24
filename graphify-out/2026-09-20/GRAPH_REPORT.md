# Graph Report - Cellar  (2026-09-19)

## Corpus Check
- 316 files · ~353,986 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3918 nodes · 9594 edges · 182 communities (146 shown, 36 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 195 edges (avg confidence: 0.73)
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
- @streamdown/code
- electron-vite
- @types/react-dom
- @tanstack/react-router
- dictation.ts
- lucide-react
- lucide-react
- @playwright/test
- streamdown
- tailwind-merge
- @streamdown/mermaid
- sucrase
- vscode-languageserver-protocol
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
- `markdownToHtmlPage()` --references--> `marked`  [EXTRACTED]
  src/main/agent/documents.ts → package.json

## Import Cycles
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/call.ts -> src/main/modules/registry.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`
- 5-file cycle: `src/main/agent/runner.ts -> src/main/agent/tools/index.ts -> src/main/agent/tools/reminder.ts -> src/main/scheduled/scheduler.ts -> src/main/chat/orchestrator.ts -> src/main/agent/runner.ts`

## Communities (182 total, 36 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.19
Nodes (23): changed(), countEntries(), describe(), enabledPlugins(), exec, expandPluginVars(), findPluginRoots(), installPlugin() (+15 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.10
Nodes (20): LocalModel, buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), formatParamCount(), freePort(), Instance (+12 more)

### Community 2 - "queries.ts"
Cohesion: 0.08
Nodes (49): exactZero, Node, angleArc(), buildFigure(), BuiltFigure, centroid(), completeRightTriangle(), DEFAULT_LABELS (+41 more)

### Community 3 - "ChatOrchestrator"
Cohesion: 0.12
Nodes (3): ChatOrchestrator, prepareDesignSession(), prepareMathSession()

### Community 4 - "engine.ts"
Cohesion: 0.06
Nodes (67): disposeBackgroundCommands(), registerBrowserHandlers(), attachmentFromBytes(), attachmentRefs(), attachmentsFromPaths(), classifyFile(), cleanupOrphanAttachments(), extractPdfText() (+59 more)

### Community 5 - "run"
Cohesion: 0.17
Nodes (20): exportBoard(), ExportTarget, fileSafe(), angleMode, paper, registerMathHandlers(), topic, BoardConflictError (+12 more)

### Community 6 - "scripts"
Cohesion: 0.06
Nodes (33): croner, docx, electron-updater, exceljs, extract-zip, @huggingface/gguf, marked, @modelcontextprotocol/sdk (+25 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.13
Nodes (21): buildSystemPrompt(), chatToolGuidance(), cleanTitle(), fallbackTitle(), SystemPromptInput, artifactTypeFor(), deriveArtifactTitle(), LANGUAGE_TYPES (+13 more)

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
Cohesion: 0.09
Nodes (37): computeQuantFit(), fitCache, fitInflight, fitWaiters, hfHeaders(), hfJson(), quantFit(), repoCache (+29 more)

### Community 12 - "main/index.ts"
Cohesion: 0.10
Nodes (23): ANSI, BackgroundCommand, BackgroundCommandStatus, commands, ESC, evictOldEnded(), killTree(), readBackgroundCommand() (+15 more)

### Community 13 - "DownloadManager"
Cohesion: 0.10
Nodes (10): ChartSection(), chartToCsv(), csvToChart(), ElementPanel(), ImportFontButton(), Layers(), patch(), TextSection() (+2 more)

### Community 14 - "handlers.ts"
Cohesion: 0.17
Nodes (23): ExtractedTopic, initAutoMemory(), log, nothing(), parseExtraction(), pending, pickBackgroundModel(), runAutoMemory() (+15 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.04
Nodes (95): AppCommand, AppInfo, BackgroundStatus, EVENT_CHANNELS, EventChannel, eventChannelFlags, Handler, INVOKE_CHANNELS (+87 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.11
Nodes (10): hostOf(), joinReasoning(), joinText(), LiveRun, stableJson(), TaskRunInput, TaskRunner, TaskRunnerHooks (+2 more)

### Community 17 - "Messages.tsx"
Cohesion: 0.07
Nodes (20): ARTIFACT_ICONS, ARTIFACT_LABELS, ArtifactCard(), AttachmentImage(), attachmentImageUrl(), Lightbox(), MessageAttachments(), InlineImage() (+12 more)

### Community 18 - "fetchWithTimeout"
Cohesion: 0.15
Nodes (12): argumentsObject(), OllamaChatLine, ollamaOptions(), OllamaProvider, OllamaPs, OllamaPullProgress, OllamaShow, OllamaTag (+4 more)

### Community 19 - "button.tsx"
Cohesion: 0.12
Nodes (9): Button, ButtonProps, IconButton, IconButtonProps, Size, sizes, Variant, variants (+1 more)

### Community 20 - "router.tsx"
Cohesion: 0.07
Nodes (21): AppShell(), ChatPage(), CustomizePage(), DiscoverPage(), PUBLISHERS, ArtifactsPage(), RecentsPage(), ModelsPage() (+13 more)

### Community 21 - "LoadSettingsDialog.tsx"
Cohesion: 0.15
Nodes (10): CapabilityIcons(), FIT_COPY, FitBadge(), MemoryBars(), PROVIDER_LABEL, providerStateDot(), ProviderStatusDot(), CONTEXT_STEPS (+2 more)

### Community 22 - "stream-parsers.ts"
Cohesion: 0.12
Nodes (19): expandToGroups(), imagesFromFiles(), isWholeGroup(), AddArtboardButton(), Box, boxFor(), DesignCanvas(), Drag (+11 more)

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.07
Nodes (10): ACCENTS, CHART_COLORS, dayLabel(), Heatmap(), LANGUAGES, SECTIONS, SHORTCUTS, UsageModels() (+2 more)

### Community 24 - "types/models.ts"
Cohesion: 0.08
Nodes (40): CalcOptions, CalcResult, Exact, isRational(), AngleMode, DerivativeInput, flipOp(), GeometryInput (+32 more)

### Community 25 - "provider-configs.ts"
Cohesion: 0.07
Nodes (24): browseBack, browseClearSession, browseClick, browseElements, browseFill, browseFindLink, browseForward, browseLoginStatus (+16 more)

### Community 26 - "hub.ts"
Cohesion: 0.07
Nodes (29): coworkGuidance, parseParamsBillions(), DownloadFileState, DownloadJob, DownloadStatus, DownloadTarget, HfFile, HfModelSummary (+21 more)

### Community 27 - ".doScan"
Cohesion: 0.08
Nodes (26): pdfAvailable(), chatBaseTools(), CODE_TOOLS, codeToolsFor(), extraTools(), toolsFor(), AgentTool, describe() (+18 more)

### Community 28 - "LmStudioProvider"
Cohesion: 0.18
Nodes (16): effectiveThinking(), isChatCapable(), thinkingLabel(), thinkingOptions(), useAppCommands(), useBrowserReveal(), useSelectedModel(), useThemeSync() (+8 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.10
Nodes (35): exists(), inside(), Workspace, listDirectory(), writeWorkspaceFile(), codeSession(), CodeSessionContext, BASE_HEADERS (+27 more)

### Community 30 - "OpenAIServerProvider"
Cohesion: 0.17
Nodes (14): newToolCallId(), RoundOptions, asObject(), CallSplitPart, describeType(), escapeControlCharsInStrings(), ParsedTextCall, parseLooseJson() (+6 more)

### Community 31 - "MemoryChatStore"
Cohesion: 0.19
Nodes (25): chatTaskState(), activeSkills(), allSkills(), changed(), claudeSkillsAvailable(), copySkill(), deleteSkill(), findActiveSkill() (+17 more)

### Community 32 - "ProviderRegistry"
Cohesion: 0.12
Nodes (19): fetchWithTimeout(), backendsFromFiles(), bestRuntime(), exec, findServerDir(), idForDir(), log, parseDevicesOutput() (+11 more)

### Community 33 - "Sidebar.tsx"
Cohesion: 0.18
Nodes (14): browser, boundsSchema, tabId, url, clearDomainSession(), cookieUrl(), DIR, ensureDir() (+6 more)

### Community 34 - "Provider"
Cohesion: 0.18
Nodes (28): abortMerge(), baseBlob(), byPath(), commitAll(), conflictedFiles(), continueMerge(), deleteNewFile(), existsInBase() (+20 more)

### Community 35 - "form.tsx"
Cohesion: 0.20
Nodes (3): Input, SelectOption, Textarea

### Community 36 - "devDependencies"
Cohesion: 0.04
Nodes (44): 0.1.0 — 2026-09-13, 2.0.0 — 2026-09-14, 3.0.0 — 2026-09-14, 4.0.0 — 2026-09-15, 5.0.0 — 2026-09-15, 6.0.0 — 2026-09-16, 7.0.0 — 2026-09-16, 7.0.1 — 2026-09-16 (+36 more)

### Community 37 - "chat-smoke.mjs"
Cohesion: 0.22
Nodes (8): elapsed, logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3:0.6b', prompt = 'Say hello in five words.', shot = 'chat'], started

### Community 39 - "ModelRef"
Cohesion: 0.08
Nodes (15): ToolContext, attachPreview(), contentSchema, createArtboardTool, deleteArtboardTool, DESIGN_TOOLS, designId(), editElementsTool (+7 more)

### Community 40 - "build-artifact-runtime.mjs"
Cohesion: 0.25
Nodes (6): entry, outDir, output, root, tailwindOutput, tailwindSource

### Community 41 - ".update"
Cohesion: 0.05
Nodes (18): ConnectorManager, defaultPolicy(), Live, renderToolResult(), signatureOf(), toolPolicy(), toolResultImages(), withTimeout() (+10 more)

### Community 42 - "window.ts"
Cohesion: 0.17
Nodes (23): hideQuickEntry(), openConversation(), addMemory(), updateMemoryFromConversation(), changed(), clean(), clearMemories(), deleteMemory() (+15 more)

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
Nodes (38): ToolPart, StreamEvent, ModelEntry, BUILTIN_PROVIDER_IDS, ProviderConfig, ProviderConfigInput, ProviderKind, ProviderState (+30 more)

### Community 51 - "verify-packaged.mjs"
Cohesion: 0.33
Nodes (4): exe, exportDir, local, project

### Community 52 - "DiscoverPage.tsx"
Cohesion: 0.08
Nodes (33): ChangesPane(), Counts(), errorText(), FileRow(), FileRowProps, num(), splitPath(), STATUS (+25 more)

### Community 53 - "ModelsPage.tsx"
Cohesion: 0.13
Nodes (29): normalizeChart(), canonicalFields(), clamp(), color(), FORMATS, gradient(), imageCrop(), imageFilters() (+21 more)

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
Cohesion: 0.07
Nodes (51): jszip, jszip, blockElements(), cellValue(), CFB_MAGIC, chartFromCode(), chartTable(), createPptx() (+43 more)

### Community 63 - "cmdk"
Cohesion: 0.21
Nodes (25): escapeXml(), findArtboard(), artboardHtml(), artboardStyle(), artboardSvg(), boxStyle(), cssText(), designHtml() (+17 more)

### Community 64 - "electron"
Cohesion: 0.16
Nodes (39): asRational(), exactAdd(), exactDiv(), exactFromNumber(), exactInt(), exactInverse(), exactIsZero(), exactMul() (+31 more)

### Community 65 - "electron-builder"
Cohesion: 0.11
Nodes (20): cell, createDocx, createPdf, createPptx, createXlsx, DOCUMENT_EXTENSIONS, documentOptions(), documentPath() (+12 more)

### Community 66 - "electron-vite"
Cohesion: 0.10
Nodes (29): historyTokens(), ToolProtocol, AgentPromptInput, buildAgentPrompt(), compactionRequest(), agentNoun(), autoApproveAction(), log (+21 more)

### Community 67 - "@fontsource-variable/inter"
Cohesion: 0.16
Nodes (15): conversationIdSchema, CreateTerminalOptions, dataSchema, envValue(), findOnPath(), idSchema, log, lstatExists() (+7 more)

### Community 68 - "@fontsource-variable/source-serif-4"
Cohesion: 0.15
Nodes (20): branchExists(), branchSlug(), createWorktree(), findMemoryFile(), gitAvailable(), GitError, GitOptions, GitResult (+12 more)

### Community 70 - "@playwright/test"
Cohesion: 0.11
Nodes (40): blockType(), FIGURE_KINDS, figureKindOf(), isObject(), LIMITS, Loose, measureList(), nextBlockId() (+32 more)

### Community 71 - "radix-ui"
Cohesion: 0.16
Nodes (10): encodeWav(), findSilenceBoundary(), SilenceOptions, GpuInfo, HardwareInfo, RuntimeDevice, RuntimeInfo, RuntimeInstallProgress (+2 more)

### Community 72 - "react"
Cohesion: 0.12
Nodes (10): ChatRequest, currentEntry, fake, FakeProvider, finished(), message(), Provider, Script (+2 more)

### Community 73 - "react-dom"
Cohesion: 0.13
Nodes (18): PREVIEW_SCHEME_PRIVILEGES, ARTIFACT_CSP, escapeScript(), handleArtifactProtocol(), registerArtifactScheme(), renderArtifactDocument(), RUNTIME_FILES, handleVizProtocol() (+10 more)

### Community 74 - "streamdown"
Cohesion: 0.16
Nodes (14): pptxgenjs, pptxgenjs, artboardsToPptx(), CHART_TYPES, hyperlinkFor(), PptxAssets, textRuns(), transparency() (+6 more)

### Community 75 - "@streamdown/code"
Cohesion: 0.11
Nodes (28): area(), arithmetic(), Draft, fractions(), fromSolution(), GeneratedQuiz, generateQuiz(), GENERATORS (+20 more)

### Community 76 - "@streamdown/math"
Cohesion: 0.19
Nodes (9): CodeSidebar(), SessionFilter, DownloadsButton(), TARGET_LABEL, Icon, NavItem(), ProfileMenuContent(), RecentFilter (+1 more)

### Community 77 - "@streamdown/mermaid"
Cohesion: 0.43
Nodes (7): useIpcSync(), speak(), speakReply(), speakWithSystemVoice(), stopSpeaking(), stripForSpeech(), useSpeechVoices()

### Community 78 - "sucrase"
Cohesion: 0.15
Nodes (20): recommendedWhisperVariant(), ALL_VARIANTS, cleanTranscript(), CLI_NAMES, fetchReleases(), findCli(), installing, log (+12 more)

### Community 79 - "tailwind-merge"
Cohesion: 0.16
Nodes (22): snapshotDiscardFile(), relPath(), removeWorktree(), codeMode, id, log, positionSchema, registerCodeHandlers() (+14 more)

### Community 80 - "tailwindcss"
Cohesion: 0.83
Nodes (3): niceStep(), Rulers(), STEPS

### Community 81 - "@tailwindcss/browser"
Cohesion: 0.10
Nodes (27): FitResult, fitToContext(), messageTokens(), toTurns(), truncateMiddle(), active, buildSideChatPrompt(), clipTranscript() (+19 more)

### Community 82 - "@tanstack/react-query"
Cohesion: 0.15
Nodes (12): SideChatEvent, SideChatMessage, ask(), ChatRequest, FakeProvider, msg(), Provider, question() (+4 more)

### Community 83 - "@tanstack/react-router"
Cohesion: 0.23
Nodes (19): BOM, byPath(), countable(), readWorkspaceFile(), snapshotChangeSet(), snapshotFileDiff(), WriteOptions, buildDiff() (+11 more)

### Community 85 - "@types/react"
Cohesion: 0.06
Nodes (45): forgetOAuth(), lastAuthUrl, log, pending, clearOAuthState(), OAuthState, Row, saveClientInformation() (+37 more)

### Community 86 - "typescript"
Cohesion: 0.25
Nodes (16): builtInCommands(), changed(), commandSlug(), customCommands(), deleteCommand(), expandCommand(), expandTemplate(), getCommand() (+8 more)

### Community 88 - "@vitejs/plugin-react"
Cohesion: 0.12
Nodes (28): backgroundAt(), checkArtboard(), intersects(), short(), clamp(), LAYOUT_NAMES, layoutElements(), layoutName (+20 more)

### Community 89 - "vitest"
Cohesion: 0.18
Nodes (12): ChartRenderOptions, layoutContent, newGroupId(), NormalizeContext, cloneElements(), describeArtboard(), describeElement(), duplicateArtboard() (+4 more)

### Community 90 - "zustand"
Cohesion: 0.19
Nodes (13): DesignCard(), DesignEditorPage(), DesignHeader(), DesignHomePage(), errorText(), exportDesign(), FORMAT_ICONS, IDEAS (+5 more)

### Community 94 - "agent-core.test.ts"
Cohesion: 0.13
Nodes (30): absoluteUrl(), decodeEntities(), htmlToText(), NAMED_ENTITIES, PageText, parseBraveHtml(), parseDuckDuckGoHtml(), parseSearxngJson() (+22 more)

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
Cohesion: 0.12
Nodes (19): INIT_PROMPT, PermissionMode, MessageModelInfo, ProjectIndexStatus, CodeMode, ModelRef, CronPreview, ReminderSpec (+11 more)

### Community 100 - "history.ts"
Cohesion: 0.14
Nodes (12): address, approvals, elapsed, logs, outDir, problems, profile, project (+4 more)

### Community 101 - "Workspace"
Cohesion: 0.08
Nodes (35): callTool, moduleId, normalizeCallArgs(), connectorTool(), connectorToolName(), connectorTools(), diagnosticsTool, forgetTool (+27 more)

### Community 102 - "orchestrator.ts"
Cohesion: 0.29
Nodes (13): buildTaskHistory(), callImages(), groupRounds(), HistoryOptions, latestCompaction(), resultForModel(), Round, roundsToMessages() (+5 more)

### Community 103 - "util.ts"
Cohesion: 0.18
Nodes (20): addArtboard(), addElement(), AlignEdge, alignSelection(), copySelection(), deleteArtboard(), deleteSelection(), duplicateSelection() (+12 more)

### Community 104 - "client.ts"
Cohesion: 0.20
Nodes (11): CodeHomePage(), CodeSessionPage(), errorText(), folderName(), IDEAS, PANES, PlanReady(), RepoPicker() (+3 more)

### Community 106 - "ToolStep.tsx"
Cohesion: 0.09
Nodes (23): AgentParts(), Block, toBlocks(), ChangeDiff(), ChangesSection(), errorText(), run(), searchLabel() (+15 more)

### Community 107 - "TaskSidePanel.tsx"
Cohesion: 0.05
Nodes (60): escapeRegex(), globFiles(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry, WalkOptions (+52 more)

### Community 108 - "monaco.ts"
Cohesion: 0.26
Nodes (9): alpha(), applyTheme(), cssColor(), EXTENSION_LANGUAGES, FILENAME_LANGUAGES, load(), loadMonaco(), registerJson() (+1 more)

### Community 109 - "SideChat.tsx"
Cohesion: 0.06
Nodes (20): BrowserService, getWindow(), normalizeUrl(), EMPTY, historyOf(), LiveReply, newRequestId(), requestMessages() (+12 more)

### Community 110 - "downloadFile"
Cohesion: 0.11
Nodes (22): ChartElement, ChartKind, ChartSeries, ColorToken, DesignElementType, DesignExportFormat, DesignFormat, DesignTransition (+14 more)

### Community 111 - "design/store.ts"
Cohesion: 0.10
Nodes (48): attachmentImage(), get(), artboardPreview(), ensureSession(), exportDesign(), ExportTarget, fileSafe(), imageUrls() (+40 more)

### Community 112 - "🎨 AI Design Engine: Concept & Specification Document"
Cohesion: 0.29
Nodes (6): 🚀 1. Overview: Bridging the Gap Between Text and Visual Design, 🧱 2. The Limitations of Current Text-Based AI, ✨ 3. The Vision: Desired Capabilities (The Next-Generation AI), 🛠️ 4. Technical Feature Checklist (The Design Specification), 🧠 5. AI Self-Assessment and Self-Identified Issues, 🎨 AI Design Engine: Concept & Specification Document

### Community 113 - "CodeModeMenu.tsx"
Cohesion: 0.52
Nodes (6): CODE_MODE_OPTIONS, codeModeKey(), CodeModeMenu(), CodeModeValue, nextCodeMode(), Option

### Community 114 - "code-changes.test.ts"
Cohesion: 0.06
Nodes (33): cmdk, electron-builder, electron-vite, @fontsource-variable/source-serif-4, monaco-editor, devDependencies, cmdk, electron-builder (+25 more)

### Community 115 - "stores/code.ts"
Cohesion: 0.33
Nodes (5): CodePane, CodeUiState, EditorRequest, PreviewRequest, useCodeUi

### Community 116 - "monaco-editor"
Cohesion: 0.05
Nodes (35): describeModules(), MODULE_ACTIONS, ModuleAction, ModuleId, moduleReadOnly(), READ_ONLY_ACTIONS, RESERVED_ACTIONS, asString() (+27 more)

### Community 118 - "TerminalPane.tsx"
Cohesion: 0.17
Nodes (13): describeLocation(), FoundGroup, inspectLocalGguf(), localModelId(), LocalModelIndex, localModels, log, pickMmproj() (+5 more)

### Community 120 - "@xterm/addon-fit"
Cohesion: 0.17
Nodes (12): scripts, build, build:win, dev, preview, runtime:artifacts, test, test:e2e (+4 more)

### Community 121 - "@xterm/addon-web-links"
Cohesion: 0.27
Nodes (9): ChartSpec, ChatChartSpec, parseChartSpec(), ParsedViz, parseVizBlocks(), tolerantJson(), vizFileName(), VizKind (+1 more)

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
Cohesion: 0.15
Nodes (27): adaptiveSimpson(), add(), antiderivativePolynomial(), asPolynomial(), bareTermOf(), CalculusError, call(), collectPolynomialTerms() (+19 more)

### Community 129 - "commands.ts"
Cohesion: 0.21
Nodes (13): DARK_ANSI, LIGHT_ANSI, message(), openLink(), previewUrl(), readTheme(), SessionTerminals(), TerminalView() (+5 more)

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
Nodes (26): attachCloseToTray(), backgroundActive(), createMain(), getMain(), iconPath(), installBackground(), isQuitting(), log (+18 more)

### Community 137 - "quants.ts"
Cohesion: 0.15
Nodes (10): ArtboardThumbnail(), ArtboardView(), css(), ElementView, ElementViewProps, Present(), SLIDE_OFFSET, transitionStyle() (+2 more)

### Community 140 - "streams.ts"
Cohesion: 0.14
Nodes (18): BINARY_EXTENSIONS, count(), describeWrite(), editFileTool, globTool, grepTool, IMAGE_EXTENSIONS, isBinary() (+10 more)

### Community 141 - "dictation.ts"
Cohesion: 0.29
Nodes (6): DARK_PALETTE, LIGHT_PALETTE, readVizTheme(), useVizTheme(), vizCssVariables(), VizTheme

### Community 144 - "electron-vite"
Cohesion: 0.24
Nodes (5): ChangelogDialog(), SECTION_TONE, SearchPalette(), Sidebar(), TitleBar()

### Community 145 - "package.json"
Cohesion: 0.22
Nodes (8): author, description, license, main, name, private, productName, version

### Community 146 - "code-session.test.ts"
Cohesion: 0.05
Nodes (51): AgentPart, ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, ConversationKind, ReasoningPart, TaskFile (+43 more)

### Community 147 - "images.ts"
Cohesion: 0.20
Nodes (11): completionKindMap(), DocInfo, docs, documentUri(), LSP_LANGUAGES, parseDocumentUri(), registerLspProviders(), SEVERITY_MAP() (+3 more)

### Community 148 - "sessions.ts"
Cohesion: 0.09
Nodes (26): DownloadManager, basename(), GroupedRepoFiles, groupQuantFiles(), isAuxiliaryGguf(), isMmprojFile(), parentName(), preferredMmproj() (+18 more)

### Community 152 - "snapshots.ts"
Cohesion: 0.12
Nodes (19): CHART_KINDS, ARTBOARD_PRESETS, clampSize(), COLOR_TOKENS, customizeTheme(), FontCategory, FORMAT_DEFAULTS, gradientStops() (+11 more)

### Community 153 - "@tanstack/react-query"
Cohesion: 0.22
Nodes (3): OutputBuffer, Emitted, waitFor()

### Community 154 - "@vitejs/plugin-react"
Cohesion: 0.10
Nodes (57): calculate(), evaluationSteps(), measureOf(), prettyMeasure(), approxRational(), formatExact(), Rational, ALIASES (+49 more)

### Community 155 - "snapshots.ts"
Cohesion: 0.22
Nodes (8): 1. Math: read a photo of handwritten work into a board — small, high value ✅ shipped, 2. Cowork/Code: `run_command` cannot run anything long-lived — medium ✅ shipped, 3. `read_file` can't read legacy Office formats (.doc/.xls/.ppt) — medium ✅ shipped, differently, 4. Design: rich text spans and growing text boxes — larger ✅ shipped, 5. Math solvers: nonlinear systems and geometry beyond triangles — larger, niche ✅ shipped, Next improvements, Not code work (deprioritized here), Still open

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

### Community 165 - "browser-sessions.test.ts"
Cohesion: 0.50
Nodes (3): cookies, cookieStore, FakeCookie

### Community 167 - "network.test.ts"
Cohesion: 0.15
Nodes (16): ChecksumError, downloadFile(), DownloadOptions, fileSize(), hashExisting(), EXE_NAMES, findPiper(), installing (+8 more)

### Community 171 - "@tanstack/react-router"
Cohesion: 0.40
Nodes (3): Answer(), LABELS, RESUMABLE_STOPS

### Community 172 - "dictation.ts"
Cohesion: 0.24
Nodes (8): DictationState, join(), toSpeechSamples(), useDictation(), FONTS_QUERY_KEY, useCustomFonts(), useFontsQuery(), cleanIpcError()

### Community 173 - "lucide-react"
Cohesion: 0.06
Nodes (64): installPdfRenderer(), installTaskNotifications(), log, setGradientRasterizer(), setPdfRenderer(), setSvgRasterizer(), installBrowser(), log (+56 more)

### Community 178 - "streamdown"
Cohesion: 0.40
Nodes (3): CHANGELOG, ChangelogEntry, ChangelogSection

## Knowledge Gaps
- **920 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+915 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `scripts` to `package.json`, `ChatPage.tsx`, `streamdown`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `paths()` connect `MemoryChatStore` to `hf-api.ts`, `ChatOrchestrator`, `engine.ts`, `openai-compat.ts`, `.resolve`, `DownloadManager`, `router.tsx`, `ProviderRegistry`, `network.test.ts`, `.update`, `window.ts`, `lucide-react`, `electron-vite`, `@fontsource-variable/source-serif-4`, `artifact-protocol.ts`, `react-dom`, `sucrase`, `tailwind-merge`, `@types/react`, `typescript`, `zustand`, `tools/types.ts`, `SideChat.tsx`, `design/store.ts`, `monaco-editor`, `TerminalPane.tsx`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `errorMessage()` connect `lucide-react` to `hf-api.ts`, `DownloadManager`, `ChatOrchestrator`, `engine.ts`, `.resolve`, `orchestrator.ts`, `handlers.ts`, `IpcInvokeMap`, `fetchWithTimeout`, `sessions.ts`, `OpenAIServerProvider`, `MemoryChatStore`, `ProviderRegistry`, `Sidebar.tsx`, `network.test.ts`, `.update`, `electron-vite`, `@fontsource-variable/inter`, `sucrase`, `tailwind-merge`, `@tailwindcss/browser`, `tools/types.ts`, `TaskSidePanel.tsx`, `SideChat.tsx`, `monaco-editor`, `TerminalPane.tsx`, `@types/react-dom`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `paths()` (e.g. with `registerDesignHandlers()` and `Composer()`) actually correct?**
  _`paths()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _920 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `LlamaCppProvider` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `queries.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0780399274047187 - nodes in this community are weakly interconnected._