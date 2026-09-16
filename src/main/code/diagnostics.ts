/**
 * Diagnostics: the errors an editor would underline. After the agent writes or edits a file, a quick
 * syntax check runs and any problems are added to the tool result, so the model sees them right away.
 * The get_diagnostics tool also runs the project's own checkers when they are installed (tsc, ruff,
 * pyright, cargo check, go vet).
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { walk } from '../agent/glob';

export interface Problem {
  /** Relative to the working folder, forward slashes. */
  path: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
  source: string;
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runProgram(file: string, args: string[], options: { cwd: string; timeoutMs: number; env?: NodeJS.ProcessEnv; signal?: AbortSignal }): Promise<RunResult> {
  return new Promise((resolvePromise) => {
    const child = execFile(
      file,
      args,
      { cwd: options.cwd, timeout: options.timeoutMs, windowsHide: true, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...options.env }, signal: options.signal },
      (error, stdout, stderr) => {
        const err = error as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
        resolvePromise({ code: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: String(stdout), stderr: String(stderr), timedOut: !!err?.killed });
      },
    );
    child.on('error', () => undefined);
  });
}

const found = new Map<string, Promise<string | null>>();

/** Full path of a program on PATH, or null. The Microsoft Store "python" stubs do not count. */
export function which(program: string): Promise<string | null> {
  let cached = found.get(program);
  if (!cached) {
    cached = runProgram(process.platform === 'win32' ? 'where.exe' : 'which', [program], { cwd: process.cwd(), timeoutMs: 5000 }).then((r) => {
      const hits = r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      return hits.find((h) => !/\\WindowsApps\\/i.test(h)) ?? null;
    });
    found.set(program, cached);
  }
  return cached;
}

/** Node for running helper scripts: Electron's own binary in node mode, or node itself in tests. */
export function nodeRunner(): { file: string; env: NodeJS.ProcessEnv } {
  return { file: process.execPath, env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {} };
}

const toRel = (root: string, file: string) => {
  const abs = isAbsolute(file) ? file : resolve(root, file);
  const rel = relative(root, abs);
  return (rel && !rel.startsWith('..') ? rel : abs).split(sep).join('/');
};

// ---------------------------------------------------------------------------
// Quick checks for one file

const PYTHON_COMPILE = [
  'import sys, json, os',
  'def check(p):',
  '    try:',
  '        with open(p, "rb") as f: src = f.read()',
  '        compile(src, p, "exec", dont_inherit=True)',
  '    except SyntaxError as e:',
  '        return [{"path": p, "line": e.lineno or 1, "column": e.offset or 1, "message": e.msg}]',
  '    except (ValueError, OSError) as e:',
  '        return [{"path": p, "line": 1, "column": 1, "message": str(e)}]',
  '    return []',
  'out = []',
  'target = sys.argv[1]',
  'if os.path.isdir(target):',
  '    skip = {"node_modules", ".git", ".venv", "venv", "__pycache__", "build", "dist", ".tox"}',
  '    for base, dirs, files in os.walk(target):',
  '        dirs[:] = [d for d in dirs if d not in skip and not d.startswith(".")]',
  '        for name in files:',
  '            if name.endswith(".py") and len(out) < 200: out += check(os.path.join(base, name))',
  'else:',
  '    out = check(target)',
  'print(json.dumps(out))',
].join('\n');

let pythonCommand: Promise<string[] | null> | null = null;

async function findPython(): Promise<string[] | null> {
  pythonCommand ??= (async () => {
    for (const candidate of [['python'], ['py', '-3'], ['python3']]) {
      const exe = await which(candidate[0]);
      if (!exe) continue;
      const probe = await runProgram(exe, [...candidate.slice(1), '-c', 'print(1)'], { cwd: process.cwd(), timeoutMs: 10_000 });
      if (probe.code === 0 && probe.stdout.trim() === '1') return [exe, ...candidate.slice(1)];
    }
    return null;
  })();
  return pythonCommand;
}

async function checkPython(target: string, root: string, signal?: AbortSignal): Promise<Problem[]> {
  const python = await findPython();
  if (!python) return [];
  const result = await runProgram(python[0], [...python.slice(1), '-c', PYTHON_COMPILE, target], { cwd: root, timeoutMs: 60_000, signal, env: { PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' } });
  try {
    const items = JSON.parse(result.stdout.trim().split(/\r?\n/).pop() ?? '[]') as Array<{ path: string; line: number; column: number; message: string }>;
    return items.map((i) => ({ path: toRel(root, i.path), line: i.line, column: i.column, severity: 'error', message: i.message, source: 'python' }));
  } catch {
    return [];
  }
}

/** `node --check` output → problem. */
export function parseNodeCheck(output: string, root: string, file: string): Problem[] {
  const location = /^(.*):(\d+)\s*$/m.exec(output);
  const message = /^(\w*Error): (.+)$/m.exec(output);
  if (!message) return [];
  const caret = output.split(/\r?\n/).find((l) => /^\s*\^+\s*$/.test(l));
  return [{ path: toRel(root, file), line: location ? Number(location[2]) : 1, column: caret ? caret.indexOf('^') + 1 : 1, severity: 'error', message: `${message[1]}: ${message[2]}`, source: 'node' }];
}

async function checkJavaScript(file: string, root: string, signal?: AbortSignal): Promise<Problem[]> {
  const node = nodeRunner();
  const result = await runProgram(node.file, ['--check', file], { cwd: dirname(file), timeoutMs: 20_000, env: node.env, signal });
  return result.code === 0 ? [] : parseNodeCheck(`${result.stderr}\n${result.stdout}`, root, file);
}

/** The project's own TypeScript, looked up from the file's folder up to the working folder. */
export function localTypeScript(from: string, root: string): string | null {
  let dir = from;
  for (;;) {
    const candidate = join(dir, 'node_modules', 'typescript', 'lib', 'typescript.js');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (dir === resolve(root) || parent === dir || relative(root, parent).startsWith('..')) return null;
    dir = parent;
  }
}

const TS_SYNTAX = [
  'const ts = require(process.argv[2]);',
  'const fs = require("fs");',
  'const file = process.argv[3];',
  'const text = fs.readFileSync(file, "utf8");',
  'const out = ts.transpileModule(text, { fileName: file, reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.Preserve, allowJs: true } });',
  'const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);',
  'console.log(JSON.stringify((out.diagnostics || []).map((d) => { const p = d.start !== undefined ? sf.getLineAndCharacterOfPosition(d.start) : { line: 0, character: 0 }; return { line: p.line + 1, column: p.character + 1, message: ts.flattenDiagnosticMessageText(d.messageText, "\\n"), code: d.code }; })));',
].join('\n');

async function checkTypeScriptSyntax(file: string, root: string, signal?: AbortSignal): Promise<Problem[]> {
  const typescript = localTypeScript(dirname(file), root);
  if (!typescript) return [];
  const node = nodeRunner();
  const result = await runProgram(node.file, ['-e', TS_SYNTAX, '--', typescript, file], { cwd: root, timeoutMs: 30_000, env: node.env, signal });
  try {
    const items = JSON.parse(result.stdout.trim().split(/\r?\n/).pop() ?? '[]') as Array<{ line: number; column: number; message: string; code: number }>;
    return items.map((i) => ({ path: toRel(root, file), line: i.line, column: i.column, severity: 'error', message: `TS${i.code}: ${i.message}`, source: 'typescript' }));
  } catch {
    return [];
  }
}

/** JSON (comments and trailing commas are tolerated, as in tsconfig or VS Code settings). */
export function checkJsonText(text: string, path: string): Problem[] {
  const source = text.replace(/^﻿/, '');
  const lenient = source.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str: string | undefined) => str ?? m.replace(/[^\n]/g, ' ')).replace(/,(\s*[}\]])/g, ' $1');
  try {
    JSON.parse(lenient);
    return [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const explicit = /line (\d+) column (\d+)/.exec(message);
    const position = /position (\d+)/.exec(message);
    let line = 1;
    let column = 1;
    if (explicit) {
      line = Number(explicit[1]);
      column = Number(explicit[2]);
    } else if (position) {
      const before = lenient.slice(0, Number(position[1]));
      line = before.split('\n').length;
      column = before.length - before.lastIndexOf('\n');
    } else if (/end of JSON input/i.test(message)) {
      line = lenient.split('\n').length;
    }
    return [{ path, line, column, severity: 'error', message: message.replace(/\s*\(line \d+ column \d+\)/, '').replace(/ in JSON at position \d+/, ''), source: 'json' }];
  }
}

const PS_PARSE = [
  '$errors = $null; $tokens = $null',
  '[void][System.Management.Automation.Language.Parser]::ParseFile($args[0], [ref]$tokens, [ref]$errors)',
  '$out = @($errors | ForEach-Object { @{ line = $_.Extent.StartLineNumber; column = $_.Extent.StartColumnNumber; message = $_.Message } })',
  'ConvertTo-Json -InputObject $out -Compress',
].join('; ');

async function checkPowerShell(file: string, root: string, signal?: AbortSignal): Promise<Problem[]> {
  if (process.platform !== 'win32') return [];
  const result = await runProgram('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `& { ${PS_PARSE} } '${file.replace(/'/g, "''")}'`], { cwd: root, timeoutMs: 30_000, signal });
  try {
    const parsed = JSON.parse(result.stdout.trim() || '[]') as Array<{ line: number; column: number; message: string }> | { line: number; column: number; message: string };
    return (Array.isArray(parsed) ? parsed : [parsed]).map((i) => ({ path: toRel(root, file), line: i.line, column: i.column, severity: 'error', message: i.message, source: 'powershell' }));
  } catch {
    return [];
  }
}

async function checkRuff(target: string, root: string, signal?: AbortSignal): Promise<Problem[]> {
  const ruff = await which('ruff');
  if (!ruff) return [];
  const result = await runProgram(ruff, ['check', '--output-format', 'json', '--no-cache', '--exit-zero', target], { cwd: root, timeoutMs: 60_000, signal });
  try {
    const items = JSON.parse(result.stdout) as Array<{ filename: string; code: string | null; message: string; location: { row: number; column: number } }>;
    return items.map((i) => ({ path: toRel(root, i.filename), line: i.location.row, column: i.location.column, severity: i.code && /^(E9|F63|F7|F82)/.test(i.code) ? 'error' : 'warning', message: `${i.code ? `${i.code} ` : ''}${i.message}`, source: 'ruff' }));
  } catch {
    return [];
  }
}

const QUICK_EXTENSIONS = new Set(['py', 'pyw', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'jsx', 'json', 'jsonc', 'ps1', 'psm1']);

export function hasQuickCheck(file: string): boolean {
  return QUICK_EXTENSIONS.has(extname(file).slice(1).toLowerCase());
}

/** Fast checks for one file: syntax for Python, JavaScript, TypeScript (with the project's TypeScript), JSON and PowerShell. */
export async function quickCheck(file: string, root: string, signal?: AbortSignal): Promise<Problem[]> {
  const ext = extname(file).slice(1).toLowerCase();
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || info.size > 5 * 1024 * 1024) return [];
  switch (ext) {
    case 'py':
    case 'pyw': {
      const syntax = await checkPython(file, root, signal);
      return syntax.length ? syntax : (await checkRuff(file, root, signal)).filter((p) => p.severity === 'error' || /^F(401|8\d\d)/.test(p.message));
    }
    case 'js':
    case 'mjs':
    case 'cjs':
      return checkJavaScript(file, root, signal);
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
    case 'jsx':
      return checkTypeScriptSyntax(file, root, signal);
    case 'json':
    case 'jsonc':
      return checkJsonText(await readFile(file, 'utf8'), toRel(root, file));
    case 'ps1':
    case 'psm1':
      return checkPowerShell(file, root, signal);
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Project checks

/** `file(line,col): error TS2304: message` lines from tsc --pretty false. */
export function parseTscOutput(output: string, root: string): Problem[] {
  const problems: Problem[] = [];
  for (const match of output.matchAll(/^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/gm)) {
    problems.push({ path: toRel(root, match[1]), line: Number(match[2]), column: Number(match[3]), severity: match[4] as Problem['severity'], message: `${match[5]}: ${match[6]}`, source: 'tsc' });
  }
  return problems;
}

/** `path:line:col: message` (go vet) and `path:line:col: error[E0425]: message` (cargo --message-format short). */
export function parseColonOutput(output: string, root: string, source: string): Problem[] {
  const problems: Problem[] = [];
  for (const match of output.matchAll(/^(?:vet: )?([^\s:][^:]*(?::\\[^:]*)?):(\d+):(\d+):\s*(?:(error|warning)(?:\[[^\]]+\])?:\s*)?(.+)$/gm)) {
    problems.push({ path: toRel(root, match[1]), line: Number(match[2]), column: Number(match[3]), severity: (match[4] as Problem['severity']) ?? 'error', message: match[5].trim(), source });
  }
  return problems;
}

async function checkPyright(root: string, signal?: AbortSignal): Promise<Problem[] | null> {
  const pyright = await which('pyright');
  if (!pyright) return null;
  const result = await runProgram(pyright, ['--outputjson'], { cwd: root, timeoutMs: 240_000, signal });
  try {
    const parsed = JSON.parse(result.stdout) as { generalDiagnostics?: Array<{ file: string; severity: string; message: string; rule?: string; range: { start: { line: number; character: number } } }> };
    return (parsed.generalDiagnostics ?? [])
      .filter((d) => d.severity === 'error' || d.severity === 'warning')
      .map((d) => ({ path: toRel(root, d.file), line: d.range.start.line + 1, column: d.range.start.character + 1, severity: d.severity as Problem['severity'], message: `${d.message}${d.rule ? ` (${d.rule})` : ''}`, source: 'pyright' }));
  } catch {
    return null;
  }
}

export interface ProjectCheckResult {
  problems: Problem[];
  /** Checkers that ran, e.g. "tsc", "python". */
  ran: string[];
  notes: string[];
}

async function hasFiles(root: string, extension: string, limit = 2000): Promise<boolean> {
  let seen = 0;
  for await (const entry of walk(root, {})) {
    if (!entry.isDirectory && entry.path.toLowerCase().endsWith(extension)) return true;
    if (++seen > limit) return false;
  }
  return false;
}

/** Run the checkers the project has: tsc, pyright / ruff / Python syntax, cargo check, go vet. */
export async function projectCheck(root: string, signal?: AbortSignal): Promise<ProjectCheckResult> {
  const result: ProjectCheckResult = { problems: [], ran: [], notes: [] };
  if (existsSync(join(root, 'tsconfig.json'))) {
    const typescript = localTypeScript(root, root);
    if (typescript) {
      const node = nodeRunner();
      const tsc = join(dirname(dirname(typescript)), 'bin', 'tsc');
      const run = await runProgram(node.file, [tsc, '--noEmit', '-p', '.', '--pretty', 'false'], { cwd: root, timeoutMs: 240_000, env: node.env, signal });
      result.problems.push(...parseTscOutput(run.stdout + run.stderr, root));
      result.ran.push('tsc');
      if (run.timedOut) result.notes.push('tsc was stopped after 4 minutes.');
    } else {
      result.notes.push('tsconfig.json found, but TypeScript is not installed in node_modules (run the package install first).');
    }
  }
  if (await hasFiles(root, '.py')) {
    const syntax = await checkPython(root, root, signal);
    result.problems.push(...syntax);
    result.ran.push('python');
    const pyright = await checkPyright(root, signal);
    if (pyright) {
      result.problems.push(...pyright);
      result.ran.push('pyright');
    } else {
      const ruff = await checkRuff(root, root, signal);
      if (await which('ruff')) {
        result.problems.push(...ruff);
        result.ran.push('ruff');
      } else if (!(await findPython())) {
        result.notes.push('Python is not installed, so Python files were not checked.');
      }
    }
  }
  if (existsSync(join(root, 'Cargo.toml')) && (await which('cargo'))) {
    const run = await runProgram('cargo', ['check', '--message-format', 'short', '--quiet'], { cwd: root, timeoutMs: 300_000, signal });
    result.problems.push(...parseColonOutput(run.stderr, root, 'cargo'));
    result.ran.push('cargo check');
  }
  if (existsSync(join(root, 'go.mod')) && (await which('go'))) {
    const run = await runProgram('go', ['vet', './...'], { cwd: root, timeoutMs: 240_000, signal });
    result.problems.push(...parseColonOutput(run.stderr, root, 'go vet'));
    result.ran.push('go vet');
  }
  return result;
}

const MAX_LISTED = 80;

export function formatProblems(problems: Problem[]): string {
  if (problems.length === 0) return 'No problems found.';
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.length - errors;
  const sorted = [...problems].sort((a, b) => Number(a.severity !== 'error') - Number(b.severity !== 'error') || a.path.localeCompare(b.path) || a.line - b.line);
  const lines = sorted.slice(0, MAX_LISTED).map((p) => `${p.path}:${p.line}:${p.column} ${p.severity}: ${p.message} (${p.source})`);
  const counts = [errors && `${errors} error${errors === 1 ? '' : 's'}`, warnings && `${warnings} warning${warnings === 1 ? '' : 's'}`].filter(Boolean).join(', ');
  return `${problems.length} problem${problems.length === 1 ? '' : 's'} (${counts}):\n${lines.join('\n')}${problems.length > MAX_LISTED ? `\n[${problems.length - MAX_LISTED} more not shown]` : ''}`;
}

/** Appended to write/edit results: problems in the file just changed. */
export async function problemsAfterChange(file: string, root: string): Promise<string> {
  if (!hasQuickCheck(file)) return '';
  try {
    const problems = await quickCheck(file, root);
    if (problems.length === 0) return '';
    return `\n\nProblems in ${basename(file)} after this change — fix them before moving on:\n${formatProblems(problems).split('\n').slice(1).join('\n')}`;
  } catch {
    return '';
  }
}
