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
