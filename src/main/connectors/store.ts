/** Saved connector (MCP server) settings. Environment variables and headers are encrypted at rest. */
import type { ConnectorConfig, ConnectorInput, ConnectorTransport, ToolPolicy } from '@shared/types/customize';
import { all, get, run } from '../db/client';
import { openSecret, sealSecret } from '../lib/secrets';
import { newId, safeJsonParse } from '../lib/util';

interface Row {
  id: string;
  name: string;
  transport: string;
  command: string;
  args: string;
  env: string;
  url: string;
  headers: string;
  enabled: number;
  tool_policies: string;
  created_at: number;
}

/** Rows that only hold overrides (enabled flag, tool policies) for connectors a plugin provides. */
const OVERRIDE = 'plugin-override';

const record = (sealed: string): Record<string, string> => safeJsonParse<Record<string, string>>(openSecret(sealed), {});

const toConfig = (r: Row): ConnectorConfig => ({
  id: r.id,
  name: r.name,
  transport: r.transport as ConnectorTransport,
  command: r.command,
  args: safeJsonParse<string[]>(r.args, []),
  env: record(r.env),
  url: r.url,
  headers: record(r.headers),
  enabled: r.enabled === 1,
  toolPolicies: safeJsonParse<Record<string, ToolPolicy>>(r.tool_policies, {}),
  createdAt: r.created_at,
});

export function listStoredConnectors(): ConnectorConfig[] {
  return all<Row>('SELECT * FROM connectors WHERE transport != ? ORDER BY created_at', OVERRIDE).map(toConfig);
}

export function pluginOverrides(): Map<string, { enabled: boolean; toolPolicies: Record<string, ToolPolicy> }> {
  return new Map(all<Row>('SELECT * FROM connectors WHERE transport = ?', OVERRIDE).map((r) => [r.id, { enabled: r.enabled === 1, toolPolicies: safeJsonParse<Record<string, ToolPolicy>>(r.tool_policies, {}) }]));
}

const sealRecord = (value: Record<string, string>) => (Object.keys(value).length ? sealSecret(JSON.stringify(value)) : '');

export function validateConnector(input: ConnectorInput): void {
  if (!input.name.trim()) throw new Error('Give the connector a name.');
  if (!['stdio', 'http', 'sse'].includes(input.transport)) throw new Error('Unknown connector type.');
  if (input.transport === 'stdio' && !input.command.trim()) throw new Error('Enter the command that starts the server, for example npx.');
  if (input.transport !== 'stdio') {
    let url: URL;
    try {
      url = new URL(input.url.trim());
    } catch {
      throw new Error('Enter the server URL, for example https://example.com/mcp.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Connector URLs start with http:// or https://.');
  }
}

export function saveStoredConnector(input: ConnectorInput): ConnectorConfig {
  validateConnector(input);
  const existing = input.id ? get<Row>('SELECT * FROM connectors WHERE id = ? AND transport != ?', input.id, OVERRIDE) : undefined;
  const id = existing?.id ?? newId();
  const values = [
    input.name.trim().slice(0, 80),
    input.transport,
    input.command.trim(),
    JSON.stringify(input.args.map(String)),
    sealRecord(input.env),
    input.url.trim(),
    sealRecord(input.headers),
    input.enabled ? 1 : 0,
  ] as const;
  if (existing) {
    run('UPDATE connectors SET name = ?, transport = ?, command = ?, args = ?, env = ?, url = ?, headers = ?, enabled = ? WHERE id = ?', ...values, id);
  } else {
    run('INSERT INTO connectors (name, transport, command, args, env, url, headers, enabled, id, tool_policies, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ...values, id, '{}', Date.now());
  }
  return toConfig(get<Row>('SELECT * FROM connectors WHERE id = ?', id)!);
}

export function deleteStoredConnector(id: string): void {
  run('DELETE FROM connectors WHERE id = ?', id);
}

function ensureOverride(id: string, name: string): void {
  run(`INSERT OR IGNORE INTO connectors (id, name, transport, enabled, tool_policies, created_at) VALUES (?, ?, ?, 1, '{}', ?)`, id, name, OVERRIDE, Date.now());
}

export function setStoredEnabled(id: string, name: string, enabled: boolean, plugin: boolean): void {
  if (plugin) ensureOverride(id, name);
  run('UPDATE connectors SET enabled = ? WHERE id = ?', enabled ? 1 : 0, id);
}

export function setStoredToolPolicy(id: string, name: string, tool: string, policy: ToolPolicy | null, plugin: boolean): void {
  if (plugin) ensureOverride(id, name);
  const row = get<Row>('SELECT tool_policies FROM connectors WHERE id = ?', id);
  if (!row) throw new Error('Connector not found.');
  const policies = safeJsonParse<Record<string, ToolPolicy>>(row.tool_policies, {});
  if (policy) policies[tool] = policy;
  else delete policies[tool];
  run('UPDATE connectors SET tool_policies = ? WHERE id = ?', JSON.stringify(policies), id);
}
