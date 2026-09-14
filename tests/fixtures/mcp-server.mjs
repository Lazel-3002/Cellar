// A tiny MCP server for tests: a read-only "lookup" tool and an "add_note" tool that changes state.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const notes = [];
const server = new McpServer({ name: 'cellar-test-server', version: '1.2.3' }, { instructions: 'Use lookup for questions about the test warehouse.' });

server.registerTool(
  'lookup',
  { title: 'Look up stock', description: 'Look up how many of an item the test warehouse has.', inputSchema: { item: z.string() }, annotations: { readOnlyHint: true } },
  async ({ item }) => ({ content: [{ type: 'text', text: `${item}: 42 in stock (env ${process.env.TEST_TOKEN ?? 'missing'})` }] }),
);

server.registerTool(
  'add_note',
  { description: 'Add a note to the warehouse log.', inputSchema: { text: z.string() } },
  async ({ text }) => {
    notes.push(text);
    return { content: [{ type: 'text', text: `Saved note #${notes.length}: ${text}` }] };
  },
);

server.registerTool('broken', { description: 'Always fails.', inputSchema: {} }, async () => ({ isError: true, content: [{ type: 'text', text: 'The warehouse is closed.' }] }));

await server.connect(new StdioServerTransport());
