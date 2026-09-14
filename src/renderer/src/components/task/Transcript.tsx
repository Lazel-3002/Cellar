import { useState } from 'react';
import { ChevronRight, CircleAlert, Layers, ListTree } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentPart, ToolPart } from '@shared/types/agent';
import type { ChatStreamEvent, Conversation, Message } from '@shared/types/chat';
import type { TranscriptView } from '@shared/types/code';
import { CopyButton, StatsLine } from '@/components/chat/Messages';
import { Markdown } from '@/components/chat/Markdown';
import { ThinkingBlock } from '@/components/chat/ThinkingBlock';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { effectiveThinking, useSelectedModel } from '@/lib/hooks';
import { invoke } from '@/lib/ipc';
import { useSettings } from '@/lib/queries';
import { describeTool } from '@/lib/tasks';
import { cn } from '@/lib/utils';
import { isLive } from '@/stores/streams';
import { useUi } from '@/stores/ui';
import { ApprovalCard, ToolStep } from './ToolStep';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Block = { kind: 'tools'; key: string; parts: ToolPart[] } | { kind: 'part'; key: string; part: AgentPart };

function toBlocks(parts: AgentPart[]): Block[] {
  const blocks: Block[] = [];
  parts.forEach((part, i) => {
    if (part.type === 'tool' && part.status !== 'awaiting-approval') {
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'tools') last.parts.push(part);
      else blocks.push({ kind: 'tools', key: part.id, parts: [part] });
    } else {
      blocks.push({ kind: 'part', key: part.type === 'tool' ? part.id : `${part.type}-${i}`, part });
    }
  });
  return blocks;
}

function CompactionNote({ summary }: { summary: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-3 font-sans">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-[12.5px] text-muted-foreground hover:text-foreground">
        <span className="h-px flex-1 bg-divider" />
        <Layers className="size-3.5" /> Earlier steps were summarized to free up context
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        <span className="h-px flex-1 bg-divider" />
      </button>
      {open && <div className="selectable mt-2 rounded-lg border border-divider bg-card px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">{summary}</div>}
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Read 4 files · Edited 2 files · Ran 1 command" for the summary view. */
export function stepSummary(parts: AgentPart[]): string {
  const tools = parts.filter((p): p is ToolPart => p.type === 'tool');
  const count = (names: string[]) => tools.filter((t) => names.includes(t.name) && t.status === 'done').length;
  const files = (names: string[]) => new Set(tools.filter((t) => names.includes(t.name) && t.status === 'done').map((t) => String(t.args?.path ?? ''))).size;
  const pieces = [
    files(['read_file']) && `read ${plural(files(['read_file']), 'file')}`,
    count(['glob', 'grep', 'list_dir']) && `searched ${plural(count(['glob', 'grep', 'list_dir']), 'time')}`,
    files(['write_file', 'edit_file']) && `changed ${plural(files(['write_file', 'edit_file']), 'file')}`,
    count(['run_command']) && `ran ${plural(count(['run_command']), 'command')}`,
    count(['web_search', 'web_fetch']) && `used the web ${plural(count(['web_search', 'web_fetch']), 'time')}`,
  ].filter(Boolean) as string[];
  const failed = tools.filter((t) => t.status === 'error').length;
  if (failed) pieces.push(`${failed} failed`);
  if (pieces.length === 0) return plural(tools.length, 'step');
  const text = pieces.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface TurnProps {
  message: Message;
  live?: ChatStreamEvent;
  conversation: Conversation;
  view?: TranscriptView;
}

/** One agent turn: text, thinking, grouped tool steps and approvals, in the chosen view. */
export function AgentTurn({ message, live, conversation, view = 'normal' }: TurnProps) {
  const { model } = useSelectedModel();
  const { data: settings } = useSettings();
  const thinking = useUi((s) => s.thinking);
  const [expanded, setExpanded] = useState(false);
  if (live && message.status !== 'streaming' && isLive(live)) live = undefined;
  const status = live?.status ?? message.status;
  const parts = live?.parts ?? message.parts ?? [];
  const streaming = status === 'streaming' || status === 'loading-model';
  const error = live?.error ?? message.error;
  const stats = live?.stats ?? message.stats;
  const last = parts[parts.length - 1];
  const waitingOnModel = streaming && status === 'streaming' && (!last || (last.type === 'tool' && (last.status === 'done' || last.status === 'error' || last.status === 'denied')));
  const content = parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text: string }).text)
    .join('\n\n');
  const verbose = view === 'verbose';
  const summary = view === 'summary' && !expanded;

  const retry = async () => {
    try {
      const ref = model?.ref ?? message.model;
      await invoke('chat:regenerate', conversation.id, message.id, ref ? { providerId: ref.providerId, modelId: ref.modelId } : undefined, model ? effectiveThinking(model.reasoningStyle, thinking) : undefined);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const renderParts = (list: AgentPart[]) =>
    toBlocks(list).map((block) => {
      if (block.kind === 'tools') {
        return (
          <div key={block.key} className="my-2 ml-[9px] border-l border-divider pl-3">
            {block.parts.map((p) => (
              <ToolStep key={`${p.id}:${verbose}`} part={p} messageId={message.id} defaultOpen={verbose || (p.status === 'running' && p.name === 'run_command')} />
            ))}
          </div>
        );
      }
      const part = block.part;
      switch (part.type) {
        case 'text':
          return <Markdown key={block.key} content={part.text} streaming={streaming && part === last} conversationId={conversation.id} className="my-2" />;
        case 'reasoning':
          return <ThinkingBlock key={`${block.key}:${verbose}`} reasoning={part.text} active={streaming && part === last} durationMs={part.durationMs} defaultOpen={verbose} />;
        case 'tool':
          return <ApprovalCard key={block.key} part={part} messageId={message.id} />;
        case 'compaction':
          return <CompactionNote key={block.key} summary={part.summary} />;
      }
    });

  let body: React.ReactNode;
  if (summary) {
    const lastRound = Math.max(-1, ...parts.map((p) => p.round));
    const finalText = streaming ? [] : parts.filter((p) => p.type === 'text' && p.round === lastRound);
    const approvals = parts.filter((p) => p.type === 'tool' && p.status === 'awaiting-approval');
    const steps = parts.filter((p) => p.type === 'tool').length;
    const current = [...parts].reverse().find((p): p is ToolPart => p.type === 'tool');
    body = (
      <>
        {steps > 0 && (
          <button onClick={() => setExpanded(true)} className="my-1.5 flex items-center gap-2 font-sans text-[13px] text-muted-foreground hover:text-foreground" data-testid="turn-summary">
            <ListTree className="size-3.5" />
            {streaming && current ? (
              <span className="shimmer">
                {describeTool(current).active} {describeTool(current).target ?? ''}…
              </span>
            ) : (
              <span>{stepSummary(parts)}</span>
            )}
            <ChevronRight className="size-3.5" />
          </button>
        )}
        {renderParts(approvals)}
        {renderParts(finalText)}
      </>
    );
  } else {
    body = (
      <>
        {view === 'summary' && expanded && (
          <button onClick={() => setExpanded(false)} className="mb-1 flex items-center gap-1.5 font-sans text-[12px] text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-3 rotate-90" /> Collapse steps
          </button>
        )}
        {renderParts(parts)}
      </>
    );
  }

  return (
    <div data-testid="task-turn" data-status={status} className="group animate-fade-in">
      {body}
      {streaming && !summary && (status === 'loading-model' || live?.statusMessage || waitingOnModel) && (
        <div className="my-2 flex items-center gap-2 font-sans text-[13.5px] text-muted-foreground">
          {status === 'loading-model' || live?.statusMessage ? <Spinner className="size-3.5" /> : <span className="size-2.5 animate-pulse rounded-full bg-brand" />}
          <span className={cn(waitingOnModel && !live?.statusMessage && 'shimmer')}>{live?.statusMessage || (status === 'loading-model' ? 'Loading model…' : parts.length ? 'Working…' : 'Starting…')}</span>
        </div>
      )}
      {streaming && summary && parts.length === 0 && (
        <div className="my-2 flex items-center gap-2 font-sans text-[13.5px] text-muted-foreground">
          <Spinner className="size-3.5" />
          <span className="shimmer">{live?.statusMessage || (status === 'loading-model' ? 'Loading model…' : 'Starting…')}</span>
        </div>
      )}
      {status === 'error' && (
        <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-3 font-sans text-[13.5px] text-foreground">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1 whitespace-pre-wrap">{error || 'Something went wrong.'}</div>
          <Button size="sm" variant="outline" onClick={() => void retry()}>
            Retry
          </Button>
        </div>
      )}
      {status === 'stopped' && <div className="mt-1 font-sans text-[12px] text-muted-foreground">Stopped</div>}
      {!streaming && (
        <div className="mt-1 flex h-7 items-center gap-0.5 font-sans opacity-0 transition-opacity group-hover:opacity-100">
          {content && <CopyButton text={content} />}
          <span className="ml-2 flex min-w-0 items-center gap-2">
            {message.model && <span className="truncate text-[11.5px] text-muted-foreground">{message.model.displayName}</span>}
            {(settings?.showGenerationStats ?? true) && <StatsLine message={{ ...message, stats }} />}
          </span>
        </div>
      )}
    </div>
  );
}

export function UserTurn({ message }: { message: Message }) {
  return (
    <div className="flex flex-col items-end animate-fade-in">
      <div className="selectable max-w-[85%] rounded-2xl bg-bubble px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-foreground">{message.content}</div>
    </div>
  );
}
