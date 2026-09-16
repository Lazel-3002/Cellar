import type * as MonacoApi from 'monaco-editor/editor/editor.api';
import type { LspLocation } from '@shared/types/lsp';
import { useCodeUi } from '@/stores/code';
import { invoke, onEvent } from './ipc';
import type { Monaco } from './monaco';

type TextModel = MonacoApi.editor.ITextModel;

/** Monaco language ids backed by a real language server (see main/code/lsp.ts). */
export const LSP_LANGUAGES = ['typescript', 'javascript', 'python'];

const URI_SCHEME = 'cellar-code';

/** A deterministic model URI, so a "go to definition" result identifies an existing model (or doesn't) consistently across calls. */
export function documentUri(monaco: Monaco, conversationId: string, path: string): MonacoApi.Uri {
  return monaco.Uri.from({ scheme: URI_SCHEME, authority: conversationId, path: `/${path}` });
}

function parseDocumentUri(uri: MonacoApi.Uri): { conversationId: string; path: string } | null {
  if (uri.scheme !== URI_SCHEME) return null;
  return { conversationId: uri.authority, path: uri.path.replace(/^\/+/, '') };
}

interface DocInfo {
  conversationId: string;
  path: string;
}

/** Which (conversationId, path) a model represents, so the providers below know what to ask the main process. */
const docs = new Map<TextModel, DocInfo>();

export function registerDocument(model: TextModel, conversationId: string, path: string): void {
  docs.set(model, { conversationId, path });
}

export function unregisterDocument(model: TextModel): void {
  docs.delete(model);
}

function toLocations(monaco: Monaco, conversationId: string, results: LspLocation[]): MonacoApi.languages.Location[] {
  return results.map((r) => ({ uri: documentUri(monaco, conversationId, r.path), range: new monaco.Range(r.line, r.column, r.line, r.column) }));
}

/** LSP's CompletionItemKind numbering (1-25) differs from Monaco's own enum; map by name so it survives Monaco version bumps. */
function completionKindMap(monaco: Monaco): Record<number, MonacoApi.languages.CompletionItemKind> {
  const K = monaco.languages.CompletionItemKind;
  return {
    1: K.Text,
    2: K.Method,
    3: K.Function,
    4: K.Constructor,
    5: K.Field,
    6: K.Variable,
    7: K.Class,
    8: K.Interface,
    9: K.Module,
    10: K.Property,
    11: K.Unit,
    12: K.Value,
    13: K.Enum,
    14: K.Keyword,
    15: K.Snippet,
    16: K.Color,
    17: K.File,
    18: K.Reference,
    19: K.Folder,
    20: K.EnumMember,
    21: K.Constant,
    22: K.Struct,
    23: K.Event,
    24: K.Operator,
    25: K.TypeParameter,
  };
}

const SEVERITY_MAP = (monaco: Monaco, severity: string): MonacoApi.MarkerSeverity => {
  switch (severity) {
    case 'error':
      return monaco.MarkerSeverity.Error;
    case 'warning':
      return monaco.MarkerSeverity.Warning;
    case 'info':
      return monaco.MarkerSeverity.Info;
    default:
      return monaco.MarkerSeverity.Hint;
  }
};

let registered = false;

/**
 * Registers Monaco's completion/definition/reference providers and the diagnostics subscription
 * once per app lifetime. Individual documents opt in by calling registerDocument (MonacoEditor.tsx
 * does this once code:lspOpen confirms the file's language is covered).
 */
export function registerLspProviders(monaco: Monaco): void {
  if (registered) return;
  registered = true;
  const kinds = completionKindMap(monaco);

  monaco.languages.registerCompletionItemProvider(LSP_LANGUAGES, {
    triggerCharacters: ['.', '"', "'", '/', '@', '<', ' '],
    provideCompletionItems: async (model, position) => {
      const info = docs.get(model);
      if (!info) return { suggestions: [] };
      const items = await invoke('code:lspCompletion', info.conversationId, info.path, { line: position.lineNumber, column: position.column });
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      return {
        suggestions: items.map((item) => ({
          label: item.label,
          kind: kinds[item.kind ?? 1] ?? monaco.languages.CompletionItemKind.Text,
          detail: item.detail,
          documentation: item.documentation,
          insertText: item.insertText || item.label,
          sortText: item.sortText,
          filterText: item.filterText,
          range,
        })),
      };
    },
  });

  monaco.languages.registerDefinitionProvider(LSP_LANGUAGES, {
    provideDefinition: async (model, position) => {
      const info = docs.get(model);
      if (!info) return [];
      const results = await invoke('code:lspDefinition', info.conversationId, info.path, { line: position.lineNumber, column: position.column });
      return toLocations(monaco, info.conversationId, results);
    },
  });

  monaco.languages.registerReferenceProvider(LSP_LANGUAGES, {
    provideReferences: async (model, position) => {
      const info = docs.get(model);
      if (!info) return [];
      const results = await invoke('code:lspReferences', info.conversationId, info.path, { line: position.lineNumber, column: position.column });
      return toLocations(monaco, info.conversationId, results);
    },
  });

  // Cross-file "go to definition"/"find references" resolve to a URI with no live model yet;
  // hand that off to the Files pane's own tab-opening flow instead of leaving it a dead click.
  monaco.editor.registerEditorOpener({
    openCodeEditor: (_source, resource, selectionOrPosition) => {
      const target = parseDocumentUri(resource);
      if (!target) return false;
      const line = selectionOrPosition ? ('lineNumber' in selectionOrPosition ? selectionOrPosition.lineNumber : selectionOrPosition.startLineNumber) : undefined;
      useCodeUi.getState().openFile(target.conversationId, target.path, line);
      return true;
    },
  });

  onEvent('code:lspDiagnostics', ({ conversationId, path, diagnostics }) => {
    for (const [model, info] of docs) {
      if (info.conversationId !== conversationId || info.path !== path) continue;
      monaco.editor.setModelMarkers(
        model,
        'lsp',
        diagnostics.map((d) => ({
          startLineNumber: d.startLine,
          startColumn: d.startColumn,
          endLineNumber: d.endLine,
          endColumn: d.endColumn,
          severity: SEVERITY_MAP(monaco, d.severity),
          message: d.message,
          source: d.source,
          code: d.code !== undefined ? String(d.code) : undefined,
        })),
      );
    }
  });
}
