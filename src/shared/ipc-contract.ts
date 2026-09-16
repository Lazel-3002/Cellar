import type { ApprovalDecision, ConversationKind, PermissionMode, TaskNotice } from './types/agent';
import type {
  ChangeSet,
  CodeMode,
  CommitResult,
  FileContent,
  FileDiff,
  FileEntry,
  MemoryFile,
  MergeResult,
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
import type { Design, DesignChangedEvent, DesignExportRequest, DesignStartOptions, DesignSummary } from './types/design';
import type { MathBoard, MathBoardSummary, MathChangedEvent, MathExportRequest, MathStartOptions } from './types/math';
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
  PluginInfo,
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
import type { TranscriptionResult, VoiceProgress, VoiceStatus, WhisperVariant } from './types/voice';

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
  'system:hardware': Handler<[refresh?: boolean], HardwareInfo>;
  'system:openExternal': Handler<[url: string], void>;
  'system:showInFolder': Handler<[path: string], void>;
  'system:pickDirectory': Handler<[title?: string], string | null>;
  'system:pickFiles': Handler<[kind?: 'attachments' | 'knowledge'], string[]>;
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

  'tasks:approve': Handler<[messageId: string, toolCallId: string, decision: ApprovalDecision], void>;
  'tasks:setPermissionMode': Handler<[conversationId: string, mode: PermissionMode], void>;
  'tasks:toolResult': Handler<[messageId: string, toolCallId: string], string>;
  'tasks:openFile': Handler<[conversationId: string, path: string], void>;
  'tasks:revealFile': Handler<[conversationId: string, path: string], void>;
  'tasks:saveFileAs': Handler<[conversationId: string, path: string], string | null>;

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

  'app:background': Handler<[], BackgroundStatus>;
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
  /** null resets the tool to its default policy. */
  'connectors:setToolPolicy': Handler<[id: string, tool: string, policy: ToolPolicy | null], void>;
  'connectors:importJson': Handler<[json: string], number>;
  'connectors:importClaude': Handler<[], number>;

  'memory:list': Handler<[], MemoryItem[]>;
  'memory:add': Handler<[content: string], MemoryItem>;
  'memory:update': Handler<[id: string, content: string], MemoryItem>;
  'memory:delete': Handler<[id: string], void>;
  'memory:clear': Handler<[], void>;

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
  'voice:transcribe': Handler<[wav: Uint8Array, language?: string], TranscriptionResult>;

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
}

export interface IpcEventMap {
  'chat:stream': ChatStreamEvent;
  'chat:changed': { conversationId?: string };
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
  'customize:changed': { kind: 'skills' | 'plugins' | 'commands' | 'memory' };
  'connectors:changed': ConnectorStatus[];
  'scheduled:changed': Record<string, never>;
  'voice:progress': VoiceProgress;
  'projects:index': ProjectIndexStatus;
  /** Sent to the quick entry window each time it opens. */
  'quick:shown': Record<string, never>;
  'design:changed': DesignChangedEvent;
  'math:changed': MathChangedEvent;
}

export type InvokeChannel = keyof IpcInvokeMap;
export type EventChannel = keyof IpcEventMap;

const invokeChannelFlags: Record<InvokeChannel, true> = {
  'app:info': true,
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
  'tasks:approve': true,
  'tasks:setPermissionMode': true,
  'tasks:toolResult': true,
  'tasks:openFile': true,
  'tasks:revealFile': true,
  'tasks:saveFileAs': true,
  'code:repoInfo': true,
  'code:setMode': true,
  'code:changes': true,
  'code:fileDiff': true,
  'code:discardFile': true,
  'code:commit': true,
  'code:merge': true,
  'code:listDir': true,
  'code:readFile': true,
  'code:writeFile': true,
  'code:memory': true,
  'code:deleteSession': true,
  'code:previewUrl': true,
  'code:sideChat': true,
  'code:sideChatStop': true,
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
  'app:background': true,
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
  'connectors:setToolPolicy': true,
  'connectors:importJson': true,
  'connectors:importClaude': true,
  'memory:list': true,
  'memory:add': true,
  'memory:update': true,
  'memory:delete': true,
  'memory:clear': true,
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
  'projects:indexStatus': true,
  'projects:reindex': true,
  'design:list': true,
  'design:get': true,
  'design:create': true,
  'design:save': true,
  'design:duplicate': true,
  'design:export': true,
  'math:list': true,
  'math:get': true,
  'math:create': true,
  'math:save': true,
  'math:duplicate': true,
  'math:export': true,
  'math:calculate': true,
  'math:solve': true,
  'math:quiz': true,
};

const eventChannelFlags: Record<EventChannel, true> = {
  'chat:stream': true,
  'chat:changed': true,
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
  'customize:changed': true,
  'connectors:changed': true,
  'scheduled:changed': true,
  'voice:progress': true,
  'projects:index': true,
  'quick:shown': true,
  'design:changed': true,
  'math:changed': true,
};

export const INVOKE_CHANNELS = Object.keys(invokeChannelFlags) as InvokeChannel[];
export const EVENT_CHANNELS = Object.keys(eventChannelFlags) as EventChannel[];

export interface CellarBridge {
  invoke<K extends InvokeChannel>(channel: K, ...args: IpcInvokeMap[K]['args']): Promise<IpcInvokeMap[K]['result']>;
  on<K extends EventChannel>(channel: K, listener: (payload: IpcEventMap[K]) => void): () => void;
  getPathForFile(file: File): string;
  platform: Platform;
}
