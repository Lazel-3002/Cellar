import { useEffect, useRef, useState } from 'react';
import { ArrowUp, CornerDownLeft } from 'lucide-react';
import { CellarMark } from '@/components/brand/Logo';
import { Spinner } from '@/components/ui/misc';
import { effectiveThinking, useSelectedModel, useThemeSync } from '@/lib/hooks';
import { invoke, onEvent } from '@/lib/ipc';
import { useSettings } from '@/lib/queries';
import { useUi } from '@/stores/ui';

/** The small window the global shortcut opens: type a question, press Enter, continue in Cellar. */
export function QuickEntry() {
  const { data: settings } = useSettings();
  useThemeSync(settings);
  const { model, isLoading } = useSelectedModel();
  const thinking = useUi((s) => s.thinking);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const focus = () => {
      setError(null);
      requestAnimationFrame(() => {
        input.current?.focus();
        input.current?.select();
      });
    };
    focus();
    return onEvent('quick:shown', focus);
  }, []);

  const send = async () => {
    if (!text.trim() || sending) return;
    if (!model) {
      setError('No model is available yet. Open Cellar to download or connect one.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await invoke('chat:send', { content: text, attachmentIds: [], model: model.ref, thinking: effectiveThinking(model.reasoningStyle, thinking) });
      setText('');
      await invoke('app:openConversation', result.conversationId, 'chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="drag flex h-full flex-col bg-background px-4 pt-3.5 pb-3 text-foreground" data-testid="quick-entry">
      <div className="flex min-h-0 flex-1 items-start gap-3">
        <CellarMark className="mt-1 size-6 shrink-0" />
        <textarea
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') void invoke('app:hideQuickEntry');
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask anything…"
          className="no-drag h-full min-h-0 flex-1 resize-none bg-transparent font-sans text-[18px] leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <button
          aria-label="Send"
          disabled={!text.trim() || sending}
          onClick={() => void send()}
          className="no-drag mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {sending ? <Spinner className="size-4 text-white" /> : <ArrowUp className="size-[18px]" strokeWidth={2.25} />}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-divider pt-2 text-[12px] text-muted-foreground">
        {error ? <span className="truncate text-danger">{error}</span> : <span className="truncate">{isLoading ? 'Finding models…' : model ? model.displayName : 'No model available'}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <CornerDownLeft className="size-3" /> to send · Esc to close
        </span>
      </div>
    </div>
  );
}
