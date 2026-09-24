/** Computer use: the model sees the Windows desktop and works the mouse and keyboard. */

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A control on screen that UI Automation reported, numbered in reading order. */
export interface ScreenElement {
  n: number;
  role: string;
  name: string;
  /** Physical screen pixels (the visible part of the control). */
  rect: ScreenRect;
  value?: string;
  /** "checked", "selected", "expanded"… */
  state?: string;
  focused: boolean;
  enabled: boolean;
  password: boolean;
  /** Top-level window it belongs to. */
  window: number;
}

export interface ScreenWindow {
  hwnd: number;
  title: string;
  process: string;
  pid: number;
  minimized: boolean;
  maximized: boolean;
  foreground: boolean;
  rect: ScreenRect;
}

export interface ScreenDisplay {
  index: number;
  primary: boolean;
  name: string;
  bounds: ScreenRect;
  work: ScreenRect;
}

/** How the model gives a point: pixels in the screenshot, or a 0–1000 grid across it (what Qwen3-VL-family models are trained on). */
export type CoordinateSpace = 'pixels' | 'normalized';

/** One look at the screen, as the helper reports it. */
export interface ScreenObservation {
  image: string | null;
  mime: string | null;
  imageWidth: number;
  imageHeight: number;
  /** The part of the screen in the image, in physical pixels (the whole display unless zoomed). */
  region: ScreenRect;
  display: ScreenRect;
  foreground: ScreenWindow | null;
  /** Cellar's own window is in front (the model cannot see or use it). */
  cellarForeground: boolean;
  windows: ScreenWindow[];
  elements: ScreenElement[];
  /** Static text on screen that is not a control's label (a display, a dialog's message), in reading order. */
  texts?: string[];
  elementsTimedOut: boolean;
  cursor: { x: number; y: number };
  uiaMs: number;
  totalMs: number;
}

export type ComputerPhase = 'idle' | 'working' | 'approval' | 'paused' | 'handover';

/** What the on-screen control pill shows, pushed to every window as `computer:state`. */
export interface ComputerState {
  phase: ComputerPhase;
  conversationId?: string;
  messageId?: string;
  /** The step in progress, e.g. "Clicking “Save”". */
  action?: string;
  /** Paused / handed over: what the user is asked to do. */
  reason?: string;
  /** A tool call waiting for approval while Cellar's window is out of the way. */
  approval?: { toolCallId: string; title: string; detail?: string; canAllowAll: boolean };
  /** The shortcut that stops the run from anywhere, when it could be registered. */
  stopShortcut?: string;
}

/** Settings → Computer use → "Try it": one observation, the way the model would get it. */
export interface ComputerTestResult {
  imageDataUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  elements: number;
  windows: number;
  foreground: string | null;
  ms: number;
  text: string;
}
