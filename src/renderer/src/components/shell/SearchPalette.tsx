import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import { Box, CodeXml, Cpu, FolderClosed, Ghost, ListChecks, MessageSquare, Palette, Plus, Search, Settings, Telescope } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import type { SearchHit } from '@shared/types/chat';
import { invoke } from '@/lib/ipc';
import { useConversations, useModels, useProjects } from '@/lib/queries';
import { conversationRoute } from '@/lib/tasks';
import { relativeTime } from '@/lib/utils';
import { useUi } from '@/stores/ui';

function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\[\[.*?\]\])/g);
  return (
    <span className="truncate text-[12px] text-muted-foreground">
      {parts.map((p, i) => (p.startsWith('[[') ? <mark key={i} className="bg-transparent text-foreground">{p.slice(2, -2)}</mark> : <span key={i}>{p}</span>))}
    </span>
  );
}

const itemClass = 'flex h-10 cursor-default items-center gap-3 rounded-lg px-3 text-[14px] text-fg-2 outline-none data-[selected=true]:bg-hover data-[selected=true]:text-foreground';

export function SearchPalette() {
  const { searchOpen, setSearchOpen, setIncognito, setModel } = useUi();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const { data: recent = [] } = useConversations({ limit: 8 });
  const { data: projects = [] } = useProjects();
  const { data: models = [] } = useModels();

  useEffect(() => {
    if (!searchOpen) setQuery('');
  }, [searchOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => void invoke('chat:search', query, 20).then(setHits).catch(() => setHits([])), 120);
    return () => clearTimeout(timer);
  }, [query]);

  const close = () => setSearchOpen(false);
  const go = (fn: () => void) => {
    close();
    fn();
  };
  const q = query.toLowerCase();

  return (
    <RadixDialog.Root open={searchOpen} onOpenChange={setSearchOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RadixDialog.Content className="fixed top-[14vh] left-1/2 z-50 w-[min(640px,calc(100vw-40px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-menu-border bg-menu shadow-2xl animate-fade-in">
          <RadixDialog.Title className="sr-only">Search</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">Search chats, projects, models and commands</RadixDialog.Description>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2.5 border-b border-menu-border px-4">
              <Search className="size-4 text-muted-foreground" />
              <Command.Input value={query} onValueChange={setQuery} placeholder="Search chats, projects and models…" className="h-12 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground" />
            </div>
            <Command.List className="max-h-[420px] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted-foreground">No results.</Command.Empty>

              {!q && (
                <Command.Group heading="Actions" className="px-1 pb-1 text-[11.5px] text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  <Command.Item value="new-chat" className={itemClass} onSelect={() => go(() => { setIncognito(false); void navigate({ to: '/' }); })}>
                    <Plus className="size-4" /> New chat
                  </Command.Item>
                  <Command.Item value="new-incognito" className={itemClass} onSelect={() => go(() => { setIncognito(true); void navigate({ to: '/' }); })}>
                    <Ghost className="size-4" /> New incognito chat
                  </Command.Item>
                  <Command.Item value="new-code" className={itemClass} onSelect={() => go(() => void navigate({ to: '/code' }))}>
                    <CodeXml className="size-4" /> New Code session
                  </Command.Item>
                  <Command.Item value="discover" className={itemClass} onSelect={() => go(() => void navigate({ to: '/discover', search: {} }))}>
                    <Telescope className="size-4" /> Discover models
                  </Command.Item>
                  <Command.Item value="models" className={itemClass} onSelect={() => go(() => void navigate({ to: '/models' }))}>
                    <Box className="size-4" /> My models
                  </Command.Item>
                  <Command.Item value="settings" className={itemClass} onSelect={() => go(() => void navigate({ to: '/settings/$section', params: { section: 'general' } }))}>
                    <Settings className="size-4" /> Settings
                  </Command.Item>
                </Command.Group>
              )}

              {(q ? hits.length > 0 : recent.length > 0) && (
                <Command.Group heading={q ? 'Chats' : 'Recent chats'} className="px-1 pb-1 text-[11.5px] text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  {(q ? hits : recent.map((r) => ({ conversationId: r.id, kind: r.kind, title: r.title, snippet: '', updatedAt: r.updatedAt }))).map((hit) => (
                    <Command.Item
                      key={hit.conversationId}
                      value={`chat-${hit.conversationId}`}
                      className={itemClass}
                      onSelect={() => go(() => void navigate({ to: conversationRoute(hit.kind), params: { conversationId: hit.conversationId } }))}
                    >
                      {hit.kind === 'code' ? <CodeXml className="size-4 shrink-0" /> : hit.kind === 'design' ? <Palette className="size-4 shrink-0" /> : hit.kind === 'task' ? <ListChecks className="size-4 shrink-0" /> : <MessageSquare className="size-4 shrink-0" />}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[14px]">{hit.title || 'Untitled'}</span>
                        {hit.snippet && <Snippet text={hit.snippet} />}
                      </div>
                      <span className="shrink-0 text-[11.5px] text-muted-foreground">{relativeTime(hit.updatedAt)}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {q && projects.filter((p) => p.name.toLowerCase().includes(q)).length > 0 && (
                <Command.Group heading="Projects" className="px-1 pb-1 text-[11.5px] text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  {projects
                    .filter((p) => p.name.toLowerCase().includes(q))
                    .map((p) => (
                      <Command.Item key={p.id} value={`project-${p.id}`} className={itemClass} onSelect={() => go(() => void navigate({ to: '/projects/$projectId', params: { projectId: p.id } }))}>
                        <FolderClosed className="size-4" /> {p.name}
                      </Command.Item>
                    ))}
                </Command.Group>
              )}

              {q && models.filter((m) => m.displayName.toLowerCase().includes(q)).length > 0 && (
                <Command.Group heading="Use model" className="px-1 pb-1 text-[11.5px] text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  {models
                    .filter((m) => m.displayName.toLowerCase().includes(q) && !m.capabilities.embedding)
                    .slice(0, 8)
                    .map((m) => (
                      <Command.Item key={`${m.ref.providerId}-${m.ref.modelId}`} value={`model-${m.ref.providerId}-${m.ref.modelId}`} className={itemClass} onSelect={() => go(() => setModel(m.ref))}>
                        <Cpu className="size-4" />
                        <span className="truncate">{m.displayName}</span>
                        <span className="ml-auto text-[11.5px] text-muted-foreground">{m.providerName}</span>
                      </Command.Item>
                    ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
