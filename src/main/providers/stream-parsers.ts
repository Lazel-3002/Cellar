/** Split a byte stream into text lines (handles \r\n and chunk boundaries). */
export async function* readLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        let line = buffer.slice(0, newline);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        buffer = buffer.slice(newline + 1);
        yield line;
        newline = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    if (buffer.length > 0) yield buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
  } finally {
    reader.releaseLock();
  }
}

/** Server-sent events: yields each event's joined `data:` payload. */
export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  let data: string[] = [];
  for await (const line of readLines(stream)) {
    if (line === '') {
      if (data.length) {
        yield data.join('\n');
        data = [];
      }
      continue;
    }
    if (line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
  }
  if (data.length) yield data.join('\n');
}

/** Newline-delimited JSON (Ollama). Invalid lines are skipped. */
export async function* parseNDJSON<T = unknown>(stream: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  for await (const line of readLines(stream)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      yield JSON.parse(trimmed) as T;
    } catch {
      // ignore malformed line
    }
  }
}

export type SplitPart = { type: 'text' | 'reasoning'; delta: string };

const OPEN = '<think>';
const CLOSE = '</think>';

function partialSuffix(text: string, tag: string): number {
  const max = Math.min(tag.length - 1, text.length);
  for (let len = max; len > 0; len--) {
    if (tag.startsWith(text.slice(text.length - len))) return len;
  }
  return 0;
}

/**
 * Separates inline <think>…</think> reasoning from answer text in a token stream.
 * With `assumeThinking`, output that arrives before any tag is held back briefly: models whose
 * chat template pre-opens the think block emit reasoning first and only a closing tag.
 */
export class ThinkTagSplitter {
  private inThink = false;
  private buffer = '';
  private undecided: boolean;
  private seenTag = false;

  constructor(assumeThinking = false, private readonly undecidedLimit = 600) {
    this.undecided = assumeThinking;
  }

  push(delta: string): SplitPart[] {
    this.buffer += delta;
    return this.drain(false);
  }

  flush(): SplitPart[] {
    return this.drain(true);
  }

  private drain(final: boolean): SplitPart[] {
    const out: SplitPart[] = [];
    const emit = (type: SplitPart['type'], text: string) => {
      if (!text) return;
      const last = out[out.length - 1];
      if (last && last.type === type) last.delta += text;
      else out.push({ type, delta: text });
    };

    if (this.undecided) {
      const closeAt = this.buffer.indexOf(CLOSE);
      const openAt = this.buffer.indexOf(OPEN);
      if (openAt !== -1 && (closeAt === -1 || openAt < closeAt)) {
        this.undecided = false;
      } else if (closeAt !== -1) {
        this.undecided = false;
        emit('reasoning', this.buffer.slice(0, closeAt));
        this.buffer = this.buffer.slice(closeAt + CLOSE.length).replace(/^\s+/, '');
        this.seenTag = true;
      } else if (final || this.buffer.length > this.undecidedLimit) {
        this.undecided = false;
      } else {
        return out;
      }
    }

    for (;;) {
      if (!this.inThink) {
        const at = this.buffer.indexOf(OPEN);
        if (at !== -1) {
          emit('text', this.buffer.slice(0, at));
          this.buffer = this.buffer.slice(at + OPEN.length);
          this.inThink = true;
          this.seenTag = true;
          continue;
        }
        const keep = final ? 0 : partialSuffix(this.buffer, OPEN);
        emit('text', this.buffer.slice(0, this.buffer.length - keep));
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        break;
      } else {
        const at = this.buffer.indexOf(CLOSE);
        if (at !== -1) {
          emit('reasoning', this.buffer.slice(0, at));
          this.buffer = this.buffer.slice(at + CLOSE.length).replace(/^\s+/, '');
          this.inThink = false;
          continue;
        }
        const keep = final ? 0 : partialSuffix(this.buffer, CLOSE);
        emit('reasoning', this.buffer.slice(0, this.buffer.length - keep));
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        break;
      }
    }
    return out;
  }

  get sawTags(): boolean {
    return this.seenTag;
  }
}
