import { vi } from 'vitest';

/**
 * A browser whose media queries answer by `matches`, with both listener APIs a real browser has: the
 * current one and the older `addListener`, which MUI's colour scheme still calls.
 */
export function stubMatchMedia(matches: (query: string) => boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: matches(query),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

/**
 * A light screen this many pixels wide (1280 by default, a desktop): the queries of the shell's
 * width and of MUI's breakpoints answer as such a screen would.
 */
export function stubScreen(width = 1280): void {
  stubMatchMedia((query) => {
    if (query.includes('prefers-color-scheme')) return false;
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
  });
}
