/**
 * Plugins bundle skills, slash commands and connectors, in the Claude Code plugin layout:
 *
 *   my-plugin/
 *     .claude-plugin/plugin.json   name, description, version, author (plugin.json at the top also works)
 *     skills/<skill>/SKILL.md
 *     commands/<command>.md
 *     .mcp.json                    { "mcpServers": { … } }
 *
 * Installed plugins live in ~/.cellar/plugins/<id>. `${CLAUDE_PLUGIN_ROOT}` (or `${CELLAR_PLUGIN_ROOT}`)
 * in connector settings points at the plugin's folder.
 */
import { execFile } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import extractZip from 'extract-zip';
import type { ConnectorTransport, PluginInfo } from '@shared/types/customize';
import { bus } from '../lib/events';
import { errorMessage, newId } from '../lib/util';
import { settings } from '../services/settings';
import { paths } from '../system/paths';

const exec = promisify(execFile);

export interface PluginManifest {
  name: string;
  description: string;
  version?: string;
  author?: string;
  mcpServers?: unknown;
}

export interface PluginConnectorSpec {
  /** Stable id: plugin:<pluginId>:<server name>. */
  id: string;
  name: string;
  pluginId: string;
  pluginName: string;
  transport: ConnectorTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'plugin';

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''));
  } catch {
    return undefined;
  }
}

const isDir = async (path: string) => !!(await stat(path).catch(() => null))?.isDirectory();
const isFile = async (path: string) => !!(await stat(path).catch(() => null))?.isFile();

export async function readManifest(dir: string): Promise<PluginManifest | null> {
  const raw = ((await readJson(join(dir, '.claude-plugin', 'plugin.json'))) ?? (await readJson(join(dir, 'plugin.json')))) as Record<string, unknown> | undefined;
  const looksLikePlugin = raw || (await isDir(join(dir, 'skills'))) || (await isDir(join(dir, 'commands'))) || (await isFile(join(dir, '.mcp.json')));
  if (!looksLikePlugin) return null;
  const author = raw?.author;
  return {
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : basename(dir),
    description: typeof raw?.description === 'string' ? raw.description : '',
    version: typeof raw?.version === 'string' ? raw.version : undefined,
    author: typeof author === 'string' ? author : author && typeof author === 'object' && typeof (author as { name?: unknown }).name === 'string' ? (author as { name: string }).name : undefined,
    mcpServers: raw?.mcpServers,
  };
}

async function countEntries(dir: string, test: (name: string, directory: boolean) => boolean): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => test(e.name, e.isDirectory())).length;
}

/** Replace ${CLAUDE_PLUGIN_ROOT}, ${CELLAR_PLUGIN_ROOT} and ${ENV_VAR[:-default]} in a connector setting. */
export function expandPluginVars(value: string, root: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (whole, name: string, fallback: string | undefined) => {
    if (name === 'CLAUDE_PLUGIN_ROOT' || name === 'CELLAR_PLUGIN_ROOT') return root;
    const found = env[name];
    if (found !== undefined) return found;
    return fallback ?? whole;
  });
}

const stringRecord = (value: unknown): Record<string, string> =>
  value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string' || typeof v === 'number').map(([k, v]) => [k, String(v)])) : {};

/** `mcpServers` entries (Claude Desktop / Claude Code format) → connector specs. */
export function parseMcpServers(value: unknown, expand: (s: string) => string = (s) => s): Array<Omit<PluginConnectorSpec, 'id' | 'pluginId' | 'pluginName'>> {
  const servers = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const out: Array<Omit<PluginConnectorSpec, 'id' | 'pluginId' | 'pluginName'>> = [];
  for (const [name, raw] of Object.entries(servers)) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    const type = typeof s.type === 'string' ? s.type.toLowerCase() : '';
    const url = typeof s.url === 'string' ? expand(s.url) : '';
    const transport: ConnectorTransport = type === 'sse' ? 'sse' : type === 'http' || type === 'streamable-http' || (url && !s.command) ? 'http' : 'stdio';
    if (transport === 'stdio' && typeof s.command !== 'string') continue;
    if (transport !== 'stdio' && !url) continue;
    out.push({
      name,
      transport,
      command: typeof s.command === 'string' ? expand(s.command) : '',
      args: Array.isArray(s.args) ? s.args.filter((a): a is string | number => typeof a === 'string' || typeof a === 'number').map((a) => expand(String(a))) : [],
      env: Object.fromEntries(Object.entries(stringRecord(s.env)).map(([k, v]) => [k, expand(v)])),
      url,
      headers: Object.fromEntries(Object.entries(stringRecord(s.headers)).map(([k, v]) => [k, expand(v)])),
    });
  }
  return out;
}

async function pluginServers(dir: string, manifest: PluginManifest) {
  const expand = (s: string) => expandPluginVars(s, dir);
  let servers: unknown = undefined;
  if (typeof manifest.mcpServers === 'string') servers = ((await readJson(resolve(dir, manifest.mcpServers))) as { mcpServers?: unknown } | undefined)?.mcpServers;
  else if (manifest.mcpServers && typeof manifest.mcpServers === 'object') servers = manifest.mcpServers;
  const file = (await readJson(join(dir, '.mcp.json'))) as { mcpServers?: unknown } | undefined;
  const fromFile = file?.mcpServers ?? (file && !('mcpServers' in file) ? file : undefined);
  return [...parseMcpServers(servers, expand), ...parseMcpServers(fromFile, expand)];
}

async function describe(dir: string, id: string, disabled: Set<string>): Promise<PluginInfo | null> {
  const manifest = await readManifest(dir);
  if (!manifest) return null;
  const info: PluginInfo = { id, name: manifest.name, description: manifest.description, version: manifest.version, author: manifest.author, dir, enabled: !disabled.has(id), skills: 0, commands: 0, connectors: 0 };
  try {
    info.skills = await countEntries(join(dir, 'skills'), (name, directory) => directory && !name.startsWith('.'));
    info.commands = await countEntries(join(dir, 'commands'), (name, directory) => !directory && name.toLowerCase().endsWith('.md'));
    info.connectors = (await pluginServers(dir, manifest)).length;
  } catch (err) {
    info.error = errorMessage(err);
  }
  return info;
}

export async function listPlugins(): Promise<PluginInfo[]> {
  const disabled = new Set(settings.get().disabledPlugins);
  const entries = await readdir(paths().plugins, { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => describe(join(paths().plugins, e.name), e.name, disabled)));
  return found.filter((p): p is PluginInfo => !!p).sort((a, b) => a.name.localeCompare(b.name));
}

export async function enabledPlugins(): Promise<PluginInfo[]> {
  return (await listPlugins()).filter((p) => p.enabled);
}

/** Connectors that enabled plugins provide. */
export async function pluginConnectors(): Promise<PluginConnectorSpec[]> {
  const out: PluginConnectorSpec[] = [];
  for (const plugin of await enabledPlugins()) {
    const manifest = await readManifest(plugin.dir);
    if (!manifest) continue;
    for (const server of await pluginServers(plugin.dir, manifest)) out.push({ ...server, id: `plugin:${plugin.id}:${server.name}`, pluginId: plugin.id, pluginName: plugin.name });
  }
  return out;
}

function changed() {
  bus.emit('customize:changed', { kind: 'plugins' });
}

export function setPluginEnabled(id: string, enabled: boolean): void {
  const disabled = new Set(settings.get().disabledPlugins);
  if (enabled) disabled.delete(id);
  else disabled.add(id);
  settings.update({ disabledPlugins: [...disabled] });
  changed();
}

export async function removePlugin(id: string): Promise<void> {
  if (!/^[\w.-]+$/.test(id)) throw new Error('Invalid plugin.');
  await rm(join(paths().plugins, id), { recursive: true, force: true });
  setPluginEnabled(id, true);
  changed();
}

const isGitUrl = (source: string) => /^(https?:\/\/|git@|ssh:\/\/)\S+$/i.test(source.trim());

/** Plugin folders in a download: the folder itself, plugins a marketplace.json lists, or plugin folders one level down. */
async function findPluginRoots(root: string): Promise<string[]> {
  const marketplace = (await readJson(join(root, '.claude-plugin', 'marketplace.json'))) as { plugins?: Array<{ source?: unknown }> } | undefined;
  if (marketplace?.plugins?.length && !(await isFile(join(root, '.claude-plugin', 'plugin.json')))) {
    const roots: string[] = [];
    for (const entry of marketplace.plugins) {
      if (typeof entry.source !== 'string' || /^[a-z]+:\/\//i.test(entry.source)) continue;
      const dir = resolve(root, entry.source);
      if (dir.startsWith(resolve(root)) && (await readManifest(dir))) roots.push(dir);
    }
    if (roots.length) return roots;
  }
  if (await readManifest(root)) return [root];
  const roots: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory() && (await isFile(join(root, entry.name, '.claude-plugin', 'plugin.json')))) roots.push(join(root, entry.name));
  }
  return roots;
}

/** Install from a folder, a .zip, or a git URL (cloned with git). Reinstalling replaces the old copy. */
export async function installPlugin(source: string): Promise<PluginInfo[]> {
  const trimmed = source.trim();
  if (!trimmed) throw new Error('Choose a plugin folder, a .zip file or a git URL.');
  const temp = join(paths().tmp, `plugin-${newId()}`);
  let root = trimmed;
  try {
    if (isGitUrl(trimmed)) {
      await exec('git', ['clone', '--depth', '1', '--', trimmed, temp], { timeout: 180_000, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).catch((err: { stderr?: string }) => {
        throw new Error(`git clone failed: ${(err.stderr ?? errorMessage(err)).trim().split('\n').pop()}`);
      });
      root = temp;
    } else {
      const info = await stat(trimmed).catch(() => null);
      if (!info) throw new Error(`${trimmed} does not exist.`);
      if (info.isFile()) {
        if (extname(trimmed).toLowerCase() !== '.zip') throw new Error('Plugins install from a folder, a .zip file or a git URL.');
        await extractZip(trimmed, { dir: temp });
        root = temp;
      }
    }
    const roots = await findPluginRoots(root);
    if (roots.length === 0) throw new Error('No plugin was found there (expected .claude-plugin/plugin.json, skills/, commands/ or .mcp.json).');
    await mkdir(paths().plugins, { recursive: true });
    const ids: string[] = [];
    for (const dir of roots) {
      const manifest = (await readManifest(dir))!;
      const id = slug(manifest.name);
      const target = join(paths().plugins, id);
      if (resolve(target) === resolve(dir)) continue;
      await rm(target, { recursive: true, force: true });
      await cp(dir, target, { recursive: true, filter: (src) => basename(src) !== '.git' && basename(src) !== 'node_modules' });
      ids.push(id);
    }
    changed();
    return (await listPlugins()).filter((p) => ids.includes(p.id));
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => undefined);
  }
}
