import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignVersionSummary } from '@shared/types/design';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { relativeTime } from '@/lib/utils';
import { useDesignEditor } from '@/stores/design';
import { ArtboardThumbnail } from './ArtboardView';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Every saved snapshot of a design, restorable as a new version. Human-editor-only: the model never sees this. */
export function VersionHistory({ designId, open, onClose }: { designId: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: versions, isLoading } = useQuery({
    queryKey: ['design-versions', designId],
    queryFn: () => invoke('design:versions:list', designId),
    enabled: open,
  });
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const currentVersion = useDesignEditor((s) => s.design?.version);

  const restore = async (version: DesignVersionSummary) => {
    if (!window.confirm(`Restore "${version.name || `Version ${version.version}`}"? Any unsaved changes on the canvas will be discarded.`)) return;
    setRestoringId(version.id);
    try {
      const restored = await invoke('design:versions:restore', designId, version.id);
      useDesignEditor.getState().applyRemote(restored);
      toast.success(`Restored version ${version.version}`);
      void queryClient.invalidateQueries({ queryKey: ['design-versions', designId] });
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Version history" description="Every saved change, newest first. Restoring creates a new version — nothing is lost." side="right">
      <div className="-mx-5 divide-y divide-divider">
        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        )}
        {!isLoading && versions?.length === 0 && <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">No saved versions yet.</div>}
        {versions?.map((version) => (
          <VersionRow key={version.id} designId={designId} version={version} current={version.version === currentVersion} restoring={restoringId === version.id} onRestore={() => void restore(version)} />
        ))}
      </div>
    </Dialog>
  );
}

function VersionRow({ designId, version, current, restoring, onRestore }: { designId: string; version: DesignVersionSummary; current: boolean; restoring: boolean; onRestore: () => void }) {
  const { data: snapshot } = useQuery({ queryKey: ['design-version', designId, version.id], queryFn: () => invoke('design:versions:get', designId, version.id) });
  const cover = snapshot?.artboards[0];
  return (
    <div className="flex items-center gap-3 px-5 py-2.5">
      <div className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-divider bg-[color-mix(in_srgb,var(--sidebar)_70%,var(--background))]">
        {cover ? <ArtboardThumbnail artboard={cover} theme={snapshot.theme} width={64} height={44} /> : <History className="size-3.5 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-foreground">{version.name || `Version ${version.version}`}</div>
        <div className="text-[11.5px] text-muted-foreground">
          {relativeTime(version.createdAt)} · {version.source === 'agent' ? 'by the model' : 'by you'}
        </div>
      </div>
      {current ? (
        <span className="shrink-0 text-[11.5px] text-muted-foreground">Current</span>
      ) : (
        <Button size="sm" variant="outline" className="shrink-0" disabled={restoring} onClick={onRestore}>
          {restoring ? <Spinner className="size-3.5" /> : <RotateCcw className="size-3.5" />}
          Restore
        </Button>
      )}
    </div>
  );
}
