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
  ProjectSummary,
  SearchHit,
  SendMessageInput,
  SendMessageResult,
  ThinkingLevel,
} from './types/chat';
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
import type { ProviderConfig, ProviderConfigInput, ProviderStatus } from './types/providers';
import type { AppSettings, AppSettingsPatch } from './types/settings';
import type { HardwareInfo, RuntimeInfo, RuntimeInstallProgress, RuntimeRelease, RuntimeVariant } from './types/system';

export type Platform = 'win32' | 'darwin' | 'linux' | 'aix' | 'android' | 'freebsd' | 'haiku' | 'openbsd' | 'sunos' | 'cygwin' | 'netbsd';

export interface AppInfo {
  version: string;
  platform: Platform;
  isDev: boolean;
  userDataDir: string;
  modelsDir: string;
  logsDir: string;
}

export type AppCommand = 'new-chat' | 'new-incognito' | 'search' | 'settings' | 'toggle-sidebar' | 'models' | 'discover';

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
};

export const INVOKE_CHANNELS = Object.keys(invokeChannelFlags) as InvokeChannel[];
export const EVENT_CHANNELS = Object.keys(eventChannelFlags) as EventChannel[];

export interface CellarBridge {
  invoke<K extends InvokeChannel>(channel: K, ...args: IpcInvokeMap[K]['args']): Promise<IpcInvokeMap[K]['result']>;
  on<K extends EventChannel>(channel: K, listener: (payload: IpcEventMap[K]) => void): () => void;
  getPathForFile(file: File): string;
  platform: Platform;
}
