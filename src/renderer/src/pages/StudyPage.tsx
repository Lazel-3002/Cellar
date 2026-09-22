import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  ArrowDown,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
  Eraser,
  FileUp,
  Highlighter,
  History,
  List,
  MessageSquare,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  PenLine,
  Pencil,
  Plus,
  Redo2,
  ScanText,
  Search,
  StickyNote,
  Trash,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { branchPath } from '@shared/message-tree';
import { HIGHLIGHT_COLORS, PEN_COLORS } from '@shared/study/annotations';
import { formatPageList, scopePages, sectionOf, sectionStart } from '@shared/study/pages';
import type { TaskStatus } from '@shared/types/agent';
import type { Book, BookSummary, StudyContext, StudyImportProgress, StudyMode, StudyPageHit } from '@shared/types/study';
import { CellarMark } from '@/components/brand/Logo';
import { PageLinkContext, type PageLinkTarget } from '@/components/chat/PageLinks';
import { Composer } from '@/components/composer/Composer';
import { renderPageCanvas, renderPagePng } from '@/components/study/draw';
import { StudyViewer, viewerControl } from '@/components/study/Viewer';
import { AgentTurn, UserTurn } from '@/components/task/Transcript';
import { IconButton } from '@/components/ui/button';
import { Segmented } from '@/components/ui/form';
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuTrigger, PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/menu';
import { Badge, EmptyState, Progress, Spinner, Tip } from '@/components/ui/misc';
import { useSelectedModel } from '@/lib/hooks';
import { invoke, onEvent } from '@/lib/ipc';
import { forgetBookDocument, openBookDocument } from '@/lib/pdf';
import { useConversation } from '@/lib/queries';
import { cn, relativeTime } from '@/lib/utils';
import { isLive, useStreams } from '@/stores/streams';
import { DEFAULT_SCOPE, useStudyEditor, useStudyLayout, type BookScope, type PicturesMode, type StudyTool } from '@/stores/study';
import { useUi } from '@/stores/ui';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// ---------------------------------------------------------------------------
// Covers: the first page, drawn small once and kept in this browser profile.

const coverKey = (bookId: string) => `cellar-study-cover:${bookId}`;

function readCover(bookId: string): string | null {
  try {
    return localStorage.getItem(coverKey(bookId));
  } catch {
    return null;
  }
}

async function ensureCover(bookId: string, doc: PDFDocumentProxy): Promise<void> {
  if (readCover(bookId)) return;
  try {
    const canvas = await renderPageCanvas(doc, 1, [], 360);
    localStorage.setItem(coverKey(bookId), canvas.toDataURL('image/jpeg', 0.72));
  } catch {
    // No cover; the card shows an icon.
  }
}

function forgetCover(bookId: string): void {
  try {
    localStorage.removeItem(coverKey(bookId));
  } catch {
    // Nothing kept.
  }
}

// ---------------------------------------------------------------------------
// Home: the shelf

export function StudyHomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setIncognito = useUi((s) => s.setIncognito);
  // The page you were on changes without an event, so the shelf always asks again when it opens.
  const books = useQuery({ queryKey: ['books'], queryFn: () => invoke('study:list'), staleTime: 0 });
  const [progress, setProgress] = useState<StudyImportProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => setIncognito(false), [setIncognito]);
  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['books'] });
    const offs = [onEvent('study:changed', refresh), onEvent('chat:changed', refresh), onEvent('study:progress', setProgress)];
    return () => offs.forEach((off) => off());
  }, [queryClient]);

  const add = async (paths: string[]) => {
    const pdfs = paths.filter((path) => /\.pdf$/i.test(path));
    if (pdfs.length === 0) {
      if (paths.length) toast.error('That is not a PDF', { description: 'Study opens PDF files: textbooks, worksheets, notes.' });
      return;
    }
    setBusy(true);
    try {
      const added = await invoke('study:import', pdfs);
      const first = added[0];
      for (const book of added) if (book.existing) toast(`"${book.title}" is already on your shelf`, { description: 'Opening it, with your notes.' });
      if (first) void navigate({ to: '/study/$conversationId', params: { conversationId: first.conversationId } });
    } catch (err) {
      toast.error("Couldn't add the PDF", { description: errorText(err) });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void add([...event.dataTransfer.files].map((file) => window.cellar.getPathForFile(file)).filter(Boolean));
  };

  return (
    <div className="h-full overflow-y-auto px-6 pt-9" data-testid="study-home">
      <div className="mx-auto w-full max-w-[860px] pt-[calc(12vh-36px)] pb-16">
        <h1 className="mb-3 flex items-center justify-center gap-3 text-center font-serif text-[38px] leading-none tracking-[-0.01em] text-foreground">
          <CellarMark className="size-[32px]" />
          <span>Study with your book</span>
        </h1>
        <p className="mx-auto mb-7 max-w-[560px] text-center text-[14.5px] leading-relaxed text-muted-foreground">
          Open a PDF — a textbook, a worksheet, your notes — and work through it with a tutor beside it. Write on the pages like paper; the tutor reads what you write.
        </p>
        <div
          data-testid="study-drop"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn('flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-9 text-center transition-colors', dragging ? 'border-brand bg-brand/5' : 'border-composer-border bg-composer/60')}
        >
          {busy ? (
            <div className="flex w-full max-w-sm flex-col items-center gap-2.5">
              <Spinner className="size-5 text-brand" />
              <div className="text-[14px] text-foreground">{progress ? `Reading ${progress.fileName}…` : 'Adding the PDF…'}</div>
              {progress && progress.total > 0 && (
                <>
                  <Progress value={(progress.done / progress.total) * 100} className="w-full" />
                  <div className="text-[12px] text-muted-foreground tabular-nums">
                    {progress.done} / {progress.total} pages
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <FileUp className="size-7 text-muted-foreground" strokeWidth={1.4} />
              <div className="text-[15px] text-foreground">
                Drop a PDF here, or{' '}
                <button data-testid="study-add" className="text-brand hover:underline" onClick={() => void invoke('system:pickFiles', 'pdf').then(add)}>
                  choose one
                </button>
              </div>
              <div className="max-w-md text-[12.5px] text-muted-foreground">It stays on this computer. Cellar keeps its own copy, so your original file is never changed.</div>
            </>
          )}
        </div>

        {(books.data?.length ?? 0) > 0 && (
          <>
            <div className="mt-9 px-1 text-[12.5px] text-muted-foreground">Your books</div>
            <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4 px-1" data-testid="book-list">
              {books.data!.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BookCard({ book }: { book: BookSummary }) {
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(book.title);
  const cover = readCover(book.id);
  const open = async () => {
    try {
      const { conversationId } = book.conversationId ? { conversationId: book.conversationId } : await invoke('study:open', book.id);
      void navigate({ to: '/study/$conversationId', params: { conversationId } });
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const commit = () => {
    setRenaming(false);
    if (title.trim() && title !== book.title) void invoke('study:rename', book.id, title).catch((err) => toast.error(errorText(err)));
  };
  const scanned = book.scannedPages > book.pageCount / 2;
  return (
    <div className="group relative overflow-hidden rounded-xl border border-divider bg-card transition-colors hover:border-composer-border" data-testid="book-card">
      <button onClick={() => void open()} className="block w-full text-left">
        <div className="flex h-[200px] items-center justify-center overflow-hidden border-b border-divider bg-[var(--study-desk)]">
          {cover ? <img src={cover} alt="" className="h-[184px] w-auto rounded-[2px] object-contain shadow-md" /> : <BookOpen className="size-8 text-muted-foreground" strokeWidth={1.2} />}
        </div>
      </button>
      <div className="px-3 py-2.5">
        {renaming ? (
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') setRenaming(false);
            }}
            className="h-7 w-full rounded-md border border-brand/50 bg-composer px-2 text-[13.5px] outline-none"
          />
        ) : (
          <button onClick={() => void open()} className="block w-full truncate text-left text-[13.5px] font-medium text-foreground" title={book.fileName}>
            {book.title}
          </button>
        )}
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
          <span>
            p. {book.lastPage} of {book.pageCount}
            {book.annotationCount ? ` · ${book.annotationCount} note${book.annotationCount === 1 ? '' : 's'}` : ''} · {relativeTime(book.updatedAt)}
          </span>
          {scanned && <Badge tone="outline">Scanned</Badge>}
        </div>
      </div>
      <Menu>
        <MenuTrigger asChild>
          <button aria-label="Book options" className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-background/85 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground data-[state=open]:opacity-100">
            <Ellipsis className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem
            icon={<MessageSquarePlus />}
            onSelect={async () => {
              const { conversationId } = await invoke('study:newChat', book.id);
              void navigate({ to: '/study/$conversationId', params: { conversationId } });
            }}
          >
            New chat about it
          </MenuItem>
          <MenuItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
            Rename
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={<Trash />}
            destructive
            onSelect={async () => {
              if (!window.confirm(`Remove "${book.title}" from the shelf, with its notes and chats? Your original PDF file is not touched.`)) return;
              await invoke('study:delete', book.id).catch((err) => toast.error(errorText(err)));
              forgetCover(book.id);
              forgetBookDocument(book.id);
            }}
          >
            Remove from shelf
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reader

const STATUS: Partial<Record<TaskStatus, { label: string; tone: 'brand' | 'danger' | 'warning' }>> = {
  running: { label: 'Thinking', tone: 'brand' },
  waiting: { label: 'Needs your approval', tone: 'warning' },
  error: { label: 'Failed', tone: 'danger' },
};

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

const menuOpen = () => !!document.querySelector('[role="menu"], [role="dialog"], [role="listbox"]');

const TOOL_KEYS: Record<string, StudyTool> = { v: 'select', h: 'highlight', p: 'pen', m: 'marker', t: 'text', n: 'note', e: 'eraser' };

/** What goes with the next message, from the scope picked for this book. */
export function studyContextFor(book: Book, page: number, scope: BookScope, selection: { page: number; text: string } | null): StudyContext {
  const from = scope.scope === 'upto' ? (scope.from ?? sectionStart(book.outline, page)) : undefined;
  return {
    page,
    scope: scope.scope,
    ...(scope.scope === 'pages' && scope.pages.trim() ? { pages: scope.pages.trim() } : {}),
    ...(from ? { from } : {}),
    ...(selection ? { selection } : {}),
  };
}

export function StudyReaderPage() {
  const { conversationId } = useParams({ from: '/study/$conversationId' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setIncognito = useUi((s) => s.setIncognito);
  const session = useQuery({ queryKey: ['study', conversationId], queryFn: () => invoke('study:get', conversationId), retry: false, staleTime: Infinity });
  const bookId = session.data?.book.id ?? null;
  const book = useStudyEditor((s) => (bookId && s.bookId === bookId ? s.book : null));
  const revision = useStudyEditor((s) => s.revision);
  const savedRevision = useStudyEditor((s) => s.savedRevision);
  const conversation = useConversation(conversationId);
  const streams = useStreams((s) => s.byMessage);
  const chatOpen = useStudyLayout((s) => s.chatOpen);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const saving = useRef(false);
  const store = useStudyEditor.getState;

  useLayoutEffect(() => setSlot(document.getElementById('titlebar-slot')), []);
  useEffect(() => setIncognito(false), [setIncognito]);
  useEffect(() => {
    if (conversation.data && conversation.data.conversation.kind !== 'study') void navigate({ to: '/', replace: true });
  }, [conversation.data, navigate]);

  useEffect(() => {
    if (session.data && (store().bookId !== session.data.book.id || !store().book)) store().load(session.data.book);
  }, [session.data, store]);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    setDoc(null);
    setDocError(null);
    openBookDocument(bookId)
      .then((opened) => {
        if (cancelled) return;
        setDoc(opened);
        void ensureCover(bookId, opened);
      })
      .catch((err) => !cancelled && setDocError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const reload = useCallback(async () => {
    const latest = await invoke('study:get', conversationId);
    const s = store();
    if (s.bookId === latest.book.id && latest.book.version > s.baseVersion) s.applyRemote(latest.book);
  }, [conversationId, store]);

  // Changes from the model (or another window) arrive as events.
  useEffect(
    () =>
      onEvent('study:changed', (event) => {
        const s = store();
        if (event.bookId !== s.bookId || event.version <= s.baseVersion) return;
        if (event.source === 'user' && saving.current) return;
        void reload().catch(() => undefined);
      }),
    [reload, store],
  );

  const save = useCallback(async () => {
    for (let i = 0; saving.current && i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 30));
    const s = store();
    if (saving.current || !s.book || s.revision === s.savedRevision) return;
    saving.current = true;
    const revisionAtSave = s.revision;
    try {
      const saved = await invoke('study:save', s.book.id, s.book.annotations, s.baseVersion);
      store().markSaved(saved.version, revisionAtSave);
    } catch (err) {
      toast.error(errorText(err));
      await reload().catch(() => undefined);
    } finally {
      saving.current = false;
    }
  }, [reload, store]);

  useEffect(() => {
    if (revision === savedRevision) return;
    const timer = setTimeout(() => void save(), 450);
    return () => clearTimeout(timer);
  }, [revision, savedRevision, save]);
  useEffect(() => () => void save(), [save]);

  // Keyboard: undo/redo, delete the selected note, and a letter for each tool.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || menuOpen()) return;
      const s = store();
      if (!s.book) return;
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
      if (ctrl || event.altKey) return;
      if (event.key === 'Escape') {
        s.select(null);
        useStudyLayout.getState().setTool('select');
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && s.selectedId) {
        event.preventDefault();
        const id = s.selectedId;
        s.change((all) => all.filter((a) => a.id !== id));
        s.select(null);
        return;
      }
      const tool = TOOL_KEYS[key];
      if (tool && !window.getSelection()?.toString()) useStudyLayout.getState().setTool(tool);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  const messages = conversation.data?.messages ?? [];
  const leaf = conversation.data?.conversation.currentLeafId ?? null;
  const path = useMemo(() => branchPath(messages, leaf), [messages, leaf]);
  const running = path.find((message) => message.role === 'assistant' && message.status === 'streaming' && (!streams[message.id] || isLive(streams[message.id])));
  const liveTask = running ? streams[running.id]?.task : undefined;
  const task = liveTask ?? conversation.data?.conversation.task;
  const taskStatus = task?.status ?? null;
  const status: TaskStatus | null = running ? (taskStatus === 'waiting' ? 'waiting' : 'running') : taskStatus === 'error' ? 'error' : null;
  const mode: StudyMode = task?.study?.mode ?? session.data?.mode ?? 'tutor';
  const setMode = (next: StudyMode) =>
    void invoke('study:setMode', conversationId, next)
      .then(() => queryClient.invalidateQueries({ queryKey: ['study', conversationId] }))
      .catch((err) => toast.error(errorText(err)));

  const pageLinks = useMemo<PageLinkTarget | null>(() => (book ? { pageCount: book.pageCount, goTo: (page) => viewerControl.current?.goTo(page) } : null), [book?.pageCount]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session.error) {
    return (
      <EmptyState
        className="h-full"
        icon={<BookOpen className="size-5" />}
        title="This book is gone"
        description="It may have been removed from the shelf."
        action={
          <button className="text-[13.5px] text-brand" onClick={() => void navigate({ to: '/study' })}>
            Back to the shelf
          </button>
        }
      />
    );
  }
  if (!book) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 pt-9" data-testid="study-reader">
      {slot && createPortal(<StudyHeader book={book} conversationId={conversationId} status={status} />, slot)}
      <PageLinkContext.Provider value={pageLinks}>
        {chatOpen && <StudyChat book={book} doc={doc} conversationId={conversationId} running={running?.id ?? null} mode={mode} onMode={setMode} flush={save} />}
      </PageLinkContext.Provider>
      <div className="flex min-w-0 flex-1 flex-col">
        <StudyToolbar book={book} />
        <div className="relative min-h-0 flex-1">
          {doc ? (
            <StudyViewer book={book} doc={doc} />
          ) : docError ? (
            <EmptyState className="h-full" icon={<BookOpen className="size-5" />} title="The PDF could not be opened" description={docError} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          )}
          <UnseenPill />
        </div>
      </div>
    </div>
  );
}

/** "The tutor wrote on p. 14" when it wrote somewhere the user is not looking. */
function UnseenPill() {
  const unseen = useStudyEditor((s) => s.unseen);
  const clear = useStudyEditor((s) => s.clearUnseen);
  if (unseen.length === 0) return null;
  return (
    <div className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-composer-border bg-composer py-1 pr-1 pl-3 text-[12.5px] shadow-lg animate-fade-in" data-testid="study-unseen">
      <span className="text-fg-2">The tutor wrote on</span>
      {unseen.slice(0, 4).map((page) => (
        <button key={page} className="rounded-full px-2 py-0.5 text-brand hover:bg-hover" onClick={() => viewerControl.current?.goTo(page)}>
          p. {page}
        </button>
      ))}
      <button aria-label="Dismiss" className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-hover hover:text-foreground" onClick={clear}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}

async function exportBook(book: Book) {
  const id = toast.loading('Writing a copy with your notes…');
  try {
    const path = await invoke('study:export', book.id);
    if (!path) return toast.dismiss(id);
    toast.success('Exported', { id, description: path, action: { label: 'Show', onClick: () => void invoke('system:showInFolder', path) } });
  } catch (err) {
    toast.error('Export failed', { id, description: errorText(err) });
  }
}

function StudyHeader({ book, conversationId, status }: { book: Book; conversationId: string; status: TaskStatus | null }) {
  const navigate = useNavigate();
  const canUndo = useStudyEditor((s) => s.past.length > 0);
  const canRedo = useStudyEditor((s) => s.future.length > 0);
  const saving = useStudyEditor((s) => s.revision !== s.savedRevision);
  const store = useStudyEditor.getState;
  const { chatOpen, setChatOpen } = useStudyLayout();
  const chats = useQuery({ queryKey: ['book-chats', book.id], queryFn: () => invoke('study:chats', book.id) });
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(book.title);
  useEffect(() => setTitle(book.title), [book.title]);
  useEffect(() => onEvent('chat:changed', () => void chats.refetch()), [chats]);
  const badge = status ? STATUS[status] : undefined;

  const commitTitle = () => {
    setRenaming(false);
    if (title.trim() && title !== book.title) {
      void invoke('study:rename', book.id, title)
        .then(() => store().book && store().load({ ...store().book!, title: title.trim() }))
        .catch((err) => toast.error(errorText(err)));
    }
  };
  const newChat = async () => {
    const { conversationId: next } = await invoke('study:newChat', book.id);
    void navigate({ to: '/study/$conversationId', params: { conversationId: next } });
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-3">
      <BookOpen className="no-drag size-4 shrink-0 text-muted-foreground" />
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
            <button data-testid="book-title" className="no-drag flex h-7 max-w-[300px] min-w-0 items-center gap-1 rounded-md px-1.5 text-[14px] text-fg-2 hover:bg-hover hover:text-foreground">
              <span className="truncate">{book.title}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </MenuTrigger>
          <MenuContent className="w-64">
            <MenuItem icon={<MessageSquarePlus />} onSelect={() => void newChat()}>
              New chat about this book
            </MenuItem>
            {(chats.data?.length ?? 0) > 1 && (
              <MenuSub label="Earlier chats" icon={<History />}>
                {chats.data!.map((chat) => (
                  <MenuItem key={chat.conversationId} onSelect={() => void navigate({ to: '/study/$conversationId', params: { conversationId: chat.conversationId } })}>
                    <span className={cn('max-w-52 truncate', chat.conversationId === conversationId && 'font-medium text-foreground')}>{chat.title}</span>
                  </MenuItem>
                ))}
              </MenuSub>
            )}
            <MenuItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
              Rename
            </MenuItem>
            <MenuItem icon={<Download />} onSelect={() => void exportBook(book)}>
              Export with my notes
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Trash />}
              destructive
              onSelect={async () => {
                if (!window.confirm(`Remove "${book.title}" from the shelf, with its notes and chats? Your original PDF file is not touched.`)) return;
                await invoke('study:delete', book.id);
                forgetCover(book.id);
                forgetBookDocument(book.id);
                void navigate({ to: '/study' });
              }}
            >
              Remove from shelf
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
      <IconButton label="Undo  Ctrl+Z" disabled={!canUndo} onClick={() => store().undo()} data-testid="study-undo">
        <Undo2 className="size-[16px]" strokeWidth={1.8} />
      </IconButton>
      <IconButton label="Redo  Ctrl+Y" disabled={!canRedo} onClick={() => store().redo()}>
        <Redo2 className="size-[16px]" strokeWidth={1.8} />
      </IconButton>
      <button data-testid="study-export" onClick={() => void exportBook(book)} className="no-drag flex h-7 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-[13px] font-medium text-background hover:opacity-90">
        <Download className="size-3.5" />
        <span className="hidden md:inline">Export</span>
      </button>
      <IconButton label={chatOpen ? 'Hide chat' : 'Show chat'} active={chatOpen} onClick={() => setChatOpen(!chatOpen)} className="mr-2">
        <MessageSquare className="size-[16px]" strokeWidth={1.8} />
      </IconButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar over the pages

const TOOLS: Array<{ tool: StudyTool; label: string; icon: typeof MousePointer2 }> = [
  { tool: 'select', label: 'Select text  V', icon: MousePointer2 },
  { tool: 'highlight', label: 'Highlighter  H', icon: Highlighter },
  { tool: 'pen', label: 'Pen  P', icon: PenLine },
  { tool: 'marker', label: 'Marker  M', icon: ScanText },
  { tool: 'text', label: 'Type on the page  T', icon: Type },
  { tool: 'note', label: 'Sticky note  N', icon: StickyNote },
  { tool: 'eraser', label: 'Eraser  E', icon: Eraser },
];

function StudyToolbar({ book }: { book: Book }) {
  const { tool, setTool, penColor, setPenColor, highlightColor, setHighlightColor } = useStudyLayout();
  const page = useStudyEditor((s) => s.page);
  const [pageInput, setPageInput] = useState(String(page));
  useEffect(() => setPageInput(String(page)), [page]);
  const colors = tool === 'highlight' || tool === 'marker' ? HIGHLIGHT_COLORS : tool === 'pen' || tool === 'text' ? PEN_COLORS : null;
  const current = tool === 'highlight' || tool === 'marker' ? highlightColor : penColor;
  const section = sectionOf(book.outline, page);
  const go = () => {
    const n = Number(pageInput);
    if (Number.isFinite(n) && n >= 1) viewerControl.current?.goTo(n);
    else setPageInput(String(page));
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-divider bg-background px-2" data-testid="study-toolbar">
      <div className="flex items-center gap-0.5 rounded-lg bg-seg p-0.5">
        {TOOLS.map(({ tool: value, label, icon: Icon }) => (
          <Tip key={value} label={label}>
            <button
              aria-label={label}
              data-testid={`study-tool-${value}`}
              aria-pressed={tool === value}
              onClick={() => setTool(value)}
              className={cn('flex size-7 items-center justify-center rounded-md text-fg-2 hover:text-foreground', tool === value && 'bg-background text-foreground shadow-sm')}
            >
              <Icon className="size-[15px]" strokeWidth={1.8} />
            </button>
          </Tip>
        ))}
      </div>
      {colors && (
        <div className="ml-1 flex items-center gap-1">
          {Object.entries(colors).map(([name, value]) => (
            <button
              key={name}
              aria-label={name}
              onClick={() => (tool === 'highlight' || tool === 'marker' ? setHighlightColor(value) : setPenColor(value))}
              className={cn('size-[18px] rounded-full border border-black/10', current === value && 'ring-2 ring-brand/70 ring-offset-1 ring-offset-background')}
              style={{ background: value }}
            />
          ))}
        </div>
      )}
      <div className="flex-1" />
      {book.outline.length > 0 && (
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-7 max-w-[220px] items-center gap-1.5 rounded-md px-2 text-[12.5px] text-fg-2 hover:bg-hover hover:text-foreground" data-testid="study-contents">
              <List className="size-3.5 shrink-0" />
              <span className="truncate">{section?.title ?? 'Contents'}</span>
            </button>
          </MenuTrigger>
          <MenuContent align="end" className="max-h-[60vh] w-80 overflow-y-auto">
            {book.outline.map((item, index) => (
              <MenuItem key={index} onSelect={() => viewerControl.current?.goTo(item.page)}>
                <span className="flex w-full items-center gap-2" style={{ paddingLeft: item.depth * 12 }}>
                  <span className={cn('min-w-0 flex-1 truncate', item.depth === 0 && 'font-medium')}>{item.title}</span>
                  <span className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums">{item.page}</span>
                </span>
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      )}
      <BookSearch book={book} />
      <div className="mx-1 h-5 w-px bg-divider" />
      <IconButton label="Previous page" disabled={page <= 1} onClick={() => viewerControl.current?.goTo(page - 1)}>
        <ChevronLeft className="size-4" />
      </IconButton>
      <div className="flex items-center gap-1 text-[12.5px] text-muted-foreground tabular-nums">
        <input
          aria-label="Page"
          data-testid="study-page-input"
          value={pageInput}
          onChange={(event) => setPageInput(event.target.value.replace(/[^\d]/g, ''))}
          onKeyDown={(event) => event.key === 'Enter' && go()}
          onBlur={go}
          className="h-6 w-10 rounded-md border border-composer-border bg-composer text-center text-foreground outline-none focus:border-brand/60"
        />
        <span>/ {book.pageCount}</span>
      </div>
      <IconButton label="Next page" disabled={page >= book.pageCount} onClick={() => viewerControl.current?.goTo(page + 1)}>
        <ChevronRight className="size-4" />
      </IconButton>
      <div className="mx-1 h-5 w-px bg-divider" />
      <IconButton label="Zoom out  Ctrl+wheel" onClick={() => viewerControl.current?.zoomOut()} data-testid="study-zoom-out">
        <Minus className="size-4" />
      </IconButton>
      <ZoomMenu />
      <IconButton label="Zoom in  Ctrl+wheel" onClick={() => viewerControl.current?.zoomIn()} data-testid="study-zoom-in">
        <Plus className="size-4" />
      </IconButton>
    </div>
  );
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** The zoom on screen, and a menu to fit the page, fit the width or pick a size. */
function ZoomMenu() {
  const scale = useStudyEditor((s) => s.scale);
  const zoom = useStudyLayout((s) => s.zoom);
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="flex h-7 w-[62px] items-center justify-center gap-0.5 rounded-md text-[12.5px] text-fg-2 tabular-nums hover:bg-hover hover:text-foreground" data-testid="study-zoom">
          {Math.round(scale * 100)}%
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="w-44">
        <MenuCheckItem checked={zoom === 'page-fit'} onSelect={() => viewerControl.current?.setZoom('page-fit')}>
          Fit the page
        </MenuCheckItem>
        <MenuCheckItem checked={zoom === 'page-width'} onSelect={() => viewerControl.current?.setZoom('page-width')}>
          Fit the width
        </MenuCheckItem>
        <MenuSeparator />
        {ZOOM_STEPS.map((step) => (
          <MenuCheckItem key={step} checked={zoom === step} onSelect={() => viewerControl.current?.setZoom(step)}>
            {step * 100}%
          </MenuCheckItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function BookSearch({ book }: { book: Book }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<StudyPageHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      setHits(await invoke('study:search', book.id, query));
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-fg-2 hover:bg-hover hover:text-foreground" data-testid="study-search">
          <Search className="size-3.5" />
          <span className="hidden lg:inline">Search</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-2">
        <input
          autoFocus
          value={query}
          placeholder="Search this book…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void search()}
          className="h-8 w-full rounded-md border border-composer-border bg-composer px-2.5 text-[13px] outline-none focus:border-brand/60"
        />
        <div className="mt-1.5 max-h-[50vh] overflow-y-auto">
          {busy && (
            <div className="flex justify-center py-3">
              <Spinner className="size-4" />
            </div>
          )}
          {!busy && hits?.length === 0 && <div className="px-2 py-3 text-[12.5px] text-muted-foreground">Nothing found. Try the book's own words.</div>}
          {!busy &&
            hits?.map((hit) => (
              <button
                key={hit.page}
                onClick={() => {
                  viewerControl.current?.goTo(hit.page);
                  setOpen(false);
                }}
                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-hover"
              >
                <div className="text-[12px] font-medium text-foreground">Page {hit.page}</div>
                <div className="line-clamp-2 text-[12px] text-muted-foreground">{hit.snippet.replace(/[«»]/g, '')}</div>
              </button>
            ))}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}

// ---------------------------------------------------------------------------
// The chat beside the book

const SUGGESTIONS = ['Explain this page simply', 'Check my answers', 'Quiz me on this page', 'Summarize this chapter'];

function StudyChat({
  book,
  doc,
  conversationId,
  running,
  mode,
  onMode,
  flush,
}: {
  book: Book;
  doc: PDFDocumentProxy | null;
  conversationId: string;
  running: string | null;
  mode: StudyMode;
  onMode: (mode: StudyMode) => void;
  flush: () => Promise<void>;
}) {
  const { data } = useConversation(conversationId);
  const streams = useStreams((s) => s.byMessage);
  const width = useStudyLayout((s) => s.chatWidth);
  const setWidth = useStudyLayout((s) => s.setChatWidth);
  const setChatOpen = useStudyLayout((s) => s.setChatOpen);
  const setScope = useStudyLayout((s) => s.setScope);
  const scope = useStudyLayout((s) => s.scopes[book.id] ?? DEFAULT_SCOPE);
  const pictures = useStudyLayout((s) => s.pictures);
  const page = useStudyEditor((s) => s.page);
  const selection = useStudyEditor((s) => s.selection);
  const setPendingPrompt = useUi((s) => s.setPendingPrompt);
  const { model } = useSelectedModel();
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

  const context = studyContextFor(book, page, scope, selection);

  // A picture of the page for a vision model: always, or (auto) when the text alone would miss something.
  const extraAttachments = async (): Promise<string[]> => {
    if (!doc || !model?.capabilities.vision || pictures === 'never') return [];
    const s = useStudyEditor.getState();
    const annotations = s.book?.annotations ?? [];
    const scanned = (book.pages[s.page - 1]?.chars ?? 0) < 20;
    const handwriting = annotations.some((a) => a.page === s.page && a.type === 'ink');
    if (pictures === 'auto' && !scanned && !handwriting) return [];
    const png = await renderPagePng(doc, s.page, annotations, 1400);
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const ref = await invoke('attachments:fromBytes', `page-${s.page}.png`, 'image/png', bytes);
    return [ref.id];
  };

  return (
    <aside data-testid="study-chat" className="relative flex h-full shrink-0 flex-col border-r border-divider bg-background" style={{ width }}>
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
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-divider px-3">
        <Segmented
          size="sm"
          value={mode}
          onChange={onMode}
          options={[
            { value: 'tutor', label: 'Tutor' },
            { value: 'solve', label: 'Solve' },
          ]}
        />
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">{mode === 'tutor' ? 'Hints and checks, not answers' : 'Writes answers on the page'}</span>
        <IconButton label="Hide chat" onClick={() => setChatOpen(false)}>
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
                Ask about what you are reading, or work on the page and say "check my answers". The tutor reads the page you are on{book.pageCount > 1 ? ' — pick more below' : ''}.
              </div>
            )}
            {!running && path.length <= 2 && (
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
        <ContextBar book={book} context={context} scope={scope} onScope={(next) => setScope(book.id, next)} vision={!!model?.capabilities.vision} contextLength={model?.loadedContextLength ?? model?.contextLength ?? 8192} />
        <Composer
          variant="study"
          conversationId={conversationId}
          streamingMessageId={running}
          studyContext={context}
          beforeSend={flush}
          extraAttachments={extraAttachments}
          afterSend={() => useStudyEditor.getState().setSelection(null)}
          className="rounded-2xl"
        />
      </div>
    </aside>
  );
}

const SCOPES: Array<{ value: BookScope['scope']; label: string }> = [
  { value: 'page', label: 'This page' },
  { value: 'upto', label: 'From the chapter start to here' },
  { value: 'pages', label: 'Pages I choose…' },
  { value: 'book', label: 'The whole book' },
];

/** What of the book goes with the next message, and roughly what it costs. */
function ContextBar({
  book,
  context,
  scope,
  onScope,
  vision,
  contextLength,
}: {
  book: Book;
  context: StudyContext;
  scope: BookScope;
  onScope: (scope: Partial<BookScope>) => void;
  vision: boolean;
  contextLength: number;
}) {
  const pictures = useStudyLayout((s) => s.pictures);
  const setPictures = useStudyLayout((s) => s.setPictures);
  const setSelection = useStudyEditor((s) => s.setSelection);
  const pages = scopePages(context, book.pageCount);
  const chars = pages.reduce((sum, p) => sum + (book.pages[p - 1]?.chars ?? 0) + 80, 0);
  // The same budget the runner uses for the book's pages.
  const budget = Math.min(40_000, Math.max(2_500, contextLength * 0.35 * 3.2));
  const tokens = Math.ceil(Math.min(chars, budget) / 3.6);
  const over = chars > budget;
  const label =
    scope.scope === 'page'
      ? `This page (p. ${context.page})`
      : scope.scope === 'book'
        ? 'The whole book'
        : `Pages ${formatPageList(pages)}`;
  const note = over ? (scope.scope === 'book' ? 'searches the book for your question' : 'too long: the nearest pages go') : `≈ ${tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : tokens} tokens`;
  const chapterStart = sectionStart(book.outline, context.page);

  return (
    <div className="mb-1.5 flex flex-col gap-1 px-1" data-testid="study-context">
      {context.selection && (
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground" data-testid="study-selection-chip">
          <span className="truncate">
            Selected on p. {context.selection.page}: «{context.selection.text.slice(0, 80)}
            {context.selection.text.length > 80 ? '…' : ''}»
          </span>
          <button aria-label="Clear selection" className="shrink-0 hover:text-foreground" onClick={() => setSelection(null)}>
            <X className="size-3" />
          </button>
        </div>
      )}
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
        <span className="shrink-0">Reads</span>
        <Menu>
          <MenuTrigger asChild>
            <button className="flex h-6 min-w-0 items-center gap-1 rounded-md px-1.5 text-fg-2 hover:bg-hover hover:text-foreground" data-testid="study-scope">
              <span className="truncate">{label}</span>
              <ChevronDown className="size-3 shrink-0" />
            </button>
          </MenuTrigger>
          <MenuContent side="top" className="w-72">
            <MenuLabel>What the tutor reads with your message</MenuLabel>
            {SCOPES.map((item) => (
              <MenuCheckItem key={item.value} checked={scope.scope === item.value} onSelect={() => onScope({ scope: item.value, ...(item.value === 'pages' && !scope.pages ? { pages: String(context.page) } : {}) })}>
                {item.value === 'upto' ? `From p. ${scope.from ?? chapterStart} to here` : item.label}
              </MenuCheckItem>
            ))}
            {vision && (
              <>
                <MenuSeparator />
                <MenuLabel>Pictures of the page</MenuLabel>
                {(['auto', 'always', 'never'] as PicturesMode[]).map((value) => (
                  <MenuCheckItem key={value} checked={pictures === value} onSelect={() => setPictures(value)}>
                    {value === 'auto' ? 'When it is scanned or has handwriting' : value === 'always' ? 'Always' : 'Never'}
                  </MenuCheckItem>
                ))}
              </>
            )}
          </MenuContent>
        </Menu>
        {scope.scope === 'pages' && (
          <input
            aria-label="Pages"
            data-testid="study-pages-input"
            value={scope.pages}
            placeholder="e.g. 12-15, 20"
            onChange={(event) => onScope({ pages: event.target.value.replace(/[^\d,\s–-]/g, '') })}
            className="h-6 w-28 rounded-md border border-composer-border bg-composer px-1.5 text-foreground outline-none focus:border-brand/60"
          />
        )}
        {scope.scope === 'upto' && (
          <label className="flex items-center gap-1">
            from
            <input
              aria-label="First page"
              type="number"
              min={1}
              max={book.pageCount}
              value={scope.from ?? chapterStart}
              onChange={(event) => {
                const value = Number(event.target.value);
                onScope({ from: Number.isFinite(value) && value >= 1 ? Math.min(value, book.pageCount) : undefined });
              }}
              className="h-6 w-14 rounded-md border border-composer-border bg-composer px-1.5 text-foreground outline-none focus:border-brand/60"
            />
          </label>
        )}
        <span className={cn('ml-auto shrink-0', over && 'text-warning')}>{note}</span>
      </div>
    </div>
  );
}
