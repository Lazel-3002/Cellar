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

/**
 * A reply exercising all three inline visualization blocks. Everything is self-contained, so the
 * test never depends on a CDN; `viz cdn` swaps in a real Chart.js fragment for manual checks.
 */
const VIZ_REPLY = [
  "Here's how your weeks have gone:",
  '',
  '```chart',
  JSON.stringify({
    type: 'bar',
    stacked: true,
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    series: [
      { name: 'Chess engine', values: [5, 3, 7, 4] },
      { name: 'Roblox games', values: [8, 10, 6, 9] },
      { name: 'Other', values: [2, 3, 1, 4] },
    ],
  }),
  '```',
  '',
  'And this is what minimax search looks like under the hood:',
  '',
  '```svg viz',
  '<svg viewBox="0 0 680 230" xmlns="http://www.w3.org/2000/svg"><title>Minimax search tree</title>',
  '<line x1="340" y1="48" x2="170" y2="104" stroke="#898781" stroke-width="1.5"/>',
  '<line x1="340" y1="48" x2="340" y2="104" stroke="#898781" stroke-width="1.5"/>',
  '<line x1="340" y1="48" x2="510" y2="104" stroke="#898781" stroke-width="1.5"/>',
  '<rect x="280" y="20" width="120" height="30" rx="6" fill="#5b4bd6"/>',
  '<text x="340" y="40" text-anchor="middle" font-size="13" fill="#ffffff">You (max)</text>',
  '<rect x="110" y="104" width="120" height="30" rx="6" fill="#0f7a5a"/>',
  '<rect x="280" y="104" width="120" height="30" rx="6" fill="#0f7a5a"/>',
  '<rect x="450" y="104" width="120" height="30" rx="6" fill="#0f7a5a"/>',
  '<text x="170" y="124" text-anchor="middle" font-size="13" fill="#ffffff">Opponent</text>',
  '<text x="340" y="124" text-anchor="middle" font-size="13" fill="#ffffff">Opponent</text>',
  '<text x="510" y="124" text-anchor="middle" font-size="13" fill="#ffffff">Opponent</text>',
  '<text x="340" y="190" text-anchor="middle" font-size="12" fill="currentColor">Each side picks the branch best for itself</text>',
  '</svg>',
  '```',
  '',
  'Drag the sliders to see compounding:',
  '',
  '```html viz',
  '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">',
  '<label style="font-size:13px;color:var(--text-secondary);min-width:60px">Years</label>',
  '<input id="years" type="range" min="1" max="30" value="10" style="flex:1">',
  '<span id="years-out" style="min-width:24px;font-weight:500">10</span></div>',
  '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px">',
  '<span style="font-size:13px;color:var(--text-secondary)">$1,000 grows to</span>',
  '<span id="out" style="font-size:22px;font-weight:600">$1,967</span></div>',
  '<div style="height:180px"><canvas id="c" style="width:100%;height:180px"></canvas></div>',
  '<script>',
  'var el=document.getElementById("years"),out=document.getElementById("out"),yo=document.getElementById("years-out");',
  'var cv=document.getElementById("c"),ctx=cv.getContext("2d");',
  'function draw(){var n=+el.value,pts=[],i;for(i=0;i<=n;i++)pts.push(1000*Math.pow(1.07,i));',
  'yo.textContent=n;out.textContent="$"+Math.round(pts[n]).toLocaleString("en-US");',
  'var w=cv.clientWidth,h=180,dpr=devicePixelRatio||1;cv.width=w*dpr;cv.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);',
  'ctx.clearRect(0,0,w,h);var max=pts[n];ctx.beginPath();',
  'for(i=0;i<=n;i++){var x=(i/n)*(w-4)+2,y=h-4-(pts[i]/max)*(h-16);i?ctx.lineTo(x,y):ctx.moveTo(x,y)}',
  'ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue("--chart-1").trim()||"#2a78d6";',
  'ctx.lineWidth=2;ctx.stroke()}',
  'el.addEventListener("input",draw);draw();',
  '</script>',
  '```',
  '',
  'Same trick works for any "what if I change X" question.',
].join('\n');

const VIZ_CDN_REPLY = [
  "A pie chart, drawn by Chart.js from the CDN:",
  '',
  '```html viz',
  '<div style="position:relative;width:100%;height:260px"><canvas id="pie1"></canvas></div>',
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>',
  '<script>new Chart(document.getElementById("pie1"),{type:"pie",data:{labels:["Coding","Gaming","Sleep","Other"],',
  'datasets:[{data:[40,25,20,15]}]},options:{responsive:true,maintainAspectRatio:false}});</script>',
  '```',
  '',
  'That is Chart.js with no options beyond the data.',
].join('\n');

function lastUserText(req: MockRequest): string {
  const last = [...req.messages].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  return (last.content as Array<{ type: string; text?: string }>).map((p) => p.text ?? '').join('');
}

/** A real web page for the built-in browser to open, served from this same server. */
const BROWSER_PAGE = `<!doctype html><html><head><title>Cellar test page</title></head><body>
<h1>Opening hours</h1>
<p id="hours">The shop is open from 09:00 to 18:00 on weekdays.</p>
<form><input id="q" name="q" type="text" placeholder="Search"></form>
<button id="more" onclick="document.getElementById('hours').textContent='Weekends: 10:00 to 16:00.'">Show weekends</button>
</body></html>`;

/** Deterministic OpenAI-compatible server used by the end-to-end tests. */
export async function startMockServer(): Promise<MockServer> {
  const requests: MockRequest[] = [];
  const server: Server = createServer((req, res) => {
    if (req.url?.startsWith('/page')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(BROWSER_PAGE);
      return;
    }
    if (req.url?.startsWith('/v1/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'mock-echo' }, { id: 'mock-thinker-r1' }, { id: 'mock-agent' }, { id: 'mock-coder' }, { id: 'mock-tools' }, { id: 'mock-designer' }, { id: 'mock-tutor' }, { id: 'mock-browser' }] }));
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
        // /update-memory (and the automatic pass): reply with the extraction JSON it asks for, and
        // with nothing to keep unless the transcript actually holds something durable.
        if (parsed.messages.some((m) => m.role === 'system' && String(m.content).includes('You maintain a private memory profile'))) {
          const keep = /sourdough/i.test(prompt);
          send({ content: keep ? '{"upsert": [{"category": "topic", "title": "Baking", "content": "Bakes sourdough bread at the weekend."}], "remove": []}' : '{"upsert": [], "remove": []}' }, 'stop');
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
            toolCall(2, 'd1', 'draw_diagram', JSON.stringify({ preset: 'trig-circle', angle: 135, show: ['tan'] }));
            send({}, 'tool_calls');
          } else if (!selected && results.length === 5) {
            toolCall(0, 'q1', 'make_quiz', JSON.stringify({ topic: 'pythagoras', count: 3, seed: 'e2e' }));
            send({}, 'tool_calls');
          } else {
            send({ content: selected ? 'Added a reminder.' : 'That is the theorem, a worked example and three questions.' }, 'stop');
          }
          res.end('data: [DONE]\n\n');
          return;
        }
        if (parsed.model === 'mock-browser' && parsed.tools?.length) {
          // Scripted browsing: open the page, read it, click the button, read the change, answer.
          const results = parsed.messages.filter((m) => m.role === 'tool').map((m) => String(m.content));
          const toolCall = (index: number, id: string, name: string, args: string) => {
            send({ tool_calls: [{ index, id, type: 'function', function: { name, arguments: '' } }] });
            for (const piece of args.match(/.{1,16}/gs) ?? []) send({ tool_calls: [{ index, function: { arguments: piece } }] });
          };
          const url = /https?:\/\/[^\s"]+\/page/.exec(lastUserText(parsed))?.[0] ?? '';
          if (results.length === 0) {
            send({ content: 'Let me open that page.' });
            toolCall(0, 'open1', 'browse_open', JSON.stringify({ url }));
            send({}, 'tool_calls');
          } else if (results.length === 1) {
            toolCall(0, 'read1', 'browse_read', JSON.stringify({}));
            send({}, 'tool_calls');
          } else if (results.length === 2) {
            toolCall(0, 'click1', 'browse_click', JSON.stringify({ selector: '#more' }));
            send({}, 'tool_calls');
          } else if (results.length === 3) {
            toolCall(0, 'read2', 'browse_read', JSON.stringify({}));
            send({}, 'tool_calls');
          } else {
            send({ content: `The page says: ${/Weekends: [^\n]+/.exec(results.at(-1) ?? '')?.[0] ?? 'nothing about weekends'}` }, 'stop');
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
        // A model that will not let go of one tool. The agent loop pauses it after four identical
        // calls, which is the state the Playground's Continue button recovers from.
        if (/loop forever/i.test(prompt) && parsed.tools?.some((t) => t.function.name === 'calculate')) {
          send({ tool_calls: [{ index: 0, id: `calc${requests.length}`, type: 'function', function: { name: 'calculate', arguments: JSON.stringify({ expressions: '1+1' }) } }] });
          send({}, 'tool_calls');
          res.end('data: [DONE]\n\n');
          return;
        }
        if (parsed.model === 'mock-thinker-r1') {
          send({ reasoning_content: 'Let me think about this carefully.' });
          await sleep(50);
        }
        let reply = `Echo: ${prompt}`;
        // A prompt that is itself a fenced block comes back verbatim, so a test can feed the
        // renderer any exact markup (checked first: such a block usually contains the keywords below).
        if (/^\s*(```|~~~)/.test(prompt)) {
          reply = prompt.trim();
        } else if (/\bviz cdn\b/i.test(prompt)) {
          reply = VIZ_CDN_REPLY;
        } else if (/\bviz\b/i.test(prompt)) {
          reply = VIZ_REPLY;
        } else if (/artifact/i.test(prompt)) {
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
