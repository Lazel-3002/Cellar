# Graph Report - Cellar  (2026-09-17)

## Corpus Check
- 277 files · ~285,745 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3294 nodes · 7856 edges · 182 communities (131 shown, 51 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 142 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `84df8362`
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
- images.ts
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
- @vitejs/plugin-react
- fetchWithTimeout
- Renderer
- network.test.ts
- ArtifactPanel
- sucrase
- command.ts
- cmdk
- @fontsource-variable/source-serif-4
- @huggingface/gguf
- monaco-editor
- systeminformation
- react
- @streamdown/mermaid
- @tailwindcss/browser
- vscode-languageserver-protocol
- @xterm/addon-fit
- zustand

## God Nodes (most connected - your core abstractions)
1. `IpcInvokeMap` - 87 edges
2. `paths()` - 68 edges
3. `run()` - 67 edges
4. `errorMessage()` - 58 edges
5. `registerIpcHandlers()` - 45 edges
6. `newId()` - 45 edges
7. `invoke()` - 39 edges
8. `ChatOrchestrator` - 38 edges
9. `get()` - 37 edges
10. `registerM4Handlers()` - 34 edges

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
- None detected.

## Communities (182 total, 51 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.06
Nodes (44): DownloadManager, computeQuantFit(), fitCache, fitInflight, fitWaiters, hfHeaders(), hfJson(), quantFit() (+36 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.10
Nodes (20): LocalModel, buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), formatParamCount(), freePort(), Instance (+12 more)

### Community 2 - "queries.ts"
Cohesion: 0.13
Nodes (20): BINARY_EXTENSIONS, count(), describeWrite(), editFileTool, globTool, grepTool, IMAGE_EXTENSIONS, isBinary() (+12 more)

### Community 4 - "engine.ts"
Cohesion: 0.10
Nodes (26): estimateTokens(), fitToContext(), messageTokens(), toTurns(), truncateMiddle(), active, buildSideChatPrompt(), clipTranscript() (+18 more)

### Community 5 - "run"
Cohesion: 0.19
Nodes (17): angleMode, paper, registerMathHandlers(), topic, BoardConflictError, boardForConversation(), BoardRow, copyBoard() (+9 more)

### Community 6 - "scripts"
Cohesion: 0.13
Nodes (15): croner, docx, electron-updater, extract-zip, @modelcontextprotocol/sdk, dependencies, croner, docx (+7 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.11
Nodes (25): buildSystemPrompt(), chatToolGuidance(), cleanTitle(), fallbackTitle(), SystemPromptInput, normalizeChart(), measureSvg(), sanitizeSvg() (+17 more)

### Community 8 - "openai-compat.ts"
Cohesion: 0.13
Nodes (22): LmsDownloadStatus, LmsModel, authHeaders(), baseEntry(), ChatChunk, fetchEmbeddings(), fetchOpenAIModels(), guessCapabilitiesFromName() (+14 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (29): electron.vite.config.ts, electron-vite/node, node, playwright.config.ts, scripts/**/*.ts, src/main/**/*, src/preload/**/*, tests/**/* (+21 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, src/artifact-runtime/**/*, src/preload/api.d.ts, src/renderer/src/**/*, src/renderer/src/**/*.tsx, vite/client, compilerOptions (+19 more)

### Community 11 - "orchestrator.ts"
Cohesion: 0.05
Nodes (37): check(), conversationIdSchema, CreateTerminalOptions, dataSchema, envValue(), findOnPath(), idSchema, log (+29 more)

### Community 12 - "main/index.ts"
Cohesion: 0.07
Nodes (46): log, ActiveGeneration, chat, log, TurnFinished, supportsArtifactInstructions(), formatSchema, registerDesignHandlers() (+38 more)

### Community 13 - "DownloadManager"
Cohesion: 0.05
Nodes (44): addArtboard(), addElement(), AlignEdge, alignSelection(), copySelection(), deleteArtboard(), deleteSelection(), duplicateSelection() (+36 more)

### Community 14 - "handlers.ts"
Cohesion: 0.07
Nodes (56): attachmentFromBytes(), attachmentRefs(), attachmentsFromPaths(), classifyFile(), cleanupOrphanAttachments(), extractPdfText(), IMAGE_TYPES, Row (+48 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.05
Nodes (81): AppCommand, AppInfo, BackgroundStatus, EVENT_CHANNELS, EventChannel, eventChannelFlags, Handler, INVOKE_CHANNELS (+73 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.11
Nodes (26): ConversationKind, TaskStartOptions, TaskStatus, Artifact, ArtifactSummary, AttachmentKind, AttachmentRef, ConversationFilter (+18 more)

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
Cohesion: 0.50
Nodes (4): agentPowerShell(), cache, findOnPath(), PowerShellEdition

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.09
Nodes (7): ACCENTS, LANGUAGES, SECTIONS, SettingsPage(), SHORTCUTS, VARIANT_LABEL, WHISPER_BUILDS

### Community 24 - "types/models.ts"
Cohesion: 0.10
Nodes (30): pptxgenjs, pptxgenjs, attachmentImage(), ensureSession(), exportDesign(), ExportTarget, fileSafe(), imageUrls() (+22 more)

### Community 25 - "provider-configs.ts"
Cohesion: 0.10
Nodes (32): pdfAvailable(), connectorTool(), connectorToolName(), connectorTools(), diagnosticsTool, forgetTool, objectSchema(), readChatTool (+24 more)

### Community 26 - "hub.ts"
Cohesion: 0.08
Nodes (27): DownloadFileState, DownloadJob, DownloadStatus, DownloadTarget, HfFile, HfModelSummary, HfRepoDetail, HfSearchQuery (+19 more)

### Community 27 - ".doScan"
Cohesion: 0.18
Nodes (12): describeLocation(), FoundGroup, inspectLocalGguf(), localModelId(), LocalModelIndex, log, pickMmproj(), quantLabelFromName() (+4 more)

### Community 28 - "LmStudioProvider"
Cohesion: 0.16
Nodes (15): effectiveThinking(), thinkingLabel(), thinkingOptions(), useAppCommands(), useSelectedModel(), useThemeSync(), cleanIpcError(), onEvent() (+7 more)

### Community 29 - "app.spec.ts"
Cohesion: 0.14
Nodes (29): session(), codeSession(), BASE_HEADERS, buildPreviewUrl(), canConnect(), CONTENT_TYPES, fileResponse(), installPreview() (+21 more)

### Community 30 - "OpenAIServerProvider"
Cohesion: 0.21
Nodes (12): newToolCallId(), asObject(), CallSplitPart, describeType(), escapeControlCharsInStrings(), ParsedTextCall, parseLooseJson(), parseTextToolCall() (+4 more)

### Community 31 - "MemoryChatStore"
Cohesion: 0.05
Nodes (96): quickEntryShortcutActive(), builtInCommands(), changed(), commandSlug(), customCommands(), deleteCommand(), expandCommand(), expandTemplate() (+88 more)

### Community 32 - "ProviderRegistry"
Cohesion: 0.13
Nodes (5): RoundOptions, FitResult, SideChatPrompt, Provider, ProviderMessage

### Community 33 - "Sidebar.tsx"
Cohesion: 0.08
Nodes (20): cell, createDocx, createPdf, createPptx, createXlsx, DOCUMENT_EXTENSIONS, documentOptions(), documentPath() (+12 more)

### Community 34 - "Provider"
Cohesion: 0.21
Nodes (22): baseBlob(), byPath(), commitAll(), deleteNewFile(), existsInBase(), gitChangeSet(), gitDiscardFile(), gitFailure() (+14 more)

### Community 35 - "form.tsx"
Cohesion: 0.20
Nodes (3): Input, SelectOption, Textarea

### Community 36 - "devDependencies"
Cohesion: 0.22
Nodes (9): clsx, @fontsource-variable/inter, devDependencies, clsx, @fontsource-variable/inter, @tanstack/react-query, vitest, @tanstack/react-query (+1 more)

### Community 37 - "chat-smoke.mjs"
Cohesion: 0.22
Nodes (8): elapsed, logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3:0.6b', prompt = 'Say hello in five words.', shot = 'chat'], started

### Community 39 - "ModelRef"
Cohesion: 0.26
Nodes (7): exists(), inside(), Workspace, listDirectory(), writeWorkspaceFile(), CodeSessionContext, finished()

### Community 40 - "build-artifact-runtime.mjs"
Cohesion: 0.25
Nodes (6): entry, outDir, output, root, tailwindOutput, tailwindSource

### Community 41 - ".update"
Cohesion: 0.10
Nodes (11): ConnectorManager, defaultPolicy(), Live, renderToolResult(), signatureOf(), toolPolicy(), withTimeout(), listStoredConnectors() (+3 more)

### Community 42 - "window.ts"
Cohesion: 0.05
Nodes (60): escapeRegex(), globFiles(), GlobMatch, globToRegExp(), IGNORED_DIRS, walk(), WalkEntry, WalkOptions (+52 more)

### Community 43 - "AppShell.tsx"
Cohesion: 0.13
Nodes (29): invoke(), keys, useAppInfo(), useArtifacts(), useBackground(), useCheckForUpdates(), useCommands(), useConnectors() (+21 more)

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
Cohesion: 0.25
Nodes (5): isChatCapable(), CoworkExtras(), folderName(), HomePage(), SUGGESTIONS

### Community 50 - "providers.ts"
Cohesion: 0.05
Nodes (38): coworkGuidance, parseParamsBillions(), ToolPart, StreamEvent, ModelEntry, BUILTIN_PROVIDER_IDS, ProviderConfig, ProviderConfigInput (+30 more)

### Community 51 - "verify-packaged.mjs"
Cohesion: 0.33
Nodes (4): exe, exportDir, local, project

### Community 52 - "DiscoverPage.tsx"
Cohesion: 0.08
Nodes (31): ChangesPane(), Counts(), errorText(), FileRow(), FileRowProps, num(), splitPath(), STATUS (+23 more)

### Community 53 - "ModelsPage.tsx"
Cohesion: 0.07
Nodes (44): vizCssVariables(), CHART_KINDS, LAYOUT_NAMES, layoutContent, layoutName, canonicalFields(), clamp(), color() (+36 more)

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
Nodes (38): blockElements(), cellValue(), chartFromCode(), chartTable(), createPptx(), createXlsx(), DOCUMENT_EXTENSIONS, DocumentOptions (+30 more)

### Community 63 - "cmdk"
Cohesion: 0.26
Nodes (21): escapeXml(), artboardHtml(), artboardStyle(), boxStyle(), cssText(), designHtml(), elementHtml(), HtmlOptions (+13 more)

### Community 64 - "electron"
Cohesion: 0.08
Nodes (67): approxRational(), asRational(), Exact, exactAdd(), exactDiv(), exactFromNumber(), exactInt(), exactInverse() (+59 more)

### Community 66 - "electron-vite"
Cohesion: 0.11
Nodes (11): chatTaskState(), joinReasoning(), joinText(), LiveRun, stableJson(), TaskRunInput, TaskRunner, TaskRunnerHooks (+3 more)

### Community 67 - "@fontsource-variable/inter"
Cohesion: 0.11
Nodes (14): buildDesignPrompt(), DesignPromptInput, contentSchema, createArtboardTool, deleteArtboardTool, DESIGN_TOOLS, designOutline(), editElementsTool (+6 more)

### Community 68 - "@fontsource-variable/source-serif-4"
Cohesion: 0.13
Nodes (24): branchExists(), branchSlug(), createWorktree(), currentBranch(), findMemoryFile(), gitAvailable(), GitError, GitOptions (+16 more)

### Community 70 - "@playwright/test"
Cohesion: 0.10
Nodes (43): blockType(), boardOutline(), describeBlock(), FIGURE_KINDS, figureKindOf(), isObject(), LIMITS, Loose (+35 more)

### Community 71 - "radix-ui"
Cohesion: 0.12
Nodes (20): backendsFromFiles(), bestRuntime(), exec, findServerDir(), idForDir(), log, parseDevicesOutput(), parseReleaseAssets() (+12 more)

### Community 72 - "react"
Cohesion: 0.12
Nodes (10): ChatRequest, currentEntry, fake, FakeProvider, finished(), message(), Provider, Script (+2 more)

### Community 73 - "react-dom"
Cohesion: 0.19
Nodes (23): CalcOptions, CalcResult, calculate(), evaluationSteps(), measureOf(), prettyMeasure(), formatExact(), AngleMode (+15 more)

### Community 74 - "streamdown"
Cohesion: 0.11
Nodes (27): Node, Atom, escapeHtml(), mathToPlain(), prepare(), Renderer, renderMath(), superscript() (+19 more)

### Community 75 - "@streamdown/code"
Cohesion: 0.11
Nodes (27): area(), arithmetic(), Draft, fractions(), fromSolution(), GeneratedQuiz, generateQuiz(), GENERATORS (+19 more)

### Community 76 - "@streamdown/math"
Cohesion: 0.12
Nodes (13): AppShell(), CodeSidebar(), SessionFilter, DownloadsButton(), TARGET_LABEL, SearchPalette(), Icon, NavItem() (+5 more)

### Community 77 - "@streamdown/mermaid"
Cohesion: 0.20
Nodes (7): useIpcSync(), speakReply(), stripForSpeech(), useSpeechVoices(), pending, StreamsState, useStreams

### Community 78 - "sucrase"
Cohesion: 0.22
Nodes (14): addBlock(), deleteBlock(), duplicateBlock(), moveBlock(), reorderBlock(), setBoardMeta(), store(), BlockShell() (+6 more)

### Community 80 - "tailwindcss"
Cohesion: 0.14
Nodes (16): BUILTINS, deleteProviderConfig(), getProviderConfig(), listProviderConfigs(), Row, saveProviderConfig(), toStored(), openSecret() (+8 more)

### Community 81 - "@tailwindcss/browser"
Cohesion: 0.50
Nodes (3): AgentPromptInput, buildAgentPrompt(), compactionRequest()

### Community 82 - "@tanstack/react-query"
Cohesion: 0.13
Nodes (14): AgentPart, ChatStreamEvent, Message, SideChatMessage, ask(), ChatRequest, FakeProvider, msg() (+6 more)

### Community 83 - "@tanstack/react-router"
Cohesion: 0.33
Nodes (12): deleteSnapshots(), folder(), forgetSnapshot(), manifestPath(), queues, readManifest(), serial(), snapshotBeforeChange() (+4 more)

### Community 85 - "@types/react"
Cohesion: 0.09
Nodes (35): connectors, log, deleteStoredConnector(), ensureOverride(), pluginOverrides(), record(), Row, saveStoredConnector() (+27 more)

### Community 86 - "typescript"
Cohesion: 0.60
Nodes (4): DictationState, encodeWav(), toSpeechWav(), useDictation()

### Community 88 - "@vitejs/plugin-react"
Cohesion: 0.17
Nodes (19): backgroundAt(), checkArtboard(), intersects(), short(), clamp(), layoutElements(), LAYOUTS, Raw (+11 more)

### Community 89 - "vitest"
Cohesion: 0.20
Nodes (15): buildTaskHistory(), groupRounds(), HistoryOptions, historyTokens(), latestCompaction(), resultForModel(), Round, roundsToMessages() (+7 more)

### Community 90 - "zustand"
Cohesion: 0.19
Nodes (13): DesignCard(), DesignEditorPage(), DesignHeader(), DesignHomePage(), errorText(), exportDesign(), FORMAT_ICONS, IDEAS (+5 more)

### Community 94 - "agent-core.test.ts"
Cohesion: 0.12
Nodes (29): absoluteUrl(), htmlToText(), NAMED_ENTITIES, PageText, parseBraveHtml(), parseDuckDuckGoHtml(), parseSearxngJson(), SearchResult (+21 more)

### Community 95 - "Cellar roadmap"
Cohesion: 0.06
Nodes (32): Cellar roadmap, Known gaps and follow-ups from M1, Known gaps and follow-ups from M2, Known gaps and follow-ups from M3, Known gaps and follow-ups from M4, Known gaps and follow-ups from M5, Known gaps and follow-ups from M6, M1 Foundation — delivered (+24 more)

### Community 96 - "services/models.ts"
Cohesion: 0.40
Nodes (4): queryClient, quick, QuickEntry(), router

### Community 97 - "cowork-smoke.mjs"
Cohesion: 0.13
Nodes (13): approvals, chips, elapsed, files, folder, logs, outDir, problems (+5 more)

### Community 98 - "tools/types.ts"
Cohesion: 0.11
Nodes (22): DAYS, describeCron(), nextFire(), pad(), parseCron(), previewCron(), configure(), escapeXml() (+14 more)

### Community 99 - "agent.ts"
Cohesion: 0.13
Nodes (17): INIT_PROMPT, PermissionMode, MessageModelInfo, ProjectIndexStatus, CodeMode, ModelRef, CronPreview, ScheduledRun (+9 more)

### Community 100 - "history.ts"
Cohesion: 0.14
Nodes (12): address, approvals, elapsed, logs, outDir, problems, profile, project (+4 more)

### Community 101 - "Workspace"
Cohesion: 0.18
Nodes (9): PropertiesTab(), MathChat(), EditorState, MathLayoutState, PanelTab, PEN_COLORS, selectedBlock(), useMathEditor (+1 more)

### Community 102 - "orchestrator.ts"
Cohesion: 0.07
Nodes (41): installPdfRenderer(), installTaskNotifications(), log, setPdfRenderer(), setSvgRasterizer(), attachCloseToTray(), backgroundActive(), createMain() (+33 more)

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
Cohesion: 0.26
Nodes (9): alpha(), applyTheme(), cssColor(), EXTENSION_LANGUAGES, FILENAME_LANGUAGES, load(), loadMonaco(), registerJson() (+1 more)

### Community 109 - "SideChat.tsx"
Cohesion: 0.27
Nodes (9): EMPTY, historyOf(), LiveReply, newRequestId(), requestMessages(), settle(), SideChat(), SideEntry (+1 more)

### Community 110 - "downloadFile"
Cohesion: 0.11
Nodes (25): COLOR_TOKENS, FontCategory, FORMAT_DEFAULTS, hex6(), luminance(), mixColors(), NAMED, parseRgb() (+17 more)

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
Cohesion: 0.17
Nodes (8): project, lastUserText(), MockRequest, MockServer, sleep(), startMockServer(), VIZ_CDN_REPLY, VIZ_REPLY

### Community 120 - "@xterm/addon-fit"
Cohesion: 0.17
Nodes (12): scripts, build, build:win, dev, preview, runtime:artifacts, test, test:e2e (+4 more)

### Community 121 - "@xterm/addon-web-links"
Cohesion: 0.36
Nodes (8): addStroke(), clearSketch(), eraseStroke(), distanceTo(), pathsOf(), SketchCanvas(), SketchToolbar(), TOOLS

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
Nodes (15): addBlocksTool, blockSchema, calculateTool, deleteBlocksTool, drawFigureTool, figureSchema, getBoardTool, makeQuizTool (+7 more)

### Community 128 - "memory.ts"
Cohesion: 0.25
Nodes (14): defaultPreset(), getPreset(), resetPreset(), savePreset(), deleteModel(), listModels(), loadedModels(), loadModel() (+6 more)

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

### Community 141 - "dictation.ts"
Cohesion: 0.33
Nodes (5): DARK_PALETTE, LIGHT_PALETTE, readVizTheme(), useVizTheme(), VizTheme

### Community 145 - "package.json"
Cohesion: 0.22
Nodes (8): author, description, license, main, name, private, productName, version

### Community 147 - "images.ts"
Cohesion: 0.20
Nodes (11): completionKindMap(), DocInfo, docs, documentUri(), LSP_LANGUAGES, parseDocumentUri(), registerLspProviders(), SEVERITY_MAP() (+3 more)

### Community 150 - "code-changes.test.ts"
Cohesion: 0.10
Nodes (21): ApprovalAction, ApprovalDecision, ApprovalRequest, CompactionPart, ReasoningPart, TaskFile, TaskSource, TaskState (+13 more)

### Community 153 - "@tanstack/react-query"
Cohesion: 0.13
Nodes (11): PathAccessError, StoredProviderConfig, argumentsObject(), OllamaChatLine, OllamaPs, OllamaPullProgress, OllamaShow, OllamaTag (+3 more)

### Community 154 - "@vitejs/plugin-react"
Cohesion: 0.34
Nodes (4): canonicalFunction(), CONSTANTS, Parser, tokenize()

### Community 155 - "snapshots.ts"
Cohesion: 0.15
Nodes (27): changed(), contentSchema, conversationIdSchema, BOM, byPath(), countable(), readWorkspaceFile(), snapshotChangeSet() (+19 more)

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
Cohesion: 0.21
Nodes (15): ThemePanel(), ChartRenderOptions, chartSvg(), clamp(), formatValue(), niceScale(), r1(), truncate() (+7 more)

### Community 161 - "MathPage.tsx"
Cohesion: 0.29
Nodes (11): BoardCard(), errorText(), exportBoard(), IDEAS, isEditableTarget(), MathBoardPage(), MathHeader(), MathHomePage() (+3 more)

### Community 167 - "network.test.ts"
Cohesion: 0.09
Nodes (31): ChecksumError, downloadFile(), DownloadOptions, fileSize(), hashExisting(), errorMessage(), autoCheckTick(), AutoUpdater (+23 more)

### Community 171 - "command.ts"
Cohesion: 0.18
Nodes (12): ANSI, ESC, killTree(), runCommand, runShell(), ShellOptions, ShellResult, cleanSchema() (+4 more)

## Knowledge Gaps
- **762 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+757 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **51 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `scripts` to `fetchWithTimeout`, `Renderer`, `util.ts`, `.resolve`, `quants.ts`, `@huggingface/gguf`, `package.json`, `code-changes.test.ts`, `systeminformation`, `electron-vite`, `MonacoEditor.tsx`, `types/models.ts`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `paths()` connect `MemoryChatStore` to `electron-vite`, `tools/types.ts`, `@fontsource-variable/source-serif-4`, `orchestrator.ts`, `radix-ui`, `openai-compat.ts`, `.update`, `network.test.ts`, `orchestrator.ts`, `main/index.ts`, `handlers.ts`, `tailwindcss`, `@tanstack/react-router`, `router.tsx`, `@types/react`, `types/models.ts`, `zustand`, `.doScan`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `errorMessage()` connect `network.test.ts` to `hf-api.ts`, `ChatOrchestrator`, `engine.ts`, `orchestrator.ts`, `main/index.ts`, `handlers.ts`, `fetchWithTimeout`, `@tanstack/react-query`, `.doScan`, `OpenAIServerProvider`, `MemoryChatStore`, `.update`, `window.ts`, `electron-vite`, `radix-ui`, `@types/react`, `tools/types.ts`, `orchestrator.ts`, `plugins.ts`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `paths()` (e.g. with `Composer()` and `DesignHeader()`) actually correct?**
  _`paths()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `registerIpcHandlers()` (e.g. with `toPublicConfig()` and `.name()`) actually correct?**
  _`registerIpcHandlers()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _762 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `hf-api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06394230769230769 - nodes in this community are weakly interconnected._