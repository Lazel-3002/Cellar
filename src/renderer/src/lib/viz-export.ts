/** Copying and downloading an inline visualization: SVG text in, PNG pixels out. */
import { measureSvg, sizedSvg } from '@shared/design/svg';

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read the image'));
    image.src = src;
  });

/**
 * Paint an image onto the chat's own background at 2×. Charts and diagrams are drawn on
 * transparency so they blend into the message; a file saved that way would be unreadable
 * wherever it lands next, so the export bakes the background in.
 */
async function paint(src: string, background: string, width: number, height: number): Promise<string> {
  const image = await loadImage(src);
  const scale = 2;
  const w = Math.max(1, Math.round((image.naturalWidth || width) * scale));
  const h = Math.max(1, Math.round((image.naturalHeight || height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw the image');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}

/** PNG data URL for an SVG source string. */
export async function svgToPng(svg: string, background: string, fallbackWidth = 720): Promise<string> {
  const sized = sizedSvg(svg, fallbackWidth);
  const { width, height } = measureSvg(sized, fallbackWidth);
  return paint(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`, background, width, height);
}

/** Re-paint a transparent PNG (a Chart.js canvas, say) onto the chat background. */
export async function pngOnBackground(dataUrl: string, background: string): Promise<string> {
  return paint(dataUrl, background, 720, 432);
}

export function base64Of(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/** Put a PNG on the clipboard, so it can be pasted straight into a document or a chat. */
export async function copyPng(dataUrl: string): Promise<void> {
  // Decoded by hand rather than with `fetch(dataUrl)`, which the renderer's `connect-src 'self'` blocks.
  const binary = atob(base64Of(dataUrl));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
}
