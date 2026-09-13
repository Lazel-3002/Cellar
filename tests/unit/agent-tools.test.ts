import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TaskState } from '../../src/shared/types/agent';
import type { AppSettings } from '../../src/shared/types/settings';
import { createPptx, createXlsx, extractDocumentText, markdownToDocx, markdownToHtmlPage } from '../../src/main/agent/documents';
import { findTool, normalizeArgs, toolsFor, toolSchema, type AgentTool, type ToolContext } from '../../src/main/agent/tools';
import { runShell } from '../../src/main/agent/tools/command';
import { editFileTool, globTool, grepTool, listDir, readFileTool, writeFileTool } from '../../src/main/agent/tools/files';
import { createDocx, createXlsx as createXlsxTool, todoWrite } from '../../src/main/agent/tools/plan-docs';
import { webFetch } from '../../src/main/agent/tools/web';
import { Workspace } from '../../src/main/agent/workspace';

let root: string;

function task(): TaskState {
  return { folder: root, workDir: root, permissionMode: 'ask', status: 'running', todos: [], files: [], sources: [], allowCommands: false, allowedDomains: [], steps: 0, maxSteps: 40 };
}

async function context(maxResultChars = 20_000): Promise<ToolContext> {
  const workspace = await Workspace.open(root);
  const t = task();
  return {
    workspace,
    task: t,
    settings: { coworkWebAccess: true, webSearchProvider: 'duckduckgo', searxngUrl: '' } as AppSettings,
    signal: new AbortController().signal,
    maxResultChars,
    knownUrls: new Set(),
    recordFile: (file) => t.files.push({ ...file, path: workspace.relative(file.absolutePath), updatedAt: Date.now() }),
    recordSource: (source) => t.sources.push({ ...source, at: Date.now() }),
    setTodos: (todos) => {
      t.todos = todos;
    },
  };
}

async function call(tool: AgentTool, args: Record<string, unknown>, ctx?: ToolContext): Promise<string> {
  const parsed = tool.input.parse(normalizeArgs(tool, args));
  return tool.run(parsed, ctx ?? (await context()));
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cellar-tools-'));
  await mkdir(join(root, 'notes', 'old'), { recursive: true });
  await writeFile(join(root, 'notes', 'meeting.md'), '# Meeting\n\n- Budget is 1200\n- TODO: book room\n');
  await writeFile(join(root, 'notes', 'old', 'draft.txt'), 'todo later\r\nsecond line\r\n');
  await writeFile(join(root, 'long.txt'), Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n'));
  await writeFile(join(root, 'photo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]));
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe('file tools', () => {
  it('lists folders with nesting', async () => {
    const out = await call(listDir, { depth: 2 });
    expect(out).toContain('notes/');
    expect(out).toContain('  meeting.md');
    expect(out).toContain('  old/');
    expect(out).toMatch(/long\.txt\s+\d/);
  });

  it('reads files in pages and refuses images', async () => {
    const ctx = await context(200);
    const first = await readFileTool.run({ path: 'long.txt' }, ctx);
    expect(first).toContain('[long.txt — lines 1 to');
    expect(first).toMatch(/Call read_file with offset=\d+ to continue/);
    const page = await call(readFileTool, { path: 'long.txt', offset: '100', limit: 2 });
    expect(page).toBe('[long.txt — lines 100 to 101 of 500]\nline 100\nline 101\n[399 more lines. Call read_file with offset=102 to continue.]');
    await expect(call(readFileTool, { path: 'photo.png' })).rejects.toThrow(/image/);
    await expect(call(readFileTool, { file_path: 'missing.md' })).rejects.toThrow(/does not exist/);
  });

  it('writes files, creating folders, and refuses to write office formats as text', async () => {
    const ctx = await context();
    const approval = await writeFileTool.approval!({ path: 'out/summary.md', content: '# Summary' }, ctx);
    expect(approval).toMatchObject({ kind: 'write', title: 'Create out/summary.md', exists: false });
    expect(await writeFileTool.run({ path: 'out/summary.md', content: '# Summary\n' }, ctx)).toMatch(/^Created out\/summary\.md/);
    expect(await readFile(join(root, 'out', 'summary.md'), 'utf8')).toBe('# Summary\n');
    expect(ctx.task.files).toMatchObject([{ path: 'out/summary.md', action: 'created', tool: 'write_file' }]);
    await expect(writeFileTool.run({ path: 'report.docx', content: 'hi' }, ctx)).rejects.toThrow(/create_docx/);
  });

  it('edits exact text, requiring a unique match and handling CRLF files', async () => {
    const ctx = await context();
    await expect(call(editFileTool, { path: 'notes/meeting.md', old_string: 'Budget is 9999', new_string: 'x' }, ctx)).rejects.toThrow(/not found/);
    await writeFile(join(root, 'dup.txt'), 'a b a');
    await expect(call(editFileTool, { path: 'dup.txt', old_string: 'a', new_string: 'c' }, ctx)).rejects.toThrow(/appears 2 times/);
    expect(await call(editFileTool, { path: 'dup.txt', old_string: 'a', new_string: 'c', replace_all: true }, ctx)).toBe('Edited dup.txt (2 replacements).');
    expect(await readFile(join(root, 'dup.txt'), 'utf8')).toBe('c b c');
    await call(editFileTool, { path: 'notes/old/draft.txt', old_string: 'todo later\nsecond line', new_string: 'done\nnext' }, ctx);
    expect(await readFile(join(root, 'notes', 'old', 'draft.txt'), 'utf8')).toBe('done\r\nnext\r\n');
  });

  it('finds files with glob and text with grep', async () => {
    const globbed = await call(globTool, { pattern: '*.{md,txt}' });
    expect(globbed).toContain('notes/meeting.md');
    expect(globbed).toContain('notes/old/draft.txt');
    const grepped = await call(grepTool, { pattern: 'todo', ignore_case: true, glob: '*.md' });
    expect(grepped).toContain('notes/meeting.md:4: - TODO: book room');
    expect(grepped).not.toContain('draft.txt');
    expect(await call(grepTool, { pattern: '(unclosed' })).toMatch(/No matches/);
  });

  it('keeps the todo list and tolerates loose status words', async () => {
    const ctx = await context();
    const args = normalizeArgs(todoWrite as AgentTool, { todos: JSON.stringify([{ content: 'Read notes', status: 'done' }, { task: 'Write summary', status: 'in progress' }, 'Send it']) });
    expect(await todoWrite.run(todoWrite.input.parse(args), ctx)).toBe('Plan updated: 1 of 3 done, now working on "Write summary".');
    expect(ctx.task.todos.map((t) => t.status)).toEqual(['completed', 'in_progress', 'pending']);
  });

  it('filters tools by permission mode and settings, and finds tools by loose names', () => {
    const names = (mode: 'ask' | 'plan', web = true) => toolsFor(mode, { coworkWebAccess: web }, { pdf: false }).map((t) => t.name);
    expect(names('ask')).toContain('write_file');
    expect(names('ask')).not.toContain('create_pdf');
    expect(names('plan')).not.toContain('write_file');
    expect(names('plan')).not.toContain('run_command');
    expect(names('plan')).toContain('todo_write');
    expect(names('ask', false)).not.toContain('web_search');
    const tools = toolsFor('ask', { coworkWebAccess: true }, { pdf: true });
    expect(findTool(tools, 'ReadFile')?.name).toBe('read_file');
    expect(findTool(tools, 'functions.list_dir')?.name).toBe('list_dir');
    const schema = toolSchema(readFileTool as AgentTool);
    expect(schema.parameters).toMatchObject({ type: 'object', required: ['path'] });
    expect(JSON.stringify(schema.parameters)).not.toContain('$schema');
  });

  it('asks before opening URLs the model was not given', async () => {
    const ctx = await context();
    expect(await webFetch.approval!({ url: 'https://example.com/page' }, ctx)).toMatchObject({ kind: 'web', url: 'https://example.com/page' });
    ctx.knownUrls.add('https://example.com/page');
    expect(await webFetch.approval!({ url: 'https://example.com/page#top' }, ctx)).toBeNull();
    await expect(webFetch.approval!({ url: 'http://127.0.0.1:11434/api/tags' }, ctx)).rejects.toThrow(/private/);
  });
});

describe('documents', () => {
  it('creates Word files from Markdown that read back as text', async () => {
    const buffer = await markdownToDocx('# Quarterly report\n\nRevenue grew **12%**.\n\n1. First\n2. Second\n\n- [x] Done item\n\n| Region | Sales |\n| --- | --- |\n| EU | 10 |\n\n```\ncode()\n```', 'Report');
    const zip = await JSZip.loadAsync(buffer);
    expect(zip.file('word/document.xml')).toBeTruthy();
    const file = join(root, 'report.docx');
    await writeFile(file, buffer);
    const text = await extractDocumentText(file);
    expect(text).toContain('Quarterly report');
    expect(text).toContain('Revenue grew 12%.');
    expect(text).toContain('Second');
    expect(text).toContain('EU');
    expect(text).toContain('code()');
  });

  it('creates spreadsheets with formulas and presentations that read back', async () => {
    const xlsx = join(root, 'budget.xlsx');
    await writeFile(xlsx, await createXlsx([{ name: 'Budget: 2026', rows: [['Item', 'Cost'], ['Room', 300], ['Food', 450], ['Total', '=SUM(B2:B3)']] }]));
    const sheet = await extractDocumentText(xlsx);
    expect(sheet).toContain('--- Sheet: Budget  2026 (4 rows) ---');
    expect(sheet).toContain('Room | 300');

    const pptx = join(root, 'deck.pptx');
    await writeFile(pptx, await createPptx([{ title: 'Cellar', subtitle: 'Local agents' }, { title: 'Why local', bullets: ['Private', 'Fast'], notes: 'Say hi' }]));
    const slides = await extractDocumentText(pptx);
    expect(slides).toContain('--- Slide 1 ---');
    expect(slides).toContain('Local agents');
    expect(slides).toContain('Private');
  });

  it('document tools add the extension, record the file and describe what they will create', async () => {
    const ctx = await context();
    const sheets = [{ name: 'Actions', columns: ['Action', 'Owner'], rows: [['Write plan', 'Ayşe']] }];
    const approval = await createXlsxTool.approval!({ path: 'numbers', sheets }, ctx);
    expect(approval).toMatchObject({ kind: 'document', title: 'Create numbers.xlsx', preview: 'Sheet "Actions": 1 rows × 2 columns\nAction | Owner\nWrite plan | Ayşe' });
    await createXlsxTool.run({ path: 'numbers', sheets }, ctx);
    expect(await extractDocumentText(join(root, 'numbers.xlsx'))).toContain('Action | Owner\nWrite plan | Ayşe');
    expect(await createDocx.run({ path: 'letters/hello', markdown: '# Hello' }, ctx)).toMatch(/^Created letters\/hello\.docx/);
    await expect(createDocx.approval!({ path: 'summary.md', markdown: '# Hi' }, ctx)).rejects.toThrow('To create summary.md, use write_file.');
    await expect(createDocx.run({ path: 'deck.pptx', markdown: '# Hi' }, ctx)).rejects.toThrow('Use create_pptx instead.');
    expect(await createDocx.run({ path: 'Q3.final', markdown: '# Q3' }, ctx)).toMatch(/^Created Q3\.final\.docx/);
    expect(ctx.task.files.map((f) => [f.path, f.tool])).toEqual([
      ['numbers.xlsx', 'create_xlsx'],
      ['letters/hello.docx', 'create_docx'],
      ['Q3.final.docx', 'create_docx'],
    ]);
    expect(markdownToHtmlPage('Some *text*', 'Title')).toContain('<h1>Title</h1>');
  });
});

describe.runIf(process.platform === 'win32')('run_command', () => {
  it('runs PowerShell in the folder with UTF-8 output and exit codes', async () => {
    const result = await runShell('Write-Output "çalışma klasörü: $((Get-Location).Path)"; cmd /c exit 3', root, 60_000);
    expect(result.output).toContain('çalışma klasörü');
    expect(result.output).toContain(root);
    expect(result.exitCode).toBe(3);
  }, 60_000);

  it('stops commands that run too long', async () => {
    const result = await runShell('Start-Sleep -Seconds 20', root, 1500);
    expect(result.timedOut).toBe(true);
    expect(result.durationMs).toBeLessThan(15_000);
  }, 60_000);
});
