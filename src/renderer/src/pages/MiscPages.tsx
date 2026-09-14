import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { MessageSquare, Palette, Search, Shapes, Star, Trash } from 'lucide-react';
import { ARTIFACT_ICONS, ARTIFACT_LABELS } from '@/components/chat/ArtifactCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Badge, EmptyState, Spinner } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { useArtifacts, useConversations } from '@/lib/queries';
import { conversationRoute } from '@/lib/tasks';
import { cn, relativeTime } from '@/lib/utils';
import { useUi } from '@/stores/ui';

export function ArtifactsPage() {
  const { data: artifacts = [], isLoading } = useArtifacts();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const openArtifact = useUi((s) => s.openArtifact);
  const filtered = artifacts.filter((a) => `${a.title} ${a.conversationTitle}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="h-full overflow-y-auto pt-9">
      <div className="mx-auto max-w-[1040px] px-8 pt-8 pb-16">
        <h1 className="font-serif text-[30px]">Artifacts</h1>
        <div className="relative mt-5">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search artifacts…" className="h-10 pl-9" />
        </div>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Shapes className="size-5" />}
            title="No artifacts yet"
            description="When a model writes a web page, SVG, React component, diagram or long document, it shows up here so you can find and reuse it."
          />
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a) => {
              const Icon = ARTIFACT_ICONS[a.type];
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    openArtifact({ conversationId: a.conversationId, identifier: a.identifier });
                    void navigate({ to: '/chat/$conversationId', params: { conversationId: a.conversationId } });
                  }}
                  className="flex flex-col rounded-xl border border-divider bg-card text-left transition-colors hover:border-composer-border"
                >
                  <div className="flex h-28 items-center justify-center rounded-t-xl border-b border-divider bg-background text-muted-foreground">
                    <Icon className="size-8" strokeWidth={1.3} />
                  </div>
                  <div className="p-3">
                    <div className="truncate text-[14px] font-medium">{a.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                      <span>{ARTIFACT_LABELS[a.type]}</span>
                      {a.version > 1 && <Badge>v{a.version}</Badge>}
                      <span className="ml-auto">{relativeTime(a.createdAt)}</span>
                    </div>
                    <div className="mt-1 truncate text-[12px] text-muted-foreground">{a.conversationTitle}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function RecentsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);
  const { data: chats = [], isLoading } = useConversations({ query: debounced || undefined, limit: 1000 });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="h-full overflow-y-auto pt-9">
      <div className="mx-auto max-w-[800px] px-8 pt-8 pb-16">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-[30px]">Your chat history</h1>
          <Button variant="primary" onClick={() => void navigate({ to: '/' })}>
            New chat
          </Button>
        </div>
        <div className="relative mt-5">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your chats…" className="h-10 pl-9" />
        </div>
        <div className="mt-4 flex h-8 items-center gap-3 text-[13px] text-muted-foreground">
          <span>
            {chats.length} chat{chats.length === 1 ? '' : 's'}
            {debounced ? ` matching "${debounced}"` : ''}
          </span>
          <button className="text-brand" onClick={() => { setSelecting((s) => !s); setSelected(new Set()); }}>
            {selecting ? 'Cancel' : 'Select'}
          </button>
          {selecting && selected.size > 0 && (
            <Button
              size="sm"
              variant="danger"
              className="ml-auto"
              onClick={async () => {
                if (!window.confirm(`Delete ${selected.size} chat${selected.size === 1 ? '' : 's'}?`)) return;
                await invoke('chat:delete', [...selected]);
                setSelected(new Set());
                setSelecting(false);
              }}
            >
              <Trash className="size-3.5" /> Delete {selected.size}
            </Button>
          )}
        </div>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : chats.length === 0 ? (
          <EmptyState icon={<MessageSquare className="size-5" />} title={debounced ? 'No chats match your search' : 'No chats yet'} />
        ) : (
          <div className="mt-2 divide-y divide-divider border-y border-divider">
            {chats.map((c) => (
              <div key={c.id} className={cn('flex items-center gap-3 px-2 py-3 hover:bg-hover/40', selected.has(c.id) && 'bg-hover/60')}>
                {selecting && <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="size-4 accent-[var(--brand)]" />}
                <Link to={conversationRoute(c.kind)} params={{ conversationId: c.id }} className="min-w-0 flex-1" onClick={(e) => { if (selecting) { e.preventDefault(); toggle(c.id); } }}>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14.5px] text-foreground">{c.title || 'Untitled'}</span>
                    {c.starred && <Star className="size-3 shrink-0 fill-current text-muted-foreground" />}
                    {c.kind === 'task' && <Badge tone="outline">Task</Badge>}
                    {c.kind === 'code' && <Badge tone="outline">Code</Badge>}
                    {c.projectName && <Badge>{c.projectName}</Badge>}
                  </div>
                  <div className="text-[12px] text-muted-foreground">Last message {relativeTime(c.updatedAt)}</div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const COMING: Record<string, { icon: ReactNode; title: string; milestone: string; description: string; bullets: string[] }> = {
  design: {
    icon: <Palette className="size-5" />,
    title: 'Design',
    milestone: 'Milestone 5',
    description: 'A canvas for mockups, slides and visual layouts generated with local models.',
    bullets: ['Multi-artboard canvas', 'Edit generated designs visually', 'Export to PNG and PDF'],
  },
};

export function ComingSoonPage({ feature }: { feature: keyof typeof COMING }) {
  const info = COMING[feature];
  return (
    <div className="flex h-full items-center justify-center px-8 pt-9">
      <div className="max-w-md text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-selected text-fg-2">{info.icon}</div>
        <h1 className="mt-4 font-serif text-[30px]">{info.title}</h1>
        <Badge tone="brand" className="mt-2">
          Coming in {info.milestone}
        </Badge>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">{info.description}</p>
        <ul className="mt-4 space-y-1.5 text-left text-[13.5px] text-fg-2">
          {info.bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-brand" />
              {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
