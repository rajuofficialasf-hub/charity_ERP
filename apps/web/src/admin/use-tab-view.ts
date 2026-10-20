import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';

/**
 * The view of a nationwide tab (the volunteer and the beneficiary tab): the filters live in the
 * page URL, so a reload or a shared link shows the same view; the search term never does (it may
 * be a mobile number or an NID); a page cursor belongs to the filters and the search it was made
 * for, so any other view starts at the first page, however the URL changed.
 */
export function useTabView<Key extends string>(keys: readonly Key[]) {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const view = `${params.toString()}|${q}`;
  // the page belongs to the filters and the search it was opened for: a page number inside the
  // counted range, or a cursor past it
  const [paging, setPaging] = useState<{ view: string; page: number; cursor: string | null }>({
    view,
    page: 1,
    cursor: null,
  });
  const current = paging.view === view ? paging : { view, page: 1, cursor: null };
  const filters: Partial<Record<Key, string>> = Object.fromEntries(
    keys.flatMap((key) => {
      const value = params.get(key);
      return value ? [[key, value]] : [];
    }),
  ) as Partial<Record<Key, string>>;
  const setFilters = (next: Partial<Record<Key, string>>) => {
    const out = new URLSearchParams();
    for (const key of keys) {
      // eslint-disable-next-line security/detect-object-injection -- a fixed list of filter keys
      const value = next[key];
      if (value) out.set(key, value);
    }
    setParams(out, { replace: true });
  };
  return {
    filters,
    setFilters,
    /** Changes some filters and keeps the others. */
    change: (patch: Partial<Record<Key, string | undefined>>) =>
      setFilters({ ...filters, ...patch } as Partial<Record<Key, string>>),
    q,
    onSearch: useCallback((term: string) => setQ(term), []),
    cursor: current.cursor,
    setCursor: (cursor: string | null) => setPaging({ view, page: 1, cursor }),
    /** The page number shown, 1 for the first. */
    page: current.page,
    /** Opens a page by its number, or by a cursor for a page past the counted range. */
    goTo: (page: number, cursor: string | null = null) => setPaging({ view, page, cursor }),
    /** How many filters are set, leaving out the given ones (a chip row of its own). */
    activeCount: (except: readonly Key[] = []) =>
      keys.filter((key) => !except.includes(key) && filters[key] !== undefined).length,
  };
}
