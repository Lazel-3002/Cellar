/** What `/tools` shows: the tools a model gets in a chat, task or Code session right now. */
import { codePermissionMode } from '@shared/code-commands';
import type { PermissionMode } from '@shared/types/agent';
import type { CodeMode } from '@shared/types/code';
import type { ToolInfo, ToolListing, ToolScope } from '@shared/types/customize';
import type { ModelRef } from '@shared/types/models';
import { pdfAvailable } from '../agent/documents';
import { chatBaseTools, codeToolsFor, extraTools, toolsFor, type AgentTool } from '../agent/tools';
import { designToolsFor } from '../design/tools';
import { MATH_TOOLS } from '../math/tools';
import { chat } from '../chat/orchestrator';
import { providers } from '../providers/registry';
import { settings } from '../services/settings';
import { activeSkills } from './skills';

const GROUPS: Record<string, string> = {
  list_dir: 'Files',
  read_file: 'Files',
  glob: 'Files',
  grep: 'Files',
  write_file: 'Files',
  edit_file: 'Files',
  create_docx: 'Documents',
  create_xlsx: 'Documents',
  create_pptx: 'Documents',
  create_pdf: 'Documents',
  get_design: 'Design',
  set_theme: 'Design',
  create_artboard: 'Design',
  update_artboard: 'Design',
  edit_elements: 'Design',
  delete_artboard: 'Design',
  run_command: 'Commands',
  get_diagnostics: 'Code checks',
  todo_write: 'Planning',
  web_search: 'Web',
  web_fetch: 'Web',
  browse_open: 'Built-in browser',
  browse_read: 'Built-in browser',
  browse_url: 'Built-in browser',
  browse_back: 'Built-in browser',
  browse_forward: 'Built-in browser',
  browse_reload: 'Built-in browser',
  browse_click: 'Built-in browser',
  browse_fill: 'Built-in browser',
  browse_scroll: 'Built-in browser',
  browse_tabs: 'Built-in browser',
  call: 'Modules',
  skill: 'Skills',
  read_skill_file: 'Skills',
  remember: 'Memory',
  forget: 'Memory',
  search_chats: 'Past chats',
  read_chat: 'Past chats',
};

function describe(tool: AgentTool): ToolInfo {
  if (tool.category === 'connector') {
    const match = /^\[([^\]]+)\]\s*(.*)$/s.exec(tool.description);
    return { name: tool.name, description: match?.[2] ?? tool.description, group: match?.[1] ?? 'Connector', kind: 'connector', policy: undefined };
  }
  const group = GROUPS[tool.name] ?? 'Other';
  const kind = group === 'Skills' ? 'skill' : group === 'Memory' || group === 'Past chats' ? 'memory' : 'built-in';
  if (tool.category === 'browser') return { name: tool.name, description: tool.description, group, kind, policy: tool.approval ? 'ask' : 'allow' };
  return { name: tool.name, description: tool.description, group, kind };
}

export async function listTools(scope: ToolScope, conversationId?: string, modelRef?: ModelRef): Promise<ToolListing> {
  const app = settings.get();
  const notes: string[] = [];
  let incognito = false;
  let permissionMode: PermissionMode = scope === 'task' ? app.coworkPermissionMode : codePermissionMode(app.codeMode, app.codeAutoAcceptEdits);
  let codeMode: CodeMode = app.codeMode;
  if (conversationId) {
    try {
      const { conversation } = chat.getConversation(conversationId);
      incognito = conversation.incognito;
      if (conversation.task) {
        permissionMode = conversation.task.permissionMode;
        codeMode = conversation.task.code?.mode ?? codeMode;
      }
    } catch {
      // new conversation
    }
  }
  if (modelRef) {
    const entry = await providers.findModel(modelRef).catch(() => undefined);
    if (entry && !entry.capabilities.tools) {
      notes.push(
        scope === 'chat'
          ? `${entry.displayName} does not support native tool calling, so chats with it answer without tools. Pick a model that supports tools (they are listed first in Cowork).`
          : `${entry.displayName} does not support native tool calling; Cellar describes the tools in the prompt instead, which works less reliably.`,
      );
    }
  }
  const base =
    scope === 'chat'
      ? chatBaseTools(app)
      : scope === 'math'
        ? MATH_TOOLS
        : scope === 'design'
          ? designToolsFor(app)
          : scope === 'code'
            ? codeToolsFor(codeMode, permissionMode, app)
            : toolsFor(permissionMode, app, { pdf: pdfAvailable() });
  const skills = await activeSkills();
  const extras = await extraTools({
    settings: app,
    skills: skills.length > 0,
    incognito,
    readOnly: scope !== 'chat' && scope !== 'design' && scope !== 'math' && permissionMode === 'plan',
    browser: scope !== 'math' && scope !== 'design',
  });
  const tools = [...base, ...extras].map(describe);
  const connectorPolicies = new Map<string, string>();
  for (const tool of extras) if (tool.category === 'connector') connectorPolicies.set(tool.name, (await tool.approval?.({}, undefined as never)) ? 'ask' : 'allow');
  for (const tool of tools) if (tool.kind === 'connector') tool.policy = connectorPolicies.get(tool.name) === 'allow' ? 'allow' : 'ask';
  if (scope === 'chat' && !app.chatWebSearch) notes.push('Web search is off for chats. Turn it on from the tools menu in the composer.');
  if (incognito) notes.push('Incognito chats do not use memory or past chats.');
  if (scope !== 'chat' && permissionMode === 'plan') notes.push('Read-only mode: tools that change files, run commands, or are not marked read-only by their connector are hidden.');
  return { tools, notes };
}
