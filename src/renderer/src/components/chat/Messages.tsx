import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CircleAlert, Copy, Pencil, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { ChatStreamEvent, Conversation, Message } from '@shared/types/chat';
import { AgentParts } from '@/components/task/AgentParts';
import { Button } from '@/components/ui/button';
import { Spinner, Tip } from '@/components/ui/misc';
import { effectiveThinking, useSelectedModel } from '@/lib/hooks';
import { invoke } from '@/lib/ipc';
import { useSettings } from '@/lib/queries';
import { cn, copyText } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { MessageAttachments } from './Attachments';
import { Markdown } from './Markdown';
import { ThinkingBlock } from './ThinkingBlock';

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tip label={label}>
      <button aria-label={label} onClick={onClick} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground">
        {children}
      </button>
    </Tip>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ActionButton
      label={copied ? 'Copied' : 'Copy'}
      onClick={() => {
        void copyText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </ActionButton>
  );
}

export function BranchSwitcher({ conversationId, siblings, current }: { conversationId: string; siblings: Message[]; current: Message }) {
  if (siblings.length < 2) return null;
  const index = siblings.findIndex((m) => m.id === current.id);
  const go = (delta: number) => {
    const target = siblings[index + delta];
    if (target) void invoke('chat:switchBranch', conversationId, target.id);
  };
  return (
    <div className="flex items-center text-[12px] text-muted-foreground tabular-nums">
      <button aria-label="Previous version" disabled={index <= 0} onClick={() => go(-1)} className="flex size-6 items-center justify-center rounded hover:bg-hover hover:text-foreground disabled:opacity-30">
        <ChevronLeft className="size-3.5" />
      </button>
      <span>
        {index + 1} / {siblings.length}
      </span>
      <button aria-label="Next version" disabled={index >= siblings.length - 1} onClick={() => go(1)} className="flex size-6 items-center justify-center rounded hover:bg-hover hover:text-foreground disabled:opacity-30">
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}

export function UserMessage({ message, conversation, siblings, disabled }: { message: Message; conversation: Conversation; siblings: Message[]; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const { model } = useSelectedModel();
  const thinking = useUi((s) => s.thinking);

  const save = async () => {
    if (!model) return toast.error('Pick a model first');
    setEditing(false);
    try {
      await invoke('chat:edit', conversation.id, message.id, draft, model.ref, effectiveThinking(model.reasoningStyle, thinking));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="group flex flex-col items-end gap-1.5 animate-fade-in">
      <MessageAttachments attachments={message.attachments} />
      {editing ? (
        <div className="w-full max-w-[85%] rounded-2xl border border-composer-border bg-composer p-3">
          <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-24 w-full resize-y bg-transparent text-[15px] leading-relaxed outline-none" />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(message.content); }}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={() => void save()}>
              Save & send
            </Button>
          </div>
        </div>
      ) : (
        message.content && <div className="selectable max-w-[85%] rounded-2xl bg-bubble px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-foreground">{message.content}</div>
      )}
      {!editing && (
        <div className="flex h-7 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <BranchSwitcher conversationId={conversation.id} siblings={siblings} current={message} />
          <CopyButton text={message.content} />
          {!disabled && (
            <ActionButton label="Edit" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
}

export function StatsLine({ message }: { message: Message }) {
  const s = message.stats;
  if (!s) return null;
  const parts = [
    s.tokensPerSecond ? `${s.tokensPerSecond.toFixed(1)} tok/s` : null,
    s.completionTokens ? `${s.completionTokens.toLocaleString('en-US')} tokens` : null,
    s.ttftMs !== undefined ? `${(s.ttftMs / 1000).toFixed(2)}s to first token` : null,
    s.stopReason ? `stop: ${s.stopReason}` : null,
  ].filter(Boolean);
  return <span className="truncate text-[11.5px] text-muted-foreground tabular-nums">{parts.join(' · ')}</span>;
}

export function AssistantMessage({
  message,
  live,
  conversation,
  siblings,
  isLast,
}: {
  message: Message;
  live?: ChatStreamEvent;
  conversation: Conversation;
  siblings: Message[];
  isLast: boolean;
}) {
  const { data: settings } = useSettings();
  const { model } = useSelectedModel();
  const thinking = useUi((s) => s.thinking);
  // Once the saved message reaches a final state it wins over any stale live overlay.
  if (live && message.status !== 'streaming' && (live.status === 'streaming' || live.status === 'loading-model')) live = undefined;
  const status = live?.status ?? message.status;
  const content = live ? live.content : message.content;
  const reasoning = live ? live.reasoning : message.reasoning ?? '';
  const streaming = status === 'streaming' || status === 'loading-model';
  const error = live?.error ?? message.error;
  const stats = live?.stats ?? message.stats;
  const merged: Message = { ...message, content, reasoning, stats, status: status === 'loading-model' ? 'streaming' : status };
  // Chats with tools stream ordered parts (text, thinking and tool steps) like Cowork turns.
  const parts = live?.parts ?? message.parts;
  const hasParts = !!parts && parts.length > 0;
  const lastPart = parts?.[parts.length - 1];
  const waitingOnModel = hasParts && status === 'streaming' && lastPart?.type === 'tool' && ['done', 'error', 'denied'].includes(lastPart.status);

  const retry = async () => {
    try {
      const ref = model?.ref ?? message.model;
      await invoke('chat:regenerate', conversation.id, message.id, ref ? { providerId: ref.providerId, modelId: ref.modelId } : undefined, model ? effectiveThinking(model.reasoningStyle, thinking) : undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const thinkingActive = streaming && !!reasoning && !content;

  return (
    <div className="group animate-fade-in" data-testid="assistant-message" data-status={status}>
      {status === 'loading-model' && (
        <div className="mb-2 flex items-center gap-2 font-sans text-[13.5px] text-muted-foreground">
          <Spinner className="size-3.5" />
          <span>{live?.statusMessage || 'Loading model…'}</span>
        </div>
      )}
      {status === 'streaming' && !content && !reasoning && !hasParts && (
        <div className="flex h-7 items-center">
          <span className="size-2.5 animate-pulse rounded-full bg-brand" />
        </div>
      )}
      {hasParts ? (
        <AgentParts parts={parts} messageId={message.id} conversationId={conversation.id} streaming={streaming} />
      ) : (
        <>
          {reasoning && <ThinkingBlock reasoning={reasoning} active={thinkingActive} durationMs={stats?.reasoningMs} />}
          {content && <Markdown content={content} streaming={streaming} conversationId={conversation.id} />}
        </>
      )}
      {(waitingOnModel || (hasParts && live?.statusMessage && status === 'streaming')) && (
        <div className="my-2 flex items-center gap-2 font-sans text-[13.5px] text-muted-foreground">
          <span className="size-2.5 animate-pulse rounded-full bg-brand" />
          <span className="shimmer">{live?.statusMessage || 'Working…'}</span>
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
        <div className={cn('mt-1 flex h-7 items-center gap-0.5 font-sans opacity-0 transition-opacity group-hover:opacity-100', isLast && 'opacity-100')}>
          <CopyButton text={content} />
          <ActionButton label="Retry" onClick={() => void retry()}>
            <RefreshCw className="size-3.5" />
          </ActionButton>
          <BranchSwitcher conversationId={conversation.id} siblings={siblings} current={message} />
          <span className="ml-2 flex min-w-0 items-center gap-2">
            {message.model && <span className="truncate text-[11.5px] text-muted-foreground">{message.model.displayName}</span>}
            {(settings?.showGenerationStats ?? true) && <StatsLine message={merged} />}
          </span>
        </div>
      )}
    </div>
  );
}
