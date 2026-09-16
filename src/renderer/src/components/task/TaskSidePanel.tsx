import type { ReactNode } from 'react';
import { CircleCheck, Circle, CircleDot, Copy, Download, ExternalLink, FolderOpen, Globe, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { TaskState } from '@shared/types/agent';
import { Badge, Tip } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { fileIcon, hostOf } from '@/lib/tasks';
import { cn, copyText, formatBytes } from '@/lib/utils';

function Section({ title, count, children }: { title: string; count?: string; children: ReactNode }) {
  return (
    <section className="border-b border-divider px-4 py-4 last:border-b-0">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[12.5px] font-medium text-muted-foreground">{title}</h3>
        {count && <span className="text-[12px] text-muted-foreground tabular-nums">{count}</span>}
      </div>
      {children}
    </section>
  );
}

const run = (p: Promise<unknown>) => void p.catch((err) => toast.error(err instanceof Error ? err.message : String(err)));

const SOURCE_LABELS: Record<string, string> = { duckduckgo: 'DuckDuckGo', brave: 'Brave Search', searxng: 'SearXNG' };
const searchLabel = (provider?: string) => (provider ? (SOURCE_LABELS[provider] ?? provider) : 'Search result');

export function TaskSidePanel({ conversationId, task, running }: { conversationId: string; task: TaskState; running: boolean }) {
  const done = task.todos.filter((t) => t.status === 'completed').length;
  const files = [...task.files].sort((a, b) => b.updatedAt - a.updatedAt);
  const sources = task.sources.filter((s) => s.kind === 'fetch').concat(task.sources.filter((s) => s.kind === 'search' && !task.sources.some((f) => f.kind === 'fetch' && f.url === s.url)));
  return (
    <aside data-testid="task-panel" className="flex h-full w-[320px] shrink-0 flex-col border-l border-divider bg-sidebar pt-9">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Progress" count={task.todos.length ? `${done} of ${task.todos.length}` : undefined}>
          {task.todos.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {running ? 'The plan appears here once Cellar has one.' : 'No plan was needed for this task.'}
              {task.steps > 0 && <span className="block pt-1 text-[12px]">{task.steps} model step{task.steps === 1 ? '' : 's'} in the latest turn</span>}
            </p>
          ) : (
            <ol className="space-y-2">
              {task.todos.map((todo, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-snug">
                  {todo.status === 'completed' ? (
                    <CircleCheck className="mt-px size-4 shrink-0 text-success" />
                  ) : todo.status === 'in_progress' ? (
                    <CircleDot className={cn('mt-px size-4 shrink-0 text-brand', running && 'animate-pulse')} />
                  ) : (
                    <Circle className="mt-px size-4 shrink-0 text-faint" />
                  )}
                  <span className={cn('text-fg-2', todo.status === 'completed' && 'text-muted-foreground line-through decoration-faint', todo.status === 'in_progress' && 'text-foreground')}>{todo.content}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>
  
        <Section title={task.folder ? 'Working folder' : 'Task folder'}>
          <button className="group flex w-full items-center gap-2.5 rounded-lg border border-divider bg-background px-2.5 py-2 text-left hover:border-composer-border" onClick={() => run(invoke('tasks:openFile', conversationId, '.'))}>
            <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-foreground">{task.workDir.split(/[\\/]/).pop()}</span>
              <span className="block truncate text-[11.5px] text-muted-foreground" title={task.workDir}>
                {task.workDir}
              </span>
            </span>
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
          </button>
          {!task.folder && <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">No folder was chosen, so Cellar made this one for the files the task creates.</p>}
        </Section>
  
        <Section title="Files" count={files.length ? String(files.length) : undefined}>
          {files.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Files Cellar creates or changes show up here.</p>
          ) : (
            <ul className="space-y-1">
              {files.map((file) => {
                const Icon = fileIcon(file.path);
                return (
                  <li key={file.path} data-testid="task-file" className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-hover">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <button className="min-w-0 flex-1 text-left" onClick={() => run(invoke('tasks:openFile', conversationId, file.path))} title="Open">
                      <span className="block truncate text-[13px] text-foreground">{file.path.split('/').pop()}</span>
                      <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                        <Badge tone={file.action === 'created' ? 'success' : 'default'} className="h-4 px-1 text-[10px]">
                          {file.action === 'created' ? 'New' : 'Edited'}
                        </Badge>
                        <span className="truncate">{file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''}</span>
                        {file.bytes !== undefined && <span className="shrink-0">{formatBytes(file.bytes)}</span>}
                      </span>
                    </button>
                    <span className="flex shrink-0 opacity-0 group-hover:opacity-100">
                      <Tip label="Show in folder">
                        <button className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground" onClick={() => run(invoke('tasks:revealFile', conversationId, file.path))}>
                          <FolderOpen className="size-3.5" />
                        </button>
                      </Tip>
                      <Tip label="Save a copy…">
                        <button
                          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                          onClick={() => run(invoke('tasks:saveFileAs', conversationId, file.path).then((saved) => saved && toast.success('Saved', { description: saved })))}
                        >
                          <Download className="size-3.5" />
                        </button>
                      </Tip>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
  
        {sources.length > 0 && (
          <Section title="Sources" count={String(sources.length)}>
            <ul className="space-y-1">
              {sources.slice(0, 40).map((source) => (
                <li key={`${source.kind}:${source.url}`} className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-hover">
                  {source.kind === 'fetch' ? <Globe className="size-4 shrink-0 text-muted-foreground" /> : <Search className="size-4 shrink-0 text-faint" />}
                  <button className="min-w-0 flex-1 text-left" onClick={() => run(invoke('system:openExternal', source.url))} title={source.url}>
                    <span className={cn('block truncate text-[13px]', source.kind === 'fetch' ? 'text-foreground' : 'text-fg-2')}>{source.title || hostOf(source.url)}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{source.kind === 'search' ? `${searchLabel(source.provider)} · ${hostOf(source.url)}` : hostOf(source.url)}</span>
                  </button>
                  <Tip label="Copy link">
                    <button className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground" onClick={() => run(copyText(source.url))}>
                      <Copy className="size-3.5" />
                    </button>
                  </Tip>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </aside>
  );
}
