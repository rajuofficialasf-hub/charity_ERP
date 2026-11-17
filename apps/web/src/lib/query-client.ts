import { QueryClient } from '@tanstack/react-query';
import { ApiFailure } from '../api/client';

/**
 * Server data cache: fresh for 30 seconds, read once even offline, no retry on a client error
 * (4xx), at most two retries otherwise, no refetch when the window regains focus (phones switch
 * apps often and the data is paginated and cheap to refetch on demand).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // a read runs once even offline, so a page that falls back to the phone's copy
        // (`orCached`) shows it; only the retries wait for the network
        networkMode: 'offlineFirst',
        // a read the phone's copy answered counts as fresh; the network's return reads the
        // server again at once
        refetchOnReconnect: 'always',
        refetchOnWindowFocus: false,
        retry: (count, error) =>
          !(error instanceof ApiFailure && error.status >= 400 && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}
