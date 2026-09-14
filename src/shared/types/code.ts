/** Code: a coding agent that works in a repository, usually in its own git worktree. */
import type { ThinkingLevel } from './chat';
import type { ModelRef } from './models';

/**
 * - ask: answer questions about the code (read-only)
 * - plan: investigate and propose a plan (read-only)
 * - code: change files and run commands
 */
export type CodeMode = 'ask' | 'plan' | 'code';

export interface CodeSessionInfo {
  /** The repository (top level) or folder the user picked. */
  repoRoot: string;
  repoName: string;
  isGit: boolean;
  /** The session works in its own git worktree (under ~/.cellar/worktrees). */
  worktree: boolean;
  /** Branch checked out in the working folder: the session branch for worktrees. */
  branch?: string;
  /** Branch the session started from. */
  baseBranch?: string;
  /** Commit the session started from; changes are shown against it. */
  baseCommit?: string;
  mode: CodeMode;
}

export interface CodeStartOptions {
  folder: string;
  mode: CodeMode;
  /** Code mode only: apply file edits without asking. */
  autoAcceptEdits: boolean;
  /** Create a git worktree for the session (ignored outside git repositories). */
  worktree: boolean;
  /** Branch to start the worktree from; defaults to the current branch. */
  baseBranch?: string;
}

export interface RepoInfo {
  /** Top level of the repository, or the folder itself outside git. */
  path: string;
  name: string;
  isGit: boolean;
  gitAvailable: boolean;
  branch?: string;
  branches: string[];
  /** Uncommitted changes in the checkout. */
  dirty: boolean;
  /** CELLAR.md (or AGENTS.md / CLAUDE.md) at the top level. */
  memoryFile?: string;
}

export type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface ChangedFile {
  /** Relative to the working folder, forward slashes. */
  path: string;
  oldPath?: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface ChangeSet {
  /** git: diff against the session's base commit; snapshots: files the agent changed outside git. */
  source: 'git' | 'snapshots';
  /** Short commit the diff is against. */
  base?: string;
  files: ChangedFile[];
  additions: number;
  deletions: number;
  /** Files with uncommitted changes (git only). */
  uncommitted: number;
  /** Commits on the session branch since the base commit (git only). */
  commits: number;
}

export interface FileDiff {
  path: string;
  /** '' when the file was added. */
  oldText: string;
  /** '' when the file was deleted. */
  newText: string;
  binary: boolean;
  /** Too large to show (over ~2 MB). */
  tooLarge: boolean;
}

export interface FileEntry {
  name: string;
  /** Relative to the working folder, forward slashes. */
  path: string;
  isDirectory: boolean;
  size?: number;
}

export interface FileContent {
  path: string;
  content: string;
  binary: boolean;
  tooLarge: boolean;
  size: number;
}

export interface MemoryFile {
  /** Relative path of the memory file in the working folder (CELLAR.md unless another one exists). */
  path: string;
  exists: boolean;
  content: string;
}

export interface CommitResult {
  commit: string;
  summary: string;
}

export interface MergeResult {
  merged: boolean;
  message: string;
}

export interface TerminalInfo {
  id: string;
  conversationId: string;
  cwd: string;
  shell: string;
  title: string;
  exited: boolean;
  exitCode?: number;
}

export interface TerminalDataEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number;
}

export interface SideChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SideChatRequest {
  requestId: string;
  conversationId: string;
  /** The side conversation so far, ending with the new question. */
  messages: SideChatMessage[];
  model: ModelRef;
  thinking: ThinkingLevel;
}

export interface SideChatEvent {
  requestId: string;
  conversationId: string;
  delta?: string;
  reasoning?: string;
  done?: boolean;
  error?: string;
}

export type TranscriptView = 'normal' | 'verbose' | 'summary';
