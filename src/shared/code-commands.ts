import type { PermissionMode } from './types/agent';
import type { CodeMode } from './types/code';

/** Tool permission mode that goes with a Code mode: Ask and Plan are read-only. */
export function codePermissionMode(mode: CodeMode, autoAcceptEdits: boolean): PermissionMode {
  if (mode !== 'code') return 'plan';
  return autoAcceptEdits ? 'auto-edits' : 'ask';
}

/** What `/init` sends: the agent studies the repository and writes CELLAR.md. */
export const INIT_PROMPT = [
  'Study this repository and create a CELLAR.md file at its root to serve as project memory for future coding sessions.',
  'Include: a one-paragraph overview; how to install dependencies, build, run, test and lint (exact commands, found in the manifests and scripts); the layout of the main folders; code style and conventions you observe; and anything easy to get wrong.',
  'Keep it under 120 lines, factual and specific to this repository. If CELLAR.md already exists, improve it instead of starting over.',
].join(' ');
