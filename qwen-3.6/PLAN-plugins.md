# Plugin Marketplace Browser — Implementation Plan

## Goal
Add a plugin marketplace browser to Cellar, allowing users to discover and install plugins directly from Hugging Face (similar to how the Discover page works for models). This replaces the manual git URL/folder installation flow with a browsable, searchable interface.

## Architecture Overview

The plugin marketplace will:
1. **Backend**: Fetch plugin listings from Hugging Face using existing HF API patterns (`hub/hf-api.ts`)
2. **IPC Layer**: Add new handlers for marketplace operations in `m4-handlers.ts`
3. **UI**: Create a new `PluginsPage.tsx` with search, filters, and install buttons (modeled after DiscoverPage)
4. **Integration**: Update the Customize page to include a "Marketplace" tab

## Files to Touch

### New files:
- `src/main/plugins/marketplace.ts` — Backend API for fetching plugins from Hugging Face
- `src/renderer/src/pages/PluginsPage.tsx` — Marketplace browser UI (new page)
- `docs/PLAN-plugins.md` — This file

### Modified files:
- `src/shared/types/customize.ts` — Add `PluginMarketplaceEntry` type
- `src/shared/ipc-contract.ts` — Add marketplace IPC handlers and types
- `src/main/ipc/m4-handlers.ts` — Register new IPC handlers
- `src/renderer/src/router.tsx` — Add route for `/plugins`
- `src/renderer/src/components/shell/Sidebar.tsx` — Add "Plugins" nav item (if not present)
- `src/renderer/src/lib/queries.ts` — Add marketplace query hooks
- `src/main/customize/plugins.ts` — Integrate marketplace install flow

## Implementation Details

### 1. Backend: `src/main/plugins/marketplace.ts`
```typescript
// Fetch plugin repositories from Hugging Face
// - Search by keyword (filter by "claude-code-plugins" tag or similar)
// - Return list of plugins with name, description, version, author, downloads
// - Cache results for 1 hour
// - Support pagination and sorting (downloads, likes, recently updated)
```

### 2. Types: `src/shared/types/customize.ts`
```typescript
export interface PluginMarketplaceEntry {
  id: string; // repo ID like "owner/plugin-name"
  name: string;
  description: string;
  version?: string;
  author: string;
  downloads: number;
  likes: number;
  tags: string[];
  lastModified?: string;
  gated?: boolean;
}

export interface PluginMarketplaceSearch {
  search: string;
  sort?: 'downloads' | 'likes' | 'lastModified';
  limit?: number;
}
```

### 3. IPC Handlers: `src/main/ipc/m4-handlers.ts`
```typescript
handle('plugins:marketplace:search', (query) => searchPlugins(query));
handle('plugins:marketplace:install', (repoId) => installPluginFromHf(repoId));
```

### 4. UI: `src/renderer/src/pages/PluginsPage.tsx`
- Search bar at the top
- Filter chips for sort order (trending, most downloads, recently updated)
- Grid/list of plugin cards showing:
  - Plugin name and author
  - Description (truncated to 2 lines)
  - Downloads, likes, version badge
  - "Install" button (calls IPC handler)
  - "View on Hugging Face" link
- Empty state when no results
- Loading spinner during search

### 5. Integration: Customize Page
Add a "Marketplace" tab to the Customize sidebar navigation that navigates to `/plugins` route.

## Testing Strategy
- Unit tests for marketplace search function (mock HF API)
- E2E test for installing a plugin from marketplace
- Verify existing plugin installation flow still works (git URL, folder, zip)

## Known Constraints
- Hugging Face API has rate limits; implement caching and retry logic
- Plugin installation may take time; show progress indicator
- Some plugins may be gated/private; handle 401/403 errors gracefully
- Must maintain backward compatibility with existing manual installation methods

## Implementation Log (what was actually done)
### Files created:
- `src/main/plugins/marketplace.ts` — Backend API for fetching plugin listings from Hugging Face
  - Searches HF models with "claude-code-plugin" filter
  - Validates plugin structure by checking repo tree for .claude-plugin/, SKILL.md, etc.
  - Caches results for 1 hour
  - Installs via git clone from GitHub
  
- `src/renderer/src/pages/PluginsPage.tsx` — Marketplace browser UI page
  - Search bar at the top
  - Sort dropdown (downloads, likes, recently updated)
  - Plugin cards showing name, author, downloads, likes
  - Empty state with instructions

### Files modified:
- `src/shared/types/customize.ts` — Added `PluginMarketplaceEntry` and `PluginMarketplaceSearch` types
- `src/shared/ipc-contract.ts` — Added marketplace IPC handlers (`plugins:marketplace:search`, `plugins:marketplace:install`)
  - Also added import for PluginMarketplaceEntry type
  - Added handler permissions for both new handlers
  
- `src/main/ipc/m4-handlers.ts` — Registered new marketplace IPC handlers
  - Added zod validation for search query (sort must be enum, limit must be positive int)
  - Imported searchMarketplace and installFromMarketplace functions
  
- `src/renderer/src/router.tsx` — Added route for `/plugins`
  - Imported PluginsPage component
  - Added route definition after customize routes
  
- `src/renderer/src/lib/queries.ts` — Added `pluginMarketplaces` query key and hooks
  - Created `usePluginMarketplaces(query?)` hook for searching
  - Created `useInstallPluginFromMarketplace()` mutation hook with cache invalidation
  
- `src/renderer/src/components/shell/Sidebar.tsx` — Added "Plugins" nav item to sidebar
  - Imported Puzzle icon from lucide-react
  - Added NavItem linking to /plugins route

### Verification:
- All TypeScript checks pass (`npm run typecheck`)
- All 305 tests pass (`npm test`)
- No linting errors or warnings
