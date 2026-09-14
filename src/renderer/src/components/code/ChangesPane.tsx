import { useEffect, useRef, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FileCode, FileDiff as FileDiffIcon, FolderOpen, GitCommitHorizontal, GitMerge, RefreshCw, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ChangedFile, ChangeStatus } from '@shared/types/code';
import { Button, IconButton } from '@/components/ui/button';
import { Input, Segmented } from '@/components/ui/form';
import { EmptyState, Spinner, Tip } from '@/components/ui/misc';
import { invoke, onEvent } from '@/lib/ipc';
import { useConversation } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useCodeUi } from '@/stores/code';
import { DiffEditor } from './MonacoEditor';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const num = (n: number) => n.toLocaleString('en-US');

const STATUS: Record<ChangeStatus, { letter: string; label: string; className: string }> = {
  added: { letter: 'A', label: 'Added', className: 'bg-success/15 text-success' },
  modified: { letter: 'M', label: 'Modified', className: 'bg-warning/15 text-warning' },
  deleted: { letter: 'D', label: 'Deleted', className: 'bg-danger/15 text-danger' },
  renamed: { letter: 'R', label: 'Renamed', className: 'bg-brand/15 text-brand' },
};

function splitPath(path: string): { name: string; dir: string } {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? { name: path, dir: '' } : { name: path.slice(slash + 1), dir: path.slice(0, slash) };
}

function Counts({ additions, deletions, className }: { additions: number; deletions: number; className?: string }) {
  return (
    <span className={cn('shrink-0 text-[12px] whitespace-nowrap tabular-nums', className)}>
      <span className="text-success">+{num(additions)}</span> <span className="text-danger">−{num(deletions)}</span>
    </span>
  );
}

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function ChangesPane({ conversationId, running }: { conversationId: string; running: boolean }) {
  const qc = useQueryClient();
  const { data: detail } = useConversation(conversationId);
  const code = detail?.conversation.task?.code;
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useWidth(rootRef);
  const [selected, setSelected] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const [view, setView] = useState<'split' | 'unified'>('split');
  const [message, setMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [mergeStep, setMergeStep] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<string | null>(null);

  const changes = useQuery({
    queryKey: ['code-changes', conversationId],
    queryFn: () => invoke('code:changes', conversationId),
    staleTime: 0,
    refetchInterval: running ? 3000 : false,
  });
  const files = changes.data?.files ?? [];
  const selectedFile = files.find((f) => f.path === selected) ?? null;

  const diff = useQuery({
    queryKey: ['code-diff', conversationId, selectedFile?.path ?? ''],
    queryFn: () => invoke('code:fileDiff', conversationId, selectedFile!.path),
    enabled: !!selectedFile && !selectedFile.binary,
    staleTime: 0,
    refetchInterval: running ? 3000 : false,
    placeholderData: keepPreviousData,
  });

  /** The diff of the selected file (not a previous file's diff kept while the new one loads). */
  const currentDiff = diff.data && diff.data.path === selectedFile?.path ? diff.data : undefined;

  const reveal = (path: string) => void invoke('tasks:revealFile', conversationId, path).catch((err) => toast.error(errorText(err)));

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['code-changes', conversationId] });
    void qc.invalidateQueries({ queryKey: ['code-diff', conversationId] });
  };

  useEffect(
    () =>
      onEvent('chat:changed', ({ conversationId: id }) => {
        if (id !== conversationId) return;
        void qc.invalidateQueries({ queryKey: ['code-changes', conversationId] });
        void qc.invalidateQueries({ queryKey: ['code-diff', conversationId] });
      }),
    [conversationId, qc],
  );

  // Keep a file selected: the first one, or the next one after the selection disappears.
  useEffect(() => {
    if (!changes.data) return;
    if (selected && files.some((f) => f.path === selected)) return;
    setSelected(files[0]?.path ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes.data]);

  const set = changes.data;
  const git = set?.source === 'git';
  const canSplit = width >= 700;

  const commit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setCommitting(true);
    try {
      const result = await invoke('code:commit', conversationId, message);
      setMessage('');
      toast.success(`Committed ${result.commit}`, { description: result.summary });
      refresh();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setCommitting(false);
    }
  };

  const merge = async () => {
    setMergeStep('busy');
    try {
      const result = await invoke('code:merge', conversationId);
      if (result.merged) toast.success(result.message);
      else toast.warning(result.message);
      refresh();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setMergeStep('idle');
    }
  };

  const discard = async (path: string) => {
    setConfirmDiscard(null);
    setDiscarding(path);
    try {
      await invoke('code:discardFile', conversationId, path);
      refresh();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setDiscarding(null);
    }
  };

  const subtitle = !set
    ? ''
    : git
      ? [`since ${set.base}`, set.commits > 0 ? `${num(set.commits)} commit${set.commits === 1 ? '' : 's'}${code?.branch ? ` on ${code.branch}` : ''}` : code?.branch ? `on ${code.branch}` : '']
          .filter(Boolean)
          .join(' · ')
      : "not a git repository — tracking Cellar's edits";

  return (
    <div ref={rootRef} data-testid="changes-pane" className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 space-y-2 border-b border-divider px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[13.5px] font-medium text-foreground">
                {set ? `${num(files.length)} file${files.length === 1 ? '' : 's'} changed` : 'Changes'}
              </span>
              {set && files.length > 0 && <Counts additions={set.additions} deletions={set.deletions} />}
            </div>
            {subtitle && <div className="truncate text-[12px] text-muted-foreground" title={subtitle}>{subtitle}</div>}
          </div>
          <IconButton label="Refresh" onClick={refresh}>
            <RefreshCw className={cn('size-3.5', changes.isFetching && 'animate-spin')} />
          </IconButton>
        </div>

        {git && (
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex min-w-[220px] flex-1 items-center gap-1.5" onSubmit={commit}>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={set.uncommitted > 0 ? 'Commit message' : 'Nothing to commit'}
                disabled={running || committing || set.uncommitted === 0}
                className="h-7 text-[13px]"
                aria-label="Commit message"
              />
              <Button type="submit" size="sm" variant="primary" disabled={running || committing || set.uncommitted === 0 || !message.trim()}>
                {committing ? <Spinner className="size-3.5 text-background" /> : <GitCommitHorizontal className="size-3.5" />}
                Commit
              </Button>
            </form>
            {code?.worktree && code.baseBranch && code.branch && (
              <div className="flex items-center gap-1.5">
                {mergeStep === 'confirm' ? (
                  <>
                    <span className="text-[12.5px] text-fg-2">
                      Merge into <span className="font-medium text-foreground">{code.baseBranch}</span>?
                    </span>
                    <Button size="sm" variant="brand" onClick={() => void merge()}>
                      Merge
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setMergeStep('idle')}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Tip label={`Merge ${code.branch} into ${code.baseBranch} in ${code.repoName}`}>
                    <Button size="sm" variant="outline" disabled={running || mergeStep === 'busy'} onClick={() => setMergeStep('confirm')} className="max-w-60">
                      {mergeStep === 'busy' ? <Spinner className="size-3.5" /> : <GitMerge className="size-3.5" />}
                      <span className="truncate">Merge into {code.baseBranch}</span>
                    </Button>
                  </Tip>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      {changes.isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : changes.isError ? (
        <EmptyState
          title="Couldn't load the changes"
          description={errorText(changes.error)}
          action={
            <Button size="sm" variant="outline" onClick={refresh}>
              Try again
            </Button>
          }
        />
      ) : files.length === 0 ? (
        <EmptyState
          icon={<FileDiffIcon className="size-5" />}
          title="No changes yet"
          description={git ? `Files that change in this session show up here, compared with ${set?.base}.` : 'Files Cellar changes in this folder show up here.'}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={cn('flex min-h-0 shrink-0 flex-col border-b border-divider', listOpen && 'max-h-[42%]')}>
            <button onClick={() => setListOpen((o) => !o)} className="flex h-7 shrink-0 items-center gap-1.5 px-3 text-left text-[12px] font-medium text-muted-foreground hover:text-foreground">
              <ChevronRight className={cn('size-3.5 transition-transform', listOpen && 'rotate-90')} />
              Files
              <span className="tabular-nums">{num(files.length)}</span>
              {!listOpen && selectedFile && <span className="ml-1 min-w-0 truncate font-normal">· {selectedFile.path}</span>}
            </button>
            {listOpen && (
              <ul className="min-h-0 overflow-y-auto pb-1" role="listbox" aria-label="Changed files">
                {files.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    selected={file.path === selected}
                    running={running}
                    confirming={confirmDiscard === file.path}
                    discarding={discarding === file.path}
                    onSelect={() => setSelected(file.path)}
                    onOpen={() => useCodeUi.getState().openFile(conversationId, file.path)}
                    onReveal={() => reveal(file.status === 'deleted' ? splitPath(file.path).dir || '.' : file.path)}
                    onDiscard={() => setConfirmDiscard(file.path)}
                    onConfirmDiscard={() => void discard(file.path)}
                    onCancelDiscard={() => setConfirmDiscard(null)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {selectedFile && (
              <div className="flex h-8 shrink-0 items-center gap-2 border-b border-divider px-3">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-2" title={selectedFile.path}>
                  {selectedFile.oldPath ? `${selectedFile.oldPath} → ${selectedFile.path}` : selectedFile.path}
                </span>
                {(diff.isFetching || diff.isPlaceholderData) && <Spinner className="size-3.5" />}
                {!selectedFile.binary && <Counts additions={selectedFile.additions} deletions={selectedFile.deletions} />}
                {canSplit && !selectedFile.binary && (
                  <Segmented
                    size="sm"
                    value={view}
                    onChange={setView}
                    options={[
                      { value: 'unified', label: 'Unified' },
                      { value: 'split', label: 'Split' },
                    ]}
                  />
                )}
              </div>
            )}
            <div className="relative min-h-0 flex-1">
              {!selectedFile ? (
                <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">Select a file to see its changes.</div>
              ) : selectedFile.binary || currentDiff?.binary ? (
                <DiffMessage text="This is a binary file, so there is no text diff to show." onReveal={selectedFile.status === 'deleted' ? undefined : () => reveal(selectedFile.path)} />
              ) : diff.isError ? (
                <DiffMessage text={errorText(diff.error)} />
              ) : currentDiff?.tooLarge ? (
                <DiffMessage text="This file is too large to show a diff (over 2 MB)." onReveal={selectedFile.status === 'deleted' ? undefined : () => reveal(selectedFile.path)} />
              ) : diff.data && !diff.data.binary && !diff.data.tooLarge ? (
                <DiffEditor original={diff.data.oldText} modified={diff.data.newText} path={diff.data.path} sideBySide={view === 'split'} />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Spinner />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DiffMessage({ text, onReveal }: { text: string; onReveal?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{text}</p>
      {onReveal && (
        <Button size="sm" variant="outline" onClick={onReveal}>
          <FolderOpen className="size-3.5" />
          Show in folder
        </Button>
      )}
    </div>
  );
}

interface FileRowProps {
  file: ChangedFile;
  selected: boolean;
  running: boolean;
  confirming: boolean;
  discarding: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onReveal: () => void;
  onDiscard: () => void;
  onConfirmDiscard: () => void;
  onCancelDiscard: () => void;
}

function FileRow({ file, selected, running, confirming, discarding, onSelect, onOpen, onReveal, onDiscard, onConfirmDiscard, onCancelDiscard }: FileRowProps) {
  const { name, dir } = splitPath(file.path);
  const status = STATUS[file.status];
  const action = 'flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-track hover:text-foreground disabled:pointer-events-none disabled:opacity-40';
  return (
    <li
      role="option"
      aria-selected={selected}
      data-testid="changed-file"
      data-path={file.path}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn('group flex h-8 cursor-default items-center gap-2 px-3 outline-none focus-visible:bg-hover', selected ? 'bg-selected' : 'hover:bg-hover')}
    >
      <Tip label={file.oldPath ? `${status.label} from ${file.oldPath}` : status.label} side="left">
        <span className={cn('flex size-4 shrink-0 items-center justify-center rounded font-mono text-[10.5px] font-semibold', status.className)}>{status.letter}</span>
      </Tip>
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5" title={file.path}>
        <span className={cn('max-w-full shrink-0 truncate text-[13px] text-foreground', file.status === 'deleted' && 'text-muted-foreground line-through decoration-faint')}>{name}</span>
        {dir && <span className="min-w-0 truncate text-[11.5px] text-muted-foreground">{dir}</span>}
      </span>

      {confirming ? (
        <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <span className="text-[12px] text-danger">Discard?</span>
          <Button size="sm" variant="danger" className="h-6 px-2 text-[12px]" onClick={onConfirmDiscard} autoFocus>
            Discard
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[12px]" onClick={onCancelDiscard}>
            Cancel
          </Button>
        </span>
      ) : discarding ? (
        <Spinner className="size-3.5" />
      ) : (
        <>
          {file.binary ? (
            <span className={cn('shrink-0 text-[11.5px] text-muted-foreground', selected ? 'hidden' : 'group-focus-within:hidden group-hover:hidden')}>binary</span>
          ) : (
            <Counts additions={file.additions} deletions={file.deletions} className={selected ? 'hidden' : 'group-focus-within:hidden group-hover:hidden'} />
          )}
          <span className={cn('shrink-0 items-center', selected ? 'flex' : 'hidden group-focus-within:flex group-hover:flex')} onClick={(e) => e.stopPropagation()}>
            <Tip label="Open in editor">
              <button className={action} onClick={onOpen} disabled={file.status === 'deleted'} aria-label="Open in editor">
                <FileCode className="size-3.5" />
              </button>
            </Tip>
            <Tip label="Show in folder">
              <button className={action} onClick={onReveal} aria-label="Show in folder">
                <FolderOpen className="size-3.5" />
              </button>
            </Tip>
            <Tip label={running ? 'Wait for Cellar to finish' : 'Discard changes'}>
              <span>
                <button className={cn(action, 'hover:text-danger')} onClick={onDiscard} disabled={running} aria-label="Discard changes">
                  <Undo2 className="size-3.5" />
                </button>
              </span>
            </Tip>
          </span>
        </>
      )}
    </li>
  );
}
