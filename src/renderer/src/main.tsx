import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { queryClient } from './lib/queries';
import { ComputerPill } from './pages/ComputerPill';
import { QuickEntry } from './pages/QuickEntry';
import { router } from './router';
import './styles/globals.css';

// The quick entry window loads the same page with #/quick and shows only the quick composer;
// the computer-use bar loads it with #/computer.
const quick = window.location.hash.startsWith('#/quick');
const computerPill = window.location.hash.startsWith('#/computer');

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>{computerPill ? <ComputerPill /> : quick ? <QuickEntry /> : <RouterProvider router={router} />}</QueryClientProvider>,
);
