import { stat } from 'node:fs/promises';
import type { LoadConfig, LoadedModelInfo, MemoryEstimate, ModelDetail, ModelEntry, ModelPreset, ModelRef } from '@shared/types/models';
import { localModels } from '../models/local-index';
import { estimateMemory } from '../models/memory-estimate';
import { getPreset, resetPreset, savePreset } from '../models/presets';
import { providers } from '../providers/registry';
import { detectHardware, vramBudgetBytes } from '../system/hardware';
import { settings } from './settings';

async function requireModel(ref: ModelRef): Promise<ModelEntry> {
  const entry = await providers.findModel(ref);
  if (!entry) throw new Error('Model not found. It may have been removed or its app is not running.');
  return entry;
}

export async function listModels(refresh = false): Promise<ModelEntry[]> {
  return providers.listModels(refresh);
}

export async function rescanModels(): Promise<ModelEntry[]> {
  await localModels.scan();
  return providers.listModels(true);
}

export async function modelDetail(ref: ModelRef): Promise<ModelDetail> {
  const entry = await requireModel(ref);
  const local = ref.providerId === providers.llamacpp.id ? localModels.get(ref.modelId) : undefined;
  const provider = providers.get(ref.providerId);
  const loaded = (await provider.loadedModels?.().catch(() => []))?.find((m) => m.ref.modelId === ref.modelId);
  return {
    entry,
    gguf: local?.gguf,
    preset: getPreset(ref, entry.contextLength),
    loaded,
    shards: local?.shards,
  };
}

export async function estimateLoad(ref: ModelRef, config: LoadConfig): Promise<MemoryEstimate | null> {
  if (ref.providerId !== providers.llamacpp.id) return null;
  const local = localModels.get(ref.modelId);
  if (!local?.gguf) return null;
  const hw = await detectHardware();
  const mmprojBytes = local.mmprojPath ? await stat(local.mmprojPath).then((s) => s.size).catch(() => 0) : 0;
  const contextLength =
    typeof config.contextLength === 'number' ? config.contextLength : Math.min(local.gguf.contextLength ?? 4096, settings.get().defaultContextLength);
  return estimateMemory(
    { summary: local.gguf, fileBytes: local.sizeBytes, mmprojBytes, config, contextLength },
    { vramBytes: vramBudgetBytes(hw), ramBytes: hw.ramTotalBytes * 0.8 },
  );
}

export async function loadModel(ref: ModelRef, config?: LoadConfig): Promise<LoadedModelInfo> {
  const entry = await requireModel(ref);
  const provider = providers.get(ref.providerId);
  if (!provider.load) throw new Error(`${provider.name} loads models on its own; Cellar cannot load them remotely.`);
  const info = await provider.load(entry, config ?? getPreset(ref, entry.contextLength).load);
  await providers.listModels(true);
  return info;
}

export async function unloadModel(ref: ModelRef): Promise<void> {
  const entry = await requireModel(ref);
  const provider = providers.get(ref.providerId);
  if (!provider.unload) throw new Error(`${provider.name} does not support unloading from Cellar.`);
  await provider.unload(entry);
  await providers.listModels(true);
}

export async function loadedModels(): Promise<LoadedModelInfo[]> {
  const lists = await Promise.all(providers.all().map((p) => p.loadedModels?.().catch(() => []) ?? Promise.resolve([])));
  return lists.flat();
}

export async function saveModelPreset(ref: ModelRef, preset: ModelPreset): Promise<ModelPreset> {
  return savePreset(ref, preset);
}

export async function resetModelPreset(ref: ModelRef): Promise<ModelPreset> {
  const entry = await providers.findModel(ref);
  return resetPreset(ref, entry?.contextLength);
}

export async function deleteModel(ref: ModelRef): Promise<void> {
  const entry = await requireModel(ref);
  const provider = providers.get(ref.providerId);
  if (!provider.deleteModel) throw new Error(`Delete this model from ${provider.name} directly.`);
  await provider.deleteModel(entry);
  await providers.listModels(true);
}

export function modelLogs(ref: ModelRef): string[] {
  if (ref.providerId !== providers.llamacpp.id) return [];
  return providers.llamacpp.logs(ref.modelId);
}
