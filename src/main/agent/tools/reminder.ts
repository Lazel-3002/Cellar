/**
 * `create_reminder`: the model setting a wake-up for itself. It writes a one-shot row into the
 * scheduled-task table, so the reminder outlives this turn, this session, and the app being quit —
 * the same OS wake job that relaunches Cellar for a scheduled task relaunches it for a reminder.
 */
import { z } from 'zod';
import { MAX_REMINDER_SECONDS, MIN_REMINDER_SECONDS, scheduler } from '../../scheduled/scheduler';
import { defineTool, ToolError } from './types';

/** "in 10 minutes", "2h", "90s" — models write delays as prose about as often as as numbers. */
export function parseDelaySeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text));
  let total = 0;
  let matched = false;
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)\b/g)) {
    const amount = Number(match[1]);
    const unit = match[2][0];
    total += amount * (unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86_400);
    matched = true;
  }
  return matched ? Math.round(total) : null;
}

function describeWhen(at: number): string {
  return new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export const createReminderTool = defineTool({
  name: 'create_reminder',
  description:
    'Set a reminder for yourself. It fires even if this chat is closed or Cellar is quit: give delay_seconds plus at least one of message (posted into this conversation), task (sent back to you as a new request to work on) or email_check (an inbox to check and summarize with your email connector). Use it when the user asks to be reminded, or when something genuinely has to be picked up later — not to poll.',
  category: 'plan',
  input: z.object({
    delay_seconds: z.union([z.coerce.number(), z.string()]).describe(`How long from now, in seconds (${MIN_REMINDER_SECONDS}s to 31 days). "10 minutes" and "2h" are understood too.`),
    message: z.string().max(2000).optional().describe('A note to post into this conversation when it fires.'),
    task: z.string().max(10_000).optional().describe('What you should do when it fires; it comes back to you as a new request in this conversation.'),
    email_check: z.string().max(200).optional().describe('An inbox to check and summarize when it fires, e.g. "work@example.com".'),
  }),
  async approval(args) {
    // A note to the user is harmless; work that runs later, on its own, is not.
    if (!args.task && !args.email_check) return null;
    const seconds = parseDelaySeconds(args.delay_seconds) ?? 0;
    return {
      kind: 'action',
      title: `Let this run again in ${seconds >= 3600 ? `${Math.round(seconds / 360) / 10} hours` : seconds >= 60 ? `${Math.round(seconds / 60)} minutes` : `${seconds} seconds`}`,
      preview: [args.task && `Task: ${args.task}`, args.email_check && `Inbox to check: ${args.email_check}`, args.message && `Note: ${args.message}`].filter(Boolean).join('\n\n').slice(0, 4000),
    };
  },
  async run(args, ctx) {
    if (!ctx.conversationId) throw new ToolError('Reminders belong to a conversation, and this one has none.');
    if (ctx.incognito) throw new ToolError('Incognito chats are thrown away when they close, so a reminder in one would have nowhere to fire.');
    const seconds = parseDelaySeconds(args.delay_seconds);
    if (seconds === null || seconds <= 0) throw new ToolError('delay_seconds must be a number of seconds from now, for example 600 for ten minutes.');
    if (!args.message && !args.task && !args.email_check) throw new ToolError('Give at least one of message, task or email_check — otherwise the reminder has nothing to do.');
    if (seconds > MAX_REMINDER_SECONDS) throw new ToolError('That is more than a month away. Ask the user to add a scheduled task instead (Scheduled in the sidebar).');
    try {
      const reminder = scheduler.createReminder({
        conversationId: ctx.conversationId,
        delaySeconds: seconds,
        message: args.message,
        task: args.task,
        emailCheck: args.email_check,
      });
      const clamped = seconds < MIN_REMINDER_SECONDS ? ` (raised to the ${MIN_REMINDER_SECONDS}s minimum)` : '';
      const what = args.task ? 'it will come back to you as a new request' : args.email_check ? `it will check ${args.email_check} and summarize what is new` : 'the note will be posted here';
      return `Reminder set for ${describeWhen(reminder.fireAt ?? Date.now())}${clamped}: ${what}. It fires even if this chat is closed or Cellar is quit. The user can see and cancel it under Scheduled.`;
    } catch (err) {
      throw new ToolError(err instanceof Error ? err.message : String(err));
    }
  },
});
