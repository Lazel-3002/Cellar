import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Copy, Download, Image as ImageIcon, MoreHorizontal, RotateCw, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { chartSvg } from '@shared/design/charts';
import { sanitizeSvg, sizedSvg } from '@shared/design/svg';
import { parseChartSpec, vizFileName, type VizKind } from '@shared/viz';
import { IconButton } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { invoke } from '@/lib/ipc';
import { useElementWidth } from '@/lib/hooks';
import { cn, fromBase64, toBase64 } from '@/lib/utils';
import { base64Of, copyPng, pngOnBackground, svgToPng } from '@/lib/viz-export';
import { chartTheme, useVizTheme, vizCssVariables, VIZ_FONT_STACK, type VizTheme } from '@/lib/viz-theme';

/** What the hover menu can hand out for the visualization it is attached to. */
interface Exports {
  /** SVG source, when the visualization is vector. */
  svg?: () => Promise<string | null>;
  /** PNG data URL, already painted on the chat background. */
  png: () => Promise<string | null>;
  title?: string;
}

// ---------------------------------------------------------------------------
// Shell: the frame-less container every inline visual shares

/**
 * Deliberately no border, no card and no background: an inline visual should read as part of the
 * message, the way a paragraph does. The only chrome is a `⋯` button that fades in on hover.
 */
function VizShell({
  kind,
  children,
  exports,
  code,
  onReload,
  className,
}: {
  kind: VizKind;
  children: React.ReactNode;
  exports?: Exports;
  code: string;
  onReload?: () => void;
  className?: string;
}) {
  const [showCode, setShowCode] = useState(false);

  const run = async (what: 'copy' | 'png' | 'svg') => {
    try {
      if (what === 'svg') {
        const svg = await exports?.svg?.();
        if (!svg) throw new Error('Nothing to save');
        const path = await invoke('viz:saveAs', vizFileName(exports?.title, 'svg'), toBase64(sizedSvg(svg)));
        if (path) toast.success('Saved the SVG');
        return;
      }
      const png = await exports?.png();
      if (!png) throw new Error('Nothing to copy');
      if (what === 'copy') {
        await copyPng(png);
        toast.success('Copied the image');
      } else {
        const path = await invoke('viz:saveAs', vizFileName(exports?.title, 'png'), base64Of(png));
        if (path) toast.success('Saved the PNG');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div data-viz={kind} className={cn('not-prose group/viz relative my-5 w-full', className)}>
      <div className="pointer-events-none absolute top-0 right-0 z-10 opacity-0 transition-opacity group-hover/viz:pointer-events-auto group-hover/viz:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
        <Menu>
          <MenuTrigger asChild>
            <button
              aria-label="Visualization options"
              className="flex size-6 items-center justify-center rounded-lg border border-divider bg-background/80 text-muted-foreground backdrop-blur-sm hover:bg-hover hover:text-foreground"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            {exports && (
              <>
                <MenuItem icon={<Copy />} onSelect={() => void run('copy')}>
                  Copy to clipboard
                </MenuItem>
                <MenuItem icon={<Download />} onSelect={() => void run('png')}>
                  Download PNG
                </MenuItem>
                {exports.svg && (
                  <MenuItem icon={<ImageIcon />} onSelect={() => void run('svg')}>
                    Download SVG
                  </MenuItem>
                )}
                <MenuSeparator />
              </>
            )}
            <MenuItem icon={<Code2 />} onSelect={() => setShowCode((v) => !v)}>
              {showCode ? 'Show visualization' : 'Show code'}
            </MenuItem>
            <MenuItem
              icon={<Copy />}
              onSelect={() => {
                void navigator.clipboard.writeText(code);
                toast.success('Copied the code');
              }}
            >
              Copy code
            </MenuItem>
            {onReload && (
              <MenuItem icon={<RotateCw />} onSelect={onReload}>
                Reload
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
      </div>
      {showCode ?
        <pre className="max-h-96 overflow-auto rounded-xl border border-divider bg-code p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
          <code>{code}</code>
        </pre>
      : children}
    </div>
  );
}

function VizSkeleton({ height = 220 }: { height?: number }) {
  return <div className="not-prose my-5 w-full animate-pulse rounded-lg bg-muted" style={{ height }} />;
}

// ---------------------------------------------------------------------------
// chart: Cellar draws it

function VizChart({ source }: { source: string }) {
  const theme = useVizTheme();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const spec = useMemo(() => parseChartSpec(source), [source]);

  const svg = useMemo(() => {
    if (!spec || !width) return null;
    const circular = spec.kind === 'pie' || spec.kind === 'donut';
    const height = spec.height ?? Math.round(Math.min(circular ? 340 : 300, Math.max(200, width * (circular ? 0.55 : 0.42))));
    return chartSvg(spec, width, height, {
      theme: chartTheme(theme),
      palette: theme.palette,
      fontStack: VIZ_FONT_STACK,
      legendOnTop: true,
      axisColor: theme.muted,
    });
  }, [spec, width, theme]);

  const exports = useMemo<Exports>(
    () => ({
      title: spec?.title,
      svg: async () => svg,
      png: async () => (svg ? svgToPng(svg, theme.background) : null),
    }),
    [svg, spec?.title, theme.background],
  );

  // Unparseable JSON is the model's mistake, not a rendering failure: show what it wrote.
  if (!spec) {
    return (
      <div className="not-prose my-5 w-full">
        <div className="mb-1.5 flex items-center gap-1.5 font-sans text-[11.5px] text-muted-foreground">
          <TriangleAlert className="size-3.5 shrink-0 text-warning" />
          Couldn't read this chart — showing what the model wrote
        </div>
        <pre className="max-h-96 overflow-auto rounded-xl border border-divider bg-code p-3 font-mono text-[12px] whitespace-pre-wrap">
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  return (
    <VizShell kind="chart" exports={exports} code={source}>
      <div ref={ref} className="w-full" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
    </VizShell>
  );
}

// ---------------------------------------------------------------------------
// svg: the model's own drawing, straight in the message

function VizSvg({ source }: { source: string }) {
  const theme = useVizTheme();
  const clean = useMemo(() => sanitizeSvg(source), [source]);
  const title = useMemo(() => /<title[^>]*>([^<]{1,80})</i.exec(source)?.[1]?.trim(), [source]);

  const exports = useMemo<Exports>(
    () => ({
      title,
      svg: async () => clean,
      png: async () => (clean ? svgToPng(clean, theme.background) : null),
    }),
    [clean, title, theme.background],
  );

  if (!clean) {
    return (
      <pre className="not-prose my-5 max-h-96 w-full overflow-auto rounded-xl border border-divider bg-code p-3 font-mono text-[12px] whitespace-pre-wrap">
        <code>{source}</code>
      </pre>
    );
  }

  return (
    <VizShell kind="svg" exports={exports} code={source}>
      {/* The sanitizer forces `height="100%"`; CSS wins over presentation attributes, so the
          drawing keeps its own aspect ratio inside the message column. */}
      <div
        className="w-full font-sans text-foreground [&>svg]:!h-auto [&>svg]:w-full [&_text]:fill-current"
        style={{ fontFamily: VIZ_FONT_STACK }}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    </VizShell>
  );
}

// ---------------------------------------------------------------------------
// html: the sandboxed frame, for the ones that have to react

/**
 * Runs before anything the model wrote. It reports the document's height so the frame can be
 * exactly as tall as its content (no inner scrollbar, no empty band), pre-themes Chart.js the
 * moment the CDN defines it, and answers export requests from the app.
 */
function bootstrap(theme: VizTheme): string {
  const config = JSON.stringify({ text: theme.foreground, grid: theme.divider, muted: theme.muted, bg: theme.background, font: VIZ_FONT_STACK, palette: theme.palette });
  return `<script>(function(){
var C=${config};
var post=function(m){try{m.source='cellar-inline-viz';parent.postMessage(m,'*')}catch(e){}};
window.onerror=function(m){post({type:'error',message:String(m)})};
window.addEventListener('error',function(e){if(e.target&&e.target!==window&&e.target.tagName)post({type:'error',fatal:true,message:'Could not load '+(e.target.src||e.target.href||e.target.tagName)})},true);
window.addEventListener('unhandledrejection',function(e){post({type:'error',message:String(e.reason)})});
var chart;
function theme(v){
v.defaults.color=C.text;v.defaults.borderColor=C.grid;v.defaults.font.family=C.font;v.defaults.font.size=12;
v.defaults.maintainAspectRatio=false;v.defaults.animation.duration=380;
v.defaults.plugins.legend.position='top';v.defaults.plugins.legend.align='start';
v.defaults.plugins.legend.labels.color=C.text;v.defaults.plugins.legend.labels.boxWidth=10;v.defaults.plugins.legend.labels.boxHeight=10;v.defaults.plugins.legend.labels.padding=14;
v.defaults.plugins.tooltip.backgroundColor=C.text;v.defaults.plugins.tooltip.titleColor=C.bg;v.defaults.plugins.tooltip.bodyColor=C.bg;
v.defaults.scale.grid.color=C.grid;v.defaults.scale.ticks.color=C.muted;v.defaults.scale.border.color=C.grid;
v.defaults.elements.arc.borderColor=C.bg;v.defaults.elements.arc.borderWidth=2;
v.defaults.elements.point.radius=0;v.defaults.elements.line.tension=0.25;v.defaults.elements.line.borderWidth=2;
// Claude's charts are recognizable partly by their colors; a model that names none still gets them.
v.register({id:'cellarPalette',beforeUpdate:function(c){
var kind=c.config&&c.config.type;var perPoint=kind==='pie'||kind==='doughnut'||kind==='polarArea';
(c.data.datasets||[]).forEach(function(ds,i){
var pick=function(j){return C.palette[j%C.palette.length]};
if(ds.backgroundColor==null)ds.backgroundColor=perPoint?(ds.data||[]).map(function(_,j){return pick(j)}):pick(i);
if(ds.borderColor==null&&!perPoint)ds.borderColor=pick(i);
})}});
}
try{Object.defineProperty(window,'Chart',{configurable:true,get:function(){return chart},set:function(v){chart=v;try{theme(v)}catch(e){}}})}catch(e){}
var last=0,queued=false;
function measure(){var b=document.body,d=document.documentElement;if(!b)return;
var h=Math.max(b.scrollHeight,b.offsetHeight,d?d.scrollHeight:0);
if(!h)return;h=Math.min(2400,Math.ceil(h));if(Math.abs(h-last)<3)return;last=h;post({type:'height',height:h})}
// Throttled with a timer, not requestAnimationFrame: Chromium stops running rAF in a
// cross-origin iframe that is scrolled out of view, which would latch the queued flag
// forever and leave the frame at its placeholder height.
function schedule(){if(queued)return;queued=true;setTimeout(function(){queued=false;measure()},32)}
function watch(){if(!document.body)return;
if(window.ResizeObserver)new ResizeObserver(schedule).observe(document.body);
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true});schedule()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch);else watch();
window.addEventListener('load',schedule);
// CDN libraries and web fonts settle after load, so keep looking for a few seconds.
var ticks=0,timer=setInterval(function(){schedule();if(++ticks>40)clearInterval(timer)},150);
window.addEventListener('message',function(e){var d=e.data;if(!d||d.source!=='cellar-inline-viz-host')return;
if(d.type==='export'){var out={type:'export-result',id:d.id};
try{var s=document.querySelector('svg');if(s)out.svg=new XMLSerializer().serializeToString(s)}catch(err){}
try{var c=document.querySelector('canvas');if(c)out.png=c.toDataURL('image/png')}catch(err){}
post(out)}});
})();</script>`;
}

function buildDocument(content: string, theme: VizTheme): string {
  const variables = Object.entries(vizCssVariables(theme))
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
  const style = `<style>
:root{${variables};color-scheme:${theme.dark ? 'dark' : 'light'}}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:transparent;color:var(--text-primary);font-family:${VIZ_FONT_STACK};font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}
body{overflow-x:hidden}
canvas,svg,img{max-width:100%}
a{color:var(--accent)}
input,button,select,textarea{font-family:inherit;font-size:inherit;color:inherit;accent-color:var(--accent)}
h1,h2,h3,h4{margin:0 0 .4em;line-height:1.3}
p{margin:0 0 .6em}
</style>`;
  const head = `<meta charset="utf-8">${style}${bootstrap(theme)}`;
  const body = content.replace(/^\s*<!doctype[^>]*>/i, '').trim();
  if (/<html[\s>]/i.test(body)) {
    return /<head[^>]*>/i.test(body) ? body.replace(/<head[^>]*>/i, (m) => `${m}${head}`) : body.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`);
  }
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

function VizFrame({ html }: { html: string }) {
  const theme = useVizTheme();
  const [src, setSrc] = useState<string | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const measured = useRef(false);

  useEffect(() => {
    let cancelled = false;
    measured.current = false;
    setHeight(null);
    setSrc(null);
    invoke('viz:register', buildDocument(html, theme)).then((id) => {
      if (!cancelled) setSrc(`cellar-viz://render/${id}`);
    });
    return () => {
      cancelled = true;
    };
  }, [html, theme, reloadKey]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow || e.data?.source !== 'cellar-inline-viz') return;
      if (e.data.type === 'height') {
        measured.current = true;
        setHeight(Math.max(40, Number(e.data.height) || 0));
      }
      // A script that never arrived is fatal; a runtime error after something already drew is not.
      if (e.data.type === 'error' && (e.data.fatal || !measured.current)) setFailed(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [reloadKey]);

  // A frame that never reports a height rendered nothing; show the source rather than a blank gap.
  useEffect(() => {
    if (!src || failed) return;
    const timer = setTimeout(() => {
      if (!measured.current) setFailed(true);
    }, 6000);
    return () => clearTimeout(timer);
  }, [src, failed, reloadKey]);

  /** Ask the frame for its drawing; it is a different origin, so nothing can be read from here. */
  const askFrame = useCallback(
    () =>
      new Promise<{ svg?: string; png?: string }>((resolve) => {
        const frame = frameRef.current?.contentWindow;
        if (!frame) return resolve({});
        const id = Math.random().toString(36).slice(2);
        const timer = setTimeout(() => {
          window.removeEventListener('message', onReply);
          resolve({});
        }, 2500);
        function onReply(e: MessageEvent) {
          if (e.data?.source !== 'cellar-inline-viz' || e.data.type !== 'export-result' || e.data.id !== id) return;
          clearTimeout(timer);
          window.removeEventListener('message', onReply);
          resolve({ svg: e.data.svg, png: e.data.png });
        }
        window.addEventListener('message', onReply);
        frame.postMessage({ source: 'cellar-inline-viz-host', type: 'export', id }, '*');
      }),
    [],
  );

  const exports = useMemo<Exports>(
    () => ({
      svg: async () => (await askFrame()).svg ?? null,
      png: async () => {
        const result = await askFrame();
        if (result.png) return pngOnBackground(result.png, theme.background);
        if (result.svg) return svgToPng(result.svg, theme.background);
        return null;
      },
    }),
    [askFrame, theme.background],
  );

  const reload = useCallback(() => {
    setFailed(false);
    setReloadKey((k) => k + 1);
  }, []);

  if (failed) {
    return (
      <div className="not-prose my-5 w-full">
        <div className="mb-1.5 flex items-center gap-1.5 font-sans text-[11.5px] text-muted-foreground">
          <TriangleAlert className="size-3.5 shrink-0 text-warning" />
          <span className="flex-1">Couldn't render — showing the code</span>
          <IconButton label="Retry" size="sm" onClick={reload}>
            <RotateCw className="size-3.5" />
          </IconButton>
        </div>
        <pre className="max-h-96 overflow-auto rounded-xl border border-divider bg-code p-3 font-mono text-[12px] whitespace-pre-wrap">
          <code>{html}</code>
        </pre>
      </div>
    );
  }

  return (
    <VizShell kind="html" exports={exports} code={html} onReload={reload}>
      <div className="relative w-full">
        {src && (
          <iframe
            ref={frameRef}
            key={reloadKey}
            title="Inline visualization"
            sandbox="allow-scripts"
            src={src}
            scrolling="no"
            style={{ height: height ?? 240 }}
            className={cn('block w-full border-0 bg-transparent transition-opacity duration-200', height === null && 'opacity-0')}
          />
        )}
        {height === null && <div className="absolute inset-0 animate-pulse rounded-lg bg-muted" />}
      </div>
    </VizShell>
  );
}

// ---------------------------------------------------------------------------

export function InlineViz({ kind, content, open }: { kind: VizKind; content: string; open: boolean }) {
  // While the fence is still streaming the content is half-written; a partial chart or SVG would
  // flash broken shapes, so hold the space until the closing fence lands.
  if (open) return <VizSkeleton height={kind === 'html' ? 240 : 200} />;
  const source = fromBase64(content);
  if (kind === 'chart') return <VizChart source={source} />;
  if (kind === 'svg') return <VizSvg source={source} />;
  return <VizFrame html={source} />;
}
