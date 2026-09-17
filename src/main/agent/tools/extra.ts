/** Tools beyond files, commands and the web: skills, memory, past chats, connectors and diagnostics. */
import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import type { ConnectorConfig, ToolPolicy } from '@shared/types/customize';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { formatProblems, projectCheck, quickCheck } from '../../code/diagnostics';
import { connectors } from '../../connectors/manager';
import { addMemory, deleteMemory, findMemory, memoryHandle } from '../../customize/memory';
import { findActiveSkill } from '../../customize/skills';
import { all } from '../../db/client';
import { searchMessages } from '../../db/chat-store';
import { formatBytes } from '../../lib/util';
import { Workspace } from '../workspace';
import { clip, defineTool, ToolError, type AgentTool } from './types';

export const skillTool = defineTool({
  name: 'skill',
  description: 'Load a skill: expert instructions (and helper files) for a kind of task. Use it when the request matches one of the available skills, before starting the work.',
  category: 'read',
  input: z.object({ name: z.string().min(1).describe('The skill name, exactly as listed in available_skills.') }),
  async run(args, ctx) {
    const skill = await findActiveSkill(args.name);
    if (!skill) throw new ToolError(`There is no enabled skill named "${args.name}".`);
    const files = skill.files.length
      ? `\n\nHelper files in this skill (read them with read_skill_file; scripts can be run from the skill folder ${skill.dir}):\n${skill.files.map((f) => `- ${f}`).join('\n')}`
      : '';
    return clip(`# Skill: ${skill.name}\n\n${skill.body}${files}`, ctx.maxResultChars, 'the skill is long; follow what is shown');
  },
});

export const readSkillFileTool = defineTool({
  name: 'read_skill_file',
  description: "Read a helper file that belongs to a skill (templates, references, scripts listed by the skill tool).",
  category: 'read',
  input: z.object({ skill: z.string().min(1).describe('Skill name.'), path: z.string().min(1).describe('File path inside the skill, as listed by the skill tool.') }),
  async run(args, ctx) {
    const skill = await findActiveSkill(args.skill);
    if (!skill) throw new ToolError(`There is no enabled skill named "${args.skill}".`);
    const folder = await Workspace.open(skill.dir);
    const abs = await folder.resolve(args.path);
    const info = await stat(abs).catch(() => null);
    if (!info?.isFile()) throw new ToolError(`${args.path} is not a file in the ${skill.name} skill.`);
    if (info.size > 2 * 1024 * 1024) throw new ToolError(`${args.path} is ${formatBytes(info.size)}, too large to read.`);
    const buf = await readFile(abs);
    if (buf.subarray(0, 8000).includes(0)) throw new ToolError(`${args.path} is a binary file.`);
    return clip(buf.toString('utf8'), ctx.maxResultChars, 'the file is long; the middle is omitted');
  },
});

export const rememberTool = defineTool({
  name: 'remember',
  description: 'Save a short fact to memory so future conversations know it. Only when the user asks you to remember something. To change a memory, forget the old one and remember the new one.',
  category: 'memory',
  input: z.object({ content: z.string().min(1).max(1000).describe('The fact, written as a complete sentence about the user, e.g. "The user prefers metric units."') }),
  async run(args, ctx) {
    if (ctx.incognito) throw new ToolError('Nothing is remembered in incognito chats.');
    const item = addMemory(args.content, 'model', ctx.conversationId);
    return `Saved to memory [${memoryHandle(item.id)}]: ${item.content}`;
  },
});

export const forgetTool = defineTool({
  name: 'forget',
  description: 'Remove a memory, by its [id] from the memory list or by its text.',
  category: 'memory',
  input: z.object({ memory: z.string().min(1).describe('The memory id shown in brackets, or its text.') }),
  async run(args, ctx) {
    if (ctx.incognito) throw new ToolError('Memory cannot be changed from incognito chats.');
    const item = findMemory(args.memory.replace(/^\[|\]$/g, ''));
    if (!item) throw new ToolError(`No memory matches "${args.memory}".`);
    deleteMemory(item.id);
    return `Forgot: ${item.content}`;
  },
});

export const searchChatsTool = defineTool({
  name: 'search_chats',
  description: "Search the user's earlier conversations in Cellar by keywords. Returns titles, dates, ids and matching snippets; open one with read_chat.",
  category: 'read',
  input: z.object({ query: z.string().min(1).describe('Keywords to look for.'), limit: z.coerce.number().int().min(1).max(20).optional().describe('Maximum results (default 8).') }),
  async run(args, ctx) {
    const hits = searchMessages(args.query, (args.limit ?? 8) + 1).filter((h) => h.conversationId !== ctx.conversationId).slice(0, args.limit ?? 8);
    if (hits.length === 0) return `No earlier conversations mention "${args.query}".`;
    return hits
      .map((h, i) => {
        const date = new Date(h.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const snippet = h.snippet ? `\n   ${h.snippet.replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').slice(0, 300)}` : '';
        return `${i + 1}. ${h.title} (${h.kind}, ${date}) id=${h.conversationId}${snippet}`;
      })
      .join('\n');
  },
});

export const readChatTool = defineTool({
  name: 'read_chat',
  description: 'Read an earlier conversation found with search_chats (its messages as text).',
  category: 'read',
  input: z.object({ id: z.string().min(8).describe('The conversation id from search_chats.') }),
  async run(args, ctx) {
    if (args.id === ctx.conversationId) throw new ToolError('That is the current conversation.');
    const rows = all<{ role: string; content: string; created_at: number; title: string }>(
      `SELECT m.role, m.content, m.created_at, c.title FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE m.conversation_id = ? AND m.role IN ('user', 'assistant') AND m.content != '' ORDER BY m.created_at`,
      args.id,
    );
    if (rows.length === 0) throw new ToolError('No conversation has that id.');
    const text = rows.map((r) => `${r.role === 'user' ? 'User' : 'Assistant'}: ${r.content.trim()}`).join('\n\n');
    return clip(`# ${rows[0].title || 'Untitled'}\n\n${text}`, ctx.maxResultChars, 'long conversation; the middle is omitted');
  },
});

export const diagnosticsTool = defineTool({
  name: 'get_diagnostics',
  description:
    'Check code for errors, like the problems panel of an editor. With a file path: a fast syntax check of that file (Python, JavaScript, TypeScript, JSON, PowerShell). Without a path: runs the project checkers that are installed (tsc, pyright or ruff, Python syntax, cargo check, go vet).',
  category: 'read',
  input: z.object({ path: z.string().optional().describe('A file to check. Omit it to check the whole project (slower).') }),
  async run(args, ctx) {
    const root = ctx.workspace.root;
    if (args.path && args.path !== '.') {
      const abs = await ctx.workspace.resolve(args.path);
      const info = await stat(abs).catch(() => null);
      if (!info) throw new ToolError(`${args.path} does not exist.`);
      if (info.isFile()) {
        const problems = await quickCheck(abs, root, ctx.signal);
        return problems.length ? formatProblems(problems) : `No problems found in ${ctx.workspace.relative(abs)}.`;
      }
    }
    const result = await projectCheck(root, ctx.signal);
    const header = result.ran.length ? `Checked with ${result.ran.join(', ')}.` : 'No checker applies to this project (no tsconfig.json, Python, Cargo or Go files found).';
    return clip([header, result.ran.length ? formatProblems(result.problems) : '', ...result.notes].filter(Boolean).join('\n'), ctx.maxResultChars, 'fix these first, then check again');
  },
});

const toolSlug = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

/** OpenAI-style function names: [A-Za-z0-9_-], at most 64 characters. */
export function connectorToolName(connectorName: string, toolName: string, taken: Set<string>): string {
  const base = `${toolSlug(connectorName).slice(0, 20) || 'mcp'}__${toolSlug(toolName) || 'tool'}`.slice(0, 64);
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base.slice(0, 60)}_${i}`;
  taken.add(name);
  return name;
}

function objectSchema(schema: Tool['inputSchema'] | undefined): Record<string, unknown> {
  const raw = (schema ?? {}) as Record<string, unknown>;
  return { ...raw, type: 'object', properties: raw.properties ?? {} };
}

export function connectorTool(config: ConnectorConfig, tool: Tool, policy: ToolPolicy, taken: Set<string>): AgentTool {
  const name = connectorToolName(config.name, tool.name, taken);
  const title = tool.title ?? tool.annotations?.title ?? tool.name;
  return {
    name,
    description: `[${config.name}] ${tool.description?.trim() || title}`.slice(0, 1024),
    category: 'connector',
    input: z.record(z.string(), z.unknown()),
    parameters: objectSchema(tool.inputSchema),
    readOnly: !!tool.annotations?.readOnlyHint,
    connector: { name: config.name, tool: tool.name },
    async approval(args) {
      if (policy === 'allow') return null;
      return { kind: 'connector', title: `Use ${title} from ${config.name}`, connector: config.name, tool: tool.name, preview: JSON.stringify(args, null, 2).slice(0, 6000) };
    },
    onAllowAll: () => connectors.setToolPolicy(config.id, tool.name, 'allow'),
    async run(args, ctx) {
      const result = await connectors.callTool(config.id, tool.name, args as Record<string, unknown>, ctx.signal);
      const text = clip(result.text, ctx.maxResultChars, 'the tool returned more than fits');
      if (result.isError) throw new ToolError(text);
      if (result.images.length) await ctx.recordResultImages?.(result.images);
      return text;
    },
  };
}

/** Tools from connected connectors. Read-only contexts keep only tools the server marks read-only. */
export async function connectorTools(readOnlyOnly: boolean): Promise<AgentTool[]> {
  await connectors.ready();
  const taken = new Set<string>();
  return connectors
    .available()
    .filter((entry) => !readOnlyOnly || entry.tool.annotations?.readOnlyHint)
    .map((entry) => connectorTool(entry.config, entry.tool, entry.policy, taken));
}
