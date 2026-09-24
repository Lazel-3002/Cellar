import type { PermissionMode } from '@shared/types/agent';
import type { CodeMode } from '@shared/types/code';
import { normalizeComputerArgs } from '@shared/computer';
import type { AppSettings } from '@shared/types/settings';
import { connectors } from '../../connectors/manager';
import { calculateTool } from '../../math/tools';
import { BROWSER_TOOLS } from './browser';
import { callTool, normalizeCallArgs } from './call';
import { runCommand } from './command';
import { COMPUTER_READ_ONLY, COMPUTER_TOOLS } from './computer';
import { connectorTools, diagnosticsTool, forgetTool, readChatTool, readSkillFileTool, rememberTool, searchChatsTool, skillTool } from './extra';
import { editFileTool, globTool, grepTool, listDir, readFileTool, writeFileTool } from './files';
import { mcpGetPromptTool, mcpPromptsTool, mcpReadResourceTool, mcpResourcesTool } from './mcp';
import { createDocx, createPdf, createPptx, createXlsx, normalizeTodoArgs, todoWrite } from './plan-docs';
import { createReminderTool } from './reminder';
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

/** Tools that do not depend on the working folder: skills, memory, past chats, the built-in browser, computer use, `call` and reminders. */
export const ASSISTANT_TOOLS: AgentTool[] = [
  skillTool,
  readSkillFileTool,
  rememberTool,
  forgetTool,
  searchChatsTool,
  readChatTool,
  ...BROWSER_TOOLS,
  ...COMPUTER_TOOLS,
  callTool,
  createReminderTool,
] as AgentTool[];

/** Check if chat reference/search is enabled (either setting). */
function hasChatReference(settings: Pick<AppSettings, 'chatReferenceEnabled' | 'searchPastChats'>): boolean {
  return !!(settings.chatReferenceEnabled || settings.searchPastChats);
}

export interface ExtraToolOptions {
  settings: Pick<AppSettings, 'memoryEnabled' | 'chatReferenceEnabled' | 'searchPastChats' | 'browserEnabled' | 'selfScheduling' | 'computerUse'>;
  /** At least one skill is enabled. */
  skills: boolean;
  incognito: boolean;
  /** Plan / Ask modes: connector tools must be read-only, and the browser may look but not click. */
  readOnly: boolean;
  /** Offer the built-in browser here (chats, Cowork tasks and Code sessions; not Math or Design). */
  browser?: boolean;
  /** Offer `create_reminder` here. Incognito chats never get it: they have nowhere to fire. */
  reminders?: boolean;
  /** Offer computer use here (chats, Cowork tasks and Code sessions; not Math, Design or Study). */
  computer?: boolean;
}

/** Skills, memory, past-chat search, the built-in browser, reminders and connector tools, as the settings allow. */
export async function extraTools(options: ExtraToolOptions): Promise<AgentTool[]> {
  const tools: AgentTool[] = [];
  if (options.skills) tools.push(skillTool as AgentTool, readSkillFileTool as AgentTool);
  if (options.browser && options.settings.browserEnabled) {
    tools.push(...(BROWSER_TOOLS.filter((t) => !options.readOnly || (t.name !== 'browse_click' && t.name !== 'browse_fill')) as AgentTool[]));
  }
  if (options.computer && options.settings.computerUse && process.platform === 'win32') {
    tools.push(...COMPUTER_TOOLS.filter((t) => !options.readOnly || COMPUTER_READ_ONLY.has(t.name)));
  }
  if (options.reminders && options.settings.selfScheduling && !options.incognito) tools.push(createReminderTool as AgentTool);
  if (options.settings.memoryEnabled && !options.incognito) tools.push(rememberTool as AgentTool, forgetTool as AgentTool);
  if (hasChatReference(options.settings) && !options.incognito) tools.push(searchChatsTool as AgentTool, readChatTool as AgentTool);
  if (connectors.connectorsWithResources().length) tools.push(mcpResourcesTool as AgentTool, mcpReadResourceTool as AgentTool);
  if (connectors.connectorsWithPrompts().length) tools.push(mcpPromptsTool as AgentTool, mcpGetPromptTool as AgentTool);
  return [...tools, ...(await connectorTools(options.readOnly))];
}

/** Chat: the calculator, `call` (delegation to the other modules), web tools, commands (all when turned on) and the extras. */
export function chatBaseTools(settings: Pick<AppSettings, 'chatWebSearch' | 'moduleCalls' | 'chatCommands'>): AgentTool[] {
  const tools: AgentTool[] = [calculateTool as AgentTool];
  if (settings.moduleCalls) tools.push(callTool as AgentTool);
  if (settings.chatWebSearch) tools.push(webSearch as AgentTool, webFetch as AgentTool);
  if (settings.chatCommands) tools.push(runCommand as AgentTool);
  return tools;
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
  screenshot: 'computer_screenshot',
  take_screenshot: 'computer_screenshot',
  look_at_screen: 'computer_screenshot',
  see_screen: 'computer_screenshot',
  click: 'computer_click',
  left_click: 'computer_click',
  mouse_click: 'computer_click',
  type: 'computer_type',
  type_text: 'computer_type',
  input_text: 'computer_type',
  key: 'computer_key',
  press_key: 'computer_key',
  key_press: 'computer_key',
  keypress: 'computer_key',
  hotkey: 'computer_key',
  press: 'computer_key',
  scroll: 'computer_scroll',
  drag: 'computer_drag',
  left_click_drag: 'computer_drag',
  hover: 'computer_move',
  mouse_move: 'computer_move',
  move_mouse: 'computer_move',
  open_app: 'computer_open_app',
  launch_app: 'computer_open_app',
  open_application: 'computer_open_app',
  launch: 'computer_open_app',
  start_app: 'computer_open_app',
  read_screen: 'computer_read',
  get_screen_text: 'computer_read',
  switch_window: 'computer_windows',
  focus_window: 'computer_windows',
  list_windows: 'computer_windows',
  hand_over: 'computer_hand_over',
  take_over: 'computer_hand_over',
  ask_user_to_take_over: 'computer_hand_over',
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
  if (tool.name === 'call') return normalizeCallArgs(args);
  if (tool.category === 'computer') return normalizeComputerArgs(tool.name, args);
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
