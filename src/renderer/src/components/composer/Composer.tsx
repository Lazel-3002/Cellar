import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowUp, Check, ChevronDown, FileText, Mic, Paperclip, Plus, SlidersHorizontal, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ConversationKind, PermissionMode } from '@shared/types/agent';
import type { AttachmentRef, SendMessageResult } from '@shared/types/chat';
import type { CodeStartOptions } from '@shared/types/code';
import type { DesignSelection, DesignStartOptions } from '@shared/types/design';
import type { MathSelection, MathStartOptions } from '@shared/types/math';
import type { ToolScope } from '@shared/types/customize';
import { AttachmentImage } from '@/components/chat/Attachments';
import { CodeModeMenu, nextCodeMode, type CodeModeValue } from '@/components/code/CodeModeMenu';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { Segmented } from '@/components/ui/form';
import { Spinner, Tip } from '@/components/ui/misc';
import { useDictation } from '@/lib/dictation';
import { effectiveThinking, useSelectedModel } from '@/lib/hooks';
import { invoke } from '@/lib/ipc';
import { useCommands, useSettings, useVoice } from '@/lib/queries';
import { PERMISSION_MODES } from '@/lib/tasks';
import { cn, formatBytes } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { ModelPicker } from './ModelPicker';
import { ToolsDialog, ToolsMenu } from './ToolsMenu';

export interface ComposerProps {
  variant: 'home' | 'chat' | 'task' | 'code-home' | 'code' | 'design-home' | 'design' | 'math-home' | 'math';
  conversationId?: string;
  projectId?: string | null;
  incognito?: boolean;
  streamingMessageId?: string | null;
  /** Task follow-ups: the task's current permission mode. */
  permissionMode?: PermissionMode;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onSent?: (result: SendMessageResult, kind: ConversationKind) => void;
  /** New Code session: where it runs (null until a folder is chosen). */
  codeStart?: Omit<CodeStartOptions, 'mode' | 'autoAcceptEdits'> | null;
  /** Code session follow-ups: the session's current mode. */
  codeMode?: CodeModeValue;
  /**
   * Slash commands (Code): return text to send instead, null when the command was handled and
   * nothing should be sent, or undefined to send the text unchanged.
   */
  onCommand?: (name: string, rest: string) => Promise<string | null | undefined> | string | null | undefined;
  /** New design: its format and theme. */
  designStart?: DesignStartOptions;
  /** Design follow-ups: what is selected on the canvas. */
  designSelection?: DesignSelection | null;
  /** New board: the paper it starts on. */
  mathStart?: MathStartOptions;
  /** Math follow-ups: the block the user has selected. */
  mathSelection?: MathSelection | null;
  /** Runs before the message is sent (the design editor saves pending edits so the model sees them). */
  beforeSend?: () => Promise<void>;
}

export function PermissionMenu({ value, onChange }: { value: PermissionMode; onChange: (mode: PermissionMode) => void }) {
  const current = PERMISSION_MODES[value];
  return (
    <Menu>
      <MenuTrigger asChild>
        <button data-testid="permission-mode" className="no-drag flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-fg-2 hover:bg-hover hover:text-foreground">
          <current.icon className="size-3.5" strokeWidth={1.9} />
          <span className="max-w-32 truncate">{current.short}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start" className="w-72">
        {(Object.keys(PERMISSION_MODES) as PermissionMode[]).map((mode) => {
          const info = PERMISSION_MODES[mode];
          return (
            <MenuItem key={mode} className="h-auto items-start py-2" onSelect={() => onChange(mode)}>
              <div className="flex items-start gap-2.5">
                <info.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 whitespace-normal">
                  <div className="text-[13.5px] text-foreground">{info.label}</div>
                  <div className="text-[12px] leading-snug text-muted-foreground">{info.description}</div>
                </div>
                <span className="flex size-4 shrink-0 items-center justify-center">{mode === value && <Check className="size-4" />}</span>
              </div>
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}

function AttachmentChip({ attachment, onRemove }: { attachment: AttachmentRef; onRemove: () => void }) {
  return (
    <div data-testid="attachment-chip" className="group relative flex h-12 max-w-[220px] items-center gap-2.5 rounded-xl border border-composer-border bg-background/40 pr-7 pl-2">
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-selected text-muted-foreground">
        {attachment.kind === 'image' ? <AttachmentImage attachment={attachment} className="size-8" /> : <FileText className="size-4" />}
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

export function Composer({ variant, conversationId, projectId, incognito, streamingMessageId, permissionMode, placeholder, autoFocus, className, onSent, codeStart, codeMode, onCommand, designStart, designSelection, mathStart, mathSelection, beforeSend }: ComposerProps) {
  const { setDraft, mode, setMode, thinking, openLoadSettings, coworkFolder, coworkSkipped, coworkProjectId } = useUi();
  const coworkMode = variant === 'home' && mode === 'cowork' && !incognito;
  const isCode = variant === 'code-home' || variant === 'code';
  const isDesign = variant === 'design-home' || variant === 'design';
  const isMath = variant === 'math-home' || variant === 'math';
  const draftKey =
    conversationId ??
    (variant === 'code-home' ? 'code-home' : variant === 'design-home' ? 'design-home' : variant === 'math-home' ? 'math-home' : projectId ? `project:${projectId}` : incognito ? 'incognito' : coworkMode ? 'cowork' : 'home');
  const storedDraft = useUi((s) => s.drafts[draftKey] ?? '');
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
  const canSend = !!model && !sending && uploading === 0 && (text.trim().length > 0 || attachments.length > 0) && !isStreaming;
  const homeMode = settings?.coworkPermissionMode ?? 'ask';
  const newSessionMode: CodeModeValue = { mode: settings?.codeMode ?? 'code', autoAcceptEdits: settings?.codeAutoAcceptEdits ?? false };
  const setCodeModeValue = (value: CodeModeValue) => {
    if (variant === 'code-home') void invoke('settings:update', { codeMode: value.mode, codeAutoAcceptEdits: value.autoAcceptEdits });
    else if (conversationId) void invoke('code:setMode', conversationId, value.mode, value.autoAcceptEdits).catch((err) => toast.error(err instanceof Error ? err.message : String(err)));
  };
  const scope: ToolScope = isCode ? 'code' : isDesign ? 'design' : isMath ? 'math' : coworkMode || variant === 'task' ? 'task' : 'chat';
  const { data: commands = [] } = useCommands(scope);
  const [toolsOpen, setToolsOpen] = useState(false);
  const navigate = useNavigate();
  const slashQuery = /^\/[\w:-]*$/.test(text) ? text.slice(1).toLowerCase() : null;
  const slashMatches = slashQuery !== null ? commands.filter((c) => c.name.startsWith(slashQuery)).slice(0, 12) : [];

  const { data: voice } = useVoice();
  const insertDictation = useCallback((spoken: string) => {
    setText((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')} ${spoken}` : spoken));
    requestAnimationFrame(() => textarea.current?.focus());
  }, []);
  const dictationError = useCallback((message: string) => toast.error('Dictation failed', { description: message }), []);
  const dictation = useDictation(insertDictation, dictationError);
  const toggleDictation = () => {
    if (dictation.state === 'recording') return dictation.stop();
    if (dictation.state !== 'idle') return;
    if (!voice?.ready) {
      toast('Set up voice dictation', {
        description: 'Cellar transcribes speech on your computer with whisper.cpp. Install it and download a voice model first.',
        action: { label: 'Open settings', onClick: () => void navigate({ to: '/settings/$section', params: { section: 'voice' } }) },
      });
      return;
    }
    void dictation.start();
  };

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
    if (!model) {
      toast.error('Pick a model first', { description: 'Download one from Discover or connect Ollama, LM Studio or Unsloth Studio.' });
      return;
    }
    if (!canSend) return;
    if (variant === 'code-home' && !codeStart) {
      toast.error('Choose a repository or folder first');
      return;
    }
    setSending(true);
    const clear = () => {
      setText('');
      setDraft(draftKey, '');
    };
    try {
      let content = text;
      const command = /^(\/[\w:-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
      const commandName = command?.[1].toLowerCase() ?? '';
      const commandArgs = command?.[2] ?? '';
      const known = command ? commands.find((c) => `/${c.name}` === commandName) : undefined;
      if (command && onCommand) {
        const replacement = await onCommand(commandName, commandArgs);
        if (replacement === null) return clear();
        if (replacement !== undefined) content = replacement;
      }
      if (content === text && known?.name === 'tools') {
        setToolsOpen(true);
        return clear();
      }
      if (content === text && known?.name === 'remember') {
        if (!commandArgs.trim()) {
          toast.error('Write what to remember after /remember.');
          return;
        }
        await invoke('memory:add', commandArgs);
        toast.success('Saved to memory', { description: commandArgs.trim().slice(0, 140) });
        return clear();
      }
      if (content === text && known && known.source !== 'built-in') content = await invoke('commands:expand', known.name, commandArgs);
      await beforeSend?.();
      const result = await invoke('chat:send', {
        conversationId,
        incognito: coworkMode || isCode || isDesign || isMath ? false : incognito,
        projectId: coworkMode ? coworkProjectId ?? projectId ?? null : projectId ?? null,
        content,
        attachmentIds: attachments.map((a) => a.id),
        model: model.ref,
        thinking: effectiveThinking(model.reasoningStyle, thinking),
        ...(coworkMode ? { task: { folder: coworkSkipped ? null : coworkFolder, permissionMode: homeMode } } : {}),
        // /init writes CELLAR.md, so it always starts in Code mode.
        ...(variant === 'code-home' && codeStart ? { code: { ...codeStart, ...newSessionMode, ...(commandName === '/init' ? { mode: 'code' as const } : {}) } } : {}),
        ...(variant === 'design-home' && designStart ? { design: designStart } : {}),
        ...(variant === 'design' && designSelection !== undefined ? { designSelection } : {}),
        ...(variant === 'math-home' && mathStart ? { math: mathStart } : {}),
        ...(variant === 'math' && mathSelection !== undefined ? { mathSelection } : {}),
      });
      setText('');
      setDraft(draftKey, '');
      setAttachments([]);
      onSent?.(result, isCode ? 'code' : isDesign ? 'design' : isMath ? 'math' : coworkMode || variant === 'task' ? 'task' : 'chat');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isCode && e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      setCodeModeValue(nextCodeMode(variant === 'code' && codeMode ? codeMode : newSessionMode));
      return;
    }
    if (slashMatches.length > 0 && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      setText(`/${slashMatches[0].name} `);
      return;
    }
    if (e.key === 'Escape' && dictation.state === 'recording') {
      e.preventDefault();
      dictation.cancel();
      return;
    }
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
      {slashMatches.length > 0 && (
        <div className="absolute right-3 bottom-full left-3 mb-2 overflow-hidden rounded-xl border border-menu-border bg-menu py-1 shadow-xl animate-fade-in" data-testid="slash-commands">
          {slashMatches.map((command) => (
            <button
              key={command.name}
              onMouseDown={(e) => {
                e.preventDefault();
                setText(`/${command.name} `);
                textarea.current?.focus();
              }}
              className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-hover"
            >
              <span className="shrink-0 font-mono text-[13px] text-foreground">/{command.name}</span>
              {command.argumentHint && <span className="shrink-0 font-mono text-[12px] text-muted-foreground">{command.argumentHint}</span>}
              <span className="truncate text-[12.5px] text-muted-foreground">{command.description}</span>
              {command.source !== 'built-in' && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{command.pluginName ?? 'Yours'}</span>}
            </button>
          ))}
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
        placeholder={
          placeholder ??
          (incognito
            ? 'Chat privately — nothing is saved'
            : coworkMode
              ? 'Describe a task, and Cellar will work through it'
              : variant === 'home'
                ? 'How can I help you today?'
                : variant === 'task'
                  ? 'Reply to steer the task…'
                  : variant === 'code-home'
                    ? 'Describe a coding task, or ask about the code'
                    : variant === 'code'
                      ? 'Reply, or type / for commands'
                      : variant === 'design-home'
                        ? 'Describe what to design: a pitch deck, a poster, an app screen…'
                        : variant === 'math-home'
                          ? 'What should we study? A topic, a problem, or "make me a test"…'
                          : variant === 'math'
                            ? 'Ask about a step, or for more practice…'
                            : variant === 'design'
                              ? 'Ask for changes to the design…'
                          : 'Reply…')
        }
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
        <ToolsMenu scope={scope} onShowTools={() => setToolsOpen(true)} />
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
        {coworkMode && <PermissionMenu value={homeMode} onChange={(next) => void invoke('settings:update', { coworkPermissionMode: next })} />}
        {variant === 'task' && conversationId && permissionMode && (
          <PermissionMenu value={permissionMode} onChange={(next) => void invoke('tasks:setPermissionMode', conversationId, next).catch((err) => toast.error(err instanceof Error ? err.message : String(err)))} />
        )}
        {variant === 'code-home' && <CodeModeMenu value={newSessionMode} onChange={setCodeModeValue} />}
        {variant === 'code' && codeMode && <CodeModeMenu value={codeMode} onChange={setCodeModeValue} />}
        <div className="flex-1" />
        {dictation.state === 'recording' && (
          <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground tabular-nums" data-testid="dictation-recording">
            <span className="size-2 rounded-full bg-danger" style={{ opacity: 0.35 + dictation.level * 0.65, transform: `scale(${1 + dictation.level * 0.6})` }} />
            {Math.floor(dictation.elapsed / 60)}:{String(dictation.elapsed % 60).padStart(2, '0')}
            <button className="ml-1 text-[12px] hover:text-foreground" onClick={dictation.cancel}>
              Cancel
            </button>
          </span>
        )}
        {dictation.state === 'transcribing' && (
          <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <Spinner className="size-3.5" /> Transcribing…
          </span>
        )}
        <ModelPicker model={model} preferTools={coworkMode || variant === 'task' || isCode || isDesign || isMath} />
        {isStreaming ? (
          <Tip label="Stop generating  Esc">
            <button aria-label="Stop" onClick={() => void invoke('chat:stop', streamingMessageId!)} className="no-drag flex size-8 items-center justify-center rounded-lg bg-foreground text-background hover:opacity-90">
              <Square className="size-3.5 fill-current" />
            </button>
          </Tip>
        ) : (text.trim() || attachments.length) && dictation.state === 'idle' ? (
          <button aria-label="Send" data-testid="composer-send" disabled={!canSend} onClick={() => void send()} className="no-drag flex size-8 items-center justify-center rounded-lg bg-brand text-white transition hover:brightness-110 disabled:opacity-40">
            {sending ? <Spinner className="size-4 text-white" /> : <ArrowUp className="size-[18px]" strokeWidth={2.25} />}
          </button>
        ) : (
          <Tip label={dictation.state === 'recording' ? 'Stop and transcribe' : voice?.ready ? 'Dictate' : 'Set up voice dictation'}>
            <button
              aria-label={dictation.state === 'recording' ? 'Stop dictation' : 'Dictate'}
              data-testid="dictate"
              disabled={dictation.state === 'transcribing'}
              onClick={toggleDictation}
              className={cn(
                'no-drag flex size-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40',
                dictation.state === 'recording' ? 'bg-danger text-white hover:brightness-110' : 'text-fg-2 hover:bg-hover hover:text-foreground',
              )}
            >
              {dictation.state === 'recording' ? <Square className="size-3.5 fill-current" /> : <Mic className="size-[17px]" strokeWidth={1.75} />}
            </button>
          </Tip>
        )}
      </div>
      <ToolsDialog open={toolsOpen} onOpenChange={setToolsOpen} scope={scope} conversationId={conversationId} model={model?.ref} />
    </div>
  );
}
