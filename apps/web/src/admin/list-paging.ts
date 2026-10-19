import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import type { TablePagination } from '@css/ui';

/** Rows per page of the nationwide tabs. */
export const PAGE_SIZE = 10;
/** The counted range of the totals: page numbers reach this far, later pages go by cursor (D-105). */
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
}): TablePagination {
  const counted = typeof meta.total === 'number' ? meta.total : COUNTED;
  const pageCount = Math.max(1, Math.ceil(counted / PAGE_SIZE), page);
  const numbered = (p: number) => (p - 1) * PAGE_SIZE < COUNTED;
  const from = shown === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const total = meta.total ?? shown;
  return {
    shown,
    total,
    page,
    pageCount,
    onPage: (p) => goTo(p),
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
