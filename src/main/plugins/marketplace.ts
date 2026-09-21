/** Plugin marketplace: search and install plugins from GitHub. */
import type { PluginMarketplaceEntry, PluginMarketplaceSearch } from '@shared/types/customize';
import { errorMessage, fetchWithTimeout } from '../lib/util';
import { installPlugin } from '../customize/plugins';

const GH_BASE = 'https://api.github.com';

// Pre-seeded popular Claude plugins (since GitHub code search requires auth)
const SEED_PLUGINS: PluginMarketplaceEntry[] = [
  {
    id: 'anthropics/claude-code-plugins',
    author: 'anthropics',
    name: 'Claude Code Official Plugins',
    description: 'Official plugins from Anthropic for Claude Code',
    downloads: 36553,
    likes: 36553,
    tags: ['official'],
    lastModified: new Date().toISOString(),
    gated: false,
  },
];

/** Cache for marketplace search results (1 hour). */
const cache = new Map<string, { at: number; results: PluginMarketplaceEntry[] }>();

async function fetchJson(url: string, timeoutMs = 15_000): Promise<any> {
  const res = await fetchWithTimeout(url, { 
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Cellar-App' },
    timeoutMs 
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
  return res.json();
}

export async function searchMarketplace(query: PluginMarketplaceSearch): Promise<PluginMarketplaceEntry[]> {
  const cacheKey = JSON.stringify({ search: query.search, sort: query.sort, limit: query.limit });
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < 60 * 60_000) return cached.results;

  // Search GitHub for repositories with plugin-related keywords
  const searchTerm = query.search?.trim() || 'claude';
  
  try {
    const params = new URLSearchParams({
      q: `${searchTerm} (plugin OR mcp OR "claude-code")`,
      sort: 'stars',
      order: 'desc',
      per_page: String(query.limit ?? 20),
    });

    const repos = await fetchJson(`${GH_BASE}/search/repositories?${params}`);
    const results: PluginMarketplaceEntry[] = [...SEED_PLUGINS]; // Start with seed plugins
    
    // Filter and add repos that match our criteria
    for (const repo of repos.items || []) {
      const fullName = repo.full_name;
      if (!fullName) continue;

      // Skip if already in seeds
      if (results.some(p => p.id === fullName)) continue;

      // Check description/tags for plugin indicators
      const desc = (repo.description || '').toLowerCase();
      const hasPluginIndicator = 
        desc.includes('plugin') || 
        desc.includes('mcp') || 
        desc.includes('.claude-plugin');

      if (!hasPluginIndicator) continue;

      results.push({
        id: fullName,
        author: fullName.split('/')[0],
        name: fullName.split('/').slice(1).join('/'),
        description: repo.description || '',
        downloads: repo.forks_count ?? 0,
        likes: repo.stargazers_count ?? 0,
        tags: [],
        lastModified: repo.updated_at,
        gated: false,
      });

      // Stop if we have enough results
      if (results.length >= (query.limit ?? 20)) break;
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
