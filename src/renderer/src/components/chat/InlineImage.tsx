import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/lib/ipc';

export function InlineImage({ query }: { query: string }) {
  const { data, isPending } = useQuery({
    queryKey: ['image-search', query],
    queryFn: () => invoke('images:search', query),
    staleTime: Infinity,
    retry: 1,
  });

  if (isPending) {
    return <span className="not-prose my-2 block h-48 w-72 max-w-full animate-pulse rounded-lg border border-composer-border bg-composer" />;
  }
  if (!data) return null;

  return (
    <img
      src={data.url}
      alt={query}
      loading="lazy"
      decoding="async"
      className="not-prose my-2 block max-h-80 max-w-full rounded-lg border border-divider object-contain"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}
