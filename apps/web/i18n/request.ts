import { bn, en, isLocale, LOCALE_COOKIE, PSEUDO_LOCALE, pseudoLocalize } from '@css/shared/i18n';
import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

/**
 * next-intl request configuration (I18N 2, D-067): the language comes from the css_locale cookie
 * (set by the language switch; after login from users.language, T1.7), else bn. No locale prefix
 * in URLs. The pseudo-locale `qps` (I18N 4) is honoured only in development.
 */
export default getRequestConfig(async () => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (value === PSEUDO_LOCALE && process.env.NODE_ENV === 'development') {
    return { locale: 'bn', messages: pseudoLocalize(bn) };
  }
  const locale = isLocale(value) ? value : 'bn';
  return { locale, messages: locale === 'en' ? en : bn };
});
