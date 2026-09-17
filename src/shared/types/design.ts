/** Design: multi-artboard canvases (slides, pages, posters, mockups) that local models build and people edit visually. */

/** What a design is for; picks the default artboard size and the layouts offered. */
export type DesignFormat = 'slides' | 'document' | 'social' | 'poster' | 'web' | 'mobile' | 'custom';

export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  secondary: string;
  accent: string;
}

export interface ThemeFonts {
  heading: string;
  body: string;
}

/**
 * Colors and fonts shared by a whole design. Elements refer to them by name ("primary", "heading"),
 * so switching the theme restyles every artboard at once.
 */
export interface DesignTheme {
  id: string;
  name: string;
  colors: ThemeColors;
  fonts: ThemeFonts;
}

export type ColorToken = keyof ThemeColors;

export interface GradientStop {
  /** A theme color name or a hex color. */
  color: string;
  /** 0–1 along the gradient. */
  at: number;
}

export interface Gradient {
  /** Default 'linear'. */
  type?: 'linear' | 'radial';
  /** Degrees, CSS convention (180 = top to bottom). Linear only. */
  angle: number;
  /** Two or more stops, in order. When absent, `from`/`to` are used as a two-stop shorthand. */
  stops?: GradientStop[];
  /** Two-stop shorthand kept for older designs; prefer `stops`. */
  from?: string;
  to?: string;
}

interface ElementBase {
  id: string;
  /** Optional label shown in the layers list. */
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees clockwise. */
  rotation?: number;
  /** 0–1. */
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
  /** Elements sharing an id are one group: clicking any member selects them all, and they move and rotate together. */
  groupId?: string;
}

export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

export interface TextElement extends ElementBase {
  type: 'text';
  /** Plain text; line breaks start new paragraphs and **double asterisks** make bold spans. */
  text: string;
  /** A font name or "heading" / "body". */
  font?: string;
  /** Pixels on the artboard. */
  size: number;
  weight?: number;
  italic?: boolean;
  underline?: boolean;
  uppercase?: boolean;
  /** A theme color name or a hex color. */
  color?: string;
  align?: TextAlign;
  valign?: VerticalAlign;
  /** Multiple of the font size. */
  lineHeight?: number;
  /** Em units (0.05 = 5% of the font size). */
  letterSpacing?: number;
  /** Each paragraph becomes a list item. */
  list?: 'bullet' | 'number';
  /** Background behind the text box. */
  fill?: string;
  radius?: number;
  padding?: number;
}

export interface ShapeElement extends ElementBase {
  type: 'rect' | 'ellipse';
  fill?: string;
  gradient?: Gradient;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  shadow?: boolean;
}

export interface LineElement extends ElementBase {
  /** A straight line from (x, y) to (x + w, y + h). */
  type: 'line';
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  /** `attachment:<id>` for images added to Cellar, or a data: URL. Empty shows a placeholder. */
  src: string;
  fit?: 'cover' | 'contain';
  radius?: number;
  alt?: string;
}

export type ChartKind = 'bar' | 'hbar' | 'line' | 'area' | 'pie' | 'donut';

export interface ChartSeries {
  name: string;
  values: number[];
  color?: string;
}

export interface ChartSpec {
  kind: ChartKind;
  title?: string;
  labels: string[];
  series: ChartSeries[];
  /** Show the legend (default: more than one series, or pie/donut). */
  legend?: boolean;
  /** Print the value next to each bar, point or slice. */
  values?: boolean;
  /** Appended to values and axis labels, e.g. "%" or " M". */
  unit?: string;
  /** Stack bars and areas. */
  stacked?: boolean;
}

export interface ChartElement extends ElementBase {
  type: 'chart';
  chart: ChartSpec;
  /** Text color of axis labels and legend (default: theme text). */
  color?: string;
  font?: string;
}

export interface SvgElement extends ElementBase {
  /** A small vector illustration, icon or logo; scripts and external references are removed. */
  type: 'svg';
  svg: string;
}

export type DesignElement = TextElement | ShapeElement | LineElement | ImageElement | ChartElement | SvgElement;
export type DesignElementType = DesignElement['type'];

export interface Artboard {
  id: string;
  name: string;
  width: number;
  height: number;
  /** A theme color name or a hex color. */
  background: string;
  gradient?: Gradient;
  elements: DesignElement[];
  /** Speaker notes for slides. */
  notes?: string;
}

export interface Design {
  id: string;
  conversationId: string;
  title: string;
  format: DesignFormat;
  theme: DesignTheme;
  artboards: Artboard[];
  /** Increases with every save; stale saves are rejected. */
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface DesignSummary {
  id: string;
  conversationId: string;
  title: string;
  format: DesignFormat;
  theme: DesignTheme;
  artboardCount: number;
  /** The first artboard, for the thumbnail. */
  cover: Artboard | null;
  starred: boolean;
  taskStatus?: import('./agent').TaskStatus;
  updatedAt: number;
}

/** Stored on a design conversation's task state. */
export interface DesignSessionInfo {
  designId: string;
  /** What the user had selected when they sent their latest message. */
  selection?: DesignSelection;
}

export interface DesignSelection {
  artboardId: string;
  elementIds: string[];
}

export interface DesignStartOptions {
  format: DesignFormat;
  themeId: string;
}

export type DesignExportFormat = 'png' | 'pdf' | 'pptx' | 'svg' | 'html';

export interface DesignExportRequest {
  designId: string;
  format: DesignExportFormat;
  /** Only these artboards (default: all). PNG with several artboards writes one file each into a folder. */
  artboardIds?: string[];
  /** PNG scale factor (default 2). */
  scale?: number;
}

export interface DesignChangedEvent {
  designId: string;
  conversationId: string;
  version: number;
  /** Who changed it: the model (tools) or a person (the editor). */
  source: 'agent' | 'user';
}
