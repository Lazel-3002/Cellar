/**
 * Pictures of pages for a vision model. The viewer already has pdf.js and the document loaded, so
 * main asks it to draw the page (with what is written on it) instead of shipping a second PDF
 * renderer. When no window has the book open, there is no picture.
 */
import { bus } from '../lib/events';
import { newId } from '../lib/util';

const pending = new Map<string, { resolve: (base64: string | null) => void; timer: NodeJS.Timeout }>();

export function requestPageImage(bookId: string, page: number, maxEdge = 1400, timeoutMs = 12_000): Promise<string | null> {
  const requestId = newId();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve(null);
    }, timeoutMs);
    pending.set(requestId, { resolve, timer });
    bus.emit('study:render', { requestId, bookId, page, maxEdge });
  });
}

/** The viewer's answer (a PNG as base64, or null when it could not draw the page). */
export function deliverPageImage(requestId: string, base64: string | null): void {
  const entry = pending.get(requestId);
  if (!entry) return;
  pending.delete(requestId);
  clearTimeout(entry.timer);
  entry.resolve(base64 && base64.length < 40_000_000 ? base64 : null);
}
