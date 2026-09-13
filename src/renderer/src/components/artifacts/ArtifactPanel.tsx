import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, RotateCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { parseArtifacts } from '@shared/artifacts';
import { branchPath } from '@shared/message-tree';
import type { Artifact, ArtifactType } from '@shared/types/chat';
import { ARTIFACT_ICONS, ARTIFACT_LABELS } from '@/components/chat/ArtifactCard';
import { Markdown } from '@/components/chat/Markdown';
import { IconButton } from '@/components/ui/button';
import { Segmented, Select } from '@/components/ui/form';
import { invoke } from '@/lib/ipc';
import { useConversation, useConversationArtifacts } from '@/lib/queries';
import { copyText } from '@/lib/utils';
import { useStreams } from '@/stores/streams';
import { useUi } from '@/stores/ui';

const IFRAME_TYPES: ArtifactType[] = ['html', 'svg', 'react'];

function fence(type: ArtifactType, language: string | undefined, content: string) {
  const lang = type === 'react' ? 'jsx' : type === 'mermaid' ? 'mermaid' : language || type;
  const ticks = content.includes('```') ? '````' : '```';
  return `${ticks}${lang}\n${content}\n${ticks}`;
}

export function ArtifactPanel() {
  const { artifact: panel, openArtifact, artifactWidth, setArtifactWidth } = useUi();
  const { data: artifacts = [] } = useConversationArtifacts(panel?.conversationId);
  const { data: conversation } = useConversation(panel?.conversationId);
  const streams = useStreams((s) => s.byMessage);
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const dragging = useRef(false);

  const versions = useMemo(() => artifacts.filter((a) => a.identifier === panel?.identifier).sort((a, b) => a.version - b.version), [artifacts, panel?.identifier]);
  const selected: Artifact | undefined = versions.find((v) => v.id === panel?.artifactId) ?? versions[versions.length - 1];

  // While the model is still writing, show the partial source from the live stream.
  const live = useMemo(() => {
    if (!panel || !conversation) return null;
    const path = branchPath(conversation.messages, conversation.conversation.currentLeafId);
    const last = [...path].reverse().find((m) => m.role === 'assistant');
    if (!last) return null;
    const stream = streams[last.id];
    const text = stream && (stream.status === 'streaming' || stream.status === 'loading-model') ? stream.content : null;
    if (text === null) return null;
    const found = parseArtifacts(text).find((a) => a.identifier === panel.identifier);
    return found ? { ...found } : null;
  }, [panel, conversation, streams]);

  useEffect(() => {
    if (live?.open) setTab('code');
  }, [live?.open]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current) setArtifactWidth(window.innerWidth - e.clientX);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setArtifactWidth]);

  if (!panel) return null;
  const type: ArtifactType = live?.type ?? selected?.type ?? 'code';
  const title = live?.title ?? selected?.title ?? 'Artifact';
  const content = live?.content ?? selected?.content ?? '';
  const Icon = ARTIFACT_ICONS[type];
  const iframe = IFRAME_TYPES.includes(type);

  return (
    <aside className="relative flex h-full shrink-0 flex-col border-l border-divider bg-background pt-9" style={{ width: Math.min(artifactWidth, window.innerWidth - 360) }}>
      <div
        className="absolute top-0 bottom-0 -left-1 z-10 w-2 cursor-col-resize"
        onMouseDown={() => {
          dragging.current = true;
          document.body.style.cursor = 'col-resize';
        }}
      />
      <div className="flex h-12 items-center gap-2 border-b border-divider px-3">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{title}</div>
          <div className="text-[11.5px] text-muted-foreground">{live?.open ? 'Writing…' : ARTIFACT_LABELS[type]}</div>
        </div>
        {versions.length > 1 && !live && (
          <Select
            value={selected?.id ?? ''}
            onChange={(id) => openArtifact({ ...panel, artifactId: id })}
            options={versions.map((v) => ({ value: v.id, label: `Version ${v.version}` }))}
            className="h-7 min-w-24"
          />
        )}
        {(iframe || type === 'mermaid' || type === 'markdown') && (
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'preview', label: 'Preview', disabled: !!live?.open },
              { value: 'code', label: 'Code' },
            ]}
          />
        )}
        {iframe && tab === 'preview' && (
          <IconButton label="Reload preview" onClick={() => setReloadKey((k) => k + 1)}>
            <RotateCw className="size-4" />
          </IconButton>
        )}
        <IconButton
          label={copied ? 'Copied' : 'Copy'}
          onClick={() =>
            void copyText(content).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </IconButton>
        <IconButton
          label="Save as…"
          disabled={!selected}
          onClick={() =>
            selected &&
            void invoke('artifacts:saveAs', selected.id)
              .then((path) => path && toast.success('Saved', { description: path }))
              .catch((err) => toast.error(String(err)))
          }
        >
          <Download className="size-4" />
        </IconButton>
        <IconButton label="Close" onClick={() => openArtifact(null)}>
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'preview' && iframe && selected && !live?.open ? (
          <iframe
            key={`${selected.id}-${reloadKey}`}
            title={title}
            src={`cellar-artifact://view/${selected.id}`}
            sandbox="allow-scripts allow-modals allow-forms allow-pointer-lock"
            className="h-full w-full border-0 bg-white"
          />
        ) : tab === 'preview' && type === 'markdown' && !live?.open ? (
          <div className="mx-auto max-w-3xl px-8 py-6">
            <Markdown content={content} artifacts={false} />
          </div>
        ) : tab === 'preview' && type === 'mermaid' && !live?.open ? (
          <div className="p-6">
            <Markdown content={fence('mermaid', 'mermaid', content)} artifacts={false} />
          </div>
        ) : (
          <div className="p-4">
            <Markdown content={fence(type, live?.language ?? selected?.language, content)} streaming={!!live?.open} artifacts={false} />
          </div>
        )}
      </div>
    </aside>
  );
}
