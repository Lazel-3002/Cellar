import { useEffect, useRef, useState } from 'react';
import type * as MonacoApi from 'monaco-editor/editor/editor.api';
import type { LspLanguage } from '@shared/types/lsp';
import { Spinner } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { documentUri, registerDocument, registerLspProviders, unregisterDocument } from '@/lib/lsp';
import { baseEditorOptions, languageForPath, loadedMonaco, loadMonaco, themeName, type Monaco } from '@/lib/monaco';
import { cn } from '@/lib/utils';

type TextModel = MonacoApi.editor.ITextModel;

/** How long to wait after the last keystroke before telling the language server about it. */
const LSP_CHANGE_DEBOUNCE_MS = 300;

function useMonaco(): { monaco: Monaco | null; error: string | null } {
  const [state, setState] = useState<{ monaco: Monaco | null; error: string | null }>(() => ({ monaco: loadedMonaco(), error: null }));
  useEffect(() => {
    if (state.monaco) return;
    let alive = true;
    loadMonaco().then(
      (monaco) => alive && setState({ monaco, error: null }),
      (err: unknown) => alive && setState({ monaco: null, error: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

/**
 * Replace a model's text with the smallest edit that produces `text`, so the cursor, scroll
 * position and undo history survive reloads.
 */
function setModelText(monaco: Monaco, model: TextModel, text: string): void {
  const crlf = text.includes('\r\n');
  if ((model.getEOL() === '\r\n') !== crlf) model.pushEOL(crlf ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF);
  const current = model.getValue();
  if (current === text) return;
  const max = Math.min(current.length, text.length);
  let start = 0;
  while (start < max && current.charCodeAt(start) === text.charCodeAt(start)) start++;
  // Do not split a surrogate pair.
  if (start > 0 && start < max && (current.charCodeAt(start - 1) & 0xfc00) === 0xd800) start--;
  let endCurrent = current.length;
  let endText = text.length;
  while (endCurrent > start && endText > start && current.charCodeAt(endCurrent - 1) === text.charCodeAt(endText - 1)) {
    endCurrent--;
    endText--;
  }
  const range = monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(endCurrent));
  model.pushEditOperations([], [{ range, text: text.slice(start, endText) }], () => null);
}

function EditorFrame({ monaco, error, containerRef, className }: { monaco: Monaco | null; error: string | null; containerRef: React.RefObject<HTMLDivElement | null>; className?: string }) {
  return (
    <div className={cn('relative h-full min-h-0 w-full overflow-hidden', className)}>
      <div ref={containerRef} className="absolute inset-0" />
      {!monaco && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-muted-foreground">
          The editor could not be loaded. {error}
        </div>
      )}
    </div>
  );
}

interface Doc {
  model: TextModel;
  viewState: MonacoApi.editor.ICodeEditorViewState | null;
  /** Set once code:lspOpen resolves; null means this file's extension isn't covered by either language server. */
  lspLanguage: LspLanguage | null;
}

/** Fire-and-forget code:lspClose for a doc that had IntelliSense registered. */
function closeLsp(conversationId: string | undefined, path: string, doc: Doc): void {
  if (!conversationId || !doc.lspLanguage) return;
  unregisterDocument(doc.model);
  void invoke('code:lspClose', conversationId, path).catch(() => undefined);
}

export interface CodeEditorProps {
  /** Identifies the document; each path keeps its own undo history and scroll position. */
  path: string;
  value: string;
  onChange?: (value: string) => void;
  /** Ctrl+S. */
  onSave?: (value: string) => void;
  readOnly?: boolean;
  /** Line to scroll to and put the cursor on. Change `revealKey` to reveal the same line again. */
  revealLine?: number;
  revealKey?: number | string;
  /** Paths whose documents to keep while another one is shown (open tabs). Others are released. */
  keepPaths?: string[];
  /** A Code session id enables IntelliSense (autocomplete, go-to-definition, find references, live diagnostics) for TypeScript/JavaScript and Python. */
  conversationId?: string;
  className?: string;
}

export function CodeEditor({ path, value, onChange, onSave, readOnly = false, revealLine, revealKey, keepPaths, conversationId, className }: CodeEditorProps) {
  const { monaco, error } = useMonaco();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoApi.editor.IStandaloneCodeEditor | null>(null);
  const docs = useRef(new Map<string, Doc>());
  const shownPath = useRef<string | null>(null);
  const applying = useRef(false);
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const lspChangeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!monaco || !containerRef.current) return;
    registerLspProviders(monaco);
    const editor = monaco.editor.create(containerRef.current, { ...baseEditorOptions, model: null, readOnly, theme: themeName() });
    editorRef.current = editor;
    editor.addAction({
      id: 'cellar.save',
      label: 'Save',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: (ed) => callbacks.current.onSave?.(ed.getValue()),
    });
    const changes = editor.onDidChangeModelContent(() => {
      const text = editor.getValue();
      if (!applying.current) callbacks.current.onChange?.(text);
      const cid = conversationIdRef.current;
      const current = shownPath.current;
      const doc = current ? docs.current.get(current) : undefined;
      if (cid && current && doc?.lspLanguage) {
        const timers = lspChangeTimers.current;
        clearTimeout(timers.get(current));
        timers.set(
          current,
          setTimeout(() => {
            timers.delete(current);
            void invoke('code:lspChange', cid, current, text).catch(() => undefined);
          }, LSP_CHANGE_DEBOUNCE_MS),
        );
      }
    });
    const map = docs.current;
    const timers = lspChangeTimers.current;
    return () => {
      changes.dispose();
      editor.dispose();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const [p, doc] of map) {
        closeLsp(conversationIdRef.current, p, doc);
        doc.model.dispose();
      }
      map.clear();
      editorRef.current = null;
      shownPath.current = null;
    };
    // The editor is created once; later option changes go through updateOptions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!monaco || !editor) return;
    const map = docs.current;
    if (shownPath.current !== path) {
      const previous = shownPath.current ? map.get(shownPath.current) : undefined;
      if (previous) previous.viewState = editor.saveViewState();
      let doc = map.get(path);
      if (!doc) {
        const uri = conversationId ? documentUri(monaco, conversationId, path) : undefined;
        const created: Doc = { model: monaco.editor.createModel(value, languageForPath(monaco, path), uri), viewState: null, lspLanguage: null };
        doc = created;
        map.set(path, created);
        if (conversationId) {
          void invoke('code:lspOpen', conversationId, path, value).then((language) => {
            // The map entry could have been released (tab closed) by the time this resolves.
            if (map.get(path) !== created) return;
            created.lspLanguage = language;
            if (language) registerDocument(created.model, conversationId, path);
          });
        }
      }
      applying.current = true;
      try {
        editor.setModel(doc.model);
      } finally {
        applying.current = false;
      }
      if (doc.viewState) editor.restoreViewState(doc.viewState);
      shownPath.current = path;
    }
    const model = map.get(path)!.model;
    applying.current = true;
    try {
      setModelText(monaco, model, value);
    } finally {
      applying.current = false;
    }
  }, [monaco, path, value, conversationId]);

  // Release documents that are no longer open.
  const keepKey = keepPaths?.join('\0');
  useEffect(() => {
    if (!monaco) return;
    const keep = new Set(keepPaths ?? []);
    keep.add(path);
    for (const [p, doc] of docs.current) {
      if (keep.has(p)) continue;
      closeLsp(conversationId, p, doc);
      doc.model.dispose();
      docs.current.delete(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco, keepKey, path]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly, monaco]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!monaco || !editor || !revealLine) return;
    const model = editor.getModel();
    if (!model) return;
    const line = Math.max(1, Math.min(model.getLineCount(), Math.floor(revealLine)));
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.revealLineInCenter(line);
    editor.focus();
  }, [monaco, path, revealLine, revealKey]);

  return <EditorFrame monaco={monaco} error={error} containerRef={containerRef} className={className} />;
}

export interface DiffEditorProps {
  original: string;
  modified: string;
  /** Picks the language, and a new path starts at the top. */
  path: string;
  /** Side by side when there is room (700 px or more); unified otherwise. */
  sideBySide?: boolean;
  className?: string;
}

const SIDE_BY_SIDE_MIN_WIDTH = 700;

export function DiffEditor({ original, modified, path, sideBySide = true, className }: DiffEditorProps) {
  const { monaco, error } = useMonaco();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoApi.editor.IStandaloneDiffEditor | null>(null);
  const models = useRef<{ path: string; original: TextModel; modified: TextModel } | null>(null);
  const [wide, setWide] = useState(true);
  const split = sideBySide && wide;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWide(el.clientWidth >= SIDE_BY_SIDE_MIN_WIDTH));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!monaco || !containerRef.current) return;
    const editor = monaco.editor.createDiffEditor(containerRef.current, {
      ...baseEditorOptions,
      theme: themeName(),
      readOnly: true,
      originalEditable: false,
      domReadOnly: true,
      renderSideBySide: split,
      useInlineViewWhenSpaceIsLimited: false,
      enableSplitViewResizing: true,
      ignoreTrimWhitespace: false,
      renderOverviewRuler: false,
      renderMarginRevertIcon: false,
      renderLineHighlight: 'none',
      folding: false,
      lineNumbersMinChars: 3,
      hideUnchangedRegions: { enabled: true, contextLineCount: 3, minimumLineCount: 6, revealLineCount: 20 },
    });
    editorRef.current = editor;
    return () => {
      editor.dispose();
      editorRef.current = null;
      if (models.current) {
        models.current.original.dispose();
        models.current.modified.dispose();
        models.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!monaco || !editor) return;
    const current = models.current;
    if (current && current.path === path) {
      setModelText(monaco, current.original, original);
      setModelText(monaco, current.modified, modified);
      return;
    }
    const language = languageForPath(monaco, path);
    const next = { path, original: monaco.editor.createModel(original, language), modified: monaco.editor.createModel(modified, language) };
    editor.setModel({ original: next.original, modified: next.modified });
    models.current = next;
    if (current) {
      current.original.dispose();
      current.modified.dispose();
    }
  }, [monaco, path, original, modified]);

  useEffect(() => {
    editorRef.current?.updateOptions({ renderSideBySide: split });
  }, [split, monaco]);

  return <EditorFrame monaco={monaco} error={error} containerRef={containerRef} className={className} />;
}
