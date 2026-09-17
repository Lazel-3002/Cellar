import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface CellarPaths {
  userData: string;
  db: string;
  logs: string;
  attachments: string;
  cellarHome: string;
  defaultModelsDir: string;
  runtimes: string;
  tmp: string;
  hfCache: string;
  lmStudioModels: string;
  unslothHome: string;
  unslothLlamaCppDirs: string[];
  unslothCli: string;
  artifactRuntime: string;
  /** Your skills: one folder with a SKILL.md each. */
  skills: string;
  /** Installed plugins: one folder each. */
  plugins: string;
  /** Your slash commands: one Markdown file each. */
  commands: string;
  /** whisper.cpp builds and models. */
  whisper: string;
  /** The piper build and its downloaded voices, for spoken replies. */
  piper: string;
  /** Working folders of Design sessions. */
  designs: string;
  /** Working folders of Math sessions. */
  boards: string;
  /** Claude Desktop's config and Claude Code's skills, for importing. */
  claudeDesktopConfig: string;
  claudeSkills: string;
  /** Snapshot of enabled scheduled tasks, rewritten whenever they change; survives Cellar being fully quit. */
  scheduledRegistry: string;
}

let current: CellarPaths | null = null;

export function initPaths(userData: string, artifactRuntimeDir: string): CellarPaths {
  const home = homedir();
  const cellarHome = process.env.CELLAR_HOME ?? join(home, '.cellar');
  const hfHome = process.env.HF_HOME ?? join(home, '.cache', 'huggingface');
  const unslothHome = join(home, '.unsloth');
  current = {
    userData,
    db: join(userData, 'cellar.db'),
    logs: join(userData, 'logs'),
    attachments: join(userData, 'attachments'),
    cellarHome,
    defaultModelsDir: join(cellarHome, 'models'),
    runtimes: join(cellarHome, 'runtimes', 'llama.cpp'),
    tmp: join(cellarHome, 'tmp'),
    hfCache: process.env.HF_HUB_CACHE ?? join(hfHome, 'hub'),
    lmStudioModels: join(home, '.lmstudio', 'models'),
    unslothHome,
    unslothLlamaCppDirs: [
      join(unslothHome, 'llama.cpp', 'build', 'bin', 'Release'),
      join(unslothHome, 'llama.cpp', 'build', 'bin'),
    ],
    unslothCli: join(unslothHome, 'studio', 'bin', process.platform === 'win32' ? 'unsloth.cmd' : 'unsloth'),
    artifactRuntime: artifactRuntimeDir,
    skills: join(cellarHome, 'skills'),
    plugins: join(cellarHome, 'plugins'),
    commands: join(cellarHome, 'commands'),
    whisper: join(cellarHome, 'whisper'),
    piper: join(cellarHome, 'piper'),
    designs: join(cellarHome, 'designs'),
    boards: join(cellarHome, 'boards'),
    claudeDesktopConfig: join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json'),
    claudeSkills: join(home, '.claude', 'skills'),
    scheduledRegistry: join(cellarHome, 'scheduled_tasks.json'),
  };
  for (const dir of [current.logs, current.attachments, current.cellarHome, current.runtimes, current.tmp]) {
    mkdirSync(dir, { recursive: true });
  }
  return current;
}

export function paths(): CellarPaths {
  if (!current) throw new Error('Paths not initialised');
  return current;
}
