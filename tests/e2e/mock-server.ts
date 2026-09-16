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
      res.end(JSON.stringify({ data: [{ id: 'mock-echo' }, { id: 'mock-thinker-r1' }, { id: 'mock-agent' }, { id: 'mock-coder' }, { id: 'mock-tools' }, { id: 'mock-designer' }, { id: 'mock-tutor' }] }));
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
        if (parsed.model === 'mock-coder' && parsed.tools?.length) {
          // Scripted Code agent: read app.js, fix the bug with an edit, then report.
          const results = parsed.messages.filter((m) => m.role === 'tool').map((m) => String(m.content));
          const toolCall = (index: number, id: string, name: string, args: string) => {
            send({ tool_calls: [{ index, id, type: 'function', function: { name, arguments: '' } }] });
            for (const piece of args.match(/.{1,16}/gs) ?? []) send({ tool_calls: [{ index, function: { arguments: piece } }] });
          };
          if (results.length === 0) {
            send({ content: 'Let me look at app.js.' });
            toolCall(0, 'read1', 'read_file', JSON.stringify({ path: 'app.js' }));
            send({}, 'tool_calls');
          } else if (results.length === 1) {
            toolCall(0, 'edit1', 'edit_file', JSON.stringify({ path: 'app.js', old_string: 'return a - b;', new_string: 'return a + b;' }));
            send({}, 'tool_calls');
          } else {
            send({ content: 'Fixed `add` in app.js: it subtracted instead of adding.' }, 'stop');
          }
          res.end('data: [DONE]\n\n');
          return;
        }
        if (parsed.model === 'mock-designer' && parsed.tools?.length) {
          // Scripted designer: theme + cover, then a chart slide; follow-ups recolor the selection.
          const lastUser = parsed.messages.map((m) => m.role).lastIndexOf('user');
          const results = parsed.messages.slice(lastUser).filter((m) => m.role === 'tool').map((m) => String(m.content));
          const system = String(parsed.messages[0]?.content ?? '');
          const toolCall = (index: number, id: string, name: string, args: string) => {
            send({ tool_calls: [{ index, id, type: 'function', function: { name, arguments: '' } }] });
            for (const piece of args.match(/.{1,24}/gs) ?? []) send({ tool_calls: [{ index, function: { arguments: piece } }] });
          };
          const selected = /The user has selected (\S+) on artboard/.exec(system)?.[1];
          if (selected && results.length === 0) {
            toolCall(0, 'e1', 'edit_elements', JSON.stringify({ update: [{ id: selected, color: '#D92D20' }] }));
            send({}, 'tool_calls');
          } else if (!selected && results.length === 0) {
            send({ content: 'Setting up your deck.' });
            toolCall(0, 't1', 'set_theme', JSON.stringify({ preset: 'ocean' }));
            toolCall(1, 'a1', 'create_artboard', JSON.stringify({ name: 'Cover', layout: 'title', content: { kicker: 'Pitch', title: 'Bean Club', subtitle: 'Coffee, delivered weekly' } }));
            send({}, 'tool_calls');
          } else if (!selected && results.length === 2) {
            toolCall(0, 'a2', 'create_artboard', JSON.stringify({ name: 'Growth', layout: 'chart', content: { title: 'Members per month', bullets: ['Doubling every quarter'], chart: { type: 'line', labels: ['Jan', 'Feb', 'Mar', 'Apr'], series: [{ name: 'Members', values: [120, 180, 260, 410] }] } } }));
            send({}, 'tool_calls');
          } else {
            send({ content: selected ? 'Recolored it.' : 'Made a two-slide deck.' }, 'stop');
          }
          res.end('data: [DONE]\n\n');
          return;
        }
        if (parsed.model === 'mock-tutor' && parsed.tools?.length) {
          // Scripted tutor: the rule, a figure and the worked steps, then a test; follow-ups act on the selected block.
          const lastUser = parsed.messages.map((m) => m.role).lastIndexOf('user');
          const results = parsed.messages.slice(lastUser).filter((m) => m.role === 'tool').map((m) => String(m.content));
          const system = String(parsed.messages[0]?.content ?? '');
          const toolCall = (index: number, id: string, name: string, args: string) => {
            send({ tool_calls: [{ index, id, type: 'function', function: { name, arguments: '' } }] });
            for (const piece of args.match(/.{1,24}/gs) ?? []) send({ tool_calls: [{ index, function: { arguments: piece } }] });
          };
          const selected = /The user has block (\S+) selected/.exec(system)?.[1];
          if (selected && results.length === 0) {
            toolCall(0, 'u1', 'update_block', JSON.stringify({ block: selected, note: 'Remember: the hypotenuse is always the longest side.' }));
            send({}, 'tool_calls');
          } else if (!selected && results.length === 0) {
            send({ content: 'Here is the rule first.' });
            toolCall(0, 's1', 'set_board', JSON.stringify({ topic: 'Right triangles', paper: 'grid' }));
            toolCall(1, 'b1', 'add_blocks', JSON.stringify({ blocks: [{ type: 'formula', title: 'Pythagorean theorem', formula: 'a^2 + b^2 = c^2', where: ['c: the hypotenuse'] }] }));
            send({}, 'tool_calls');
          } else if (!selected && results.length === 2) {
            toolCall(0, 'f1', 'draw_figure', JSON.stringify({ kind: 'right-triangle', labels: ['A', 'B', 'C'], sides: ['a', '√3', 2], rightAngleAt: 'B', caption: 'Find a' }));
            toolCall(1, 'v1', 'solve_steps', JSON.stringify({ sides: { b: '√3', c: 2 }, title: 'Find a' }));
            send({}, 'tool_calls');
          } else if (!selected && results.length === 4) {
            toolCall(0, 'q1', 'make_quiz', JSON.stringify({ topic: 'pythagoras', count: 3, seed: 'e2e' }));
            send({}, 'tool_calls');
          } else {
            send({ content: selected ? 'Added a reminder.' : 'That is the theorem, a worked example and three questions.' }, 'stop');
          }
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
        const lookup = parsed.tools?.map((t) => t.function.name).find((name) => name.endsWith('__lookup'));
        if (parsed.model === 'mock-tools' && lookup) {
          // Scripted chat with a connector: look the item up, then answer from the result.
          const result = [...parsed.messages].reverse().find((m) => m.role === 'tool');
          if (!result) {
            send({ content: 'Let me check the warehouse.' });
            send({ tool_calls: [{ index: 0, id: 'look1', type: 'function', function: { name: lookup, arguments: JSON.stringify({ item: 'bolts' }) } }] });
            send({}, 'tool_calls');
          } else {
            send({ content: `The warehouse says: ${String(result.content)}` }, 'stop');
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
