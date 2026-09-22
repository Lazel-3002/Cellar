/**
 * The annotation layer painted onto a canvas, over a page rendered by pdf.js: the picture a vision
 * model gets of a page (so it can read handwriting), and the covers on the shelf.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { MARK_COLORS, MARK_SYMBOL } from '@shared/study/annotations';
import type { StudyAnnotation } from '@shared/types/study';

const FONT = '"Segoe UI", system-ui, sans-serif';

function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export function drawAnnotations(ctx: CanvasRenderingContext2D, annotations: StudyAnnotation[], scale: number): void {
  ctx.save();
  ctx.scale(scale, scale);
  for (const a of annotations) {
    switch (a.type) {
      case 'highlight':
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = a.color;
        for (const r of a.rects) ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.restore();
        break;
      case 'text': {
        ctx.fillStyle = a.color;
        ctx.font = `${a.size}px ${FONT}`;
        ctx.textBaseline = 'alphabetic';
        wrapLines(ctx, a.text, a.width).forEach((line, index) => ctx.fillText(line, a.x, a.y + a.size * (1.05 + index * 1.3)));
        break;
      }
      case 'ink':
        for (const stroke of a.strokes) {
          ctx.save();
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.width;
          ctx.globalAlpha = stroke.opacity ?? 1;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          for (let i = 0; i + 1 < stroke.points.length; i += 2) {
            if (i === 0) ctx.moveTo(stroke.points[0], stroke.points[1]);
            else ctx.lineTo(stroke.points[i], stroke.points[i + 1]);
          }
          if (stroke.points.length === 2) ctx.lineTo(stroke.points[0] + 0.1, stroke.points[1]);
          ctx.stroke();
          ctx.restore();
        }
        break;
      case 'mark': {
        ctx.fillStyle = MARK_COLORS[a.verdict];
        ctx.font = `bold 15px ${FONT}`;
        ctx.textBaseline = 'top';
        ctx.fillText(MARK_SYMBOL[a.verdict], a.x, a.y - 2);
        if (a.comment) {
          ctx.font = `9px ${FONT}`;
          ctx.fillText(a.comment, a.x + 16, a.y + 2);
        }
        break;
      }
      case 'note': {
        ctx.fillStyle = '#f5c542';
        ctx.fillRect(a.x - 8, a.y, 16, 14);
        ctx.fillStyle = '#6b5100';
        ctx.font = `bold 10px ${FONT}`;
        ctx.textBaseline = 'top';
        ctx.fillText('✎', a.x - 5, a.y + 2);
        // Notes are read from the text; the picture only shows where they are.
        break;
      }
    }
  }
  ctx.restore();
}

/** A page with its annotations as a PNG (base64, no data: prefix), at most `maxEdge` pixels on its long side. */
export async function renderPagePng(doc: PDFDocumentProxy, pageNumber: number, annotations: StudyAnnotation[], maxEdge: number): Promise<string> {
  const canvas = await renderPageCanvas(doc, pageNumber, annotations, maxEdge);
  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}

export async function renderPageCanvas(doc: PDFDocumentProxy, pageNumber: number, annotations: StudyAnnotation[], maxEdge: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, maxEdge / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  drawAnnotations(
    ctx,
    annotations.filter((a) => a.page === pageNumber),
    scale,
  );
  return canvas;
}
