import type { ColorToken, DesignFormat, DesignTheme, Gradient, ThemeColors } from '../types/design';

/**
 * Theme presets. Fonts are ones Windows and Office ship, so exported PowerPoint and Word files
 * look the same on other computers.
 */
export const THEMES: DesignTheme[] = [
  {
    id: 'paper',
    name: 'Paper',
    colors: { background: '#FFFFFF', surface: '#F3F2EE', text: '#1C1C1A', muted: '#6B6A64', primary: '#1C1C1A', secondary: '#8A8579', accent: '#C8553D' },
    fonts: { heading: 'Segoe UI', body: 'Segoe UI' },
  },
  {
    id: 'corporate',
    name: 'Minimal corporate',
    colors: { background: '#FFFFFF', surface: '#F1F5F9', text: '#0F172A', muted: '#64748B', primary: '#1D4ED8', secondary: '#0EA5E9', accent: '#F59E0B' },
    fonts: { heading: 'Bahnschrift', body: 'Segoe UI' },
  },
  {
    id: 'academic',
    name: 'Vintage academic',
    colors: { background: '#F6F0E4', surface: '#EAE0CB', text: '#2B2118', muted: '#6E5E4E', primary: '#7A2E1F', secondary: '#2F4A3A', accent: '#B8893B' },
    fonts: { heading: 'Palatino Linotype', body: 'Georgia' },
  },
  {
    id: 'scifi',
    name: 'High-tech sci-fi',
    colors: { background: '#070B18', surface: '#111A30', text: '#E6F1FF', muted: '#8AA0C0', primary: '#22D3EE', secondary: '#A78BFA', accent: '#F472B6' },
    fonts: { heading: 'Bahnschrift', body: 'Segoe UI' },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    colors: { background: '#FAFAF7', surface: '#EFEDE6', text: '#111111', muted: '#5F5F5A', primary: '#C8102E', secondary: '#111111', accent: '#E8B04A' },
    fonts: { heading: 'Georgia', body: 'Segoe UI' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    colors: { background: '#111318', surface: '#1C1F28', text: '#F2F2F2', muted: '#9AA0AA', primary: '#E0B15C', secondary: '#6E8BFF', accent: '#E0B15C' },
    fonts: { heading: 'Constantia', body: 'Segoe UI' },
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: { background: '#F3F1EA', surface: '#E1E6D6', text: '#1E2A1F', muted: '#5C6B5D', primary: '#2F6B3F', secondary: '#8AA36F', accent: '#D08C60' },
    fonts: { heading: 'Candara', body: 'Corbel' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    colors: { background: '#F0F7FA', surface: '#FFFFFF', text: '#0B2530', muted: '#4F6D7A', primary: '#0077B6', secondary: '#00B4D8', accent: '#FF8C42' },
    fonts: { heading: 'Trebuchet MS', body: 'Segoe UI' },
  },
  {
    id: 'pop',
    name: 'Pop',
    colors: { background: '#FFF8E7', surface: '#FFFFFF', text: '#1B1B3A', muted: '#5A5A7A', primary: '#FF5A5F', secondary: '#3D5AFE', accent: '#FFC400' },
    fonts: { heading: 'Arial Black', body: 'Segoe UI' },
  },
  {
    id: 'mono',
    name: 'Mono',
    colors: { background: '#FFFFFF', surface: '#F0F0F0', text: '#000000', muted: '#555555', primary: '#000000', secondary: '#444444', accent: '#FF3B00' },
    fonts: { heading: 'Consolas', body: 'Consolas' },
  },
];

export const DEFAULT_THEME_ID = 'paper';

export function themeById(id: string | undefined): DesignTheme | undefined {
  if (!id) return undefined;
  const key = id.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return THEMES.find((t) => t.id === key || t.name.toLowerCase().replace(/[\s_]+/g, '-') === key || t.name.toLowerCase().includes(key.replace(/-/g, ' ')));
}

export const defaultTheme = (): DesignTheme => structuredClone(THEMES[0]);

export type FontCategory = 'sans' | 'serif' | 'display' | 'mono';

/** Fonts offered in the editor, with fallbacks for other systems. */
export const FONTS: Array<{ name: string; category: FontCategory; fallback: string }> = [
  { name: 'Segoe UI', category: 'sans', fallback: 'system-ui, sans-serif' },
  { name: 'Calibri', category: 'sans', fallback: 'Carlito, sans-serif' },
  { name: 'Arial', category: 'sans', fallback: 'Helvetica, sans-serif' },
  { name: 'Bahnschrift', category: 'sans', fallback: "'DIN Alternate', 'Segoe UI', sans-serif" },
  { name: 'Verdana', category: 'sans', fallback: 'sans-serif' },
  { name: 'Tahoma', category: 'sans', fallback: 'sans-serif' },
  { name: 'Trebuchet MS', category: 'sans', fallback: 'sans-serif' },
  { name: 'Corbel', category: 'sans', fallback: "'Segoe UI', sans-serif" },
  { name: 'Candara', category: 'sans', fallback: "'Segoe UI', sans-serif" },
  { name: 'Franklin Gothic Medium', category: 'sans', fallback: 'Arial, sans-serif' },
  { name: 'Georgia', category: 'serif', fallback: "'Times New Roman', serif" },
  { name: 'Cambria', category: 'serif', fallback: 'Georgia, serif' },
  { name: 'Constantia', category: 'serif', fallback: 'Georgia, serif' },
  { name: 'Palatino Linotype', category: 'serif', fallback: "'Book Antiqua', Palatino, serif" },
  { name: 'Book Antiqua', category: 'serif', fallback: 'Palatino, serif' },
  { name: 'Garamond', category: 'serif', fallback: 'Georgia, serif' },
  { name: 'Times New Roman', category: 'serif', fallback: 'Times, serif' },
  { name: 'Arial Black', category: 'display', fallback: 'Arial, sans-serif' },
  { name: 'Impact', category: 'display', fallback: "'Arial Black', sans-serif" },
  { name: 'Segoe Script', category: 'display', fallback: 'cursive' },
  { name: 'Gabriola', category: 'display', fallback: 'serif' },
  { name: 'Consolas', category: 'mono', fallback: "'Cascadia Mono', 'Courier New', monospace" },
  { name: 'Courier New', category: 'mono', fallback: 'monospace' },
];

const WIDE_FONTS = new Set(['verdana', 'tahoma', 'arial black', 'impact', 'bahnschrift', 'consolas', 'courier new', 'franklin gothic medium']);

/** Font name for a font value ("heading", "body" or a name). */
export function fontName(font: string | undefined, theme: DesignTheme, fallback: 'heading' | 'body' = 'body'): string {
  const value = (font ?? '').trim();
  if (!value || value === 'body') return fallback === 'heading' && !value ? theme.fonts.heading : theme.fonts.body;
  if (value === 'heading') return theme.fonts.heading;
  return value.replace(/["';{}<>]/g, '').slice(0, 60);
}

/** CSS font-family with fallbacks. */
export function fontStack(name: string): string {
  const known = FONTS.find((f) => f.name.toLowerCase() === name.toLowerCase());
  const category = known?.fallback ?? (/serif|georgia|times|garamond|palatino|cambria/i.test(name) ? 'Georgia, serif' : "'Segoe UI', system-ui, sans-serif");
  return `'${name}', ${category}`;
}

export function isWideFont(name: string): boolean {
  return WIDE_FONTS.has(name.toLowerCase());
}

/** Artboard sizes in CSS pixels (96 per inch, so A4 and Letter print at their real size). */
export const ARTBOARD_PRESETS: Record<string, { label: string; width: number; height: number; formats: DesignFormat[] }> = {
  slide: { label: 'Slide 16:9', width: 1920, height: 1080, formats: ['slides'] },
  'slide-4-3': { label: 'Slide 4:3', width: 1440, height: 1080, formats: ['slides'] },
  a4: { label: 'A4 portrait', width: 794, height: 1123, formats: ['document', 'poster'] },
  'a4-landscape': { label: 'A4 landscape', width: 1123, height: 794, formats: ['document'] },
  letter: { label: 'US Letter', width: 816, height: 1056, formats: ['document'] },
  a3: { label: 'A3 poster', width: 1123, height: 1587, formats: ['poster'] },
  square: { label: 'Square post', width: 1080, height: 1080, formats: ['social'] },
  portrait: { label: 'Portrait post 4:5', width: 1080, height: 1350, formats: ['social'] },
  story: { label: 'Story 9:16', width: 1080, height: 1920, formats: ['social'] },
  banner: { label: 'Banner 3:1', width: 1500, height: 500, formats: ['social', 'web'] },
  thumbnail: { label: 'Video thumbnail', width: 1280, height: 720, formats: ['social'] },
  desktop: { label: 'Desktop screen', width: 1440, height: 900, formats: ['web'] },
  tablet: { label: 'Tablet screen', width: 834, height: 1194, formats: ['web', 'mobile'] },
  mobile: { label: 'Phone screen', width: 390, height: 844, formats: ['mobile'] },
};

export const FORMAT_DEFAULTS: Record<DesignFormat, { label: string; preset: string; description: string }> = {
  slides: { label: 'Slides', preset: 'slide', description: 'Presentations at 16:9' },
  document: { label: 'Document', preset: 'a4', description: 'One-pagers, reports and letters' },
  social: { label: 'Social post', preset: 'square', description: 'Posts, stories and banners' },
  poster: { label: 'Poster', preset: 'a3', description: 'Flyers and posters' },
  web: { label: 'Web page', preset: 'desktop', description: 'Landing pages and dashboards' },
  mobile: { label: 'App screen', preset: 'mobile', description: 'Phone app mockups' },
  custom: { label: 'Custom', preset: 'slide', description: 'Any size' },
};

/** "slide", "1920x1080", "A4" or a size object → a size. */
export function parseSize(value: unknown, fallback = 'slide'): { width: number; height: number } {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const width = Number(v.width ?? v.w);
    const height = Number(v.height ?? v.h);
    if (width > 0 && height > 0) return clampSize(width, height);
  }
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    const match = /^(\d{2,5})\s*[x×*,]\s*(\d{2,5})/.exec(text);
    if (match) return clampSize(Number(match[1]), Number(match[2]));
    const key = text.replace(/[\s_:]+/g, '-').replace(/^slides?-?16-9$|^16-9$|^presentation$|^widescreen$/, 'slide').replace(/^4-3$/, 'slide-4-3');
    const preset = ARTBOARD_PRESETS[key] ?? Object.values(ARTBOARD_PRESETS).find((p) => p.label.toLowerCase() === text) ?? ARTBOARD_PRESETS[FORMAT_DEFAULTS[key as DesignFormat]?.preset ?? ''];
    if (preset) return { width: preset.width, height: preset.height };
  }
  const preset = ARTBOARD_PRESETS[fallback] ?? ARTBOARD_PRESETS.slide;
  return { width: preset.width, height: preset.height };
}

function clampSize(width: number, height: number) {
  return { width: Math.round(Math.min(8000, Math.max(50, width))), height: Math.round(Math.min(8000, Math.max(50, height))) };
}

const COLOR_TOKENS: ColorToken[] = ['background', 'surface', 'text', 'muted', 'primary', 'secondary', 'accent'];

const NAMED: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
  gray: '#808080',
  grey: '#808080',
  red: '#E53935',
  green: '#43A047',
  blue: '#1E88E5',
  yellow: '#FDD835',
  orange: '#FB8C00',
  purple: '#8E24AA',
  pink: '#EC407A',
  teal: '#00897B',
  navy: '#1A237E',
  gold: '#C9A227',
  silver: '#BDBDBD',
  beige: '#F5F0E1',
  cream: '#FFFDD0',
  brown: '#6D4C41',
};

const TOKEN_ALIASES: Record<string, ColorToken> = {
  bg: 'background',
  foreground: 'text',
  fg: 'text',
  'text-muted': 'muted',
  subtle: 'muted',
  brand: 'primary',
  main: 'primary',
  highlight: 'accent',
  card: 'surface',
  panel: 'surface',
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;

/** A color as stored: a theme color name, a hex color, "transparent", or null when it cannot be read. */
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^\$|^var\(--|\)$/g, '').toLowerCase();
  if (!text) return null;
  if (text === 'transparent' || text === 'none') return 'transparent';
  if ((COLOR_TOKENS as string[]).includes(text)) return text;
  if (TOKEN_ALIASES[text]) return TOKEN_ALIASES[text];
  if (HEX.test(value.trim())) return value.trim().toUpperCase();
  if (RGB.test(value.trim())) return value.trim();
  if (NAMED[text]) return NAMED[text];
  return null;
}

/** The CSS color for a stored color. */
export function resolveColor(value: string | undefined, theme: DesignTheme, fallback: ColorToken | 'transparent' = 'text'): string {
  const normalized = value ? normalizeColor(value) : null;
  if (!normalized) return fallback === 'transparent' ? 'transparent' : theme.colors[fallback];
  if (normalized === 'transparent') return 'transparent';
  if ((COLOR_TOKENS as string[]).includes(normalized)) return theme.colors[normalized as ColorToken];
  return normalized;
}

export function gradientCss(gradient: Gradient, theme: DesignTheme): string {
  return `linear-gradient(${Math.round(gradient.angle)}deg, ${resolveColor(gradient.from, theme, 'primary')}, ${resolveColor(gradient.to, theme, 'secondary')})`;
}

/** RGB channels and alpha of a CSS color (hex or rgb()). */
export function parseRgb(color: string): { r: number; g: number; b: number; a: number } | null {
  const hex = color.trim();
  if (HEX.test(hex)) {
    let h = hex.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(hex);
  if (m) return { r: Math.min(255, +m[1]), g: Math.min(255, +m[2]), b: Math.min(255, +m[3]), a: m[4] === undefined ? 1 : Math.min(1, +m[4]) };
  return null;
}

/** "RRGGBB" for Office formats. */
export function hex6(color: string): string {
  const rgb = parseRgb(color);
  if (!rgb) return '000000';
  return [rgb.r, rgb.g, rgb.b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function luminance(color: string): number {
  const rgb = parseRgb(color);
  if (!rgb) return 0;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** A color `t` of the way from `a` to `b`, as hex. */
export function mixColors(a: string, b: string, t: number): string {
  const x = parseRgb(a);
  const y = parseRgb(b);
  if (!x || !y) return a;
  const channel = (p: number, q: number) => Math.round(p + (q - p) * t).toString(16).padStart(2, '0');
  return `#${channel(x.r, y.r)}${channel(x.g, y.g)}${channel(x.b, y.b)}`.toUpperCase();
}

/** WCAG contrast ratio between two colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on the color. */
export function readableOn(color: string): string {
  return contrastRatio(color, '#FFFFFF') >= contrastRatio(color, '#111111') ? '#FFFFFF' : '#111111';
}

/** Series colors for charts: theme colors first, then derived shades. */
export function chartPalette(colors: ThemeColors): string[] {
  return [colors.primary, colors.accent, colors.secondary, colors.muted, '#7C9885', '#B56576', '#6C8EAD', '#E0A458'].filter((c, i, list) => list.indexOf(c) === i);
}

/** A theme with some colors or fonts replaced (by a preset id or values). */
export function customizeTheme(base: DesignTheme, patch: { preset?: string; colors?: Record<string, unknown>; fonts?: Record<string, unknown>; name?: string }): DesignTheme {
  const preset = patch.preset ? themeById(patch.preset) : undefined;
  const next: DesignTheme = structuredClone(preset ?? base);
  for (const [key, value] of Object.entries(patch.colors ?? {})) {
    const token = (COLOR_TOKENS as string[]).includes(key) ? (key as ColorToken) : TOKEN_ALIASES[key.toLowerCase()];
    const color = normalizeColor(value);
    if (token && color && color !== 'transparent' && !(COLOR_TOKENS as string[]).includes(color)) next.colors[token] = color;
  }
  for (const key of ['heading', 'body'] as const) {
    const font = patch.fonts?.[key];
    if (typeof font === 'string' && font.trim()) next.fonts[key] = font.replace(/["';{}<>]/g, '').trim().slice(0, 60);
  }
  if (patch.colors || patch.fonts) {
    next.id = preset && !patch.colors && !patch.fonts ? preset.id : 'custom';
    next.name = patch.name?.trim().slice(0, 60) || (preset ? `${preset.name} (custom)` : base.id === 'custom' ? base.name : `${base.name} (custom)`);
  }
  return next;
}
