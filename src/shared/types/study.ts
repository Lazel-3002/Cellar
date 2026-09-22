/**
 * Study: a PDF (a textbook, a worksheet) open next to a tutor. The PDF file itself is never
 * changed; everything written on it lives in an annotation layer stored by Cellar.
 *
 * Coordinates are in page points with the origin at the top left of the page as it is shown
 * (pdf.js viewport space at scale 1, the page's own rotation applied), so the viewer only has to
 * multiply by the zoom and an export only has to invert the viewport transform.
 */

/** Tutor: hints, checks and explanations, never the answer unless asked. Solve: may write answers. */
export type StudyMode = 'tutor' | 'solve';

export interface StudyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One line of the page's own text, in reading order. */
export interface PageLine extends StudyRect {
  text: string;
}

export interface BookPageInfo {
  width: number;
  height: number;
  /** Characters of text on the page (0 for a scanned page). */
  chars: number;
}

export interface BookOutlineItem {
  title: string;
  page: number;
  depth: number;
}

export type AnnotationAuthor = 'user' | 'ai';

interface AnnotationBase {
  id: string;
  page: number;
  author: AnnotationAuthor;
  createdAt: number;
}

export interface HighlightAnnotation extends AnnotationBase {
  type: 'highlight';
  rects: StudyRect[];
  color: string;
  /** The text that was highlighted, when it came from the page's text. */
  text?: string;
  note?: string;
}

/** Typed text on the page: an answer, a label, a filled-in blank. */
export interface TextAnnotation extends AnnotationBase {
  type: 'text';
  x: number;
  y: number;
  width: number;
  text: string;
  color: string;
  /** Font size in points. */
  size: number;
  /** The question or line it answers, when the model placed it. */
  anchor?: string;
}

export interface InkStroke {
  /** x, y pairs in page points. */
  points: number[];
  color: string;
  width: number;
  opacity?: number;
}

export interface InkAnnotation extends AnnotationBase {
  type: 'ink';
  strokes: InkStroke[];
}

/** A sticky note: an icon on the page that opens to show its text. */
export interface NoteAnnotation extends AnnotationBase {
  type: 'note';
  x: number;
  y: number;
  text: string;
  anchor?: string;
}

export type MarkVerdict = 'correct' | 'wrong' | 'partial';

/** A teacher's mark next to an answer: ✓, ✗ or ~, with an optional short comment. */
export interface MarkAnnotation extends AnnotationBase {
  type: 'mark';
  x: number;
  y: number;
  verdict: MarkVerdict;
  comment?: string;
  anchor?: string;
}

export type StudyAnnotation = HighlightAnnotation | TextAnnotation | InkAnnotation | NoteAnnotation | MarkAnnotation;

export interface Book {
  id: string;
  title: string;
  fileName: string;
  size: number;
  pageCount: number;
  pages: BookPageInfo[];
  outline: BookOutlineItem[];
  /** The page the user was last on (1-based). */
  lastPage: number;
  annotations: StudyAnnotation[];
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface BookSummary {
  id: string;
  title: string;
  fileName: string;
  pageCount: number;
  lastPage: number;
  annotationCount: number;
  /** Pages with no text layer (scanned). */
  scannedPages: number;
  /** The most recent chat about this book. */
  conversationId: string | null;
  chats: number;
  updatedAt: number;
}

export interface BookChat {
  conversationId: string;
  title: string;
  updatedAt: number;
}

/** What the model is shown from the book with a message. */
export type StudyScope = 'page' | 'pages' | 'upto' | 'book';

export interface StudyContext {
  /** The page the user is on (1-based). */
  page: number;
  scope: StudyScope;
  /** scope 'pages': a list like "45-52, 60". */
  pages?: string;
  /** scope 'upto': the first page (the chapter start by default). */
  from?: number;
  /** Text the user has selected on a page. */
  selection?: { page: number; text: string };
}

export interface StudySessionInfo {
  bookId: string;
  mode: StudyMode;
  /** The context sent with the latest message. */
  context?: StudyContext;
}

export interface StudySession {
  conversationId: string;
  book: Book;
  mode: StudyMode;
}

export interface StudyChangedEvent {
  bookId: string;
  version: number;
  source: 'agent' | 'user';
}

/** The model turned the page for the user. */
export interface StudyGotoEvent {
  bookId: string;
  page: number;
  /** Annotation to flash, when the model just wrote it. */
  annotationId?: string;
}

/** Main asks an open viewer for a picture of a page (for a vision model). */
export interface StudyRenderRequest {
  requestId: string;
  bookId: string;
  page: number;
  maxEdge: number;
}

export interface StudyImportProgress {
  fileName: string;
  done: number;
  total: number;
}

export interface StudyPageHit {
  page: number;
  snippet: string;
}
