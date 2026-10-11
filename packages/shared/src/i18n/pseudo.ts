/**
 * Pseudo-locale for development only (I18N 4): every catalogue text is wrapped in markers, so any
 * unmarked text on screen is hard-coded. Placeholders stay intact because the whole message is
 * wrapped, not its parts. Never offered to users or shipped to production.
 */
export const PSEUDO_LOCALE = 'qps';

export function pseudoLocalize<T>(tree: T): T {
  if (typeof tree === 'string') return `[!! ${tree} !!]` as T;
  if (typeof tree !== 'object' || tree === null) return tree;
  return Object.fromEntries(
    Object.entries(tree as Record<string, unknown>).map(([key, value]) => [
      key,
      pseudoLocalize(value),
    ]),
  ) as T;
}
