import { useState } from 'react';
import { ChevronRight, Layers } from 'lucide-react';
import type { AgentPart, ToolPart } from '@shared/types/agent';
import { Markdown } from '@/components/chat/Markdown';
import { ThinkingBlock } from '@/components/chat/ThinkingBlock';
import { cn } from '@/lib/utils';
import { ApprovalCard, ToolStep } from './ToolStep';

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

/** Text, thinking, grouped tool steps, approvals and compaction notes of an agent turn, in order. */
export function AgentParts({
  parts,
  messageId,
  conversationId,
  streaming,
  verbose = false,
  last,
}: {
  parts: AgentPart[];
  messageId: string;
  conversationId: string;
  streaming: boolean;
  verbose?: boolean;
  /** The part that is still streaming (defaults to the final part). */
  last?: AgentPart;
}) {
  const tail = last ?? parts[parts.length - 1];
  return (
    <>
      {toBlocks(parts).map((block) => {
        if (block.kind === 'tools') {
          return (
            <div key={block.key} className="my-2 ml-[9px] border-l border-divider pl-3">
              {block.parts.map((p) => (
                <ToolStep key={`${p.id}:${verbose}`} part={p} messageId={messageId} defaultOpen={verbose || (p.status === 'running' && p.name === 'run_command')} />
              ))}
            </div>
          );
        }
        const part = block.part;
        switch (part.type) {
          case 'text':
            return <Markdown key={block.key} content={part.text} streaming={streaming && part === tail} conversationId={conversationId} className="my-2" />;
          case 'reasoning':
            return <ThinkingBlock key={`${block.key}:${verbose}`} reasoning={part.text} active={streaming && part === tail} durationMs={part.durationMs} defaultOpen={verbose} />;
          case 'tool':
            return <ApprovalCard key={block.key} part={part} messageId={messageId} />;
          case 'compaction':
            return <CompactionNote key={block.key} summary={part.summary} />;
        }
      })}
    </>
  );
}
