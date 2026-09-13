import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowDown, ChevronDown, ChevronRight, CircleAlert, FolderClosed, Layers, Map as MapIcon, PanelRightClose, PanelRightOpen, Pencil, Star, Trash } from 'lucide-react';
import { toast } from 'sonner';
import { branchPath } from '@shared/message-tree';
import type { AgentPart, TaskState, TaskStatus, ToolPart } from '@shared/types/agent';
import type { ChatStreamEvent, Conversation, Message } from '@shared/types/chat';
import { CopyButton, StatsLine } from '@/components/chat/Messages';
import { Markdown } from '@/components/chat/Markdown';
import { ThinkingBlock } from '@/components/chat/ThinkingBlock';
import { Composer } from '@/components/composer/Composer';
import { TaskSidePanel } from '@/components/task/TaskSidePanel';
import { ApprovalCard, ToolStep } from '@/components/task/ToolStep';
import { Button, IconButton } from '@/components/ui/button';
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuTrigger } from '@/components/ui/menu';
import { Badge, EmptyState, Spinner } from '@/components/ui/misc';
import { effectiveThinking, useSelectedModel } from '@/lib/hooks';
import { invoke } from '@/lib/ipc';
import { useConversation, useProjects, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { isLive, useStreams } from '@/stores/streams';
import { useUi } from '@/stores/ui';

const STATUS: Record<TaskStatus, { label: string; tone: 'brand' | 'warning' | 'success' | 'default' | 'danger' }> = {
  running: { label: 'Working', tone: 'brand' },
  waiting: { label: 'Needs your approval', tone: 'warning' },
  done: { label: 'Done', tone: 'success' },
  stopped: { label: 'Stopped', tone: 'default' },
  error: { label: 'Failed', tone: 'danger' },
};

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function TaskHeader({ conversation, status, panelOpen, onTogglePanel }: { conversation: Conversation; status: TaskStatus; panelOpen: boolean; onTogglePanel: () => void }) {
  const navigate = useNavigate();
  const { data: projects = [] } = useProjects();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const project = projects.find((p) => p.id === conversation.projectId);
  useEffect(() => setTitle(conversation.title), [conversation.title]);
  const commit = () => {
    setRenaming(false);
    if (title.trim() && title !== conversation.title) void invoke('chat:rename', conversation.id, title);
  };
  const badge = STATUS[status];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 pl-4">
      {project && (
        <button className="no-drag flex items-center gap-1.5 text-[13.5px] text-muted-foreground hover:text-foreground" onClick={() => void navigate({ to: '/projects/$projectId', params: { projectId: project.id } })}>
          <FolderClosed className="size-3.5" />
          {project.name}
          <span className="text-faint">/</span>
        </button>
      )}
      {renaming ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setRenaming(false);
          }}
          className="no-drag h-7 w-80 rounded-md border border-brand/50 bg-composer px-2 text-[14px] outline-none"
        />
      ) : (
        <Menu>
          <MenuTrigger asChild>
            <button className="no-drag flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-[14px] text-fg-2 hover:bg-hover hover:text-foreground">
              <span className="truncate">{conversation.title || 'New task'}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Star />} onSelect={() => void invoke('chat:star', conversation.id, !conversation.starred)}>
              {conversation.starred ? 'Unstar' : 'Star'}
            </MenuItem>
            <MenuItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
              Rename
            </MenuItem>
            <MenuSub label="Add to project" icon={<FolderClosed />}>
              {projects.length === 0 && <MenuLabel>No projects yet</MenuLabel>}
              {projects.map((p) => (
                <MenuCheckItem key={p.id} checked={conversation.projectId === p.id} onSelect={() => void invoke('chat:moveToProject', conversation.id, conversation.projectId === p.id ? null : p.id)}>
                  {p.name}
                </MenuCheckItem>
              ))}
            </MenuSub>
            <MenuSeparator />
            <MenuItem
              icon={<Trash />}
              destructive
              onSelect={async () => {
                await invoke('chat:delete', [conversation.id]);
                void navigate({ to: '/' });
              }}
            >
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
      <Badge tone={badge.tone} className={cn(status === 'running' && 'animate-pulse')}>
        {badge.label}
      </Badge>
      <div className="flex-1" />
      <IconButton label={panelOpen ? 'Hide task details' : 'Show task details'} onClick={onTogglePanel} className="mr-2">
        {panelOpen ? <PanelRightClose className="size-[17px]" strokeWidth={1.75} /> : <PanelRightOpen className="size-[17px]" strokeWidth={1.75} />}
      </IconButton>
    </div>
  );
}

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

function TaskTurn({ message, live, conversation }: { message: Message; live?: ChatStreamEvent; conversation: Conversation }) {
  const { model } = useSelectedModel();
  const { data: settings } = useSettings();
  const thinking = useUi((s) => s.thinking);
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

  const retry = async () => {
    try {
      const ref = model?.ref ?? message.model;
      await invoke('chat:regenerate', conversation.id, message.id, ref ? { providerId: ref.providerId, modelId: ref.modelId } : undefined, model ? effectiveThinking(model.reasoningStyle, thinking) : undefined);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <div data-testid="task-turn" data-status={status} className="group animate-fade-in">
      {toBlocks(parts).map((block) => {
        if (block.kind === 'tools') {
          return (
            <div key={block.key} className="my-2 ml-[9px] border-l border-divider pl-3">
              {block.parts.map((p) => (
                <ToolStep key={p.id} part={p} messageId={message.id} />
              ))}
            </div>
          );
        }
        const part = block.part;
        switch (part.type) {
          case 'text':
            return <Markdown key={block.key} content={part.text} streaming={streaming && part === last} conversationId={conversation.id} className="my-2" />;
          case 'reasoning':
            return <ThinkingBlock key={block.key} reasoning={part.text} active={streaming && part === last} durationMs={part.durationMs} />;
          case 'tool':
            return <ApprovalCard key={block.key} part={part} messageId={message.id} />;
          case 'compaction':
            return <CompactionNote key={block.key} summary={part.summary} />;
        }
      })}
      {streaming && (status === 'loading-model' || live?.statusMessage || waitingOnModel) && (
        <div className="my-2 flex items-center gap-2 font-sans text-[13.5px] text-muted-foreground">
          {status === 'loading-model' || live?.statusMessage ? <Spinner className="size-3.5" /> : <span className="size-2.5 animate-pulse rounded-full bg-brand" />}
          <span className={cn(waitingOnModel && !live?.statusMessage && 'shimmer')}>{live?.statusMessage || (status === 'loading-model' ? 'Loading model…' : parts.length ? 'Working…' : 'Starting…')}</span>
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

function UserTurn({ message }: { message: Message }) {
  return (
    <div className="flex flex-col items-end animate-fade-in">
      <div className="selectable max-w-[85%] rounded-2xl bg-bubble px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-foreground">{message.content}</div>
    </div>
  );
}

function PlanReady({ conversationId }: { conversationId: string }) {
  const { model } = useSelectedModel();
  const thinking = useUi((s) => s.thinking);
  const start = async (mode: 'ask' | 'auto-edits') => {
    if (!model) return toast.error('Pick a model first');
    try {
      await invoke('tasks:setPermissionMode', conversationId, mode);
      await invoke('chat:send', { conversationId, content: 'The plan looks good. Go ahead and carry it out.', attachmentIds: [], model: model.ref, thinking: effectiveThinking(model.reasoningStyle, thinking) });
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-composer-border bg-card px-3.5 py-2.5 animate-fade-in">
      <MapIcon className="size-4 text-brand" />
      <span className="mr-auto text-[13.5px] text-foreground">Plan ready. Should Cellar carry it out?</span>
      <Button size="sm" variant="primary" onClick={() => void start('ask')}>
        Start, asking before changes
      </Button>
      <Button size="sm" variant="outline" onClick={() => void start('auto-edits')}>
        Start with auto-accept
      </Button>
    </div>
  );
}

export function TaskPage() {
  const { conversationId } = useParams({ from: '/task/$conversationId' });
  const navigate = useNavigate();
  const { data, isLoading, error } = useConversation(conversationId);
  const streams = useStreams((s) => s.byMessage);
  const { taskPanelOpen, setTaskPanelOpen, setIncognito } = useUi();
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => setSlot(document.getElementById('titlebar-slot')), []);
  useEffect(() => setIncognito(false), [setIncognito]);
  useEffect(() => {
    if (data && data.conversation.kind !== 'task') void navigate({ to: '/chat/$conversationId', params: { conversationId }, replace: true });
  }, [data, conversationId, navigate]);

  const path = useMemo(() => (data ? branchPath(data.messages, data.conversation.currentLeafId) : []), [data]);
  const running = path.find((m) => m.role === 'assistant' && m.status === 'streaming' && (!streams[m.id] || isLive(streams[m.id])));
  const lastMessage = path[path.length - 1];
  const lastLive = lastMessage ? streams[lastMessage.id] : undefined;
  const liveTask = running ? streams[running.id]?.task : undefined;
  const task: TaskState | undefined = liveTask ?? data?.conversation.task;
  const status: TaskStatus = running ? (task?.status === 'waiting' ? 'waiting' : 'running') : (task?.status === 'running' || task?.status === 'waiting' ? 'stopped' : task?.status ?? 'done');
  const lastParts = lastLive?.parts ?? lastMessage?.parts;
  const scrollSignal = `${path.length}:${lastParts?.length ?? 0}:${JSON.stringify(lastParts?.at(-1) ?? '').length}:${lastLive?.status ?? ''}`;

  useEffect(() => {
    if (atBottom && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [scrollSignal, atBottom]);

  useEffect(() => {
    setAtBottom(true);
    requestAnimationFrame(() => {
      if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    });
  }, [conversationId]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (error || !data || !task) {
    return (
      <EmptyState
        className="h-full"
        icon={<FolderClosed className="size-5" />}
        title="This task is gone"
        description="It may have been deleted."
        action={
          <button className="text-[13.5px] text-brand" onClick={() => void navigate({ to: '/' })}>
            Start something new
          </button>
        }
      />
    );
  }

  const planReady = !running && task.permissionMode === 'plan' && lastMessage?.role === 'assistant' && lastMessage.status === 'complete';

  return (
    <div className="flex h-full min-w-0">
      {slot && createPortal(<TaskHeader conversation={data.conversation} status={status} panelOpen={taskPanelOpen} onTogglePanel={() => setTaskPanelOpen(!taskPanelOpen)} />, slot)}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
          }}
          className="mt-9 min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto flex w-full max-w-[768px] flex-col gap-6 px-6 pt-6 pb-10">
            {path.map((message) =>
              message.role === 'user' ? <UserTurn key={message.id} message={message} /> : <TaskTurn key={message.id} message={message} live={streams[message.id]} conversation={data.conversation} />,
            )}
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-[768px] px-6 pb-3">
          {!atBottom && (
            <button
              aria-label="Jump to latest"
              onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })}
              className="absolute -top-11 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-composer-border bg-composer text-fg-2 shadow-lg hover:text-foreground"
            >
              <ArrowDown className="size-4" />
            </button>
          )}
          {planReady && <PlanReady conversationId={conversationId} />}
          <Composer
            variant="task"
            conversationId={conversationId}
            projectId={data.conversation.projectId}
            streamingMessageId={running?.id ?? null}
            permissionMode={task.permissionMode}
            autoFocus
          />
          <div className="mt-2 text-center text-[11.5px] text-muted-foreground">Cellar works in {task.folder ? 'the folder you chose' : 'its own task folder'}. Review important changes before relying on them.</div>
        </div>
      </div>
      {taskPanelOpen && <TaskSidePanel conversationId={conversationId} task={task} running={!!running} />}
    </div>
  );
}
