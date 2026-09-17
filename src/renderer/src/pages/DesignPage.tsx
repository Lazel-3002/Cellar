import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  ArrowDown,
  ChartColumn,
  ChevronDown,
  Circle,
  Copy,
  Download,
  Ellipsis,
  FileImage,
  FileText,
  Hand,
  Image as ImageIcon,
  LayoutTemplate,
  Maximize,
  MessageSquare,
  Minus,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  Palette,
  Pencil,
  Play,
  Plus,
  Presentation,
  Redo2,
  Smartphone,
  Square,
  Star,
  Trash,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { FORMAT_DEFAULTS, THEMES, themeById } from '@shared/design/theme';
import { branchPath } from '@shared/message-tree';
import type { TaskStatus } from '@shared/types/agent';
import type { Design, DesignExportFormat, DesignFormat, DesignSummary } from '@shared/types/design';
import { CellarMark } from '@/components/brand/Logo';
import { Composer } from '@/components/composer/Composer';
import { addElement, copySelection, deleteSelection, duplicateSelection, groupSelection, imagesFromFiles, nudgeSelection, pasteClipboard, placeImage, ungroupSelection } from '@/components/design/actions';
import { ArtboardThumbnail } from '@/components/design/ArtboardView';
import { DesignCanvas, fitView } from '@/components/design/Canvas';
import { Inspector } from '@/components/design/Inspector';
import { Present } from '@/components/design/Present';
import { AgentTurn, UserTurn } from '@/components/task/Transcript';
import { IconButton } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Badge, EmptyState, Spinner, Tip } from '@/components/ui/misc';
import { invoke, onEvent } from '@/lib/ipc';
import { useConversation } from '@/lib/queries';
import type { Icon } from '@/lib/tasks';
import { cn, relativeTime } from '@/lib/utils';
import { selectedArtboard, useDesignEditor, useDesignLayout, type DesignTool } from '@/stores/design';
import { isLive, useStreams } from '@/stores/streams';
import { useUi } from '@/stores/ui';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

const FORMAT_ICONS: Record<DesignFormat, Icon> = { slides: Presentation, document: FileText, social: FileImage, poster: LayoutTemplate, web: Maximize, mobile: Smartphone, custom: Square };

const IDEAS: Array<{ label: string; prompt: string; format: DesignFormat; themeId: string }> = [
  { label: 'Pitch deck for a coffee subscription', prompt: 'Create a 6-slide pitch deck for "Bean Club", a neighborhood coffee subscription: problem, solution, how it works, market size with a chart, business model, and a closing slide.', format: 'slides', themeId: 'forest' },
  { label: 'One-page product brief', prompt: 'Design a one-page product brief for a smart water bottle that tracks hydration: headline, short overview, three key features, a small chart of daily intake, and launch date.', format: 'document', themeId: 'corporate' },
  { label: 'Poster for a jazz night', prompt: 'Design a poster for "Blue Notes", a jazz night this Friday at 8 PM at The Cellar Room: bold headline, mood, lineup of three musicians and ticket info.', format: 'poster', themeId: 'midnight' },
  { label: 'Landing page for a notes app', prompt: 'Design a landing page hero for "Inkwell", a private, offline note-taking app: navigation, headline, subheading, call to action, plus a row of three feature cards.', format: 'web', themeId: 'ocean' },
  { label: 'Habit tracker app screen', prompt: 'Design the home screen of a habit tracker app: greeting, today’s progress, a list of four habits with streaks, and a button to add a habit.', format: 'mobile', themeId: 'pop' },
];

function ThemeSwatch({ themeId, className }: { themeId: string; className?: string }) {
  const theme = themeById(themeId) ?? THEMES[0];
  return (
    <span className={cn('flex h-4 w-7 shrink-0 overflow-hidden rounded border border-black/15', className)} style={{ background: theme.colors.background }}>
      <span className="m-[3px] flex-1 rounded-[1px]" style={{ background: theme.colors.primary }} />
      <span className="my-[3px] mr-[3px] flex-1 rounded-[1px]" style={{ background: theme.colors.accent }} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Home

export function DesignHomePage() {
  const navigate = useNavigate();
  const [format, setFormat] = useState<DesignFormat>('slides');
  const [themeId, setThemeId] = useState('paper');
  const setPendingPrompt = useUi((s) => s.setPendingPrompt);
  const setIncognito = useUi((s) => s.setIncognito);
  const queryClient = useQueryClient();
  const designs = useQuery({ queryKey: ['designs'], queryFn: () => invoke('design:list') });
  useEffect(() => setIncognito(false), [setIncognito]);
  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['designs'] });
    const offs = [onEvent('design:changed', refresh), onEvent('chat:changed', refresh)];
    return () => offs.forEach((off) => off());
  }, [queryClient]);

  const blank = async () => {
    try {
      const { conversationId } = await invoke('design:create', { format, themeId });
      void navigate({ to: '/design/$conversationId', params: { conversationId } });
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 pt-9">
      <div className="mx-auto w-full max-w-[760px] pt-[calc(16vh-36px)] pb-16">
        <h1 className="mb-[30px] flex items-center justify-center gap-3 text-center font-serif text-[38px] leading-none tracking-[-0.01em] text-foreground">
          <CellarMark className="size-[32px]" />
          <span>What should we design?</span>
        </h1>
        <Composer variant="design-home" designStart={{ format, themeId }} autoFocus onSent={(r) => void navigate({ to: '/design/$conversationId', params: { conversationId: r.conversationId } })} />
        <div className="mt-3 flex flex-wrap items-center gap-1.5 px-2" data-testid="design-formats">
          {(Object.keys(FORMAT_DEFAULTS) as DesignFormat[])
            .filter((f) => f !== 'custom')
            .map((f) => {
              const FormatIcon = FORMAT_ICONS[f];
              return (
                <Tip key={f} label={FORMAT_DEFAULTS[f].description}>
                  <button
                    onClick={() => setFormat(f)}
                    className={cn('no-drag flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[13px]', format === f ? 'border-brand/60 bg-brand/10 text-foreground' : 'border-composer-border text-fg-2 hover:bg-hover hover:text-foreground')}
                  >
                    <FormatIcon className="size-3.5" />
                    {FORMAT_DEFAULTS[f].label}
                  </button>
                </Tip>
              );
            })}
          <div className="flex-1" />
          <Menu>
            <MenuTrigger asChild>
              <button data-testid="design-theme" className="no-drag flex h-7 items-center gap-2 rounded-lg px-2 text-[13px] text-fg-2 hover:bg-hover hover:text-foreground">
                <ThemeSwatch themeId={themeId} />
                {themeById(themeId)?.name}
                <ChevronDown className="size-3 text-muted-foreground" />
              </button>
            </MenuTrigger>
            <MenuContent align="end" className="w-60">
              <MenuLabel>Theme (the model can change it)</MenuLabel>
              {THEMES.map((t) => (
                <MenuItem key={t.id} onSelect={() => setThemeId(t.id)} icon={<ThemeSwatch themeId={t.id} className="w-6" />}>
                  <span style={{ fontFamily: `'${t.fonts.heading}'` }}>{t.name}</span>
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <button onClick={() => void blank()} className="no-drag h-7 rounded-lg px-2 text-[13px] text-brand hover:bg-hover" data-testid="design-blank">
            Blank canvas
          </button>
        </div>

        <div className="mt-[30px] px-4 text-[12.5px] text-muted-foreground">Ideas</div>
        <div className="mt-2 px-4">
          {IDEAS.map((idea) => {
            const IdeaIcon = FORMAT_ICONS[idea.format];
            return (
              <button
                key={idea.label}
                onClick={() => {
                  setFormat(idea.format);
                  setThemeId(idea.themeId);
                  setPendingPrompt(idea.prompt);
                }}
                className="group flex h-11 w-full items-center gap-4 rounded-lg text-left"
              >
                <span className="flex size-[26px] items-center justify-center rounded-md border border-tile text-muted-foreground group-hover:text-foreground">
                  <IdeaIcon className="size-4" strokeWidth={1.5} />
                </span>
                <span className="text-[15px] font-medium text-foreground">{idea.label}</span>
              </button>
            );
          })}
        </div>

        {(designs.data?.length ?? 0) > 0 && (
          <>
            <div className="mt-[30px] px-4 text-[12.5px] text-muted-foreground">Your designs</div>
            <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 px-4" data-testid="design-list">
              {designs.data!.map((d) => (
                <DesignCard key={d.id} design={d} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DesignCard({ design }: { design: DesignSummary }) {
  const navigate = useNavigate();
  const open = () => void navigate({ to: '/design/$conversationId', params: { conversationId: design.conversationId } });
  return (
    <div className="group relative overflow-hidden rounded-xl border border-divider bg-card transition-colors hover:border-composer-border">
      <button onClick={open} className="block w-full text-left">
        <div className="flex h-[128px] items-center justify-center border-b border-divider bg-[color-mix(in_srgb,var(--sidebar)_70%,var(--background))]">
          {design.cover ? <ArtboardThumbnail artboard={design.cover} theme={design.theme} width={200} height={112} className="rounded-sm shadow" /> : <Palette className="size-7 text-muted-foreground" strokeWidth={1.3} />}
        </div>
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-medium text-foreground">{design.title}</span>
            {design.starred && <Star className="size-3 shrink-0 fill-current text-muted-foreground" />}
            {design.taskStatus === 'running' && <Spinner className="size-3 text-brand" />}
          </div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">
            {FORMAT_DEFAULTS[design.format]?.label ?? 'Design'} · {design.artboardCount} artboard{design.artboardCount === 1 ? '' : 's'} · {relativeTime(design.updatedAt)}
          </div>
        </div>
      </button>
      <Menu>
        <MenuTrigger asChild>
          <button aria-label="Design options" className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground data-[state=open]:opacity-100">
            <Ellipsis className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<Copy />} onSelect={() => void invoke('design:duplicate', design.conversationId).catch((err) => toast.error(errorText(err)))}>
            Duplicate
          </MenuItem>
          <MenuItem icon={<Star />} onSelect={() => void invoke('chat:star', design.conversationId, !design.starred)}>
            {design.starred ? 'Unstar' : 'Star'}
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash />} destructive onSelect={() => void invoke('chat:delete', [design.conversationId])}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor

const TOOLS: Array<{ value: DesignTool; label: string; key: string; icon: Icon }> = [
  { value: 'select', label: 'Select', key: 'V', icon: MousePointer2 },
  { value: 'hand', label: 'Hand', key: 'H', icon: Hand },
  { value: 'text', label: 'Text', key: 'T', icon: Type },
  { value: 'rect', label: 'Rectangle', key: 'R', icon: Square },
  { value: 'ellipse', label: 'Ellipse', key: 'O', icon: Circle },
  { value: 'line', label: 'Line', key: 'L', icon: Minus },
];

const STATUS: Partial<Record<TaskStatus, { label: string; tone: 'brand' | 'danger' | 'warning' }>> = {
  running: { label: 'Designing', tone: 'brand' },
  waiting: { label: 'Needs your approval', tone: 'warning' },
  error: { label: 'Failed', tone: 'danger' },
};

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

const menuOpen = () => !!document.querySelector('[role="menu"], [role="dialog"], [role="listbox"]');

async function exportDesign(design: Design, format: DesignExportFormat, artboardIds?: string[]) {
  const id = toast.loading(format === 'pptx' ? 'Building the PowerPoint file…' : format === 'pdf' ? 'Rendering the PDF…' : 'Rendering images…');
  try {
    const path = await invoke('design:export', { designId: design.id, format, artboardIds });
    if (!path) return toast.dismiss(id);
    toast.success('Exported', { id, description: path, action: { label: 'Show', onClick: () => void invoke('system:showInFolder', path) } });
  } catch (err) {
    toast.error('Export failed', { id, description: errorText(err) });
  }
}

function DesignHeader({ conversationId, status, onPresent, canvasRef }: { conversationId: string; status: TaskStatus | null; onPresent: () => void; canvasRef: React.RefObject<HTMLDivElement | null> }) {
  const navigate = useNavigate();
  const design = useDesignEditor((s) => s.design)!;
  const tool = useDesignEditor((s) => s.tool);
  const zoom = useDesignEditor((s) => s.zoom);
  const canUndo = useDesignEditor((s) => s.past.length > 0);
  const canRedo = useDesignEditor((s) => s.future.length > 0);
  const saving = useDesignEditor((s) => s.revision !== s.savedRevision);
  const { chatOpen, setChatOpen, inspectorOpen, setInspectorOpen } = useDesignLayout();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(design.title);
  useEffect(() => setTitle(design.title), [design.title]);
  const store = useDesignEditor.getState;
  const commitTitle = () => {
    setRenaming(false);
    if (title.trim() && title !== design.title) void invoke('chat:rename', conversationId, title);
  };
  const zoomBy = (factor: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const s = store();
    const next = Math.min(8, Math.max(0.02, s.zoom * factor));
    const cx = (rect?.width ?? 800) / 2;
    const cy = (rect?.height ?? 600) / 2;
    s.setView({ zoom: next, panX: cx - ((cx - s.panX) * next) / s.zoom, panY: cy - ((cy - s.panY) * next) / s.zoom });
  };
  const addImage = async () => {
    const artboard = selectedArtboard(store());
    if (!artboard) return toast.error('Add an artboard first');
    const paths = await invoke('system:pickFiles', 'attachments');
    const refs = paths.length ? (await invoke('attachments:fromPaths', paths)).filter((r) => r.kind === 'image') : [];
    for (const ref of refs) await placeImage(artboard.id, ref);
  };
  const addChart = () => {
    const artboard = selectedArtboard(store());
    if (!artboard) return toast.error('Add an artboard first');
    addElement(artboard.id, { type: 'chart', w: Math.round(artboard.width * 0.5), h: Math.round(artboard.height * 0.45), chart: { kind: 'bar', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Revenue', values: [12, 19, 24, 31] }] } });
  };
  const badge = status ? STATUS[status] : undefined;
  const current = useDesignEditor((s) => s.selection.artboardId);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-3">
      <Palette className="no-drag size-4 shrink-0 text-muted-foreground" />
      {renaming ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitTitle();
            if (e.key === 'Escape') setRenaming(false);
          }}
          className="no-drag h-7 w-56 rounded-md border border-brand/50 bg-composer px-2 text-[14px] outline-none"
        />
      ) : (
        <Menu>
          <MenuTrigger asChild>
            <button data-testid="design-title" className="no-drag flex h-7 max-w-[240px] min-w-0 items-center gap-1 rounded-md px-1.5 text-[14px] text-fg-2 hover:bg-hover hover:text-foreground">
              <span className="truncate">{design.title}</span>
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
                const copy = await invoke('design:duplicate', conversationId).catch((err) => void toast.error(errorText(err)));
                if (copy) void navigate({ to: '/design/$conversationId', params: { conversationId: copy.conversationId } });
              }}
            >
              Duplicate design
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Trash />}
              destructive
              onSelect={async () => {
                if (!window.confirm(`Delete "${design.title}" and its chat?`)) return;
                await invoke('chat:delete', [conversationId]);
                void navigate({ to: '/design' });
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
      <div className="no-drag flex items-center gap-0.5 rounded-lg bg-seg p-0.5" data-testid="design-tools">
        {TOOLS.map((t) => (
          <IconButton key={t.value} label={`${t.label}  ${t.key}`} active={tool === t.value} onClick={() => store().setTool(t.value)} data-testid={`tool-${t.value}`}>
            <t.icon className="size-[15px]" strokeWidth={1.8} />
          </IconButton>
        ))}
        <IconButton label="Image" onClick={() => void addImage()}>
          <ImageIcon className="size-[15px]" strokeWidth={1.8} />
        </IconButton>
        <IconButton label="Chart" onClick={addChart} data-testid="tool-chart">
          <ChartColumn className="size-[15px]" strokeWidth={1.8} />
        </IconButton>
      </div>
      <IconButton label="Undo  Ctrl+Z" disabled={!canUndo} onClick={() => store().undo()} data-testid="design-undo">
        <Undo2 className="size-[16px]" strokeWidth={1.8} />
      </IconButton>
      <IconButton label="Redo  Ctrl+Y" disabled={!canRedo} onClick={() => store().redo()}>
        <Redo2 className="size-[16px]" strokeWidth={1.8} />
      </IconButton>
      <div className="no-drag hidden items-center lg:flex">
        <IconButton label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
          <Minus className="size-3.5" />
        </IconButton>
        <button className="h-7 w-12 rounded-md text-[12px] text-fg-2 tabular-nums hover:bg-hover" onClick={() => fitView(canvasRef.current, design)} title="Fit all artboards  Shift+1">
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="Zoom in" onClick={() => zoomBy(1.25)}>
          <Plus className="size-3.5" />
        </IconButton>
      </div>
      <IconButton label="Present  F5" onClick={onPresent} disabled={design.artboards.length === 0}>
        <Play className="size-[15px]" strokeWidth={1.8} />
      </IconButton>
      <Menu>
        <MenuTrigger asChild>
          <button data-testid="design-export" disabled={design.artboards.length === 0} className="no-drag flex h-7 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-40">
            <Download className="size-3.5" />
            <span className="hidden md:inline">Export</span>
          </button>
        </MenuTrigger>
        <MenuContent align="end" className="w-64">
          <MenuItem icon={<FileText />} onSelect={() => void exportDesign(design, 'pdf')}>
            PDF (all artboards)
          </MenuItem>
          <MenuItem icon={<Presentation />} onSelect={() => void exportDesign(design, 'pptx')}>
            PowerPoint (.pptx)
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<FileImage />} disabled={!current} onSelect={() => current && void exportDesign(design, 'png', [current])}>
            PNG (selected artboard)
          </MenuItem>
          <MenuItem icon={<FileImage />} onSelect={() => void exportDesign(design, 'png')}>
            PNG (every artboard)
          </MenuItem>
        </MenuContent>
      </Menu>
      <IconButton label={chatOpen ? 'Hide chat' : 'Show chat'} active={chatOpen} onClick={() => setChatOpen(!chatOpen)}>
        <MessageSquare className="size-[16px]" strokeWidth={1.8} />
      </IconButton>
      <IconButton label={inspectorOpen ? 'Hide properties' : 'Show properties'} onClick={() => setInspectorOpen(!inspectorOpen)} className="mr-2">
        {inspectorOpen ? <PanelRightClose className="size-[16px]" strokeWidth={1.8} /> : <PanelRightOpen className="size-[16px]" strokeWidth={1.8} />}
      </IconButton>
    </div>
  );
}

const SUGGESTIONS = ['Make the headlines bolder and larger', 'Try a darker, more dramatic theme', 'Add a slide with a chart of the key numbers', 'Tighten the spacing and align everything to a grid'];

function DesignChat({ conversationId, running, onClose, flush }: { conversationId: string; running: string | null; onClose: () => void; flush: () => Promise<void> }) {
  const { data } = useConversation(conversationId);
  const streams = useStreams((s) => s.byMessage);
  const selection = useDesignEditor((s) => s.selection);
  const design = useDesignEditor((s) => s.design);
  const select = useDesignEditor((s) => s.select);
  const width = useDesignLayout((s) => s.chatWidth);
  const setWidth = useDesignLayout((s) => s.setChatWidth);
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

  const artboard = design?.artboards.find((a) => a.id === selection.artboardId);
  const selectedIds = selection.elementIds;

  return (
    <aside data-testid="design-chat" className="relative flex h-full shrink-0 flex-col border-r border-divider bg-background" style={{ width }}>
      <div
        className={cn('absolute top-0 -right-1 bottom-0 z-20 w-2 cursor-col-resize', dragging && 'bg-brand/30')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => dragging && setWidth(e.clientX)}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
        }}
      />
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-divider px-3">
        <span className="text-[13px] text-fg-2">Chat</span>
        <IconButton label="Hide chat" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          className="h-full overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 100);
          }}
        >
          <div className="flex flex-col gap-5 px-4 pt-4 pb-6 text-[14.5px]">
            {data && path.map((message) => (message.role === 'user' ? <UserTurn key={message.id} message={message} /> : <AgentTurn key={message.id} message={message} live={streams[message.id]} conversation={data.conversation} view="normal" />))}
            {path.length === 0 && (
              <div className="pt-6 text-center text-[13px] leading-relaxed text-muted-foreground">
                Describe what to make or change. The model sees the canvas and whatever you have selected.
              </div>
            )}
            {!running && design && design.artboards.length > 0 && path.length <= 2 && (
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => setPendingPrompt(s)} className="rounded-full border border-composer-border px-2.5 py-1 text-left text-[12px] text-fg-2 hover:bg-hover hover:text-foreground">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {!atBottom && (
          <button aria-label="Jump to latest" onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })} className="absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-composer-border bg-composer text-fg-2 shadow-lg">
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>
      <div className="px-3 pb-3">
        {artboard && (
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[12px] text-muted-foreground" data-testid="design-selection-chip">
            <span className="truncate">{selectedIds.length ? `Selected: ${selectedIds.length === 1 ? selectedIds[0] : `${selectedIds.length} elements`} on ${artboard.name}` : `Looking at ${artboard.name}`}</span>
            {selectedIds.length > 0 && (
              <button aria-label="Clear selection" className="hover:text-foreground" onClick={() => select({ elementIds: [] })}>
                <X className="size-3" />
              </button>
            )}
          </div>
        )}
        <Composer variant="design" conversationId={conversationId} streamingMessageId={running} designSelection={artboard ? { artboardId: artboard.id, elementIds: selectedIds } : null} beforeSend={flush} className="rounded-2xl" />
      </div>
    </aside>
  );
}

export function DesignEditorPage() {
  const { conversationId } = useParams({ from: '/design/$conversationId' });
  const navigate = useNavigate();
  const setIncognito = useUi((s) => s.setIncognito);
  const conversation = useConversation(conversationId);
  const streams = useStreams((s) => s.byMessage);
  const designQuery = useQuery({ queryKey: ['design', conversationId], queryFn: () => invoke('design:get', conversationId), retry: false, staleTime: Infinity });
  const design = useDesignEditor((s) => (s.conversationId === conversationId ? s.design : null));
  const revision = useDesignEditor((s) => s.revision);
  const savedRevision = useDesignEditor((s) => s.savedRevision);
  const { chatOpen, setChatOpen, inspectorOpen } = useDesignLayout();
  const canvasRef = useRef<HTMLDivElement>(null);
  const saving = useRef(false);
  const fitted = useRef<string | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [presenting, setPresenting] = useState(false);
  const store = useDesignEditor.getState;

  useLayoutEffect(() => setSlot(document.getElementById('titlebar-slot')), []);
  useEffect(() => setIncognito(false), [setIncognito]);
  useEffect(() => {
    if (conversation.data && conversation.data.conversation.kind !== 'design') void navigate({ to: '/', replace: true });
  }, [conversation.data, navigate]);

  // Load the design into the editor (again when switching designs).
  useEffect(() => {
    if (designQuery.data && (store().conversationId !== conversationId || !store().design)) store().load(conversationId, designQuery.data);
  }, [designQuery.data, conversationId, store]);

  // Fit the view once per design, and again when the first artboard appears.
  const artboardCount = design?.artboards.length ?? 0;
  useLayoutEffect(() => {
    if (!design || artboardCount === 0) return;
    const key = `${conversationId}`;
    if (fitted.current === key) return;
    fitted.current = key;
    requestAnimationFrame(() => fitView(canvasRef.current, store().design));
  }, [design, artboardCount, conversationId, store]);

  const reload = useCallback(async () => {
    const latest = await invoke('design:get', conversationId);
    const s = store();
    if (s.conversationId === conversationId && latest.version > s.baseVersion) s.applyRemote(latest);
  }, [conversationId, store]);

  // Changes from the model (or another window) arrive as events.
  useEffect(
    () =>
      onEvent('design:changed', (event) => {
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
    for (let i = 0; saving.current && i < 100; i++) await new Promise((r) => setTimeout(r, 30));
    const s = store();
    if (saving.current || !s.design || s.conversationId !== conversationId || s.revision === s.savedRevision) return;
    saving.current = true;
    const revisionAtSave = s.revision;
    try {
      const saved = await invoke('design:save', s.design, s.baseVersion);
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
    const onKey = (e: KeyboardEvent) => {
      if (presenting || isEditableTarget(e.target) || menuOpen()) return;
      const s = store();
      if (!s.design) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const artboard = selectedArtboard(s);
      const handled = () => e.preventDefault();
      if (ctrl && key === 'z' && !e.shiftKey) return handled(), s.undo();
      if ((ctrl && key === 'y') || (ctrl && key === 'z' && e.shiftKey)) return handled(), s.redo();
      if (ctrl && key === 'd') return handled(), duplicateSelection();
      if (ctrl && e.shiftKey && key === 'g') return handled(), ungroupSelection();
      if (ctrl && key === 'g') return handled(), groupSelection();
      if (ctrl && key === 'c') return copySelection();
      if (ctrl && key === 'v') {
        if (pasteClipboard()) handled();
        return;
      }
      if (ctrl && key === 'a' && artboard) return handled(), s.select({ elementIds: artboard.elements.map((el) => el.id) });
      if (ctrl) return;
      if (e.key === 'Delete' || e.key === 'Backspace') return handled(), deleteSelection();
      if (e.key === 'Escape') return s.select({ elementIds: [] });
      if (e.key.startsWith('Arrow')) {
        if (s.selection.elementIds.length === 0) return;
        const step = e.shiftKey ? 10 : 1;
        handled();
        return nudgeSelection(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
      }
      if (e.key === 'Enter' && artboard && s.selection.elementIds.length === 1) {
        const el = artboard.elements.find((x) => x.id === s.selection.elementIds[0]);
        if (el?.type === 'text' && !el.locked) return handled(), s.setEditingText(el.id);
      }
      if (e.key === 'F5') return handled(), setPresenting(true);
      if (e.key === '!' || (e.shiftKey && e.code === 'Digit1')) return handled(), fitView(canvasRef.current, s.design);
      if (e.key === '@' || (e.shiftKey && e.code === 'Digit2')) return handled(), fitView(canvasRef.current, s.design, artboard?.id);
      if (e.key === 'PageDown' || e.key === 'PageUp') {
        const index = s.design.artboards.findIndex((a) => a.id === s.selection.artboardId);
        const next = s.design.artboards[Math.min(s.design.artboards.length - 1, Math.max(0, index + (e.key === 'PageDown' ? 1 : -1)))];
        if (next) {
          handled();
          s.select({ artboardId: next.id, elementIds: [] });
          fitView(canvasRef.current, s.design, next.id);
        }
        return;
      }
      const toolKey: Record<string, DesignTool> = { v: 'select', h: 'hand', t: 'text', r: 'rect', o: 'ellipse', l: 'line' };
      if (toolKey[key] && !e.altKey) return handled(), s.setTool(toolKey[key]);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      const artboard = selectedArtboard(store());
      if (!files.length || !artboard) return;
      e.preventDefault();
      void imagesFromFiles(files).then(async (refs) => {
        for (const ref of refs) await placeImage(artboard.id, ref);
      });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [presenting, store]);

  const messages = conversation.data?.messages ?? [];
  const leaf = conversation.data?.conversation.currentLeafId ?? null;
  const path = useMemo(() => branchPath(messages, leaf), [messages, leaf]);
  const running = path.find((m) => m.role === 'assistant' && m.status === 'streaming' && (!streams[m.id] || isLive(streams[m.id])));
  const liveTask = running ? streams[running.id]?.task : undefined;
  const taskStatus = (liveTask ?? conversation.data?.conversation.task)?.status ?? null;
  const status: TaskStatus | null = running ? (taskStatus === 'waiting' ? 'waiting' : 'running') : taskStatus === 'error' ? 'error' : null;

  if (designQuery.error) {
    return (
      <EmptyState
        className="h-full"
        icon={<Palette className="size-5" />}
        title="This design is gone"
        description="It may have been deleted."
        action={
          <button className="text-[13.5px] text-brand" onClick={() => void navigate({ to: '/design' })}>
            Start a new design
          </button>
        }
      />
    );
  }
  if (!design) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 pt-9" data-testid="design-editor">
      {slot && createPortal(<DesignHeader conversationId={conversationId} status={status} onPresent={() => setPresenting(true)} canvasRef={canvasRef} />, slot)}
      {chatOpen && <DesignChat conversationId={conversationId} running={running?.id ?? null} onClose={() => setChatOpen(false)} flush={save} />}
      <div className="relative min-w-0 flex-1">
        <DesignCanvas containerRef={canvasRef} running={!!running} />
        {!chatOpen && (
          <button onClick={() => setChatOpen(true)} className="absolute bottom-4 left-4 flex h-9 items-center gap-2 rounded-full border border-composer-border bg-composer px-3.5 text-[13px] text-fg-2 shadow-lg hover:text-foreground">
            <MessageSquare className="size-4" /> Chat
            {running && <Spinner className="size-3.5 text-brand" />}
          </button>
        )}
      </div>
      {inspectorOpen && <Inspector />}
      {presenting && <Present design={design} startId={useDesignEditor.getState().selection.artboardId} onClose={() => setPresenting(false)} />}
    </div>
  );
}

