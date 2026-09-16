import { useEffect, useRef, useState } from 'react';
import { RotateCw, TriangleAlert } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { Segmented } from '@/components/ui/form';
import { invoke } from '@/lib/ipc';
import { fromBase64 } from '@/lib/utils';

const BOOTSTRAP = `<script>window.onerror=function(m){try{parent.postMessage({source:'cellar-inline-viz',ok:false,message:String(m)},'*')}catch(e){}}</script>`;

// The CSP itself is delivered by the main process as a real response header on the
// cellar-viz:// document (see src/main/protocol/viz-protocol.ts) — a srcdoc/data: iframe would
// only ever inherit (and be further restricted by) the main window's own strict CSP.
function buildDocument(content: string): string {
  const style = `<style>html,body{margin:0;padding:0;background:#fff;color:#1f1f1e;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}</style>`;
  if (/<html[\s>]/i.test(content)) return content.replace(/<head[^>]*>/i, (m) => `${m}${BOOTSTRAP}`);
  return `<!doctype html><html><head><meta charset="utf-8">${style}${BOOTSTRAP}</head><body>${content}</body></html>`;
}

export function InlineViz({ content, open }: { content: string; open: boolean }) {
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const html = open ? '' : fromBase64(content);

  useEffect(() => {
    if (open) return;
    let cancelled = false;
    invoke('viz:register', buildDocument(html)).then((id) => {
      if (!cancelled) setSrc(`cellar-viz://render/${id}`);
    });
    return () => {
      cancelled = true;
    };
  }, [open, html, reloadKey]);

  useEffect(() => {
    if (open || failed) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.source === 'cellar-inline-viz' && e.data.ok === false) setFailed(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, failed, reloadKey]);

  if (open) {
    return (
      <div className="not-prose my-3 flex h-40 w-full max-w-2xl animate-pulse items-center justify-center rounded-xl border border-composer-border bg-composer text-[12.5px] text-muted-foreground">
        Rendering visualization…
      </div>
    );
  }

  const showCode = tab === 'code' || failed;

  return (
    <div className="not-prose group/viz relative my-3 w-full max-w-2xl overflow-hidden rounded-xl border border-composer-border bg-background">
      {failed ? (
        <div className="flex items-center gap-1.5 border-b border-divider bg-composer px-2.5 py-1.5 text-[11.5px] text-muted-foreground">
          <TriangleAlert className="size-3.5 shrink-0 text-warning" />
          <span className="flex-1">Couldn't render — showing the code</span>
          <IconButton
            label="Retry"
            onClick={() => {
              setFailed(false);
              setTab('preview');
              setReloadKey((k) => k + 1);
            }}
          >
            <RotateCw className="size-3.5" />
          </IconButton>
        </div>
      ) : (
        <div className="pointer-events-none absolute top-2 right-2 z-10 flex items-center gap-1 rounded-lg border border-composer-border bg-background/90 p-1 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/viz:pointer-events-auto group-hover/viz:opacity-100">
          <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'preview', label: 'Preview' }, { value: 'code', label: 'Code' }]} />
          {tab === 'preview' && (
            <IconButton label="Reload" onClick={() => setReloadKey((k) => k + 1)}>
              <RotateCw className="size-3.5" />
            </IconButton>
          )}
        </div>
      )}
      {showCode ? (
        <pre className="max-h-96 overflow-auto p-3 text-[12px] leading-relaxed whitespace-pre-wrap">
          <code>{html}</code>
        </pre>
      ) : src ? (
        <iframe ref={frameRef} key={reloadKey} title="Inline visualization" sandbox="allow-scripts" src={src} className="h-80 w-full border-0 bg-white" />
      ) : (
        <div className="flex h-80 w-full items-center justify-center bg-white text-[12.5px] text-muted-foreground">Loading…</div>
      )}
    </div>
  );
}
