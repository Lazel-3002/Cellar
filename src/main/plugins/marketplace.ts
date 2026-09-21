/** Plugin marketplace: search and install plugins from Hugging Face. */
import type { PluginMarketplaceEntry, PluginMarketplaceSearch } from '@shared/types/customize';
import { errorMessage, fetchWithTimeout } from '../lib/util';
import { installPlugin } from '../customize/plugins';

const HF_BASE = 'https://huggingface.co';
/** Cache for marketplace search results (1 hour). */
const cache = new Map<string, { at: number; results: PluginMarketplaceEntry[] }>();

interface HfModelSummary {
  id: string;
  author?: string;
  name?: string;
  downloads?: number;
  likes?: number;
  lastModified?: string;
  tags?: string[];
  gated?: boolean | string;
}

async function fetchJson(url: string, timeoutMs = 15_000): Promise<any> {
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' }, timeoutMs });
  if (!res.ok) throw new Error(`Hugging Face API error ${res.status}`);
  return res.json();
}

export async function searchMarketplace(query: PluginMarketplaceSearch): Promise<PluginMarketplaceEntry[]> {
  const cacheKey = JSON.stringify({ search: query.search, sort: query.sort, limit: query.limit });
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < 60 * 60_000) return cached.results;

  // Search broadly for Claude-related repositories
  const params = new URLSearchParams({
    sort: query.sort || 'downloads',
    direction: '-1',
    limit: String(query.limit ?? 40),
  });
  
  // Use broader search terms if user provides one, otherwise default to "claude"
  const searchTerm = query.search?.trim() || 'claude';
  params.set('search', searchTerm);

  try {
    const rows = await fetchJson(`${HF_BASE}/api/models?${params}`);
    const results: PluginMarketplaceEntry[] = [];
    
    // Quick filter: only process repos that mention Claude, agent, or plugin in tags/description
    for (const r of rows as Array<{ id: string; likes?: number; downloads?: number; tags?: string[]; pipeline_tag?: string; lastModified?: string; createdAt?: string; gated?: boolean | string }>) {
      const id = r.id;
      if (!id) continue;
      
      // Skip repos that clearly aren't plugins (e.g., models without plugin-related keywords)
      const allTags = (r.tags || []).join(' ').toLowerCase();
      const isRelevant = 
        allTags.includes('claude') ||
        allTags.includes('agent') ||
        allTags.includes('mcp') ||
        allTags.includes('plugin');
      
      if (!isRelevant) continue;

      try {
        // Check if this repo contains plugin files
        const tree = await fetchJson(`${HF_BASE}/api/models/${id}/tree/main?recursive=true`);
        const treeFiles = (await Promise.resolve(tree).then((t: any) => t.filter((e: any) => e.type === 'file')).catch(() => [])) as Array<{ path: string }>;
        
        const hasPluginStructure = treeFiles.some((f: { path: string }) => 
          f.path.startsWith('.claude-plugin/') || 
          f.path.endsWith('/SKILL.md') || 
          f.path.endsWith('.mcp.json') ||
          f.path === 'plugin.json'
        );

        if (!hasPluginStructure) continue;

        results.push({
          id,
          author: id.split('/')[0],
          name: id.split('/').slice(1).join('/'),
          description: '', // Will be fetched on demand
          downloads: r.downloads ?? 0,
          likes: r.likes ?? 0,
          tags: r.tags ?? [],
          lastModified: r.lastModified ?? r.createdAt,
          gated: !!r.gated,
        });
      } catch {
        // Skip repos that can't be read
        continue;
      }
    }

    cache.set(cacheKey, { at: Date.now(), results });
    return results;
  } catch (err) {
    throw new Error(errorMessage(err));
  }
}

export async function installFromMarketplace(repoId: string): Promise<any[]> {
  const url = `https://github.com/${repoId}.git`;
  try {
    return await installPlugin(url);
  } catch (err) {
    throw new Error(errorMessage(err));
  }
}
