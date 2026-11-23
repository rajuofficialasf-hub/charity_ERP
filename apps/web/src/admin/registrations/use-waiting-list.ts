import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import type { CursorPagination } from '@/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import type { ListPage } from './registrations-api';

/**
 * A list of the registrations page read page by page: the rows loaded so far, the count of the
 * whole list (from its first page), and the "load more" of the table while rows remain.
 */
export function useWaitingList<T>(
  key: readonly unknown[],
  fetchPage: (cursor: string | null) => Promise<ListPage<T>>,
  enabled = true,
) {
  const t = useTranslations('admin.registrations');
  const locale = useLocale() as Locale;
  const list = useInfiniteQuery({
    // the pages under the list's own key, so an invalidation of the list reaches them
    queryKey: [...key, 'pages'],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.meta.nextCursor,
    enabled,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  // the server's count, also its capped "10000+"; the loaded rows while it has none
  const total: number | '10000+' = list.data?.pages[0]?.meta.total ?? rows.length;
  const more = () => {
    if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  };
  const pagination: CursorPagination | undefined = list.hasNextPage
    ? {
        hasPrevious: false,
        hasNext: true,
        onNext: more,
        onLoadMore: more,
        summary: t('shown', {
          shown: formatCount(rows.length, locale),
          total: typeof total === 'number' ? formatCount(total, locale) : total,
        }),
      }
    : undefined;
  return { list, rows, total, pagination };
}
