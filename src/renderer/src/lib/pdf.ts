/**
 * pdf.js for Study: the library, its worker and the ready-made viewer, loaded on first use.
 * The app is served from file://, where pdf.js cannot fetch its own data files (character maps,
 * standard fonts, image decoders), so they come from the main process over IPC instead.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { invoke } from './ipc';

type Pdfjs = typeof import('pdfjs-dist');
type ViewerModule = typeof import('pdfjs-dist/web/pdf_viewer.mjs');

let loading: Promise<{ pdfjs: Pdfjs; viewer: ViewerModule }> | null = null;

/** pdf.js calls `fetch({ kind, filename })` for each data file it needs. */
class CellarBinaryData {
  async fetch({ kind, filename }: { kind: 'cMapUrl' | 'standardFontDataUrl' | 'wasmUrl'; filename: string }): Promise<Uint8Array> {
    return invoke('study:pdfAsset', kind, filename);
  }
}

export function loadPdfjs(): Promise<{ pdfjs: Pdfjs; viewer: ViewerModule }> {
  loading ??= (async () => {
    const pdfjs = await import('pdfjs-dist');
    const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker');
    pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
    // The viewer module reads the library from this global.
    (globalThis as { pdfjsLib?: Pdfjs }).pdfjsLib = pdfjs;
    const viewer = await import('pdfjs-dist/web/pdf_viewer.mjs');
    await import('pdfjs-dist/web/pdf_viewer.css');
    return { pdfjs, viewer };
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

const open = new Map<string, Promise<PDFDocumentProxy>>();

/** The book's PDF, loaded once and kept while it is the book on screen. */
export function openBookDocument(bookId: string): Promise<PDFDocumentProxy> {
  const cached = open.get(bookId);
  if (cached) return cached;
  // One book at a time: a textbook can be hundreds of megabytes in memory.
  for (const [id, doc] of open) {
    open.delete(id);
    void doc.then((d) => d.loadingTask.destroy()).catch(() => undefined);
  }
  const doc = (async () => {
    const { pdfjs } = await loadPdfjs();
    const data = await invoke('study:bytes', bookId);
    return pdfjs.getDocument({
      data,
      BinaryDataFactory: CellarBinaryData,
      useWorkerFetch: false,
      cMapUrl: 'pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'pdfjs/standard_fonts/',
      wasmUrl: 'pdfjs/wasm/',
    }).promise;
  })();
  open.set(bookId, doc);
  doc.catch(() => open.delete(bookId));
  return doc;
}

export function forgetBookDocument(bookId: string): void {
  const doc = open.get(bookId);
  if (!doc) return;
  open.delete(bookId);
  void doc.then((d) => d.loadingTask.destroy()).catch(() => undefined);
}
