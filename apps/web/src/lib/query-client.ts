import { QueryClient } from '@tanstack/react-query';
import { ApiFailure } from './api';

/**
 * Server data cache (RE-FX-02, RE-CMP-03): fresh for 30 seconds, no retry on a client error
 * (4xx), at most two retries otherwise, no refetch when the window regains focus (phones switch
 * apps often and the data is paginated and cheap to refetch on demand).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, error) =>
          !(error instanceof ApiFailure && error.status >= 400 && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}
