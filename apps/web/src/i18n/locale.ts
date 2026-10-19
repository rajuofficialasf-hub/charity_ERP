import {
  isLocale,
  type Locale,
  LOCALE_COOKIE,
  type Messages,
  PSEUDO_LOCALE,
  pseudoLocalize,
} from '@css/shared/i18n';

/**
 * The interface language of this device (I18N 2, D-067 as amended by D-073): the cookie
 * `css_locale` first (E2E and the language switch set it), then `localStorage`, then the system
 * default language the server last named (kept under its own key; docs/DECISION_LOG.md, the admin
 * and settings decision), then bn. The
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

/** The system default language as the server last named it, kept apart from the person's choice. */
const DEFAULT_KEY = 'css_default_locale';

export function writeDefaultLocale(value: Locale): void {
  try {
    window.localStorage.setItem(DEFAULT_KEY, value);
  } catch {
    // Private windows may refuse storage; the server is asked again on the next visit.
  }
}

function readDefaultLocale(): Locale {
  try {
    const value = window.localStorage.getItem(DEFAULT_KEY);
    return isLocale(value) ? value : 'bn';
  } catch {
    return 'bn';
  }
}

/** The locale to render: a stored valid choice, else the system default language, else bn. */
export function readLocale(): Locale {
  const value = storedLocaleValue();
  return isLocale(value) ? value : readDefaultLocale();
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

/**
 * The catalogues this tab has (D-104): the device language's is loaded before the first render,
 * the other one when the person switches, so the first load carries one language.
 */
const loaded = new Map<Locale, Messages>();
const loading = new Map<Locale, Promise<Messages>>();

/** Loads a language's catalogue once; later calls answer the same promise or the cached one. */
export function loadMessages(locale: Locale): Promise<Messages> {
  const ready = loaded.get(locale);
  if (ready) return Promise.resolve(ready);
  let pending = loading.get(locale);
  if (!pending) {
    const load =
      locale === 'en'
        ? import('@css/shared/i18n/en').then((m) => m.en)
        : import('@css/shared/i18n/bn').then((m) => m.bn);
    pending = load.then(
      (messages) => {
        loaded.set(locale, messages);
        loading.delete(locale);
        return messages;
      },
      (error: unknown) => {
        // a failed load (no network on a first visit) is tried again on the next call
        loading.delete(locale);
        throw error;
      },
    );
    loading.set(locale, pending);
  }
  return pending;
}

/** Hands over a catalogue that is already in memory (the tests), so nothing has to load. */
export function primeMessages(locale: Locale, messages: Messages): void {
  loaded.set(locale, messages);
}

/** Forgets every catalogue (tests of the loading). */
export function forgetMessages(): void {
  loaded.clear();
  loading.clear();
}

/**
 * The catalogue for a stored value once it is loaded; `qps` pseudo-localizes bn in development
 * only.
 */
export function messagesFor(
  value: string | undefined,
  dev = import.meta.env.DEV,
): Messages | undefined {
  const messages = loaded.get(value === 'en' ? 'en' : 'bn');
  if (value === PSEUDO && dev && messages) return pseudoLocalize(messages);
  return messages;
}
