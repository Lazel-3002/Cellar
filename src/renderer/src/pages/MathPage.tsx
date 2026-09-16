import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  ArrowDown,
  ChevronDown,
  Copy,
  Download,
  Ellipsis,
  FileText,
  FileImage,
  ListChecks,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Redo2,
  Sigma,
  Square,
  Star,
  Trash,
  Undo2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { branchPath } from '@shared/message-tree';
import { paperStyle } from '@shared/math/render';
import type { TaskStatus } from '@shared/types/agent';
import type { MathBoard, MathBoardSummary, MathExportFormat, MathPaper } from '@shared/types/math';
import { CellarMark } from '@/components/brand/Logo';
import { Composer } from '@/components/composer/Composer';
import { addBlock } from '@/components/math/actions';
import { BlockView } from '@/components/math/Blocks';
import { MathStyles, MathText } from '@/components/math/MathText';
import { MathPanel } from '@/components/math/Panel';
import { AgentTurn, UserTurn } from '@/components/task/Transcript';
import { IconButton } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Badge, EmptyState, Spinner } from '@/components/ui/misc';
import { invoke, onEvent } from '@/lib/ipc';
import { useConversation } from '@/lib/queries';
import { cn, relativeTime } from '@/lib/utils';
import { selectedBlock, useMathEditor, useMathLayout } from '@/stores/math';
import { isLive, useStreams } from '@/stores/streams';
import { useUi } from '@/stores/ui';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

const IDEAS: Array<{ label: string; prompt: string; topic: string }> = [
  {
    label: 'Teach me the Pythagorean theorem',
    prompt: 'Teach me the Pythagorean theorem: the rule, a drawing of a right triangle with legs 3 and 4, a worked example finding the hypotenuse, and one where a leg is missing and the answer is a root. Then give me 4 practice questions.',
    topic: 'Right triangles',
  },
  {
    label: 'Trigonometric ratios in a right triangle',
    prompt: 'Explain sin, cos, tan and cot in a right triangle. Draw a 3-4-5 triangle, work out all four ratios for one of its acute angles step by step, add the table of values at 30°, 45° and 60°, and finish with 5 practice questions.',
    topic: 'Trigonometry',
  },
  { label: 'Practice test on fractions', prompt: 'Make me a 10-question practice test on fractions, medium level, and a short reminder of how to add fractions with different denominators first.', topic: 'Fractions' },
  { label: 'Solve quadratic equations step by step', prompt: 'Show me how to solve quadratic equations with the discriminant. Work through x² - 5x + 6 = 0 and x² - 2 = 0 step by step, then graph y = x² - 5x + 6 and give me 5 to try.', topic: 'Quadratic equations' },
  { label: 'Areas and perimeters', prompt: 'Give me a study sheet on the area and perimeter of squares, rectangles, triangles and circles: the formulas with a figure for each, one worked example each, and a 6-question test.', topic: 'Area and perimeter' },
];

// ---------------------------------------------------------------------------
// Home

export function MathHomePage() {
  const navigate = useNavigate();
  const setPendingPrompt = useUi((s) => s.setPendingPrompt);
  const setIncognito = useUi((s) => s.setIncognito);
  const queryClient = useQueryClient();
  const [paper, setPaper] = useState<MathPaper>('grid');
  const boards = useQuery({ queryKey: ['boards'], queryFn: () => invoke('math:list') });
  useEffect(() => setIncognito(false), [setIncognito]);
  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['boards'] });
    const offs = [onEvent('math:changed', refresh), onEvent('chat:changed', refresh)];
    return () => offs.forEach((off) => off());
  }, [queryClient]);

  const blank = async () => {
    try {
      const { conversationId } = await invoke('math:create', { paper });
      void navigate({ to: '/math/$conversationId', params: { conversationId } });
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 pt-9">
      <MathStyles />
      <div className="mx-auto w-full max-w-[760px] pt-[calc(16vh-36px)] pb-16">
        <h1 className="mb-[30px] flex items-center justify-center gap-3 text-center font-serif text-[38px] leading-none tracking-[-0.01em] text-foreground">
          <CellarMark className="size-[32px]" />
          <span>What are we studying?</span>
        </h1>
        <Composer variant="math-home" mathStart={{ paper }} autoFocus onSent={(r) => void navigate({ to: '/math/$conversationId', params: { conversationId: r.conversationId } })} />
        <div className="mt-3 flex flex-wrap items-center gap-1.5 px-2" data-testid="math-papers">
          {(['grid', 'dots', 'lined', 'plain'] as MathPaper[]).map((value) => (
            <button
              key={value}
              onClick={() => setPaper(value)}
              className={cn('no-drag flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[13px] capitalize', paper === value ? 'border-brand/60 bg-brand/10 text-foreground' : 'border-composer-border text-fg-2 hover:bg-hover hover:text-foreground')}
            >
              <span className="size-3.5 rounded-[3px] border border-current/40" style={paperStyle(value)} />
              {value === 'grid' ? 'Squared' : value === 'dots' ? 'Dotted' : value === 'lined' ? 'Lined' : 'Plain'}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={() => void blank()} className="no-drag h-7 rounded-lg px-2 text-[13px] text-brand hover:bg-hover" data-testid="math-blank">
            Empty board
          </button>
        </div>

        <div className="mt-[30px] px-4 text-[12.5px] text-muted-foreground">Ideas</div>
        <div className="mt-2 px-4">
          {IDEAS.map((idea) => (
            <button key={idea.label} onClick={() => setPendingPrompt(idea.prompt)} className="group flex h-11 w-full items-center gap-4 rounded-lg text-left">
              <span className="flex size-[26px] items-center justify-center rounded-md border border-tile text-muted-foreground group-hover:text-foreground">
                <Sigma className="size-4" strokeWidth={1.5} />
              </span>
              <span className="text-[15px] font-medium text-foreground">{idea.label}</span>
            </button>
          ))}
        </div>

        {(boards.data?.length ?? 0) > 0 && (
          <>
            <div className="mt-[30px] px-4 text-[12.5px] text-muted-foreground">Your boards</div>
            <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 px-4" data-testid="board-list">
              {boards.data!.map((board) => (
                <BoardCard key={board.id} board={board} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BoardCard({ board }: { board: MathBoardSummary }) {
  const navigate = useNavigate();
  const open = () => void navigate({ to: '/math/$conversationId', params: { conversationId: board.conversationId } });
  const counts = [
    board.counts.derivations ? `${board.counts.derivations} worked` : '',
    board.counts.figures ? `${board.counts.figures} figures` : '',
    board.counts.quizzes ? `${board.counts.quizzes} tests` : '',
    board.counts.sketches ? `${board.counts.sketches} sketches` : '',
  ].filter(Boolean);
  return (
    <div className="group relative overflow-hidden rounded-xl border border-divider bg-card transition-colors hover:border-composer-border">
      <button onClick={open} className="block w-full text-left">
        <div className="flex h-[92px] items-center justify-center border-b border-divider px-3 text-center" style={paperStyle('grid')}>
          {board.preview ? <MathText text={board.preview} className="line-clamp-2 text-[17px] text-foreground" /> : <Sigma className="size-6 text-muted-foreground" strokeWidth={1.3} />}
        </div>
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-medium text-foreground">{board.title}</span>
            {board.starred && <Star className="size-3 shrink-0 fill-current text-muted-foreground" />}
            {board.taskStatus === 'running' && <Spinner className="size-3 text-brand" />}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {board.topic || `${board.blockCount} block${board.blockCount === 1 ? '' : 's'}`}
            {counts.length ? ` · ${counts.join(' · ')}` : ''} · {relativeTime(board.updatedAt)}
          </div>
        </div>
      </button>
      <Menu>
        <MenuTrigger asChild>
          <button aria-label="Board options" className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground data-[state=open]:opacity-100">
            <Ellipsis className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<Copy />} onSelect={() => void invoke('math:duplicate', board.conversationId).catch((err) => toast.error(errorText(err)))}>
            Duplicate
          </MenuItem>
          <MenuItem icon={<Star />} onSelect={() => void invoke('chat:star', board.conversationId, !board.starred)}>
            {board.starred ? 'Unstar' : 'Star'}
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash />} destructive onSelect={() => void invoke('chat:delete', [board.conversationId])}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor

const STATUS: Partial<Record<TaskStatus, { label: string; tone: 'brand' | 'danger' | 'warning' }>> = {
  running: { label: 'Working it out', tone: 'brand' },
  waiting: { label: 'Needs your approval', tone: 'warning' },
  error: { label: 'Failed', tone: 'danger' },
};

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

const menuOpen = () => !!document.querySelector('[role="menu"], [role="dialog"], [role="listbox"]');

async function exportBoard(board: MathBoard, format: MathExportFormat, answers = true) {
  const id = toast.loading(format === 'pdf' ? 'Rendering the PDF…' : format === 'png' ? 'Rendering the image…' : 'Writing the study sheet…');
  try {
    const path = await invoke('math:export', { boardId: board.id, format, answers });
    if (!path) return toast.dismiss(id);
    toast.success('Exported', { id, description: path, action: { label: 'Show', onClick: () => void invoke('system:showInFolder', path) } });
  } catch (err) {
    toast.error('Export failed', { id, description: errorText(err) });
  }
}

function MathHeader({ conversationId, status }: { conversationId: string; status: TaskStatus | null }) {
  const navigate = useNavigate();
  const board = useMathEditor((s) => s.board)!;
  const canUndo = useMathEditor((s) => s.past.length > 0);
  const canRedo = useMathEditor((s) => s.future.length > 0);
  const saving = useMathEditor((s) => s.revision !== s.savedRevision);
  const store = useMathEditor.getState;
  const { chatOpen, setChatOpen, panelOpen, setPanelOpen, setPanelTab } = useMathLayout();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(board.title);
  useEffect(() => setTitle(board.title), [board.title]);

  const commitTitle = () => {
    setRenaming(false);
    if (title.trim() && title !== board.title) void invoke('chat:rename', conversationId, title);
  };
  const badge = status ? STATUS[status] : undefined;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-3">
      <Sigma className="no-drag size-4 shrink-0 text-muted-foreground" />
      {renaming ? (
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitTitle();
            if (event.key === 'Escape') setRenaming(false);
          }}
          className="no-drag h-7 w-56 rounded-md border border-brand/50 bg-composer px-2 text-[14px] outline-none"
        />
      ) : (
        <Menu>
          <MenuTrigger asChild>
            <button data-testid="board-title" className="no-drag flex h-7 max-w-[260px] min-w-0 items-center gap-1 rounded-md px-1.5 text-[14px] text-fg-2 hover:bg-hover hover:text-foreground">
              <span className="truncate">{board.title}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
              Rename
            </MenuItem>
            <MenuItem
              icon={<Copy />}
              onSelect={async () => {
                const copy = await invoke('math:duplicate', conversationId).catch((err) => void toast.error(errorText(err)));
                if (copy) void navigate({ to: '/math/$conversationId', params: { conversationId: copy.conversationId } });
              }}
            >
              Duplicate board
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Trash />}
              destructive
              onSelect={async () => {
                if (!window.confirm(`Delete "${board.title}" and its chat?`)) return;
                await invoke('chat:delete', [conversationId]);
                void navigate({ to: '/math' });
              }}
            >
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
      {badge && (
        <Badge tone={badge.tone} className={cn('shrink-0', status === 'running' && 'animate-pulse')}>
          {badge.label}
        </Badge>
      )}
      <span className="no-drag hidden w-12 shrink-0 text-[11.5px] text-muted-foreground 2xl:inline">{saving ? 'Saving…' : ''}</span>
      <div className="flex-1" />
      <button
        onClick={() => {
          setPanelOpen(true);
          setPanelTab('insert');
        }}
        className="no-drag flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-2 hover:bg-hover hover:text-foreground"
        data-testid="board-insert"
      >
        <Plus className="size-3.5" /> Insert
      </button>
      <IconButton label="Undo  Ctrl+Z" disabled={!canUndo} onClick={() => store().undo()} data-testid="board-undo">
        <Undo2 className="size-[16px]" strokeWidth={1.8} />
      </IconButton>
      <IconButton label="Redo  Ctrl+Y" disabled={!canRedo} onClick={() => store().redo()}>
        <Redo2 className="size-[16px]" strokeWidth={1.8} />
      </IconButton>
      <Menu>
        <MenuTrigger asChild>
          <button data-testid="board-export" disabled={board.blocks.length === 0} className="no-drag flex h-7 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-40">
            <Download className="size-3.5" />
            <span className="hidden md:inline">Export</span>
          </button>
        </MenuTrigger>
        <MenuContent align="end" className="w-64">
          <MenuItem icon={<FileText />} onSelect={() => void exportBoard(board, 'pdf')}>
            PDF with the answers
          </MenuItem>
          <MenuItem icon={<ListChecks />} onSelect={() => void exportBoard(board, 'pdf', false)}>
            Test paper (answer key at the end)
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<FileImage />} onSelect={() => void exportBoard(board, 'png')}>
            PNG image
          </MenuItem>
          <MenuItem icon={<FileText />} onSelect={() => void exportBoard(board, 'md')}>
            Markdown study sheet
          </MenuItem>
        </MenuContent>
      </Menu>
      <IconButton label={chatOpen ? 'Hide chat' : 'Show chat'} active={chatOpen} onClick={() => setChatOpen(!chatOpen)}>
        <MessageSquare className="size-[16px]" strokeWidth={1.8} />
      </IconButton>
      <IconButton label={panelOpen ? 'Hide the calculator' : 'Show the calculator'} onClick={() => setPanelOpen(!panelOpen)} className="mr-2" data-testid="toggle-panel">
        {panelOpen ? <PanelRightClose className="size-[16px]" strokeWidth={1.8} /> : <PanelRightOpen className="size-[16px]" strokeWidth={1.8} />}
      </IconButton>
    </div>
  );
}

const SUGGESTIONS = ['Explain this step again, more slowly', 'Give me 5 more questions like this', 'Draw the triangle for this problem', 'Where did I go wrong?'];

function MathChat({ conversationId, running, onClose, flush }: { conversationId: string; running: string | null; onClose: () => void; flush: () => Promise<void> }) {
  const { data } = useConversation(conversationId);
  const streams = useStreams((s) => s.byMessage);
  const block = useMathEditor(selectedBlock);
  const select = useMathEditor((s) => s.select);
  const width = useMathLayout((s) => s.chatWidth);
  const setWidth = useMathLayout((s) => s.setChatWidth);
  const setPendingPrompt = useUi((s) => s.setPendingPrompt);
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [dragging, setDragging] = useState(false);
  const path = useMemo(() => (data ? branchPath(data.messages, data.conversation.currentLeafId) : []), [data]);
  const last = path[path.length - 1];
  const lastLive = last ? streams[last.id] : undefined;
  const signal = `${path.length}:${(lastLive?.parts ?? last?.parts)?.length ?? 0}:${JSON.stringify((lastLive?.parts ?? last?.parts)?.at(-1) ?? '').length}:${lastLive?.status ?? ''}`;
  useEffect(() => {
    if (atBottom && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [signal, atBottom]);

  return (
    <aside data-testid="math-chat" className="relative flex h-full shrink-0 flex-col border-r border-divider bg-background" style={{ width }}>
      <div
        className={cn('absolute top-0 -right-1 bottom-0 z-20 w-2 cursor-col-resize', dragging && 'bg-brand/30')}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => dragging && setWidth(event.clientX)}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          setDragging(false);
        }}
      />
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-divider px-3">
        <span className="text-[13px] text-fg-2">Tutor</span>
        <IconButton label="Hide chat" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          className="h-full overflow-y-auto"
          onScroll={(event) => {
            const el = event.currentTarget;
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 100);
          }}
        >
          <div className="flex flex-col gap-5 px-4 pt-4 pb-6 text-[14.5px]">
            {data && path.map((message) => (message.role === 'user' ? <UserTurn key={message.id} message={message} /> : <AgentTurn key={message.id} message={message} live={streams[message.id]} conversation={data.conversation} view="normal" />))}
            {path.length === 0 && (
              <div className="pt-6 text-center text-[13px] leading-relaxed text-muted-foreground">
                Ask for a topic, a worked example or a test. Everything is worked out with Cellar's own calculator, so the numbers are right.
              </div>
            )}
            {!running && path.length <= 2 && path.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} onClick={() => setPendingPrompt(suggestion)} className="rounded-full border border-composer-border px-2.5 py-1 text-left text-[12px] text-fg-2 hover:bg-hover hover:text-foreground">
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {!atBottom && (
          <button
            aria-label="Jump to latest"
            onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })}
            className="absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-composer-border bg-composer text-fg-2 shadow-lg"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>
      <div className="px-3 pb-3">
        {block && (
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[12px] text-muted-foreground" data-testid="math-selection-chip">
            <span className="truncate">Selected: {block.type} {block.id}</span>
            <button aria-label="Clear selection" className="hover:text-foreground" onClick={() => select(null)}>
              <X className="size-3" />
            </button>
          </div>
        )}
        <Composer variant="math" conversationId={conversationId} streamingMessageId={running} mathSelection={block ? { blockId: block.id } : null} beforeSend={flush} className="rounded-2xl" />
      </div>
    </aside>
  );
}

export function MathBoardPage() {
  const { conversationId } = useParams({ from: '/math/$conversationId' });
  const navigate = useNavigate();
  const setIncognito = useUi((s) => s.setIncognito);
  const conversation = useConversation(conversationId);
  const streams = useStreams((s) => s.byMessage);
  const boardQuery = useQuery({ queryKey: ['board', conversationId], queryFn: () => invoke('math:get', conversationId), retry: false, staleTime: Infinity });
  const board = useMathEditor((s) => (s.conversationId === conversationId ? s.board : null));
  const revision = useMathEditor((s) => s.revision);
  const savedRevision = useMathEditor((s) => s.savedRevision);
  const { chatOpen, setChatOpen, panelOpen } = useMathLayout();
  const saving = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const store = useMathEditor.getState;

  useLayoutEffect(() => setSlot(document.getElementById('titlebar-slot')), []);
  useEffect(() => setIncognito(false), [setIncognito]);
  useEffect(() => {
    if (conversation.data && conversation.data.conversation.kind !== 'math') void navigate({ to: '/', replace: true });
  }, [conversation.data, navigate]);

  useEffect(() => {
    if (boardQuery.data && (store().conversationId !== conversationId || !store().board)) store().load(conversationId, boardQuery.data);
  }, [boardQuery.data, conversationId, store]);

  const reload = useCallback(async () => {
    const latest = await invoke('math:get', conversationId);
    const s = store();
    if (s.conversationId === conversationId && latest.version > s.baseVersion) s.applyRemote(latest);
  }, [conversationId, store]);

  // Changes from the model (or another window) arrive as events.
  useEffect(
    () =>
      onEvent('math:changed', (event) => {
        if (event.conversationId !== conversationId) return;
        const s = store();
        if (event.version <= s.baseVersion) return;
        if (event.source === 'user' && saving.current) return;
        void reload().catch(() => undefined);
      }),
    [conversationId, reload, store],
  );

  const save = useCallback(async () => {
    // Wait for a save in progress, so a flush before sending covers the latest edits.
    for (let i = 0; saving.current && i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 30));
    const s = store();
    if (saving.current || !s.board || s.conversationId !== conversationId || s.revision === s.savedRevision) return;
    saving.current = true;
    const revisionAtSave = s.revision;
    try {
      const saved = await invoke('math:save', s.board, s.baseVersion);
      store().markSaved(saved.version, revisionAtSave);
    } catch (err) {
      toast.error(errorText(err));
      await reload().catch(() => undefined);
    } finally {
      saving.current = false;
    }
  }, [conversationId, reload, store]);

  useEffect(() => {
    if (revision === savedRevision) return;
    const timer = setTimeout(() => void save(), 450);
    return () => clearTimeout(timer);
  }, [revision, savedRevision, save]);
  useEffect(() => () => void save(), [save]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || menuOpen()) return;
      const s = store();
      if (!s.board) return;
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (ctrl && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        return s.undo();
      }
      if ((ctrl && key === 'y') || (ctrl && key === 'z' && event.shiftKey)) {
        event.preventDefault();
        return s.redo();
      }
      if (ctrl) return;
      if (event.key === 'Escape') return s.select(null);
      if ((event.key === 'Delete' || event.key === 'Backspace') && s.selectedId) {
        event.preventDefault();
        const id = s.selectedId;
        s.change((draft) => {
          draft.blocks = draft.blocks.filter((block) => block.id !== id);
        });
        s.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  const messages = conversation.data?.messages ?? [];
  const leaf = conversation.data?.conversation.currentLeafId ?? null;
  const path = useMemo(() => branchPath(messages, leaf), [messages, leaf]);
  const running = path.find((message) => message.role === 'assistant' && message.status === 'streaming' && (!streams[message.id] || isLive(streams[message.id])));
  const liveTask = running ? streams[running.id]?.task : undefined;
  const taskStatus = (liveTask ?? conversation.data?.conversation.task)?.status ?? null;
  const status: TaskStatus | null = running ? (taskStatus === 'waiting' ? 'waiting' : 'running') : taskStatus === 'error' ? 'error' : null;

  if (boardQuery.error) {
    return (
      <EmptyState
        className="h-full"
        icon={<Sigma className="size-5" />}
        title="This board is gone"
        description="It may have been deleted."
        action={
          <button className="text-[13.5px] text-brand" onClick={() => void navigate({ to: '/math' })}>
            Start a new board
          </button>
        }
      />
    );
  }
  if (!board) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const paper = paperStyle(board.paper);
  return (
    <div className="flex h-full min-w-0 pt-9" data-testid="math-board">
      <MathStyles />
      {slot && createPortal(<MathHeader conversationId={conversationId} status={status} />, slot)}
      {chatOpen && <MathChat conversationId={conversationId} running={running?.id ?? null} onClose={() => setChatOpen(false)} flush={save} />}
      <div className="relative min-w-0 flex-1 overflow-y-auto" ref={scroller} style={{ backgroundImage: paper.backgroundImage, backgroundSize: paper.backgroundSize }} onClick={(event) => event.target === event.currentTarget && store().select(null)}>
        <div className="mx-auto w-full max-w-[860px] px-6 py-8">
          <h1 className="px-4 font-serif text-[26px] leading-tight text-foreground">{board.title}</h1>
          {board.topic && <p className="mt-1 px-4 text-[13px] text-muted-foreground">{board.topic}</p>}
          <div className="mt-4 flex flex-col gap-1">
            {board.blocks.map((block, index) => (
              <BlockView key={block.id} block={block} index={index} count={board.blocks.length} paper={board.paper} />
            ))}
          </div>
          {board.blocks.length === 0 && (
            <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed border-composer-border px-6 py-10 text-center">
              <Square className="size-6 text-muted-foreground" strokeWidth={1.3} />
              <div className="text-[14px] text-foreground">This board is empty</div>
              <p className="max-w-sm text-[13px] text-muted-foreground">Ask the tutor for a topic, or add something yourself: a formula, worked steps, a figure or a whiteboard to draw on.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={() => addBlock({ type: 'text', body: '' })} className="h-8 rounded-lg border border-composer-border px-3 text-[13px] text-fg-2 hover:bg-hover hover:text-foreground">
                  Explanation
                </button>
                <button onClick={() => addBlock({ type: 'sketch', height: 360, strokes: [] })} className="h-8 rounded-lg border border-composer-border px-3 text-[13px] text-fg-2 hover:bg-hover hover:text-foreground" data-testid="empty-whiteboard">
                  Whiteboard
                </button>
                <button
                  onClick={() => addBlock({ type: 'figure', figure: { kind: 'right-triangle', labels: ['A', 'B', 'C'], sides: [3, 4], rightAngleAt: 1 } })}
                  className="h-8 rounded-lg border border-composer-border px-3 text-[13px] text-fg-2 hover:bg-hover hover:text-foreground"
                >
                  Triangle
                </button>
              </div>
            </div>
          )}
        </div>
        {!chatOpen && (
          <button onClick={() => setChatOpen(true)} className="fixed bottom-4 left-4 flex h-9 items-center gap-2 rounded-full border border-composer-border bg-composer px-3.5 text-[13px] text-fg-2 shadow-lg hover:text-foreground">
            <MessageSquare className="size-4" /> Tutor
            {running && <Spinner className="size-3.5 text-brand" />}
          </button>
        )}
      </div>
      {panelOpen && <MathPanel />}
    </div>
  );
}
