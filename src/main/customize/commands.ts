/**
 * Slash commands: Markdown prompt templates in ~/.cellar/commands/<name>.md (and a plugin's commands/
 * folder), in the Claude Code format: optional frontmatter with `description` and `argument-hint`, then
 * the prompt. `$ARGUMENTS` is replaced by what follows the command; `$1`…`$9` by single words.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandDetail, CommandInfo, CommandInput, ToolScope } from '@shared/types/customize';
import { bus } from '../lib/events';
import { paths } from '../system/paths';
import { fmString, parseFrontmatter, yamlString } from './frontmatter';
import { enabledPlugins } from './plugins';

/** Commands Cellar handles itself (not sent to the model as written). */
export function builtInCommands(scope: ToolScope): CommandInfo[] {
  const common: CommandInfo[] = [
    { name: 'tools', description: 'Show the tools the model can use here', source: 'built-in' },
    { name: 'remember', description: 'Save something to memory', argumentHint: '<what to remember>', source: 'built-in' },
  ];
  if (scope !== 'code') return common;
  return [
    { name: 'init', description: 'Study the repository and write CELLAR.md', source: 'built-in' },
    { name: 'memory', description: 'Open CELLAR.md in the editor', source: 'built-in' },
    { name: 'btw', description: 'Ask a side question that stays out of the session', argumentHint: '<question>', source: 'built-in' },
    ...common,
  ];
}

export const commandSlug = (name: string) =>
  name
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

async function readCommands(dir: string, source: 'user' | 'plugin', pluginName?: string): Promise<CommandDetail[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: CommandDetail[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
    const name = commandSlug(entry.name.slice(0, -3));
    if (!name) continue;
    try {
      const { data, body } = parseFrontmatter(await readFile(join(dir, entry.name), 'utf8'));
      const firstLine = body.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '').trim() ?? '';
      out.push({ name, description: fmString(data, 'description') || firstLine.slice(0, 100), argumentHint: fmString(data, 'argument-hint') || undefined, source, pluginName, body: body.trim() });
    } catch {
      // unreadable command file
    }
  }
  return out;
}

/** Your commands and those of enabled plugins; built-in names win, then yours, then plugins (prefixed on clashes). */
export async function customCommands(): Promise<CommandDetail[]> {
  const reserved = new Set([...builtInCommands('code'), ...builtInCommands('chat')].map((c) => c.name));
  const user = (await readCommands(paths().commands, 'user')).filter((c) => !reserved.has(c.name));
  const taken = new Set([...reserved, ...user.map((c) => c.name)]);
  const plugin: CommandDetail[] = [];
  for (const p of await enabledPlugins()) {
    for (const command of await readCommands(join(p.dir, 'commands'), 'plugin', p.name)) {
      const name = taken.has(command.name) ? `${commandSlug(p.id)}:${command.name}` : command.name;
      if (taken.has(name)) continue;
      taken.add(name);
      plugin.push({ ...command, name });
    }
  }
  return [...user, ...plugin].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCommands(scope: ToolScope): Promise<CommandInfo[]> {
  return [...builtInCommands(scope), ...(await customCommands()).map(({ body: _body, ...info }) => info)];
}

export async function getCommand(name: string): Promise<CommandDetail> {
  const command = (await customCommands()).find((c) => c.name === commandSlug(name));
  if (!command) throw new Error(`There is no /${commandSlug(name)} command.`);
  return command;
}

/** Fill a command template with the text typed after it. */
export function expandTemplate(body: string, args: string): string {
  const trimmed = args.trim();
  const words = trimmed ? trimmed.split(/\s+/) : [];
  const hasPlaceholder = /\$ARGUMENTS|\$[1-9]/.test(body);
  const filled = body.replace(/\$ARGUMENTS/g, trimmed).replace(/\$([1-9])/g, (_m, n: string) => words[Number(n) - 1] ?? '');
  return !hasPlaceholder && trimmed ? `${filled}\n\n${trimmed}` : filled;
}

export async function expandCommand(name: string, args: string): Promise<string> {
  return expandTemplate((await getCommand(name)).body, args);
}

function changed() {
  bus.emit('customize:changed', { kind: 'commands' });
}

export async function saveCommand(input: CommandInput): Promise<CommandInfo> {
  const name = commandSlug(input.name);
  if (!name || name.includes(':')) throw new Error('Command names use letters, digits and dashes.');
  if ([...builtInCommands('code'), ...builtInCommands('chat')].some((c) => c.name === name)) throw new Error(`/${name} is a built-in command.`);
  if (!input.body.trim()) throw new Error('Write the prompt the command sends.');
  await mkdir(paths().commands, { recursive: true });
  const previous = input.previousName ? commandSlug(input.previousName) : null;
  if (previous && previous !== name) await rm(join(paths().commands, `${previous}.md`), { force: true });
  const front = input.description.trim() ? `---\ndescription: ${yamlString(input.description.trim())}\n---\n\n` : '';
  await writeFile(join(paths().commands, `${name}.md`), `${front}${input.body.trim()}\n`, 'utf8');
  changed();
  return { name, description: input.description.trim(), source: 'user' };
}

export async function deleteCommand(name: string): Promise<void> {
  const slug = commandSlug(name);
  if (!slug || slug.includes(':')) throw new Error('Commands from plugins are removed with the plugin.');
  await rm(join(paths().commands, `${slug}.md`), { force: true });
  changed();
}
