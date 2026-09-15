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
