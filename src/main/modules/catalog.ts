/**
 * What `call(module, task)` accepts, kept free of imports: the tool definition and the registry both
 * read this at load time, and the registry pulls in the whole app (chat, Code, Design, Math, Voice),
 * so the two must not depend on each other while modules are still initializing.
 */

export const MODULE_IDS = ['cellar-code', 'cellar-math', 'cellar-design', 'cellar-cowork', 'cellar-voice'] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleAction {
  action: string;
  params: string;
  summary: string;
  /** Starts a conversation that runs on a model; answers with a task_id to poll. */
  long?: boolean;
}

/** Actions the dispatcher answers for every module, before the module itself sees the task. */
export const RESERVED_ACTIONS = new Set(['status', 'cancel', 'actions']);

/** Actions that only read; everything else asks the user before it runs. */
export const READ_ONLY_ACTIONS: Record<ModuleId, string[]> = {
  'cellar-code': ['diagnostics'],
  'cellar-math': ['calculate', 'solve', 'quiz'],
  'cellar-design': [],
  'cellar-cowork': [],
  'cellar-voice': ['info', 'transcribe'],
};

export const MODULE_ACTIONS: Record<ModuleId, ModuleAction[]> = {
  'cellar-code': [
    { action: 'run', params: 'folder (required), prompt (required), mode: "ask" | "plan" | "code"', summary: 'Start a Code session on a repository and work through the prompt.', long: true },
    { action: 'diagnostics', params: 'folder (required), file (optional, inside it)', summary: 'Run the project checkers (tsc, pyright/ruff, cargo, go vet), or a fast syntax check of one file.' },
  ],
  'cellar-math': [
    { action: 'calculate', params: 'expression or expressions, angle: "deg" | "rad", steps, decimals', summary: "Exact and decimal answers from Cellar's own calculator." },
    { action: 'solve', params: 'input, kind, sides, triangle, angle', summary: 'A worked, step-by-step solution.' },
    { action: 'quiz', params: 'topic, count, difficulty, choices, seed', summary: 'A practice test with answers and solutions.' },
    { action: 'create_board', params: 'prompt (required), topic, paper, angle_mode', summary: 'Open a Math board and let it build a study sheet.', long: true },
    { action: 'export', params: 'conversation_id or board_id, format: "pdf" | "png" | "md", answers', summary: 'Write a board out as a file.' },
  ],
  'cellar-design': [
    { action: 'create', params: 'prompt (required), format: "slides" | "document" | "social" | "poster" | "web" | "mobile" | "custom", theme', summary: 'Open a Design canvas and let it lay the work out.', long: true },
    { action: 'export', params: 'conversation_id or design_id, format: "png" | "pdf" | "pptx", scale', summary: 'Write a design out as a file.' },
  ],
  'cellar-cowork': [
    { action: 'run', params: 'prompt (required), folder, permission_mode: "ask" | "auto-edits" | "plan"', summary: 'Start a Cowork task in a folder.', long: true },
  ],
  'cellar-voice': [
    { action: 'info', params: '—', summary: 'Whether dictation and spoken replies are set up, and which models are installed.' },
    { action: 'transcribe', params: 'path (required, a 16 kHz mono WAV file), language', summary: 'Turn a recording into text with whisper.cpp.' },
    { action: 'speak', params: 'text (required)', summary: 'Read text aloud through the spoken-replies voice.' },
  ],
};

/** Whether the user is asked before this task runs. */
export function moduleReadOnly(module: ModuleId, action: string): boolean {
  return RESERVED_ACTIONS.has(action) || (READ_ONLY_ACTIONS[module] ?? []).includes(action);
}

/** The catalogue as the model sees it, inside the `call` tool's description. */
export function describeModules(): string {
  return MODULE_IDS.map(
    (id) => `${id}:\n${MODULE_ACTIONS[id].map((a) => `  - ${a.action}(${a.params})${a.long ? ' [starts work; poll with status]' : ''} — ${a.summary}`).join('\n')}`,
  ).join('\n\n');
}
