import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowDown, ChevronDown, FolderClosed, Map as MapIcon, PanelRightClose, PanelRightOpen, Pencil, Star, Trash } from 'lucide-react';
import { toast } from 'sonner';
import { branchPath } from '@shared/message-tree';
import type { TaskState, TaskStatus } from '@shared/types/agent';
import type { Conversation } from '@shared/types/chat';
import { Composer } from '@/components/composer/Composer';
import { TaskSidePanel } from '@/components/task/TaskSidePanel';
import { AgentTurn, UserTurn } from '@/components/task/Transcript';
import { Button, IconButton } from '@/components/ui/button';
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuTrigger } from '@/components/ui/menu';
import { Badge, EmptyState, Spinner } from '@/components/ui/misc';
import { effectiveThinking, useSelectedModel } from '@/lib/hooks';
import { invoke } from '@/lib/ipc';
import { useConversation, useProjects } from '@/lib/queries';
import { conversationRoute } from '@/lib/tasks';
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
    if (data && data.conversation.kind !== 'task') void navigate({ to: conversationRoute(data.conversation.kind), params: { conversationId }, replace: true });
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
              message.role === 'user' ? <UserTurn key={message.id} message={message} /> : <AgentTurn key={message.id} message={message} live={streams[message.id]} conversation={data.conversation} />,
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
