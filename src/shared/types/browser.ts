/** The built-in Chromium browser: real Chromium tabs Cellar owns, shown in a side panel and driven by the model. */

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Set when the last navigation failed (offline, DNS, refused). */
  error?: string;
}

export interface BrowserState {
  tabs: BrowserTab[];
  activeTabId: string | null;
  /** The panel is showing the view (false parks every tab off-screen). */
  visible: boolean;
}

/** Where the panel wants the Chromium view, in renderer CSS pixels. */
export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the page tools hand back to the model. */
export interface BrowserPageContent {
  url: string;
  title: string;
  text: string;
  links: Array<{ url: string; text: string }>;
}

/** A clickable/interactive element found on the page, in viewport CSS pixels. */
export interface BrowserElement {
  tag: string;
  type: 'link' | 'button' | 'input' | 'image' | 'other';
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BrowserLoginStatus = 'logged_in' | 'not_logged_in';
