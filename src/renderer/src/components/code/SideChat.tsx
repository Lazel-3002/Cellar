import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, CircleAlert, Eraser, MessageCircleQuestionMark, Square, X } from 'lucide-react';
import type { SideChatMessage } from '@shared/types/code';
import { Markdown } from '@/components/chat/Markdown';
import { ThinkingBlock } from '@/components/chat/ThinkingBlock';
import { Button, IconButton } from '@/components/ui/button';
import { Tip } from '@/components/ui/misc';
import { effectiveThinking, useSelectedModel } from '@/lib/hooks';
import { invoke, onEvent } from '@/lib/ipc';
import { cn } from '@/lib/utils';
import { useCodeUi } from '@/stores/code';
import { useUi } from '@/stores/ui';

/** History entries keep a reply's thinking for display; only role and content are sent. */
interface SideEntry extends SideChatMessage {
  reasoning?: string;
  reasoningMs?: number;
  stopped?: boolean;
}

interface LiveReply {
  requestId: string;
  conversationId: string;
  content: string;
  reasoning: string;
  reasoningStart?: number;
  reasoningMs?: number;
  stopping: boolean;
}

const EMPTY: SideEntry[] = [];
const MAX_MESSAGES = 60;
const MAX_CHARS = 100_000;
const SUGGESTIONS = ['Summarize what the agent has done so far', 'Which files changed, and why?', 'Explain the last error'];

const newRequestId = () => `side-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const historyOf = (conversationId: string) => (useCodeUi.getState().sideChats[conversationId] ?? EMPTY) as SideEntry[];

/** Alternating roles within the request limits (an unanswered question merges into the next one). */
function requestMessages(entries: SideEntry[]): SideChatMessage[] {
  const out: SideChatMessage[] = [];
  for (const { role, content } of entries) {
    const prev = out[out.length - 1];
    if (prev?.role === role) prev.content = `${prev.content}\n\n${content}`.slice(-MAX_CHARS);
    else out.push({ role, content });
  }
  let sent = out.slice(-MAX_MESSAGES);
  while (sent.length > 1 && sent[0].role === 'assistant') sent = sent.slice(1);
  return sent;
}

/** Moves a finished reply into the history. Returns the question when it was stopped before any answer. */
function settle(reply: LiveReply): string | null {
  const messages = historyOf(reply.conversationId);
  const { setSideChat } = useCodeUi.getState();
  if (reply.content.trim()) {
    const reasoningMs = reply.reasoningMs ?? (reply.reasoningStart ? Date.now() - reply.reasoningStart : undefined);
    const entry: SideEntry = { role: 'assistant', content: reply.content, reasoning: reply.reasoning || undefined, reasoningMs, stopped: reply.stopping || undefined };
    setSideChat(reply.conversationId, [...messages, entry]);
    return null;
  }
  const last = messages[messages.length - 1];
  if (last?.role !== 'user') return null;
  setSideChat(reply.conversationId, messages.slice(0, -1));
  return last.content;
}

function Reply({ content, reasoning, reasoningMs, streaming, stopped }: { content: string; reasoning?: string; reasoningMs?: number; streaming: boolean; stopped?: boolean }) {
  return (
    <div className="min-w-0 animate-fade-in">
      {reasoning && <ThinkingBlock reasoning={reasoning} active={streaming && !content} durationMs={reasoningMs} />}
      {content ? (
        <Markdown content={content} streaming={streaming} artifacts={false} className="text-[14.5px]! leading-[1.65]!" />
      ) : (
        streaming &&
        !reasoning && (
          <div className="flex h-6 items-center">
            <span className="size-2 animate-pulse rounded-full bg-brand" />
          </div>
        )
      )}
      {stopped && <div className="mt-1 text-[12px] text-muted-foreground">Stopped</div>}
    </div>
  );
}

export function SideChat({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const entries = useCodeUi((s) => s.sideChats[conversationId] ?? EMPTY) as SideEntry[];
  const setSideChat = useCodeUi((s) => s.setSideChat);
  const { model } = useSelectedModel();
  const [text, setText] = useState('');
  const [live, setLive] = useState<LiveReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const liveRef = useRef<LiveReply | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const setReply = (reply: LiveReply | null) => {
    liveRef.current = reply;
    setLive(reply ? { ...reply } : null);
  };

  useEffect(() => {
    const off = onEvent('code:side', (event) => {
      const current = liveRef.current;
      if (!current || event.requestId !== current.requestId) return;
      if (event.reasoning) {
        current.reasoningStart ??= Date.now();
        current.reasoning += event.reasoning;
      }
      if (event.delta) {
        if (current.reasoningStart && current.reasoningMs === undefined) current.reasoningMs = Date.now() - current.reasoningStart;
        current.content += event.delta;
      }
      if (event.error) {
        setReply(null);
        setError(event.error);
      } else if (event.done) {
        setReply(null);
        const question = settle(current);
        if (question) setText((t) => (t.trim() ? t : question));
      } else {
        setLive({ ...current });
      }
    });
    return () => {
      off();
      const current = liveRef.current;
      liveRef.current = null;
      if (current) {
        void invoke('code:sideChatStop', current.requestId).catch(() => undefined);
        settle({ ...current, stopping: true });
      }
      setLive(null);
      setError(null);
      setText('');
    };
  }, [conversationId]);

  const hasModel = !!model;
  useEffect(() => {
    textarea.current?.focus();
  }, [conversationId, hasModel]);

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [entries, live, error]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const run = (messages: SideEntry[]) => {
    if (!model) return;
    const reply: LiveReply = { requestId: newRequestId(), conversationId, content: '', reasoning: '', stopping: false };
    setReply(reply);
    setError(null);
    stick.current = true;
    invoke('code:sideChat', {
      requestId: reply.requestId,
      conversationId,
      messages: requestMessages(messages),
      model: model.ref,
      thinking: effectiveThinking(model.reasoningStyle, useUi.getState().thinking),
    }).catch((err: unknown) => {
      if (liveRef.current?.requestId !== reply.requestId) return;
      setReply(null);
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  const send = (suggestion?: string) => {
    const question = (suggestion ?? text).trim();
    if (!question || !model || liveRef.current) return;
    if (question.length > MAX_CHARS) {
      setError('Side chat messages can be at most 100,000 characters.');
      return;
    }
    const messages: SideEntry[] = [...historyOf(conversationId), { role: 'user', content: question }];
    setSideChat(conversationId, messages);
    if (suggestion === undefined) setText('');
    run(messages);
  };

  // `/btw <question>` in the session composer opens the panel with a question to ask right away.
  const draft = useCodeUi((s) => s.sideChatDrafts[conversationId]);
  useEffect(() => {
    if (!draft || !model || liveRef.current) return;
    useCodeUi.getState().setSideChatDraft(conversationId, null);
    send(draft);
  }, [draft, model]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => {
    const current = liveRef.current;
    if (!current || current.stopping) return;
    current.stopping = true;
    void invoke('code:sideChatStop', current.requestId).catch(() => undefined);
  };

  const retry = () => {
    const messages = historyOf(conversationId);
    if (messages[messages.length - 1]?.role === 'user') run(messages);
  };

  const clear = () => {
    const current = liveRef.current;
    if (current) void invoke('code:sideChatStop', current.requestId).catch(() => undefined);
    setReply(null);
    setError(null);
    setSideChat(conversationId, []);
    textarea.current?.focus();
  };

  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    if (liveRef.current) stop();
    else onClose();
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const canRetry = !!model && entries[entries.length - 1]?.role === 'user';
  const empty = entries.length === 0 && !live && !error;

  return (
    <div
      data-testid="side-chat"
      role="dialog"
      aria-label="Side chat"
      onKeyDown={onPanelKeyDown}
      className="absolute right-4 bottom-4 z-20 flex max-h-[70%] w-[400px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border border-composer-border bg-card shadow-[0_12px_40px_rgba(0,0,0,0.28)] animate-fade-in"
    >
      <div className="flex shrink-0 items-start gap-2.5 border-b border-divider py-2.5 pr-2.5 pl-4">
        <MessageCircleQuestionMark className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-foreground">Side chat</div>
          <div className="truncate text-[12px] text-muted-foreground">Ask about this session — nothing is added to it</div>
        </div>
        <IconButton label="Clear side chat" size="sm" disabled={empty} onClick={clear}>
          <Eraser className="size-3.5" />
        </IconButton>
        <IconButton label="Close  Esc" size="sm" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {empty ? (
          <div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">Ask why the agent made a change, what an error means, or how something works. The agent never sees this conversation.</p>
            <div className="mt-3 flex flex-col items-start gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  disabled={!model}
                  onClick={() => send(s)}
                  className="no-drag rounded-lg border border-composer-border px-2.5 py-1.5 text-left text-[12.5px] text-fg-2 transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {entries.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end animate-fade-in">
                  <div className="selectable max-w-[85%] rounded-2xl bg-bubble px-3.5 py-2 text-[14px] leading-relaxed break-words whitespace-pre-wrap text-foreground">{m.content}</div>
                </div>
              ) : (
                <Reply key={i} content={m.content} reasoning={m.reasoning} reasoningMs={m.reasoningMs} streaming={false} stopped={m.stopped} />
              ),
            )}
            {live && <Reply key={entries.length} content={live.content} reasoning={live.reasoning} reasoningMs={live.reasoningMs} streaming />}
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px] text-foreground">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
                <div className="min-w-0 flex-1 break-words whitespace-pre-wrap">{error}</div>
                {canRetry && (
                  <Button size="sm" variant="outline" onClick={retry}>
                    Retry
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-divider p-2.5">
        <div className={cn('rounded-xl border border-composer-border bg-composer', !model && 'opacity-70')}>
          <textarea
            ref={textarea}
            data-testid="side-chat-input"
            value={text}
            rows={1}
            disabled={!model}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={model ? 'Ask about this session…' : 'Pick a model to use side chat'}
            className="block max-h-40 min-h-[40px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-2 pr-1.5 pb-1.5 pl-3">
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">{model ? model.displayName : 'Choose a model in the session composer first.'}</span>
            {live ? (
              <Tip label="Stop  Esc" side="top">
                <button aria-label="Stop" onClick={stop} className="no-drag flex size-7 items-center justify-center rounded-lg bg-foreground text-background hover:opacity-90">
                  <Square className="size-3 fill-current" />
                </button>
              </Tip>
            ) : (
              <button
                aria-label="Send"
                disabled={!model || !text.trim()}
                onClick={() => send()}
                className="no-drag flex size-7 items-center justify-center rounded-lg bg-brand text-white transition hover:brightness-110 disabled:opacity-40"
              >
                <ArrowUp className="size-4" strokeWidth={2.25} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
