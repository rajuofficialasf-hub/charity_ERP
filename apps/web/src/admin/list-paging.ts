import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import type { CursorPagination } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';

/** Rows per page of the nationwide tabs. */
export const PAGE_SIZE = 10;
/**
 * The counted range of the totals: page numbers reach this far, later pages go by cursor
 * (docs/DECISION_LOG.md, page numbers on the volunteer and beneficiary lists).
 */
const COUNTED = 10_000;

interface Meta {
  nextCursor: string | null;
  prevCursor: string | null;
  total?: number | '10000+';
}

/** The page or the cursor of a request: a cursor only for a page past the counted range. */
export const pageParams = (page: number, cursor: string | null) =>
  cursor ? { cursor } : page > 1 ? { page: String(page) } : {};

/**
 * The numbered pager of a nationwide tab: the page numbers of the counted rows, the steps before
 * and after (by number inside the counted range, by cursor past it) and the count line.
 */
export function numberedPaging({
  meta,
  shown,
  page,
  goTo,
  summary,
  locale,
}: {
  meta: Meta;
  shown: number;
  page: number;
  goTo: (page: number, cursor?: string | null) => void;
  summary: (values: { from: string; to: string; total: string }) => string;
  locale: Locale;
}): CursorPagination {
  const counted = typeof meta.total === 'number' ? meta.total : COUNTED;
  const pageCount = Math.max(1, Math.ceil(counted / PAGE_SIZE), page);
  const numbered = (p: number) => (p - 1) * PAGE_SIZE < COUNTED;
  const from = shown === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const total = meta.total ?? shown;
  return {
    page,
    pageCount,
    onPage: (p) => {
      if (p !== page) goTo(numbered(p) ? p : COUNTED / PAGE_SIZE);
    },
    hasPrevious: page > 1,
    hasNext: meta.nextCursor !== null,
    onPrevious: () => (numbered(page - 1) ? goTo(page - 1) : goTo(page - 1, meta.prevCursor)),
    onNext: () => (numbered(page + 1) ? goTo(page + 1) : goTo(page + 1, meta.nextCursor)),
    summary: summary({
      from: formatCount(from, locale),
      to: formatCount(from === 0 ? 0 : from + shown - 1, locale),
      total: typeof total === 'number' ? formatCount(total, locale) : total,
    }),
  };
}

/**
 * The count line of a list read by cursor ("25টির মধ্যে 25টি"): the rows shown and the total, or
 * "25+" while another page follows a list that keeps no total.
 */
export function useCountLine(): (shown: number, total: number | 'more' | undefined) => string {
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  return (shown, total) =>
    tc('list.result_count', {
      shown: formatCount(shown, locale),
      total:
        total === 'more' ? `${formatCount(shown, locale)}+` : formatCount(total ?? shown, locale),
    });
}
