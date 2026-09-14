import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { codePermissionMode } from '@shared/code-commands';
import type { TaskState } from '@shared/types/agent';
import type { CodeSessionInfo, CodeStartOptions } from '@shared/types/code';
import { settings } from '../services/settings';
import { paths } from '../system/paths';
import { branchExists, branchSlug, createWorktree, findMemoryFile, headCommit, repoInfo } from './git';
import type { MemoryText } from './prompt';

const MAX_MEMORY_CHARS = 24_000;

/** Folder name for a repository's worktrees: letters, digits, dashes. */
const safeName = (name: string) => name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'repo';

/**
 * Initial state of a Code session: resolves the repository and, for git repositories when asked,
 * creates a worktree on a new `cellar/<slug>` branch so the agent's work stays isolated.
 */
export async function prepareCodeSession(conversationId: string, options: CodeStartOptions, request: string): Promise<TaskState> {
  const info = await repoInfo(options.folder);
  const short = conversationId.replace(/-/g, '').slice(0, 6);
  let workDir = info.path;
  const code: CodeSessionInfo = { repoRoot: info.path, repoName: info.name, isGit: info.isGit, worktree: false, mode: options.mode };

  if (info.isGit) {
    const base = options.baseBranch && info.branches.includes(options.baseBranch) ? options.baseBranch : info.branch;
    if (options.worktree) {
      let branch = `cellar/${branchSlug(request)}-${short}`;
      for (let i = 2; await branchExists(info.path, branch); i++) branch = `cellar/${branchSlug(request)}-${short}-${i}`;
      workDir = join(paths().cellarHome, 'worktrees', `${safeName(info.name)}-${short}`);
      if (await stat(workDir).catch(() => null)) workDir = `${workDir}-${Date.now().toString(36)}`;
      const { commit } = await createWorktree({ repoRoot: info.path, dir: workDir, branch, base: base ?? 'HEAD' });
      Object.assign(code, { worktree: true, branch, baseBranch: base, baseCommit: commit });
    } else {
      Object.assign(code, { branch: info.branch, baseBranch: info.branch, baseCommit: await headCommit(info.path) });
    }
  }

  const app = settings.get();
  const recent = app.recentRepos.filter((r) => r.toLowerCase() !== info.path.toLowerCase());
  settings.update({ recentRepos: [info.path, ...recent], codeMode: options.mode, codeAutoAcceptEdits: options.autoAcceptEdits, ...(info.isGit ? { codeUseWorktrees: options.worktree } : {}) });

  return {
    folder: info.path,
    workDir,
    permissionMode: codePermissionMode(options.mode, options.autoAcceptEdits),
    status: 'running',
    todos: [],
    files: [],
    sources: [],
    allowCommands: false,
    allowedDomains: [],
    steps: 0,
    maxSteps: app.codeMaxSteps,
    code,
  };
}

async function readCapped(path: string): Promise<string | undefined> {
  try {
    const text = await readFile(path, 'utf8');
    return text.length > MAX_MEMORY_CHARS ? `${text.slice(0, MAX_MEMORY_CHARS)}\n[… memory file shortened …]` : text;
  } catch {
    return undefined;
  }
}

/** The project memory file in the working folder (CELLAR.md, AGENTS.md or CLAUDE.md). */
export async function loadProjectMemory(workDir: string): Promise<MemoryText | undefined> {
  const name = await findMemoryFile(workDir);
  if (!name) return undefined;
  const content = await readCapped(join(workDir, name));
  return content?.trim() ? { path: name, content } : undefined;
}

/** ~/.cellar/CELLAR.md: the user's notes for every repository. */
export function loadUserMemory(): Promise<string | undefined> {
  return readCapped(join(paths().cellarHome, 'CELLAR.md'));
}
