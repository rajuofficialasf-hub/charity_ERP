import type { Bilingual, Locale } from '@css/shared/i18n';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** What every visitor reads from the server (docs/DECISION_LOG.md, the admin and settings decision). */
export interface PublicSettings {
  defaultLanguage: Locale;
  organisation: {
    foundationName: Bilingual;
    departmentName: Bilingual;
    address: Bilingual;
    phone: string;
    email: string;
  };
}

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
