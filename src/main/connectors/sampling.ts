/**
 * MCP sampling: a connected server asks Cellar to run a completion on the user's own model
 * ("sampling/createMessage"), instead of calling out to its own LLM. Runs a single, non-streaming
 * turn on the app's default chat model and hands the text back.
 */
import type { CreateMessageRequest, CreateMessageResult } from '@modelcontextprotocol/sdk/types.js';
import { getPreset } from '../models/presets';
import type { ProviderMessage } from '../providers/types';
import { providers } from '../providers/registry';
import { settings } from '../services/settings';

const SAMPLING_TIMEOUT_MS = 120_000;

function blockText(block: unknown): string {
  if (!block || typeof block !== 'object') return '';
  const b = block as Record<string, unknown>;
  if (b.type === 'text') return String(b.text ?? '');
  if (b.type === 'image' || b.type === 'audio') return `[${b.type} content omitted: Cellar's MCP sampling only reads text]`;
  return '';
}

function messageContent(content: unknown): string {
  return Array.isArray(content) ? content.map(blockText).join('\n') : blockText(content);
}

/** Answers a server's sampling/createMessage request using the app's default model. */
export async function handleSampling(params: CreateMessageRequest['params']): Promise<CreateMessageResult> {
  if (params.tools?.length) throw new Error('This MCP server asked for tool-augmented sampling, which Cellar does not support yet. Plain text sampling only.');
  const ref = settings.get().defaultModel;
  if (!ref) throw new Error('No default model is set in Cellar. Pick one in Settings → Models so connectors can use sampling.');
  const entry = await providers.findModel(ref);
  if (!entry) throw new Error('The default model is not available right now (check that its app is running).');

  const preset = getPreset(entry.ref, entry.contextLength);
  const messages: ProviderMessage[] = [];
  if (params.systemPrompt?.trim()) messages.push({ role: 'system', content: params.systemPrompt });
  for (const m of params.messages) messages.push({ role: m.role, content: messageContent(m.content) });
  if (messages.every((m) => m.role === 'system')) throw new Error('The sampling request had no messages.');

  const provider = providers.get(entry.ref.providerId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Sampling request timed out.')), SAMPLING_TIMEOUT_MS);
  let text = '';
  let stopReason: string | undefined;
  try {
    for await (const event of provider.chat({
      entry,
      messages,
      params: { ...preset.inference, maxTokens: params.maxTokens, temperature: params.temperature ?? preset.inference.temperature, stop: params.stopSequences ?? preset.inference.stop },
      thinking: 'off',
      load: preset.load,
      signal: controller.signal,
      onStatus: () => undefined,
    })) {
      if (event.type === 'text') text += event.delta;
      else if (event.type === 'error') throw new Error(event.message);
      else if (event.type === 'done') stopReason = event.stopReason;
    }
  } finally {
    clearTimeout(timer);
  }
  if (!text.trim()) throw new Error('The model returned an empty response.');
  return { role: 'assistant', content: { type: 'text', text }, model: entry.displayName, stopReason: stopReason === 'length' ? 'maxTokens' : 'endTurn' };
}
