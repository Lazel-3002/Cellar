import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockRequest {
  model: string;
  messages: Array<{ role: string; content: unknown; tool_call_id?: string }>;
  tools?: Array<{ function: { name: string } }>;
}

export interface MockServer {
  url: string;
  requests: MockRequest[];
  close: () => Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function lastUserText(req: MockRequest): string {
  const last = [...req.messages].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  return (last.content as Array<{ type: string; text?: string }>).map((p) => p.text ?? '').join('');
}

/** Deterministic OpenAI-compatible server used by the end-to-end tests. */
export async function startMockServer(): Promise<MockServer> {
  const requests: MockRequest[] = [];
  const server: Server = createServer((req, res) => {
    if (req.url?.startsWith('/v1/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'mock-echo' }, { id: 'mock-thinker-r1' }, { id: 'mock-agent' }] }));
      return;
    }
    if (req.url?.startsWith('/v1/chat/completions')) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', async () => {
        const parsed = JSON.parse(body) as MockRequest & { max_tokens?: number };
        requests.push(parsed);
        const prompt = lastUserText(parsed);
        const isTitle = parsed.messages.some((m) => m.role === 'system' && String(m.content).includes('You name chat conversations'));
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const send = (delta: Record<string, unknown>, finish?: string) =>
          res.write(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish ?? null }] })}\n\n`);

        if (isTitle) {
          send({ content: 'Mock conversation title' }, 'stop');
          res.end('data: [DONE]\n\n');
          return;
        }
        if (parsed.model === 'mock-agent' && parsed.tools?.length) {
          // Scripted Cowork agent: plan + read, then write a report from what it read, then summarize.
          const results = parsed.messages.filter((m) => m.role === 'tool').map((m) => String(m.content));
          const toolCall = (index: number, id: string, name: string, args: string) => {
            send({ tool_calls: [{ index, id, type: 'function', function: { name, arguments: '' } }] });
            for (const piece of args.match(/.{1,16}/gs) ?? []) send({ tool_calls: [{ index, function: { arguments: piece } }] });
          };
          if (results.length === 0) {
            send({ content: "I'll read your notes first." });
            toolCall(0, 'plan1', 'todo_write', JSON.stringify({ todos: [{ content: 'Read notes', status: 'in_progress' }, { content: 'Write report', status: 'pending' }] }));
            toolCall(1, 'read1', 'read_file', JSON.stringify({ path: 'notes.md' }));
            send({}, 'tool_calls');
          } else if (results.length === 2) {
            toolCall(0, 'write1', 'write_file', JSON.stringify({ path: 'report.md', content: `# Report\n\n${results[1]}` }));
            send({}, 'tool_calls');
          } else {
            send({ content: results.at(-1)?.startsWith('The user denied') ? 'Okay, I left your folder unchanged.' : 'Done. I wrote report.md from your notes.' }, 'stop');
          }
          res.end('data: [DONE]\n\n');
          return;
        }
        if (parsed.model === 'mock-thinker-r1') {
          send({ reasoning_content: 'Let me think about this carefully.' });
          await sleep(50);
        }
        let reply = `Echo: ${prompt}`;
        if (/artifact/i.test(prompt)) {
          reply = 'Here is your page:\n\n```html artifact title="Mock page"\n<!doctype html><html><body><h1 id="hello">Hello from an artifact</h1></body></html>\n```\n\nEnjoy.';
        }
        const slow = /slow/i.test(prompt);
        const chunks = slow ? Array.from({ length: 400 }, (_, i) => `word${i} `) : reply.match(/.{1,12}/gs) ?? [reply];
        // Note: IncomingMessage emits 'close' once the body is read, so watch the response instead.
        let closed = false;
        res.on('close', () => (closed = true));
        for (const chunk of chunks) {
          if (closed || res.destroyed) return;
          send({ content: chunk });
          await sleep(slow ? 40 : 5);
        }
        send({}, 'stop');
        res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 42, completion_tokens: chunks.length } })}\n\n`);
        res.end('data: [DONE]\n\n');
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
