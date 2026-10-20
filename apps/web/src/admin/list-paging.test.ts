import { describe, expect, it, vi } from 'vitest';
import { numberedPaging, pageParams } from './list-paging';

const summary = ({ from, to, total }: { from: string; to: string; total: string }) =>
  `${from}-${to}/${total}`;

describe('the numbered pager of a nationwide tab', () => {
  it('opens a page by its number inside the counted range, and the first page without one', () => {
    expect(pageParams(1, null)).toEqual({});
    expect(pageParams(3, null)).toEqual({ page: '3' });
    expect(pageParams(1002, 'abc')).toEqual({ cursor: 'abc' });
  });

  it('counts the pages and says which rows it shows', () => {
    const goTo = vi.fn();
    const paging = numberedPaging({
      meta: { nextCursor: 'n', prevCursor: 'p', total: 23 },
      shown: 10,
      page: 2,
      goTo,
      summary,
      locale: 'en',
    });
    expect(paging.pageCount).toBe(3);
    expect(paging.summary).toBe('11-20/23');
    paging.onPage?.(3);
    expect(goTo).toHaveBeenLastCalledWith(3);
  });

  it('does nothing for the page already shown, and opens the last numbered page for one past the counted range', () => {
    const goTo = vi.fn();
    const paging = numberedPaging({
      meta: { nextCursor: 'n', prevCursor: 'p', total: '10000+' },
      shown: 10,
      page: 1002,
      goTo,
      summary,
      locale: 'en',
    });
    paging.onPage?.(1002);
    expect(goTo).not.toHaveBeenCalled();
    paging.onPage?.(1001);
    expect(goTo).toHaveBeenLastCalledWith(1000);
    // the steps past the counted range go by cursor
    paging.onPrevious?.();
    expect(goTo).toHaveBeenLastCalledWith(1001, 'p');
  });
});
