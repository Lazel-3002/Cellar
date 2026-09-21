import { useState } from 'react';
import { ArrowDownToLine, ExternalLink, Heart, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Badge, EmptyState, Spinner } from '@/components/ui/misc';
import { useInstallPluginFromMarketplace, usePluginMarketplaces } from '@/lib/queries';
import { cn, formatCompact } from '@/lib/utils';

export function PluginsPage() {
  const [searchText, setSearchText] = useState('');
  const [sort, setSort] = useState<string>('downloads');
  const installMutation = useInstallPluginFromMarketplace();
  const { data: plugins = [], isLoading } = usePluginMarketplaces({ search: searchText || undefined, sort });

  const handleInstall = async (repoId: string) => {
    try {
      await installMutation.mutateAsync(repoId);
      toast.success('Plugin installed successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const openOnHf = (repoId: string) => {
    window.open(`https://huggingface.co/${repoId}`, '_blank');
  };

  return (
    <div className="flex h-full min-w-0 pt-9">
      <div className="flex w-[360px] shrink-0 flex-col border-r border-divider">
        <div className="space-y-2.5 px-4 pt-4 pb-3">
          <h1 className="font-serif text-[26px]">Plugins</h1>
          <div className="relative">
            <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search plugins on Hugging Face"
              className="pl-8"
            />
          </div>
          <Select
            value={sort}
            onChange={setSort}
            className="w-full"
            options={[
              { value: 'downloads', label: 'Most downloads' },
              { value: 'likes', label: 'Most likes' },
              { value: 'lastModified', label: 'Recently updated' },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}
          {!isLoading && plugins.length === 0 && !searchText && (
            <div className="px-3 py-4 text-[13px] text-muted-foreground">Search for plugins to get started.</div>
          )}
          {plugins.map((plugin) => (
            <button
              key={plugin.id}
              onClick={() => {}}
              className={cn('block w-full rounded-lg px-3 py-2 text-left hover:bg-hover')}
            >
              <div className="truncate text-[13.5px] font-medium text-foreground">{plugin.name}</div>
              <div className="mt-0.5 flex items-center gap-2.5 text-[11.5px] text-muted-foreground">
                <span className="truncate">{plugin.author}</span>
                <span className="flex items-center gap-0.5">
                  <ArrowDownToLine className="size-3" />
                  {formatCompact(plugin.downloads)}
                </span>
                <span className="flex items-center gap-0.5">
                  <Heart className="size-3" />
                  {formatCompact(plugin.likes)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <EmptyState
          className="h-full"
          icon={<Search className="size-5" />}
          title="Browse plugins"
          description="Search for plugins on the left panel. Click install to add a plugin to Cellar."
        />
      </div>
    </div>
  );
}
