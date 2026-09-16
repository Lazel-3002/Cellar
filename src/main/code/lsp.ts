/**
 * IntelliSense backed by real language servers: typescript-language-server (TypeScript/JavaScript,
 * via tsserver) and pyright (Python), spoken to over LSP/JSON-RPC on stdio. One server runs per
 * (language, project root) and is shared by every open tab for that root; it's torn down after all
 * its documents have been closed for a while. Both servers are bundled with Cellar (see `configure`
 * for where they're resolved from) so this works even in a project with no local install.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMessageConnection, type MessageConnection } from 'vscode-jsonrpc/node';
import type { LspCompletionItem, LspDiagnostic, LspLanguage, LspLocation, LspPosition } from '@shared/types/lsp';
import { localTypeScript, nodeRunner } from './diagnostics';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage } from '../lib/util';

const log = logger('lsp');

/** A server with no open documents is killed after this long, so quick tab switches don't thrash it. */
const IDLE_DISPOSE_MS = 5 * 60_000;

let appRoot = process.cwd();

/** Called once from main/index.ts with the real app root, so this module stays Electron-free (and unit-testable) otherwise. */
export function configure(config: { appRoot: string }): void {
  appRoot = config.appRoot;
}

/** Absolute path into one of Cellar's own bundled node_modules packages (unpacked from asar, see electron-builder.yml). */
function bundled(pkg: string, ...segments: string[]): string {
  return join(appRoot, 'node_modules', pkg, ...segments);
}

const toRel = (root: string, abs: string) => relative(root, abs).split(sep).join('/');
const toAbs = (root: string, rel: string) => resolve(root, rel);
const toUri = (abs: string) => pathToFileURL(abs).toString();
const fromUri = (uri: string) => fileURLToPath(uri);

const toLspPosition = (p: LspPosition) => ({ line: p.line - 1, character: p.column - 1 });

interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}
const fromLspRange = (r: LspRange) => ({ startLine: r.start.line + 1, startColumn: r.start.character + 1, endLine: r.end.line + 1, endColumn: r.end.character + 1 });

const SEVERITY: Record<number, LspDiagnostic['severity']> = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' };

const LANGUAGE_IDS: Record<string, { language: LspLanguage; languageId: string }> = {
  '.ts': { language: 'typescript', languageId: 'typescript' },
  '.mts': { language: 'typescript', languageId: 'typescript' },
  '.cts': { language: 'typescript', languageId: 'typescript' },
  '.tsx': { language: 'typescript', languageId: 'typescriptreact' },
  '.js': { language: 'typescript', languageId: 'javascript' },
  '.mjs': { language: 'typescript', languageId: 'javascript' },
  '.cjs': { language: 'typescript', languageId: 'javascript' },
  '.jsx': { language: 'typescript', languageId: 'javascriptreact' },
  '.py': { language: 'python', languageId: 'python' },
};

/** null for extensions neither language server covers. */
export function detectLanguage(path: string): { language: LspLanguage; languageId: string } | null {
  return LANGUAGE_IDS[extname(path).toLowerCase()] ?? null;
}

interface LspLocationLike {
  uri: string;
  range: LspRange;
}

function normalizeLocations(root: string, result: LspLocationLike | LspLocationLike[] | Array<{ targetUri: string; targetSelectionRange: LspRange }> | null): LspLocation[] {
  if (!result) return [];
  const list = Array.isArray(result) ? result : [result];
  return list.map((item) => {
    const uri = 'uri' in item ? item.uri : item.targetUri;
    const range = 'range' in item ? item.range : item.targetSelectionRange;
    return { path: toRel(root, fromUri(uri)), line: range.start.line + 1, column: range.start.character + 1 };
  });
}

class LanguageServer {
  private connection: MessageConnection | null = null;
  private child: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<void> | null = null;
  private openDocs = new Map<string, number>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly language: LspLanguage,
    private readonly conversationId: string,
    private readonly root: string,
  ) {}

  private launchCommand(): { file: string; args: string[] } {
    return this.language === 'typescript' ? { file: bundled('typescript-language-server', 'lib', 'cli.mjs'), args: ['--stdio'] } : { file: bundled('pyright', 'langserver.index.js'), args: ['--stdio'] };
  }

  /** Prefers the project's own TypeScript for version-accurate results; falls back to Cellar's bundled copy. */
  private tsserverPath(): string {
    return localTypeScript(this.root, this.root) ?? bundled('typescript', 'lib', 'typescript.js');
  }

  private async ensureStarted(): Promise<MessageConnection> {
    if (this.connection) return this.connection;
    this.starting ??= this.start().finally(() => {
      this.starting = null;
    });
    await this.starting;
    if (!this.connection) throw new Error(`${this.language} language server is not available.`);
    return this.connection;
  }

  private async start(): Promise<void> {
    const node = nodeRunner();
    const { file, args } = this.launchCommand();
    const child = spawn(node.file, [file, ...args], { cwd: this.root, env: { ...process.env, ...node.env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.on('error', (err) => log.warn(`${this.language} language server failed to start`, errorMessage(err)));
    child.on('exit', () => {
      if (!this.disposed) log.warn(`${this.language} language server exited unexpectedly`);
      this.connection = null;
      this.child = null;
    });

    const connection = createMessageConnection(child.stdout, child.stdin);
    connection.onNotification('textDocument/publishDiagnostics', (params: { uri: string; diagnostics: Array<{ range: LspRange; severity?: number; message: string; source?: string; code?: string | number }> }) => {
      const path = toRel(this.root, fromUri(params.uri));
      const diagnostics: LspDiagnostic[] = params.diagnostics.map((d) => ({ ...fromLspRange(d.range), severity: SEVERITY[d.severity ?? 1] ?? 'error', message: d.message, source: d.source, code: d.code }));
      bus.emit('code:lspDiagnostics', { conversationId: this.conversationId, path, diagnostics });
    });
    connection.onError((err) => log.warn(`${this.language} language server connection error`, err[0]));
    connection.listen();

    try {
      await connection.sendRequest('initialize', {
        processId: process.pid,
        rootUri: toUri(this.root),
        capabilities: {
          textDocument: {
            synchronization: { didSave: false },
            completion: { completionItem: { snippetSupport: false, documentationFormat: ['plaintext'] } },
            definition: { linkSupport: true },
            references: {},
            publishDiagnostics: { relatedInformation: false },
          },
        },
        initializationOptions: this.language === 'typescript' ? { tsserver: { path: this.tsserverPath() } } : {},
      });
      await connection.sendNotification('initialized', {});
    } catch (err) {
      connection.dispose();
      child.kill();
      throw err;
    }
    this.connection = connection;
    this.child = child;
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  hasOpenDocs(): boolean {
    return this.openDocs.size > 0;
  }

  async open(path: string, languageId: string, text: string): Promise<void> {
    this.clearIdleTimer();
    const connection = await this.ensureStarted();
    const abs = toAbs(this.root, path);
    if (this.openDocs.has(abs)) return this.change(path, text);
    this.openDocs.set(abs, 1);
    await connection.sendNotification('textDocument/didOpen', { textDocument: { uri: toUri(abs), languageId, version: 1, text } });
  }

  async change(path: string, text: string): Promise<void> {
    const connection = await this.ensureStarted();
    const abs = toAbs(this.root, path);
    const version = (this.openDocs.get(abs) ?? 0) + 1;
    this.openDocs.set(abs, version);
    await connection.sendNotification('textDocument/didChange', { textDocument: { uri: toUri(abs), version }, contentChanges: [{ text }] });
  }

  async close(path: string): Promise<void> {
    if (!this.connection) return;
    const abs = toAbs(this.root, path);
    if (!this.openDocs.delete(abs)) return;
    await this.connection.sendNotification('textDocument/didClose', { textDocument: { uri: toUri(abs) } });
    bus.emit('code:lspDiagnostics', { conversationId: this.conversationId, path, diagnostics: [] });
    if (!this.hasOpenDocs()) this.idleTimer = setTimeout(() => lsp.disposeIdle(this.language, this.conversationId), IDLE_DISPOSE_MS).unref();
  }

  async completion(path: string, position: LspPosition): Promise<LspCompletionItem[]> {
    const connection = await this.ensureStarted();
    const result = (await connection.sendRequest('textDocument/completion', { textDocument: { uri: toUri(toAbs(this.root, path)) }, position: toLspPosition(position) })) as
      | { items: LspCompletionItem[] }
      | LspCompletionItem[]
      | null;
    const items = Array.isArray(result) ? result : (result?.items ?? []);
    return items.slice(0, 200).map((i) => ({ label: i.label, kind: i.kind, detail: i.detail, documentation: typeof i.documentation === 'string' ? i.documentation : (i.documentation as { value?: string } | undefined)?.value, insertText: i.insertText, sortText: i.sortText, filterText: i.filterText }));
  }

  async definition(path: string, position: LspPosition): Promise<LspLocation[]> {
    const connection = await this.ensureStarted();
    const result = await connection.sendRequest('textDocument/definition', { textDocument: { uri: toUri(toAbs(this.root, path)) }, position: toLspPosition(position) });
    return normalizeLocations(this.root, result as Parameters<typeof normalizeLocations>[1]);
  }

  async references(path: string, position: LspPosition): Promise<LspLocation[]> {
    const connection = await this.ensureStarted();
    const result = await connection.sendRequest('textDocument/references', { textDocument: { uri: toUri(toAbs(this.root, path)) }, position: toLspPosition(position), context: { includeDeclaration: false } });
    return normalizeLocations(this.root, result as Parameters<typeof normalizeLocations>[1]);
  }

  /**
   * Resolves once the child process has actually exited, so callers that need the working folder
   * free right after (deleting a worktree) don't race a process that still has it as its cwd.
   */
  dispose(): Promise<void> {
    this.disposed = true;
    this.clearIdleTimer();
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((resolveExit) => {
      child.once('exit', () => resolveExit());
      if (this.connection) {
        this.connection
          .sendRequest('shutdown')
          .catch(() => undefined)
          .finally(() => this.connection?.sendNotification('exit').catch(() => undefined));
      }
      // Give the graceful shutdown/exit handshake a moment, then force it; never hang the caller.
      setTimeout(() => child.kill(), 1500);
      setTimeout(() => resolveExit(), 3000);
    });
  }
}

/** One server per (language, Code session); language detection happens once here so callers just pass conversationId/root/path. */
class LspManager {
  private servers = new Map<string, LanguageServer>();
  private byConversation = new Map<string, Set<LspLanguage>>();

  private key(language: LspLanguage, conversationId: string): string {
    return `${language}:${conversationId}`;
  }

  private server(language: LspLanguage, conversationId: string, root: string): LanguageServer {
    const key = this.key(language, conversationId);
    let server = this.servers.get(key);
    if (!server) {
      server = new LanguageServer(language, conversationId, resolve(root));
      this.servers.set(key, server);
      const languages = this.byConversation.get(conversationId) ?? new Set();
      languages.add(language);
      this.byConversation.set(conversationId, languages);
    }
    return server;
  }

  async open(conversationId: string, root: string, path: string, text: string): Promise<LspLanguage | null> {
    const detected = detectLanguage(path);
    if (!detected) return null;
    await this.server(detected.language, conversationId, root).open(path, detected.languageId, text);
    return detected.language;
  }

  async change(conversationId: string, root: string, path: string, text: string): Promise<void> {
    const detected = detectLanguage(path);
    if (detected) await this.server(detected.language, conversationId, root).change(path, text);
  }

  async close(conversationId: string, root: string, path: string): Promise<void> {
    const detected = detectLanguage(path);
    if (detected) await this.server(detected.language, conversationId, root).close(path);
  }

  async completion(conversationId: string, root: string, path: string, position: LspPosition): Promise<LspCompletionItem[]> {
    const detected = detectLanguage(path);
    return detected ? this.server(detected.language, conversationId, root).completion(path, position) : [];
  }

  async definition(conversationId: string, root: string, path: string, position: LspPosition): Promise<LspLocation[]> {
    const detected = detectLanguage(path);
    return detected ? this.server(detected.language, conversationId, root).definition(path, position) : [];
  }

  async references(conversationId: string, root: string, path: string, position: LspPosition): Promise<LspLocation[]> {
    const detected = detectLanguage(path);
    return detected ? this.server(detected.language, conversationId, root).references(path, position) : [];
  }

  disposeIdle(language: LspLanguage, conversationId: string): void {
    const key = this.key(language, conversationId);
    const server = this.servers.get(key);
    if (!server || server.hasOpenDocs()) return;
    void server.dispose();
    this.servers.delete(key);
    this.byConversation.get(conversationId)?.delete(language);
  }

  /**
   * A Code session ended: tear down its language servers immediately rather than waiting out the
   * idle timer, and wait for them to actually exit — callers use this before removing the session's
   * working folder, which would otherwise race a process that still has it as its cwd.
   */
  async disposeForSession(conversationId: string): Promise<void> {
    const languages = this.byConversation.get(conversationId) ?? new Set<LspLanguage>();
    await Promise.all(
      [...languages].map((language) => {
        const key = this.key(language, conversationId);
        const server = this.servers.get(key);
        this.servers.delete(key);
        return server?.dispose();
      }),
    );
    this.byConversation.delete(conversationId);
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.servers.values()].map((server) => server.dispose()));
    this.servers.clear();
    this.byConversation.clear();
  }
}

export const lsp = new LspManager();
