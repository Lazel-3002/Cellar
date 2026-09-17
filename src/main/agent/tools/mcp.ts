/** Agent tools for MCP resources (file/content retrieval) and prompts (templated requests) from connected connectors. */
import { z } from 'zod';
import { connectors } from '../../connectors/manager';
import { clip, defineTool, ToolError } from './types';

function connectorOrThrow(name: string) {
  const config = connectors.connectorByName(name);
  if (!config) throw new ToolError(`"${name}" is not a connected connector. Check Customize → Connectors.`);
  return config;
}

export const mcpResourcesTool = defineTool({
  name: 'list_mcp_resources',
  description: 'List the resources (files or data) a connected MCP server exposes. Read one with read_mcp_resource.',
  category: 'read',
  input: z.object({ connector: z.string().min(1).describe('Connector name, as shown in Customize → Connectors.') }),
  async run(args, ctx) {
    const config = connectorOrThrow(args.connector);
    const resources = await connectors.listResources(config.id);
    if (resources.length === 0) return `${config.name} has no resources.`;
    return clip(resources.map((r) => `${r.uri}${r.name ? ` "${r.name}"` : ''}${r.mimeType ? ` (${r.mimeType})` : ''}${r.description ? `: ${r.description}` : ''}`).join('\n'), ctx.maxResultChars, 'the resource list is long');
  },
});

export const mcpReadResourceTool = defineTool({
  name: 'read_mcp_resource',
  description: 'Read a resource by URI from a connected MCP server (from list_mcp_resources).',
  category: 'read',
  input: z.object({ connector: z.string().min(1), uri: z.string().min(1) }),
  async run(args, ctx) {
    const config = connectorOrThrow(args.connector);
    const result = await connectors.readResource(config.id, args.uri);
    if (result.contents.length === 0) return `${args.uri} has no content.`;
    const parts = result.contents.map((c) =>
      'text' in c
        ? `Resource ${c.uri}${c.mimeType ? ` (${c.mimeType})` : ''}:\n${c.text}`
        : `Resource ${c.uri}${c.mimeType ? ` (${c.mimeType})` : ''}: binary data (${Math.round((c.blob.length * 3) / 4 / 1024)} KB base64), not shown as text.`,
    );
    return clip(parts.join('\n\n'), ctx.maxResultChars, 'the resource is long');
  },
});

export const mcpPromptsTool = defineTool({
  name: 'list_mcp_prompts',
  description: 'List the prompt templates a connected MCP server offers. Fill one in with get_mcp_prompt.',
  category: 'read',
  input: z.object({ connector: z.string().min(1) }),
  async run(args, ctx) {
    const config = connectorOrThrow(args.connector);
    const prompts = await connectors.listPrompts(config.id);
    if (prompts.length === 0) return `${config.name} has no prompts.`;
    return clip(
      prompts.map((p) => `${p.name}${p.description ? `: ${p.description}` : ''}${p.arguments?.length ? ` (arguments: ${p.arguments.map((a) => `${a.name}${a.required ? '' : '?'}`).join(', ')})` : ''}`).join('\n'),
      ctx.maxResultChars,
      'the prompt list is long',
    );
  },
});

export const mcpGetPromptTool = defineTool({
  name: 'get_mcp_prompt',
  description: "Fill in a prompt template from list_mcp_prompts and get back its messages, ready to use as the server intended.",
  category: 'read',
  input: z.object({ connector: z.string().min(1), name: z.string().min(1), arguments: z.record(z.string(), z.string()).optional().describe('Values for the prompt\'s named arguments.') }),
  async run(args, ctx) {
    const config = connectorOrThrow(args.connector);
    const result = await connectors.getPrompt(config.id, args.name, args.arguments ?? {});
    const rendered = result.messages
      .map((m) => {
        const content = Array.isArray(m.content) ? m.content : [m.content];
        const text = content.map((b) => ('text' in b ? b.text : `[${b.type}]`)).join('\n');
        return `${m.role}: ${text}`;
      })
      .join('\n\n');
    return clip(`${result.description ? `${result.description}\n\n` : ''}${rendered}`, ctx.maxResultChars, 'the prompt is long');
  },
});

export const MCP_TOOLS = [mcpResourcesTool, mcpReadResourceTool, mcpPromptsTool, mcpGetPromptTool];
