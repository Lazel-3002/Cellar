import { useState, type ComponentType, type SVGProps } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { BriefcaseBusiness, ChevronDown, Clock, Ellipsis, FolderClosed, ListFilter, Palette, Pencil, Plus, Shapes, Star, Trash } from 'lucide-react';
import type { ConversationSummary } from '@shared/types/chat';
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuTrigger } from '@/components/ui/menu';
import { invoke } from '@/lib/ipc';
import { useConversations, useProjects, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { DownloadsButton } from './DownloadsPopover';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number }>;

function NavItem({ icon: IconCmp, label, to, active, onClick }: { icon: Icon; label: string; to?: string; active?: boolean; onClick?: () => void }) {
  const className = cn(
    'no-drag flex h-[26px] items-center gap-2.5 rounded-md px-2.5 text-[14px] text-fg-2 transition-colors hover:bg-hover hover:text-foreground',
    active && 'bg-selected text-foreground hover:bg-selected',
  );
  const inner = (
    <>
      <IconCmp className="size-[15px] shrink-0" strokeWidth={1.75} />
      <span className="truncate">{label}</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} onClick={onClick} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

type RecentFilter = { kind: 'all' } | { kind: 'starred' } | { kind: 'project'; projectId: string };

function RecentRow({ chat, active }: { chat: ConversationSummary; active: boolean }) {
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const { data: projects = [] } = useProjects();

  const commit = async () => {
    setRenaming(false);
    if (title.trim() && title !== chat.title) await invoke('chat:rename', chat.id, title);
  };

  if (renaming) {
    return (
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commit();
          if (e.key === 'Escape') setRenaming(false);
        }}
        className="no-drag h-[27px] w-full rounded-md border border-brand/50 bg-composer px-2 text-[14px] outline-none"
      />
    );
  }

  return (
    <div className={cn('group relative flex h-[27px] items-center rounded-md hover:bg-hover', active && 'bg-selected hover:bg-selected')}>
      <Link to="/chat/$conversationId" params={{ conversationId: chat.id }} className="no-drag flex h-full min-w-0 flex-1 items-center gap-3 pr-7 pl-3">
        <span className="size-[5px] shrink-0 rounded-full bg-faint" />
        <span className={cn('fade-right truncate text-[14px] text-fg-2', active && 'text-foreground')}>{chat.title || 'Untitled'}</span>
        {chat.starred && <Star className="size-3 shrink-0 fill-current text-muted-foreground" />}
      </Link>
      <Menu>
        <MenuTrigger asChild>
          <button
            aria-label="Chat options"
            className="no-drag absolute right-1 flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground data-[state=open]:opacity-100"
          >
            <Ellipsis className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent align="start" side="right">
          <MenuItem icon={<Star />} onSelect={() => void invoke('chat:star', chat.id, !chat.starred)}>
            {chat.starred ? 'Unstar' : 'Star'}
          </MenuItem>
          <MenuItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
            Rename
          </MenuItem>
          <MenuSub label="Add to project" icon={<FolderClosed />}>
            {projects.length === 0 && <MenuLabel>No projects yet</MenuLabel>}
            {projects.map((p) => (
              <MenuCheckItem key={p.id} checked={chat.projectId === p.id} onSelect={() => void invoke('chat:moveToProject', chat.id, chat.projectId === p.id ? null : p.id)}>
                {p.name}
              </MenuCheckItem>
            ))}
          </MenuSub>
          <MenuSeparator />
          <MenuItem
            icon={<Trash />}
            destructive
            onSelect={async () => {
              await invoke('chat:delete', [chat.id]);
              if (active) void navigate({ to: '/' });
            }}
          >
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [filter, setFilter] = useState<RecentFilter>({ kind: 'all' });
  const { data: projects = [] } = useProjects();
  const { data: settings } = useSettings();
  const setIncognito = useUi((s) => s.setIncognito);
  const { data: chats = [] } = useConversations({
    starred: filter.kind === 'starred' ? true : undefined,
    projectId: filter.kind === 'project' ? filter.projectId : undefined,
    limit: 40,
  });
  const name = settings?.userName || 'You';

  return (
    <aside className="flex h-full w-[268px] shrink-0 flex-col border-r border-divider bg-sidebar pt-12">
      <nav className="flex flex-col gap-px px-2">
        <NavItem icon={Plus} label="New" to="/" active={pathname === '/'} onClick={() => setIncognito(false)} />
        <NavItem icon={FolderClosed} label="Projects" to="/projects" active={pathname.startsWith('/projects')} />
        <NavItem icon={Shapes} label="Artifacts" to="/artifacts" active={pathname.startsWith('/artifacts')} />
        <NavItem icon={Clock} label="Scheduled" to="/scheduled" active={pathname.startsWith('/scheduled')} />
        <NavItem icon={BriefcaseBusiness} label="Customize" to="/customize" active={pathname.startsWith('/customize')} />
      </nav>

      <div className="mt-[22px] flex h-6 items-center justify-between pr-2 pl-3.5">
        <span className="text-[12px] text-muted-foreground">{filter.kind === 'starred' ? 'Starred' : filter.kind === 'project' ? projects.find((p) => p.id === filter.projectId)?.name ?? 'Project' : 'Chats and tasks'}</span>
        <Menu>
          <MenuTrigger asChild>
            <button aria-label="Filter chats" className={cn('no-drag flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-hover hover:text-foreground', filter.kind !== 'all' && 'text-brand')}>
              <ListFilter className="size-[14px]" />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuCheckItem checked={filter.kind === 'all'} onSelect={() => setFilter({ kind: 'all' })}>
              All chats
            </MenuCheckItem>
            <MenuCheckItem checked={filter.kind === 'starred'} onSelect={() => setFilter({ kind: 'starred' })}>
              Starred
            </MenuCheckItem>
            {projects.length > 0 && <MenuSeparator />}
            {projects.map((p) => (
              <MenuCheckItem key={p.id} checked={filter.kind === 'project' && filter.projectId === p.id} onSelect={() => setFilter({ kind: 'project', projectId: p.id })}>
                {p.name}
              </MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
      </div>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {chats.map((chat) => (
          <RecentRow key={chat.id} chat={chat} active={pathname === `/chat/${chat.id}`} />
        ))}
        {chats.length === 0 && <div className="px-3 py-2 text-[13px] text-muted-foreground">{filter.kind === 'all' ? 'Your chats will show up here.' : 'Nothing here yet.'}</div>}
        <Link to="/recents" className="no-drag mt-1 block px-3 py-1.5 text-[13.5px] text-muted-foreground hover:text-foreground">
          View all conversations
        </Link>
      </div>

      <div className="border-t border-divider px-2 py-1.5">
        <NavItem icon={Palette} label="Design" to="/design" active={pathname.startsWith('/design')} />
      </div>
      <div className="flex h-[44px] items-center gap-1 border-t border-divider px-2">
        <Menu>
          <MenuTrigger asChild>
            <button className="no-drag flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 hover:bg-hover">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-selected text-[11px] font-medium text-foreground">{name.charAt(0).toUpperCase()}</span>
              <span className="truncate text-[14px] text-foreground">{name}</span>
              <span className="shrink-0 text-[12px] text-muted-foreground">· Local</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </MenuTrigger>
          <ProfileMenuContent />
        </Menu>
        <DownloadsButton />
      </div>
    </aside>
  );
}

function ProfileMenuContent() {
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const go = (section: string) => void navigate({ to: '/settings/$section', params: { section } });
  return (
    <MenuContent side="top" align="start" className="w-60">
      <MenuItem shortcut="Ctrl+," onSelect={() => go('general')}>
        Settings
      </MenuItem>
      <MenuItem onSelect={() => void navigate({ to: '/models' })}>My models</MenuItem>
      <MenuItem onSelect={() => void navigate({ to: '/discover', search: {} })}>Discover models</MenuItem>
      <MenuItem onSelect={() => go('engines')}>Engines & runtimes</MenuItem>
      <MenuItem onSelect={() => go('connections')}>Connections</MenuItem>
      <MenuSeparator />
      <MenuSub label="Theme">
        {(['dark', 'light', 'system'] as const).map((t) => (
          <MenuCheckItem key={t} checked={settings?.theme === t} onSelect={() => void invoke('settings:update', { theme: t })}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </MenuCheckItem>
        ))}
      </MenuSub>
      <MenuItem onSelect={() => go('about')}>About Cellar</MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={() => void invoke('window:action', 'quit')}>Quit</MenuItem>
    </MenuContent>
  );
}
