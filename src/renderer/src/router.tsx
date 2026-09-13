import { createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AppShell } from './components/shell/AppShell';
import { ChatPage } from './pages/ChatPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { HomePage } from './pages/HomePage';
import { ArtifactsPage, ComingSoonPage, RecentsPage } from './pages/MiscPages';
import { ModelsPage } from './pages/ModelsPage';
import { ProjectDetailPage, ProjectsPage } from './pages/ProjectsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TaskPage } from './pages/TaskPage';

const rootRoute = createRootRoute({ component: AppShell });

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/chat/$conversationId', component: ChatPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/task/$conversationId', component: TaskPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/projects', component: ProjectsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/projects/$projectId', component: ProjectDetailPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/artifacts', component: ArtifactsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/recents', component: RecentsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/models', component: ModelsPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/discover',
    component: DiscoverPage,
    validateSearch: (search: Record<string, unknown>): { repo?: string; q?: string; author?: string } => ({
      repo: typeof search.repo === 'string' ? search.repo : undefined,
      q: typeof search.q === 'string' ? search.q : undefined,
      author: typeof search.author === 'string' ? search.author : undefined,
    }),
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/settings/$section', component: SettingsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/scheduled', component: () => <ComingSoonPage feature="scheduled" /> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/customize', component: () => <ComingSoonPage feature="customize" /> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/code', component: () => <ComingSoonPage feature="code" /> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/design', component: () => <ComingSoonPage feature="design" /> }),
] as const;

const routeTree = rootRoute.addChildren([...routes]);

export const router = createRouter({ routeTree, history: createHashHistory(), defaultPreload: false });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
