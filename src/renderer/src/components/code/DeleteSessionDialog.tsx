import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { useConversation } from '@/lib/queries';

/** Delete a Code session, optionally removing its worktree and branch (with a warning about unmerged work). */
export function DeleteSessionDialog({ conversationId, title, onClose, redirect }: { conversationId: string; title: string; onClose: () => void; redirect: boolean }) {
  const navigate = useNavigate();
  const { data } = useConversation(conversationId);
  const code = data?.conversation.task?.code;
  const worktree = !!code?.worktree;
  const { data: changes, isLoading } = useQuery({ queryKey: ['code-changes', conversationId], queryFn: () => invoke('code:changes', conversationId), enabled: worktree });
  const pending = (changes?.uncommitted ?? 0) + (changes?.commits ?? 0);
  const [removeWorktree, setRemoveWorktree] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (changes) setRemoveWorktree(changes.uncommitted === 0 && changes.commits === 0);
  }, [changes]);

  const remove = async () => {
    setBusy(true);
    try {
      await invoke('code:deleteSession', conversationId, worktree && removeWorktree);
      onClose();
      if (redirect) void navigate({ to: '/code' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Delete this session?"
      description={title ? `“${title}” and its transcript will be deleted.` : 'The session and its transcript will be deleted.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" data-testid="confirm-delete-session" onClick={() => void remove()} disabled={busy}>
            {busy && <Spinner className="size-3.5" />} Delete
          </Button>
        </>
      }
    >
      {worktree ? (
        <div className="space-y-3 text-[13.5px]">
          <label className="flex items-start gap-2.5">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={removeWorktree} onChange={(e) => setRemoveWorktree(e.target.checked)} />
            <span>
              Also remove the worktree folder and the branch <span className="font-mono text-[12.5px]">{code?.branch}</span>
              <span className="block text-[12.5px] text-muted-foreground">Otherwise both stay, so you can keep working with them in git.</span>
            </span>
          </label>
          {isLoading ? (
            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Spinner className="size-3.5" /> Checking for unmerged work…
            </div>
          ) : (
            pending > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px]">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <span>
                  The branch has {changes!.uncommitted > 0 && `${changes!.uncommitted.toLocaleString('en-US')} uncommitted change${changes!.uncommitted === 1 ? '' : 's'}`}
                  {changes!.uncommitted > 0 && changes!.commits > 0 && ' and '}
                  {changes!.commits > 0 && `${changes!.commits.toLocaleString('en-US')} commit${changes!.commits === 1 ? '' : 's'}`}. Removing the worktree deletes that work unless it was merged.
                </span>
              </div>
            )
          )}
        </div>
      ) : (
        <p className="text-[13.5px] text-muted-foreground">Files in {code?.repoName ?? 'the folder'} are not touched.</p>
      )}
    </Dialog>
  );
}
