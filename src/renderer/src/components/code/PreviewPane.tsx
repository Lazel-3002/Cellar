import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppWindow, ArrowLeft, ArrowRight, CircleAlert, ExternalLink, FileCode, FileText, Globe, Monitor, RotateCw, Smartphone, Tablet, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Tip } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { cn } from '@/lib/utils';
import { useCodeUi } from '@/stores/code';

type Viewport = 'full' | 'tablet' | 'phone';

const VIEWPORTS: Record<Viewport, { label: string; width: number | null; icon: typeof Monitor }> = {
  full: { label: 'Full width', width: null, icon: Monitor },
  tablet: { label: 'Tablet (768 px)', width: 768, icon: Tablet },
  phone: { label: 'Phone (390 px)', width: 390, icon: Smartphone },
};

/** Untrusted project code: scripts run cross-origin, but the page cannot navigate the app. */
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads';
const PREVIEW_PREFIX = 'cellar-preview://';
const GUTTER = 16;

interface PreviewState {
  /** The iframe is cross-origin, so the pane keeps its own history of the URLs it loaded. */
  entries: string[];
  index: number;
  viewport: Viewport;
}

/** Kept per session outside React, so the pane comes back to the same page after it unmounts. */
const states = new Map<string, PreviewState>();
/** The last `previewRequest` each session handled, so a remount does not replay it. */
const handledRequests = new Map<string, number>();

const run = (p: Promise<unknown>) => void p.catch((err) => toast.error(err instanceof Error ? err.message : String(err)));

/** Path of a previewed file relative to the working folder ("" for the folder itself), or null for web pages. */
function previewPath(url: string): string | null {
  if (!url.startsWith(PREVIEW_PREFIX)) return null;
  try {
    const { pathname } = new URL(url);
    const path = pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/');
    return path && pathname.endsWith('/') ? `${path}/` : path;
  } catch {
    return null;
  }
}

function displayAddress(url: string): string {
  const path = previewPath(url);
  if (path === null) return url;
  try {
    const { search, hash } = new URL(url);
    return `${path || '/'}${search}${hash}`;
  } catch {
    return path || '/';
  }
}

/** Chromium's PDF viewer does not load in sandboxed frames; PDFs are served with a fixed type and nosniff. */
const isPdf = (url: string) => url.startsWith(PREVIEW_PREFIX) && /\.pdf([?#]|$)/i.test(url);

/** A web address the pane cannot show, as a link for the browser. */
function externalLink(input: string): string | undefined {
  const text = input.trim();
  if (/^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)([:/?#]|$)/i.test(text)) return undefined;
  if (/^https?:\/\/\S+$/i.test(text)) return text;
  if (/^www\.[^\s/]+/i.test(text)) return `https://${text}`;
  if (/^([a-z\d-]+(\.[a-z\d-]+)+:\d+|(\d{1,3}\.){3}\d{1,3})([:/?#]|$)/i.test(text)) return `http://${text}`;
  return undefined;
}

export function PreviewPane({ conversationId }: { conversationId: string }) {
  return <Preview key={conversationId} conversationId={conversationId} />;
}

function Preview({ conversationId }: { conversationId: string }) {
  const [state, setState] = useState<PreviewState>(() => states.get(conversationId) ?? { entries: [], index: -1, viewport: 'full' });
  const current = state.index >= 0 ? (state.entries[state.index] ?? null) : null;
  const [address, setAddress] = useState(() => (current ? displayAddress(current) : ''));
  const [error, setError] = useState<{ message: string; external?: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const attempt = useRef(0);
  const request = useCodeUi((s) => s.previewRequest);

  useEffect(() => {
    states.set(conversationId, state);
  }, [conversationId, state]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setStage({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A frame that starts a download never fires load; don't leave the progress bar running.
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 15_000);
    return () => clearTimeout(timer);
  }, [loading, current, reloadKey]);

  const open = useCallback(
    async (input: string) => {
      const text = input.trim();
      if (!text) return;
      const id = ++attempt.current;
      setResolving(true);
      setError(null);
      try {
        const url = await invoke('code:previewUrl', conversationId, text);
        if (id !== attempt.current) return;
        setState((s) => {
          if (s.entries[s.index] === url) return s;
          const entries = [...s.entries.slice(0, s.index + 1), url].slice(-50);
          return { ...s, entries, index: entries.length - 1 };
        });
        setAddress(displayAddress(url));
        setReloadKey((k) => k + 1);
        setLoading(true);
      } catch (err) {
        if (id !== attempt.current) return;
        setError({ message: err instanceof Error ? err.message : String(err), external: externalLink(text) });
      } finally {
        if (id === attempt.current) setResolving(false);
      }
    },
    [conversationId],
  );

  useEffect(() => {
    if (!request || request.conversationId !== conversationId || handledRequests.get(conversationId) === request.nonce) return;
    handledRequests.set(conversationId, request.nonce);
    void open(request.url);
  }, [request, conversationId, open]);

  const go = (delta: number) => {
    const index = state.index + delta;
    const url = state.entries[index];
    if (!url) return;
    attempt.current += 1;
    setResolving(false);
    setError(null);
    setState({ ...state, index });
    setAddress(displayAddress(url));
    setLoading(true);
  };

  const reload = () => {
    if (!current) return;
    setError(null);
    setReloadKey((k) => k + 1);
    setLoading(true);
  };

  const file = current ? previewPath(current) : null;
  const openOutside = () => {
    if (!current) return;
    if (file === null) run(invoke('system:openExternal', current));
    else run(invoke('tasks:openFile', conversationId, !file || file.endsWith('/') ? `${file}index.html` : file));
  };

  const deviceWidth = VIEWPORTS[state.viewport].width;
  const scale = deviceWidth && stage.width > GUTTER * 2 ? Math.min(1, (stage.width - GUTTER * 2) / deviceWidth) : 1;
  const boxHeight = Math.max(0, stage.height - GUTTER * 2);
  const AddressIcon = file !== null ? FileText : Globe;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="preview-pane">
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-divider px-1.5">
        <IconButton label="Back" disabled={state.index <= 0} onClick={() => go(-1)}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <IconButton label="Forward" disabled={state.index >= state.entries.length - 1} onClick={() => go(1)}>
          <ArrowRight className="size-4" />
        </IconButton>
        <IconButton label="Reload" disabled={!current} onClick={reload}>
          <RotateCw className="size-3.5" />
        </IconButton>
        <form
          className="relative mx-1 min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            void open(address);
          }}
        >
          <AddressIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="preview-address"
            aria-label="Preview address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              setAddress(current ? displayAddress(current) : '');
              e.currentTarget.blur();
            }}
            placeholder="localhost:5173 or index.html"
            spellCheck={false}
            autoComplete="off"
            className="h-7 rounded-md pl-7 text-[12.5px]"
          />
        </form>
        <div className="no-drag inline-flex shrink-0 items-center rounded-md bg-track p-0.5" role="group" aria-label="Viewport">
          {(Object.keys(VIEWPORTS) as Viewport[]).map((key) => {
            const { label, icon: Icon } = VIEWPORTS[key];
            return (
              <Tip key={key} label={label}>
                <button
                  type="button"
                  aria-label={label}
                  aria-pressed={state.viewport === key}
                  onClick={() => setState((s) => ({ ...s, viewport: key }))}
                  className={cn('flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground', state.viewport === key && 'bg-track-active text-foreground')}
                >
                  <Icon className="size-3.5" />
                </button>
              </Tip>
            );
          })}
        </div>
        <IconButton label={file !== null ? 'Open file' : 'Open in browser'} disabled={!current} onClick={openOutside}>
          <ExternalLink className="size-3.5" />
        </IconButton>
      </div>

      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b border-divider bg-danger/10 px-3 py-1.5 text-[12.5px]" role="alert">
          <CircleAlert className="size-3.5 shrink-0 text-danger" />
          <span className="min-w-0 flex-1 leading-snug text-fg-2">{error.message}</span>
          {error.external && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[12px]" onClick={() => error.external && run(invoke('system:openExternal', error.external))}>
              Open in browser
            </Button>
          )}
          <IconButton label="Dismiss" size="sm" onClick={() => setError(null)}>
            <X className="size-3.5" />
          </IconButton>
        </div>
      )}

      <div ref={stageRef} className={cn('relative min-h-0 flex-1 overflow-hidden', current && deviceWidth ? 'bg-sidebar' : 'bg-background')}>
        {(resolving || loading) && <div className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-brand" />}
        {current ? (
          <div className={cn('absolute inset-0 flex justify-center', deviceWidth && 'p-4')}>
            <div
              className={cn('overflow-hidden bg-white', deviceWidth && 'rounded-lg border border-composer-border shadow-lg shadow-black/10')}
              style={deviceWidth ? { width: deviceWidth * scale, height: boxHeight } : { width: '100%', height: '100%' }}
            >
              <iframe
                key={`${current}#${reloadKey}`}
                title="Preview"
                src={current}
                sandbox={isPdf(current) ? undefined : SANDBOX}
                onLoad={() => setLoading(false)}
                className="block origin-top-left border-0 bg-white"
                style={deviceWidth ? { width: deviceWidth, height: boxHeight / scale, transform: `scale(${scale})` } : { width: '100%', height: '100%' }}
              />
            </div>
          </div>
        ) : (
          <EmptyPreview conversationId={conversationId} busy={resolving} onOpen={(input) => void open(input)} />
        )}
      </div>
    </div>
  );
}

function EmptyPreview({ conversationId, busy, onOpen }: { conversationId: string; busy: boolean; onOpen: (input: string) => void }) {
  const [text, setText] = useState('');
  const { data: htmlFiles = [] } = useQuery({
    queryKey: ['code', 'preview-html-files', conversationId],
    queryFn: async () => (await invoke('code:listDir', conversationId, '.')).filter((entry) => !entry.isDirectory && /\.html?$/i.test(entry.name)).slice(0, 6),
    retry: false,
    staleTime: 10_000,
  });

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-5 py-10">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-selected text-fg-2">
            <AppWindow className="size-5" />
          </div>
          <h3 className="mt-3 text-[15px] font-medium text-foreground">Preview your app</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Start your dev server in the Terminal tab, then open its localhost address here. HTML, PDF, SVG and image files from the folder open too.
          </p>
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onOpen(text);
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="localhost:5173" aria-label="Address to preview" spellCheck={false} autoComplete="off" />
          <Button type="submit" disabled={!text.trim() || busy}>
            Open
          </Button>
        </form>
        {htmlFiles.length > 0 && (
          <div className="mt-6">
            <div className="mb-1 px-2 text-[12px] font-medium text-muted-foreground">HTML files</div>
            <ul>
              {htmlFiles.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={() => onOpen(entry.path)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-fg-2 hover:bg-hover hover:text-foreground"
                  >
                    <FileCode className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{entry.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
