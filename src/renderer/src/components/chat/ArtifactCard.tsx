import { Code, FileText, Globe, Image as ImageIcon, Network, Atom } from 'lucide-react';
import type { ArtifactType } from '@shared/types/chat';
import { Spinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';

export const ARTIFACT_ICONS: Record<ArtifactType, typeof Code> = {
  html: Globe,
  svg: ImageIcon,
  react: Atom,
  mermaid: Network,
  markdown: FileText,
  code: Code,
};

export const ARTIFACT_LABELS: Record<ArtifactType, string> = {
  html: 'Web page',
  svg: 'SVG image',
  react: 'React component',
  mermaid: 'Diagram',
  markdown: 'Document',
  code: 'Code',
};

export function ArtifactCard({ conversationId, identifier, title, type, open }: { conversationId?: string; identifier: string; title: string; type: ArtifactType; open: boolean }) {
  const { artifact, openArtifact } = useUi();
  const Icon = ARTIFACT_ICONS[type] ?? Code;
  const active = artifact?.conversationId === conversationId && artifact?.identifier === identifier;
  return (
    <button
      type="button"
      disabled={!conversationId}
      onClick={() => conversationId && openArtifact(active ? null : { conversationId, identifier })}
      className={cn(
        'not-prose my-3 flex w-full max-w-md items-center gap-3 rounded-xl border border-composer-border bg-composer p-2 pr-4 text-left font-sans transition-colors hover:border-track-border',
        active && 'border-brand/60',
      )}
    >
      <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-lg border border-divider bg-background text-muted-foreground">
        {open ? <Spinner /> : <Icon className="size-5" strokeWidth={1.6} />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-foreground">{title}</span>
        <span className="block text-[12.5px] text-muted-foreground">{open ? 'Writing…' : `${ARTIFACT_LABELS[type]} · Click to open`}</span>
      </span>
    </button>
  );
}
