import type { StreamEvent, ThinkingLevel } from '@shared/types/chat';
import type { InferenceParams, ModelCapabilities, ModelEntry, ReasoningStyle } from '@shared/types/models';
import { fetchWithTimeout } from '../lib/util';
import { parseSSE, ThinkTagSplitter } from './stream-parsers';
import { ProviderHttpError, readErrorBody, type ProviderMessage, type ToolSchema, trimBaseUrl } from './types';

export type OpenAIFlavor = 'llamacpp' | 'lmstudio' | 'unsloth' | 'generic';

export function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

export function toOpenAIMessages(messages: ProviderMessage[], flavor: OpenAIFlavor = 'generic'): unknown[] {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })),
        // llama.cpp hands this to templates that keep thinking between tool calls (Qwen3, gpt-oss).
        ...(flavor === 'llamacpp' && m.reasoning ? { reasoning_content: m.reasoning } : {}),
      };
    }
    if (m.role !== 'user' || !m.images?.length) return { role: m.role, content: m.content };
    return {
      role: m.role,
      content: [
        ...m.images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.base64}` } })),
        { type: 'text', text: m.content },
      ],
    };
  });
}

export function toolsBody(tools: ToolSchema[] | undefined, flavor: OpenAIFlavor): Record<string, unknown> {
  if (!tools?.length) return {};
  return {
    tools: tools.map((t) => ({ type: 'function', function: t })),
    tool_choice: 'auto',
    // llama-server only parses one call per turn unless asked for more.
    ...(flavor === 'llamacpp' ? { parallel_tool_calls: true } : {}),
  };
}

export function samplingBody(p: InferenceParams, flavor: OpenAIFlavor): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)) body[key] = value;
  };
  set('temperature', p.temperature);
  set('top_p', p.topP);
  set('max_tokens', p.maxTokens);
  set('stop', p.stop);
  set('seed', p.seed);
  set('presence_penalty', p.presencePenalty);
  set('frequency_penalty', p.frequencyPenalty);
  if (flavor === 'llamacpp' || flavor === 'lmstudio' || flavor === 'unsloth') {
    set('top_k', p.topK);
    set('min_p', p.minP);
    set('repeat_penalty', p.repeatPenalty);
  }
  if (flavor === 'llamacpp') {
    set('dry_multiplier', p.dryMultiplier);
    set('xtc_probability', p.xtcProbability);
    set('xtc_threshold', p.xtcThreshold);
  }
  if (p.jsonSchema.trim()) {
    try {
      const schema = JSON.parse(p.jsonSchema);
      body.response_format = { type: 'json_schema', json_schema: { name: 'response', strict: true, schema } };
    } catch {
      // invalid schema is ignored; the settings UI validates it
    }
  }
  return body;
}

/** Map Cellar's thinking level onto the knobs a chat template understands. */
export function thinkingBody(style: ReasoningStyle, level: ThinkingLevel, flavor: OpenAIFlavor): Record<string, unknown> {
  if (style === 'toggle') {
    return { chat_template_kwargs: { enable_thinking: level !== 'off' } };
  }
  if (style === 'effort') {
    const effort = level === 'off' ? 'low' : level === 'on' ? 'medium' : level;
    return flavor === 'llamacpp' || flavor === 'unsloth'
      ? { reasoning_effort: effort, chat_template_kwargs: { reasoning_effort: effort } }
      : { reasoning_effort: effort };
  }
  return {};
}

export interface StreamChatOptions {
  baseUrl: string;
  apiKey?: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
  reasoningStyle: ReasoningStyle;
  extraHeaders?: Record<string, string>;
}

interface ChatChunk {
  error?: { message?: string } | string;
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      thinking?: string | null;
      tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  timings?: { prompt_n?: number; predicted_n?: number; predicted_per_second?: number; prompt_ms?: number; cache_n?: number };
}

export async function* streamChatCompletion(opts: StreamChatOptions): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${trimBaseUrl(opts.baseUrl)}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...authHeaders(opts.apiKey), ...opts.extraHeaders },
    body: JSON.stringify({ ...opts.body, stream: true, stream_options: { include_usage: true } }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new ProviderHttpError(res.status, await readErrorBody(res));

  const splitter = new ThinkTagSplitter(opts.reasoningStyle === 'always');
  let serverSeparatesReasoning = false;
  let finishReason: string | undefined;
  const toolNames = new Map<string, string>();
  // Streamed calls send their id once; later argument chunks only carry the index.
  const idByIndex = new Map<number, string>();

  for await (const data of parseSSE(res.body)) {
    if (data === '[DONE]') break;
    let chunk: ChatChunk;
    try {
      chunk = JSON.parse(data) as ChatChunk;
    } catch {
      continue;
    }
    if (chunk.error) {
      throw new Error(typeof chunk.error === 'string' ? chunk.error : chunk.error.message ?? 'Provider error');
    }
    const choice = chunk.choices?.[0];
    const delta = choice?.delta;
    if (delta) {
      const reasoning = delta.reasoning_content ?? delta.reasoning ?? delta.thinking;
      if (typeof reasoning === 'string' && reasoning.length > 0) {
        serverSeparatesReasoning = true;
        yield { type: 'reasoning', delta: reasoning };
      }
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        if (serverSeparatesReasoning) yield { type: 'text', delta: delta.content };
        else for (const part of splitter.push(delta.content)) yield part;
      }
      for (const call of delta.tool_calls ?? []) {
        const index = call.index ?? 0;
        const id = call.id || idByIndex.get(index) || `call_${index}`;
        if (!idByIndex.has(index)) idByIndex.set(index, id);
        if (call.function?.name) toolNames.set(id, call.function.name);
        yield { type: 'tool_call', id, name: toolNames.get(id) ?? '', argumentsDelta: call.function?.arguments ?? '' };
      }
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (chunk.usage) {
      yield { type: 'usage', promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens };
    }
    if (chunk.timings) {
      yield {
        type: 'stats',
        stats: {
          promptTokens: chunk.timings.prompt_n !== undefined ? chunk.timings.prompt_n + (chunk.timings.cache_n ?? 0) : undefined,
          completionTokens: chunk.timings.predicted_n,
          tokensPerSecond: chunk.timings.predicted_per_second,
        },
      };
    }
  }
  for (const part of splitter.flush()) yield part;
  yield { type: 'done', stopReason: finishReason ?? undefined };
}

export interface OpenAIModelList {
  data?: Array<{ id: string; owned_by?: string; meta?: Record<string, unknown>; max_model_len?: number; context_length?: number }>;
}

export async function fetchOpenAIModels(baseUrl: string, apiKey?: string, timeoutMs = 2500): Promise<OpenAIModelList> {
  const res = await fetchWithTimeout(`${trimBaseUrl(baseUrl)}/v1/models`, { headers: authHeaders(apiKey), timeoutMs });
  if (!res.ok) throw new ProviderHttpError(res.status, await readErrorBody(res));
  return (await res.json()) as OpenAIModelList;
}

/** Best-effort capability guess for servers that only expose model ids. */
export function guessCapabilitiesFromName(id: string): { capabilities: ModelCapabilities; reasoningStyle: ReasoningStyle } {
  const n = id.toLowerCase();
  const embedding = /embed|bge|e5-|nomic-embed|gte-|minilm/.test(n);
  const vision = /vl\b|vl-|vision|llava|gemma-?3|gemma-?4|pixtral|minicpm-v|moondream|qwen2\.5-omni|qwen3-vl|mmproj/.test(n);
  let reasoningStyle: ReasoningStyle = 'none';
  if (/gpt-oss/.test(n)) reasoningStyle = 'effort';
  else if (/qwen3|qwen-3|hunyuan|glm-4\.5|glm-4\.6|smollm3/.test(n) && !/instruct-2507|thinking-2507/.test(n)) reasoningStyle = 'toggle';
  else if (/r1|thinking|qwq|magistral|phi-4-reasoning|reasoning/.test(n)) reasoningStyle = 'always';
  return {
    capabilities: { vision, tools: !embedding, reasoning: reasoningStyle !== 'none', embedding },
    reasoningStyle,
  };
}

export function baseEntry(partial: Omit<ModelEntry, 'capabilities' | 'reasoningStyle' | 'loaded'> & Partial<ModelEntry>): ModelEntry {
  return {
    capabilities: { vision: false, tools: false, reasoning: false, embedding: false },
    reasoningStyle: 'none',
    loaded: false,
    ...partial,
  };
}
