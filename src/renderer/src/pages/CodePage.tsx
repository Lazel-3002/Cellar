import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  ArrowDown,
  BookOpen,
  Bug,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleDot,
  Circle,
  Copy,
  Eye,
  FileText,
  FlaskConical,
  FolderGit2,
  FolderOpen,
  FolderTree,
  GitBranch,
  GitCompareArrows,
  Globe,
  Map as MapIcon,
  MessageCircleQuestion,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  SquareTerminal,
  Star,
  Trash,
  TriangleAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { codePermissionMode, INIT_PROMPT } from '@shared/code-commands';
import { branchPath } from '@shared/message-tree';
import type { TaskState, TaskStatus, TodoItem } from '@shared/types/agent';
import type { Conversation } from '@shared/types/chat';
import type { CodeMode, TranscriptView } from '@shared/types/code';
import { CellarMark } from '@/components/brand/Logo';
import { ChangesPane } from '@/components/code/ChangesPane';
import { DeleteSessionDialog } from '@/components/code/DeleteSessionDialog';
import { FilesPane } from '@/components/code/FilesPane';
import { PreviewPane } from '@/components/code/PreviewPane';
import { SideChat } from '@/components/code/SideChat';
import { TerminalPane } from '@/components/code/TerminalPane';
import { Composer } from '@/components/composer/Composer';
import { OpenFileContext } from '@/components/task/ToolStep';
import { AgentTurn, UserTurn } from '@/components/task/Transcript';
import { Button, IconButton } from '@/components/ui/button';
import { Switch } from '@/components/ui/form';
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Badge, EmptyState, Spinner, Tip } from '@/components/ui/misc';
import { effectiveThinking, useSelectedModel } from '@/lib/hooks';
import { invoke, onEvent } from '@/lib/ipc';
import { useConversation, useSettings } from '@/lib/queries';
import { conversationRoute, type Icon } from '@/lib/tasks';
import { cn, copyText } from '@/lib/utils';
import { useCodeUi, type CodePane } from '@/stores/code';
import { isLive, useStreams } from '@/stores/streams';
import { useUi } from '@/stores/ui';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const folderName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;

const MEMORY_TEMPLATE = `# CELLAR.md

Notes for Cellar's coding agent about this repository. They are included in every Code session.

## Build and test

## Conventions

## Things to watch out for
`;

// ---------------------------------------------------------------------------
// New session

const IDEAS: Array<{ icon: Icon; label: string; prompt: string; mode: CodeMode }> = [
  { icon: BookOpen, label: 'Explain this codebase', prompt: 'Give me a tour of this codebase: what it does, how it is organized, the main entry points, and how the pieces fit together.', mode: 'ask' },
  { icon: Bug, label: 'Find and fix a bug', prompt: 'Find and fix this bug: ', mode: 'code' },
  { icon: FlaskConical, label: 'Add tests', prompt: 'Add tests for ', mode: 'code' },
  { icon: FileText, label: 'Write CELLAR.md project memory', prompt: '/init', mode: 'code' },
];

function RepoPicker({ repo, onChange }: { repo: string | null; onChange: (repo: string) => void }) {
  const { data: settings } = useSettings();
  const choose = async () => {
    const dir = await invoke('system:pickDirectory', 'Choose a repository or folder');
    if (dir) onChange(dir);
  };
  const recent = settings?.recentRepos ?? [];
  return (
    <Menu>
      <MenuTrigger asChild>
        <button data-testid="code-repo" className="no-drag flex h-7 max-w-[280px] items-center gap-1.5 rounded-lg border border-composer-border bg-composer px-2 text-[13px] text-foreground hover:bg-hover" title={repo ?? undefined}>
          <FolderGit2 className="size-3.5 text-muted-foreground" />
          <span className="truncate">{repo ? folderName(repo) : 'Choose a repository'}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-72">
        <MenuItem icon={<FolderOpen />} onSelect={() => void choose()}>
          Choose a folder…
        </MenuItem>
        {recent.length > 0 && (
          <>
            <MenuSeparator />
            <MenuLabel>Recent</MenuLabel>
            {recent.map((dir) => (
              <MenuCheckItem key={dir} checked={dir === repo} onSelect={() => onChange(dir)} title={dir}>
                {folderName(dir)}
              </MenuCheckItem>
            ))}
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

export function CodeHomePage() {
  const navigate = useNavigate();
  const { repo, setRepo, baseBranch, setBaseBranch } = useCodeUi();
  const { data: settings } = useSettings();
  const setPendingPrompt = useUi((s) => s.setPendingPrompt);
  const setIncognito = useUi((s) => s.setIncognito);
  const [worktreeChoice, setWorktreeChoice] = useState<boolean | null>(null);
  const info = useQuery({ queryKey: ['repo-info', repo], queryFn: () => invoke('code:repoInfo', repo!), enabled: !!repo, retry: false, staleTime: 5_000 });

  useEffect(() => setIncognito(false), [setIncognito]);

  const isGit = !!info.data?.isGit;
  const worktree = isGit && (worktreeChoice ?? settings?.codeUseWorktrees ?? true);
  const branch = baseBranch && info.data?.branches.includes(baseBranch) ? baseBranch : info.data?.branch;
  const codeStart = repo && info.data ? { folder: info.data.path, worktree, baseBranch: worktree ? branch : undefined } : null;

  const onCommand = async (name: string) => {
    if (name === '/init') {
      if (settings?.codeMode !== 'code') await invoke('settings:update', { codeMode: 'code' });
      return INIT_PROMPT;
    }
    if (name === '/memory' || name === '/btw') {
      toast.info(name === '/memory' ? 'Start a session first, then use /memory to edit CELLAR.md.' : 'Side chats belong to a session: start one first.');
      return null;
    }
    return undefined;
  };

  return (
    <div className="h-full overflow-y-auto px-6 pt-9">
      <div className="mx-auto w-full max-w-[680px] pt-[calc(26vh-36px)] pb-16">
        <h1 className="mb-[34px] flex items-center justify-center gap-3 text-center font-serif text-[38px] leading-none tracking-[-0.01em] text-foreground">
          <CellarMark className="size-[32px]" />
          <span>What should we build?</span>
        </h1>
        <Composer variant="code-home" codeStart={codeStart} onCommand={onCommand} autoFocus onSent={(r, kind) => void navigate({ to: conversationRoute(kind), params: { conversationId: r.conversationId } })} />

        <div className="mt-3 flex min-h-7 flex-wrap items-center gap-x-3 gap-y-2 px-4 text-[13px]">
          <RepoPicker
            repo={repo}
            onChange={(dir) => {
              setRepo(dir);
              setWorktreeChoice(null);
            }}
          />
          {isGit && (
            <Menu>
              <MenuTrigger asChild>
                <button data-testid="code-base-branch" className="no-drag flex h-7 max-w-[220px] items-center gap-1.5 rounded-lg px-1.5 text-fg-2 hover:bg-hover hover:text-foreground" title="Branch to start from">
                  <GitBranch className="size-3.5 text-muted-foreground" />
                  <span className="truncate">{branch ?? 'detached HEAD'}</span>
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                </button>
              </MenuTrigger>
              <MenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
                <MenuLabel>{worktree ? 'Start the worktree from' : 'Works on the checked-out branch'}</MenuLabel>
                {info.data!.branches.slice(0, 40).map((b) => (
                  <MenuCheckItem key={b} checked={b === branch} disabled={!worktree} onSelect={() => setBaseBranch(b)}>
                    {b}
                  </MenuCheckItem>
                ))}
              </MenuContent>
            </Menu>
          )}
          {isGit && (
            <label className="no-drag flex items-center gap-2 text-fg-2" data-testid="code-worktree">
              <Switch checked={worktree} onCheckedChange={(on) => setWorktreeChoice(on)} />
              <span>Isolated worktree</span>
            </label>
          )}
          {info.isFetching && <Spinner className="size-3.5" />}
        </div>

        <div className="mt-2 px-4 text-[12.5px] leading-relaxed text-muted-foreground">
          {info.error ? (
            <span className="flex items-start gap-1.5 text-warning">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {errorText(info.error)}
            </span>
          ) : !repo ? (
            'Pick the repository or folder the agent should work in.'
          ) : info.data ? (
            <>
              {!info.data.isGit
                ? info.data.gitAvailable
                  ? 'Not a git repository: Cellar keeps a copy of each file it changes so you can review and undo changes.'
                  : 'Git was not found, so Cellar keeps a copy of each file it changes for review and undo. Install Git for worktrees and commits.'
                : worktree
                  ? `The agent works on a new branch in its own worktree, so your checkout${info.data.dirty ? ' (which has uncommitted changes)' : ''} stays untouched.`
                  : `The agent works directly in your checkout${info.data.dirty ? ', which has uncommitted changes' : ''}.`}{' '}
              {info.data.memoryFile ? `Project memory: ${info.data.memoryFile}.` : 'No CELLAR.md yet: try /init.'}
            </>
          ) : null}
        </div>

        <div className="mt-[34px] px-4 text-[12.5px] text-muted-foreground">Ideas</div>
        <div className="mt-2 px-4">
          {IDEAS.map((idea) => (
            <button
              key={idea.label}
              onClick={() => {
                if (settings?.codeMode !== idea.mode) void invoke('settings:update', { codeMode: idea.mode });
                setPendingPrompt(idea.prompt);
              }}
              className="group flex h-11 w-full items-center gap-4 rounded-lg text-left"
            >
              <span className="flex size-[26px] items-center justify-center rounded-md border border-tile text-muted-foreground group-hover:text-foreground">
                <idea.icon className="size-4" strokeWidth={1.5} />
              </span>
              <span className="text-[15px] font-medium text-foreground">{idea.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session

const STATUS: Record<TaskStatus, { label: string; tone: 'brand' | 'warning' | 'success' | 'default' | 'danger' }> = {
  running: { label: 'Working', tone: 'brand' },
  waiting: { label: 'Needs your approval', tone: 'warning' },
  done: { label: 'Done', tone: 'success' },
  stopped: { label: 'Stopped', tone: 'default' },
  error: { label: 'Failed', tone: 'danger' },
};

const VIEWS: Array<{ value: TranscriptView; label: string; description: string }> = [
  { value: 'normal', label: 'Normal', description: 'Steps grouped and collapsed' },
  { value: 'verbose', label: 'Verbose', description: 'Every step and thought expanded' },
  { value: 'summary', label: 'Summary', description: 'Only requests and final answers' },
];

function SessionHeader({ conversation, task, status }: { conversation: Conversation; task: TaskState; status: TaskStatus }) {
  const { view, setView, sideChatOpen, setSideChatOpen, paneOpen, setPaneOpen } = useCodeUi();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const code = task.code!;
  useEffect(() => setTitle(conversation.title), [conversation.title]);
  const commit = () => {
    setRenaming(false);
    if (title.trim() && title !== conversation.title) void invoke('chat:rename', conversation.id, title);
  };
  const badge = STATUS[status];

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 pl-4">
      <span className="no-drag flex shrink-0 items-center gap-1.5 text-[13.5px] text-muted-foreground" title={code.repoRoot}>
        <FolderGit2 className="size-3.5" />
        {code.repoName}
        <span className="text-faint">/</span>
      </span>
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
          className="no-drag h-7 w-72 rounded-md border border-brand/50 bg-composer px-2 text-[14px] outline-none"
        />
      ) : (
        <Menu>
          <MenuTrigger asChild>
            <button className="no-drag flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-[14px] text-fg-2 hover:bg-hover hover:text-foreground">
              <span className="truncate">{conversation.title || 'New session'}</span>
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
            <MenuItem icon={<FolderOpen />} onSelect={() => void invoke('tasks:openFile', conversation.id, '.').catch((err) => toast.error(errorText(err)))}>
              Open working folder
            </MenuItem>
            {code.branch && (
              <MenuItem icon={<Copy />} onSelect={() => void copyText(code.branch!).then(() => toast.success('Branch name copied'))}>
                Copy branch name
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem icon={<Trash />} destructive onSelect={() => setDeleting(true)}>
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
      {code.branch && (
        <Tip label={code.worktree ? `Worktree: ${task.workDir}` : 'Checked-out branch'}>
          <span className="no-drag hidden h-6 max-w-[220px] shrink items-center gap-1 rounded-md border border-divider px-1.5 text-[12px] text-muted-foreground lg:flex">
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate">{code.branch}</span>
          </span>
        </Tip>
      )}
      <Badge tone={badge.tone} className={cn('shrink-0', status === 'running' && 'animate-pulse')}>
        {badge.label}
      </Badge>
      <div className="flex-1" />
      <Menu>
        <MenuTrigger asChild>
          <button data-testid="transcript-view" className="no-drag flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-hover hover:text-foreground">
            <Eye className="size-4" strokeWidth={1.75} />
            <span className="hidden xl:inline">{VIEWS.find((v) => v.value === view)?.label}</span>
          </button>
        </MenuTrigger>
        <MenuContent align="end" className="w-60">
          <MenuLabel>Transcript view</MenuLabel>
          {VIEWS.map((option) => (
            <MenuCheckItem key={option.value} checked={view === option.value} onSelect={() => setView(option.value)}>
              <span className="flex flex-col">
                <span>{option.label}</span>
                <span className="text-[11.5px] text-muted-foreground">{option.description}</span>
              </span>
            </MenuCheckItem>
          ))}
        </MenuContent>
      </Menu>
      <IconButton label="Side chat" active={sideChatOpen} onClick={() => setSideChatOpen(!sideChatOpen)} data-testid="side-chat-toggle">
        <MessageCircleQuestion className="size-[17px]" strokeWidth={1.75} />
      </IconButton>
      <IconButton label={paneOpen ? 'Hide panel' : 'Show panel'} onClick={() => setPaneOpen(!paneOpen)} className="mr-2">
        {paneOpen ? <PanelRightClose className="size-[17px]" strokeWidth={1.75} /> : <PanelRightOpen className="size-[17px]" strokeWidth={1.75} />}
      </IconButton>
      {deleting && <DeleteSessionDialog conversationId={conversation.id} title={conversation.title} onClose={() => setDeleting(false)} redirect />}
    </div>
  );
}

function TodoStrip({ todos, running }: { todos: TodoItem[]; running: boolean }) {
  const [open, setOpen] = useState(false);
  const done = todos.filter((t) => t.status === 'completed').length;
  const current = todos.find((t) => t.status === 'in_progress') ?? todos.find((t) => t.status === 'pending');
  if (todos.length === 0) return null;
  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-divider bg-card font-sans" data-testid="todo-strip">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px]">
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {done}/{todos.length}
        </span>
        <span className="min-w-0 flex-1 truncate text-fg-2">{done === todos.length ? 'All steps done' : current?.content}</span>
        {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronUp className="size-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <ol className="space-y-1.5 border-t border-divider px-3.5 py-2.5">
          {todos.map((todo, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px] leading-snug">
              {todo.status === 'completed' ? (
                <CircleCheck className="mt-px size-4 shrink-0 text-success" />
              ) : todo.status === 'in_progress' ? (
                <CircleDot className={cn('mt-px size-4 shrink-0 text-brand', running && 'animate-pulse')} />
              ) : (
                <Circle className="mt-px size-4 shrink-0 text-faint" />
              )}
              <span className={cn('text-fg-2', todo.status === 'completed' && 'text-muted-foreground line-through decoration-faint', todo.status === 'in_progress' && 'text-foreground')}>{todo.content}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PlanReady({ conversationId }: { conversationId: string }) {
  const { model } = useSelectedModel();
  const thinking = useUi((s) => s.thinking);
  const start = async (autoAcceptEdits: boolean) => {
    if (!model) return toast.error('Pick a model first');
    try {
      await invoke('code:setMode', conversationId, 'code', autoAcceptEdits);
      await invoke('chat:send', { conversationId, content: 'The plan looks good. Go ahead and implement it.', attachmentIds: [], model: model.ref, thinking: effectiveThinking(model.reasoningStyle, thinking) });
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-composer-border bg-card px-3.5 py-2.5 animate-fade-in" data-testid="plan-ready">
      <MapIcon className="size-4 text-brand" />
      <span className="mr-auto text-[13.5px] text-foreground">Plan ready. Start coding?</span>
      <Button size="sm" variant="primary" onClick={() => void start(false)}>
        Start, asking before edits
      </Button>
      <Button size="sm" variant="outline" onClick={() => void start(true)}>
        Start with auto-accept
      </Button>
    </div>
  );
}

const PANES: Array<{ value: CodePane; label: string; icon: Icon }> = [
  { value: 'changes', label: 'Changes', icon: GitCompareArrows },
  { value: 'files', label: 'Files', icon: FolderTree },
  { value: 'preview', label: 'Preview', icon: Globe },
  { value: 'terminal', label: 'Terminal', icon: SquareTerminal },
];

function SidePane({ conversationId, running, changeCount }: { conversationId: string; running: boolean; changeCount?: number }) {
  const { paneOpen, setPaneOpen, pane, setPane, paneWidth, setPaneWidth } = useCodeUi();
  const [terminalMounted, setTerminalMounted] = useState(pane === 'terminal');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (pane === 'terminal' && paneOpen) setTerminalMounted(true);
  }, [pane, paneOpen]);

  if (!paneOpen && !terminalMounted) return null;
  const width = Math.min(paneWidth, Math.max(360, window.innerWidth - 560));

  let content: ReactNode = null;
  if (pane === 'changes') content = <ChangesPane conversationId={conversationId} running={running} />;
  else if (pane === 'files') content = <FilesPane conversationId={conversationId} />;
  else if (pane === 'preview') content = <PreviewPane conversationId={conversationId} />;

  return (
    <aside data-testid="code-pane" className={cn('relative flex h-full shrink-0 flex-col border-l border-divider bg-background pt-9', !paneOpen && 'hidden')} style={{ width }}>
      <div
        className={cn('absolute top-0 bottom-0 -left-1 z-20 w-2 cursor-col-resize', dragging && 'bg-brand/30')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => dragging && setPaneWidth(window.innerWidth - e.clientX)}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
        }}
      />
      {/* Iframes and terminals would swallow pointer events while resizing. */}
      {dragging && <div className="absolute inset-0 z-10" />}
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-divider px-2">
        {PANES.map((item) => (
          <button
            key={item.value}
            data-testid={`pane-tab-${item.value}`}
            onClick={() => setPane(item.value)}
            className={cn(
              'no-drag flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-hover hover:text-foreground',
              pane === item.value && 'bg-selected text-foreground hover:bg-selected',
            )}
          >
            <item.icon className="size-3.5" strokeWidth={1.9} />
            <span className={cn(width < 440 && pane !== item.value && 'hidden')}>{item.label}</span>
            {item.value === 'changes' && !!changeCount && <span className="rounded bg-brand/15 px-1 text-[11px] text-brand tabular-nums">{changeCount}</span>}
          </button>
        ))}
        <div className="flex-1" />
        <IconButton label="Close panel" onClick={() => setPaneOpen(false)}>
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="relative min-h-0 flex-1">
        {content}
        {terminalMounted && (
          <div className={cn('absolute inset-0', pane !== 'terminal' && 'invisible')}>
            <TerminalPane conversationId={conversationId} visible={paneOpen && pane === 'terminal'} />
          </div>
        )}
      </div>
    </aside>
  );
}

export function CodeSessionPage() {
  const { conversationId } = useParams({ from: '/code/$conversationId' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useConversation(conversationId);
  const streams = useStreams((s) => s.byMessage);
  const { view, sideChatOpen, setSideChatOpen, openFile, setPane } = useCodeUi();
  const setIncognito = useUi((s) => s.setIncognito);
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const changes = useQuery({ queryKey: ['code-changes', conversationId], queryFn: () => invoke('code:changes', conversationId), enabled: data?.conversation.kind === 'code', retry: false });

  useLayoutEffect(() => setSlot(document.getElementById('titlebar-slot')), []);
  useEffect(() => setIncognito(false), [setIncognito]);
  useEffect(() => {
    if (data && data.conversation.kind !== 'code') void navigate({ to: conversationRoute(data.conversation.kind), params: { conversationId }, replace: true });
  }, [data, conversationId, navigate]);
  useEffect(
    () =>
      onEvent('chat:changed', (event) => {
        if (event.conversationId === conversationId) void queryClient.invalidateQueries({ queryKey: ['code-changes', conversationId] });
      }),
    [conversationId, queryClient],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        setPane('terminal');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPane]);

  const path = useMemo(() => (data ? branchPath(data.messages, data.conversation.currentLeafId) : []), [data]);
  const running = path.find((m) => m.role === 'assistant' && m.status === 'streaming' && (!streams[m.id] || isLive(streams[m.id])));
  const lastMessage = path[path.length - 1];
  const lastLive = lastMessage ? streams[lastMessage.id] : undefined;
  const liveTask = running ? streams[running.id]?.task : undefined;
  const task: TaskState | undefined = liveTask ?? data?.conversation.task;
  const status: TaskStatus = running ? (task?.status === 'waiting' ? 'waiting' : 'running') : task?.status === 'running' || task?.status === 'waiting' ? 'stopped' : task?.status ?? 'done';
  const lastParts = lastLive?.parts ?? lastMessage?.parts;
  const scrollSignal = `${path.length}:${lastParts?.length ?? 0}:${JSON.stringify(lastParts?.at(-1) ?? '').length}:${lastLive?.status ?? ''}:${view}`;

  // Refresh the change count while the agent works (edits and commands change files).
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void queryClient.invalidateQueries({ queryKey: ['code-changes', conversationId] }), 4000);
    return () => clearInterval(timer);
  }, [running, conversationId, queryClient]);

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
  if (error || !data || !task?.code) {
    return (
      <EmptyState
        className="h-full"
        icon={<FolderGit2 className="size-5" />}
        title="This session is gone"
        description="It may have been deleted."
        action={
          <button className="text-[13.5px] text-brand" onClick={() => void navigate({ to: '/code' })}>
            Start a new session
          </button>
        }
      />
    );
  }

  const code = task.code;
  const planReady = !running && code.mode === 'plan' && lastMessage?.role === 'assistant' && lastMessage.status === 'complete';

  const onCommand = async (name: string, rest: string) => {
    switch (name) {
      case '/init':
        if (code.mode !== 'code') await invoke('code:setMode', conversationId, 'code', task.permissionMode === 'auto-edits');
        return rest.trim() ? `${INIT_PROMPT}\n\nAlso: ${rest.trim()}` : INIT_PROMPT;
      case '/memory': {
        const memory = await invoke('code:memory', conversationId);
        if (!memory.exists) await invoke('code:writeFile', conversationId, memory.path, MEMORY_TEMPLATE);
        openFile(conversationId, memory.path);
        return null;
      }
      case '/btw':
        setSideChatOpen(true);
        if (rest.trim()) useCodeUi.getState().setSideChatDraft(conversationId, rest.trim());
        return null;
      default:
        return undefined;
    }
  };

  return (
    <div className="flex h-full min-w-0">
      {slot && createPortal(<SessionHeader conversation={data.conversation} task={task} status={status} />, slot)}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="relative mt-9 min-h-0 flex-1">
          <div
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
            }}
            className="h-full overflow-y-auto"
          >
            <OpenFileContext.Provider value={(file) => openFile(conversationId, file)}>
              <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 pt-6 pb-10">
                {path.map((message) =>
                  message.role === 'user' ? <UserTurn key={message.id} message={message} /> : <AgentTurn key={message.id} message={message} live={streams[message.id]} conversation={data.conversation} view={view} />,
                )}
              </div>
            </OpenFileContext.Provider>
          </div>
          {sideChatOpen && <SideChat conversationId={conversationId} onClose={() => setSideChatOpen(false)} />}
          {!atBottom && (
            <button
              aria-label="Jump to latest"
              onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })}
              className="absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-composer-border bg-composer text-fg-2 shadow-lg hover:text-foreground"
            >
              <ArrowDown className="size-4" />
            </button>
          )}
        </div>
        <div className="mx-auto w-full max-w-[820px] px-6 pb-3">
          <TodoStrip todos={task.todos} running={!!running} />
          {planReady && <PlanReady conversationId={conversationId} />}
          <Composer
            variant="code"
            conversationId={conversationId}
            streamingMessageId={running?.id ?? null}
            codeMode={{ mode: code.mode, autoAcceptEdits: task.permissionMode === 'auto-edits' && code.mode === 'code' }}
            onCommand={onCommand}
            autoFocus
          />
          <div className="mt-2 truncate text-center text-[11.5px] text-muted-foreground" title={task.workDir}>
            {code.worktree ? `Working in a worktree on ${code.branch}` : code.isGit ? `Working in ${code.repoName} on ${code.branch ?? 'a detached HEAD'}` : `Working in ${code.repoName}`} · {codePermissionMode(code.mode, false) === 'plan' ? 'read-only' : 'review changes before you merge or ship them'}
          </div>
        </div>
      </div>
      <SidePane conversationId={conversationId} running={!!running} changeCount={changes.data?.files.length} />
    </div>
  );
}
