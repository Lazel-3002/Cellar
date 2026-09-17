import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Globe, Plus, RotateCw, X } from 'lucide-react';
import type { BrowserLoginStatus, BrowserState } from '@shared/types/browser';
import { IconButton } from '@/components/ui/button';
import { invoke, onEvent } from '@/lib/ipc';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';

/**
 * Chrome for the built-in browser. The page itself is a native Chromium view the main process
 * parents to the window, so this panel's job is to draw the tab strip and the address bar, and to
 * keep main told where the page rectangle sits on screen (`browser:setBounds`). The empty div below
 * is that rectangle: nothing renders into it here.
 */
function hostOf(url: string): string {
  try {
    return url ? new URL(url).hostname : '';
  } catch {
    return '';
  }
}

export function BrowserPanel() {
  const { setBrowserOpen, browserWidth, setBrowserWidth } = useUi();
  const [state, setState] = useState<BrowserState>({ tabs: [], activeTabId: null, visible: false });
  const [address, setAddress] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [loginByHost, setLoginByHost] = useState<Record<string, BrowserLoginStatus>>({});
  const queriedHosts = useRef(new Set<string>());
  const surface = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const active = state.tabs.find((t) => t.id === state.activeTabId);

  useEffect(() => onEvent('browser:changed', setState), []);

  // One-time-per-host lookup for the tab strip's signed-in dot; a tab's login state rarely flips mid-session.
  useEffect(() => {
    for (const tab of state.tabs) {
      const host = hostOf(tab.url);
      if (!host || queriedHosts.current.has(host)) continue;
      queriedHosts.current.add(host);
      void invoke('browser:loginStatus', host).then((status) => setLoginByHost((prev) => ({ ...prev, [host]: status })));
    }
  }, [state.tabs]);
  useEffect(() => {
    void invoke('browser:state').then(setState);
    void invoke('browser:setVisible', true);
    return () => void invoke('browser:setVisible', false);
  }, []);

  useEffect(() => {
    if (!editing) setAddress(active?.url ?? '');
  }, [active?.url, active?.id, editing]);

  // Keep the native view exactly over the empty surface below, through resizes and layout changes.
  useLayoutEffect(() => {
    const el = surface.current;
    if (!el) return;
    const report = () => {
      const rect = el.getBoundingClientRect();
      void invoke('browser:setBounds', { x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    window.addEventListener('resize', report);
    const timer = setInterval(report, 1000);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current) setBrowserWidth(window.innerWidth - e.clientX);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setBrowserWidth]);

  const act = (work: Promise<unknown>) => {
    setError('');
    void work.catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const go = (raw: string, newTab = false) => {
    const text = raw.trim();
    if (!text) return;
    setEditing(false);
    act(newTab || !state.activeTabId ? invoke('browser:open', text, true) : invoke('browser:navigate', state.activeTabId, text));
  };

  return (
    <aside className="relative flex h-full shrink-0 flex-col border-l border-divider bg-background pt-9" style={{ width: Math.min(browserWidth, window.innerWidth - 360) }} data-testid="browser-panel">
      <div
        className="absolute top-0 bottom-0 -left-1 z-10 w-2 cursor-col-resize"
        onMouseDown={() => {
          dragging.current = true;
          document.body.style.cursor = 'col-resize';
        }}
      />
      <div className="flex h-9 items-center gap-1 border-b border-divider px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {state.tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => act(invoke('browser:activate', tab.id))}
              title={tab.url || 'New tab'}
              className={cn(
                'group flex h-7 min-w-0 max-w-44 items-center gap-1.5 rounded-md px-2 text-[12.5px]',
                tab.id === state.activeTabId ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-hover',
              )}
            >
              <span className="relative shrink-0">
                <Globe className={cn('size-3', tab.loading && 'animate-pulse')} />
                {loginByHost[hostOf(tab.url)] === 'logged_in' && (
                  <span className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full bg-success ring-1 ring-background" title="Signed in" />
                )}
              </span>
              <span className="truncate">{tab.title || tab.url || 'New tab'}</span>
              <span
                role="button"
                aria-label="Close tab"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  act(invoke('browser:close', tab.id));
                }}
                className="ml-auto opacity-0 group-hover:opacity-100"
              >
                <X className="size-3" />
              </span>
            </button>
          ))}
          <IconButton label="New tab" size="sm" onClick={() => act(invoke('browser:open', 'about:blank', true))}>
            <Plus className="size-3.5" />
          </IconButton>
        </div>
        <IconButton label="Close browser" size="sm" onClick={() => setBrowserOpen(false)}>
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="flex h-10 items-center gap-1 border-b border-divider px-2">
        <IconButton label="Back" size="sm" disabled={!active?.canGoBack} onClick={() => act(invoke('browser:back', state.activeTabId))}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <IconButton label="Forward" size="sm" disabled={!active?.canGoForward} onClick={() => act(invoke('browser:forward', state.activeTabId))}>
          <ArrowRight className="size-4" />
        </IconButton>
        <IconButton label="Reload" size="sm" disabled={!active} onClick={() => act(invoke('browser:reload', state.activeTabId))}>
          <RotateCw className={cn('size-4', active?.loading && 'animate-spin')} />
        </IconButton>
        <input
          value={address}
          placeholder="Search or type a web address"
          aria-label="Address"
          onChange={(e) => {
            setEditing(true);
            setAddress(e.target.value);
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go(address);
            if (e.key === 'Escape') {
              setEditing(false);
              setAddress(active?.url ?? '');
            }
          }}
          className="h-7 min-w-0 flex-1 rounded-md border border-composer-border bg-composer px-2.5 text-[12.5px] outline-none focus:border-brand/60"
        />
      </div>
      {(error || active?.error) && <div className="border-b border-divider bg-danger/10 px-3 py-1.5 text-[12px] text-danger">{error || active?.error}</div>}
      {/* The native Chromium view is painted over this rectangle. */}
      <div ref={surface} className="min-h-0 flex-1 bg-white" />
      {state.tabs.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-24 flex flex-col items-center justify-center gap-2 bg-background text-center text-[13px] text-muted-foreground">
          <Globe className="size-5" />
          <div>Type an address above to start browsing.</div>
          <div className="text-[12px]">Pages run in Cellar&apos;s own Chromium and share the app&apos;s session.</div>
        </div>
      )}
    </aside>
  );
}
