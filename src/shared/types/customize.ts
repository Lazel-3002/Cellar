/** Customize: skills, connectors (MCP servers), plugins, slash commands and memory. */

export interface SkillInfo {
  /** `user:<folder>` for your own skills, `plugin:<plugin>:<folder>` for skills a plugin brings. */
  id: string;
  name: string;
  description: string;
  source: 'user' | 'plugin';
  pluginName?: string;
  /** Absolute folder of the skill. */
  dir: string;
  enabled: boolean;
  /** Helper files next to SKILL.md, relative with forward slashes (capped). */
  files: string[];
  /** SKILL.md could not be read or has no name/description. */
  error?: string;
}

export interface SkillDetail extends SkillInfo {
  /** SKILL.md without its frontmatter. */
  body: string;
}

export interface SkillInput {
  /** Existing user skill to update; omitted to create one. */
  id?: string;
  name: string;
  description: string;
  body: string;
}

export interface CommandInfo {
  /** Without the slash. Plugin commands are prefixed `plugin:name` only when names clash. */
  name: string;
  description: string;
  argumentHint?: string;
  source: 'built-in' | 'user' | 'plugin';
  pluginName?: string;
}

export interface CommandDetail extends CommandInfo {
  body: string;
}

export interface CommandInput {
  /** Existing user command to replace (its name before renaming). */
  previousName?: string;
  name: string;
  description: string;
  body: string;
}

export interface PluginInfo {
  /** Folder name under ~/.cellar/plugins. */
  id: string;
  name: string;
  description: string;
  version?: string;
  author?: string;
  dir: string;
  enabled: boolean;
  skills: number;
  commands: number;
  connectors: number;
  error?: string;
}

export interface PluginMarketplaceEntry {
  /** Hugging Face repo ID like "owner/plugin-name" */
  id: string;
  name: string;
  description: string;
  version?: string;
  author: string;
  downloads: number;
  likes: number;
  tags: string[];
  lastModified?: string;
  gated?: boolean;
}

export interface PluginMarketplaceSearch {
  search?: string;
  sort?: 'downloads' | 'likes' | 'lastModified';
  limit?: number;
}

export type ConnectorTransport = 'stdio' | 'http' | 'sse';

/** allow: runs without asking · ask: approval card each time · off: hidden from models. */
export type ToolPolicy = 'allow' | 'ask' | 'off';

export interface ConnectorToolInfo {
  name: string;
  title?: string;
  description: string;
  /** The server marks the tool as read-only (it only reads data). */
  readOnly: boolean;
  policy: ToolPolicy;
}

export interface ConnectorConfig {
  id: string;
  name: string;
  transport: ConnectorTransport;
  /** stdio */
  command: string;
  args: string[];
  env: Record<string, string>;
  /** http / sse */
  url: string;
  headers: Record<string, string>;
  enabled: boolean;
  /** Per-tool overrides; tools without one default to allow when read-only, otherwise ask. */
  toolPolicies: Record<string, ToolPolicy>;
  /** Set for connectors a plugin provides (edited through the plugin). */
  pluginName?: string;
  createdAt: number;
}

export type ConnectorInput = Omit<ConnectorConfig, 'id' | 'createdAt' | 'toolPolicies' | 'pluginName'> & { id?: string };

export interface ConnectorStatus {
  config: ConnectorConfig;
  state: 'disabled' | 'connecting' | 'connected' | 'needs-auth' | 'error';
  message?: string;
  serverName?: string;
  serverVersion?: string;
  instructions?: string;
  tools: ConnectorToolInfo[];
  /** state 'needs-auth': open this to sign in (Cellar also opens it automatically). */
  authUrl?: string;
  /** A remote connector has a saved OAuth session, whether or not it is currently connected. */
  signedIn?: boolean;
}

export interface MemoryItem {
  id: string;
  content: string;
  source: 'user' | 'model';
  conversationId?: string;
  createdAt: number;
  updatedAt: number;
}

/** "you" = who the user is / how to respond to them; "topic" = a recurring interest; "area" = a project. */
export type MemoryCategory = 'you' | 'topic' | 'area';

/** A grouped, running summary quietly built from conversations (Customize -> Memory, "Generate memory from chats"). */
export interface MemoryTopic {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  projectId?: string;
  projectName?: string;
  createdAt: number;
  updatedAt: number;
}

/** What /update-memory (or an automatic pass) did with a conversation. */
export interface MemoryUpdateResult {
  /** Titles of the memory topics written or updated. */
  saved: string[];
  /** Titles dropped as outdated. */
  removed: string[];
  /** Why nothing was kept, when both lists are empty. */
  reason?: 'nothing-useful' | 'incognito' | 'too-short' | 'no-model' | 'turned-off';
}

export type ToolScope = 'chat' | 'task' | 'code' | 'design' | 'math';

export interface ToolInfo {
  name: string;
  description: string;
  /** Where the tool comes from: "Files", "Web", a connector's name, "Skills", "Memory"… */
  group: string;
  kind: 'built-in' | 'connector' | 'skill' | 'memory';
  /** Connector tools: whether each call asks first. */
  policy?: ToolPolicy;
}

export interface ToolListing {
  tools: ToolInfo[];
  /** Why tools are unavailable, e.g. the model has no native tool calling. */
  notes: string[];
}
