import type { ProviderConfig, ProviderConfigInput, ProviderKind } from '@shared/types/providers';
import { newId } from '../lib/util';
import { openSecret, sealSecret } from '../lib/secrets';
import { all, get, run } from './client';

export interface StoredProviderConfig {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  builtin: boolean;
}

interface Row {
  id: string;
  kind: ProviderKind;
  name: string;
  base_url: string;
  api_key: string | null;
  enabled: number;
  builtin: number;
}

const BUILTINS: Array<Pick<StoredProviderConfig, 'id' | 'kind' | 'name' | 'baseUrl'>> = [
  { id: 'ollama', kind: 'ollama', name: 'Ollama', baseUrl: 'http://127.0.0.1:11434' },
  { id: 'lmstudio', kind: 'lmstudio', name: 'LM Studio', baseUrl: 'http://127.0.0.1:1234' },
  { id: 'unsloth', kind: 'unsloth', name: 'Unsloth Studio', baseUrl: 'http://127.0.0.1:8888' },
];

const toStored = (r: Row): StoredProviderConfig => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  baseUrl: r.base_url,
  apiKey: openSecret(r.api_key),
  enabled: r.enabled === 1,
  builtin: r.builtin === 1,
});

export function seedBuiltinProviders(): void {
  for (const b of BUILTINS) {
    run('INSERT OR IGNORE INTO provider_configs (id, kind, name, base_url, api_key, enabled, builtin, created_at) VALUES (?, ?, ?, ?, NULL, 1, 1, ?)', b.id, b.kind, b.name, b.baseUrl, Date.now());
  }
}

export function listProviderConfigs(): StoredProviderConfig[] {
  return all<Row>('SELECT * FROM provider_configs ORDER BY builtin DESC, created_at').map(toStored);
}

export function getProviderConfig(id: string): StoredProviderConfig | undefined {
  const row = get<Row>('SELECT * FROM provider_configs WHERE id = ?', id);
  return row ? toStored(row) : undefined;
}

export function saveProviderConfig(input: ProviderConfigInput): StoredProviderConfig {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error('Base URL must start with http:// or https://');
  const existing = input.id ? getProviderConfig(input.id) : undefined;
  if (existing) {
    const apiKey = input.apiKey === undefined ? undefined : sealSecret(input.apiKey);
    run(
      `UPDATE provider_configs SET name = ?, base_url = ?, enabled = ?${apiKey === undefined ? '' : ', api_key = ?'} WHERE id = ?`,
      existing.builtin ? existing.name : input.name.trim() || existing.name,
      baseUrl,
      input.enabled,
      ...(apiKey === undefined ? [] : [apiKey]),
      existing.id,
    );
    return getProviderConfig(existing.id)!;
  }
  if (input.kind !== 'openai') throw new Error('Only OpenAI-compatible servers can be added as custom connections.');
  const id = newId();
  run(
    'INSERT INTO provider_configs (id, kind, name, base_url, api_key, enabled, builtin, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
    id,
    'openai',
    input.name.trim() || 'Custom server',
    baseUrl,
    input.apiKey ? sealSecret(input.apiKey) : null,
    input.enabled,
    Date.now(),
  );
  return getProviderConfig(id)!;
}

export function deleteProviderConfig(id: string): void {
  const existing = getProviderConfig(id);
  if (existing?.builtin) throw new Error('Built-in connections can be disabled but not removed.');
  run('DELETE FROM provider_configs WHERE id = ?', id);
}

export function toPublicConfig(c: StoredProviderConfig): ProviderConfig {
  return { id: c.id, kind: c.kind, name: c.name, baseUrl: c.baseUrl, hasApiKey: c.apiKey.length > 0, enabled: c.enabled, builtin: c.builtin };
}
