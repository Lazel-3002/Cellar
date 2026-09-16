import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Folder, FolderOpen, PanelLeftClose, PanelLeftOpen, RefreshCw, Save, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FileContent, FileEntry } from '@shared/types/code';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState, Spinner } from '@/components/ui/misc';
import { invoke, onEvent } from '@/lib/ipc';
import { useConversation } from '@/lib/queries';
import { fileIcon } from '@/lib/tasks';
import { cn, formatBytes } from '@/lib/utils';
import { useCodeUi } from '@/stores/code';
import { CodeEditor } from './MonacoEditor';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Folders that are listed but never opened automatically. */
const HEAVY_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'coverage', '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.cache', '.turbo', 'vendor', 'bin', 'obj']);

interface Tab {
  path: string;
  status: 'loading' | 'ready' | 'binary' | 'tooLarge' | 'error';
  /** Content on disk when the file was last loaded or saved. */
  saved: string;
  /** Content in the editor. */
  value: string;
  size: number;
  error?: string;
  /** Newer content on disk while the tab has unsaved edits. */
  diskChanged?: string;
}

interface DirState {
  entries?: FileEntry[];
  loading: boolean;
  error?: string;
}

interface FilesState {
  tabs: Tab[];
  active: string | null;
  expanded: string[];
}

/** Open tabs per session, so switching panes does not lose unsaved edits. */
const sessions = new Map<string, FilesState>();
/** The last editor request handled per session (requests live in a store and outlast this pane). */
const handledRequests = new Map<string, number>();

const isDirty = (tab: Tab) => tab.status === 'ready' && tab.value !== tab.saved;

/** "src\\app.ts", "./src/app.ts", "/src/app.ts" or an absolute path inside the folder → "src/app.ts". */
function normalizePath(path: string, workDir?: string): string {
  let p = path.trim().replace(/\\/g, '/');
  if (workDir) {
    const root = workDir.replace(/\\/g, '/').replace(/\/+$/, '');
    if (p.toLowerCase().startsWith(`${root.toLowerCase()}/`)) p = p.slice(root.length + 1);
  }
  return p
    .split('/')
    .filter((segment) => segment && segment !== '.')
    .join('/');
}

function ancestors(path: string): string[] {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function FilesPane({ conversationId }: { conversationId: string }) {
  const { data: detail } = useConversation(conversationId);
  const workDir = detail?.conversation.task?.workDir;
  const rootRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const width = useWidth(rootRef);
  const narrow = width > 0 && width < 640;

  const [state, setState] = useState<FilesState>(() => sessions.get(conversationId) ?? { tabs: [], active: null, expanded: [] });
  const [dirs, setDirs] = useState<Record<string, DirState>>({});
  const [stateFor, setStateFor] = useState(conversationId);
  if (stateFor !== conversationId) {
    setStateFor(conversationId);
    setState(sessions.get(conversationId) ?? { tabs: [], active: null, expanded: [] });
    setDirs({});
  }
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Wide layout: the tree is shown unless hidden. Narrow layout: the tree replaces the editor when opened. */
  const [treeHidden, setTreeHidden] = useState(false);
  const [narrowTree, setNarrowTree] = useState(false);
  const [reveal, setReveal] = useState<{ path: string; line: number; nonce: number } | null>(null);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const lastReady = useRef<string | null>(null);

  useEffect(() => {
    sessions.set(conversationId, state);
  }, [conversationId, state]);

  const updateTab = useCallback((path: string, update: (tab: Tab) => Tab) => {
    setState((s) => ({ ...s, tabs: s.tabs.map((t) => (t.path === path ? update(t) : t)) }));
  }, []);

  const loadDir = useCallback(
    async (path: string) => {
      setDirs((d) => ({ ...d, [path]: { ...d[path], loading: true } }));
      try {
        const entries = await invoke('code:listDir', conversationId, path);
        setDirs((d) => ({ ...d, [path]: { entries, loading: false } }));
      } catch (err) {
        setDirs((d) => ({ ...d, [path]: { entries: d[path]?.entries, loading: false, error: errorText(err) } }));
      }
    },
    [conversationId],
  );

  const loadTab = useCallback(
    async (path: string) => {
      try {
        const file = await invoke('code:readFile', conversationId, path);
        const status = file.binary ? 'binary' : file.tooLarge ? 'tooLarge' : 'ready';
        updateTab(path, (t) => ({ ...t, status, saved: file.content, value: file.content, size: file.size, error: undefined, diskChanged: undefined }));
      } catch (err) {
        updateTab(path, (t) => ({ ...t, status: 'error', error: errorText(err) }));
      }
    },
    [conversationId, updateTab],
  );

  const expandTo = useCallback(
    (path: string) => {
      const needed = ancestors(path);
      if (needed.length === 0) return;
      setState((s) => ({ ...s, expanded: [...new Set([...s.expanded, ...needed])] }));
      for (const dir of needed) void loadDir(dir);
    },
    [loadDir],
  );

  const openPath = useCallback(
    (raw: string, line?: number, nonce?: number) => {
      const path = normalizePath(raw, workDir);
      if (!path) return;
      const exists = stateRef.current.tabs.some((t) => t.path === path);
      setState((s) => ({
        ...s,
        active: path,
        tabs: s.tabs.some((t) => t.path === path) ? s.tabs : [...s.tabs, { path, status: 'loading', saved: '', value: '', size: 0 }],
      }));
      setReveal(line ? { path, line, nonce: nonce ?? Date.now() } : null);
      setConfirmClose(null);
      setNarrowTree(false);
      expandTo(path);
      setScrollTarget(path);
      if (!exists) void loadTab(path);
    },
    [workDir, expandTo, loadTab],
  );

  // First listing, plus folders that were open before the pane was last shown.
  useEffect(() => {
    void loadDir('.');
    for (const dir of stateRef.current.expanded) void loadDir(dir);
    for (const tab of stateRef.current.tabs) if (tab.status === 'loading') void loadTab(tab.path);
  }, [loadDir, loadTab]);

  const request = useCodeUi((s) => s.editorRequest);
  useEffect(() => {
    if (!request || request.conversationId !== conversationId || !workDir) return;
    if (handledRequests.get(conversationId) === request.nonce) return;
    handledRequests.set(conversationId, request.nonce);
    openPath(request.path, request.line, request.nonce);
  }, [request, conversationId, workDir, openPath]);

  useEffect(() => {
    if (!scrollTarget) return;
    const el = treeRef.current?.querySelector(`[data-tree-path="${CSS.escape(scrollTarget)}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
      setScrollTarget(null);
    }
  }, [scrollTarget, dirs, state.expanded, treeHidden, narrowTree]);

  /** After Cellar (or a save) changes files: refresh the tree and reload open files. */
  const syncWithDisk = useCallback(async () => {
    void loadDir('.');
    for (const dir of stateRef.current.expanded) void loadDir(dir);
    await Promise.all(
      stateRef.current.tabs.map(async (tab) => {
        if (tab.status === 'loading') return;
        let file: FileContent;
        try {
          file = await invoke('code:readFile', conversationId, tab.path);
        } catch (err) {
          updateTab(tab.path, (t) => (isDirty(t) ? t : { ...t, status: 'error', error: errorText(err) }));
          return;
        }
        updateTab(tab.path, (t) => {
          const status = file.binary ? 'binary' : file.tooLarge ? 'tooLarge' : 'ready';
          if (status !== 'ready') return isDirty(t) ? t : { ...t, status, size: file.size, saved: '', value: '' };
          if (t.status !== 'ready') return { ...t, status, saved: file.content, value: file.content, size: file.size, error: undefined, diskChanged: undefined };
          if (file.content === t.saved) return t.diskChanged === undefined ? t : { ...t, diskChanged: undefined };
          if (!isDirty(t) || file.content === t.value) return { ...t, saved: file.content, value: isDirty(t) ? t.value : file.content, size: file.size, diskChanged: undefined };
          return { ...t, diskChanged: file.content };
        });
      }),
    );
  }, [conversationId, loadDir, updateTab]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onEvent('chat:changed', ({ conversationId: id }) => {
      if (id !== conversationId) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void syncWithDisk(), 250);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [conversationId, syncWithDisk]);

  const save = useCallback(
    async (path: string, value: string) => {
      try {
        await invoke('code:writeFile', conversationId, path, value);
        updateTab(path, (t) => ({ ...t, saved: value, diskChanged: undefined }));
      } catch (err) {
        toast.error(`Couldn't save ${baseName(path)}`, { description: errorText(err) });
        throw err;
      }
    },
    [conversationId, updateTab],
  );

  const closeTab = (path: string, force = false) => {
    const tab = stateRef.current.tabs.find((t) => t.path === path);
    if (!tab) return;
    if (!force && isDirty(tab)) {
      setState((s) => ({ ...s, active: path }));
      setConfirmClose(path);
      return;
    }
    setConfirmClose(null);
    setState((s) => {
      const index = s.tabs.findIndex((t) => t.path === path);
      const tabs = s.tabs.filter((t) => t.path !== path);
      const active = s.active === path ? (tabs[Math.min(index, tabs.length - 1)]?.path ?? null) : s.active;
      return { ...s, tabs, active };
    });
  };

  const toggleDir = (path: string) => {
    const open = stateRef.current.expanded.includes(path);
    setState((s) => ({ ...s, expanded: open ? s.expanded.filter((d) => d !== path) : [...s.expanded, path] }));
    if (!open) void loadDir(path);
  };

  const reveal_ = (path: string) => void invoke('tasks:revealFile', conversationId, path).catch((err) => toast.error(errorText(err)));

  const { tabs, active } = state;
  const activeTab = tabs.find((t) => t.path === active) ?? null;
  const readyTabs = tabs.filter((t) => t.status === 'ready');
  if (activeTab?.status === 'ready') lastReady.current = activeTab.path;
  if (lastReady.current && !readyTabs.some((t) => t.path === lastReady.current)) lastReady.current = readyTabs[0]?.path ?? null;
  const editorTab = readyTabs.find((t) => t.path === lastReady.current) ?? null;
  const expanded = new Set(state.expanded);
  const showTree = narrow ? narrowTree || tabs.length === 0 : !treeHidden;
  const showEditor = !narrow || !showTree;
  const treeWidth = Math.round(Math.min(300, Math.max(190, width * 0.28)));

  const renderLevel = (dir: string, depth: number): ReactNode => {
    const listing = dirs[dir];
    const pad = { paddingLeft: 8 + depth * 12 };
    if (!listing?.entries) {
      if (listing?.error) {
        return (
          <div className="truncate py-1 pr-2 text-[12px] text-danger" style={pad} title={listing.error}>
            {listing.error}
          </div>
        );
      }
      return (
        <div className="flex h-[26px] items-center" style={pad}>
          <Spinner className="size-3.5" />
        </div>
      );
    }
    if (listing.entries.length === 0) {
      return (
        <div className="py-1 text-[12px] text-faint" style={{ paddingLeft: 26 + depth * 12 }}>
          Empty folder
        </div>
      );
    }
    return (
      <>
        {listing.entries.map((entry) => {
          if (entry.isDirectory) {
            const open = expanded.has(entry.path);
            const Icon = open ? FolderOpen : Folder;
            return (
              <Fragment key={entry.path}>
                <button
                  role="treeitem"
                  aria-expanded={open}
                  data-tree-path={entry.path}
                  onClick={() => toggleDir(entry.path)}
                  className={cn('flex h-[26px] w-full min-w-0 items-center gap-1.5 pr-2 text-left text-[13px] hover:bg-hover', HEAVY_DIRS.has(entry.name) ? 'text-muted-foreground' : 'text-fg-2')}
                  style={pad}
                  title={entry.path}
                >
                  <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{entry.name}</span>
                </button>
                {open && renderLevel(entry.path, depth + 1)}
              </Fragment>
            );
          }
          const Icon = fileIcon(entry.name);
          const tab = tabs.find((t) => t.path === entry.path);
          return (
            <button
              key={entry.path}
              role="treeitem"
              data-tree-path={entry.path}
              onClick={() => openPath(entry.path)}
              className={cn('flex h-[26px] w-full min-w-0 items-center gap-1.5 pr-2 text-left text-[13px] hover:bg-hover', entry.path === active ? 'bg-selected text-foreground hover:bg-selected' : 'text-fg-2')}
              style={{ paddingLeft: 26 + depth * 12 }}
              title={entry.size !== undefined ? `${entry.path} · ${formatBytes(entry.size)}` : entry.path}
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              {tab && isDirty(tab) && <span className="size-1.5 shrink-0 rounded-full bg-brand" />}
            </button>
          );
        })}
        {listing.entries.length >= 2000 && (
          <div className="py-1 text-[12px] text-muted-foreground" style={{ paddingLeft: 26 + depth * 12 }}>
            Showing the first 2,000 items
          </div>
        )}
      </>
    );
  };

  return (
    <div ref={rootRef} data-testid="files-pane" className="flex h-full min-h-0 bg-background">
      {showTree && (
        <aside className={cn('flex min-h-0 flex-col', narrow ? 'w-full' : 'shrink-0 border-r border-divider')} style={narrow ? undefined : { width: treeWidth }}>
          <div className="flex h-8 shrink-0 items-center gap-1 border-b border-divider pr-1 pl-3">
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-muted-foreground" title={workDir}>
              {workDir ? workDir.split(/[\\/]/).filter(Boolean).pop() : 'Files'}
            </span>
            <IconButton label="Refresh" size="sm" onClick={() => void syncWithDisk()}>
              <RefreshCw className={cn('size-3.5', dirs['.']?.loading && 'animate-spin')} />
            </IconButton>
            {(!narrow || tabs.length > 0) && (
              <IconButton label="Hide files" size="sm" onClick={() => (narrow ? setNarrowTree(false) : setTreeHidden(true))}>
                <PanelLeftClose className="size-3.5" />
              </IconButton>
            )}
          </div>
          <div ref={treeRef} role="tree" className="min-h-0 flex-1 overflow-y-auto py-1">
            {renderLevel('.', 0)}
          </div>
        </aside>
      )}

      {showEditor && (
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-8 shrink-0 items-stretch border-b border-divider bg-sidebar">
            {!showTree && (
              <IconButton label="Show files" size="sm" onClick={() => (narrow ? setNarrowTree(true) : setTreeHidden(false))} className="mx-1 self-center">
                <PanelLeftOpen className="size-3.5" />
              </IconButton>
            )}
            <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist">
              {tabs.map((tab) => {
                const Icon = fileIcon(tab.path);
                const selected = tab.path === active;
                const dirty = isDirty(tab);
                return (
                  <div
                    key={tab.path}
                    role="tab"
                    aria-selected={selected}
                    data-testid="editor-tab"
                    title={tab.path}
                    onClick={() => {
                      setState((s) => ({ ...s, active: tab.path }));
                      setReveal(null);
                    }}
                    onAuxClick={(e) => {
                      if (e.button === 1) closeTab(tab.path);
                    }}
                    className={cn(
                      'group flex max-w-52 min-w-0 shrink-0 cursor-default items-center gap-1.5 border-r border-divider pr-1 pl-2.5 text-[12.5px]',
                      selected ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate">{baseName(tab.path)}</span>
                    <button
                      aria-label={`Close ${baseName(tab.path)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.path);
                      }}
                      className="relative flex size-5 shrink-0 items-center justify-center rounded hover:bg-hover"
                    >
                      {dirty && <span className="absolute size-2 rounded-full bg-foreground/70 group-hover:hidden" />}
                      <X className={cn('size-3.5', dirty ? 'hidden group-hover:block' : selected ? 'opacity-70' : 'opacity-0 group-hover:opacity-70')} />
                    </button>
                  </div>
                );
              })}
            </div>
            {activeTab && isDirty(activeTab) && (
              <IconButton label="Save (Ctrl+S)" size="sm" className="mx-1 self-center" onClick={() => void save(activeTab.path, activeTab.value).catch(() => undefined)}>
                <Save className="size-3.5" />
              </IconButton>
            )}
          </div>

          {activeTab && confirmClose === activeTab.path && (
            <Banner>
              <span className="min-w-0 flex-1">Save your changes to {baseName(activeTab.path)} before closing?</span>
              <Button
                size="sm"
                variant="primary"
                className="h-6 px-2 text-[12px]"
                onClick={() =>
                  void save(activeTab.path, activeTab.value)
                    .then(() => closeTab(activeTab.path, true))
                    .catch(() => undefined)
                }
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[12px]" onClick={() => closeTab(activeTab.path, true)}>
                Don't save
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[12px]" onClick={() => setConfirmClose(null)}>
                Cancel
              </Button>
            </Banner>
          )}
          {activeTab?.diskChanged !== undefined && (
            <Banner tone="warning">
              <TriangleAlert className="size-3.5 shrink-0 text-warning" />
              <span className="min-w-0 flex-1">Changed on disk</span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[12px]"
                onClick={() => updateTab(activeTab.path, (t) => ({ ...t, saved: t.diskChanged ?? t.saved, value: t.diskChanged ?? t.value, diskChanged: undefined }))}
              >
                Reload
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[12px]" onClick={() => updateTab(activeTab.path, (t) => ({ ...t, saved: t.diskChanged ?? t.saved, diskChanged: undefined }))}>
                Keep my version
              </Button>
            </Banner>
          )}

          <div className="relative min-h-0 flex-1">
            {editorTab && (
              <CodeEditor
                path={editorTab.path}
                value={editorTab.value}
                conversationId={conversationId}
                keepPaths={readyTabs.map((t) => t.path)}
                onChange={(value) => updateTab(editorTab.path, (t) => ({ ...t, value }))}
                onSave={(value) => {
                  updateTab(editorTab.path, (t) => ({ ...t, value }));
                  void save(editorTab.path, value).catch(() => undefined);
                }}
                revealLine={reveal?.path === editorTab.path ? reveal.line : undefined}
                revealKey={reveal?.nonce}
              />
            )}
            {!activeTab ? (
              <Overlay>
                <EmptyState title="No file open" description="Pick a file from the tree to view or edit it." className="py-8" />
              </Overlay>
            ) : activeTab.status === 'loading' ? (
              <Overlay>
                <Spinner />
              </Overlay>
            ) : activeTab.status === 'binary' || activeTab.status === 'tooLarge' ? (
              <Overlay>
                <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                  {activeTab.status === 'binary'
                    ? `${baseName(activeTab.path)} is a binary file, so it can't be shown here.`
                    : `${baseName(activeTab.path)} is ${formatBytes(activeTab.size)}, too large to open in the editor (the limit is 5 MB).`}
                </p>
                <Button size="sm" variant="outline" onClick={() => reveal_(activeTab.path)}>
                  <FolderOpen className="size-3.5" />
                  Show in folder
                </Button>
              </Overlay>
            ) : activeTab.status === 'error' ? (
              <Overlay>
                <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{activeTab.error}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateTab(activeTab.path, (t) => ({ ...t, status: 'loading', error: undefined }));
                      void loadTab(activeTab.path);
                    }}
                  >
                    Try again
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => closeTab(activeTab.path, true)}>
                    Close
                  </Button>
                </div>
              </Overlay>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">{children}</div>;
}

function Banner({ children, tone }: { children: ReactNode; tone?: 'warning' }) {
  return (
    <div className={cn('flex shrink-0 flex-wrap items-center gap-2 border-b border-divider px-3 py-1.5 text-[12.5px] text-fg-2', tone === 'warning' ? 'bg-warning/10' : 'bg-sidebar')}>{children}</div>
  );
}
