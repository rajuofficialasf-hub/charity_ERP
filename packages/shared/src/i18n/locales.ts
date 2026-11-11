/**
 * Supported interface languages (docs/ui/I18N.md, "Languages and locale resolution"). A
 * third language is added here first (docs/ui/I18N.md, "Adding a third language").
 */
export const SUPPORTED_LOCALES = ['bn', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'bn';

/** Name of the cookie that carries the web app's language. */
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
 * Language of an API response (docs/api/API_STANDARDS.md, "Validation and localization"):
 * Accept-Language if it names a supported language, else the authenticated user's stored language,
 * else bn.
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
