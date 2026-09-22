import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, CodeXml, Ghost, Menu as MenuIcon, MessagesSquare, PanelLeft, Search } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuSub, MenuTrigger } from '@/components/ui/menu';
import { Tip } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { useAppInfo } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useDesignLayout } from '@/stores/design';
import { useMathLayout } from '@/stores/math';
import { useStudyLayout } from '@/stores/study';
import { useUi } from '@/stores/ui';

function AppMenu() {
  const navigate = useNavigate();
  const { setIncognito, toggleSidebar, setSearchOpen } = useUi();
  const { data: info } = useAppInfo();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button aria-label="Menu" className="no-drag flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground">
          <MenuIcon className="size-[17px]" strokeWidth={1.75} />
        </button>
      </MenuTrigger>
      <MenuContent className="w-60">
        <MenuSub label="File">
          <MenuItem shortcut="Ctrl+N" onSelect={() => { setIncognito(false); void navigate({ to: '/' }); }}>New chat</MenuItem>
          <MenuItem shortcut="Ctrl+Shift+N" onSelect={() => { setIncognito(true); void navigate({ to: '/' }); }}>New incognito chat</MenuItem>
          <MenuItem onSelect={() => void navigate({ to: '/code' })}>New Code session</MenuItem>
          <MenuSeparator />
          <MenuItem shortcut="Ctrl+," onSelect={() => void navigate({ to: '/settings/$section', params: { section: 'general' } })}>Settings</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => void invoke('window:action', 'quit')}>Quit Cellar</MenuItem>
        </MenuSub>
        <MenuSub label="View">
          <MenuItem shortcut="Ctrl+K" onSelect={() => setSearchOpen(true)}>Search</MenuItem>
          <MenuItem shortcut="Ctrl+B" onSelect={toggleSidebar}>Toggle sidebar</MenuItem>
          <MenuSeparator />
          <MenuItem shortcut="Ctrl+=" onSelect={() => void invoke('window:action', 'zoom-in')}>Zoom in</MenuItem>
          <MenuItem shortcut="Ctrl+-" onSelect={() => void invoke('window:action', 'zoom-out')}>Zoom out</MenuItem>
          <MenuItem shortcut="Ctrl+0" onSelect={() => void invoke('window:action', 'zoom-reset')}>Actual size</MenuItem>
          <MenuSeparator />
          <MenuItem shortcut="Ctrl+R" onSelect={() => void invoke('window:action', 'reload')}>Reload</MenuItem>
          <MenuItem shortcut="Ctrl+Shift+I" onSelect={() => void invoke('window:action', 'devtools')}>Developer tools</MenuItem>
        </MenuSub>
        <MenuSub label="Models">
          <MenuItem onSelect={() => void navigate({ to: '/models' })}>My models</MenuItem>
          <MenuItem onSelect={() => void navigate({ to: '/discover', search: {} })}>Discover models</MenuItem>
          <MenuItem onSelect={() => void navigate({ to: '/settings/$section', params: { section: 'engines' } })}>Engines & runtimes</MenuItem>
        </MenuSub>
        <MenuSub label="Help">
          <MenuItem onSelect={() => info && void invoke('system:showInFolder', info.logsDir)}>Open logs folder</MenuItem>
          <MenuItem onSelect={() => void navigate({ to: '/settings/$section', params: { section: 'about' } })}>About Cellar</MenuItem>
        </MenuSub>
      </MenuContent>
    </Menu>
  );
}

export function TitleBar() {
  const router = useRouter();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { sidebarOpen: mainSidebar, toggleSidebar: toggleMainSidebar, setSearchOpen, incognito, setIncognito } = useUi();
  const isCode = pathname.startsWith('/code');
  const isDesignEditor = pathname.startsWith('/design/');
  const isMathBoard = pathname.startsWith('/math/');
  const designSidebar = useDesignLayout((s) => s.sidebar);
  const setDesignSidebar = useDesignLayout((s) => s.setSidebar);
  const mathSidebar = useMathLayout((s) => s.sidebar);
  const setMathSidebar = useMathLayout((s) => s.setSidebar);
  const isStudyReader = pathname.startsWith('/study/');
  const studySidebar = useStudyLayout((s) => s.sidebar);
  const setStudySidebar = useStudyLayout((s) => s.setSidebar);
  // The design editor, the board and the book keep the sidebar closed unless it is opened there, so the work gets the room.
  const sidebarOpen = isDesignEditor ? designSidebar : isMathBoard ? mathSidebar : isStudyReader ? studySidebar : mainSidebar;
  const toggleSidebar = isDesignEditor
    ? () => setDesignSidebar(!designSidebar)
    : isMathBoard
      ? () => setMathSidebar(!mathSidebar)
      : isStudyReader
        ? () => setStudySidebar(!studySidebar)
        : toggleMainSidebar;
  const mac = window.cellar.platform === 'darwin';

  const toggleIncognito = () => {
    const next = !incognito;
    setIncognito(next);
    if (next || pathname.startsWith('/chat/')) void navigate({ to: '/' });
  };

  return (
    <div className="drag absolute inset-x-0 top-0 z-30 flex h-9 items-center">
      <div className={cn('flex h-full shrink-0 items-center gap-2 pr-2', mac ? 'pl-[76px]' : 'pl-3', sidebarOpen && 'w-[267px]')}>
        <AppMenu />
        <IconButton label="Toggle sidebar  Ctrl+B" onClick={toggleSidebar}>
          <PanelLeft className="size-[17px]" strokeWidth={1.75} />
        </IconButton>
        <IconButton label="Search  Ctrl+K" onClick={() => setSearchOpen(true)}>
          <Search className="size-[17px]" strokeWidth={1.75} />
        </IconButton>
        <IconButton label="Back" onClick={() => router.history.back()}>
          <ArrowLeft className="size-[17px]" strokeWidth={1.75} />
        </IconButton>
        <IconButton label="Forward" onClick={() => router.history.forward()}>
          <ArrowRight className="size-[17px]" strokeWidth={1.75} />
        </IconButton>
        <div className="no-drag flex h-7 items-center rounded-lg bg-seg">
          <Tip label="Chat & Cowork">
            <button
              aria-label="Chat and Cowork"
              onClick={() => void navigate({ to: '/' })}
              className={cn(
                'flex h-[26px] w-[34px] items-center justify-center rounded-lg border text-muted-foreground',
                !isCode && !pathname.startsWith('/design') && !pathname.startsWith('/math') ? 'border-seg-border bg-selected text-foreground' : 'border-transparent hover:text-foreground',
              )}
            >
              <MessagesSquare className="size-4" strokeWidth={1.75} />
            </button>
          </Tip>
          <Tip label="Code">
            <button
              aria-label="Code"
              onClick={() => void navigate({ to: '/code' })}
              className={cn('flex h-[26px] w-[34px] items-center justify-center rounded-lg border text-muted-foreground', isCode ? 'border-seg-border bg-selected text-foreground' : 'border-transparent hover:text-foreground')}
            >
              <CodeXml className="size-4" strokeWidth={1.75} />
            </button>
          </Tip>
        </div>
      </div>
      <div id="titlebar-slot" className="flex h-full min-w-0 flex-1 items-center" />
      <div className="flex h-full items-center pr-3" style={{ marginRight: 'var(--titlebar-reserve)' }}>
        <IconButton label={incognito ? 'Leave incognito' : 'Incognito chat'} active={incognito} onClick={toggleIncognito}>
          <Ghost className="size-[18px]" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}
