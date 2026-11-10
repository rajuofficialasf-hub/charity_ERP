import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { PublicSettings } from '../api/schemas';

export type { PublicSettings };

export const PUBLIC_SETTINGS_KEY = ['public-settings'] as const;

/** The public settings, kept for five minutes; the app works with its own defaults until they come. */
export function usePublicSettings() {
  return useQuery({
    queryKey: PUBLIC_SETTINGS_KEY,
    queryFn: () => api<PublicSettings>('/public/settings'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
