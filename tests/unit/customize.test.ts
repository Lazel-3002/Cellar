import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ToolPart } from '../../src/shared/types/agent';
import type { StreamEvent } from '../../src/shared/types/chat';
import type { ModelEntry } from '../../src/shared/types/models';
import type { ProviderStatus } from '../../src/shared/types/providers';

process.env.CELLAR_HOME = join(tmpdir(), `cellar-customize-home-${process.pid}`);

const { initPaths, paths } = await import('../../src/main/system/paths');
const { closeDatabase, openDatabase } = await import('../../src/main/db/client');
const { settings } = await import('../../src/main/services/settings');
const { providers } = await import('../../src/main/providers/registry');
const { chat } = await import('../../src/main/chat/orchestrator');
const { parseFrontmatter } = await import('../../src/main/customize/frontmatter');
const skills = await import('../../src/main/customize/skills');
const plugins = await import('../../src/main/customize/plugins');
const commands = await import('../../src/main/customize/commands');
const memory = await import('../../src/main/customize/memory');
const { connectors, renderToolResult } = await import('../../src/main/connectors/manager');
const { connectorToolName } = await import('../../src/main/agent/tools/extra');
const { listTools } = await import('../../src/main/customize/tool-listing');
type ChatRequest = import('../../src/main/providers/types').ChatRequest;
type Provider = import('../../src/main/providers/types').Provider;

const fixture = resolve(__dirname, '..', 'fixtures', 'mcp-server.mjs');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class FakeProvider implements Provider {
  readonly id = 'fake';
  readonly kind = 'openai' as const;
  readonly name = 'Fake';
  readonly canManageModels = false;
  readonly canDownload = false;
  requests: ChatRequest[] = [];
  script: (req: ChatRequest) => StreamEvent[] = () => [{ type: 'text', delta: 'ok' }];
  async status(): Promise<ProviderStatus> {
    return { id: this.id, kind: this.kind, name: this.name, baseUrl: '', state: 'online', canManageModels: false, canDownload: false };
  }
  async listModels(): Promise<ModelEntry[]> {
    return [];
  }
  async *chat(req: ChatRequest): AsyncGenerator<StreamEvent> {
    this.requests.push(req);
    for (const event of this.script(req)) {
      await sleep(1);
      yield event;
    }
    yield { type: 'done', stopReason: 'stop' };
  }
}

const fake = new FakeProvider();
const entry: ModelEntry = {
  ref: { providerId: 'fake', modelId: 'chatty' },
  providerKind: 'openai',
  providerName: 'Fake',
  displayName: 'Fake Chatty',
  contextLength: 32768,
  capabilities: { vision: false, tools: true, reasoning: false, embedding: false },
  reasoningStyle: 'none',
  loaded: true,
};
let userData: string;

async function waitFor<T>(fn: () => T | undefined | false, timeout = 15_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error('Timed out waiting');
    await sleep(20);
  }
}

const message = (conversationId: string, messageId: string) => chat.getConversation(conversationId).messages.find((m) => m.id === messageId)!;
const tools = (parts: unknown) => ((parts as ToolPart[] | undefined) ?? []).filter((p) => p.type === 'tool');
const toolTurns = (req: ChatRequest) => req.messages.filter((m) => m.role === 'tool').length;

beforeAll(async () => {
  userData = await mkdtemp(join(tmpdir(), 'cellar-customize-data-'));
  initPaths(userData, userData);
  closeDatabase();
  openDatabase(':memory:');
  settings.update({ autoTitle: false, coworkNotifications: false });
  (providers as unknown as { get: (id: string) => Provider }).get = () => fake;
  (providers as unknown as { findModel: () => Promise<ModelEntry> }).findModel = async () => entry;
});

afterAll(async () => {
  chat.stopAll();
  await connectors.dispose();
  await rm(userData, { recursive: true, force: true }).catch(() => undefined);
  await rm(process.env.CELLAR_HOME!, { recursive: true, force: true }).catch(() => undefined);
});

beforeEach(() => {
  fake.requests = [];
  settings.update({ chatWebSearch: false, memoryEnabled: false, searchPastChats: false, disabledSkills: [], disabledPlugins: [] });
});

describe('frontmatter', () => {
  it('reads scalars, quotes, block scalars and lists', () => {
    const { data, body } = parseFrontmatter('---\nname: pdf-tools\ndescription: >\n  Fill PDF forms\n  and merge files.\nquoted: "a: b"\nallowed-tools: [Read, Bash]\nlist:\n  - one\n  - two\n---\n\n# Body\n');
    expect(data).toMatchObject({ name: 'pdf-tools', description: 'Fill PDF forms and merge files.', quoted: 'a: b', 'allowed-tools': ['Read', 'Bash'], list: ['one', 'two'] });
    expect(body.trim()).toBe('# Body');
    expect(parseFrontmatter('no frontmatter').body).toBe('no frontmatter');
  });
});

describe('skills', () => {
  it('creates, lists, disables and imports skills (folders and .skill archives)', async () => {
    const created = await skills.saveSkill({ name: 'Meeting Notes', description: 'Summarize meeting notes: decisions and action items.', body: '# Steps\n1. Summary\n2. Decisions' });
    expect(created).toMatchObject({ id: 'user:meeting-notes', name: 'Meeting Notes', source: 'user', enabled: true });
    expect(await readFile(join(paths().skills, 'meeting-notes', 'SKILL.md'), 'utf8')).toContain('description: "Summarize meeting notes: decisions and action items."');

    skills.setSkillEnabled(created.id, false);
    expect((await skills.activeSkills()).map((s) => s.id)).not.toContain(created.id);
    skills.setSkillEnabled(created.id, true);

    const zip = new JSZip();
    zip.file('brand-voice/SKILL.md', '---\nname: brand-voice\ndescription: Write in the Cellar brand voice.\n---\nBe warm and brief.');
    zip.file('brand-voice/examples/good.md', 'Hello there.');
    const archive = join(userData, 'brand.skill');
    await writeFile(archive, await zip.generateAsync({ type: 'nodebuffer' }));
    const imported = await skills.importSkills(archive);
    expect(imported).toEqual([expect.objectContaining({ name: 'brand-voice', files: ['examples/good.md'] })]);

    const detail = await skills.getSkill('user:brand-voice');
    expect(detail.body).toBe('Be warm and brief.');
    expect(skills.skillsPrompt(await skills.activeSkills())).toContain('- brand-voice: Write in the Cellar brand voice.');
    await expect(skills.saveSkill({ name: 'x', description: '', body: '' })).rejects.toThrow('Describe when the skill should be used');
  });
});

describe('plugins and commands', () => {
  it('installs a Claude Code style plugin with skills, commands and connectors', async () => {
    const source = join(userData, 'warehouse-plugin');
    await mkdir(join(source, '.claude-plugin'), { recursive: true });
    await mkdir(join(source, 'skills', 'stock-report'), { recursive: true });
    await mkdir(join(source, 'commands'), { recursive: true });
    await writeFile(join(source, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'warehouse', description: 'Warehouse tools', version: '0.1.0', author: { name: 'Tester' } }));
    await writeFile(join(source, 'skills', 'stock-report', 'SKILL.md'), '---\nname: stock-report\ndescription: Report stock levels.\n---\nUse the lookup tool.');
    await writeFile(join(source, 'commands', 'restock.md'), '---\ndescription: Plan a restock\nargument-hint: <item>\n---\nPlan a restock of $1. Details: $ARGUMENTS');
    await writeFile(join(source, '.mcp.json'), JSON.stringify({ mcpServers: { stock: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server.mjs'], env: { HOME_DIR: '${NOPE_NOT_SET:-fallback}' } } } }));

    const [installed] = await plugins.installPlugin(source);
    expect(installed).toMatchObject({ id: 'warehouse', name: 'warehouse', version: '0.1.0', author: 'Tester', skills: 1, commands: 1, connectors: 1, enabled: true });

    expect((await skills.listSkills()).find((s) => s.id === 'plugin:warehouse:stock-report')).toMatchObject({ source: 'plugin', pluginName: 'warehouse' });
    const [spec] = await plugins.pluginConnectors();
    expect(spec).toMatchObject({ id: 'plugin:warehouse:stock', transport: 'stdio', args: [`${installed.dir}/server.mjs`], env: { HOME_DIR: 'fallback' } });

    const list = await commands.listCommands('chat');
    expect(list.map((c) => c.name)).toEqual(expect.arrayContaining(['tools', 'remember', 'restock']));
    expect(await commands.expandCommand('restock', 'bolts urgently')).toBe('Plan a restock of bolts. Details: bolts urgently');

    plugins.setPluginEnabled('warehouse', false);
    expect((await commands.listCommands('chat')).map((c) => c.name)).not.toContain('restock');
    await plugins.removePlugin('warehouse');
    expect(await plugins.listPlugins()).toEqual([]);
  });

  it('saves your own commands and fills in arguments', async () => {
    await commands.saveCommand({ name: 'Review', description: 'Review writing', body: 'Review this for clarity.' });
    expect(await commands.expandCommand('/review', 'My draft text')).toBe('Review this for clarity.\n\nMy draft text');
    await expect(commands.saveCommand({ name: 'tools', description: '', body: 'x' })).rejects.toThrow('built-in');
    expect(commands.expandTemplate('A $2 B $ARGUMENTS', 'one two')).toBe('A two B one two');
    await commands.deleteCommand('review');
    await expect(commands.getCommand('review')).rejects.toThrow('no /review');
  });
});

describe('memory', () => {
  it('adds, finds and renders memories for the prompt', () => {
    const item = memory.addMemory('  The user prefers   metric units. ');
    expect(item.content).toBe('The user prefers metric units.');
    expect(memory.addMemory('the user prefers metric units.').id).toBe(item.id);
    expect(memory.findMemory(memory.memoryHandle(item.id))?.id).toBe(item.id);
    expect(memory.memoryPrompt(memory.listMemories(), true)).toContain(`[${memory.memoryHandle(item.id)}] The user prefers metric units.`);
    memory.deleteMemory(item.id);
    expect(memory.listMemories()).toEqual([]);
  });
});

describe('connectors', () => {
  it('names tools for models within the function-name limits', () => {
    const taken = new Set<string>();
    expect(connectorToolName('My GitHub!', 'create-issue', taken)).toBe('my_github__create-issue');
    expect(connectorToolName('My GitHub!', 'create-issue', taken)).toBe('my_github__create-issue_2');
    expect(connectorToolName('x'.repeat(80), 'y'.repeat(80), taken).length).toBeLessThanOrEqual(64);
  });

  it('renders text, images and resources from tool results', () => {
    expect(renderToolResult({ content: [{ type: 'text', text: 'hi' }, { type: 'image', mimeType: 'image/png', data: '' }, { type: 'resource', resource: { uri: 'file:///a', text: 'body' } }] })).toBe('hi\n\n[image: image/png]\n\nResource file:///a:\nbody');
    expect(renderToolResult({ content: [], structuredContent: { a: 1 } })).toContain('"a": 1');
  });

  it('connects to a stdio MCP server, lists tools with policies and calls them', async () => {
    const status = await connectors.save({ name: 'Warehouse', transport: 'stdio', command: process.execPath, args: [fixture], env: { TEST_TOKEN: 't0k' }, url: '', headers: {}, enabled: true });
    expect(status.state, status.message).toBe('connected');
    expect(status).toMatchObject({ serverName: 'cellar-test-server', serverVersion: '1.2.3', instructions: expect.stringContaining('test warehouse') });
    expect(status.tools.map((t) => [t.name, t.policy])).toEqual([
      ['lookup', 'allow'],
      ['add_note', 'ask'],
      ['broken', 'ask'],
    ]);
    const lookup = await connectors.callTool(status.config.id, 'lookup', { item: 'bolts' }, new AbortController().signal);
    expect(lookup).toEqual({ text: 'bolts: 42 in stock (env t0k)', isError: false, images: [] });
    expect((await connectors.callTool(status.config.id, 'broken', {}, new AbortController().signal)).isError).toBe(true);

    await connectors.setToolPolicy(status.config.id, 'broken', 'off');
    expect(connectors.available().map((a) => a.tool.name)).toEqual(['lookup', 'add_note']);
    const listing = await listTools('chat', undefined, entry.ref);
    expect(listing.tools.filter((t) => t.kind === 'connector').map((t) => [t.name, t.group, t.policy])).toEqual([
      ['warehouse__lookup', 'Warehouse', 'allow'],
      ['warehouse__add_note', 'Warehouse', 'ask'],
    ]);
  });

  it('lets a chat call connector tools, skills and memory, asking before tools that change things', async () => {
    settings.update({ memoryEnabled: true });
    fake.script = (req) => {
      switch (toolTurns(req)) {
        case 0:
          return [{ type: 'text', delta: 'Checking.' }, { type: 'tool_call', id: 'a', name: 'skill', argumentsDelta: '{"name":"meeting-notes"}' }, { type: 'tool_call', id: 'b', name: 'warehouse__lookup', argumentsDelta: '{"item":"nuts"}' }];
        case 2:
          return [{ type: 'tool_call', id: 'c', name: 'warehouse__add_note', argumentsDelta: '{"text":"restock nuts"}' }];
        case 3:
          return [{ type: 'tool_call', id: 'd', name: 'remember', argumentsDelta: '{"content":"The user manages a warehouse."}' }];
        default:
          return [{ type: 'text', delta: 'There are 42 nuts; I logged a restock.' }];
      }
    };
    const { conversationId, assistantMessageId } = await chat.send({ content: 'How many nuts? Log a restock.', attachmentIds: [], model: entry.ref, thinking: 'off' });
    const pending = await waitFor(() => tools(message(conversationId, assistantMessageId).parts).find((t) => t.status === 'awaiting-approval'));
    expect(pending).toMatchObject({ name: 'warehouse__add_note', approval: { kind: 'connector', connector: 'Warehouse', tool: 'add_note' } });
    chat.approve(assistantMessageId, pending.id, { action: 'allow-all' });
    const done = await waitFor(() => {
      const m = message(conversationId, assistantMessageId);
      return m.status !== 'streaming' ? m : undefined;
    });
    expect(done.status).toBe('complete');
    expect(tools(done.parts).map((t) => [t.name, t.status])).toEqual([
      ['skill', 'done'],
      ['warehouse__lookup', 'done'],
      ['warehouse__add_note', 'done'],
      ['remember', 'done'],
    ]);
    expect(tools(done.parts)[0].result).toContain('# Skill: Meeting Notes');
    expect(tools(done.parts)[2].result).toBe('Saved note #1: restock nuts');
    expect(done.content).toBe('Checking.\n\nThere are 42 nuts; I logged a restock.');
    expect(memory.listMemories()).toEqual([expect.objectContaining({ content: 'The user manages a warehouse.', source: 'model', conversationId })]);

    const { conversation } = chat.getConversation(conversationId);
    expect(conversation.kind).toBe('chat');
    expect(conversation.task).toBeUndefined();
    const system = String(fake.requests[0].messages[0].content);
    expect(system).toContain('You can call tools in this chat');
    expect(system).toContain('<available_skills>');
    expect(system).toContain('Use lookup for questions about the test warehouse.');
    expect(fake.requests[0].tools?.map((t) => t.name)).toEqual(expect.arrayContaining(['skill', 'remember', 'warehouse__lookup', 'warehouse__add_note']));
    // "Always allow" is remembered for the tool.
    expect((await connectors.list()).find((c) => c.config.name === 'Warehouse')?.tools.find((t) => t.name === 'add_note')?.policy).toBe('allow');
  });

  it('imports servers from a Claude Desktop style JSON snippet', async () => {
    const added = await connectors.importJson(JSON.stringify({ mcpServers: { Warehouse: { command: 'node' }, remote: { type: 'http', url: 'https://example.invalid/mcp', headers: { Authorization: 'Bearer x' } } } }));
    expect(added).toBe(1);
    const remote = (await connectors.list()).find((c) => c.config.name === 'remote');
    expect(remote?.config).toMatchObject({ transport: 'http', headers: { Authorization: 'Bearer x' } });
    await connectors.remove(remote!.config.id);
    await expect(connectors.importJson('{"nope": 1}')).rejects.toThrow('No servers were found');
  });
});
