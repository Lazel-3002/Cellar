import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { CircleAlert, CircleCheck, Clock, Ellipsis, FolderOpen, LoaderCircle, MessageSquare, Pencil, Play, Plus, Trash, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import type { PermissionMode } from '@shared/types/agent';
import type { ModelRef } from '@shared/types/models';
import type { ScheduledRun, ScheduledTask, ScheduledTaskInput } from '@shared/types/scheduled';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Segmented, Select, Switch, Textarea } from '@/components/ui/form';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Badge, EmptyState, Spinner } from '@/components/ui/misc';
import { isChatCapable } from '@/lib/hooks';
import { invoke } from '@/lib/ipc';
import { useModels, useProjects, useScheduled, useScheduledRuns, useSettings } from '@/lib/queries';
import { conversationRoute } from '@/lib/tasks';
import { cn, relativeTime } from '@/lib/utils';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Frequency = 'hourly' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function buildCron(frequency: Frequency, time: string, day: number, minute: number, custom: string): string {
  const [h, m] = time.split(':').map((n) => Number(n) || 0);
  switch (frequency) {
    case 'hourly':
      return `${minute} * * * *`;
    case 'daily':
      return `${m} ${h} * * *`;
    case 'weekdays':
      return `${m} ${h} * * 1-5`;
    case 'weekly':
      return `${m} ${h} * * ${day}`;
    case 'monthly':
      return `${m} ${h} ${Math.max(1, Math.min(28, day))} * *`;
    default:
      return custom;
  }
}

/** Recognize the patterns the editor makes, so editing a task shows its schedule again. */
function parseSchedule(cron: string): { frequency: Frequency; time: string; day: number; minute: number } {
  const [minute, hour, dom, month, dow] = cron.trim().split(/\s+/);
  const n = (v: string) => /^\d+$/.test(v ?? '');
  const time = n(minute) && n(hour) ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` : '09:00';
  if (n(minute) && hour === '*' && dom === '*' && month === '*' && dow === '*') return { frequency: 'hourly', time, day: 1, minute: Number(minute) };
  if (n(minute) && n(hour) && dom === '*' && month === '*') {
    if (dow === '*') return { frequency: 'daily', time, day: 1, minute: 0 };
    if (dow === '1-5') return { frequency: 'weekdays', time, day: 1, minute: 0 };
    if (/^[0-6]$/.test(dow)) return { frequency: 'weekly', time, day: Number(dow), minute: 0 };
  }
  if (n(minute) && n(hour) && n(dom) && month === '*' && dow === '*') return { frequency: 'monthly', time, day: Number(dom), minute: 0 };
  return { frequency: 'custom', time, day: 1, minute: 0 };
}

const formatWhen = (ms: number) => new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

function TaskDialog({ task, open, onOpenChange }: { task: ScheduledTask | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: settings } = useSettings();
  const { data: models = [] } = useModels();
  const { data: projects = [] } = useProjects();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState<'chat' | 'task'>('chat');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [time, setTime] = useState('09:00');
  const [day, setDay] = useState(1);
  const [minute, setMinute] = useState(0);
  const [custom, setCustom] = useState('0 9 * * *');
  const [model, setModel] = useState<string>('default');
  const [folder, setFolder] = useState<string | null>(null);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('auto-edits');
  const [allowCommands, setAllowCommands] = useState(false);
  const [projectId, setProjectId] = useState<string>('none');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const schedule = parseSchedule(task?.cron ?? '0 9 * * *');
    setName(task?.name ?? '');
    setPrompt(task?.prompt ?? '');
    setKind(task?.kind ?? 'chat');
    setFrequency(schedule.frequency);
    setTime(schedule.time);
    setDay(schedule.day);
    setMinute(schedule.minute);
    setCustom(task?.cron ?? '0 9 * * *');
    setModel(task?.model ? `${task.model.providerId}::${task.model.modelId}` : 'default');
    setFolder(task?.folder ?? null);
    setPermissionMode(task?.permissionMode ?? 'auto-edits');
    setAllowCommands(task?.allowCommands ?? false);
    setProjectId(task?.projectId ?? 'none');
  }, [open, task]);

  const cron = buildCron(frequency, time, day, minute, custom);
  const preview = useQuery({ queryKey: ['cron-preview', cron], queryFn: () => invoke('scheduled:preview', cron), enabled: open });
  const chatModels = models.filter(isChatCapable);

  const save = async () => {
    const [providerId, ...rest] = model.split('::');
    const ref: ModelRef | null = model === 'default' ? null : { providerId, modelId: rest.join('::') };
    const input: ScheduledTaskInput = { id: task?.id, name, prompt, kind, cron, model: ref, folder: kind === 'task' ? folder : null, permissionMode, allowCommands, projectId: projectId === 'none' ? null : projectId, enabled: task?.enabled ?? true };
    setSaving(true);
    try {
      await invoke('scheduled:save', input);
      toast.success(task ? 'Scheduled task saved' : 'Scheduled task created');
      onOpenChange(false);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={task ? `Edit ${task.name}` : 'New scheduled task'}
      description="Runs with your local models while Cellar is open or in the notification area."
      className="w-[min(640px,calc(100vw-40px))]"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving || !name.trim() || !prompt.trim() || !preview.data?.valid} onClick={() => void save()} data-testid="save-scheduled">
            {saving && <Spinner className="size-3.5" />} Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-[12.5px] text-muted-foreground">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning briefing" data-testid="scheduled-name" />
        </label>
        <label className="block">
          <span className="text-[12.5px] text-muted-foreground">What should it do?</span>
          <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Search the web for today's top AI news and summarize the five most important stories with links." data-testid="scheduled-prompt" />
        </label>
        <div>
          <span className="mb-1 block text-[12.5px] text-muted-foreground">Run as</span>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'chat', label: 'Chat' },
              { value: 'task', label: 'Cowork task' },
            ]}
          />
        </div>
        {kind === 'task' && (
          <div className="space-y-2 rounded-lg border border-divider p-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{folder ?? 'A new folder for each run'}</span>
              <Button size="sm" variant="outline" onClick={() => void invoke('system:pickDirectory', 'Folder the task works in').then((dir) => dir && setFolder(dir))}>
                Choose folder
              </Button>
              {folder && (
                <Button size="sm" variant="ghost" onClick={() => setFolder(null)}>
                  Clear
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={permissionMode}
                onChange={setPermissionMode}
                options={[
                  { value: 'auto-edits', label: 'Change files without asking' },
                  { value: 'ask', label: 'Ask before changes' },
                  { value: 'plan', label: 'Plan only' },
                ]}
              />
              <label className="flex items-center gap-2 text-[13px]">
                <Switch checked={allowCommands} onCheckedChange={setAllowCommands} /> Run commands without asking
              </label>
            </div>
            {permissionMode === 'ask' && <p className="text-[12px] text-warning">Runs will wait for your approval before each change, even when you are away.</p>}
          </div>
        )}
        <div>
          <span className="mb-1 block text-[12.5px] text-muted-foreground">Schedule</span>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={frequency}
              onChange={setFrequency}
              options={[
                { value: 'hourly', label: 'Every hour' },
                { value: 'daily', label: 'Every day' },
                { value: 'weekdays', label: 'Every weekday' },
                { value: 'weekly', label: 'Every week' },
                { value: 'monthly', label: 'Every month' },
                { value: 'custom', label: 'Custom (cron)' },
              ]}
            />
            {frequency === 'hourly' && (
              <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                at minute
                <Input type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Math.max(0, Math.min(59, Number(e.target.value) || 0)))} className="w-16" />
              </label>
            )}
            {frequency === 'weekly' && <Select value={String(day)} onChange={(v) => setDay(Number(v))} options={DAYS.map((d, i) => ({ value: String(i), label: d }))} />}
            {frequency === 'monthly' && (
              <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                on day
                <Input type="number" min={1} max={28} value={day} onChange={(e) => setDay(Math.max(1, Math.min(28, Number(e.target.value) || 1)))} className="w-16" />
              </label>
            )}
            {['daily', 'weekdays', 'weekly', 'monthly'].includes(frequency) && <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />}
            {frequency === 'custom' && <Input value={custom} onChange={(e) => setCustom(e.target.value)} className="w-44 font-mono" placeholder="0 9 * * 1-5" />}
          </div>
          <div className={cn('mt-1.5 text-[12px]', preview.data?.valid === false ? 'text-danger' : 'text-muted-foreground')}>
            {preview.data?.valid ? `${preview.data.description}. Next: ${preview.data.next.map(formatWhen).join(' · ')}` : preview.data?.error}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="block min-w-60 flex-1">
            <span className="mb-1 block text-[12.5px] text-muted-foreground">Model</span>
            <Select
              value={model}
              onChange={setModel}
              className="w-full"
              options={[
                { value: 'default', label: settings?.defaultModel ? 'Default model' : 'Default (first available)' },
                ...chatModels.map((m) => ({ value: `${m.ref.providerId}::${m.ref.modelId}`, label: `${m.displayName} · ${m.providerName}${kind === 'task' && !m.capabilities.tools ? ' (no tools)' : ''}` })),
              ]}
            />
          </label>
          <label className="block min-w-44">
            <span className="mb-1 block text-[12.5px] text-muted-foreground">Project</span>
            <Select value={projectId} onChange={setProjectId} className="w-full" options={[{ value: 'none', label: 'No project' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
          </label>
        </div>
      </div>
    </Dialog>
  );
}

function RunStatus({ run }: { run: ScheduledRun }) {
  switch (run.status) {
    case 'running':
    case 'waiting':
      return <LoaderCircle className="size-3.5 animate-spin text-brand" />;
    case 'done':
      return <CircleCheck className="size-3.5 text-success" />;
    case 'error':
      return <CircleAlert className="size-3.5 text-danger" />;
    default:
      return <Clock className="size-3.5 text-muted-foreground" />;
  }
}

function RunHistory({ taskId }: { taskId?: string }) {
  const { data: runs = [] } = useScheduledRuns(taskId);
  if (runs.length === 0) return <div className="px-4 py-3 text-[13px] text-muted-foreground">No runs yet.</div>;
  return (
    <div className="divide-y divide-divider">
      {runs.slice(0, 30).map((run) => {
        const inner = (
          <>
            <RunStatus run={run} />
            <span className="min-w-0 flex-1 truncate text-[13px]">{taskId ? formatWhen(run.startedAt) : run.taskName}</span>
            {!taskId && <span className="shrink-0 text-[12px] text-muted-foreground">{formatWhen(run.startedAt)}</span>}
            {run.trigger !== 'schedule' && <Badge tone="outline">{run.trigger === 'manual' ? 'Run now' : 'Missed run'}</Badge>}
            {run.error && (
              <span className="max-w-60 truncate text-[12px] text-danger" title={run.error}>
                {run.error}
              </span>
            )}
          </>
        );
        return run.conversationId ? (
          <Link key={run.id} to={conversationRoute(run.kind)} params={{ conversationId: run.conversationId }} className="flex items-center gap-2.5 px-4 py-2 hover:bg-hover/50" data-testid="scheduled-run">
            {inner}
          </Link>
        ) : (
          <div key={run.id} className="flex items-center gap-2.5 px-4 py-2" data-testid="scheduled-run">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export function ScheduledPage() {
  const navigate = useNavigate();
  const { data: tasks = [], isLoading } = useScheduled();
  const { data: settings } = useSettings();
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [open, setOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | undefined>(undefined);
  const selected = useMemo(() => tasks.find((t) => t.id === historyFor), [tasks, historyFor]);

  const runNow = async (task: ScheduledTask) => {
    try {
      const { conversationId } = await invoke('scheduled:runNow', task.id);
      toast.success(`${task.name} started`, conversationId ? { action: { label: 'Open', onClick: () => void navigate({ to: conversationRoute(task.kind), params: { conversationId } }) } } : undefined);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <div className="h-full overflow-y-auto pt-9">
      <div className="mx-auto max-w-[860px] px-8 pt-8 pb-16">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[560px]">
            <h1 className="font-serif text-[30px]">Scheduled</h1>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
              Run prompts and Cowork tasks on a schedule with your local models: daily briefings, weekly reports, folder clean-ups. {settings && !settings.runInBackground && 'Turn on “Keep running in the notification area” in Settings → General so tasks also run when the window is closed.'}
            </p>
          </div>
          <Button
            variant="primary"
            data-testid="new-scheduled"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> New task
          </Button>
        </div>

        {isLoading ? (
          <div className="py-10">
            <Spinner />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState icon={<Clock className="size-5" />} title="No scheduled tasks" description="Create one to have a model check the news every morning, summarize a folder every Friday, or anything else you repeat." />
        ) : (
          <div className="mt-6 space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-divider bg-card px-4 py-3" data-testid="scheduled-row">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-selected text-muted-foreground">{task.kind === 'task' ? <Workflow className="size-4" /> : <MessageSquare className="size-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-medium">{task.name}</span>
                      <Badge tone="outline">{task.reminder ? 'Reminder' : task.kind === 'task' ? 'Cowork' : 'Chat'}</Badge>
                      {task.lastStatus === 'error' && <Badge tone="danger">Last run failed</Badge>}
                      {task.lastStatus === 'running' && <Badge tone="brand">Running</Badge>}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[12.5px] text-muted-foreground">{task.prompt}</p>
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      {task.oneShot ? (task.enabled ? 'Once' : 'Once · already fired') : <CronLabel cron={task.cron} />}
                      {task.enabled && task.nextRunAt ? ` · ${task.oneShot ? 'at' : 'next'} ${formatWhen(task.nextRunAt)}` : task.enabled || task.oneShot ? '' : ' · paused'}
                      {task.lastRunAt ? ` · last ran ${relativeTime(task.lastRunAt)}` : ''}
                    </div>
                  </div>
                  <Switch checked={task.enabled} onCheckedChange={(v) => void invoke('scheduled:setEnabled', task.id, v).catch((err) => toast.error(errorText(err)))} label={`Run ${task.name} on schedule`} />
                  <Button size="sm" variant="outline" onClick={() => void runNow(task)} data-testid="run-now">
                    <Play className="size-3.5" /> Run now
                  </Button>
                  <Menu>
                    <MenuTrigger asChild>
                      <button aria-label="Task options" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground">
                        <Ellipsis className="size-4" />
                      </button>
                    </MenuTrigger>
                    <MenuContent align="end">
                      {/* A reminder's schedule is a single instant, not a cron expression, so the editor has nothing to edit. */}
                      {!task.oneShot && (
                        <MenuItem
                          icon={<Pencil />}
                          onSelect={() => {
                            setEditing(task);
                            setOpen(true);
                          }}
                        >
                          Edit
                        </MenuItem>
                      )}
                      <MenuItem icon={<Clock />} onSelect={() => setHistoryFor(historyFor === task.id ? undefined : task.id)}>
                        {historyFor === task.id ? 'Hide history' : 'Run history'}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem icon={<Trash />} destructive onSelect={() => window.confirm(`Delete ${task.name}? Its past runs stay in your chats.`) && void invoke('scheduled:delete', task.id)}>
                        Delete
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
                {historyFor === task.id && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-divider">
                    <RunHistory taskId={task.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tasks.length > 0 && !selected && (
          <section className="mt-8">
            <h2 className="mb-2 text-[13px] font-medium text-muted-foreground">Recent runs</h2>
            <div className="overflow-hidden rounded-xl border border-divider bg-card">
              <RunHistory />
            </div>
          </section>
        )}
      </div>
      <TaskDialog task={editing} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function CronLabel({ cron }: { cron: string }) {
  const { data } = useQuery({ queryKey: ['cron-preview', cron], queryFn: () => invoke('scheduled:preview', cron), staleTime: 60_000 });
  return <>{data?.description ?? cron}</>;
}
