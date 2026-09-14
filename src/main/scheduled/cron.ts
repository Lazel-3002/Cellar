import { Cron } from 'croner';
import type { CronPreview } from '@shared/types/scheduled';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Five fields only (minute hour day month weekday); seconds are not offered. */
export function parseCron(pattern: string): Cron {
  const trimmed = pattern.trim().replace(/\s+/g, ' ');
  if (trimmed.split(' ').length !== 5) throw new Error('Use five fields: minute hour day-of-month month day-of-week, for example "0 9 * * 1-5".');
  return new Cron(trimmed, { paused: true });
}

const pad = (n: string) => n.padStart(2, '0');

/** Plain-English description of the common patterns the schedule editor makes. */
export function describeCron(pattern: string): string {
  const fields = pattern.trim().split(/\s+/);
  if (fields.length !== 5) return pattern;
  const [minute, hour, dom, month, dow] = fields;
  const numeric = (v: string) => /^\d+$/.test(v);
  const time = numeric(minute) && numeric(hour) ? `${pad(hour)}:${pad(minute)}` : null;
  if (month === '*' && dom === '*') {
    const everyMinutes = /^\*\/(\d+)$/.exec(minute);
    if (everyMinutes && hour === '*' && dow === '*') return `Every ${everyMinutes[1]} minutes`;
    if (minute === '*' && hour === '*' && dow === '*') return 'Every minute';
    if (numeric(minute) && hour === '*' && dow === '*') return minute === '0' ? 'Every hour' : `Every hour at :${pad(minute)}`;
    const everyHours = /^\*\/(\d+)$/.exec(hour);
    if (numeric(minute) && everyHours && dow === '*') return `Every ${everyHours[1]} hours at :${pad(minute)}`;
    if (time && dow === '*') return `Every day at ${time}`;
    if (time && (dow === '1-5' || dow === 'MON-FRI')) return `Every weekday at ${time}`;
    if (time && (dow === '0,6' || dow === '6,0')) return `Every weekend day at ${time}`;
    if (time && /^[0-7](,[0-7])*$/.test(dow)) {
      const names = [...new Set(dow.split(',').map((d) => DAYS[Number(d) % 7]))];
      return `Every ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`} at ${time}`;
    }
  }
  if (time && numeric(dom) && month === '*' && dow === '*') return `On day ${dom} of every month at ${time}`;
  return `Custom schedule (${pattern.trim()})`;
}

export function previewCron(pattern: string, count = 3, from = new Date()): CronPreview {
  try {
    const cron = parseCron(pattern);
    return { valid: true, description: describeCron(pattern), next: cron.nextRuns(count, from).map((d) => d.getTime()) };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message.replace(/^CronPattern: /, '') : String(err), next: [] };
  }
}

/** The first time the schedule fires after `after`, or null. */
export function nextFire(pattern: string, after: number): number | null {
  try {
    return parseCron(pattern).nextRun(new Date(after))?.getTime() ?? null;
  } catch {
    return null;
  }
}
