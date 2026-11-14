import {
  isLocale,
  type Locale,
  LOCALE_COOKIE,
  type Messages,
  PSEUDO_LOCALE,
  pseudoLocalize,
  type RestMessages,
  type StartMessages,
} from '@css/shared/i18n';

/**
 * The interface language of this device (docs/ui/I18N.md, "Languages and locale resolution"): the
 * cookie
 * `css_locale` first (E2E and the language switch set it), then `localStorage`, then the system
 * default language the server last named (kept under its own key; docs/DECISION_LOG.md, the admin
 * and settings decision), then bn. The pseudo-locale `qps` (docs/ui/I18N.md, "No hard-coded
 * strings: rule and enforcement") is honoured only in `vite dev`. After login the account's
 * language is written here, so the choice follows the user.
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
 * The catalogue parts this tab has (docs/ui/I18N.md, "Typed keys and loading"). Each language comes
 * in two parts: the start part (the sign-in page and the frame around every page) is loaded before
 * the first render, the rest with the first page that is not the sign-in page (every lazy route
 * waits for it, `withRest`). The other language loads when the person switches, so the first load
 * carries one language and only its start part.
 */
interface Part<T> {
  loaded: Map<Locale, T>;
  loading: Map<Locale, Promise<T>>;
  load: (locale: Locale) => Promise<T>;
}

const start: Part<StartMessages> = {
  loaded: new Map(),
  loading: new Map(),
  load: (locale) =>
    locale === 'en'
      ? import('@css/shared/i18n/en-start').then((m) => m.enStart)
      : import('@css/shared/i18n/bn-start').then((m) => m.bnStart),
};

const rest: Part<RestMessages> = {
  loaded: new Map(),
  loading: new Map(),
  load: (locale) =>
    locale === 'en'
      ? import('@css/shared/i18n/en-rest').then((m) => m.enRest)
      : import('@css/shared/i18n/bn-rest').then((m) => m.bnRest),
};

/** The messages of each language as handed to use-intl: the merge of its loaded parts. */
const merged = new Map<Locale, Messages>();
/** Whether a page has asked for the rest; from then on a switch loads the new language's rest too. */
let restWanted = false;
/** The language of the catalogue the provider shows, once it has shown one. */
let shownLanguage: Locale | undefined;

const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version += 1;
  for (const listener of listeners) listener();
};

/** Tells the subscriber when a part arrives or the rest is first asked for (the provider renders). */
export function subscribeCatalogue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A number that changes with every arrival, the snapshot of `subscribeCatalogue`. */
export function catalogueVersion(): number {
  return version;
}

/** Loads one part of a language once; later calls answer the same promise or the cached part. */
function loadPart<T>(part: Part<T>, locale: Locale): Promise<T> {
  const ready = part.loaded.get(locale);
  if (ready) return Promise.resolve(ready);
  let pending = part.loading.get(locale);
  if (!pending) {
    pending = part.load(locale).then(
      (messages) => {
        part.loaded.set(locale, messages);
        part.loading.delete(locale);
        merged.delete(locale);
        changed();
        return messages;
      },
      (error: unknown) => {
        // a failed load (no network on a first visit) is tried again on the next call
        part.loading.delete(locale);
        throw error;
      },
    );
    part.loading.set(locale, pending);
  }
  return pending;
}

/** Loads a language's start part once; it answers once the start part is in. */
export function loadMessages(locale: Locale): Promise<StartMessages> {
  return loadPart(start, locale);
}

/** Loads a language's rest part once; a failed load is tried again on the next call. */
export function loadRest(locale: Locale): Promise<RestMessages> {
  if (!restWanted) {
    restWanted = true;
    changed();
  }
  return loadPart(rest, locale);
}

/** Loads both parts of a language and answers its whole catalogue (the form builder's preview). */
export async function loadCatalogue(locale: Locale): Promise<Messages> {
  await Promise.all([loadMessages(locale), loadRest(locale)]);
  return mergedOf(locale)!;
}

/**
 * The language whose rest a page waits for: the one the provider shows, or the device language
 * before the provider has shown one (the router starts loading the first page before the first
 * render).
 */
export function restLanguage(): Locale {
  return shownLanguage ?? readLocale();
}

/**
 * A lazy page's module together with the rest of the catalogue of the shown language, both loaded
 * at the same time; the page renders only when both are in, so it never shows a key.
 */
export async function withRest<T>(module: Promise<T>): Promise<T> {
  const [loaded] = await Promise.all([module, loadRest(restLanguage())]);
  // the language shown may have changed meanwhile (the router asked before the first render)
  const shown = restLanguage();
  if (!rest.loaded.has(shown)) await loadRest(shown);
  return loaded;
}

/**
 * Loads what a language needs before it is shown: its start part, and its rest part too once a page
 * has asked for the rest (a switch never shows a page without its texts).
 */
export function loadLanguage(locale: Locale): Promise<unknown> {
  return Promise.all([loadMessages(locale), restWanted ? loadRest(locale) : undefined]);
}

/** Whether a language has every part it needs to be shown (see `loadLanguage`). */
export function languageReady(locale: Locale): boolean {
  return start.loaded.has(locale) && (rest.loaded.has(locale) || !restWanted);
}

/** Notes the language of the catalogue the provider shows (the rest a page waits for follows it). */
export function noteShownLanguage(locale: Locale): void {
  shownLanguage = locale;
}

/**
 * Hands over a whole catalogue that is already in memory (the tests), so nothing has to load: it
 * counts as both parts.
 */
export function primeMessages(locale: Locale, messages: Messages): void {
  start.loaded.set(locale, messages);
  rest.loaded.set(locale, messages);
  merged.set(locale, messages);
  changed();
}

/** Forgets every part and what was shown (tests of the loading). */
export function forgetMessages(): void {
  for (const part of [start, rest] as Part<unknown>[]) {
    part.loaded.clear();
    part.loading.clear();
  }
  merged.clear();
  restWanted = false;
  shownLanguage = undefined;
  changed();
}

/**
 * The messages of a language: its start part with its rest when that has arrived. The type is the
 * whole catalogue's (the typed keys); before the rest arrives only the sign-in page and the frame
 * render, and they use the start part alone.
 */
function mergedOf(locale: Locale): Messages | undefined {
  const cached = merged.get(locale);
  if (cached) return cached;
  const first = start.loaded.get(locale);
  if (!first) return undefined;
  const messages = { ...first, ...rest.loaded.get(locale) } as Messages;
  merged.set(locale, messages);
  return messages;
}

/** The language of the catalogue a stored value renders: `qps` renders bn. */
export function catalogueLanguage(value: string | undefined): Locale {
  return value === 'en' ? 'en' : 'bn';
}

/**
 * The language and catalogue to render: the wanted one once it has what it needs, else the
 * language shown so far (a switch in progress, or a page waiting for its rest), else whatever is
 * loaded, else nothing yet.
 */
export function shownCatalogue(
  key: string | undefined,
  wanted: Locale,
): { locale: Locale; language: Locale; messages: Messages } | undefined {
  const language = catalogueLanguage(key);
  const messages = messagesFor(key);
  if (messages && (languageReady(language) || shownLanguage === language))
    return { locale: wanted, language, messages };
  const before = shownLanguage && mergedOf(shownLanguage);
  if (shownLanguage && before)
    return { locale: shownLanguage, language: shownLanguage, messages: before };
  if (messages) return { locale: wanted, language, messages };
  const other: Locale = language === 'en' ? 'bn' : 'en';
  const fallback = mergedOf(other);
  return fallback ? { locale: other, language: other, messages: fallback } : undefined;
}

/**
 * The catalogue for a stored value once its start part is loaded (with the rest when that has
 * arrived); `qps` pseudo-localizes bn in development only.
 */
export function messagesFor(
  value: string | undefined,
  dev = import.meta.env.DEV,
): Messages | undefined {
  const messages = mergedOf(catalogueLanguage(value));
  if (value === PSEUDO && dev && messages) return pseudoLocalize(messages);
  return messages;
}
