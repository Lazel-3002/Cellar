import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { z } from 'zod';
import { formatBytes } from '../../lib/util';
import { DOCUMENT_EXTENSIONS, extractDocumentText } from '../documents';
import { globFiles, globToRegExp, IGNORED_DIRS, walk } from '../glob';
import { defineTool, ToolError, type ToolContext } from './types';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'psd']);
const BINARY_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...'zip 7z rar gz tgz tar xz exe dll so dylib bin gguf safetensors pt pth onnx ckpt mp3 mp4 m4a mkv mov avi wav flac ogg webm woff woff2 ttf otf eot class jar pyc db sqlite doc xls ppt msi iso'.split(' '),
]);

const MAX_TEXT_FILE_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 60 * 1024 * 1024;

async function statOrNull(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

const isBinary = (buf: Buffer) => buf.subarray(0, 8000).includes(0);
const extOf = (path: string) => extname(path).slice(1).toLowerCase();
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function readTextFile(abs: string, rel: string): Promise<string> {
  const info = await statOrNull(abs);
  if (!info) throw new ToolError(`${rel} does not exist.`);
  if (info.isDirectory()) throw new ToolError(`${rel} is a folder. Use list_dir to see what is inside.`);
  if (info.size > MAX_TEXT_FILE_BYTES) throw new ToolError(`${rel} is ${formatBytes(info.size)}, too large to read. Use grep to find the relevant lines.`);
  const buf = await readFile(abs);
  if (isBinary(buf)) throw new ToolError(`${rel} is a binary file and cannot be read as text.`);
  const text = buf.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export const listDir = defineTool({
  name: 'list_dir',
  description: 'List the files and folders in a folder of the working folder, with sizes and modification dates.',
  category: 'read',
  input: z.object({
    path: z.string().optional().describe('Folder path relative to the working folder. Defaults to the working folder itself.'),
    depth: z.coerce.number().int().min(1).max(3).optional().describe('How many levels to list, 1 to 3. Default 1.'),
  }),
  async run(args, ctx) {
    const abs = await ctx.workspace.resolve(args.path ?? '.');
    const rel = ctx.workspace.relative(abs);
    const info = await statOrNull(abs);
    if (!info) throw new ToolError(`${rel} does not exist.`);
    if (!info.isDirectory()) throw new ToolError(`${rel} is a file, not a folder. Use read_file to read it.`);
    const depth = args.depth ?? 1;
    const limit = 400;
    const lines: string[] = [];
    let truncated = false;

    const visit = async (dir: string, indent: string, level: number) => {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        lines.push(`${indent}(cannot be read)`);
        return;
      }
      entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (lines.length >= limit) {
          truncated = true;
          return;
        }
        const full = join(dir, entry.name);
        if (entry.isSymbolicLink()) {
          lines.push(`${indent}${entry.name} (link)`);
        } else if (entry.isDirectory()) {
          const skipped = IGNORED_DIRS.has(entry.name);
          lines.push(`${indent}${entry.name}/${skipped ? ' (not expanded)' : ''}`);
          if (!skipped && level < depth) await visit(full, `${indent}  `, level + 1);
        } else {
          const s = await statOrNull(full);
          lines.push(s ? `${indent}${entry.name}  ${formatBytes(s.size)}  ${day(s.mtimeMs)}` : `${indent}${entry.name}`);
        }
      }
    };
    await visit(abs, '', 1);
    if (lines.length === 0) return `${rel === '.' ? 'The working folder' : rel} is empty.`;
    return `${rel === '.' ? 'Working folder' : rel}:\n${lines.join('\n')}${truncated ? `\n[Listing stopped at ${limit} entries.]` : ''}`;
  },
});

export const readFileTool = defineTool({
  name: 'read_file',
  description:
    'Read a file from the working folder. Works for text and code, and extracts the text of PDF, Word (.docx), PowerPoint (.pptx) and Excel (.xlsx) files. Long files come back in parts; use offset to continue.',
  category: 'read',
  input: z.object({
    path: z.string().describe('File path relative to the working folder.'),
    offset: z.coerce.number().int().min(1).optional().describe('Line number to start from (1-based).'),
    limit: z.coerce.number().int().min(1).optional().describe('Maximum number of lines to return.'),
  }),
  async run(args, ctx) {
    const abs = await ctx.workspace.resolve(args.path);
    const rel = ctx.workspace.relative(abs);
    const ext = extOf(abs);
    let text: string;
    if (DOCUMENT_EXTENSIONS.has(ext)) {
      const info = await statOrNull(abs);
      if (!info) throw new ToolError(`${rel} does not exist.`);
      if (info.size > MAX_DOCUMENT_BYTES) throw new ToolError(`${rel} is ${formatBytes(info.size)}, too large to read.`);
      text = await extractDocumentText(abs);
      if (!text.trim()) return `${rel} contains no extractable text.`;
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      throw new ToolError(`${rel} is an image. Images cannot be read as text.`);
    } else {
      text = await readTextFile(abs, rel);
    }
    if (!text) return `${rel} is empty.`;

    const lines = text.split(/\r?\n/);
    const start = (args.offset ?? 1) - 1;
    if (start >= lines.length) throw new ToolError(`${rel} has only ${lines.length} lines.`);
    const end = args.limit ? Math.min(lines.length, start + args.limit) : lines.length;
    const out: string[] = [];
    let used = 0;
    let i = start;
    for (; i < end; i++) {
      const line = lines[i].length > 4000 ? `${lines[i].slice(0, 4000)}…` : lines[i];
      if (used + line.length + 1 > ctx.maxResultChars && i > start) break;
      out.push(line);
      used += line.length + 1;
    }
    const partial = start > 0 || i < lines.length;
    const header = partial ? `[${rel} — lines ${start + 1} to ${i} of ${lines.length}]\n` : '';
    const footer = i < lines.length ? `\n[${lines.length - i} more lines. Call read_file with offset=${i + 1} to continue.]` : '';
    return `${header}${out.join('\n')}${footer}`;
  },
});

async function describeWrite(path: string, content: string, ctx: ToolContext) {
  const abs = await ctx.workspace.resolve(path);
  const rel = ctx.workspace.relative(abs);
  const info = await statOrNull(abs);
  return { abs, rel, exists: !!info && info.isFile(), isDirectory: !!info?.isDirectory(), content };
}

export const writeFileTool = defineTool({
  name: 'write_file',
  description: 'Create a text file (or replace one completely) in the working folder. Parent folders are created as needed. For small changes to an existing file use edit_file.',
  category: 'edit',
  input: z.object({
    path: z.string().describe('File path relative to the working folder.'),
    content: z.string().describe('The complete file content.'),
  }),
  async approval(args, ctx) {
    const w = await describeWrite(args.path, args.content, ctx);
    return { kind: 'write', title: `${w.exists ? 'Overwrite' : 'Create'} ${w.rel}`, path: w.rel, exists: w.exists, preview: args.content.slice(0, 8000) };
  },
  async run(args, ctx) {
    const w = await describeWrite(args.path, args.content, ctx);
    if (w.isDirectory) throw new ToolError(`${w.rel} is a folder.`);
    if (DOCUMENT_EXTENSIONS.has(extOf(w.abs))) {
      throw new ToolError(`write_file writes plain text, which would corrupt ${w.rel}. Use create_${extOf(w.abs)} instead.`);
    }
    await ctx.beforeChange?.(w.abs);
    await mkdir(dirname(w.abs), { recursive: true });
    await writeFile(w.abs, args.content, 'utf8');
    const bytes = Buffer.byteLength(args.content);
    ctx.recordFile({ absolutePath: w.abs, action: w.exists ? 'modified' : 'created', tool: 'write_file', bytes });
    const problems = (await ctx.afterChange?.(w.abs)) ?? '';
    return `${w.exists ? 'Replaced' : 'Created'} ${w.rel} (${args.content.split('\n').length} lines, ${formatBytes(bytes)}).${problems}`;
  },
});

const count = (haystack: string, needle: string) => (needle ? haystack.split(needle).length - 1 : 0);

async function planEdit(args: { path: string; old_string: string; new_string: string; replace_all?: boolean }, ctx: ToolContext) {
  const abs = await ctx.workspace.resolve(args.path);
  const rel = ctx.workspace.relative(abs);
  if (!args.old_string) throw new ToolError('old_string is empty. To create a file use write_file.');
  if (args.old_string === args.new_string) throw new ToolError('old_string and new_string are the same, so there is nothing to change.');
  const text = await readTextFile(abs, rel);
  let oldText = args.old_string;
  let newText = args.new_string;
  let matches = count(text, oldText);
  if (matches === 0 && text.includes('\r\n') && !oldText.includes('\r\n')) {
    oldText = oldText.replace(/\n/g, '\r\n');
    newText = newText.replace(/\r?\n/g, '\r\n');
    matches = count(text, oldText);
  }
  if (matches === 0) throw new ToolError(`old_string was not found in ${rel}. Read the file again and copy the exact text, including spaces and line breaks.`);
  if (matches > 1 && !args.replace_all) {
    throw new ToolError(`old_string appears ${matches} times in ${rel}. Include more of the surrounding text so it is unique, or set replace_all to true.`);
  }
  const next = args.replace_all ? text.split(oldText).join(newText) : text.replace(oldText, () => newText);
  return { abs, rel, next, matches: args.replace_all ? matches : 1 };
}

export const editFileTool = defineTool({
  name: 'edit_file',
  description: 'Change part of an existing text file by replacing an exact piece of text. old_string must match the file exactly and be unique unless replace_all is true.',
  category: 'edit',
  input: z.object({
    path: z.string().describe('File path relative to the working folder.'),
    old_string: z.string().describe('The exact text to replace.'),
    new_string: z.string().describe('The replacement text.'),
    replace_all: z.boolean().optional().describe('Replace every occurrence instead of exactly one.'),
  }),
  async approval(args, ctx) {
    const plan = await planEdit(args, ctx);
    return { kind: 'edit', title: `Edit ${plan.rel}`, path: plan.rel, exists: true, diff: { oldText: args.old_string, newText: args.new_string } };
  },
  async run(args, ctx) {
    const plan = await planEdit(args, ctx);
    await ctx.beforeChange?.(plan.abs);
    await writeFile(plan.abs, plan.next, 'utf8');
    ctx.recordFile({ absolutePath: plan.abs, action: 'modified', tool: 'edit_file', bytes: Buffer.byteLength(plan.next) });
    const problems = (await ctx.afterChange?.(plan.abs)) ?? '';
    return `Edited ${plan.rel} (${plan.matches} replacement${plan.matches === 1 ? '' : 's'}).${problems}`;
  },
});

export const globTool = defineTool({
  name: 'glob',
  description: 'Find files by name pattern, newest first. "*.md" matches in every subfolder; "notes/*.txt" only directly inside notes; "**" matches any number of folders; {a,b} gives alternatives.',
  category: 'read',
  input: z.object({
    pattern: z.string().describe('Glob pattern, for example "**/*.pdf" or "*.{docx,xlsx}".'),
    path: z.string().optional().describe('Folder to search in, relative to the working folder. Default: the working folder.'),
  }),
  async run(args, ctx) {
    const abs = await ctx.workspace.resolve(args.path ?? '.');
    const info = await statOrNull(abs);
    if (!info?.isDirectory()) throw new ToolError(`${ctx.workspace.relative(abs)} is not a folder.`);
    const { matches, truncated } = await globFiles(abs, args.pattern, 200, ctx.signal);
    if (matches.length === 0) return `No files match ${args.pattern}.`;
    const lines = matches.map((m) => `${ctx.workspace.relative(m.absolutePath)}  ${formatBytes(m.size)}  ${day(m.mtimeMs)}`);
    return `${matches.length} file${matches.length === 1 ? '' : 's'} match ${args.pattern}:\n${lines.join('\n')}${truncated ? '\n[More files match; use a narrower pattern.]' : ''}`;
  },
});

export const grepTool = defineTool({
  name: 'grep',
  description: 'Search the contents of text files for a regular expression (JavaScript syntax). Returns matching lines as path:line: text.',
  category: 'read',
  input: z.object({
    pattern: z.string().describe('Regular expression to search for.'),
    path: z.string().optional().describe('File or folder to search, relative to the working folder. Default: the working folder.'),
    glob: z.string().optional().describe('Only search files matching this glob, for example "*.md".'),
    ignore_case: z.boolean().optional().describe('Case-insensitive search.'),
    max_results: z.coerce.number().int().min(1).max(500).optional().describe('Maximum matching lines to return (default 100).'),
  }),
  async run(args, ctx) {
    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern, args.ignore_case ? 'i' : '');
    } catch {
      regex = new RegExp(args.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), args.ignore_case ? 'i' : '');
    }
    const abs = await ctx.workspace.resolve(args.path ?? '.');
    const info = await statOrNull(abs);
    if (!info) throw new ToolError(`${ctx.workspace.relative(abs)} does not exist.`);
    const filter = args.glob ? globToRegExp(args.glob) : null;
    const max = args.max_results ?? 100;
    const results: string[] = [];
    let searched = 0;
    let used = 0;

    const searchFile = async (file: string, relForFilter: string) => {
      if (filter && !filter.test(relForFilter)) return;
      if (BINARY_EXTENSIONS.has(extOf(file))) return;
      const s = await statOrNull(file);
      if (!s || s.size > 2 * 1024 * 1024) return;
      let buf: Buffer;
      try {
        buf = await readFile(file);
      } catch {
        return;
      }
      if (isBinary(buf)) return;
      searched++;
      const lines = buf.toString('utf8').split(/\r?\n/);
      for (let n = 0; n < lines.length && results.length < max; n++) {
        if (!regex.test(lines[n])) continue;
        const line = `${ctx.workspace.relative(file)}:${n + 1}: ${lines[n].trim().slice(0, 300)}`;
        used += line.length + 1;
        if (used > ctx.maxResultChars) return;
        results.push(line);
      }
    };

    if (info.isFile()) {
      await searchFile(abs, ctx.workspace.relative(abs));
    } else {
      for await (const entry of walk(abs, { signal: ctx.signal })) {
        if (results.length >= max || used > ctx.maxResultChars) break;
        if (!entry.isDirectory) await searchFile(entry.absolutePath, entry.path);
      }
    }
    if (results.length === 0) return `No matches for /${args.pattern}/ in ${searched} file${searched === 1 ? '' : 's'}.`;
    const capped = results.length >= max || used > ctx.maxResultChars;
    return `${results.length} matching line${results.length === 1 ? '' : 's'}${capped ? ' (limit reached)' : ''}:\n${results.join('\n')}`;
  },
});
