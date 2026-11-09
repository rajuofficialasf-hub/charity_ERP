import { type Locale, localized } from '@css/shared/i18n';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'use-intl';
import { type MediaList, type MediaListItem, mediaList, mediaListKey } from './media-api';

/** One media list, kept for the session: it changes only in the admin settings. */
export function useMediaList(list: MediaList) {
  return useQuery({
    queryKey: mediaListKey(list),
    queryFn: () => mediaList(list),
    staleTime: 5 * 60_000,
  });
}

/**
 * The names of the stages, production roles and platforms in the page's language; a code the
 * list does not hold (yet) shows as itself.
 */
export function useMediaLabels() {
  const locale = useLocale() as Locale;
  const stages = useMediaList('media_stage');
  const roles = useMediaList('media_role');
  const platforms = useMediaList('media_platform');
  const labelOf = (items: MediaListItem[] | undefined) => (code: string) => {
    const item = items?.find((i) => i.code === code);
    return item ? localized(item.label, locale) : code;
  };
  return {
    stage: labelOf(stages.data),
    role: labelOf(roles.data),
    platform: labelOf(platforms.data),
    platformKind: (code: string) => platforms.data?.find((i) => i.code === code)?.kind ?? null,
    stages: stages.data ?? [],
    roles: roles.data ?? [],
    platforms: platforms.data ?? [],
  };
}
