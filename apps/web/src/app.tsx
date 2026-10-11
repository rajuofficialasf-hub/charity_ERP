import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { AppProviders } from './components/AppProviders';
import { LocaleProvider } from './i18n/LocaleProvider';
import { AuthProvider } from './lib/auth';
import { createQueryClient } from './lib/query-client';
import { router } from './routes';

/** Provider tree of the PWA: server-data cache, language, design system, session, router. */
export function App() {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <AppProviders>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </AppProviders>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
