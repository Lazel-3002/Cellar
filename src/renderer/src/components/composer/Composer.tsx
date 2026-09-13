import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { ArrowUp, FileText, Image as ImageIcon, Mic, Paperclip, Plus, SlidersHorizontal, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import type { AttachmentRef, SendMessageResult } from '@shared/types/chat';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { Segmented } from '@/components/ui/form';
import { Spinner, Tip } from '@/components/ui/misc';
import { effectiveThinking, useSelectedModel } from '@/lib/hooks';
import { invoke } from '@/lib/ipc';
import { useSettings } from '@/lib/queries';
import { cn, formatBytes } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { ModelPicker } from './ModelPicker';

export interface ComposerProps {
  variant: 'home' | 'chat';
  conversationId?: string;
  projectId?: string | null;
  incognito?: boolean;
  streamingMessageId?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onSent?: (result: SendMessageResult) => void;
}

function AttachmentChip({ attachment, onRemove }: { attachment: AttachmentRef; onRemove: () => void }) {
  return (
    <div className="group relative flex h-12 max-w-[220px] items-center gap-2.5 rounded-xl border border-composer-border bg-background/40 pr-7 pl-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-selected text-muted-foreground">
        {attachment.kind === 'image' ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] text-foreground">{attachment.name}</div>
        <div className="text-[11px] text-muted-foreground">
          {attachment.kind.toUpperCase()} · {formatBytes(attachment.size)}
          {attachment.tokens ? ` · ~${attachment.tokens.toLocaleString('en-US')} tok` : ''}
        </div>
      </div>
      <button aria-label={`Remove ${attachment.name}`} onClick={onRemove} className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-foreground">
        <X className="size-3" />
      </button>
    </div>
  );
}

export function Composer({ variant, conversationId, projectId, incognito, streamingMessageId, placeholder, autoFocus, className, onSent }: ComposerProps) {
  const draftKey = conversationId ?? (projectId ? `project:${projectId}` : incognito ? 'incognito' : 'home');
  const storedDraft = useUi((s) => s.drafts[draftKey] ?? '');
  const { setDraft, mode, setMode, thinking, openLoadSettings } = useUi();
  const [text, setText] = useState(storedDraft);
  const [attachments, setAttachments] = useState<AttachmentRef[]>([]);
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const { model } = useSelectedModel();
  const { data: settings } = useSettings();

  useEffect(() => setText(storedDraft), [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => setDraft(draftKey, text), 300);
    return () => clearTimeout(timer);
  }, [text, draftKey, setDraft]);

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [text]);

  useEffect(() => {
    if (autoFocus) textarea.current?.focus();
  }, [autoFocus, conversationId]);

  const pendingPrompt = useUi((s) => s.pendingPrompt);
  const setPendingPrompt = useUi((s) => s.setPendingPrompt);
  useEffect(() => {
    if (pendingPrompt === null) return;
    setText(pendingPrompt);
    setPendingPrompt(null);
    requestAnimationFrame(() => {
      const el = textarea.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [pendingPrompt, setPendingPrompt]);

  const isStreaming = !!streamingMessageId;
  const coworkMode = variant === 'home' && mode === 'cowork';
  const canSend = !!model && !sending && uploading === 0 && (text.trim().length > 0 || attachments.length > 0) && !isStreaming && !coworkMode;

  const addPaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    setUploading((n) => n + 1);
    try {
      const refs = await invoke('attachments:fromPaths', paths);
      setAttachments((prev) => [...prev, ...refs]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading((n) => n - 1);
    }
  };

  const addFiles = async (files: File[]) => {
    for (const file of files) {
      const path = window.cellar.getPathForFile(file);
      if (path) {
        await addPaths([path]);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const name = file.name || `pasted-${Date.now()}.${file.type.split('/')[1] ?? 'png'}`;
        const ref = await invoke('attachments:fromBytes', name, file.type || 'application/octet-stream', bytes);
        setAttachments((prev) => [...prev, ref]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const send = async () => {
    if (coworkMode) {
      toast('Cowork is coming in Milestone 2', { description: 'Local agents that work inside your folders. Switch to Chat to talk to your model now.' });
      return;
    }
    if (!model) {
      toast.error('Pick a model first', { description: 'Download one from Discover or connect Ollama, LM Studio or Unsloth Studio.' });
      return;
    }
    if (!canSend) return;
    setSending(true);
    try {
      const result = await invoke('chat:send', {
        conversationId,
        incognito,
        projectId: projectId ?? null,
        content: text,
        attachmentIds: attachments.map((a) => a.id),
        model: model.ref,
        thinking: effectiveThinking(model.reasoningStyle, thinking),
      });
      setText('');
      setDraft(draftKey, '');
      setAttachments([]);
      onSent?.(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const sendWithEnter = settings?.sendWithEnter ?? true;
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && (sendWithEnter ? !e.shiftKey : e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
    if (e.key === 'Escape' && streamingMessageId) void invoke('chat:stop', streamingMessageId);
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files];
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    void addFiles([...e.dataTransfer.files]);
  };

  return (
    <div
      className={cn(
        'relative w-full rounded-[18px] border border-composer-border bg-composer shadow-[0_2px_12px_rgba(0,0,0,0.12)] transition-colors',
        dragging && 'border-brand/70',
        incognito && 'border-dashed',
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {(attachments.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((a) => (
            <AttachmentChip key={a.id} attachment={a} onRemove={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} />
          ))}
          {uploading > 0 && (
            <div className="flex h-12 items-center gap-2 rounded-xl border border-dashed border-composer-border px-3 text-[12px] text-muted-foreground">
              <Spinner className="size-3.5" /> Reading file…
            </div>
          )}
        </div>
      )}
      <textarea
        ref={textarea}
        data-testid="composer-input"
        value={text}
        rows={1}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={placeholder ?? (incognito ? 'Chat privately — nothing is saved' : variant === 'home' ? 'How can I help you today?' : 'Reply…')}
        className="block max-h-[40vh] min-h-[52px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[16px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center gap-2 px-2.5 pt-1 pb-2.5">
        <Menu>
          <MenuTrigger asChild>
            <button aria-label="Add" className="no-drag flex size-8 items-center justify-center rounded-lg text-fg-2 hover:bg-hover hover:text-foreground">
              <Plus className="size-[18px]" strokeWidth={1.75} />
            </button>
          </MenuTrigger>
          <MenuContent side="top" align="start">
            <MenuItem icon={<Paperclip />} onSelect={() => void invoke('system:pickFiles', 'attachments').then((paths) => addPaths(paths))}>
              Add photos and files
            </MenuItem>
            <MenuItem icon={<SlidersHorizontal />} disabled={!model} onSelect={() => model && openLoadSettings(model.ref)}>
              Model load settings
            </MenuItem>
          </MenuContent>
        </Menu>
        {variant === 'home' && !incognito && (
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'chat', label: 'Chat' },
              { value: 'cowork', label: 'Cowork' },
            ]}
          />
        )}
        <div className="flex-1" />
        <ModelPicker model={model} />
        {isStreaming ? (
          <Tip label="Stop generating  Esc">
            <button aria-label="Stop" onClick={() => void invoke('chat:stop', streamingMessageId!)} className="no-drag flex size-8 items-center justify-center rounded-lg bg-foreground text-background hover:opacity-90">
              <Square className="size-3.5 fill-current" />
            </button>
          </Tip>
        ) : text.trim() || attachments.length ? (
          <button aria-label="Send" data-testid="composer-send" disabled={!canSend} onClick={() => void send()} className="no-drag flex size-8 items-center justify-center rounded-lg bg-brand text-white transition hover:brightness-110 disabled:opacity-40">
            {sending ? <Spinner className="size-4 text-white" /> : <ArrowUp className="size-[18px]" strokeWidth={2.25} />}
          </button>
        ) : (
          <Tip label="Voice dictation arrives in Milestone 4">
            <span className="flex size-8 items-center justify-center rounded-lg text-muted-foreground/60">
              <Mic className="size-[17px]" strokeWidth={1.75} />
            </span>
          </Tip>
        )}
      </div>
    </div>
  );
}
