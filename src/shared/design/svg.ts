const MAX_SVG_CHARS = 150_000;

/**
 * Cleans model-written SVG: keeps one <svg> root, removes scripts, event handlers, foreign content and
 * references to anything outside the document, and adds a viewBox so it scales to its box. The result is
 * shown through an <img> data URL, which never runs scripts or loads resources either way.
 */
export function sanitizeSvg(input: string): string | null {
  let svg = String(input ?? '').slice(0, MAX_SVG_CHARS);
  const start = svg.search(/<svg[\s>]/i);
  const end = svg.toLowerCase().lastIndexOf('</svg>');
  if (start < 0 || end < start) return null;
  svg = svg.slice(start, end + 6);
  svg = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!(?:DOCTYPE|ENTITY)[^>]*>/gi, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<(script|foreignObject|iframe|object|embed|audio|video|canvas|style)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|foreignObject|iframe|object|embed|audio|video|canvas|style)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Only in-document references (#id) survive.
    .replace(/\s+(xlink:href|href)\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '')
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, 'none')
    .replace(/javascript:/gi, '');
  const root = /^<svg\b[^>]*>/i.exec(svg)?.[0];
  if (!root) return null;
  let fixed = root;
  if (!/\sxmlns\s*=/.test(fixed)) fixed = fixed.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (!/\sviewBox\s*=/i.test(fixed)) {
    const w = /\swidth\s*=\s*["']?([\d.]+)/i.exec(fixed)?.[1];
    const h = /\sheight\s*=\s*["']?([\d.]+)/i.exec(fixed)?.[1];
    if (w && h) fixed = fixed.replace(/^<svg/i, `<svg viewBox="0 0 ${w} ${h}"`);
  }
  // Let the box decide the size.
  fixed = fixed.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/^<svg/i, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"');
  if (/preserveAspectRatio="xMidYMid meet"[^>]*preserveAspectRatio=/i.test(fixed)) fixed = fixed.replace(/\spreserveAspectRatio="xMidYMid meet"/i, '');
  return fixed + svg.slice(root.length);
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Pixel size of an SVG, preferring its viewBox. The width/height attributes are only a fallback,
 * and a relative one (`width="100%"`, which is exactly what the sanitizer writes so the drawing
 * fills the message column) says nothing about pixels — reading the digits off it would export a
 * 100×100 thumbnail of a 680-wide diagram.
 */
export function measureSvg(svg: string, fallbackWidth: number): { width: number; height: number } {
  const attr = (name: string) => {
    const match = new RegExp(`<svg[^>]*?\\s${name}\\s*=\\s*("[^"]*"|'[^']*')`, 'i').exec(svg);
    if (!match) return undefined;
    const raw = match[1].slice(1, -1).trim();
    if (!/^[\d.]+(px)?$/i.test(raw)) return undefined;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };
  const box = /<svg[^>]*\sviewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg);
  const boxWidth = box ? Number(box[3]) : undefined;
  const boxHeight = box ? Number(box[4]) : undefined;
  const width = boxWidth || attr('width') || fallbackWidth;
  const ratio = boxWidth && boxHeight ? boxHeight / boxWidth : 0.6;
  const height = (boxWidth ? undefined : attr('height')) ?? Math.round(width * ratio);
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/**
 * An SVG with explicit pixel dimensions. Inline SVG is sized by its container (`width="100%"`),
 * which gives a rasterizer nothing to work with and would make a downloaded file open tiny.
 */
export function sizedSvg(svg: string, fallbackWidth = 720): string {
  const { width, height } = measureSvg(svg, fallbackWidth);
  const root = /^<svg\b[^>]*>/i.exec(svg.trim());
  if (!root) return svg;
  let open = root[0].replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  if (!/\sxmlns\s*=/.test(open)) open = open.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  open = open.replace(/^<svg/i, `<svg width="${width}" height="${height}"`);
  return open + svg.trim().slice(root[0].length);
}

