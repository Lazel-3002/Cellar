import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw, TriangleAlert } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { Segmented } from '@/components/ui/form';
import { fromBase64 } from '@/lib/utils';

/** Untrusted, model-authored HTML: no CDNs beyond the two we allow, no access to app internals. */
const VIZ_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com",
  'font-src data: https://fonts.gstatic.com https://cdnjs.cloudflare.com',
  'img-src data: blob: https:',
  'connect-src https://cdnjs.cloudflare.com https://cdn.jsdelivr.net',
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const BOOTSTRAP = `<script>window.onerror=function(m){try{parent.postMessage({source:'cellar-inline-viz',ok:false,message:String(m)},'*')}catch(e){}}</script>`;

function buildDocument(content: string): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="${VIZ_CSP.replace(/"/g, '&quot;')}">`;
  const style = `<style>html,body{margin:0;padding:0;background:#fff;color:#1f1f1e;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}</style>`;
  if (/<html[\s>]/i.test(content)) return content.replace(/<head[^>]*>/i, (m) => `${m}${csp}${BOOTSTRAP}`);
  return `<!doctype html><html><head><meta charset="utf-8">${csp}${style}${BOOTSTRAP}</head><body>${content}</body></html>`;
}

export function InlineViz({ content, open }: { content: string; open: boolean }) {
  const html = useMemo(() => fromBase64(content), [content]);
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);

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
    <div className="not-prose my-3 w-full max-w-2xl overflow-hidden rounded-xl border border-composer-border bg-background">
      <div className="flex h-9 items-center gap-2 border-b border-divider bg-composer px-2.5">
        {failed && <TriangleAlert className="size-3.5 shrink-0 text-warning" />}
        <span className="flex-1 truncate text-[12px] text-muted-foreground">{failed ? "Couldn't render — showing the code" : 'Visualization'}</span>
        {!failed && (
          <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'preview', label: 'Preview' }, { value: 'code', label: 'Code' }]} />
        )}
        {!showCode && (
          <IconButton
            label="Reload"
            onClick={() => {
              setFailed(false);
              setReloadKey((k) => k + 1);
            }}
          >
            <RotateCw className="size-3.5" />
          </IconButton>
        )}
      </div>
      {showCode ? (
        <pre className="max-h-96 overflow-auto p-3 text-[12px] leading-relaxed whitespace-pre-wrap">
          <code>{html}</code>
        </pre>
      ) : (
        <iframe
          ref={frameRef}
          key={reloadKey}
          title="Inline visualization"
          sandbox="allow-scripts"
          srcDoc={buildDocument(html)}
          className="h-80 w-full border-0 bg-white"
        />
      )}
    </div>
  );
}
