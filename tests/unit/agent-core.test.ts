import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentPart } from '../../src/shared/types/agent';
import type { Message, StreamEvent } from '../../src/shared/types/chat';
import { globToRegExp } from '../../src/main/agent/glob';
import { buildTaskHistory } from '../../src/main/agent/history';
import { htmlToText, parseDuckDuckGoHtml, parseSearxngJson } from '../../src/main/agent/html';
import { parseLooseJson, parseTextToolCall, textProtocolInstructions, ToolCallTagSplitter, type CallSplitPart } from '../../src/main/agent/text-protocol';
import { canonicalUrl, extractUrls, isPrivateHost } from '../../src/main/agent/tools/web';
import { PathAccessError, Workspace } from '../../src/main/agent/workspace';
import { parseOllamaChatStream, toOllamaMessages } from '../../src/main/providers/ollama';
import { streamChatCompletion, toOpenAIMessages, toolsBody } from '../../src/main/providers/openai-compat';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

describe('Workspace', () => {
  let base: string;
  let root: string;
  let outside: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'cellar-ws-'));
    root = join(base, 'root');
    outside = join(base, 'outside');
    await mkdir(join(root, 'notes'), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, 'notes', 'a.md'), '# A');
    await writeFile(join(outside, 'secret.txt'), 'secret');
    await symlink(outside, join(root, 'escape'), 'junction');
  });

  afterAll(() => rm(base, { recursive: true, force: true }));

  it('resolves paths inside the folder, including absolute ones and a leading slash', async () => {
    const ws = await Workspace.open(root);
    expect(await ws.resolve('notes/a.md')).toBe(join(root, 'notes', 'a.md'));
    expect(await ws.resolve('/notes/a.md')).toBe(join(root, 'notes', 'a.md'));
    expect(await ws.resolve(join(root, 'notes'))).toBe(join(root, 'notes'));
    expect(await ws.resolve('')).toBe(root);
    expect(await ws.resolve('"notes/new file.txt"')).toBe(join(root, 'notes', 'new file.txt'));
    expect(ws.relative(join(root, 'notes', 'a.md'))).toBe('notes/a.md');
  });

  it('refuses paths that leave the folder', async () => {
    const ws = await Workspace.open(root);
    for (const bad of ['../outside/secret.txt', join(outside, 'secret.txt'), 'C:relative.txt', '\\\\server\\share\\x', 'notes/a.md:stream', 'notes/con.txt', '\\\\?\\C:\\Windows']) {
      await expect(ws.resolve(bad), bad).rejects.toBeInstanceOf(PathAccessError);
    }
  });

  it('refuses junctions that point outside, even for files that do not exist yet', async () => {
    const ws = await Workspace.open(root);
    await expect(ws.resolve('escape/secret.txt')).rejects.toThrow(/outside the working folder/);
    await expect(ws.resolve('escape/new.txt')).rejects.toThrow(/outside the working folder/);
  });
});

describe('globToRegExp', () => {
  it('matches file names at any depth when the pattern has no slash', () => {
    const md = globToRegExp('*.md');
    expect(md.test('a.md')).toBe(true);
    expect(md.test('notes/deep/b.MD')).toBe(process.platform === 'win32');
    expect(md.test('notes/deep/b.md')).toBe(true);
    expect(md.test('a.mdx')).toBe(false);
  });

  it('anchors patterns with folders and supports ** and braces', () => {
    expect(globToRegExp('notes/*.txt').test('notes/x.txt')).toBe(true);
    expect(globToRegExp('notes/*.txt').test('other/notes/x.txt')).toBe(false);
    expect(globToRegExp('**/*.{docx,xlsx}').test('a/b/report.xlsx')).toBe(true);
    expect(globToRegExp('**/*.{docx,xlsx}').test('report.docx')).toBe(true);
    expect(globToRegExp('data/**').test('data/2026/jan.csv')).toBe(true);
    expect(globToRegExp('file?.log').test('file1.log')).toBe(true);
  });
});

describe('text tool protocol', () => {
  const run = (chunks: string[]) => {
    const splitter = new ToolCallTagSplitter();
    const parts: CallSplitPart[] = [];
    for (const c of chunks) parts.push(...splitter.push(c));
    parts.push(...splitter.flush());
    return {
      text: parts.filter((p) => p.type === 'text').map((p) => (p as { delta: string }).delta).join(''),
      calls: parts.filter((p) => p.type === 'call').map((p) => (p as { raw: string }).raw),
    };
  };

  it('hides tool call blocks split across chunks', () => {
    const out = run(['Let me look.\n<tool', '_call>\n{"name": "list_dir", ', '"arguments": {}}\n</tool_c', 'all>']);
    expect(out.text).toBe('Let me look.\n');
    expect(out.calls).toHaveLength(1);
    expect(parseTextToolCall(out.calls[0])).toEqual({ name: 'list_dir', arguments: {} });
  });

  it('keeps an unclosed call that a stop sequence cut off', () => {
    const out = run(['<tool_call>{"name":"read_file","arguments":{"path":"a.md"}}']);
    expect(parseTextToolCall(out.calls[0])).toEqual({ name: 'read_file', arguments: { path: 'a.md' } });
  });

  it('parses loose JSON and the common call shapes', () => {
    expect(parseLooseJson('```json\n{"content": "line one\nline two", "n": [1,2,],}\n```')).toEqual({ content: 'line one\nline two', n: [1, 2] });
    expect(parseTextToolCall('{"function": {"name": "grep", "arguments": "{\\"pattern\\": \\"todo\\"}"}}')).toEqual({ name: 'grep', arguments: { pattern: 'todo' } });
    expect(parseTextToolCall('{"tool": "web_search", "parameters": {"query": "x"}}')).toEqual({ name: 'web_search', arguments: { query: 'x' } });
    expect(parseTextToolCall('not json')).toBeNull();
  });

  it('describes tools compactly for the system prompt', () => {
    const text = textProtocolInstructions([
      { name: 'read_file', description: 'Read a file.', parameters: { type: 'object', properties: { path: { type: 'string' }, offset: { type: 'integer' } }, required: ['path'] } },
    ]);
    expect(text).toContain('- read_file(path: string, offset?: integer): Read a file.');
    expect(text).toContain('<tool_call>');
  });
});

describe('web helpers', () => {
  it('turns HTML into readable text and collects links', () => {
    const page = htmlToText(
      '<html><head><title>Cellar &amp; wine</title><style>p{}</style></head><body><nav>Menu</nav><h2>Storage</h2><p>Keep bottles at <b>12°C</b>.</p><script>alert(1)</script><ul><li>Dark</li><li>Humid</li></ul><a href="/guide">Full guide</a></body></html>',
      'https://example.com/wine/',
    );
    expect(page.title).toBe('Cellar & wine');
    expect(page.text).toContain('## Storage');
    expect(page.text).toContain('Keep bottles at 12°C.');
    expect(page.text).toContain('- Dark');
    expect(page.text).not.toContain('alert');
    expect(page.text).not.toContain('Menu');
    expect(page.links).toEqual([{ url: 'https://example.com/guide', text: 'Full guide' }]);
  });

  it('parses DuckDuckGo HTML results and skips ads', () => {
    const html = `
      <div class="result results_links"><h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Fggml%2Dorg%2Fllama.cpp&amp;rut=abc">llama.cpp on <b>GitHub</b></a></h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=x">Inference of <b>LLaMA</b> in C/C++</a></div>
      <div class="result result--ad"><a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Buy GPUs</a></div>
      <div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Funsloth.ai%2Fdocs">Unsloth docs</a></div>`;
    expect(parseDuckDuckGoHtml(html)).toEqual([
      { title: 'llama.cpp on GitHub', url: 'https://github.com/ggml-org/llama.cpp', snippet: 'Inference of LLaMA in C/C++' },
      { title: 'Unsloth docs', url: 'https://unsloth.ai/docs', snippet: '' },
    ]);
    expect(parseSearxngJson({ results: [{ title: 'A', url: 'https://a.dev', content: 'snip' }, { url: 'javascript:alert(1)' }] })).toEqual([{ title: 'A', url: 'https://a.dev', snippet: 'snip' }]);
  });

  it('recognises private hosts and URLs in text', () => {
    for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '192.168.1.10', '172.20.0.1', '169.254.1.1', '::1', 'fd00::1', 'printer.local']) expect(isPrivateHost(host), host).toBe(true);
    for (const host of ['example.com', '8.8.8.8', '172.32.0.1']) expect(isPrivateHost(host), host).toBe(false);
    expect(extractUrls('See https://example.com/a?b=1. And (https://x.dev/path)')).toEqual(['https://example.com/a?b=1', 'https://x.dev/path']);
    expect(canonicalUrl('https://example.com/a#section')).toBe('https://example.com/a');
    expect(canonicalUrl('file:///C:/x')).toBeNull();
  });
});

describe('provider tool calling', () => {
  let server: Server;
  let base = '';
  let lastBody: Record<string, unknown> = {};

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        lastBody = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const chunks = [
          { choices: [{ delta: { content: 'Checking.' } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'abc', type: 'function', function: { name: 'read_file', arguments: '' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"a.md"}' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 1, id: 'def', function: { name: 'list_dir', arguments: '{}' } }] } }] },
          { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        ];
        for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
        res.end('data: [DONE]\n\n');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('keeps streamed OpenAI tool call chunks together by index', async () => {
    const events: StreamEvent[] = [];
    const body = { model: 'm', messages: [], ...toolsBody([{ name: 'read_file', description: 'Read', parameters: { type: 'object' } }], 'llamacpp') };
    for await (const e of streamChatCompletion({ baseUrl: base, body, signal: new AbortController().signal, reasoningStyle: 'none' })) events.push(e);
    const calls = events.filter((e): e is Extract<StreamEvent, { type: 'tool_call' }> => e.type === 'tool_call');
    expect(new Set(calls.filter((c) => c.name === 'read_file').map((c) => c.id))).toEqual(new Set(['abc']));
    expect(calls.filter((c) => c.id === 'abc').map((c) => c.argumentsDelta).join('')).toBe('{"path":"a.md"}');
    expect(calls.filter((c) => c.id === 'def')).toHaveLength(1);
    expect(lastBody.tool_choice).toBe('auto');
    expect(lastBody.parallel_tool_calls).toBe(true);
    expect(events[events.length - 1]).toEqual({ type: 'done', stopReason: 'tool_calls' });
  });

  it('maps tool turns to the OpenAI and Ollama message formats', () => {
    const messages = [
      { role: 'user' as const, content: 'Read a.md' },
      { role: 'assistant' as const, content: '', reasoning: 'I should read it', toolCalls: [{ id: 'call1', name: 'read_file', arguments: '{"path":"a.md"}' }] },
      { role: 'tool' as const, content: '# A', toolCallId: 'call1', toolName: 'read_file' },
    ];
    expect(toOpenAIMessages(messages, 'llamacpp')).toEqual([
      { role: 'user', content: 'Read a.md' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.md"}' } }], reasoning_content: 'I should read it' },
      { role: 'tool', tool_call_id: 'call1', content: '# A' },
    ]);
    expect((toOpenAIMessages(messages, 'lmstudio')[1] as Record<string, unknown>).reasoning_content).toBeUndefined();
    expect(toOllamaMessages(messages)).toEqual([
      { role: 'user', content: 'Read a.md' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call1', function: { name: 'read_file', arguments: { path: 'a.md' } } }], thinking: 'I should read it' },
      { role: 'tool', content: '# A', tool_name: 'read_file', tool_call_id: 'call1' },
    ]);
  });

  it('reads whole tool calls from the Ollama stream', async () => {
    const lines = [
      { message: { role: 'assistant', content: '', tool_calls: [{ id: 'call_x', function: { index: 0, name: 'list_dir', arguments: { path: '/' } } }] }, done: false },
      { message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', eval_count: 25, eval_duration: 250_000_000 },
    ];
    const events: StreamEvent[] = [];
    for await (const e of parseOllamaChatStream(streamOf(lines.map((l) => `${JSON.stringify(l)}\n`)))) events.push(e);
    expect(events[0]).toEqual({ type: 'tool_call', id: 'call_x', name: 'list_dir', argumentsDelta: '{"path":"/"}' });
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'stop' });
  });
});

describe('buildTaskHistory', () => {
  const user = (id: string, content: string): Message => ({ id, conversationId: 'c', parentId: null, role: 'user', content, attachments: [], status: 'complete', createdAt: 1 });
  const assistant = (id: string, parts: AgentPart[]): Message => ({ id, conversationId: 'c', parentId: 'u1', role: 'assistant', content: '', attachments: [], status: 'complete', parts, createdAt: 2 });
  const parts: AgentPart[] = [
    { type: 'text', round: 0, text: 'Let me look.' },
    { type: 'tool', id: 't1', round: 0, name: 'list_dir', argsText: '{}', args: {}, status: 'done', result: 'a.md' },
    { type: 'tool', id: 't2', round: 1, name: 'write_file', argsText: '', args: { path: 'b.md', content: 'x' }, status: 'denied', result: 'The user denied this action.' },
    { type: 'text', round: 2, text: 'Done.' },
  ];

  it('rebuilds native tool rounds', async () => {
    const history = await buildTaskHistory([user('u1', 'Tidy up'), assistant('a1', parts)], { protocol: 'native', vision: false, trimOldResults: false });
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant', 'tool', 'assistant']);
    expect(history[1].toolCalls).toEqual([{ id: 't1', name: 'list_dir', arguments: '{}' }]);
    expect(history[4]).toMatchObject({ role: 'tool', toolCallId: 't2', content: 'The user denied this action.' });
    expect(history[5].content).toBe('Done.');
  });

  it('rebuilds text-protocol rounds as tool_call blocks and tool_response turns', async () => {
    const history = await buildTaskHistory([user('u1', 'Tidy up'), assistant('a1', parts)], { protocol: 'text', vision: false, trimOldResults: false });
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
    expect(history[1].content).toContain('<tool_call>\n{"name":"list_dir","arguments":{}}');
    expect(history[2].content).toBe('<tool_response name="list_dir">\na.md\n</tool_response>');
  });

  it('replaces compacted work with its summary in front of the request', async () => {
    const compacted: AgentPart[] = [...parts.slice(0, 3), { type: 'compaction', round: 2, summary: 'Listed files; the user refused to create b.md.', compactedRounds: 2 }, parts[3]];
    const history = await buildTaskHistory([user('u0', 'Earlier request'), assistant('a0', [{ type: 'text', round: 0, text: 'Earlier answer' }]), user('u1', 'Tidy up'), assistant('a1', compacted)], {
      protocol: 'native',
      vision: false,
      trimOldResults: false,
    });
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(history[0].content).toContain('<context_summary>');
    expect(history[0].content).toContain('the user refused to create b.md');
    expect(history[0].content.endsWith('Tidy up')).toBe(true);
  });
});
