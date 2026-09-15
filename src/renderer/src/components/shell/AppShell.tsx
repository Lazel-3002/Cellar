import { Outlet, useRouterState } from '@tanstack/react-router';
import { Tooltip } from 'radix-ui';
import { Toaster } from 'sonner';
import { ArtifactPanel } from '@/components/artifacts/ArtifactPanel';
import { LoadSettingsDialog } from '@/components/models/LoadSettingsDialog';
import { useAppCommands, useThemeSync } from '@/lib/hooks';
import { useIpcSync, useSettings } from '@/lib/queries';
import { useDesignLayout } from '@/stores/design';
import { useUi } from '@/stores/ui';
import { CodeSidebar } from './CodeSidebar';
import { SearchPalette } from './SearchPalette';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';

export function AppShell() {
  useIpcSync();
  useAppCommands();
  const { data: settings } = useSettings();
  useThemeSync(settings);
  const sidebarOpen = useUi((s) => s.sidebarOpen);
  const artifactOpen = useUi((s) => !!s.artifact);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isCode = pathname.startsWith('/code');
  const isDesignEditor = pathname.startsWith('/design/');
  const designSidebar = useDesignLayout((s) => s.sidebar);

  return (
    <Tooltip.Provider delayDuration={450}>
      <div className="relative flex h-full w-full overflow-hidden bg-background text-foreground">
        <TitleBar />
        {(isDesignEditor ? designSidebar : sidebarOpen) && (isCode ? <CodeSidebar /> : <Sidebar />)}
        <main className="relative h-full min-w-0 flex-1">
          <Outlet />
        </main>
        {artifactOpen && !isCode && !pathname.startsWith('/design') && <ArtifactPanel />}
      </div>
      <SearchPalette />
      <LoadSettingsDialog />
      <Toaster
        theme={settings?.theme === 'light' ? 'light' : 'dark'}
        position="bottom-right"
        toastOptions={{ classNames: { toast: '!bg-menu !border-menu-border !text-foreground', description: '!text-muted-foreground' } }}
      />
    </Tooltip.Provider>
  );
}
