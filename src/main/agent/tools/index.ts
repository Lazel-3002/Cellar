import type { PermissionMode } from '@shared/types/agent';
import type { AppSettings } from '@shared/types/settings';
import { runCommand } from './command';
import { editFileTool, globTool, grepTool, listDir, readFileTool, writeFileTool } from './files';
import { createDocx, createPdf, createPptx, createXlsx, normalizeTodoArgs, todoWrite } from './plan-docs';
import type { AgentTool } from './types';
import { webFetch, webSearch } from './web';

export const ALL_TOOLS: AgentTool[] = [
  listDir,
  readFileTool,
  globTool,
  grepTool,
  todoWrite,
  writeFileTool,
  editFileTool,
  createDocx,
  createXlsx,
  createPptx,
  createPdf,
  runCommand,
  webSearch,
  webFetch,
] as AgentTool[];

export interface ToolAvailability {
  pdf: boolean;
}

/** Tools offered to the model: plan mode is read-only, and web tools follow the setting. */
export function toolsFor(mode: PermissionMode, settings: Pick<AppSettings, 'coworkWebAccess'>, availability: ToolAvailability): AgentTool[] {
  return ALL_TOOLS.filter((tool) => {
    if (mode === 'plan' && (tool.category === 'edit' || tool.category === 'command')) return false;
    if (tool.category === 'web' && !settings.coworkWebAccess) return false;
    if (tool.name === 'create_pdf' && !availability.pdf) return false;
    return true;
  });
}

const snake = (name: string) =>
  name
    .trim()
    .replace(/^.*[.:]/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();

/** Find a tool by the name a model used ("ReadFile", "functions.read_file", "read-file" all work). */
export function findTool(tools: AgentTool[], name: string): AgentTool | undefined {
  return tools.find((t) => t.name === name) ?? tools.find((t) => t.name === snake(name));
}

/** Small fixes for argument shapes models commonly get slightly wrong. */
export function normalizeArgs(tool: AgentTool, args: Record<string, unknown>): Record<string, unknown> {
  if (tool.name === 'todo_write') return normalizeTodoArgs(args);
  const out = { ...args };
  if (typeof out.path !== 'string') {
    const alias = out.file_path ?? out.filepath ?? out.filename ?? out.file ?? out.folder ?? out.directory ?? out.dir;
    if (typeof alias === 'string') out.path = alias;
  }
  if (tool.name === 'write_file' && typeof out.content !== 'string' && typeof out.text === 'string') out.content = out.text;
  if ((tool.name === 'create_docx' || tool.name === 'create_pdf') && typeof out.markdown !== 'string') {
    const alias = out.content ?? out.text ?? out.body;
    if (typeof alias === 'string') out.markdown = alias;
  }
  if (tool.name === 'run_command' && typeof out.command !== 'string' && typeof out.cmd === 'string') out.command = out.cmd;
  if (tool.name === 'web_search' && typeof out.query !== 'string' && typeof out.q === 'string') out.query = out.q;
  return out;
}

export type { AgentTool, ToolContext } from './types';
export { toolSchema, ToolError } from './types';
