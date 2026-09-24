import { memo, useMemo, type AnchorHTMLAttributes, type CSSProperties, type ComponentType, type ReactNode } from 'react';
import { usePacedText } from '@/lib/usePacedText';
import { useSettings } from '@/lib/queries';
import { createCodePlugin } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import { createMermaidPlugin } from '@streamdown/mermaid';
import { Streamdown, type Components } from 'streamdown';
import { parseArtifacts } from '@shared/artifacts';
import { withImageTags } from '@shared/inline-images';
import type { ArtifactType } from '@shared/types/chat';
import { parseVizBlocks, type VizKind } from '@shared/viz';
import { invoke } from '@/lib/ipc';
import { cn, toBase64 } from '@/lib/utils';
import { ArtifactCard } from './ArtifactCard';
import { InlineImage } from './InlineImage';
import { InlineViz } from './InlineViz';
import { usePageLinks, withPageLinks } from './PageLinks';

const plugins = {
  code: createCodePlugin({ themes: ['github-light', 'github-dark-default'] }),
  math: createMathPlugin({ singleDollarTextMath: true }),
  mermaid: createMermaidPlugin({ config: { theme: 'dark', securityLevel: 'strict' } }),
};

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Replace artifact code fences with a placeholder element that renders as a clickable card. */
export function withArtifactCards(markdown: string): string {
  const artifacts = parseArtifacts(markdown);
  if (artifacts.length === 0) return markdown;
  let out = '';
  let cursor = 0;
  for (const a of artifacts) {
    out += markdown.slice(cursor, a.start);
    out += `\n\n<artifact-card identifier="${escapeAttr(a.identifier)}" title="${escapeAttr(a.title)}" kind="${a.type}" open="${a.open}"></artifact-card>\n\n`;
    cursor = a.end;
  }
  return out + markdown.slice(cursor);
}

/** Replace visualization code fences (`chart`, `svg viz`, `html viz`) with a placeholder element. */
export function withVizBlocks(markdown: string): string {
  const blocks = parseVizBlocks(markdown);
  if (blocks.length === 0) return markdown;
  let out = '';
  let cursor = 0;
  for (const b of blocks) {
    out += markdown.slice(cursor, b.start);
    out += `\n\n<inline-viz kind="${b.kind}" content="${toBase64(b.content)}" open="${b.open}"></inline-viz>\n\n`;
    cursor = b.end;
  }
  return out + markdown.slice(cursor);
}

/** Replace the first two `[[image: query]]` tags with a placeholder element; drop the rest. */
export function withInlineImages(markdown: string, streaming: boolean): string {
  return withImageTags(markdown, (query) => `<inline-image query="${escapeAttr(query)}"></inline-image>`, { max: 2, streaming });
}

interface MarkdownProps {
  content: string;
  streaming?: boolean;
  /** Fade each streamed word in instead of popping it onto the page. */
  smooth?: SmoothStreaming | null;
  conversationId?: string;
  className?: string;
  artifacts?: boolean;
}

export interface SmoothStreaming {
  fadeMs: number;
  staggerMs: number;
  blurPx: number;
  risePx: number;
  unit: 'word' | 'char';
  /** Words let out per second; 0 shows them as fast as the model sends them. */
  pace: number;
}

/** The Smooth streaming settings, or null when it's off. */
export function useSmoothStreaming(): SmoothStreaming | null {
  const { data: s } = useSettings();
  return useMemo(() => {
    if (!(s?.smoothStreaming ?? true)) return null;
    return { fadeMs: s?.smoothFadeMs ?? 900, staggerMs: s?.smoothStaggerMs ?? 45, blurPx: s?.smoothBlurPx ?? 10, risePx: s?.smoothRisePx ?? 6, unit: s?.smoothUnit ?? 'word', pace: s?.smoothPace ?? 12 };
  }, [s?.smoothStreaming, s?.smoothFadeMs, s?.smoothStaggerMs, s?.smoothBlurPx, s?.smoothRisePx, s?.smoothUnit, s?.smoothPace]);
}


export const Markdown = memo(function Markdown({ content: rawContent, streaming: rawStreaming, smooth, conversationId, className, artifacts = true }: MarkdownProps) {
  const paced = usePacedText(rawContent, !!rawStreaming, smooth?.pace);
  const content = paced.text;
  const streaming = rawStreaming || paced.revealing;
  const pageLinks = usePageLinks();
  const source = useMemo(() => {
    const withPages = pageLinks ? withPageLinks(content, pageLinks.pageCount) : content;
    if (!artifacts) return withPages;
    return withInlineImages(withVizBlocks(withArtifactCards(withPages)), !!streaming);
  }, [content, artifacts, streaming, pageLinks]);
  const components = useMemo(() => {
    const Card: ComponentType<Record<string, unknown>> = (props) => (
      <ArtifactCard
        conversationId={conversationId}
        identifier={String(props.identifier ?? '')}
        title={String(props.title ?? 'Artifact')}
        type={String(props.kind ?? 'code') as ArtifactType}
        open={props.open === 'true' || props.open === true}
      />
    );
    const Viz: ComponentType<Record<string, unknown>> = (props) => (
      <InlineViz kind={(String(props.kind ?? 'html') as VizKind) || 'html'} content={String(props.content ?? '')} open={props.open === 'true' || props.open === true} />
    );
    const Image: ComponentType<Record<string, unknown>> = (props) => <InlineImage query={String(props.query ?? '')} />;
    const Anchor = ({ href, children }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a
        href={href ?? '#'}
        onClick={(e) => {
          e.preventDefault();
          if (href && /^https?:\/\//i.test(href)) void invoke('system:openExternal', href);
        }}
      >
        {children}
      </a>
    );
    const PageLink: ComponentType<Record<string, unknown> & { children?: ReactNode }> = (props) => (
      <button
        type="button"
        className="study-page-link"
        data-testid="page-link"
        onClick={() => pageLinks?.goTo(Number(props.page))}
        title={`Go to page ${String(props.page)}`}
      >
        {props.children}
      </button>
    );
    return { 'artifact-card': Card, 'inline-viz': Viz, 'inline-image': Image, 'page-link': PageLink, a: Anchor } as Components;
  }, [conversationId, pageLinks]);

  const animated = useMemo(
    () =>
      smooth
        ? { animation: 'cellarSmooth', duration: smooth.fadeMs, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', sep: smooth.unit, stagger: smooth.unit === 'char' ? Math.round(smooth.staggerMs / 4) : smooth.staggerMs, maxBacklogMs: Math.max(400, smooth.fadeMs) }
        : false,
    [smooth],
  );
  const smoothVars = smooth ? ({ '--cellar-smooth-blur': `${smooth.blurPx}px`, '--cellar-smooth-rise': `${smooth.risePx}px` } as CSSProperties) : undefined;

  const body = (
    <Streamdown
      className={cn('prose-chat', className)}
      mode={streaming ? 'streaming' : 'static'}
      isAnimating={streaming}
      animated={animated}
      caret={streaming ? 'block' : undefined}
      plugins={plugins}
      shikiTheme={['github-light', 'github-dark-default']}
      controls={{ table: true, code: true, mermaid: { download: true, copy: true, fullscreen: true, panZoom: true } }}
      allowedTags={{ 'artifact-card': ['identifier', 'title', 'kind', 'open'], 'inline-viz': ['kind', 'content', 'open'], 'inline-image': ['query'], 'page-link': ['page', 'to'] }}
      components={components}
      linkSafety={{ enabled: false }}
      lineNumbers={false}
    >
      {source}
    </Streamdown>
  );
  return smoothVars ? <div style={{ ...smoothVars, display: 'contents' }}>{body}</div> : body;
});
