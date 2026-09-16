/** IntelliSense backed by real language servers (typescript-language-server, pyright), one per (language, project root). */

export type LspLanguage = 'typescript' | 'python';

/** 1-based, matching Monaco's own convention; converted to/from LSP's 0-based lines internally. */
export interface LspPosition {
  line: number;
  column: number;
}

export interface LspRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export type LspSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface LspDiagnostic extends LspRange {
  severity: LspSeverity;
  message: string;
  source?: string;
  code?: string | number;
}

/** Pushed whenever a server re-analyzes a file (after didOpen/didChange, on its own schedule). */
export interface LspDiagnosticsEvent {
  conversationId: string;
  path: string;
  diagnostics: LspDiagnostic[];
}

export interface LspCompletionItem {
  label: string;
  /** LSP CompletionItemKind, passed through for Monaco to pick an icon. */
  kind?: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
  filterText?: string;
}

export interface LspLocation {
  /** Relative to the project root, forward slashes — matches Code's own tab paths. */
  path: string;
  line: number;
  column: number;
}
