import { describe, expect, it } from 'vitest';
import { parseNDJSON, parseSSE, ThinkTagSplitter, type SplitPart } from '../../src/main/providers/stream-parsers';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

function joinParts(parts: SplitPart[]) {
  return {
    text: parts.filter((p) => p.type === 'text').map((p) => p.delta).join(''),
    reasoning: parts.filter((p) => p.type === 'reasoning').map((p) => p.delta).join(''),
  };
}

describe('parseSSE', () => {
  it('joins events split across chunk boundaries and CRLF line endings', async () => {
    const events = await collect(parseSSE(streamOf(['data: {"a"', ':1}\r\n\r\nda', 'ta: [DONE]\r\n\r\n'])));
    expect(events).toEqual(['{"a":1}', '[DONE]']);
  });

  it('ignores comments and other fields, and flushes a trailing event without a blank line', async () => {
    const events = await collect(parseSSE(streamOf([': keep-alive\n', 'event: message\n', 'data: one\n', 'data: two\n\n', 'data: last'])));
    expect(events).toEqual(['one\ntwo', 'last']);
  });
});

describe('parseNDJSON', () => {
  it('parses lines and skips malformed ones', async () => {
    const rows = await collect(parseNDJSON(streamOf(['{"x":1}\n{bad}\n', '{"x":', '2}\n'])));
    expect(rows).toEqual([{ x: 1 }, { x: 2 }]);
  });
});

describe('ThinkTagSplitter', () => {
  it('separates reasoning from text when tags are split across deltas', () => {
    const splitter = new ThinkTagSplitter();
    const parts = [...splitter.push('<thi'), ...splitter.push('nk>plan it'), ...splitter.push(' out</th'), ...splitter.push('ink>\n\nAnswer'), ...splitter.flush()];
    expect(joinParts(parts)).toEqual({ reasoning: 'plan it out', text: 'Answer' });
  });

  it('passes plain text through untouched', () => {
    const splitter = new ThinkTagSplitter();
    const parts = [...splitter.push('Hello <b>world</b> and a < b'), ...splitter.flush()];
    expect(joinParts(parts)).toEqual({ reasoning: '', text: 'Hello <b>world</b> and a < b' });
  });

  it('treats leading output as reasoning when only a closing tag arrives (pre-opened think block)', () => {
    const splitter = new ThinkTagSplitter(true);
    const parts = [...splitter.push('Let me think'), ...splitter.push(' carefully.</think>'), ...splitter.push('The answer is 4.'), ...splitter.flush()];
    expect(joinParts(parts)).toEqual({ reasoning: 'Let me think carefully.', text: 'The answer is 4.' });
  });

  it('stops holding back output once the undecided limit is exceeded', () => {
    const splitter = new ThinkTagSplitter(true, 10);
    const first = splitter.push('short');
    expect(first).toEqual([]);
    const parts = [...first, ...splitter.push(' but now longer than ten'), ...splitter.flush()];
    expect(joinParts(parts).text).toBe('short but now longer than ten');
  });
});
