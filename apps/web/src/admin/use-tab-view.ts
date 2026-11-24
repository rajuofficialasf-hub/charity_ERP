import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { COUNTED, PAGE_SIZE } from './list-paging';

/** A page number of the counted range read from the address, or 1. */
function pageOf(raw: string | null): number {
  if (!raw || !/^[1-9][0-9]{0,4}$/.test(raw)) return 1;
  const page = Number(raw);
  return (page - 1) * PAGE_SIZE < COUNTED ? page : 1;
}

/**
 * The view of a nationwide tab (the volunteer and the beneficiary tab): the filters and the page
 * number live in the page URL, so a reload, the back button or a shared link shows the same view.
 * The search term is never written there (it may be a mobile number or an NID); a link that
 * brings one (`?q=`) starts the search with it, and the term then leaves the address. A page past
 * the counted range goes by a cursor held in memory; any other view starts at the first page.
 */
export function useTabView<Key extends string>(keys: readonly Key[]) {
  const [params, setParams] = useSearchParams();
  // a term a link brought is read once, on the first render
  const [initialSearch] = useState(() => {
    const term = params.get('q')?.trim() ?? '';
    return term.length >= 2 ? term : '';
  });
  const [q, setQ] = useState(initialSearch);
  const searched = useRef(initialSearch);
  useEffect(() => {
    if (!params.has('q')) return;
    const out = new URLSearchParams(params);
    out.delete('q');
    setParams(out, { replace: true });
  }, [params, setParams]);
  const filters: Partial<Record<Key, string>> = Object.fromEntries(
    keys.flatMap((key) => {
      const value = params.get(key);
      return value ? [[key, value]] : [];
    }),
  ) as Partial<Record<Key, string>>;
  // the view a page belongs to: the filters and the search, not the page itself
  const view = `${JSON.stringify(filters)}|${q}`;
  const urlPage = pageOf(params.get('page'));
  // a page past the counted range, with the cursor it was opened by
  const [deep, setDeep] = useState<{ view: string; page: number; cursor: string } | null>(null);
  const current =
    deep && deep.view === view ? deep : { view, page: urlPage, cursor: null as string | null };
  const paramsWith = (next: Partial<Record<Key, string>>, page: number) => {
    const out = new URLSearchParams();
    for (const key of keys) {
      // eslint-disable-next-line security/detect-object-injection -- a fixed list of filter keys
      const value = next[key];
      if (value) out.set(key, value);
    }
    if (page > 1) out.set('page', String(page));
    return out;
  };
  // a change of the filters starts at the first page
  const setFilters = (next: Partial<Record<Key, string>>) =>
    setParams(paramsWith(next, 1), { replace: true });
  const goTo = (page: number, cursor: string | null = null) => {
    if (cursor) {
      setDeep({ view, page, cursor });
      return;
    }
    setDeep(null);
    // each page is a step of the history, so the back button returns to the page before
    setParams(paramsWith(filters, page));
  };
  const onSearch = useCallback(
    (term: string) => {
      if (term === searched.current) return;
      searched.current = term;
      setQ(term);
      // another search starts at the first page
      setParams(
        (prev) => {
          if (!prev.has('page')) return prev;
          const out = new URLSearchParams(prev);
          out.delete('page');
          return out;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return {
    filters,
    setFilters,
    /** Changes some filters and keeps the others. */
    change: (patch: Partial<Record<Key, string | undefined>>) =>
      setFilters({ ...filters, ...patch } as Partial<Record<Key, string>>),
    q,
    /** The search a link brought, for the search box to show. */
    initialSearch,
    onSearch,
    cursor: current.cursor,
    setCursor: (cursor: string | null) =>
      cursor ? setDeep({ view, page: 1, cursor }) : setDeep(null),
    /** The page number shown, 1 for the first. */
    page: current.page,
    /** Opens a page by its number, or by a cursor for a page past the counted range. */
    goTo,
    /** How many filters are set, leaving out the given ones (a chip row of its own). */
    activeCount: (except: readonly Key[] = []) =>
      keys.filter((key) => !except.includes(key) && filters[key] !== undefined).length,
  };
}
