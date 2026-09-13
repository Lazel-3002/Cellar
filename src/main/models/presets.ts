import {
  DEFAULT_INFERENCE_PARAMS,
  DEFAULT_LOAD_CONFIG,
  modelKey,
  type InferenceParams,
  type LoadConfig,
  type ModelPreset,
  type ModelRef,
} from '@shared/types/models';
import { get, run } from '../db/client';
import { safeJsonParse } from '../lib/util';
import { settings } from '../services/settings';

export function defaultPreset(trainedContext?: number): ModelPreset {
  const preferred = settings.get().defaultContextLength;
  const contextLength = trainedContext ? Math.min(preferred, trainedContext) : preferred;
  return {
    load: { ...DEFAULT_LOAD_CONFIG, contextLength },
    inference: { ...DEFAULT_INFERENCE_PARAMS, stop: [] },
  };
}

export function getPreset(ref: ModelRef, trainedContext?: number): ModelPreset {
  const base = defaultPreset(trainedContext);
  const row = get<{ load_config: string | null; inference: string | null }>('SELECT load_config, inference FROM model_presets WHERE model_key = ?', modelKey(ref));
  if (!row) return base;
  return {
    load: { ...base.load, ...safeJsonParse<Partial<LoadConfig>>(row.load_config, {}) },
    inference: { ...base.inference, ...safeJsonParse<Partial<InferenceParams>>(row.inference, {}) },
  };
}

export function savePreset(ref: ModelRef, preset: ModelPreset): ModelPreset {
  run(
    `INSERT INTO model_presets (model_key, load_config, inference, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(model_key) DO UPDATE SET load_config = excluded.load_config, inference = excluded.inference, updated_at = excluded.updated_at`,
    modelKey(ref),
    JSON.stringify(preset.load),
    JSON.stringify(preset.inference),
    Date.now(),
  );
  return preset;
}

export function resetPreset(ref: ModelRef, trainedContext?: number): ModelPreset {
  run('DELETE FROM model_presets WHERE model_key = ?', modelKey(ref));
  return defaultPreset(trainedContext);
}
