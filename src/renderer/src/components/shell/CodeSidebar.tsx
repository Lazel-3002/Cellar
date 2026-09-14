import { useMemo, useState } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, Ellipsis, FolderGit2, GitBranch, ListFilter, Pencil, Plus, Star, Trash } from 'lucide-react';
import type { ConversationSummary } from '@shared/types/chat';
import { DeleteSessionDialog } from '@/components/code/DeleteSessionDialog';
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { invoke } from '@/lib/ipc';
import { useConversations, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useCodeUi } from '@/stores/code';
import { DownloadsButton } from './DownloadsPopover';
import { NavItem, ProfileMenuContent, RowMarker } from './Sidebar';

type SessionFilter = 'all' | 'active' | 'starred';

function SessionRow({ session, active }: { session: ConversationSummary; active: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [title, setTitle] = useState(session.title);

  const commit = async () => {
    setRenaming(false);
    if (title.trim() && title !== session.title) await invoke('chat:rename', session.id, title);
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
    <div data-testid="code-session-row" className={cn('group relative flex min-h-[27px] items-center rounded-md hover:bg-hover', active && 'bg-selected hover:bg-selected')}>
      <Link to="/code/$conversationId" params={{ conversationId: session.id }} className="no-drag flex h-full min-w-0 flex-1 items-center gap-3 py-1 pr-7 pl-3" title={session.branch ? `${session.title}\n${session.branch}` : session.title}>
        <RowMarker chat={session} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn('fade-right truncate text-[14px] leading-tight text-fg-2', active && 'text-foreground')}>{session.title || 'Untitled'}</span>
          {session.branch?.startsWith('cellar/') && (
            <span className="flex items-center gap-1 truncate text-[11px] leading-tight text-muted-foreground">
              <GitBranch className="size-2.5 shrink-0" />
              <span className="truncate">{session.branch}</span>
            </span>
          )}
        </span>
        {session.starred && <Star className="size-3 shrink-0 fill-current text-muted-foreground" />}
      </Link>
      <Menu>
        <MenuTrigger asChild>
          <button aria-label="Session options" className="no-drag absolute right-1 flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground data-[state=open]:opacity-100">
            <Ellipsis className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent align="start" side="right">
          <MenuItem icon={<Star />} onSelect={() => void invoke('chat:star', session.id, !session.starred)}>
            {session.starred ? 'Unstar' : 'Star'}
          </MenuItem>
          <MenuItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
            Rename
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash />} destructive onSelect={() => setDeleting(true)}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
      {deleting && <DeleteSessionDialog conversationId={session.id} title={session.title} onClose={() => setDeleting(false)} redirect={active} />}
    </div>
  );
}

/** Sidebar on Code screens: sessions grouped by repository. */
export function CodeSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [filter, setFilter] = useState<SessionFilter>('all');
  const [repoFilter, setRepoFilter] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { data: settings } = useSettings();
  const setRepo = useCodeUi((s) => s.setRepo);
  const { data: sessions = [] } = useConversations({ kind: 'code', starred: filter === 'starred' ? true : undefined, limit: 300 });
  const name = settings?.userName || 'You';

  const groups = useMemo(() => {
    const visible = sessions.filter((s) => (filter !== 'active' || s.taskStatus === 'running' || s.taskStatus === 'waiting') && (!repoFilter || s.repoRoot === repoFilter));
    const byRepo = new Map<string, { root: string; name: string; sessions: ConversationSummary[] }>();
    for (const session of visible) {
      const root = session.repoRoot ?? '';
      const group = byRepo.get(root) ?? { root, name: session.repoName ?? 'Folder', sessions: [] };
      group.sessions.push(session);
      byRepo.set(root, group);
    }
    return [...byRepo.values()];
  }, [sessions, filter, repoFilter]);

  const repos = useMemo(() => [...new Map(sessions.filter((s) => s.repoRoot).map((s) => [s.repoRoot!, s.repoName ?? s.repoRoot!])).entries()], [sessions]);

  const toggle = (root: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(root)) next.delete(root);
      else next.add(root);
      return next;
    });

  const label = filter === 'active' ? 'Active sessions' : filter === 'starred' ? 'Starred sessions' : 'Sessions';

  return (
    <aside data-testid="code-sidebar" className="flex h-full w-[268px] shrink-0 flex-col border-r border-divider bg-sidebar pt-12">
      <nav className="flex flex-col gap-px px-2">
        <NavItem icon={Plus} label="New session" to="/code" active={pathname === '/code'} />
      </nav>

      <div className="mt-[22px] flex h-6 items-center justify-between pr-2 pl-3.5">
        <span className="truncate text-[12px] text-muted-foreground">{repoFilter ? repos.find(([root]) => root === repoFilter)?.[1] ?? label : label}</span>
        <Menu>
          <MenuTrigger asChild>
            <button aria-label="Filter sessions" className={cn('no-drag flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-hover hover:text-foreground', (filter !== 'all' || repoFilter) && 'text-brand')}>
              <ListFilter className="size-[14px]" />
            </button>
          </MenuTrigger>
          <MenuContent align="end" className="w-56">
            <MenuCheckItem checked={filter === 'all'} onSelect={() => setFilter('all')}>
              All sessions
            </MenuCheckItem>
            <MenuCheckItem checked={filter === 'active'} onSelect={() => setFilter('active')}>
              Working or waiting
            </MenuCheckItem>
            <MenuCheckItem checked={filter === 'starred'} onSelect={() => setFilter('starred')}>
              Starred
            </MenuCheckItem>
            {repos.length > 0 && (
              <>
                <MenuSeparator />
                <MenuLabel>Repository</MenuLabel>
                <MenuCheckItem checked={!repoFilter} onSelect={() => setRepoFilter(null)}>
                  All repositories
                </MenuCheckItem>
                {repos.map(([root, repoName]) => (
                  <MenuCheckItem key={root} checked={repoFilter === root} onSelect={() => setRepoFilter(root)} title={root}>
                    {repoName}
                  </MenuCheckItem>
                ))}
              </>
            )}
          </MenuContent>
        </Menu>
      </div>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.root);
          return (
            <div key={group.root} className="mb-2">
              <div className="group/repo flex h-7 items-center gap-1 rounded-md pr-1 pl-1.5 hover:bg-hover/60">
                <button onClick={() => toggle(group.root)} className="no-drag flex min-w-0 flex-1 items-center gap-1.5 text-left text-[12.5px] font-medium text-fg-2" title={group.root}>
                  {isCollapsed ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />}
                  <FolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{group.name}</span>
                  <span className="shrink-0 text-[11px] font-normal text-muted-foreground tabular-nums">{group.sessions.length}</span>
                </button>
                {group.root && (
                  <button
                    aria-label={`New session in ${group.name}`}
                    className="no-drag flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/repo:opacity-100 hover:text-foreground"
                    onClick={() => {
                      setRepo(group.root);
                      void navigate({ to: '/code' });
                    }}
                  >
                    <Plus className="size-3.5" />
                  </button>
                )}
              </div>
              {!isCollapsed && group.sessions.map((session) => <SessionRow key={session.id} session={session} active={pathname === `/code/${session.id}`} />)}
            </div>
          );
        })}
        {groups.length === 0 && (
          <div className="px-3 py-2 text-[13px] leading-relaxed text-muted-foreground">
            {filter === 'all' && !repoFilter ? 'Your coding sessions will show up here, grouped by repository.' : 'No sessions match this filter.'}
            {(filter !== 'all' || repoFilter) && (
              <button
                className="mt-1 block text-brand"
                onClick={() => {
                  setFilter('all');
                  setRepoFilter(null);
                }}
              >
                Show all sessions
              </button>
            )}
          </div>
        )}
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
