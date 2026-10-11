/** Supported interface languages (L-locale, I18N.md 2). A third language is added here first (I18N 11). */
export const SUPPORTED_LOCALES = ['bn', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'bn';

/** Name of the cookie that carries the web app's language (D-067). */
export const LOCALE_COOKIE = 'css_locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** The first supported language of an Accept-Language header, by quality, or null. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of ranked) {
    const primary = tag.split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return null;
}

/**
 * Language of an API response (I18N 2, API_STANDARDS 7): Accept-Language if it names a supported
 * language, else the authenticated user's stored language, else bn.
 */
export function resolveLocale(
  acceptLanguage: string | null | undefined,
  userLanguage?: string | null,
): Locale {
  return (
    localeFromAcceptLanguage(acceptLanguage) ??
    (isLocale(userLanguage) ? userLanguage : DEFAULT_LOCALE)
  );
}
