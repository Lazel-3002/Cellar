/**
 * Skills in the Claude skills format: a folder with a SKILL.md (frontmatter `name` and `description`,
 * then instructions) plus optional helper files. Your skills live in ~/.cellar/skills; plugins can
 * bring more. Models see each enabled skill's name and description and load the full instructions
 * with the `skill` tool when a request matches.
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';
import extractZip from 'extract-zip';
import type { SkillDetail, SkillInfo, SkillInput } from '@shared/types/customize';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage, newId } from '../lib/util';
import { settings } from '../services/settings';
import { paths } from '../system/paths';
import { fmString, parseFrontmatter, yamlString } from './frontmatter';
import { enabledPlugins } from './plugins';

const log = logger('skills');
const MAX_FILES = 60;
const MAX_SKILL_BYTES = 256 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv']);

/** Lowercase letters, digits and hyphens, as the skills format asks. */
export function skillSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'skill'
  );
}

async function helperFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const visit = async (folder: string, depth: number) => {
    if (out.length >= MAX_FILES || depth > 4) return;
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return;
      const full = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) await visit(full, depth + 1);
      } else if (entry.isFile()) {
        const rel = relative(dir, full).split(sep).join('/');
        if (rel !== 'SKILL.md') out.push(rel);
      }
    }
  };
  await visit(dir, 0);
  return out;
}

export async function readSkillDir(dir: string, id: string, source: SkillInfo['source'], pluginName?: string): Promise<SkillDetail | null> {
  const file = join(dir, 'SKILL.md');
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return null;
  const disabled = new Set(settings.get().disabledSkills);
  const base: SkillDetail = { id, name: basename(dir), description: '', source, pluginName, dir, enabled: !disabled.has(id), files: [], body: '' };
  try {
    if (info.size > MAX_SKILL_BYTES) throw new Error('SKILL.md is larger than 256 KB.');
    const { data, body } = parseFrontmatter(await readFile(file, 'utf8'));
    base.name = fmString(data, 'name') || basename(dir);
    base.description = fmString(data, 'description');
    base.body = body.trim();
    base.files = await helperFiles(dir);
    if (!base.description) base.error = 'SKILL.md has no description in its frontmatter, so models cannot tell when to use it.';
  } catch (err) {
    base.error = errorMessage(err);
  }
  return base;
}

async function skillsIn(root: string, idPrefix: string, source: SkillInfo['source'], pluginName?: string): Promise<SkillDetail[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => readSkillDir(join(root, e.name), `${idPrefix}${e.name}`, source, pluginName)));
  return found.filter((s): s is SkillDetail => !!s);
}

async function allSkills(): Promise<SkillDetail[]> {
  const user = await skillsIn(paths().skills, 'user:', 'user');
  const plugin = await Promise.all((await enabledPlugins()).map((p) => skillsIn(join(p.dir, 'skills'), `plugin:${p.id}:`, 'plugin', p.name)));
  return [...user, ...plugin.flat()].sort((a, b) => a.name.localeCompare(b.name));
}

const summary = ({ body: _body, ...info }: SkillDetail): SkillInfo => info;

export async function listSkills(): Promise<SkillInfo[]> {
  return (await allSkills()).map(summary);
}

/** Skills models may use right now: enabled and well-formed. */
export async function activeSkills(): Promise<SkillDetail[]> {
  return (await allSkills()).filter((s) => s.enabled && !s.error);
}

export async function getSkill(id: string): Promise<SkillDetail> {
  const skill = (await allSkills()).find((s) => s.id === id);
  if (!skill) throw new Error('Skill not found.');
  return skill;
}

/** Find an active skill by the name a model used (case- and separator-insensitive). */
export async function findActiveSkill(name: string): Promise<SkillDetail | undefined> {
  const wanted = skillSlug(name);
  const skills = await activeSkills();
  return skills.find((s) => s.name === name) ?? skills.find((s) => skillSlug(s.name) === wanted || s.id.endsWith(`:${wanted}`));
}

function changed() {
  bus.emit('customize:changed', { kind: 'skills' });
}

export function renderSkillFile(input: Pick<SkillInput, 'name' | 'description' | 'body'>): string {
  return `---\nname: ${yamlString(input.name.trim())}\ndescription: ${yamlString(input.description.trim())}\n---\n\n${input.body.trim()}\n`;
}

export async function saveSkill(input: SkillInput): Promise<SkillInfo> {
  const name = input.name.trim();
  if (!name) throw new Error('Give the skill a name.');
  if (!input.description.trim()) throw new Error('Describe when the skill should be used; models decide from the description.');
  let dir: string;
  let id: string;
  if (input.id) {
    const existing = await getSkill(input.id);
    if (existing.source !== 'user') throw new Error('Skills from plugins are edited in the plugin itself.');
    dir = existing.dir;
    id = existing.id;
  } else {
    let folder = skillSlug(name);
    for (let i = 2; await stat(join(paths().skills, folder)).catch(() => null); i++) folder = `${skillSlug(name)}-${i}`;
    dir = join(paths().skills, folder);
    id = `user:${folder}`;
  }
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), renderSkillFile(input), 'utf8');
  changed();
  const saved = await readSkillDir(dir, id, 'user');
  if (!saved) throw new Error('The skill could not be saved.');
  return summary(saved);
}

export function setSkillEnabled(id: string, enabled: boolean): void {
  const disabled = new Set(settings.get().disabledSkills);
  if (enabled) disabled.delete(id);
  else disabled.add(id);
  settings.update({ disabledSkills: [...disabled] });
  changed();
}

export async function deleteSkill(id: string): Promise<void> {
  const skill = await getSkill(id);
  if (skill.source !== 'user') throw new Error('Skills from plugins are removed with the plugin.');
  await rm(skill.dir, { recursive: true, force: true });
  setSkillEnabled(id, true);
  changed();
}

async function hasSkillFile(dir: string): Promise<boolean> {
  return !!(await stat(join(dir, 'SKILL.md')).catch(() => null))?.isFile();
}

/** Folders under `root` (itself included) that hold a SKILL.md, two levels deep at most. */
async function findSkillFolders(root: string): Promise<string[]> {
  if (await hasSkillFile(root)) return [root];
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    const child = join(root, entry.name);
    if (await hasSkillFile(child)) found.push(child);
    else for (const grand of await readdir(child, { withFileTypes: true }).catch(() => [])) if (grand.isDirectory() && (await hasSkillFile(join(child, grand.name)))) found.push(join(child, grand.name));
  }
  return found;
}

async function copySkill(from: string, overwrite: boolean): Promise<string | null> {
  const parsed = await readSkillDir(from, 'import', 'user');
  const folder = skillSlug(parsed?.name && parsed.name !== basename(from) ? parsed.name : basename(from));
  const target = join(paths().skills, folder);
  if (!overwrite && (await stat(target).catch(() => null))) return null;
  await rm(target, { recursive: true, force: true });
  await cp(from, target, { recursive: true, filter: (src) => !SKIP_DIRS.has(basename(src)) });
  return `user:${folder}`;
}

/** Import a skill folder, a folder of skills, or a .zip / .skill archive. Existing skills with the same name are replaced. */
export async function importSkills(source: string): Promise<SkillInfo[]> {
  const info = await stat(source).catch(() => null);
  if (!info) throw new Error(`${source} does not exist.`);
  let root = source;
  let temp: string | null = null;
  if (info.isFile()) {
    if (!['.zip', '.skill'].includes(extname(source).toLowerCase())) throw new Error('Choose a skill folder, or a .zip or .skill file.');
    temp = join(paths().tmp, `skill-${newId()}`);
    await extractZip(source, { dir: temp });
    root = temp;
  }
  try {
    const folders = await findSkillFolders(root);
    if (folders.length === 0) throw new Error('No SKILL.md was found there.');
    await mkdir(paths().skills, { recursive: true });
    const ids: string[] = [];
    for (const folder of folders) {
      const id = await copySkill(folder, true);
      if (id) ids.push(id);
    }
    changed();
    const skills = await listSkills();
    return skills.filter((s) => ids.includes(s.id));
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Copy skills from Claude Code (~/.claude/skills) that Cellar does not have yet. */
export async function importClaudeSkills(): Promise<number> {
  const folders = await findSkillFolders(paths().claudeSkills);
  await mkdir(paths().skills, { recursive: true });
  let count = 0;
  for (const folder of folders) {
    try {
      if (await copySkill(folder, false)) count++;
    } catch (err) {
      log.warn('skill import failed', folder, errorMessage(err));
    }
  }
  if (count) changed();
  return count;
}

export async function claudeSkillsAvailable(): Promise<boolean> {
  return (await findSkillFolders(paths().claudeSkills)).length > 0;
}

/** The part of the system prompt that lists skills. */
export function skillsPrompt(skills: Array<Pick<SkillInfo, 'name' | 'description'>>): string {
  if (skills.length === 0) return '';
  return [
    '<available_skills>',
    ...skills.map((s) => `- ${s.name}: ${s.description.replace(/\s+/g, ' ').slice(0, 600)}`),
    '</available_skills>',
    'Skills hold expert instructions for particular kinds of work. When a request matches a skill, call the skill tool with its name before starting, then follow the instructions it returns.',
  ].join('\n');
}
