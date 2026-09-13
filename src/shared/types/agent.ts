/** Cowork: an agent that works through a task with tools inside a folder. */

export type ConversationKind = 'chat' | 'task';

/**
 * - ask: file changes and commands wait for approval
 * - auto-edits: file changes inside the folder run without asking; commands still ask
 * - plan: read-only investigation that ends with a plan
 */
export type PermissionMode = 'ask' | 'auto-edits' | 'plan';

export type TaskStatus = 'running' | 'waiting' | 'done' | 'stopped' | 'error';

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
  content: string;
  status: TodoStatus;
}

export interface TaskFile {
  /** Relative to the task's working folder, with forward slashes. */
  path: string;
  absolutePath: string;
  action: 'created' | 'modified';
  tool: string;
  bytes?: number;
  updatedAt: number;
}

export interface TaskSource {
  url: string;
  title?: string;
  kind: 'search' | 'fetch';
  query?: string;
  at: number;
}

export interface TaskState {
  /** The folder the user picked; null when they skipped and Cellar made a scratch folder. */
  folder: string | null;
  /** Where the tools actually operate (the picked folder or the scratch folder). */
  workDir: string;
  permissionMode: PermissionMode;
  status: TaskStatus;
  todos: TodoItem[];
  files: TaskFile[];
  sources: TaskSource[];
  /** Set by "Always allow" on a command approval. */
  allowCommands: boolean;
  /** Hosts the user allowed web_fetch to open without asking. */
  allowedDomains: string[];
  /** Model calls used in the latest turn. */
  steps: number;
  maxSteps: number;
}

export type ToolCategory = 'read' | 'edit' | 'command' | 'web' | 'plan';

export type ToolPartStatus = 'streaming' | 'awaiting-approval' | 'running' | 'done' | 'error' | 'denied' | 'cancelled';

export interface ApprovalRequest {
  kind: 'write' | 'edit' | 'document' | 'command' | 'web';
  title: string;
  path?: string;
  /** For writes: whether the file already exists. */
  exists?: boolean;
  /** File content, document outline or command text. */
  preview?: string;
  diff?: { oldText: string; newText: string };
  url?: string;
}

export interface ToolPart {
  type: 'tool';
  id: string;
  round: number;
  name: string;
  /** Raw JSON arguments as the model produced them. */
  argsText: string;
  args?: Record<string, unknown>;
  status: ToolPartStatus;
  category?: ToolCategory;
  /** Tool output sent back to the model; live stream events carry a shortened copy. */
  result?: string;
  resultTruncated?: boolean;
  error?: string;
  approval?: ApprovalRequest;
  feedback?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface TextPart {
  type: 'text';
  round: number;
  text: string;
}

export interface ReasoningPart {
  type: 'reasoning';
  round: number;
  text: string;
  durationMs?: number;
}

/** Earlier rounds were summarized to free up the context window. */
export interface CompactionPart {
  type: 'compaction';
  round: number;
  summary: string;
  compactedRounds: number;
}

export type AgentPart = TextPart | ReasoningPart | ToolPart | CompactionPart;

export type ApprovalAction = 'allow' | 'allow-all' | 'deny';

export interface ApprovalDecision {
  action: ApprovalAction;
  /** Optional note for the model when denying. */
  feedback?: string;
}

export interface TaskStartOptions {
  folder: string | null;
  permissionMode: PermissionMode;
}

export interface TaskNotice {
  conversationId: string;
  title: string;
  body: string;
  kind: 'done' | 'approval' | 'error';
}
