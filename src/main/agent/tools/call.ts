/** `call(module, task)`: hand work to another part of Cellar instead of redoing it in the chat. */
import { z } from 'zod';
import { describeModules, MODULE_IDS, moduleReadOnly, type ModuleId } from '../../modules/catalog';
import { modules } from '../../modules/registry';
import { clip, defineTool } from './types';

const moduleId = z.enum(MODULE_IDS);

export const callTool = defineTool({
  name: 'call',
  description:
    `Delegate work to another Cellar module. task is { "action": "…", "params": { … } }; the answer is { "status", "result", "stdout" }.\n\n${describeModules()}\n\n` +
    'Actions marked [starts work; poll with status] answer straight away with a task_id: the work runs in its own conversation the user can watch, and you check on it with { "action": "status", "params": { "task_id": "…" } } (also "cancel", and "actions" to list what a module takes). Do not poll in a tight loop — answer the user with what you have and check again on the next turn.',
  category: 'module',
  input: z.object({
    module: moduleId.describe('Which module to ask.'),
    task: z
      .object({
        action: z.string().min(1).describe('What the module should do.'),
        params: z.record(z.string(), z.unknown()).optional().describe('Arguments for that action.'),
      })
      .describe('The task, as structured JSON.'),
  }),
  async approval(args) {
    if (moduleReadOnly(args.module as ModuleId, args.task.action.toLowerCase().replace(/[\s-]+/g, '_'))) return null;
    return {
      kind: 'action',
      title: `Let ${args.module} ${args.task.action.replace(/_/g, ' ')}`,
      preview: JSON.stringify(args.task, null, 2).slice(0, 4000),
    };
  },
  async run(args, ctx) {
    const result = await modules.call(args.module as ModuleId, args.task, { conversationId: ctx.conversationId, signal: ctx.signal });
    const body = JSON.stringify({ status: result.status, result: result.result }, null, 2);
    return clip(`${result.stdout ? `${result.stdout}\n\n` : ''}${body}`, ctx.maxResultChars, 'the module returned more than fits');
  },
});

/** Models often flatten `call` into `{module, action, params}`, or send `task` as a JSON string. */
export function normalizeCallArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out = { ...args };
  if (typeof out.module !== 'string' && typeof out.name === 'string') out.module = out.name;
  if (typeof out.module === 'string') {
    const slug = out.module.trim().toLowerCase().replace(/[\s_]+/g, '-');
    out.module = MODULE_IDS.includes(slug as ModuleId) ? slug : MODULE_IDS.includes(`cellar-${slug}` as ModuleId) ? `cellar-${slug}` : out.module;
  }
  if (typeof out.task === 'string') {
    try {
      const parsed: unknown = JSON.parse(out.task);
      if (parsed && typeof parsed === 'object') out.task = parsed;
      else out.task = { action: out.task };
    } catch {
      out.task = { action: out.task };
    }
  }
  if (!out.task || typeof out.task !== 'object') {
    const action = out.action ?? out.command ?? out.operation;
    if (typeof action === 'string') out.task = { action, params: (out.params ?? out.arguments ?? out.args ?? {}) as Record<string, unknown> };
  }
  const task = out.task as Record<string, unknown> | undefined;
  if (task && typeof task === 'object') {
    if (typeof task.action !== 'string' && typeof task.name === 'string') task.action = task.name;
    if (task.params === undefined && task.arguments !== undefined) task.params = task.arguments;
    delete task.arguments;
    delete task.name;
    if (task.params !== undefined && (typeof task.params !== 'object' || task.params === null || Array.isArray(task.params))) delete task.params;
  }
  delete out.action;
  delete out.params;
  return out;
}
