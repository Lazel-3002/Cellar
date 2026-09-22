/**
 * Reads a PDF once, when it is added: every page's size, its text as positioned lines, and the
 * outline (chapters). The viewer renders the PDF itself; this is what the model reads and what
 * answers are placed against.
 */
import type { BookOutlineItem, BookPageInfo, PageLine } from '@shared/types/study';
import { groupLines, type TextRun } from '@shared/study/lines';

type Matrix = [number, number, number, number, number, number];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export interface ExtractedPdf {
  pageCount: number;
  pages: BookPageInfo[];
  lines: PageLine[][];
  outline: BookOutlineItem[];
  title: string;
}

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

/** One text item as a run in page coordinates (top-left origin, the page's rotation applied). */
function toRun(item: TextItemLike, viewport: Matrix): TextRun | null {
  const tx = multiply(viewport, item.transform as Matrix);
  const size = Math.hypot(tx[2], tx[3]) || Math.abs(item.height) || 10;
  const angle = Math.atan2(tx[1], tx[0]);
  if (Math.abs(angle) > 0.2) {
    // Rotated text: its box, turned upright, is still where a highlight should go.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const corners = [
      [0, 0],
      [item.width, 0],
      [0, -size],
      [item.width, -size],
    ].map(([u, v]) => [tx[4] + u * cos - v * sin, tx[5] + u * sin + v * cos]);
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    return { text: item.str, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), eol: item.hasEOL };
  }
  return { text: item.str, x: tx[4], y: tx[5] - size * 0.88, w: Math.abs(item.width), h: size * 1.08, eol: item.hasEOL };
}

type OutlineNode = { title: string; dest: string | unknown[] | null; items?: OutlineNode[] };

export async function extractPdf(bytes: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<ExtractedPdf> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const pageCount = pdf.numPages;
    const pages: BookPageInfo[] = [];
    const lines: PageLine[][] = [];
    for (let number = 1; number <= pageCount; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      let pageLines: PageLine[] = [];
      try {
        const content = await page.getTextContent();
        const runs = (content.items as unknown[])
          .filter((item): item is TextItemLike => !!item && typeof (item as TextItemLike).str === 'string' && Array.isArray((item as TextItemLike).transform))
          .map((item) => toRun(item, viewport.transform as Matrix))
          .filter((run): run is TextRun => !!run);
        pageLines = groupLines(runs);
      } catch {
        // A page whose text cannot be read is treated like a scanned one.
      }
      const chars = pageLines.reduce((sum, line) => sum + line.text.length, 0);
      pages.push({ width: Math.round(viewport.width * 100) / 100, height: Math.round(viewport.height * 100) / 100, chars });
      lines.push(pageLines);
      page.cleanup();
      onProgress?.(number, pageCount);
      // pdf.js runs in this thread here: give the rest of the app a turn between pages.
      if (number % 4 === 0) await new Promise((resolve) => setImmediate(resolve));
    }

    const outline: BookOutlineItem[] = [];
    try {
      const walk = async (nodes: OutlineNode[], depth: number) => {
        for (const node of nodes) {
          if (outline.length >= 400) return;
          let page = 0;
          try {
            const dest = typeof node.dest === 'string' ? await pdf.getDestination(node.dest) : node.dest;
            const target = Array.isArray(dest) ? dest[0] : null;
            if (typeof target === 'number') page = target + 1;
            else if (target && typeof target === 'object') page = (await pdf.getPageIndex(target as { num: number; gen: number })) + 1;
          } catch {
            // An outline entry that points nowhere is skipped.
          }
          const title = String(node.title ?? '').replace(/\s+/g, ' ').trim();
          if (page >= 1 && page <= pageCount && title) outline.push({ title: title.slice(0, 200), page, depth });
          if (node.items?.length && depth < 3) await walk(node.items, depth + 1);
        }
      };
      await walk(((await pdf.getOutline()) ?? []) as OutlineNode[], 0);
    } catch {
      // No outline.
    }

    let title = '';
    try {
      const meta = await pdf.getMetadata();
      const info = meta.info as { Title?: unknown } | undefined;
      title = typeof info?.Title === 'string' ? info.Title.trim() : '';
    } catch {
      // No metadata.
    }
    return { pageCount, pages, lines, outline, title };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

/** The viewport transform of each page, for turning page points back into PDF space on export. */
export async function pageTransforms(bytes: Uint8Array): Promise<Array<{ transform: Matrix; rotation: number }>> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const out: Array<{ transform: Matrix; rotation: number }> = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      out.push({ transform: viewport.transform as Matrix, rotation: viewport.rotation });
      page.cleanup();
    }
    return out;
  } finally {
    await pdf.loadingTask.destroy();
  }
}
