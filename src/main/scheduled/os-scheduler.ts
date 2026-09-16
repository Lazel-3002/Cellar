/**
 * Registers one OS-level "wake Cellar up" job for the earliest upcoming scheduled task, so tasks
 * still fire after the app quits or the machine sleeps — not just the next time someone opens it.
 * The job's only purpose is to relaunch Cellar with `--scheduled-wake`; once running, the normal
 * in-process scheduler (scheduler.ts) picks up whatever is due, using the SQLite table as truth.
 *
 * Best-effort by design: every platform call is wrapped so a missing/blocked `schtasks`,
 * `launchctl` or `crontab` never breaks scheduling inside the app, only the "wake while asleep/quit"
 * extra. Actual wake-from-hardware-sleep additionally depends on OS/hardware support (Windows'
 * WakeToRun still needs "Allow wake timers" enabled in power settings; macOS/Linux here only
 * guarantee a prompt run once the machine is awake, since scheduling `pmset` wake windows needs
 * admin rights and is out of scope).
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { logger } from '../lib/log';

const exec = promisify(execFile);
const log = logger('scheduled/os');

const WIN_TASK_NAME = 'CellarScheduledWake';
const MAC_LABEL = 'ai.cellar.desktop.scheduledwake';
const CRON_TAG = '# cellar-scheduled-wake — managed by Cellar, do not edit';

/** Set once from main/index.ts (which has the real `app` object); keeps this module Electron-free and unit-testable. */
let launchConfig = { isPackaged: false, appPath: process.cwd() };

export function configure(config: { isPackaged: boolean; appPath: string }): void {
  launchConfig = config;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local wall-clock parts; cron schedules run in local time (croner defaults to it), so the wake job must match. */
function localParts(ms: number) {
  const d = new Date(ms);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() };
}

/** How to relaunch Cellar: the packaged exe directly, or Electron + the app's entry point in dev. */
function launchCommand(): { command: string; args: string[] } {
  if (launchConfig.isPackaged) return { command: process.execPath, args: ['--scheduled-wake'] };
  return { command: process.execPath, args: [launchConfig.appPath, '--scheduled-wake'] };
}

async function syncWindows(nextRunAt: number | null): Promise<void> {
  if (nextRunAt === null) {
    await exec('schtasks', ['/Delete', '/TN', WIN_TASK_NAME, '/F']).catch(() => undefined);
    return;
  }
  const { command, args } = launchCommand();
  const p = localParts(nextRunAt);
  const startBoundary = `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
  const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <TimeTrigger>
      <StartBoundary>${startBoundary}</StartBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT10M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escapeXml(command)}</Command>
      <Arguments>${escapeXml(args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' '))}</Arguments>
    </Exec>
  </Actions>
</Task>`;
  const dir = await mkdtemp(join(tmpdir(), 'cellar-wake-'));
  try {
    const xmlPath = join(dir, 'task.xml');
    // schtasks needs a BOM to tell UTF-16LE from BE; Node's 'utf16le' encoding doesn't add one itself.
    await writeFile(xmlPath, '﻿' + xml, 'utf16le');
    await exec('schtasks', ['/Create', '/TN', WIN_TASK_NAME, '/XML', xmlPath, '/F']);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function syncMac(nextRunAt: number | null): Promise<void> {
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${MAC_LABEL}.plist`);
  await exec('launchctl', ['unload', plistPath]).catch(() => undefined);
  if (nextRunAt === null) {
    await rm(plistPath, { force: true }).catch(() => undefined);
    return;
  }
  const { command, args } = launchCommand();
  const p = localParts(nextRunAt);
  const programArgs = [command, ...args].map((a) => `    <string>${escapeXml(a)}</string>`).join('\n');
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${MAC_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${programArgs}
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Year</key><integer>${p.year}</integer>
    <key>Month</key><integer>${p.month}</integer>
    <key>Day</key><integer>${p.day}</integer>
    <key>Hour</key><integer>${p.hour}</integer>
    <key>Minute</key><integer>${p.minute}</integer>
  </dict>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
`;
  await mkdir(dirname(plistPath), { recursive: true });
  await writeFile(plistPath, plist, 'utf8');
  await exec('launchctl', ['load', plistPath]);
}

function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

async function syncCron(nextRunAt: number | null): Promise<void> {
  const existing = await exec('crontab', ['-l']).then(
    (r) => r.stdout,
    () => '',
  );
  const kept = existing
    .split('\n')
    .filter((line) => line.trim() && !line.includes(CRON_TAG))
    .join('\n');
  let next = kept ? `${kept}\n` : '';
  if (nextRunAt !== null) {
    const { command, args } = launchCommand();
    const p = localParts(nextRunAt);
    // One-shot: matches only that exact minute/hour/day/month, any weekday.
    next += `${p.minute} ${p.hour} ${p.day} ${p.month} * ${[command, ...args].map(shellQuote).join(' ')} ${CRON_TAG}\n`;
  }
  const dir = await mkdtemp(join(tmpdir(), 'cellar-wake-'));
  try {
    const cronPath = join(dir, 'crontab');
    await writeFile(cronPath, next, 'utf8');
    await exec('crontab', [cronPath]);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Registers (nextRunAt set) or clears (null) the single OS wake job. Never throws. */
export async function syncWakeJob(nextRunAt: number | null): Promise<void> {
  // Tests (and anyone debugging scheduling locally) opt out so `npm test` never touches the real OS scheduler.
  if (process.env.CELLAR_NO_OS_SCHEDULE) return;
  try {
    if (process.platform === 'win32') await syncWindows(nextRunAt);
    else if (process.platform === 'darwin') await syncMac(nextRunAt);
    else await syncCron(nextRunAt);
  } catch (err) {
    log.warn('could not sync the OS-level wake job (scheduled tasks still run whenever Cellar is open)', err);
  }
}
