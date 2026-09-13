import { z } from 'zod';
import type { ApprovalRequest, TaskFile, TaskSource, TaskState, TodoItem, ToolCategory } from '@shared/types/agent';
import type { AppSettings } from '@shared/types/settings';
import type { ToolSchema } from '../../providers/types';
import type { Workspace } from '../workspace';

export interface ToolContext {
  workspace: Workspace;
  task: TaskState;
  settings: AppSettings;
  signal: AbortSignal;
  /** Upper bound for the text handed back to the model. */
  maxResultChars: number;
  /** URLs the user wrote or search results returned; web_fetch opens these without asking. */
  knownUrls: Set<string>;
  recordFile(file: Omit<TaskFile, 'updatedAt' | 'path'> & { path?: string }): void;
  recordSource(source: Omit<TaskSource, 'at'>): void;
  setTodos(todos: TodoItem[]): void;
}

export interface AgentTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  category: ToolCategory;
  input: S;
  /**
   * What the user is asked before the call runs. Edit and command tools always describe
   * themselves (the permission mode decides whether to ask); web tools return null when
   * no approval is needed.
   */
  approval?(args: z.output<S>, ctx: ToolContext): Promise<ApprovalRequest | null>;
  run(args: z.output<S>, ctx: ToolContext): Promise<string>;
}

export function defineTool<S extends z.ZodType>(tool: AgentTool<S>): AgentTool<S> {
  return tool;
}

/** Errors a tool reports to the model as a normal result rather than a crash. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

function cleanSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(cleanSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema') continue;
    if ((key === 'maximum' || key === 'minimum') && typeof value === 'number' && Math.abs(value) >= Number.MAX_SAFE_INTEGER) continue;
    out[key] = cleanSchema(value);
  }
  return out;
}

export function toolSchema(tool: AgentTool): ToolSchema {
  return {
    name: tool.name,
    description: tool.description,
    parameters: cleanSchema(z.toJSONSchema(tool.input, { io: 'input' })) as Record<string, unknown>,
  };
}

/** Keep the start and end of long output, which is where errors and totals usually are. */
export function clip(text: string, maxChars: number, hint = ''): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.7);
  const tail = Math.max(0, maxChars - head - 120);
  return `${text.slice(0, head)}\n\n[… ${(text.length - head - tail).toLocaleString('en-US')} characters omitted${hint ? ` — ${hint}` : ''} …]\n\n${text.slice(text.length - tail)}`;
}
