import type { AgentPart, ConversationKind, TaskStartOptions, TaskState, TaskStatus } from './agent';
import type { CodeMode, CodeStartOptions } from './code';
import type { InferenceParams, ModelRef } from './models';

export type Role = 'user' | 'assistant' | 'system';

export type AttachmentKind = 'image' | 'text' | 'pdf';

export interface AttachmentRef {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  /** First characters of extracted text (text/pdf only). */
  preview?: string;
  /** Rough token estimate of the text payload. */
  tokens?: number;
}

export interface GenerationStats {
  ttftMs?: number;
  totalMs?: number;
  reasoningMs?: number;
  tokensPerSecond?: number;
  promptTokens?: number;
  completionTokens?: number;
  stopReason?: string;
}

export type MessageStatus = 'complete' | 'streaming' | 'stopped' | 'error';

export interface MessageModelInfo extends ModelRef {
  displayName: string;
}

export interface Message {
  id: string;
  conversationId: string;
  parentId: string | null;
  role: Role;
  content: string;
  reasoning?: string;
  attachments: AttachmentRef[];
  model?: MessageModelInfo;
  stats?: GenerationStats;
  status: MessageStatus;
  error?: string;
  /** Cowork turns: text, thinking and tool steps in order. `content` still holds the joined text. */
  parts?: AgentPart[];
  createdAt: number;
}

export type ThinkingLevel = 'off' | 'on' | 'low' | 'medium' | 'high';

export interface ConversationSettings {
  thinking?: ThinkingLevel;
  inference?: Partial<InferenceParams>;
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;
  projectId: string | null;
  starred: boolean;
  currentLeafId: string | null;
  model?: ModelRef;
  settings: ConversationSettings;
  /** Present for Cowork tasks. */
  task?: TaskState;
  incognito: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  title: string;
  projectId: string | null;
  projectName?: string;
  starred: boolean;
  updatedAt: number;
  taskStatus?: TaskStatus;
  preview?: string;
  /** Code sessions: repository, branch and mode. */
  repoName?: string;
  repoRoot?: string;
  branch?: string;
  codeMode?: CodeMode;
}

export interface ConversationWithMessages {
  conversation: Conversation;
  /** All messages in the tree; the renderer derives the visible branch from currentLeafId. */
  messages: Message[];
}

export interface ConversationFilter {
  query?: string;
  starred?: boolean;
  projectId?: string | null;
  kind?: ConversationKind;
  /** Only these kinds (ignored when `kind` is set). */
  kinds?: ConversationKind[];
  limit?: number;
}

export interface SendMessageInput {
  conversationId?: string;
  incognito?: boolean;
  projectId?: string | null;
  content: string;
  attachmentIds: string[];
  model: ModelRef;
  thinking: ThinkingLevel;
  /** Starts a Cowork task instead of a chat (only for new conversations). */
  task?: TaskStartOptions;
  /** Starts a Code session (only for new conversations). */
  code?: CodeStartOptions;
}

export interface SendMessageResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
}

export type StreamEvent =
  | { type: 'status'; message: string }
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_call'; id: string; name: string; argumentsDelta: string }
  | { type: 'usage'; promptTokens?: number; completionTokens?: number }
  | { type: 'stats'; stats: GenerationStats }
  | { type: 'error'; message: string }
  | { type: 'done'; stopReason?: string };

export interface ChatStreamEvent {
  conversationId: string;
  messageId: string;
  /** Accumulated state so a late subscriber can render immediately. */
  content: string;
  reasoning: string;
  status: MessageStatus | 'loading-model';
  statusMessage?: string;
  stats?: GenerationStats;
  error?: string;
  /** Cowork turns only: the steps so far (long tool results shortened) and the task state. */
  parts?: AgentPart[];
  task?: TaskState;
}

export interface SearchHit {
  conversationId: string;
  kind: ConversationKind;
  messageId?: string;
  title: string;
  snippet: string;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  instructions: string;
  starred: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  mime: string;
  size: number;
  tokens: number;
  createdAt: number;
}

export interface ProjectSummary extends Project {
  fileCount: number;
  conversationCount: number;
}

export interface ProjectDetail {
  project: Project;
  files: ProjectFile[];
  conversations: ConversationSummary[];
}

export type ArtifactType = 'html' | 'svg' | 'react' | 'mermaid' | 'markdown' | 'code';

export interface Artifact {
  id: string;
  conversationId: string;
  messageId: string;
  identifier: string;
  type: ArtifactType;
  title: string;
  language?: string;
  content: string;
  version: number;
  createdAt: number;
}

export interface ArtifactSummary {
  id: string;
  conversationId: string;
  conversationTitle: string;
  identifier: string;
  type: ArtifactType;
  title: string;
  version: number;
  createdAt: number;
}
