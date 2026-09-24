import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ChevronDown, CircleAlert, Columns2, CornerDownRight, Eraser, Play, Square } from 'lucide-react';
import { toast } from 'sonner';
import type { ChatStreamEvent, Message } from '@shared/types/chat';
import type { ModelEntry } from '@shared/types/models';
import { Markdown } from '@/components/chat/Markdown';
import { CopyButton, StatsLine } from '@/components/chat/Messages';
import { ThinkingBlock } from '@/components/chat/ThinkingBlock';
import { ModelPicker } from '@/components/composer/ModelPicker';
import { ToolsDialog, ToolsMenu } from '@/components/composer/ToolsMenu';
import { AgentParts } from '@/components/task/AgentParts';
import { Button } from '@/components/ui/button';
import { Menu, MenuCheckItem, MenuContent, MenuTrigger } from '@/components/ui/menu';
import { EmptyState, Spinner } from '@/components/ui/misc';
import { effectiveThinking, isChatCapable, useSelectedModel } from '@/lib/hooks';
import { useConversation, useModels, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { SIDES, usePlayground, type Round, type Side, type SideSetup } from '@/stores/playground';
import { isLive, useStreams } from '@/stores/streams';
import { useUi } from '@/stores/ui';

const LABELS: Record<Side, string> = { a: 'Model 1', b: 'Model 2' };

/** A turn the agent loop paused rather than finished: it can be picked up with another "continue". */
const RESUMABLE_STOPS = ['step-limit', 'repeated-calls', 'browser-step-limit', 'computer-step-limit'];

function Answer({
  message,
  live,
  conversationId,
  isLast,
  onContinue,
  onFollowUp,
}: {
  message: Message;
  live?: ChatStreamEvent;
  conversationId: string;
  isLast: boolean;
  onContinue: () => void;
  onFollowUp: () => void;
}) {
  const { data: settings } = useSettings();
  // Once the saved message reaches a final state it wins over any stale live overlay.
  const overlay = live && message.status !== 'streaming' && isLive(live) ? undefined : live;
  const status = overlay?.status ?? message.status;
  const content = overlay ? overlay.content : message.content;
  const reasoning = overlay ? overlay.reasoning : message.reasoning ?? '';
  const streaming = status === 'streaming' || status === 'loading-model';
  const stats = overlay?.stats ?? message.stats;
  const parts = overlay?.parts ?? message.parts;

  return (
    <div className="group/answer min-w-0" data-testid="playground-answer" data-side-status={status}>
      {status === 'loading-model' && (
        <div className="mb-2 flex items-center gap-2 text-[13px] text-muted-foreground">
          <Spinner className="size-3.5" />
          <span>{overlay?.statusMessage || 'Loading model…'}</span>
        </div>
      )}
      {status === 'streaming' && !content && !reasoning && !parts?.length && <span className="block size-2.5 animate-pulse rounded-full bg-brand" />}
      {parts?.length ? (
        <AgentParts parts={parts} messageId={message.id} conversationId={conversationId} streaming={streaming} />
      ) : (
        <>
          {reasoning && <ThinkingBlock reasoning={reasoning} active={streaming && !content} durationMs={stats?.reasoningMs} />}
          {content && <Markdown content={content} streaming={streaming} conversationId={conversationId} />}
        </>
      )}
      {status === 'error' && (
        <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px]">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1 whitespace-pre-wrap">{overlay?.error ?? message.error ?? 'Something went wrong.'}</div>
        </div>
      )}
      {status === 'stopped' && <div className="mt-1 text-[12px] text-muted-foreground">Stopped</div>}
      {!streaming && (
        <div className="mt-2 flex min-h-7 flex-wrap items-center gap-2 font-sans">
          <span className="opacity-0 transition-opacity group-hover/answer:opacity-100">
            <CopyButton text={content} />
          </span>
          {stats?.stopReason && RESUMABLE_STOPS.includes(stats.stopReason) && (
            <Button size="sm" variant="outline" data-testid="playground-continue" onClick={onContinue}>
              <Play className="size-3.5" /> Continue
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            data-testid="playground-follow-up"
            onClick={onFollowUp}
            className={cn('transition-opacity', !isLast && 'opacity-0 group-hover/answer:opacity-100')}
          >
            <CornerDownRight className="size-3.5" /> Follow up
          </Button>
          {(settings?.showGenerationStats ?? true) && <StatsLine message={{ ...message, stats }} />}
        </div>
      )}
    </div>
  );
}

function Pending({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <span className="size-2.5 animate-pulse rounded-full bg-faint" />
      <span>{label}</span>
    </div>
  );
}

function ColumnHeader({ side, model, status }: { side: Side; model: ModelEntry | null; status: string | null }) {
  const setModel = usePlayground((s) => s.setModel);
  return (
    <div className={cn('flex h-12 min-w-0 items-center gap-2 px-4', side === 'a' && 'border-r border-divider')}>
      <span className="shrink-0 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">{LABELS[side]}</span>
      <ModelPicker model={model} onSelect={(ref) => setModel(side, ref)} />
      {status && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
          <span className={cn('size-1.5 rounded-full', status === 'Up next' ? 'bg-faint' : 'animate-pulse bg-brand')} />
          {status}
        </span>
      )}
    </div>
  );
}

export function PlaygroundPage() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  // Who the next prompt goes to: both models, or one of them for a follow-up.
  const [target, setTarget] = useState<Side | 'both'>('both');
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const { data: models = [] } = useModels();
  const { model: preferred } = useSelectedModel();
  const thinking = useUi((s) => s.thinking);
  const streams = useStreams((s) => s.byMessage);
  const { models: chosen, conversations, rounds, active, run, stop, clear } = usePlayground();
  const { data: dataA } = useConversation(conversations.a ?? undefined);
  const { data: dataB } = useConversation(conversations.b ?? undefined);

  useLayoutEffect(() => setSlot(document.getElementById('titlebar-slot')), []);

  const entries = useMemo(() => {
    const chat = models.filter(isChatCapable);
    const find = (ref: { providerId: string; modelId: string } | null) => (ref ? chat.find((m) => m.ref.providerId === ref.providerId && m.ref.modelId === ref.modelId) ?? null : null);
    // Without a choice yet, start from the model the composer would use and the next one along,
    // so the two sides are never the same model by accident.
    const a = find(chosen.a) ?? preferred ?? chat[0] ?? null;
    const b = find(chosen.b) ?? chat.find((m) => m.ref.providerId !== a?.ref.providerId || m.ref.modelId !== a?.ref.modelId) ?? a;
    return { a, b };
  }, [models, chosen, preferred]);

  const messages = useMemo(() => {
    const byId = new Map<string, Message>();
    for (const data of [dataA, dataB]) for (const message of data?.messages ?? []) byId.set(message.id, message);
    return byId;
  }, [dataA, dataB]);

  const liveMessage = active?.messageId ? streams[active.messageId] : undefined;
  const scrollSignal = `${rounds.length}:${liveMessage?.content.length ?? 0}:${liveMessage?.reasoning.length ?? 0}:${liveMessage?.status ?? ''}`;
  useEffect(() => {
    if (atBottom && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [scrollSignal, atBottom]);

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.3)}px`;
  }, [draft]);

  const ask = (text: string, sides: readonly Side[]): boolean => {
    if (!text.trim() || active) return false;
    const setup: Partial<Record<Side, SideSetup>> = {};
    for (const side of sides) {
      const entry = entries[side];
      if (!entry) {
        toast.error(`Pick a model for ${LABELS[side].toLowerCase()} first`);
        return false;
      }
      setup[side] = { ref: entry.ref, thinking: effectiveThinking(entry.reasoningStyle, thinking) };
    }
    void run(text.trim(), setup);
    return true;
  };

  const send = () => {
    if (ask(draft, target === 'both' ? SIDES : [target])) setDraft('');
  };

  const followUp = (side: Side) => {
    setTarget(side);
    textarea.current?.focus();
  };

  const statusOf = (side: Side): string | null => {
    if (!active) return null;
    if (active.side === side) return active.messageId ? 'Generating' : 'Starting';
    return SIDES.indexOf(side) > SIDES.indexOf(active.side) ? 'Up next' : null;
  };

  const cellFor = (round: Round, side: Side, isLast: boolean) => {
    const cell = round.cells[side];
    const conversationId = conversations[side];
    const message = cell.messageId ? messages.get(cell.messageId) : undefined;
    if (message && conversationId) {
      return (
        <Answer
          message={message}
          live={streams[message.id]}
          conversationId={conversationId}
          isLast={isLast}
          onContinue={() => ask('continue', [side])}
          onFollowUp={() => followUp(side)}
        />
      );
    }
    if (cell.notAsked) return <span className="text-[13px] text-faint">Not asked</span>;
    if (cell.error) {
      return (
        <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px]">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">{cell.error}</div>
        </div>
      );
    }
    if (cell.skipped) return <span className="text-[13px] text-muted-foreground">Never ran — the round was stopped.</span>;
    const other = side === 'a' ? entries.b : entries.a;
    return <Pending label={active?.side === side ? 'Starting…' : `Waiting for ${other?.displayName ?? 'the other model'} to finish…`} />;
  };

  return (
    <div className="flex h-full min-w-0 flex-col">
      {slot &&
        createPortal(
          <div className="flex min-w-0 flex-1 items-center gap-2 pl-4">
            <span className="text-[14px] text-fg-2">Playground</span>
            <div className="flex-1" />
            {rounds.length > 0 && (
              <Button size="sm" variant="ghost" className="no-drag mr-2" onClick={clear}>
                <Eraser className="size-3.5" /> Clear
              </Button>
            )}
          </div>,
          slot,
        )}

      <div className="mt-9 grid shrink-0 grid-cols-2 border-b border-divider">
        {SIDES.map((side) => (
          <ColumnHeader key={side} side={side} model={entries[side]} status={statusOf(side)} />
        ))}
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {rounds.length === 0 ? (
          <EmptyState
            className="h-full"
            icon={<Columns2 className="size-5" />}
            title="Ask both models the same thing"
            description="Your prompt goes to the model on the left first. The moment it finishes, the model on the right answers the same prompt, so you can read them side by side. They take turns because they share one GPU — each one gets it to itself."
          />
        ) : (
          rounds.map((round, index) => {
            const only = SIDES.find((side) => !round.cells[side].notAsked && round.cells[side === 'a' ? 'b' : 'a'].notAsked);
            const isLast = index === rounds.length - 1;
            return (
            <div key={round.id} data-testid="playground-round">
              <div className="border-b border-divider bg-muted px-6 py-3">
                <div className="selectable mx-auto max-w-[900px] text-center text-[14px] leading-relaxed whitespace-pre-wrap text-fg-2">
                  {round.prompt}
                  {only && <span className="ml-2 text-[12px] whitespace-nowrap text-muted-foreground">→ {LABELS[only]} only</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 border-b border-divider">
                {SIDES.map((side) => (
                  <div key={side} className={cn('selectable min-w-0 px-5 py-5', side === 'a' && 'border-r border-divider')}>
                    {cellFor(round, side, isLast)}
                  </div>
                ))}
              </div>
            </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 px-6 pt-3 pb-4">
        <div className="mx-auto w-full max-w-[900px] rounded-[18px] border border-composer-border bg-composer shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
          <textarea
            ref={textarea}
            data-testid="playground-input"
            autoFocus
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={target === 'both' ? 'Ask both models the same question…' : `Follow up with ${entries[target]?.displayName ?? LABELS[target]}…`}
            className="block max-h-[30vh] min-h-[48px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[16px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-2 px-2.5 pt-1 pb-2.5">
            <ToolsMenu scope="chat" onShowTools={() => setToolsOpen(true)} />
            <Menu>
              <MenuTrigger asChild>
                <button
                  data-testid="playground-target"
                  className={cn(
                    'no-drag flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] hover:bg-hover hover:text-foreground',
                    target === 'both' ? 'text-fg-2' : 'bg-brand/15 text-brand hover:bg-brand/20 hover:text-brand',
                  )}
                >
                  {target === 'both' ? 'Both models' : `${LABELS[target]} only`}
                  <ChevronDown className="size-3 opacity-70" />
                </button>
              </MenuTrigger>
              <MenuContent side="top" align="start" className="w-60">
                <MenuCheckItem checked={target === 'both'} onSelect={() => setTarget('both')}>
                  Both models
                </MenuCheckItem>
                {SIDES.map((side) => (
                  <MenuCheckItem key={side} checked={target === side} onSelect={() => setTarget(side)}>
                    {LABELS[side]}
                    <span className="ml-1.5 truncate text-[12px] text-muted-foreground">{entries[side]?.displayName}</span>
                  </MenuCheckItem>
                ))}
              </MenuContent>
            </Menu>
            <div className="flex-1" />
            {active ? (
              <button
                aria-label="Stop"
                data-testid="playground-stop"
                onClick={stop}
                className="no-drag flex size-8 items-center justify-center rounded-lg bg-foreground text-background hover:opacity-90"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                aria-label={target === 'both' ? 'Send to both' : `Send to ${LABELS[target]}`}
                data-testid="playground-send"
                disabled={!draft.trim()}
                onClick={send}
                className="no-drag flex size-8 items-center justify-center rounded-lg bg-brand text-white transition hover:brightness-110 disabled:opacity-40"
              >
                <ArrowUp className="size-[18px]" strokeWidth={2.25} />
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 text-center text-[11.5px] text-muted-foreground">Nothing here is saved — both sides run as incognito chats.</div>
      </div>
      <ToolsDialog open={toolsOpen} onOpenChange={setToolsOpen} scope="chat" conversationId={conversations.a ?? undefined} model={entries.a?.ref} />
    </div>
  );
}
