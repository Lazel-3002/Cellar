import '@xterm/xterm/css/xterm.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal, type ITheme } from '@xterm/xterm';
import { Globe, Plus, RotateCw, SquareTerminal, X } from 'lucide-react';
import { toast } from 'sonner';
import type { TerminalInfo } from '@shared/types/code';
import { Button, IconButton } from '@/components/ui/button';
import { Spinner, Tip } from '@/components/ui/misc';
import { invoke, onEvent, platform } from '@/lib/ipc';
import { cn } from '@/lib/utils';
import { useCodeUi } from '@/stores/code';

const MAX_TERMINALS = 8;
const FONT_FAMILY = '"Cascadia Mono", Consolas, "Courier New", monospace';
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;
/** Dev-server addresses printed by tools like Vite (`Local:   http://localhost:5173/`). */
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d{1,5})?(?:[/?#][^\s'"<>`)\]]*)?/gi;
const LOCAL_LINK = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d{1,5})?(?:[/?#]|$)/i;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** 0.0.0.0 is a bind address; the preview needs a host it can load. */
function previewUrl(url: string): string {
  return url.replace(/[.,;:!?]+$/, '').replace(/^(https?:\/\/)0\.0\.0\.0/i, '$1localhost');
}

function openLink(conversationId: string, uri: string): void {
  if (LOCAL_LINK.test(uri)) useCodeUi.getState().openPreview(conversationId, previewUrl(uri));
  else if (/^https?:\/\//i.test(uri)) void invoke('system:openExternal', uri).catch((err) => toast.error(message(err)));
}

// ---------------------------------------------------------------------------
// Theme

const DARK_ANSI = {
  black: '#3a3a39',
  red: '#ef6b52',
  green: '#5bb67a',
  yellow: '#e0a43a',
  blue: '#6f9ff5',
  magenta: '#c882dc',
  cyan: '#56b3bf',
  white: '#c3c2b7',
  brightBlack: '#77766f',
  brightRed: '#f48d79',
  brightGreen: '#7fcb97',
  brightYellow: '#ecc16c',
  brightBlue: '#92b6f8',
  brightMagenta: '#d9a2e8',
  brightCyan: '#7fcbd4',
  brightWhite: '#f0efec',
};

/** Light backgrounds need darker "white" and yellow so default program colors stay readable. */
const LIGHT_ANSI = {
  black: '#141413',
  red: '#c0392b',
  green: '#2b7d46',
  yellow: '#8f6310',
  blue: '#2c5fbf',
  magenta: '#953aae',
  cyan: '#1c7784',
  white: '#5c5b56',
  brightBlack: '#73726c',
  brightRed: '#d1503a',
  brightGreen: '#35945a',
  brightYellow: '#a87414',
  brightBlue: '#3d73d4',
  brightMagenta: '#a64fc0',
  brightCyan: '#248c9a',
  brightWhite: '#3d3d3a',
};

function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) return color;
  const digits = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
  const n = parseInt(digits, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function readTheme(): ITheme {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const dark = root.dataset.theme !== 'light';
  const css = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const background = css('--background', dark ? '#151515' : '#faf9f5');
  const foreground = css('--foreground', dark ? '#f0efec' : '#141413');
  const brand = css('--brand', '#d97757');
  const tile = css('--tile', dark ? '#454442' : '#d8d5ca');
  return {
    ...(dark ? DARK_ANSI : LIGHT_ANSI),
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: withAlpha(brand, dark ? 0.38 : 0.28),
    selectionInactiveBackground: withAlpha(brand, dark ? 0.2 : 0.15),
    scrollbarSliderBackground: withAlpha(tile, 0.4),
    scrollbarSliderHoverBackground: withAlpha(tile, 0.75),
    scrollbarSliderActiveBackground: tile,
    overviewRulerBorder: background,
  };
}

/** Terminal colors from the app's CSS variables, updated when the theme or accent changes. */
function useTerminalTheme(): ITheme {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setTheme((prev) => {
        const next = readTheme();
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      }),
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

// ---------------------------------------------------------------------------
// One terminal

interface TerminalViewProps {
  conversationId: string;
  info: TerminalInfo;
  selected: boolean;
  /** Selected and the pane is showing. */
  active: boolean;
  /** Bumped when the terminal should take keyboard focus once active. */
  focusToken: number;
  theme: ITheme;
  onUrl: (id: string, url: string) => void;
  onRestart: (id: string) => void;
  onClose: (id: string) => void;
}

function TerminalView({ conversationId, info, selected, active, focusToken, theme, onUrl, onRestart, onClose }: TerminalViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<{ term: Terminal; fit: () => void } | null>(null);
  const activeRef = useRef(active);
  const exitedRef = useRef(info.exited);
  const onUrlRef = useRef(onUrl);
  const themeRef = useRef(theme);
  activeRef.current = active;
  exitedRef.current = info.exited;
  onUrlRef.current = onUrl;
  const { id } = info;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      cursorInactiveStyle: 'outline',
      scrollback: 5000,
      // Matches the pty's initial size until the first fit.
      cols: 100,
      rows: 30,
      theme: themeRef.current,
      windowsPty: platform === 'win32' ? { backend: 'conpty' } : undefined,
      linkHandler: { activate: (_event, uri) => openLink(conversationId, uri) },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon((_event, uri) => openLink(conversationId, uri)));
    term.open(host);

    let disposed = false;
    let replayed = false;
    let synced = false;
    let carry = '';

    // Scan complete lines only, so a URL split across chunks is still found whole.
    const scan = (data: string) => {
      const text = carry + data;
      const end = text.lastIndexOf('\n');
      carry = text.slice(end + 1).slice(-2048);
      if (end < 0) return;
      let found: string | undefined;
      for (const match of text.slice(0, end).replace(ANSI, '').matchAll(LOCAL_URL)) found = match[0];
      if (found) onUrlRef.current(id, previewUrl(found));
    };

    // Subscribe before asking for the buffer; the main process flushes pending output before
    // answering, so events that arrive until then are already part of the buffer.
    const offData = onEvent('terminal:data', (event) => {
      if (event.id !== id || !replayed) return;
      term.write(event.data);
      scan(event.data);
    });
    invoke('terminal:buffer', id).then(
      (buffer) => {
        if (disposed) return;
        replayed = true;
        if (buffer) {
          term.write(buffer);
          scan(buffer);
        }
      },
      () => {
        replayed = true;
      },
    );

    const send = (data: string) => {
      if (!exitedRef.current) void invoke('terminal:write', id, data).catch(() => undefined);
    };
    term.onData(send);
    term.onBinary(send);
    term.onResize(({ cols, rows }) => {
      synced = true;
      void invoke('terminal:resize', id, cols, rows).catch(() => undefined);
    });

    let fitTimer = 0;
    const fit = (attempt = 0) => {
      window.clearTimeout(fitTimer);
      if (disposed || !activeRef.current || host.clientWidth < 24 || host.clientHeight < 24) return;
      const dims = fitAddon.proposeDimensions();
      if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) {
        // xterm re-measures its cells shortly after a hidden terminal becomes visible.
        if (attempt < 10) fitTimer = window.setTimeout(() => fit(attempt + 1), 50);
        return;
      }
      const cols = Math.max(2, Math.min(500, dims.cols));
      const rows = Math.max(2, Math.min(500, dims.rows));
      if (cols !== term.cols || rows !== term.rows) term.resize(cols, rows);
      else if (!synced) {
        // A re-attached view may start at the size the pty already has, or not.
        synced = true;
        void invoke('terminal:resize', id, cols, rows).catch(() => undefined);
      }
    };
    const resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(fitTimer);
      fitTimer = window.setTimeout(() => fit(), 30);
    });
    resizeObserver.observe(host);

    const copySelection = () => {
      const text = term.getSelection();
      if (text) void navigator.clipboard.writeText(text).catch(() => undefined);
    };
    const paste = () => {
      if (exitedRef.current) return;
      void navigator.clipboard
        .readText()
        .then((text) => text && term.paste(text))
        .catch(() => undefined);
    };
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown' || !event.ctrlKey || event.altKey || event.metaKey) return true;
      const key = event.key.toLowerCase();
      const copy = key === 'c' && (event.shiftKey || term.hasSelection());
      const pasteKey = key === 'v';
      if (!copy && !pasteKey) return true;
      event.preventDefault();
      if (copy) {
        copySelection();
        if (!event.shiftKey) term.clearSelection();
      } else paste();
      return false;
    });
    // Like Windows Terminal: right-click copies a selection, otherwise pastes.
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (term.hasSelection()) {
        copySelection();
        term.clearSelection();
      } else paste();
      term.focus();
    };
    host.addEventListener('contextmenu', onContextMenu);

    viewRef.current = { term, fit };
    return () => {
      disposed = true;
      viewRef.current = null;
      window.clearTimeout(fitTimer);
      resizeObserver.disconnect();
      host.removeEventListener('contextmenu', onContextMenu);
      offData();
      term.dispose();
    };
  }, [conversationId, id]);

  useEffect(() => {
    themeRef.current = theme;
    if (viewRef.current) viewRef.current.term.options.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!active) return;
    viewRef.current?.fit();
    if (focusToken > 0) viewRef.current?.term.focus();
  }, [active, focusToken]);

  return (
    <div className={cn('absolute inset-0 flex flex-col', !selected && 'hidden')} data-testid="terminal-view">
      <div className="min-h-0 flex-1 pt-1.5 pr-1 pb-1 pl-3">
        <div ref={hostRef} className="h-full w-full" />
      </div>
      {info.exited && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-divider bg-sidebar px-3 py-1.5 text-[12.5px] text-muted-foreground">
          <span className="min-w-0 flex-1">
            Process exited with code <span className={cn('tabular-nums', info.exitCode ? 'text-danger' : 'text-fg-2')}>{info.exitCode ?? '?'}</span>
          </span>
          <span className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => onRestart(id)}>
              <RotateCw className="size-3.5" />
              Restart
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onClose(id)}>
              Close
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pane

export function TerminalPane({ conversationId, visible }: { conversationId: string; visible: boolean }) {
  return <SessionTerminals key={conversationId} conversationId={conversationId} visible={visible} />;
}

function SessionTerminals({ conversationId, visible }: { conversationId: string; visible: boolean }) {
  const [terminals, setTerminals] = useState<TerminalInfo[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [urls, setUrls] = useState<Record<string, { url: string; at: number }>>({});
  const theme = useTerminalTheme();
  const listSeq = useRef(0);
  const autoCreated = useRef(false);
  const wasVisible = useRef(visible);

  const refresh = useCallback(async () => {
    const seq = ++listSeq.current;
    try {
      const list = await invoke('terminal:list', conversationId);
      if (seq === listSeq.current) setTerminals(list);
    } catch (err) {
      if (seq !== listSeq.current) return;
      setError(message(err));
      setTerminals((prev) => prev ?? []);
    }
  }, [conversationId]);

  useEffect(() => {
    void refresh();
    return onEvent('terminal:changed', (event) => {
      if (event.conversationId === conversationId) void refresh();
    });
  }, [conversationId, refresh]);

  const list = useMemo(() => terminals ?? [], [terminals]);
  const selectedId = list.some((t) => t.id === activeId) ? activeId : (list.at(-1)?.id ?? null);
  const selected = list.find((t) => t.id === selectedId);

  const create = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const info = await invoke('terminal:create', conversationId);
      setActiveId(info.id);
      setFocusToken((n) => n + 1);
      await refresh();
    } catch (err) {
      if (list.length > 0) toast.error(message(err));
      else setError(message(err));
    } finally {
      setCreating(false);
    }
  }, [conversationId, refresh, list.length]);

  const close = useCallback(
    async (id: string) => {
      const index = list.findIndex((t) => t.id === id);
      if (id === selectedId) setActiveId((list[index + 1] ?? list[index - 1])?.id ?? null);
      setTerminals((prev) => prev?.filter((t) => t.id !== id) ?? prev);
      setUrls(({ [id]: _removed, ...rest }) => rest);
      try {
        await invoke('terminal:kill', id);
      } catch (err) {
        toast.error(message(err));
      } finally {
        void refresh();
      }
    },
    [list, selectedId, refresh],
  );

  const restart = useCallback(
    async (id: string) => {
      await close(id);
      await create();
    },
    [close, create],
  );

  const select = (id: string) => {
    setActiveId(id);
    setFocusToken((n) => n + 1);
  };

  const onUrl = useCallback((id: string, url: string) => {
    setUrls((prev) => {
      const current = prev[id];
      if (current?.url === url && Date.now() - current.at < 2000) return prev;
      return { ...prev, [id]: { url, at: Date.now() } };
    });
  }, []);

  const latestUrl = useMemo(() => {
    let best: { url: string; at: number } | undefined;
    for (const t of list) {
      const found = urls[t.id];
      if (found && !t.exited && (!best || found.at > best.at)) best = found;
    }
    return best?.url;
  }, [list, urls]);

  // Start the first terminal the first time the pane is shown for a session without one.
  useEffect(() => {
    if (!visible || terminals === null || autoCreated.current) return;
    autoCreated.current = true;
    if (terminals.length === 0) void create();
  }, [visible, terminals, create]);

  useEffect(() => {
    if (visible && !wasVisible.current) setFocusToken((n) => n + 1);
    wasVisible.current = visible;
  }, [visible]);

  return (
    <div data-testid="terminal-pane" className="@container flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-divider px-1.5">
        <div role="tablist" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
          {list.map((t) => {
            const isSelected = t.id === selectedId;
            return (
              <div
                key={t.id}
                role="tab"
                aria-selected={isSelected}
                data-testid="terminal-tab"
                title={t.cwd}
                onClick={() => select(t.id)}
                onAuxClick={(e) => e.button === 1 && void close(t.id)}
                className={cn(
                  'group flex h-7 max-w-48 shrink-0 items-center gap-1.5 rounded-md pr-0.5 pl-2 text-[12.5px] text-muted-foreground hover:bg-hover hover:text-foreground',
                  isSelected && 'bg-selected text-foreground hover:bg-selected',
                )}
              >
                <SquareTerminal className="size-3.5 shrink-0" strokeWidth={1.9} />
                <span className="truncate">{t.title}</span>
                {t.exited && <span className={cn('shrink-0 text-[11px] tabular-nums', t.exitCode ? 'text-danger' : 'text-muted-foreground')}>exited {t.exitCode ?? ''}</span>}
                <button
                  aria-label={`Close ${t.title}`}
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-foreground focus-visible:opacity-100',
                    isSelected && 'opacity-100',
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    void close(t.id);
                  }}
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
        {latestUrl && (
          <Tip label={`Open ${latestUrl} in Preview`}>
            <button
              data-testid="terminal-open-preview"
              className="no-drag flex h-6 shrink-0 items-center gap-1 rounded-md bg-brand/15 px-1.5 text-[12px] font-medium text-brand hover:bg-brand/25"
              onClick={() => useCodeUi.getState().openPreview(conversationId, latestUrl)}
            >
              <Globe className="size-3.5" />
              <span className="hidden @min-[420px]:inline">Open preview</span>
            </button>
          </Tip>
        )}
        {selected?.exited && (
          <IconButton label="Restart terminal" size="sm" onClick={() => void restart(selected.id)}>
            <RotateCw className="size-3.5" />
          </IconButton>
        )}
        <IconButton label={list.length >= MAX_TERMINALS ? `Up to ${MAX_TERMINALS} terminals per session` : 'New terminal'} size="sm" disabled={creating || list.length >= MAX_TERMINALS} onClick={() => void create()}>
          {creating ? <Spinner className="size-3.5" /> : <Plus className="size-4" />}
        </IconButton>
      </div>

      <div className="relative min-h-0 flex-1">
        {list.map((t) => (
          <TerminalView
            key={t.id}
            conversationId={conversationId}
            info={t}
            selected={t.id === selectedId}
            active={visible && t.id === selectedId}
            focusToken={focusToken}
            theme={theme}
            onUrl={onUrl}
            onRestart={(id) => void restart(id)}
            onClose={(id) => void close(id)}
          />
        ))}
        {terminals !== null && list.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            {creating ? (
              <>
                <Spinner />
                <p className="text-[13px] text-muted-foreground">Starting terminal…</p>
              </>
            ) : (
              <>
                <div className="flex size-10 items-center justify-center rounded-xl bg-selected text-fg-2">
                  <SquareTerminal className="size-5" />
                </div>
                <p className="max-w-72 text-[13px] leading-relaxed text-muted-foreground">{error ?? 'No terminal is open. Terminals start in the session’s working folder.'}</p>
                <Button size="sm" variant="secondary" onClick={() => void create()}>
                  <Plus className="size-3.5" />
                  {error ? 'Try again' : 'New terminal'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
