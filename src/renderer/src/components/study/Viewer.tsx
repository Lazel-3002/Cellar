/**
 * The PDF on screen: pdf.js's own viewer (continuous pages, text you can select, links), with
 * Cellar's annotation layer mounted into every page it renders. pdf.js clears unknown children
 * from a page when it re-renders it, so the layer is re-attached on each `pagerendered`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Highlighter, MessageSquareText, Sparkles } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { nextAnnotationId } from '@shared/study/annotations';
import type { Book, StudyRect } from '@shared/types/study';
import { invoke, onEvent } from '@/lib/ipc';
import { loadPdfjs } from '@/lib/pdf';
import { useUi } from '@/stores/ui';
import { useStudyEditor, useStudyLayout } from '@/stores/study';
import { PageOverlay } from './Overlay';
import { renderPagePng } from './draw';

type ViewerModule = Awaited<ReturnType<typeof loadPdfjs>>['viewer'];
type PDFViewerInstance = InstanceType<ViewerModule['PDFViewer']>;

export interface ViewerControl {
  goTo: (page: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitWidth: () => void;
  fitPage: () => void;
  scale: () => number;
}

/** The viewer on screen, for the toolbar and the chat (page links). */
export const viewerControl: { current: ViewerControl | null } = { current: null };

interface SelectionInfo {
  page: number;
  text: string;
  rects: StudyRect[];
  /** Where to show the little toolbar, relative to the viewer. */
  anchor: { left: number; top: number };
}

/** Client rects of the selection turned into page points, merged into one box per line. */
function selectionOnPage(container: HTMLElement, book: Book): SelectionInfo | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const pageDiv = start?.closest<HTMLElement>('.page');
  if (!pageDiv || !container.contains(pageDiv)) return null;
  const page = Number(pageDiv.dataset.pageNumber);
  const info = book.pages[page - 1];
  const layer = pageDiv.querySelector<HTMLElement>('.cellar-study-overlay') ?? pageDiv;
  if (!info) return null;
  const box = layer.getBoundingClientRect();
  const kx = info.width / box.width;
  const ky = info.height / box.height;
  const raw = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5 && r.bottom > box.top && r.top < box.bottom && r.right > box.left && r.left < box.right);
  if (raw.length === 0) return null;
  const heights = raw.map((r) => r.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)];
  const rects = raw
    .filter((r) => r.height < median * 2.5)
    .map((r) => ({ x: (Math.max(r.left, box.left) - box.left) * kx, y: (r.top - box.top) * ky, w: (Math.min(r.right, box.right) - Math.max(r.left, box.left)) * kx, h: r.height * ky }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: StudyRect[] = [];
  for (const r of rects) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.y - r.y) < Math.min(last.h, r.h) * 0.5 && r.x <= last.x + last.w + 3) {
      const right = Math.max(last.x + last.w, r.x + r.w);
      const top = Math.min(last.y, r.y);
      last.h = Math.max(last.y + last.h, r.y + r.h) - top;
      last.y = top;
      last.x = Math.min(last.x, r.x);
      last.w = right - last.x;
    } else merged.push({ ...r });
  }
  const text = selection.toString().replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const end = raw[raw.length - 1];
  const host = container.getBoundingClientRect();
  return {
    page,
    text: text.slice(0, 4000),
    rects: merged.slice(0, 60).map((r) => ({ x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.w.toFixed(2), h: +r.h.toFixed(2) })),
    anchor: { left: Math.min(host.width - 250, Math.max(8, end.right - host.left - 120)), top: end.bottom - host.top + container.scrollTop + 8 },
  };
}

export function StudyViewer({ book, doc }: { book: Book; doc: PDFDocumentProxy }) {
  const container = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewerInstance | null>(null);
  const [overlays, setOverlays] = useState<Map<number, HTMLElement>>(() => new Map());
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const annotations = useStudyEditor((s) => s.book?.annotations ?? []);
  const tool = useStudyLayout((s) => s.tool);
  const highlightColor = useStudyLayout((s) => s.highlightColor);
  const setPendingPrompt = useUi((s) => s.setPendingPrompt);
  const startPage = useRef(useStudyEditor.getState().page || book.lastPage);
  const bookId = book.id;

  useEffect(() => {
    let disposed = false;
    let offs: Array<() => void> = [];
    let savePage: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const { viewer: V, pdfjs } = await loadPdfjs();
      if (disposed || !container.current || !inner.current) return;
      const eventBus = new V.EventBus();
      const linkService = new V.PDFLinkService({ eventBus });
      const findController = new V.PDFFindController({ eventBus, linkService });
      const viewer = new V.PDFViewer({
        container: container.current,
        viewer: inner.current,
        eventBus,
        linkService,
        findController,
        textLayerMode: 1,
        annotationMode: pdfjs.AnnotationMode.ENABLE,
        removePageBorders: false,
      });
      linkService.setViewer(viewer);
      viewerRef.current = viewer;

      const on = (name: string, listener: (event: never) => void) => {
        eventBus.on(name, listener as (event: unknown) => void);
        offs.push(() => eventBus.off(name, listener as (event: unknown) => void));
      };
      on('pagesinit', () => {
        viewer.currentScaleValue = 'page-width';
        const page = Math.min(Math.max(1, startPage.current), doc.numPages);
        if (page > 1) viewer.currentPageNumber = page;
      });
      on('pagechanging', (event: { pageNumber: number }) => {
        useStudyEditor.getState().setPage(event.pageNumber);
        clearTimeout(savePage);
        savePage = setTimeout(() => void invoke('study:setPage', bookId, event.pageNumber).catch(() => undefined), 800);
      });
      on('pagerendered', (event: { source: { div: HTMLDivElement; id: number } }) => {
        const div = event.source.div;
        const page = event.source.id;
        let el = div.querySelector<HTMLElement>(':scope > .cellar-study-host');
        if (!el) {
          el = document.createElement('div');
          el.className = 'cellar-study-host';
          div.appendChild(el);
        }
        const host = el;
        setOverlays((previous) => {
          if (previous.get(page) === host) return previous;
          const next = new Map(previous);
          next.set(page, host);
          // Pages pdf.js has let go of.
          for (const [p, node] of next) if (!node.isConnected) next.delete(p);
          return next;
        });
      });

      viewer.setDocument(doc);
      linkService.setDocument(doc, null);
      viewerControl.current = {
        goTo: (page) => {
          const target = Math.min(Math.max(1, Math.round(page)), doc.numPages);
          viewer.scrollPageIntoView({ pageNumber: target });
          viewer.currentPageNumber = target;
        },
        zoomIn: () => viewer.increaseScale(),
        zoomOut: () => viewer.decreaseScale(),
        fitWidth: () => {
          viewer.currentScaleValue = 'page-width';
        },
        fitPage: () => {
          viewer.currentScaleValue = 'page-fit';
        },
        scale: () => viewer.currentScale,
      };
    })();
    return () => {
      disposed = true;
      clearTimeout(savePage);
      for (const off of offs) off();
      offs = [];
      viewerControl.current = null;
      viewerRef.current?.setDocument(null as never);
      viewerRef.current = null;
      setOverlays(new Map());
    };
  }, [doc, bookId]);

  // The model turned the page, or wants a picture of one.
  useEffect(() => {
    const offs = [
      onEvent('study:goto', (event) => {
        if (event.bookId === bookId) viewerControl.current?.goTo(event.page);
      }),
      onEvent('study:render', (event) => {
        if (event.bookId !== bookId) return;
        const current = useStudyEditor.getState().book?.annotations ?? [];
        void renderPagePng(doc, event.page, current, event.maxEdge)
          .then((png) => invoke('study:rendered', event.requestId, png))
          .catch(() => invoke('study:rendered', event.requestId, null));
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [bookId, doc]);

  const addHighlight = useCallback(
    (info: SelectionInfo) => {
      const store = useStudyEditor.getState();
      const id = nextAnnotationId(store.book?.annotations ?? []);
      store.change((all) => [...all, { id, type: 'highlight', page: info.page, author: 'user', createdAt: Date.now(), rects: info.rects, color: highlightColor, text: info.text }]);
      window.getSelection()?.removeAllRanges();
      setSelectionInfo(null);
    },
    [highlightColor],
  );

  // Text selection: the highlighter highlights at once; otherwise a small toolbar offers to.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onUp = () => {
      setTimeout(() => {
        const info = selectionOnPage(el, book);
        if (!info) return setSelectionInfo(null);
        if (useStudyLayout.getState().tool === 'highlight') addHighlight(info);
        else setSelectionInfo(info);
      }, 0);
    };
    const onDown = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('[data-study-selection-bar]')) setSelectionInfo(null);
    };
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerdown', onDown);
    return () => {
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerdown', onDown);
    };
  }, [book, addHighlight]);

  const ask = (info: SelectionInfo, prompt?: string) => {
    useStudyEditor.getState().setSelection({ page: info.page, text: info.text });
    window.getSelection()?.removeAllRanges();
    setSelectionInfo(null);
    if (prompt) setPendingPrompt(prompt);
    else requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[data-testid="composer-input"]')?.focus());
  };

  return (
    <div className="absolute inset-0">
      <div
        ref={container}
        data-testid="study-viewer"
        className={`cellar-study-viewer absolute inset-0 overflow-auto ${tool === 'highlight' ? 'study-tool-highlight' : ''}`}
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest('.study-item')) useStudyEditor.getState().select(null);
        }}
      >
        <div ref={inner} className="pdfViewer" />
        {selectionInfo && tool !== 'highlight' && (
          <div
            data-study-selection-bar
            className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-menu-border bg-menu p-0.5 text-[12.5px] shadow-xl"
            style={{ left: selectionInfo.anchor.left, top: selectionInfo.anchor.top }}
          >
            <button className="flex h-7 items-center gap-1.5 rounded-md px-2 text-fg-2 hover:bg-hover hover:text-foreground" onClick={() => addHighlight(selectionInfo)} data-testid="study-highlight-selection">
              <Highlighter className="size-3.5" /> Highlight
            </button>
            <button className="flex h-7 items-center gap-1.5 rounded-md px-2 text-fg-2 hover:bg-hover hover:text-foreground" onClick={() => ask(selectionInfo)} data-testid="study-ask-selection">
              <MessageSquareText className="size-3.5" /> Ask
            </button>
            <button className="flex h-7 items-center gap-1.5 rounded-md px-2 text-fg-2 hover:bg-hover hover:text-foreground" onClick={() => ask(selectionInfo, 'Explain this in simple words.')}>
              <Sparkles className="size-3.5" /> Explain
            </button>
          </div>
        )}
      </div>
      {[...overlays].map(([page, host]) =>
        host.isConnected && book.pages[page - 1]
          ? createPortal(
              <PageOverlay
                page={page}
                info={book.pages[page - 1]}
                annotations={annotations.filter((a) => a.page === page)}
              />,
              host,
              `overlay-${page}`,
            )
          : null,
      )}
    </div>
  );
}
