import type { ApprovalDecision, ConversationKind, PermissionMode, TaskNotice } from './types/agent';
import type {
  ChangeSet,
  CodeMode,
  CommitResult,
  ConflictFile,
  FileContent,
  FileDiff,
  FileEntry,
  MemoryFile,
  MergeResult,
  MergeStatus,
  PullRequestResult,
  PushResult,
  RemoteInfo,
  RepoInfo,
  SideChatEvent,
  SideChatRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalInfo,
} from './types/code';
import type {
  Artifact,
  ArtifactSummary,
  AttachmentRef,
  ChatStreamEvent,
  ConversationFilter,
  ConversationSettings,
  ConversationSummary,
  ConversationWithMessages,
  ContextInfo,
  Project,
  ProjectDetail,
  ProjectFile,
  ProjectIndexStatus,
  ProjectSummary,
  SearchHit,
  SendMessageInput,
  SendMessageResult,
  ThinkingLevel,
} from './types/chat';
import type { BrowserBounds, BrowserLoginStatus, BrowserState, BrowserTab } from './types/browser';
import type { ComputerState, ComputerTestResult, ScreenDisplay } from './types/computer';
import type { Design, DesignChangedEvent, DesignExportRequest, DesignStartOptions, DesignSummary, DesignVersionSummary, FontSummary } from './types/design';
import type { MathBoard, MathBoardSummary, MathChangedEvent, MathExportRequest, MathStartOptions } from './types/math';
import type {
  BookChat,
  BookSummary,
  StudyAnnotation,
  StudyChangedEvent,
  StudyGotoEvent,
  StudyImportProgress,
  StudyMode,
  StudyPageHit,
  StudyRenderRequest,
  StudySession,
} from './types/study';
import type { DownloadJob, HfModelSummary, HfRepoDetail, HfSearchQuery, QuantFit, StartDownloadInput } from './types/hub';
import type {
  LoadConfig,
  LoadedModelInfo,
  LoadProgressEvent,
  MemoryEstimate,
  ModelDetail,
  ModelEntry,
  ModelPreset,
  ModelRef,
} from './types/models';
import type {
  CommandDetail,
  CommandInfo,
  CommandInput,
  ConnectorInput,
  ConnectorStatus,
  MemoryItem,
  MemoryTopic,
  MemoryImportResult,
  MemoryRetrievalResult,
  MemoryTopicHistoryEntry,
  MemoryUpdateResult,
  PluginInfo,
  PluginMarketplaceEntry,
  SkillDetail,
  SkillInfo,
  SkillInput,
  ToolListing,
  ToolPolicy,
  ToolScope,
} from './types/customize';
import type { ProviderConfig, ProviderConfigInput, ProviderStatus } from './types/providers';
import type { CronPreview, ScheduledRun, ScheduledTask, ScheduledTaskInput } from './types/scheduled';
import type { AppSettings, AppSettingsPatch } from './types/settings';
import type { HardwareInfo, RuntimeInfo, RuntimeInstallProgress, RuntimeRelease, RuntimeVariant } from './types/system';
import type { TranscriptionResult, TtsStatus, VoiceProgress, VoiceStatus, WhisperVariant } from './types/voice';
import type { AppUpdateState } from './types/update';
import type { LspCompletionItem, LspDiagnosticsEvent, LspLanguage, LspLocation, LspPosition } from './types/lsp';
import type { UsageRange, UsageStats } from './types/stats';

export type Platform = 'win32' | 'darwin' | 'linux' | 'aix' | 'android' | 'freebsd' | 'haiku' | 'openbsd' | 'sunos' | 'cygwin' | 'netbsd';

export interface AppInfo {
  version: string;
  platform: Platform;
  isDev: boolean;
  userDataDir: string;
  modelsDir: string;
  logsDir: string;
}

export type AppCommand = 'new-chat' | 'new-incognito' | 'search' | 'settings' | 'toggle-sidebar' | 'models' | 'discover' | 'scheduled';

export interface BackgroundStatus {
  /** The quick entry shortcut is registered (another app may hold it). */
  quickEntryActive: boolean;
  /** Claude Desktop settings exist on this computer (connectors can be imported). */
  claudeDesktopConfig: boolean;
  /** Claude Code skills exist on this computer (~/.claude/skills). */
  claudeSkills: boolean;
}

export type WindowAction = 'reload' | 'devtools' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'quit' | 'minimize' | 'toggle-maximize';

type Handler<A extends unknown[], R> = { args: A; result: R };

export interface IpcInvokeMap {
  'app:info': Handler<[], AppInfo>;
  'stats:usage': Handler<[range: UsageRange], UsageStats>;
  'system:hardware': Handler<[refresh?: boolean], HardwareInfo>;
  'system:openExternal': Handler<[url: string], void>;
  'system:showInFolder': Handler<[path: string], void>;
  'system:pickDirectory': Handler<[title?: string], string | null>;
  'system:pickFiles': Handler<[kind?: 'attachments' | 'knowledge' | 'fonts' | 'pdf'], string[]>;
  'window:setTheme': Handler<[theme: 'dark' | 'light'], void>;
  'window:action': Handler<[action: WindowAction], void>;

  'settings:get': Handler<[], AppSettings>;
  'settings:update': Handler<[patch: AppSettingsPatch], AppSettings>;

  'runtimes:list': Handler<[refresh?: boolean], RuntimeInfo[]>;
  'runtimes:latestRelease': Handler<[], RuntimeRelease>;
  'runtimes:install': Handler<[variant: RuntimeVariant], RuntimeInfo>;
  'runtimes:addCustom': Handler<[dir: string], RuntimeInfo>;
  'runtimes:remove': Handler<[id: string], void>;
  'runtimes:setActive': Handler<[id: string], AppSettings>;

  'providers:status': Handler<[refresh?: boolean], ProviderStatus[]>;
  'providers:configs': Handler<[], ProviderConfig[]>;
  'providers:save': Handler<[input: ProviderConfigInput], ProviderConfig>;
  'providers:delete': Handler<[id: string], void>;
  'providers:startUnsloth': Handler<[], void>;

  'models:list': Handler<[refresh?: boolean], ModelEntry[]>;
  'models:rescan': Handler<[], ModelEntry[]>;
  'models:detail': Handler<[ref: ModelRef], ModelDetail>;
  'models:estimate': Handler<[ref: ModelRef, config: LoadConfig], MemoryEstimate | null>;
  'models:load': Handler<[ref: ModelRef, config?: LoadConfig], LoadedModelInfo>;
  'models:unload': Handler<[ref: ModelRef], void>;
  'models:loaded': Handler<[], LoadedModelInfo[]>;
  'models:savePreset': Handler<[ref: ModelRef, preset: ModelPreset], ModelPreset>;
  'models:resetPreset': Handler<[ref: ModelRef], ModelPreset>;
  'models:delete': Handler<[ref: ModelRef], void>;
  'models:logs': Handler<[ref: ModelRef], string[]>;

  'hub:search': Handler<[query: HfSearchQuery], HfModelSummary[]>;
  'hub:repo': Handler<[repoId: string], HfRepoDetail>;
  'hub:readme': Handler<[repoId: string], string>;
  'hub:quantFit': Handler<[repoId: string, label: string], QuantFit>;

  'downloads:list': Handler<[], DownloadJob[]>;
  'downloads:start': Handler<[input: StartDownloadInput], DownloadJob>;
  'downloads:pause': Handler<[id: string], void>;
  'downloads:resume': Handler<[id: string], void>;
  'downloads:cancel': Handler<[id: string], void>;
  'downloads:clear': Handler<[], void>;

  'chat:list': Handler<[filter?: ConversationFilter], ConversationSummary[]>;
  'chat:get': Handler<[id: string], ConversationWithMessages>;
  'chat:send': Handler<[input: SendMessageInput], SendMessageResult>;
  'chat:regenerate': Handler<[conversationId: string, assistantMessageId: string, model?: ModelRef, thinking?: ThinkingLevel], SendMessageResult>;
  'chat:edit': Handler<[conversationId: string, userMessageId: string, content: string, model: ModelRef, thinking: ThinkingLevel], SendMessageResult>;
  'chat:stop': Handler<[messageId: string], void>;
  'chat:switchBranch': Handler<[conversationId: string, messageId: string], ConversationWithMessages>;
  'chat:rename': Handler<[id: string, title: string], void>;
  'chat:star': Handler<[id: string, starred: boolean], void>;
  'chat:delete': Handler<[ids: string[]], void>;
  'chat:moveToProject': Handler<[id: string, projectId: string | null], void>;
  'chat:updateSettings': Handler<[id: string, settings: ConversationSettings], void>;
  'chat:search': Handler<[query: string, limit?: number], SearchHit[]>;
  'chat:discardIncognito': Handler<[id: string], void>;
  'chat:activeStreams': Handler<[], ChatStreamEvent[]>;
  /** /context command: returns the context window breakdown for a conversation. */
  'chat:contextInfo': Handler<[conversationId?: string], ContextInfo | null>;

  'tasks:approve': Handler<[messageId: string, toolCallId: string, decision: ApprovalDecision], void>;
  'tasks:setPermissionMode': Handler<[conversationId: string, mode: PermissionMode], void>;
  'tasks:toolResult': Handler<[messageId: string, toolCallId: string], string>;
  'tasks:openFile': Handler<[conversationId: string, path: string], void>;
  'tasks:revealFile': Handler<[conversationId: string, path: string], void>;
  'tasks:saveFileAs': Handler<[conversationId: string, path: string], string | null>;
  /** Cowork tasks: files changed from their saved snapshot (undo, outside git). */
  'tasks:changes': Handler<[conversationId: string], ChangeSet>;
  'tasks:fileDiff': Handler<[conversationId: string, path: string], FileDiff>;
  /** Restore one file to how it was before the task first changed it. */
  'tasks:revertFile': Handler<[conversationId: string, path: string], void>;

  /** Repository details for the new-session screen. */
  'code:repoInfo': Handler<[folder: string], RepoInfo>;
  'code:setMode': Handler<[conversationId: string, mode: CodeMode, autoAcceptEdits: boolean], void>;
  'code:changes': Handler<[conversationId: string], ChangeSet>;
  'code:fileDiff': Handler<[conversationId: string, path: string], FileDiff>;
  /** Restore one file to how it was when the session started. */
  'code:discardFile': Handler<[conversationId: string, path: string], void>;
  'code:commit': Handler<[conversationId: string, message: string], CommitResult>;
  /** Merge a worktree session's branch into the branch it started from. */
  'code:merge': Handler<[conversationId: string], MergeResult>;
  /** Whether a remote is configured, and whether it looks like GitHub (for the "Create pull request" button). */
  'code:remoteInfo': Handler<[conversationId: string], RemoteInfo>;
  /** Pushes the session's branch, setting the upstream the first time. */
  'code:push': Handler<[conversationId: string], PushResult>;
  /** Opens a pull request with the GitHub CLI (`gh`); throws with install/sign-in instructions when it is not ready. */
  'code:createPullRequest': Handler<[conversationId: string, title: string, body: string], PullRequestResult>;
  /** An existing pull request for the session's branch, if `gh` knows of one. */
  'code:pullRequestUrl': Handler<[conversationId: string], string | undefined>;
  /** Whether a merge is waiting to be resolved in the repository (not the worktree). */
  'code:mergeStatus': Handler<[conversationId: string], MergeStatus>;
  /** One conflicted file's current content, and whether its markers are already resolved. */
  'code:conflictFile': Handler<[conversationId: string, path: string], ConflictFile>;
  'code:writeConflictFile': Handler<[conversationId: string, path: string, content: string], void>;
  /** Stages the resolved files and finishes an in-progress merge. */
  'code:continueMerge': Handler<[conversationId: string], CommitResult>;
  'code:abortMerge': Handler<[conversationId: string], void>;
  'code:listDir': Handler<[conversationId: string, path: string], FileEntry[]>;
  'code:readFile': Handler<[conversationId: string, path: string], FileContent>;
  'code:writeFile': Handler<[conversationId: string, path: string, content: string], void>;
  'code:memory': Handler<[conversationId: string], MemoryFile>;
  /** Delete a session; optionally remove its worktree and branch too. */
  'code:deleteSession': Handler<[conversationId: string, removeWorktree: boolean], void>;
  /** A cellar-preview:// URL for an HTML, PDF or image file in the session's folder. */
  'code:previewUrl': Handler<[conversationId: string, path: string], string>;
  'code:sideChat': Handler<[request: SideChatRequest], void>;
  'code:sideChatStop': Handler<[requestId: string], void>;

  /** Starts (or reuses) that file's language server; returns null for files neither one covers. */
  'code:lspOpen': Handler<[conversationId: string, path: string, text: string], LspLanguage | null>;
  'code:lspChange': Handler<[conversationId: string, path: string, text: string], void>;
  'code:lspClose': Handler<[conversationId: string, path: string], void>;
  'code:lspCompletion': Handler<[conversationId: string, path: string, position: LspPosition], LspCompletionItem[]>;
  'code:lspDefinition': Handler<[conversationId: string, path: string, position: LspPosition], LspLocation[]>;
  'code:lspReferences': Handler<[conversationId: string, path: string, position: LspPosition], LspLocation[]>;

  'terminal:create': Handler<[conversationId: string], TerminalInfo>;
  'terminal:list': Handler<[conversationId: string], TerminalInfo[]>;
  /** Output so far, for re-attaching a view to a running terminal. */
  'terminal:buffer': Handler<[id: string], string>;
  'terminal:write': Handler<[id: string, data: string], void>;
  'terminal:resize': Handler<[id: string, cols: number, rows: number], void>;
  'terminal:kill': Handler<[id: string], void>;

  'attachments:fromPaths': Handler<[paths: string[]], AttachmentRef[]>;
  'attachments:fromBytes': Handler<[name: string, mime: string, bytes: Uint8Array], AttachmentRef>;

  'projects:list': Handler<[], ProjectSummary[]>;
  'projects:get': Handler<[id: string], ProjectDetail>;
  'projects:create': Handler<[input: { name: string; description: string }], Project>;
  'projects:update': Handler<[id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'instructions' | 'starred'>>], Project>;
  'projects:delete': Handler<[id: string], void>;
  'projects:addFiles': Handler<[id: string, paths: string[]], ProjectFile[]>;
  'projects:removeFile': Handler<[fileId: string], void>;

  'artifacts:list': Handler<[], ArtifactSummary[]>;
  'artifacts:get': Handler<[id: string], Artifact>;
  'artifacts:forConversation': Handler<[conversationId: string], Artifact[]>;
  'artifacts:saveAs': Handler<[id: string], string | null>;

  'images:search': Handler<[query: string], { url: string; width?: number; height?: number } | null>;
  /** Registers a fully-built inline-visualization document, returning a `cellar-viz://render/<id>` URL to load it. */
  'viz:register': Handler<[html: string], string>;
  /** Saves an exported visualization (base64 PNG or SVG) wherever the user picks. */
  'viz:saveAs': Handler<[fileName: string, base64: string], string | null>;

  'app:background': Handler<[], BackgroundStatus>;

  'update:state': Handler<[], AppUpdateState>;
  /** Manually re-checks even when an automatic check ran recently. */
  'update:check': Handler<[], AppUpdateState>;
  /** Quits and installs a downloaded update; no-op if nothing was downloaded. */
  'update:install': Handler<[], void>;
  /** Quick entry: show the main window on a conversation. */
  'app:openConversation': Handler<[conversationId: string, kind: ConversationKind], void>;
  'app:hideQuickEntry': Handler<[], void>;
  'system:pickPath': Handler<[kind: 'skill' | 'plugin'], string | null>;

  'skills:list': Handler<[], SkillInfo[]>;
  'skills:get': Handler<[id: string], SkillDetail>;
  'skills:save': Handler<[input: SkillInput], SkillInfo>;
  'skills:setEnabled': Handler<[id: string, enabled: boolean], void>;
  'skills:delete': Handler<[id: string], void>;
  /** Import a skill folder, a folder of skills, or a .zip / .skill file. */
  'skills:import': Handler<[path: string], SkillInfo[]>;
  'skills:importClaude': Handler<[], number>;
  'skills:reveal': Handler<[id?: string], void>;

  'plugins:list': Handler<[], PluginInfo[]>;
  /** Install from a folder, a .zip or a git URL. */
  'plugins:install': Handler<[source: string], PluginInfo[]>;
  'plugins:setEnabled': Handler<[id: string, enabled: boolean], void>;
  'plugins:remove': Handler<[id: string], void>;
  'plugins:reveal': Handler<[id: string], void>;
  /** Search plugins in the Hugging Face marketplace. */
  'plugins:marketplace:search': Handler<[query: { search?: string; sort?: string; limit?: number }], PluginMarketplaceEntry[]>;
  /** Install a plugin from Hugging Face by repo ID. */
  'plugins:marketplace:install': Handler<[repoId: string], PluginInfo>;

  'commands:list': Handler<[scope: ToolScope], CommandInfo[]>;
  'commands:get': Handler<[name: string], CommandDetail>;
  /** The prompt a custom command sends for the text typed after it. */
  'commands:expand': Handler<[name: string, args: string], string>;
  'commands:save': Handler<[input: CommandInput], CommandInfo>;
  'commands:delete': Handler<[name: string], void>;

  'connectors:list': Handler<[], ConnectorStatus[]>;
  'connectors:save': Handler<[input: ConnectorInput], ConnectorStatus>;
  'connectors:delete': Handler<[id: string], void>;
  'connectors:setEnabled': Handler<[id: string, enabled: boolean], void>;
  'connectors:reconnect': Handler<[id: string], void>;
  'connectors:signOutOAuth': Handler<[id: string], void>;
  /** null resets the tool to its default policy. */
  'connectors:setToolPolicy': Handler<[id: string, tool: string, policy: ToolPolicy | null], void>;
  'connectors:importJson': Handler<[json: string], number>;
  'connectors:importClaude': Handler<[], number>;

  'memory:list': Handler<[], MemoryItem[]>;
  'memory:add': Handler<[content: string], MemoryItem>;
  'memory:update': Handler<[id: string, content: string], MemoryItem>;
  'memory:delete': Handler<[id: string], void>;
  'memory:clear': Handler<[], void>;

  'memory:listTopics': Handler<[], MemoryTopic[]>;
  'memory:updateTopic': Handler<[id: string, content: string], MemoryTopic>;
  'memory:deleteTopic': Handler<[id: string], void>;
  'memory:clearTopics': Handler<[], void>;
  /** The "Tell Cellar what to change or remove" box; returns a short confirmation. */
  'memory:editWithText': Handler<[instruction: string], string>;
  /** /update-memory: read this conversation now and keep whatever is worth keeping (nothing, if nothing is). */
  'memory:updateFromChat': Handler<[conversationId: string], MemoryUpdateResult>;

  /** Hybrid memory retrieval; returns a compact XML-style block for system prompt injection. */
  'memory:retrieve': Handler<[query?: string, projectId?: string | null], string>;
  /** Compact summary of all topics (for the extractor). */
  'memory:getSummary': Handler<[], string>;
  /** Audit history for memory topics (for debugging/transparency). */
  'memory:getHistory': Handler<[topicId?: string], MemoryTopicHistoryEntry[]>;
  /** Export all memories and topics as JSON. */
  'memory:export': Handler<[], string>;
  /** Import memories from exported JSON with deduplication. */
  'memory:import': Handler<[json: string], MemoryImportResult>;

  /** The tools a model would get in a context (for /tools). */
  'tools:list': Handler<[scope: ToolScope, conversationId?: string, model?: ModelRef], ToolListing>;

  'scheduled:list': Handler<[], ScheduledTask[]>;
  'scheduled:save': Handler<[input: ScheduledTaskInput], ScheduledTask>;
  'scheduled:setEnabled': Handler<[id: string, enabled: boolean], ScheduledTask>;
  'scheduled:delete': Handler<[id: string], void>;
  'scheduled:runNow': Handler<[id: string], { conversationId: string | null }>;
  'scheduled:runs': Handler<[taskId?: string], ScheduledRun[]>;
  'scheduled:preview': Handler<[cron: string], CronPreview>;

  'voice:status': Handler<[], VoiceStatus>;
  'voice:installRuntime': Handler<[variant: WhisperVariant], void>;
  'voice:downloadModel': Handler<[id: string], void>;
  'voice:deleteModel': Handler<[id: string], void>;
  /** 16 kHz mono 16-bit WAV. */
  /** partial=true trades accuracy for speed (greedy decoding) for a live preview while still recording. */
  'voice:transcribe': Handler<[wav: Uint8Array, language?: string, partial?: boolean], TranscriptionResult>;

  'tts:status': Handler<[], TtsStatus>;
  'tts:installPiper': Handler<[], void>;
  'tts:downloadVoice': Handler<[id: string], void>;
  'tts:deleteVoice': Handler<[id: string], void>;
  /** A WAV rendered by piper, or null when the system engine is selected (the renderer speaks it itself). */
  'tts:synthesize': Handler<[text: string], Uint8Array | null>;

  /** The built-in Chromium browser (`main/browser/browser.ts`); the view is painted over `browser:setBounds`. */
  'browser:state': Handler<[], BrowserState>;
  'browser:open': Handler<[url: string, newTab?: boolean], BrowserTab>;
  'browser:navigate': Handler<[tabId: string | null, url: string], BrowserTab>;
  'browser:back': Handler<[tabId?: string | null], BrowserTab>;
  'browser:forward': Handler<[tabId?: string | null], BrowserTab>;
  'browser:reload': Handler<[tabId?: string | null], BrowserTab>;
  'browser:stop': Handler<[tabId?: string | null], void>;
  'browser:activate': Handler<[tabId: string], BrowserState>;
  'browser:close': Handler<[tabId: string], BrowserState>;
  /** Where the panel wants the page painted; null parks it off-screen. */
  'browser:setBounds': Handler<[bounds: BrowserBounds | null], void>;
  'browser:setVisible': Handler<[visible: boolean], void>;
  /** For the tab strip's per-domain signed-in indicator; a live check, not the saved snapshot. */
  'browser:loginStatus': Handler<[domain: string], BrowserLoginStatus>;

  /** Computer use (`main/computer/`): the on-screen pill and Settings. */
  'computer:state': Handler<[], ComputerState>;
  'computer:stop': Handler<[], void>;
  /** Paused or handed over: give the mouse back to the model. */
  'computer:resume': Handler<[], void>;
  /** The pill window fits its content. */
  'computer:pillSize': Handler<[height: number], void>;
  'computer:displays': Handler<[], ScreenDisplay[]>;
  /** Settings → Computer use → Try it: one look at the screen, as the model would get it. */
  'computer:test': Handler<[], ComputerTestResult>;

  'projects:indexStatus': Handler<[projectId: string], ProjectIndexStatus>;
  'projects:reindex': Handler<[projectId: string], void>;

  'design:list': Handler<[], DesignSummary[]>;
  /** The design of a Design conversation. */
  'design:get': Handler<[conversationId: string], Design>;
  /** A blank design without a first message; returns its conversation. */
  'design:create': Handler<[options: DesignStartOptions & { title?: string }], { conversationId: string; designId: string }>;
  /** Saves an edited design; fails when `baseVersion` is no longer the latest (reload and retry). */
  'design:save': Handler<[design: Design, baseVersion: number], Design>;
  'design:duplicate': Handler<[conversationId: string], { conversationId: string }>;
  /** Asks where to save and writes PNG, PDF or PowerPoint; null when cancelled. */
  'design:export': Handler<[request: DesignExportRequest], string | null>;
  /** Every saved snapshot of a design, newest first. */
  'design:versions:list': Handler<[designId: string], DesignVersionSummary[]>;
  /** One snapshot's full content, e.g. to render a thumbnail before restoring it. */
  'design:versions:get': Handler<[designId: string, versionId: string], Design>;
  /** Restores an old snapshot as a new, latest version. */
  'design:versions:restore': Handler<[designId: string, versionId: string], Design>;
  /** Labels a saved version (or clears its label with `name: null`). */
  'design:versions:rename': Handler<[designId: string, versionId: string, name: string | null], void>;
  /** Fonts imported into Cellar, usable by name in any font picker. */
  'fonts:list': Handler<[], FontSummary[]>;
  'fonts:addFiles': Handler<[paths: string[]], FontSummary[]>;
  'fonts:addGoogle': Handler<[family: string], FontSummary>;
  'fonts:remove': Handler<[id: string], void>;
  /** `@font-face` CSS for exactly these family names (skipping any not actually imported); injected once per editor session. */
  'fonts:css': Handler<[families: string[]], string>;

  'math:list': Handler<[], MathBoardSummary[]>;
  /** The board of a Math conversation. */
  'math:get': Handler<[conversationId: string], MathBoard>;
  /** A blank board without a first message; returns its conversation. */
  'math:create': Handler<[options: MathStartOptions & { title?: string }], { conversationId: string; boardId: string }>;
  /** Saves an edited board; fails when `baseVersion` is no longer the latest (reload and retry). */
  'math:save': Handler<[board: MathBoard, baseVersion: number], MathBoard>;
  'math:duplicate': Handler<[conversationId: string], { conversationId: string }>;
  /** Asks where to save and writes a PDF, a PNG or a Markdown study sheet; null when cancelled. */
  'math:export': Handler<[request: MathExportRequest], string | null>;
  /** The calculator: exact and decimal answers, optionally with the reduction. */
  'math:calculate': Handler<[expression: string, options?: { angle?: 'deg' | 'rad'; steps?: boolean; decimals?: number }], import('./math/calc').CalcResult>;
  /** Step-by-step solutions, worked out by Cellar rather than by a model. */
  'math:solve': Handler<[request: import('./math/solve').SolveRequest], import('./math/solve').Solution & { text: string }>;
  /** Generates a practice test with answers and worked solutions. */
  'math:quiz': Handler<[request: import('./math/quiz').QuizRequest], import('./math/quiz').GeneratedQuiz>;

  /** Study: the shelf of books. */
  'study:list': Handler<[], BookSummary[]>;
  /** Adds PDFs to the shelf (a file already there opens the existing book); returns each book's latest chat. */
  'study:import': Handler<[paths: string[]], Array<{ bookId: string; conversationId: string; title: string; existing: boolean }>>;
  /** The latest chat about a book, created when there is none. */
  'study:open': Handler<[bookId: string], { conversationId: string }>;
  'study:get': Handler<[conversationId: string], StudySession>;
  /** The PDF itself, for the viewer. */
  'study:bytes': Handler<[bookId: string], Uint8Array>;
  /** Saves the annotation layer; fails when `baseVersion` is no longer the latest (reload and retry). */
  'study:save': Handler<[bookId: string, annotations: StudyAnnotation[], baseVersion: number], { version: number }>;
  'study:setPage': Handler<[bookId: string, page: number], void>;
  'study:rename': Handler<[bookId: string, title: string], void>;
  /** Removes the book, its notes and its chats. */
  'study:delete': Handler<[bookId: string], void>;
  'study:chats': Handler<[bookId: string], BookChat[]>;
  'study:newChat': Handler<[bookId: string], { conversationId: string }>;
  'study:setMode': Handler<[conversationId: string, mode: StudyMode], void>;
  /** Asks where to save and writes a copy of the PDF with the notes drawn in; null when cancelled. */
  'study:export': Handler<[bookId: string], string | null>;
  'study:search': Handler<[bookId: string, query: string], StudyPageHit[]>;
  /** The viewer's answer to a `study:render` request. */
  'study:rendered': Handler<[requestId: string, png: string | null], void>;
  /** pdf.js's own data files (character maps, standard fonts, image decoders), which the viewer cannot fetch from file://. */
  'study:pdfAsset': Handler<[kind: 'cMapUrl' | 'standardFontDataUrl' | 'wasmUrl', filename: string], Uint8Array>;
}

export interface IpcEventMap {
  'chat:stream': ChatStreamEvent;
  'chat:changed': { conversationId?: string };
  /** Suggested follow-up questions for a finished chat reply. */
  'chat:followUps': { conversationId: string; messageId: string; questions: string[] };
  'models:changed': { reason: string };
  'models:loadProgress': LoadProgressEvent;
  'providers:status': ProviderStatus[];
  'downloads:changed': DownloadJob[];
  'runtimes:progress': RuntimeInstallProgress;
  'settings:changed': AppSettings;
  'projects:changed': { projectId?: string };
  'app:command': { command: AppCommand };
  'tasks:notify': TaskNotice;
  /** Open a conversation, e.g. after clicking a desktop notification. */
  'app:open': { conversationId: string; kind: ConversationKind };
  'terminal:data': TerminalDataEvent;
  'terminal:exit': TerminalExitEvent;
  'terminal:changed': { conversationId: string };
  'code:side': SideChatEvent;
  'code:lspDiagnostics': LspDiagnosticsEvent;
  'customize:changed': { kind: 'skills' | 'plugins' | 'commands' | 'memory' };
  'connectors:changed': ConnectorStatus[];
  'scheduled:changed': Record<string, never>;
  'voice:progress': VoiceProgress;
  /** Main asks the renderer to read something aloud (it owns speech synthesis and audio output). */
  'voice:speak': { text: string };
  'browser:changed': BrowserState;
  /** A browser tool ran: open the panel so the user sees what the model is doing. */
  'browser:reveal': Record<string, never>;
  /** Computer use: what the on-screen pill shows. */
  'computer:state': ComputerState;
  'projects:index': ProjectIndexStatus;
  /** Sent to the quick entry window each time it opens. */
  'quick:shown': Record<string, never>;
  'design:changed': DesignChangedEvent;
  'math:changed': MathChangedEvent;
  'study:changed': StudyChangedEvent;
  /** The model turned the page. */
  'study:goto': StudyGotoEvent;
  /** Main wants a picture of a page from an open viewer (for a vision model). */
  'study:render': StudyRenderRequest;
  'study:progress': StudyImportProgress;
  'update:changed': AppUpdateState;
}

export type InvokeChannel = keyof IpcInvokeMap;
export type EventChannel = keyof IpcEventMap;

const invokeChannelFlags: Record<InvokeChannel, true> = {
  'app:info': true,
  'stats:usage': true,
  'system:hardware': true,
  'system:openExternal': true,
  'system:showInFolder': true,
  'system:pickDirectory': true,
  'system:pickFiles': true,
  'window:setTheme': true,
  'window:action': true,
  'settings:get': true,
  'settings:update': true,
  'runtimes:list': true,
  'runtimes:latestRelease': true,
  'runtimes:install': true,
  'runtimes:addCustom': true,
  'runtimes:remove': true,
  'runtimes:setActive': true,
  'providers:status': true,
  'providers:configs': true,
  'providers:save': true,
  'providers:delete': true,
  'providers:startUnsloth': true,
  'models:list': true,
  'models:rescan': true,
  'models:detail': true,
  'models:estimate': true,
  'models:load': true,
  'models:unload': true,
  'models:loaded': true,
  'models:savePreset': true,
  'models:resetPreset': true,
  'models:delete': true,
  'models:logs': true,
  'hub:search': true,
  'hub:repo': true,
  'hub:readme': true,
  'hub:quantFit': true,
  'downloads:list': true,
  'downloads:start': true,
  'downloads:pause': true,
  'downloads:resume': true,
  'downloads:cancel': true,
  'downloads:clear': true,
  'chat:list': true,
  'chat:get': true,
  'chat:send': true,
  'chat:regenerate': true,
  'chat:edit': true,
  'chat:stop': true,
  'chat:switchBranch': true,
  'chat:rename': true,
  'chat:star': true,
  'chat:delete': true,
  'chat:moveToProject': true,
  'chat:updateSettings': true,
  'chat:search': true,
  'chat:discardIncognito': true,
  'chat:activeStreams': true,
  /** /context command */
  'chat:contextInfo': true,
  'tasks:approve': true,
  'tasks:setPermissionMode': true,
  'tasks:toolResult': true,
  'tasks:openFile': true,
  'tasks:revealFile': true,
  'tasks:saveFileAs': true,
  'tasks:changes': true,
  'tasks:fileDiff': true,
  'tasks:revertFile': true,
  'code:repoInfo': true,
  'code:setMode': true,
  'code:changes': true,
  'code:fileDiff': true,
  'code:discardFile': true,
  'code:commit': true,
  'code:merge': true,
  'code:remoteInfo': true,
  'code:push': true,
  'code:createPullRequest': true,
  'code:pullRequestUrl': true,
  'code:mergeStatus': true,
  'code:conflictFile': true,
  'code:writeConflictFile': true,
  'code:continueMerge': true,
  'code:abortMerge': true,
  'code:listDir': true,
  'code:readFile': true,
  'code:writeFile': true,
  'code:memory': true,
  'code:deleteSession': true,
  'code:previewUrl': true,
  'code:sideChat': true,
  'code:sideChatStop': true,
  'code:lspOpen': true,
  'code:lspChange': true,
  'code:lspClose': true,
  'code:lspCompletion': true,
  'code:lspDefinition': true,
  'code:lspReferences': true,
  'terminal:create': true,
  'terminal:list': true,
  'terminal:buffer': true,
  'terminal:write': true,
  'terminal:resize': true,
  'terminal:kill': true,
  'attachments:fromPaths': true,
  'attachments:fromBytes': true,
  'projects:list': true,
  'projects:get': true,
  'projects:create': true,
  'projects:update': true,
  'projects:delete': true,
  'projects:addFiles': true,
  'projects:removeFile': true,
  'artifacts:list': true,
  'artifacts:get': true,
  'artifacts:forConversation': true,
  'artifacts:saveAs': true,
  'images:search': true,
  'viz:register': true,
  'viz:saveAs': true,
  'app:background': true,
  'update:state': true,
  'update:check': true,
  'update:install': true,
  'app:openConversation': true,
  'app:hideQuickEntry': true,
  'system:pickPath': true,
  'skills:list': true,
  'skills:get': true,
  'skills:save': true,
  'skills:setEnabled': true,
  'skills:delete': true,
  'skills:import': true,
  'skills:importClaude': true,
  'skills:reveal': true,
  'plugins:list': true,
  'plugins:install': true,
  'plugins:setEnabled': true,
  'plugins:remove': true,
  'plugins:reveal': true,
  'plugins:marketplace:search': true,
  'plugins:marketplace:install': true,
  'commands:list': true,
  'commands:get': true,
  'commands:expand': true,
  'commands:save': true,
  'commands:delete': true,
  'connectors:list': true,
  'connectors:save': true,
  'connectors:delete': true,
  'connectors:setEnabled': true,
  'connectors:reconnect': true,
  'connectors:signOutOAuth': true,
  'connectors:setToolPolicy': true,
  'connectors:importJson': true,
  'connectors:importClaude': true,
  'memory:list': true,
  'memory:add': true,
  'memory:update': true,
  'memory:delete': true,
  'memory:clear': true,
  'memory:listTopics': true,
  'memory:updateTopic': true,
  'memory:deleteTopic': true,
  'memory:clearTopics': true,
  'memory:editWithText': true,
  'memory:updateFromChat': true,
  'memory:retrieve': true,
  'memory:getSummary': true,
  'memory:getHistory': true,
  'memory:export': true,
  'memory:import': true,
  'tools:list': true,
  'scheduled:list': true,
  'scheduled:save': true,
  'scheduled:setEnabled': true,
  'scheduled:delete': true,
  'scheduled:runNow': true,
  'scheduled:runs': true,
  'scheduled:preview': true,
  'voice:status': true,
  'voice:installRuntime': true,
  'voice:downloadModel': true,
  'voice:deleteModel': true,
  'voice:transcribe': true,
  'tts:status': true,
  'tts:installPiper': true,
  'tts:downloadVoice': true,
  'tts:deleteVoice': true,
  'tts:synthesize': true,
  'browser:state': true,
  'browser:open': true,
  'browser:navigate': true,
  'browser:back': true,
  'browser:forward': true,
  'browser:reload': true,
  'browser:stop': true,
  'browser:activate': true,
  'browser:close': true,
  'browser:setBounds': true,
  'browser:setVisible': true,
  'browser:loginStatus': true,
  'computer:state': true,
  'computer:stop': true,
  'computer:resume': true,
  'computer:pillSize': true,
  'computer:displays': true,
  'computer:test': true,
  'projects:indexStatus': true,
  'projects:reindex': true,
  'design:list': true,
  'design:get': true,
  'design:create': true,
  'design:save': true,
  'design:duplicate': true,
  'design:export': true,
  'design:versions:list': true,
  'design:versions:get': true,
  'design:versions:restore': true,
  'design:versions:rename': true,
  'fonts:list': true,
  'fonts:addFiles': true,
  'fonts:addGoogle': true,
  'fonts:remove': true,
  'fonts:css': true,
  'math:list': true,
  'math:get': true,
  'math:create': true,
  'math:save': true,
  'math:duplicate': true,
  'math:export': true,
  'math:calculate': true,
  'math:solve': true,
  'math:quiz': true,
  'study:list': true,
  'study:import': true,
  'study:open': true,
  'study:get': true,
  'study:bytes': true,
  'study:save': true,
  'study:setPage': true,
  'study:rename': true,
  'study:delete': true,
  'study:chats': true,
  'study:newChat': true,
  'study:setMode': true,
  'study:export': true,
  'study:search': true,
  'study:rendered': true,
  'study:pdfAsset': true,
};

const eventChannelFlags: Record<EventChannel, true> = {
  'chat:stream': true,
  'chat:changed': true,
  'chat:followUps': true,
  'models:changed': true,
  'models:loadProgress': true,
  'providers:status': true,
  'downloads:changed': true,
  'runtimes:progress': true,
  'settings:changed': true,
  'projects:changed': true,
  'app:command': true,
  'tasks:notify': true,
  'app:open': true,
  'terminal:data': true,
  'terminal:exit': true,
  'terminal:changed': true,
  'code:side': true,
  'code:lspDiagnostics': true,
  'customize:changed': true,
  'connectors:changed': true,
  'scheduled:changed': true,
  'voice:progress': true,
  'voice:speak': true,
  'browser:changed': true,
  'browser:reveal': true,
  'computer:state': true,
  'projects:index': true,
  'quick:shown': true,
  'design:changed': true,
  'math:changed': true,
  'study:changed': true,
  'study:goto': true,
  'study:render': true,
  'study:progress': true,
  'update:changed': true,
};

export const INVOKE_CHANNELS = Object.keys(invokeChannelFlags) as InvokeChannel[];
export const EVENT_CHANNELS = Object.keys(eventChannelFlags) as EventChannel[];

export interface CellarBridge {
  invoke<K extends InvokeChannel>(channel: K, ...args: IpcInvokeMap[K]['args']): Promise<IpcInvokeMap[K]['result']>;
  on<K extends EventChannel>(channel: K, listener: (payload: IpcEventMap[K]) => void): () => void;
  getPathForFile(file: File): string;
  platform: Platform;
}
