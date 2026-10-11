import {
  bn,
  en,
  isLocale,
  type Locale,
  LOCALE_COOKIE,
  type Messages,
  PSEUDO_LOCALE,
  pseudoLocalize,
} from '@css/shared/i18n';

/**
 * The interface language of this device (I18N 2, D-067 as amended by D-073): the cookie
 * `css_locale` first (E2E and the language switch set it), then `localStorage`, then bn. The
 * pseudo-locale `qps` (I18N 4) is honoured only in `vite dev`. After login the account's language
 * is written here, so the choice follows the user (O-56).
 */
export const PSEUDO = PSEUDO_LOCALE;
const ONE_YEAR = 60 * 60 * 24 * 365;

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const part = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : undefined;
}

function readStorage(): string | undefined {
  try {
    return window.localStorage.getItem(LOCALE_COOKIE) ?? undefined;
  } catch {
    return undefined;
  }
}

/** The stored choice as written (`bn`, `en`, or `qps` in development), or undefined. */
export function storedLocaleValue(): string | undefined {
  return readCookie(LOCALE_COOKIE) ?? readStorage();
}

/** The locale to render: a stored valid choice or bn. */
export function readLocale(): Locale {
  const value = storedLocaleValue();
  return isLocale(value) ? value : 'bn';
}

/** Stores the choice on this device (cookie for the first paint of every tab, localStorage copy). */
export function writeLocale(value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`;
  try {
    window.localStorage.setItem(LOCALE_COOKIE, value);
  } catch {
    // Private windows may refuse storage; the cookie still carries the choice.
  }
}

/** The catalogue for a stored value; `qps` pseudo-localizes bn in development only. */
export function messagesFor(value: string | undefined, dev = import.meta.env.DEV): Messages {
  if (value === PSEUDO && dev) return pseudoLocalize(bn);
  return value === 'en' ? en : bn;
}
