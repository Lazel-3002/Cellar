import { createContext, useContext, useState } from 'react';
import { Ban, ChevronRight, CircleAlert, FileCode, Globe, ShieldAlert, SquareTerminal } from 'lucide-react';
import { toast } from 'sonner';
import type { ApprovalAction, ToolPart } from '@shared/types/agent';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/form';
import { Spinner } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { describeTool, hostOf, lineDiff } from '@/lib/tasks';
import { cn } from '@/lib/utils';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function CodeBlock({ children, className, maxLines = 40 }: { children: string; className?: string; maxLines?: number }) {
  const [all, setAll] = useState(false);
  const lines = children.split('\n');
  const clipped = !all && lines.length > maxLines;
  return (
    <div className={cn('overflow-hidden rounded-lg border border-divider bg-code', className)}>
      <pre className="selectable max-h-[420px] overflow-auto px-3 py-2 font-mono text-[12px] leading-[1.55] whitespace-pre-wrap text-fg-2">{clipped ? lines.slice(0, maxLines).join('\n') : children}</pre>
      {clipped && (
        <button onClick={() => setAll(true)} className="w-full border-t border-divider py-1 text-[12px] text-muted-foreground hover:bg-hover hover:text-foreground">
          Show all {lines.length.toLocaleString('en-US')} lines
        </button>
      )}
    </div>
  );
}

export function DiffView({ before, after }: { before: string; after: string }) {
  const lines = lineDiff(before, after);
  return (
    <div className="selectable max-h-[420px] overflow-auto rounded-lg border border-divider bg-code py-1 font-mono text-[12px] leading-[1.55]">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn('flex px-3 whitespace-pre-wrap', line.type === 'add' && 'bg-success/12 text-foreground', line.type === 'del' && 'bg-danger/12 text-foreground', line.type === 'same' && 'text-muted-foreground')}
        >
          <span className="w-4 shrink-0 select-none">{line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}</span>
          <span className="min-w-0 flex-1">{line.text || ' '}</span>
        </div>
      ))}
    </div>
  );
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');

/** What the call is doing, shown when a step is expanded or awaiting approval. */
function CallDetails({ part }: { part: ToolPart }) {
  const args = part.args ?? {};
  switch (part.name) {
    case 'write_file':
      return <CodeBlock>{str(args.content)}</CodeBlock>;
    case 'edit_file':
      return <DiffView before={str(args.old_string)} after={str(args.new_string)} />;
    case 'run_command':
      return <CodeBlock>{str(args.command)}</CodeBlock>;
    case 'create_docx':
    case 'create_pdf':
      return <CodeBlock>{str(args.markdown)}</CodeBlock>;
    case 'create_xlsx':
    case 'create_pptx':
      return <CodeBlock maxLines={24}>{JSON.stringify(part.name === 'create_xlsx' ? args.sheets : args.slides, null, 2)}</CodeBlock>;
    case 'todo_write':
      return null;
    default: {
      const json = Object.keys(args).length ? JSON.stringify(args, null, 2) : part.argsText;
      return json && json !== '{}' ? <CodeBlock maxLines={16}>{json}</CodeBlock> : null;
    }
  }
}

function ResultBlock({ part, messageId }: { part: ToolPart; messageId: string }) {
  const [full, setFull] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const result = full ?? part.result ?? '';
  if (!result || part.status === 'denied') return null;
  return (
    <div>
      <div className="mb-1 text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">{part.status === 'error' ? 'Error' : 'Result'}</div>
      <CodeBlock className={cn(part.status === 'error' && 'border-danger/30')}>{result}</CodeBlock>
      {part.resultTruncated && full === null && (
        <button
          disabled={loading}
          className="mt-1 text-[12px] text-brand hover:underline disabled:opacity-50"
          onClick={async () => {
            setLoading(true);
            try {
              setFull(await invoke('tasks:toolResult', messageId, part.id));
            } catch (err) {
              toast.error(errorText(err));
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? 'Loading…' : 'Show full output'}
        </button>
      )}
    </div>
  );
}

function durationLabel(part: ToolPart): string {
  if (!part.startedAt || !part.finishedAt) return '';
  const ms = part.finishedAt - part.startedAt;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Code sessions let file steps open in the editor pane. */
export const OpenFileContext = createContext<((path: string) => void) | null>(null);

const FILE_TOOLS = new Set(['read_file', 'write_file', 'edit_file']);

export function ToolStep({ part, messageId, defaultOpen = false }: { part: ToolPart; messageId: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const onOpenFile = useContext(OpenFileContext);
  const info = describeTool(part);
  const running = part.status === 'running' || part.status === 'streaming';
  const failed = part.status === 'error';
  const denied = part.status === 'denied';
  const cancelled = part.status === 'cancelled';
  const verb = running ? info.active : failed ? info.failed : denied ? 'Denied:' : cancelled ? 'Not run:' : info.done;
  const Icon = info.icon;
  return (
    <div data-testid="tool-step" data-tool={part.name} data-status={part.status} className="font-sans">
      <button onClick={() => setOpen((o) => !o)} className="group flex w-full min-w-0 items-center gap-2.5 rounded-md py-1 text-left text-[13.5px]">
        <span className={cn('flex size-5 shrink-0 items-center justify-center text-muted-foreground', failed && 'text-danger', denied && 'text-warning')}>
          {running ? <Spinner className="size-3.5" /> : failed ? <CircleAlert className="size-3.5" /> : denied || cancelled ? <Ban className="size-3.5" /> : <Icon className="size-3.5" strokeWidth={1.9} />}
        </span>
        <span className={cn('min-w-0 truncate text-fg-2 group-hover:text-foreground', running && 'shimmer', (denied || cancelled) && 'text-muted-foreground')}>
          {verb}
          {info.target && (
            <>
              {' '}
              <span className="rounded bg-muted px-1 py-px font-mono text-[12px] text-foreground">{info.target}</span>
            </>
          )}
          {running ? '…' : ''}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-[11.5px] text-muted-foreground tabular-nums">
          {durationLabel(part)}
          <ChevronRight className={cn('size-3.5 opacity-0 transition group-hover:opacity-100', open && 'rotate-90 opacity-100')} />
        </span>
      </button>
      {open && (
        <div className="mt-1 mb-2 ml-[30px] space-y-2 animate-fade-in">
          {onOpenFile && FILE_TOOLS.has(part.name) && str(part.args?.path) && part.status !== 'denied' && (
            <button className="flex items-center gap-1.5 text-[12.5px] text-brand hover:underline" onClick={() => onOpenFile(str(part.args?.path))}>
              <FileCode className="size-3.5" /> Open {str(part.args?.path)} in the editor
            </button>
          )}
          {part.name === 'web_fetch' && str(part.args?.url) && (
            <button className="flex items-center gap-1.5 text-[12.5px] text-brand hover:underline" onClick={() => void invoke('system:openExternal', str(part.args?.url))}>
              <Globe className="size-3.5" /> {str(part.args?.url)}
            </button>
          )}
          <CallDetails part={part} />
          {part.feedback && <div className="text-[12.5px] text-muted-foreground">Your note: “{part.feedback}”</div>}
          <ResultBlock part={part} messageId={messageId} />
        </div>
      )}
    </div>
  );
}

export function ApprovalCard({ part, messageId }: { part: ToolPart; messageId: string }) {
  const approval = part.approval!;
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (action: ApprovalAction, feedback?: string) => {
    setBusy(true);
    try {
      await invoke('tasks:approve', messageId, part.id, { action, feedback });
    } catch (err) {
      toast.error(errorText(err));
      setBusy(false);
    }
  };
  const allowAllLabel =
    approval.kind === 'command' ? 'Always allow commands' : approval.kind === 'web' ? `Always allow ${approval.url ? hostOf(approval.url) : 'this site'}` : 'Allow all edits';
  const heading =
    approval.kind === 'command'
      ? 'Cellar wants to run a command'
      : approval.kind === 'web'
        ? 'Cellar wants to open a page it was not given'
        : approval.kind === 'edit'
          ? `Cellar wants to edit ${approval.path}`
          : approval.exists
            ? `Cellar wants to replace ${approval.path}`
            : `Cellar wants to create ${approval.path}`;
  return (
    <div data-testid="approval-card" className="my-2 overflow-hidden rounded-xl border border-brand/45 bg-card font-sans shadow-[0_2px_16px_rgba(0,0,0,0.12)] animate-fade-in">
      <div className="flex items-center gap-2.5 border-b border-divider px-4 py-2.5">
        {approval.kind === 'command' ? <SquareTerminal className="size-4 text-brand" /> : <ShieldAlert className="size-4 text-brand" />}
        <span className="text-[14px] font-medium text-foreground">{heading}</span>
      </div>
      <div className="space-y-2 px-4 py-3">
        {approval.kind === 'command' && approval.path && <div className="text-[12px] text-muted-foreground">In {approval.path}</div>}
        {approval.kind === 'web' && approval.url && <div className="font-mono text-[12.5px] break-all text-fg-2">{approval.url}</div>}
        {approval.diff ? <DiffView before={approval.diff.oldText} after={approval.diff.newText} /> : approval.preview ? <CodeBlock maxLines={24}>{approval.preview}</CodeBlock> : null}
        {denying && (
          <Textarea autoFocus rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: tell Cellar what to do instead" className="text-[13px]" />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-divider px-4 py-2.5">
        {denying ? (
          <>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void decide('deny', note)}>
              Deny
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDenying(false)}>
              Back
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="primary" data-testid="approve" disabled={busy} onClick={() => void decide('allow')}>
              Allow
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide('allow-all')}>
              {allowAllLabel}
            </Button>
            <Button size="sm" variant="ghost" data-testid="deny" disabled={busy} onClick={() => setDenying(true)} className="ml-auto">
              Deny…
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
