import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { queryClient } from './lib/queries';
import { QuickEntry } from './pages/QuickEntry';
import { router } from './router';
import './styles/globals.css';

// The quick entry window loads the same page with #/quick and shows only the quick composer.
const quick = window.location.hash.startsWith('#/quick');

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>{quick ? <QuickEntry /> : <RouterProvider router={router} />}</QueryClientProvider>,
);
