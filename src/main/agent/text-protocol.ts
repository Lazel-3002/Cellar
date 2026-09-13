import type { ToolSchema } from '../providers/types';

/**
 * Tool calling for models without native support (and a safety net for servers that leave a
 * model's <tool_call> blocks in the text): calls are written as
 *   <tool_call>{"name": "...", "arguments": {...}}</tool_call>
 * and results come back as <tool_response> blocks in a user turn.
 */

const OPEN = '<tool_call>';
const CLOSE = '</tool_call>';

export const TEXT_PROTOCOL_STOPS = [CLOSE, '<tool_response'];

function partialSuffix(text: string, tag: string): number {
  const max = Math.min(tag.length - 1, text.length);
  for (let len = max; len > 0; len--) {
    if (tag.startsWith(text.slice(text.length - len))) return len;
  }
  return 0;
}

export type CallSplitPart = { type: 'text'; delta: string } | { type: 'call'; raw: string };

/** Hides <tool_call> blocks from streamed text and hands back their contents. */
export class ToolCallTagSplitter {
  private buffer = '';
  private inCall = false;

  push(delta: string): CallSplitPart[] {
    this.buffer += delta;
    return this.drain(false);
  }

  flush(): CallSplitPart[] {
    return this.drain(true);
  }

  private drain(final: boolean): CallSplitPart[] {
    const out: CallSplitPart[] = [];
    for (;;) {
      if (!this.inCall) {
        const at = this.buffer.indexOf(OPEN);
        if (at !== -1) {
          if (at > 0) out.push({ type: 'text', delta: this.buffer.slice(0, at) });
          this.buffer = this.buffer.slice(at + OPEN.length);
          this.inCall = true;
          continue;
        }
        const keep = final ? 0 : partialSuffix(this.buffer, OPEN);
        const text = this.buffer.slice(0, this.buffer.length - keep);
        if (text) out.push({ type: 'text', delta: text });
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        return out;
      }
      const at = this.buffer.indexOf(CLOSE);
      if (at !== -1) {
        out.push({ type: 'call', raw: this.buffer.slice(0, at) });
        this.buffer = this.buffer.slice(at + CLOSE.length);
        this.inCall = false;
        continue;
      }
      if (final) {
        // A stop sequence ended the stream right before </tool_call>.
        if (this.buffer.trim()) out.push({ type: 'call', raw: this.buffer });
        this.buffer = '';
        this.inCall = false;
      }
      return out;
    }
  }
}

/** Escape raw control characters inside JSON strings (models often put real newlines in file contents). */
function escapeControlCharsInStrings(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        out += ch;
      } else if (ch === '\\') {
        escaped = true;
        out += ch;
      } else if (ch === '"') {
        inString = false;
        out += ch;
      } else if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else if (ch.charCodeAt(0) < 0x20) out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
      else out += ch;
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
}

/** JSON.parse that tolerates code fences, surrounding prose, raw newlines in strings and trailing commas. */
export function parseLooseJson(text: string): unknown {
  const attempts: string[] = [];
  const trimmed = text.trim();
  attempts.push(trimmed);
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const first = unfenced.indexOf('{');
  const last = unfenced.lastIndexOf('}');
  const core = first !== -1 && last > first ? unfenced.slice(first, last + 1) : unfenced;
  attempts.push(core);
  const repaired = escapeControlCharsInStrings(core).replace(/,\s*([}\]])/g, '$1');
  attempts.push(repaired);
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Invalid JSON');
}

export interface ParsedTextCall {
  name: string;
  arguments: Record<string, unknown>;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** Accepts the common shapes models use inside a tool call block. */
export function parseTextToolCall(raw: string): ParsedTextCall | null {
  let parsed: unknown;
  try {
    parsed = parseLooseJson(raw);
  } catch {
    return null;
  }
  let obj = asObject(parsed);
  if (!obj) return null;
  const fn = asObject(obj.function);
  if (fn) obj = { ...fn, ...obj, name: fn.name ?? obj.name };
  const name = typeof obj.name === 'string' ? obj.name : typeof obj.tool === 'string' ? obj.tool : null;
  if (!name) return null;
  let args: unknown = obj.arguments ?? obj.parameters ?? obj.args ?? obj.input ?? {};
  if (typeof args === 'string') {
    try {
      args = parseLooseJson(args);
    } catch {
      return null;
    }
  }
  return { name, arguments: asObject(args) ?? {} };
}

export function renderTextToolCall(name: string, args: unknown): string {
  return `${OPEN}\n${JSON.stringify({ name, arguments: args ?? {} })}\n${CLOSE}`;
}

export function renderToolResponse(name: string, result: string): string {
  return `<tool_response name="${name}">\n${result}\n</tool_response>`;
}

function describeType(schema: Record<string, unknown>): string {
  if (Array.isArray(schema.enum)) return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  const type = schema.type;
  if (type === 'array') {
    const items = asObject(schema.items);
    return `${items ? describeType(items) : 'any'}[]`;
  }
  if (type === 'object') {
    const props = asObject(schema.properties);
    if (!props) return 'object';
    const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
    return `{ ${Object.entries(props)
      .map(([key, value]) => `${key}${required.has(key) ? '' : '?'}: ${describeType(asObject(value) ?? {})}`)
      .join(', ')} }`;
  }
  return typeof type === 'string' ? type : 'any';
}

export function textProtocolInstructions(tools: ToolSchema[]): string {
  const lines = tools.map((tool) => {
    const params = asObject(tool.parameters) ?? {};
    const signature = describeType({ ...params, type: 'object' }).replace(/^\{ | \}$/g, '');
    return `- ${tool.name}(${signature === 'object' ? '' : signature}): ${tool.description}`;
  });
  return [
    '# Tools',
    'You can call tools. To call one, reply with exactly one block in this format and then stop writing:',
    `${OPEN}\n{"name": "tool_name", "arguments": {"argument": "value"}}\n${CLOSE}`,
    'The result comes back in a <tool_response> block. Call one tool at a time and never write a <tool_response> yourself. When the task is complete, answer normally without a tool call.',
    '',
    'Available tools:',
    ...lines,
  ].join('\n');
}
