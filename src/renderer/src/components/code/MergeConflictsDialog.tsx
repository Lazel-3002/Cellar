import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Spinner } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { cn } from '@/lib/utils';
import { CodeEditor } from './MonacoEditor';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Shown while a worktree session's merge into its base branch is waiting to be resolved.
 * Conflicted files still have Git's own `<<<<<<<`/`=======`/`>>>>>>>` markers in them; the user
 * edits them away directly (same as resolving a conflict on the command line), then continues
 * or aborts the merge. This edits the repository checkout, not the session's own worktree.
 */
export function MergeConflictsDialog({ conversationId, conflicted, onDone }: { conversationId: string; conflicted: string[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(conflicted[0] ?? null);
  const [value, setValue] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'continue' | 'abort' | null>(null);
  const [resolved, setResolved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (selected === null && conflicted.length > 0) setSelected(conflicted[0]);
  }, [conflicted, selected]);

  const file = useQuery({
    queryKey: ['conflict-file', conversationId, selected],
    queryFn: () => invoke('code:conflictFile', conversationId, selected!),
    enabled: !!selected,
  });

  useEffect(() => {
    if (file.data && file.data.path === selected) {
      setValue(file.data.content);
      setDirty(false);
      setResolved((r) => ({ ...r, [file.data.path]: file.data.resolved }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.data]);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await invoke('code:writeConflictFile', conversationId, selected, value);
      const still = await invoke('code:conflictFile', conversationId, selected);
      setResolved((r) => ({ ...r, [selected]: still.resolved }));
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['conflict-file', conversationId, selected] });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const allResolved = conflicted.every((path) => resolved[path]);

  const finish = async (action: 'continue' | 'abort') => {
    setBusy(action);
    try {
      if (action === 'continue') {
        const result = await invoke('code:continueMerge', conversationId);
        toast.success(`Merged (${result.commit})`, { description: result.summary });
      } else {
        await invoke('code:abortMerge', conversationId);
        toast('Merge aborted. Nothing changed.');
      }
      onDone();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onDone();
      }}
      title="Resolve merge conflicts"
      description={`${conflicted.length} ${conflicted.length === 1 ? 'file needs' : 'files need'} attention before the merge can finish.`}
      className="flex h-[min(640px,85vh)] w-[min(880px,calc(100vw-40px))] flex-col"
      footer={
        <>
          <span className="mr-auto text-[12.5px] text-muted-foreground">{allResolved ? 'All conflicts resolved.' : 'Remove every <<<<<<< marker to continue.'}</span>
          <Button variant="outline" disabled={!!busy} onClick={() => void finish('abort')}>
            {busy === 'abort' ? <Spinner className="size-3.5" /> : null}
            Abort merge
          </Button>
          <Button variant="brand" disabled={!allResolved || !!busy || dirty} onClick={() => void finish('continue')}>
            {busy === 'continue' ? <Spinner className="size-3.5" /> : null}
            Continue merge
          </Button>
        </>
      }
    >
      <div className="flex h-full min-h-0 gap-3">
        <ul className="w-52 shrink-0 space-y-0.5 overflow-y-auto border-r border-divider pr-2">
          {conflicted.map((path) => (
            <li key={path}>
              <button
                onClick={() => setSelected(path)}
                className={cn('flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12.5px]', path === selected ? 'bg-selected text-foreground' : 'text-fg-2 hover:bg-hover')}
                title={path}
              >
                {resolved[path] ? <CircleCheck className="size-3.5 shrink-0 text-success" /> : <CircleAlert className="size-3.5 shrink-0 text-warning" />}
                <span className="min-w-0 flex-1 truncate">{path}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!selected ? (
            <EmptyState title="No conflicts" className="py-8" />
          ) : file.isPending ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          ) : file.isError ? (
            <p className="p-3 text-[13px] text-danger">{errorText(file.error)}</p>
          ) : (
            <>
              <div className="mb-2 flex shrink-0 items-center justify-between">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-2" title={selected}>
                  {selected}
                </span>
                <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={() => void save()}>
                  {saving ? <Spinner className="size-3.5" /> : null}
                  Save
                </Button>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-divider">
                <CodeEditor
                  path={selected}
                  value={value}
                  onChange={(v) => {
                    setValue(v);
                    setDirty(true);
                  }}
                  onSave={() => void save()}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
