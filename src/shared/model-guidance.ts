import type { ModelEntry } from './types/models';

/** Parameter count in billions from labels like "7.6B", "751.63M" or "35B-A3B". */
export function parseParamsBillions(label?: string): number | undefined {
  const m = label?.match(/(\d+(?:\.\d+)?)\s*([BM])/i);
  if (!m) return undefined;
  const value = Number(m[1]);
  return m[2].toUpperCase() === 'M' ? value / 1000 : value;
}

export interface CoworkGuidance {
  level: 'good' | 'caution' | 'poor';
  /** Short reasons, shown under the composer in Cowork mode. */
  notes: string[];
}

/** How well a model is likely to do at multi-step agent work. */
export function coworkGuidance(model: Pick<ModelEntry, 'capabilities' | 'paramsLabel' | 'sizeBytes' | 'contextLength' | 'loadedContextLength'>): CoworkGuidance {
  const notes: string[] = [];
  let level: CoworkGuidance['level'] = 'good';
  const params = parseParamsBillions(model.paramsLabel);
  const small = params !== undefined ? params < 3 : model.sizeBytes !== undefined && model.sizeBytes < 2 * 1024 ** 3;
  if (!model.capabilities.tools) {
    level = 'caution';
    notes.push('No native tool calling detected, so Cellar will describe tools in text. This works best with capable instruction-following models.');
  }
  if (small) {
    level = 'poor';
    notes.push('Small models often lose track of multi-step tasks. A 7B+ model with tool support works much better.');
  }
  const context = model.loadedContextLength ?? model.contextLength;
  if (context !== undefined && context < 8192) {
    if (level === 'good') level = 'caution';
    notes.push(`The ${context.toLocaleString('en-US')}-token context is tight for agent work; 16K or more is recommended.`);
  }
  return { level, notes };
}
