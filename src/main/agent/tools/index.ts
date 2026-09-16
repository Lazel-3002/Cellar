import type { PermissionMode } from '@shared/types/agent';
import type { CodeMode } from '@shared/types/code';
import type { AppSettings } from '@shared/types/settings';
import { calculateTool } from '../../math/tools';
import { runCommand } from './command';
import { connectorTools, diagnosticsTool, forgetTool, readChatTool, readSkillFileTool, rememberTool, searchChatsTool, skillTool } from './extra';
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
  diagnosticsTool,
  webSearch,
  webFetch,
  calculateTool,
] as AgentTool[];

/** Tools that do not depend on the working folder: skills, memory and past chats. */
export const ASSISTANT_TOOLS: AgentTool[] = [skillTool, readSkillFileTool, rememberTool, forgetTool, searchChatsTool, readChatTool] as AgentTool[];

export interface ExtraToolOptions {
  settings: Pick<AppSettings, 'memoryEnabled' | 'searchPastChats'>;
  /** At least one skill is enabled. */
  skills: boolean;
  incognito: boolean;
  /** Plan / Ask modes: connector tools must be read-only. */
  readOnly: boolean;
}

/** Skills, memory, past-chat search and connector tools, as the settings allow. */
export async function extraTools(options: ExtraToolOptions): Promise<AgentTool[]> {
  const tools: AgentTool[] = [];
  if (options.skills) tools.push(skillTool as AgentTool, readSkillFileTool as AgentTool);
  if (options.settings.memoryEnabled && !options.incognito) tools.push(rememberTool as AgentTool, forgetTool as AgentTool);
  if (options.settings.searchPastChats && !options.incognito) tools.push(searchChatsTool as AgentTool, readChatTool as AgentTool);
  return [...tools, ...(await connectorTools(options.readOnly))];
}

/** Chat: the calculator, web tools (when turned on) and the extras. */
export function chatBaseTools(settings: Pick<AppSettings, 'chatWebSearch'>): AgentTool[] {
  return settings.chatWebSearch ? ([calculateTool, webSearch, webFetch] as AgentTool[]) : ([calculateTool] as AgentTool[]);
}

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

const CODE_TOOLS = new Set(['list_dir', 'read_file', 'glob', 'grep', 'todo_write', 'write_file', 'edit_file', 'run_command', 'get_diagnostics', 'web_search', 'web_fetch']);

/** Code sessions: file, search, command and web tools (no office documents). Ask mode also drops the plan tool. */
export function codeToolsFor(mode: CodeMode, permissionMode: PermissionMode, settings: Pick<AppSettings, 'coworkWebAccess'>): AgentTool[] {
  return toolsFor(permissionMode, settings, { pdf: false }).filter((tool) => CODE_TOOLS.has(tool.name) && !(mode === 'ask' && tool.name === 'todo_write'));
}

/** Names models trained on other agents use for the same tools. */
const ALIASES: Record<string, string> = {
  calc: 'calculate',
  calculator: 'calculate',
  compute: 'calculate',
  evaluate: 'calculate',
  math: 'calculate',
  read: 'read_file',
  view: 'read_file',
  cat: 'read_file',
  write: 'write_file',
  create_file: 'write_file',
  edit: 'edit_file',
  str_replace: 'edit_file',
  replace_in_file: 'edit_file',
  bash: 'run_command',
  shell: 'run_command',
  powershell: 'run_command',
  execute_command: 'run_command',
  run_terminal_cmd: 'run_command',
  ls: 'list_dir',
  list_files: 'list_dir',
  list_directory: 'list_dir',
  search_files: 'grep',
  find_files: 'glob',
  todo: 'todo_write',
  update_todos: 'todo_write',
  diagnostics: 'get_diagnostics',
  get_errors: 'get_diagnostics',
  check_errors: 'get_diagnostics',
  lint: 'get_diagnostics',
  load_skill: 'skill',
  use_skill: 'skill',
  save_memory: 'remember',
  memory_add: 'remember',
  add_memory: 'remember',
  delete_memory: 'forget',
  remove_memory: 'forget',
  conversation_search: 'search_chats',
  search_conversations: 'search_chats',
};

const snake = (name: string) =>
  name
    .trim()
    .replace(/^.*[.:]/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();

/** Find a tool by the name a model used ("ReadFile", "functions.read_file", "read-file" all work). */
export function findTool(tools: AgentTool[], name: string): AgentTool | undefined {
  const normalized = snake(name);
  return tools.find((t) => t.name === name) ?? tools.find((t) => t.name === normalized) ?? tools.find((t) => t.name === ALIASES[normalized]);
}

/** Small fixes for argument shapes models commonly get slightly wrong. */
export function normalizeArgs(tool: AgentTool, args: Record<string, unknown>): Record<string, unknown> {
  if (tool.category === 'connector') return args;
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
  if (tool.name === 'calculate' && out.expressions === undefined) {
    const alias = out.expression ?? out.expr ?? out.input ?? out.query ?? out.value;
    if (typeof alias === 'string' || Array.isArray(alias)) out.expressions = alias;
  }
  if (tool.name === 'web_search' && typeof out.query !== 'string' && typeof out.q === 'string') out.query = out.q;
  return out;
}

export type { AgentTool, ToolContext } from './types';
export { toolSchema, ToolError } from './types';
