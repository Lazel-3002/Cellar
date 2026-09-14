/**
 * Connectors: MCP servers (local stdio processes or remote Streamable HTTP / SSE endpoints) whose tools
 * models can call from Chat, Cowork and Code. Enabled connectors connect in the background when Cellar
 * starts and reconnect when their settings change.
 */
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ToolListChangedNotificationSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ConnectorConfig, ConnectorInput, ConnectorStatus, ConnectorToolInfo, ToolPolicy } from '@shared/types/customize';
import { pluginConnectors, parseMcpServers } from '../customize/plugins';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage } from '../lib/util';
import { paths } from '../system/paths';
import { deleteStoredConnector, listStoredConnectors, pluginOverrides, saveStoredConnector, setStoredEnabled, setStoredToolPolicy } from './store';

const log = logger('connectors');
const CONNECT_TIMEOUT_MS = 60_000;
const CALL_TIMEOUT_MS = 180_000;
const STDERR_LINES = 30;

interface Live {
  config: ConnectorConfig;
  /** Settings the connection was made with; a change reconnects. */
  signature: string;
  state: ConnectorStatus['state'];
  message?: string;
  client?: Client;
  transport?: Transport;
  tools: Tool[];
  serverName?: string;
  serverVersion?: string;
  instructions?: string;
  stderr: string[];
  connecting?: Promise<void>;
}

const signatureOf = (c: ConnectorConfig) => JSON.stringify([c.transport, c.command, c.args, c.env, c.url, c.headers]);

export function defaultPolicy(tool: Pick<Tool, 'annotations'>): ToolPolicy {
  return tool.annotations?.readOnlyHint ? 'allow' : 'ask';
}

export function toolPolicy(config: Pick<ConnectorConfig, 'toolPolicies'>, tool: Pick<Tool, 'name' | 'annotations'>): ToolPolicy {
  return config.toolPolicies[tool.name] ?? defaultPolicy(tool);
}

/** Text a model gets back from a tool call. */
export function renderToolResult(result: { content?: unknown; structuredContent?: unknown; isError?: boolean; toolResult?: unknown }): string {
  const blocks = Array.isArray(result.content) ? (result.content as Array<Record<string, unknown>>) : [];
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        parts.push(String(block.text ?? ''));
        break;
      case 'image':
        parts.push(`[image: ${String(block.mimeType ?? 'image')}]`);
        break;
      case 'audio':
        parts.push(`[audio: ${String(block.mimeType ?? 'audio')}]`);
        break;
      case 'resource': {
        const resource = (block.resource ?? {}) as Record<string, unknown>;
        parts.push(typeof resource.text === 'string' ? `Resource ${String(resource.uri ?? '')}:\n${resource.text}` : `[resource: ${String(resource.uri ?? '')}]`);
        break;
      }
      case 'resource_link':
        parts.push(`[link: ${String(block.name ?? block.uri ?? '')} ${String(block.uri ?? '')}]`.trim());
        break;
    }
  }
  if (parts.length === 0 && result.structuredContent !== undefined) parts.push(JSON.stringify(result.structuredContent, null, 2));
  if (parts.length === 0 && result.toolResult !== undefined) parts.push(typeof result.toolResult === 'string' ? result.toolResult : JSON.stringify(result.toolResult, null, 2));
  return parts.join('\n\n').trim() || '(the tool returned no content)';
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

class ConnectorManager {
  private live = new Map<string, Live>();
  private version = '4.0.0';
  private started = false;

  init(version: string): void {
    this.version = version;
    this.started = true;
    void this.sync();
    bus.on('customize:changed', ({ kind }) => {
      if (kind === 'plugins') void this.sync();
    });
  }

  /** Your connectors plus those of enabled plugins, with plugin overrides applied. */
  async configs(): Promise<ConnectorConfig[]> {
    const overrides = pluginOverrides();
    const fromPlugins = (await pluginConnectors()).map((spec): ConnectorConfig => {
      const override = overrides.get(spec.id);
      return {
        id: spec.id,
        name: spec.name,
        transport: spec.transport,
        command: spec.command,
        args: spec.args,
        env: spec.env,
        url: spec.url,
        headers: spec.headers,
        enabled: override?.enabled ?? true,
        toolPolicies: override?.toolPolicies ?? {},
        pluginName: spec.pluginName,
        createdAt: 0,
      };
    });
    return [...listStoredConnectors(), ...fromPlugins];
  }

  private status(live: Live): ConnectorStatus {
    return {
      config: live.config,
      state: live.state,
      message: live.message,
      serverName: live.serverName,
      serverVersion: live.serverVersion,
      instructions: live.instructions,
      tools: live.tools.map((t): ConnectorToolInfo => ({ name: t.name, title: t.title ?? t.annotations?.title, description: t.description ?? '', readOnly: !!t.annotations?.readOnlyHint, policy: toolPolicy(live.config, t) })),
    };
  }

  async list(): Promise<ConnectorStatus[]> {
    const configs = await this.configs();
    return configs.map((config) => {
      const live = this.live.get(config.id);
      return live ? this.status({ ...live, config }) : { config, state: config.enabled ? 'connecting' : 'disabled', tools: [] };
    });
  }

  private emit(): void {
    void this.list().then((list) => bus.emit('connectors:changed', list));
  }

  /** Connect what is enabled and new or changed; disconnect what was removed or disabled. */
  async sync(): Promise<void> {
    const configs = await this.configs();
    const ids = new Set(configs.map((c) => c.id));
    for (const [id, live] of this.live) {
      if (!ids.has(id)) {
        this.live.delete(id);
        await this.close(live);
      }
    }
    await Promise.all(
      configs.map(async (config) => {
        const live = this.live.get(config.id);
        if (!config.enabled) {
          if (live) await this.close(live);
          this.live.set(config.id, { config, signature: '', state: 'disabled', tools: [], stderr: [] });
          return;
        }
        if (live && live.signature === signatureOf(config) && live.state !== 'disabled' && live.state !== 'error') {
          live.config = config;
          return;
        }
        if (live) await this.close(live);
        await this.connect(config);
      }),
    );
    this.emit();
  }

  private async close(live: Live): Promise<void> {
    const { client } = live;
    live.client = undefined;
    live.transport = undefined;
    live.tools = [];
    if (client) await client.close().catch(() => undefined);
  }

  private makeTransport(config: ConnectorConfig, live: Live, legacySse = false): Transport {
    if (config.transport === 'stdio') {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...getDefaultEnvironment(), ...config.env },
        stderr: 'pipe',
        cwd: paths().cellarHome,
      });
      transport.stderr?.on('data', (chunk: Buffer) => {
        live.stderr.push(...chunk.toString('utf8').split(/\r?\n/).filter((l) => l.trim()));
        if (live.stderr.length > STDERR_LINES) live.stderr.splice(0, live.stderr.length - STDERR_LINES);
      });
      return transport;
    }
    const requestInit: RequestInit = { headers: config.headers };
    if (config.transport === 'sse' || legacySse) return new SSEClientTransport(new URL(config.url), { requestInit, eventSourceInit: { fetch: (url, init) => fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), ...config.headers } }) } });
    return new StreamableHTTPClientTransport(new URL(config.url), { requestInit });
  }

  private connect(config: ConnectorConfig): Promise<void> {
    const live: Live = { config, signature: signatureOf(config), state: 'connecting', tools: [], stderr: [] };
    this.live.set(config.id, live);
    this.emit();
    live.connecting = (async () => {
      const attempt = async (legacySse: boolean) => {
        const client = new Client({ name: 'Cellar', version: this.version }, { capabilities: {} });
        const transport = this.makeTransport(config, live, legacySse);
        await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `The server did not answer within ${CONNECT_TIMEOUT_MS / 1000} seconds.`);
        return { client, transport };
      };
      try {
        let connection;
        try {
          connection = await attempt(false);
        } catch (err) {
          // Older remote servers only speak the SSE transport.
          if (config.transport !== 'http') throw err;
          connection = await attempt(true).catch(() => {
            throw err;
          });
        }
        if (this.live.get(config.id) !== live) {
          await connection.client.close().catch(() => undefined);
          return;
        }
        live.client = connection.client;
        live.transport = connection.transport;
        const server = connection.client.getServerVersion();
        live.serverName = server?.name;
        live.serverVersion = server?.version;
        live.instructions = connection.client.getInstructions();
        connection.client.setNotificationHandler(ToolListChangedNotificationSchema, () => void this.refreshTools(live));
        connection.client.onclose = () => {
          if (live.client !== connection.client) return;
          live.client = undefined;
          live.state = 'error';
          live.message = this.failure('The server closed the connection.', live);
          live.tools = [];
          this.emit();
        };
        await this.refreshTools(live, false);
        live.state = 'connected';
        live.message = undefined;
        log.info(`connected to ${config.name}`, `${live.tools.length} tools`);
      } catch (err) {
        live.state = 'error';
        live.message = this.failure(errorMessage(err), live);
        log.warn(`could not connect to ${config.name}`, live.message);
        await this.close(live);
      } finally {
        live.connecting = undefined;
        this.emit();
      }
    })();
    return live.connecting;
  }

  private failure(message: string, live: Live): string {
    const tail = live.stderr.slice(-6).join('\n');
    let text = message;
    if (/ENOENT|not recognized|cannot find/i.test(message + tail) && live.config.transport === 'stdio') text = `${live.config.command} was not found. Install it or use the full path to the program.`;
    return tail && !text.includes(tail) ? `${text}\n${tail}` : text;
  }

  private async refreshTools(live: Live, notify = true): Promise<void> {
    if (!live.client) return;
    const tools: Tool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = await live.client.listTools(cursor ? { cursor } : undefined);
      tools.push(...result.tools);
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    live.tools = tools;
    if (notify) this.emit();
  }

  /** Wait (briefly) for connectors that are still connecting. */
  async ready(timeoutMs = 8000): Promise<void> {
    if (!this.started) return;
    const pending = [...this.live.values()].map((l) => l.connecting).filter((p): p is Promise<void> => !!p);
    if (pending.length) await Promise.race([Promise.allSettled(pending), new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  /** Connected connectors and their tools that models may see (policy is not off). */
  available(): Array<{ config: ConnectorConfig; tool: Tool; policy: ToolPolicy }> {
    const out: Array<{ config: ConnectorConfig; tool: Tool; policy: ToolPolicy }> = [];
    for (const live of this.live.values()) {
      if (live.state !== 'connected' || !live.client) continue;
      for (const tool of live.tools) {
        const policy = toolPolicy(live.config, tool);
        if (policy !== 'off') out.push({ config: live.config, tool, policy });
      }
    }
    return out;
  }

  instructions(): Array<{ name: string; text: string }> {
    return [...this.live.values()].filter((l) => l.state === 'connected' && l.instructions?.trim()).map((l) => ({ name: l.config.name, text: l.instructions!.trim() }));
  }

  async callTool(connectorId: string, toolName: string, args: Record<string, unknown>, signal: AbortSignal): Promise<{ text: string; isError: boolean }> {
    const live = this.live.get(connectorId);
    if (!live?.client || live.state !== 'connected') throw new Error(`${live?.config.name ?? 'The connector'} is not connected. Check it in Customize → Connectors.`);
    const result = await live.client.callTool({ name: toolName, arguments: args }, undefined, { signal, timeout: CALL_TIMEOUT_MS, resetTimeoutOnProgress: true });
    return { text: renderToolResult(result), isError: !!result.isError };
  }

  async save(input: ConnectorInput): Promise<ConnectorStatus> {
    const saved = saveStoredConnector(input);
    await this.sync();
    return (await this.list()).find((s) => s.config.id === saved.id)!;
  }

  async remove(id: string): Promise<void> {
    if (id.startsWith('plugin:')) throw new Error('This connector comes from a plugin. Turn it off here, or remove the plugin.');
    deleteStoredConnector(id);
    await this.sync();
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const config = (await this.configs()).find((c) => c.id === id);
    if (!config) throw new Error('Connector not found.');
    setStoredEnabled(id, config.name, enabled, !!config.pluginName);
    await this.sync();
  }

  async setToolPolicy(id: string, tool: string, policy: ToolPolicy | null): Promise<void> {
    const config = (await this.configs()).find((c) => c.id === id);
    if (!config) throw new Error('Connector not found.');
    setStoredToolPolicy(id, config.name, tool, policy, !!config.pluginName);
    const live = this.live.get(id);
    if (live) {
      const next = { ...live.config.toolPolicies };
      if (policy) next[tool] = policy;
      else delete next[tool];
      live.config = { ...live.config, toolPolicies: next };
    }
    this.emit();
  }

  async reconnect(id: string): Promise<void> {
    const live = this.live.get(id);
    if (live) {
      await this.close(live);
      live.signature = '';
      live.state = 'error';
    }
    await this.sync();
  }

  /** Add servers from a JSON snippet in the Claude Desktop format ({"mcpServers": {…}} or the map itself). */
  async importJson(text: string): Promise<number> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('That is not valid JSON.');
    }
    const map = parsed && typeof parsed === 'object' && 'mcpServers' in parsed ? (parsed as { mcpServers: unknown }).mcpServers : parsed;
    const servers = parseMcpServers(map);
    if (servers.length === 0) throw new Error('No servers were found. Paste an "mcpServers" object.');
    const existing = new Set(listStoredConnectors().map((c) => c.name.toLowerCase()));
    let added = 0;
    for (const server of servers) {
      if (existing.has(server.name.toLowerCase())) continue;
      saveStoredConnector({ name: server.name, transport: server.transport, command: server.command, args: server.args, env: server.env, url: server.url, headers: server.headers, enabled: true });
      added++;
    }
    await this.sync();
    return added;
  }

  async importClaudeDesktop(): Promise<number> {
    let text: string;
    try {
      text = await readFile(paths().claudeDesktopConfig, 'utf8');
    } catch {
      throw new Error('Claude Desktop settings were not found on this computer.');
    }
    return this.importJson(text);
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.live.values()].map((l) => this.close(l)));
    this.live.clear();
  }
}

export const connectors = new ConnectorManager();
