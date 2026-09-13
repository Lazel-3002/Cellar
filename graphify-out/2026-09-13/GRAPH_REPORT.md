# Graph Report - Cellar  (2026-09-13)

## Corpus Check
- 114 files · ~63,407 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1088 nodes · 2259 edges · 94 communities (54 shown, 40 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `run()` - 39 edges
2. `IpcInvokeMap` - 39 edges
3. `registerIpcHandlers()` - 32 edges
4. `ChatOrchestrator` - 23 edges
5. `paths()` - 23 edges
6. `invoke()` - 23 edges
7. `get()` - 20 edges
8. `LlamaCppProvider` - 20 edges
9. `Provider` - 20 edges
10. `errorMessage()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Composer()` --indirect_call--> `paths()`  [INFERRED]
  src/renderer/src/components/composer/Composer.tsx → src/main/system/paths.ts
- `ChatPage()` --indirect_call--> `message()`  [INFERRED]
  src/renderer/src/pages/ChatPage.tsx → tests/unit/db.test.ts
- `ModelsPage()` --indirect_call--> `p()`  [INFERRED]
  src/renderer/src/pages/ModelsPage.tsx → src/main/db/client.ts
- `ProjectDetailPage()` --indirect_call--> `paths()`  [INFERRED]
  src/renderer/src/pages/ProjectsPage.tsx → src/main/system/paths.ts
- `HomePage()` --indirect_call--> `isChatCapable()`  [INFERRED]
  src/renderer/src/pages/HomePage.tsx → src/renderer/src/lib/hooks.ts

## Import Cycles
- None detected.

## Communities (94 total, 40 thin omitted)

### Community 0 - "hf-api.ts"
Cohesion: 0.06
Nodes (62): computeQuantFit(), fitCache, fitInflight, fitWaiters, hfHeaders(), hfJson(), quantFit(), repoCache (+54 more)

### Community 1 - "LlamaCppProvider"
Cohesion: 0.06
Nodes (29): buildServerArgs(), ServerLaunch, splitArgs(), validateLoadConfig(), formatParamCount(), freePort(), Instance, LlamaCppProvider (+21 more)

### Community 2 - "queries.ts"
Cohesion: 0.07
Nodes (39): Composer(), ComposerProps, ModelPicker(), effectiveThinking(), isChatCapable(), thinkingLabel(), thinkingOptions(), useAppCommands() (+31 more)

### Community 3 - "ChatOrchestrator"
Cohesion: 0.14
Nodes (5): chat, ChatOrchestrator, ChatStore, TypedBus, discardIncognitoArtifacts()

### Community 4 - "engine.ts"
Cohesion: 0.12
Nodes (24): log, Row, bus, initLogFile(), logger(), write(), errorMessage(), sleep() (+16 more)

### Community 5 - "run"
Cohesion: 0.12
Nodes (20): ConversationPatch, ConversationRow, deleteConversations(), MessagePatch, MessageRow, SqliteChatStore, toConversation(), toMessage() (+12 more)

### Community 6 - "scripts"
Cohesion: 0.06
Nodes (31): extract-zip, @huggingface/gguf, author, dependencies, extract-zip, @huggingface/gguf, systeminformation, unpdf (+23 more)

### Community 7 - "chat.test.ts"
Cohesion: 0.11
Nodes (26): FitResult, fitToContext(), messageTokens(), toTurns(), truncateMiddle(), buildSystemPrompt(), cleanTitle(), fallbackTitle() (+18 more)

### Community 8 - "openai-compat.ts"
Cohesion: 0.16
Nodes (21): LmsDownloadStatus, LmsModel, lmStudioInstalled(), OllamaPs, OllamaPullProgress, OllamaShow, OllamaTag, authHeaders() (+13 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (29): electron.vite.config.ts, electron-vite/node, node, playwright.config.ts, scripts/**/*.ts, src/main/**/*, src/preload/**/*, tests/**/* (+21 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, src/artifact-runtime/**/*, src/preload/api.d.ts, src/renderer/src/**/*, src/renderer/src/**/*.tsx, vite/client, compilerOptions (+19 more)

### Community 11 - "orchestrator.ts"
Cohesion: 0.16
Nodes (25): attachmentRefs(), classifyFile(), extractPdfText(), IMAGE_TYPES, Row, store(), TEXT_EXTENSIONS, toRef() (+17 more)

### Community 12 - "main/index.ts"
Cohesion: 0.11
Nodes (21): cleanupOrphanAttachments(), downloads, log, handlers, assertTrusted(), forwardBusToWindows(), HandlerFn, log (+13 more)

### Community 13 - "DownloadManager"
Cohesion: 0.15
Nodes (10): ACTIVE, DownloadManager, ChecksumError, downloadFile(), DownloadOptions, fileSize(), hashExisting(), StreamEvent (+2 more)

### Community 14 - "handlers.ts"
Cohesion: 0.16
Nodes (22): attachmentFromBytes(), attachmentsFromPaths(), searchMessages(), toPublicConfig(), readme(), repoDetail(), searchModels(), focusedWindow() (+14 more)

### Community 15 - "ipc-contract.ts"
Cohesion: 0.12
Nodes (21): AppCommand, AppInfo, EVENT_CHANNELS, EventChannel, eventChannelFlags, Handler, INVOKE_CHANNELS, InvokeChannel (+13 more)

### Community 16 - "IpcInvokeMap"
Cohesion: 0.16
Nodes (21): IpcInvokeMap, Artifact, ArtifactSummary, AttachmentKind, AttachmentRef, ChatStreamEvent, ConversationFilter, ConversationSettings (+13 more)

### Community 17 - "Messages.tsx"
Cohesion: 0.13
Nodes (9): ARTIFACT_ICONS, ARTIFACT_LABELS, ArtifactCard(), escapeAttr(), Markdown, MarkdownProps, plugins, withArtifactCards() (+1 more)

### Community 18 - "fetchWithTimeout"
Cohesion: 0.26
Nodes (5): fetchWithTimeout(), ollamaOptions(), OllamaProvider, ollamaThink(), readErrorBody()

### Community 19 - "button.tsx"
Cohesion: 0.12
Nodes (9): Button, ButtonProps, IconButton, IconButtonProps, Size, sizes, Variant, variants (+1 more)

### Community 20 - "router.tsx"
Cohesion: 0.15
Nodes (13): queryClient, ArtifactsPage(), COMING, ComingSoonPage(), RecentsPage(), ProjectDetailPage(), ProjectsPage(), Register (+5 more)

### Community 21 - "LoadSettingsDialog.tsx"
Cohesion: 0.15
Nodes (10): CapabilityIcons(), FIT_COPY, FitBadge(), MemoryBars(), PROVIDER_LABEL, providerStateDot(), ProviderStatusDot(), CONTEXT_STEPS (+2 more)

### Community 22 - "stream-parsers.ts"
Cohesion: 0.21
Nodes (6): parseNDJSON(), parseSSE(), partialSuffix(), readLines(), SplitPart, ThinkTagSplitter

### Community 23 - "SettingsPage.tsx"
Cohesion: 0.12
Nodes (5): ACCENTS, SECTIONS, SettingsPage(), SHORTCUTS, VARIANT_LABEL

### Community 24 - "types/models.ts"
Cohesion: 0.13
Nodes (14): ContextOverflowPolicy, DEFAULT_INFERENCE_PARAMS, KV_CACHE_TYPES, KvCacheType, LoadConfig, LoadedModelInfo, LoadMode, ModelCapabilities (+6 more)

### Community 25 - "provider-configs.ts"
Cohesion: 0.25
Nodes (10): BUILTINS, deleteProviderConfig(), getProviderConfig(), listProviderConfigs(), Row, saveProviderConfig(), toStored(), openSecret() (+2 more)

### Community 26 - "hub.ts"
Cohesion: 0.16
Nodes (14): DownloadFileState, DownloadStatus, DownloadTarget, HfFile, HfModelSummary, HfRepoDetail, HfSearchQuery, HfSort (+6 more)

### Community 27 - ".doScan"
Cohesion: 0.23
Nodes (7): describeLocation(), localModelId(), LocalModelIndex, pickMmproj(), quantLabelFromName(), toModel(), walk()

### Community 29 - "app.spec.ts"
Cohesion: 0.22
Nodes (6): project, lastUserText(), MockRequest, MockServer, sleep(), startMockServer()

### Community 30 - "OpenAIServerProvider"
Cohesion: 0.17
Nodes (3): StoredProviderConfig, OpenAIFlavor, OpenAIServerProvider

### Community 32 - "ProviderRegistry"
Cohesion: 0.31
Nodes (3): seedBuiltinProviders(), ProviderRegistry, withTimeout()

### Community 33 - "Sidebar.tsx"
Cohesion: 0.20
Nodes (5): DownloadsButton(), TARGET_LABEL, Icon, RecentFilter, Sidebar()

### Community 35 - "form.tsx"
Cohesion: 0.20
Nodes (3): Input, SelectOption, Textarea

### Community 36 - "devDependencies"
Cohesion: 0.22
Nodes (9): clsx, devDependencies, clsx, sonner, @tailwindcss/vite, @types/react-dom, sonner, @tailwindcss/vite (+1 more)

### Community 37 - "chat-smoke.mjs"
Cohesion: 0.22
Nodes (8): elapsed, logs, outDir, problems, profile, project, [providerId = 'ollama', modelId = 'qwen3:0.6b', prompt = 'Say hello in five words.', shot = 'chat'], started

### Community 39 - "ModelRef"
Cohesion: 0.25
Nodes (8): Conversation, MessageModelInfo, SendMessageInput, ModelRef, AppSettings, AppSettingsPatch, ChatFont, ThemePreference

### Community 40 - "build-artifact-runtime.mjs"
Cohesion: 0.25
Nodes (6): entry, outDir, output, root, tailwindOutput, tailwindSource

### Community 41 - ".update"
Cohesion: 0.43
Nodes (3): clamp(), defaults(), SettingsService

### Community 42 - "window.ts"
Cohesion: 0.43
Nodes (7): createMainWindow(), isAppUrl(), loadState(), saveState(), statePath(), THEMES, WindowState

### Community 43 - "AppShell.tsx"
Cohesion: 0.32
Nodes (3): AppShell(), SearchPalette(), TitleBar()

### Community 45 - "screenshots.mjs"
Cohesion: 0.29
Nodes (6): logs, outDir, problems, profile, project, routes

### Community 46 - "verify-downloads.mjs"
Cohesion: 0.38
Nodes (5): ipc(), profile, project, sleep(), waitFor()

### Community 47 - "react-runtime.tsx"
Cohesion: 0.33
Nodes (3): ErrorBoundary, modules, mount()

### Community 49 - "HomePage.tsx"
Cohesion: 0.40
Nodes (3): ChatSuggestions(), HomePage(), SUGGESTIONS

### Community 50 - "providers.ts"
Cohesion: 0.33
Nodes (5): BUILTIN_PROVIDER_IDS, ProviderConfig, ProviderConfigInput, ProviderState, ProviderStatus

### Community 51 - "verify-packaged.mjs"
Cohesion: 0.40
Nodes (3): exe, local, project

### Community 55 - "ipc-run.mjs"
Cohesion: 0.50
Nodes (3): calls, profile, project

### Community 56 - "preload/index.ts"
Cohesion: 0.50
Nodes (3): bridge, eventsAllowed, invokeAllowed

### Community 57 - "ArtifactPanel.tsx"
Cohesion: 0.83
Nodes (3): ArtifactPanel(), fence(), IFRAME_TYPES

## Knowledge Gaps
- **282 isolated node(s):** `shared`, `baseCsp`, `name`, `productName`, `version` (+277 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `paths()` connect `main/index.ts` to `LlamaCppProvider`, `queries.ts`, `engine.ts`, `openai-compat.ts`, `.update`, `window.ts`, `orchestrator.ts`, `handlers.ts`, `router.tsx`, `.doScan`, `OpenAIServerProvider`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `ProjectDetailPage()` connect `router.tsx` to `main/index.ts`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `Provider` connect `Provider` to `ProviderRegistry`, `LlamaCppProvider`, `engine.ts`, `openai-compat.ts`, `fetchWithTimeout`, `LmStudioProvider`, `OpenAIServerProvider`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `registerIpcHandlers()` (e.g. with `toPublicConfig()` and `.name()`) actually correct?**
  _`registerIpcHandlers()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `shared`, `baseCsp`, `name` to the rest of the system?**
  _282 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `hf-api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05712050078247261 - nodes in this community are weakly interconnected._
- **Should `LlamaCppProvider` be split into smaller, more focused modules?**
  _Cohesion score 0.05747126436781609 - nodes in this community are weakly interconnected._