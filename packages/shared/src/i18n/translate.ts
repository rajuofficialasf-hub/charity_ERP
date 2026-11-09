/* eslint-disable security/detect-object-injection -- keys are typed unions, or checked with Object.hasOwn before use */
import { IntlMessageFormat } from 'intl-messageformat';
import { bn, en, type Messages } from './catalogue.js';
import { DEFAULT_LOCALE, type Locale } from './locales.js';

/** Every dotted key of a message tree, for example `errors.validation.nid_format`. */
export type KeyPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : KeyPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = KeyPaths<Messages>;

/** Parameter values: numbers and dates arrive already formatted as strings (I18N 3.3). */
export type MessageParams = Record<string, string | number>;

export type Catalogues = Record<Locale, object>;

/** The generic message shown when a key is missing everywhere (I18N 8). */
const LAST_RESORT_KEY = 'common.state.error.text';

function lookup(tree: object, key: string): string | undefined {
  let node: unknown = tree;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, part)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export interface Translator {
  (locale: Locale, key: string, params?: MessageParams): string;
  /** Keys already reported as missing (logged once per process, I18N 8). */
  readonly missing: ReadonlySet<string>;
}

/**
 * Builds a translator over a set of catalogues. Fallback (I18N 8): a key missing in the requested
 * language uses bn and is reported once; a key missing in bn too shows the generic error text.
 * Plural rules use the language; numbers are never formatted here.
 */
export function createTranslator(
  catalogues: Catalogues,
  onMissing: (key: string, locale: Locale) => void = (key, locale) =>
    // packages/shared has no DOM or Node types; console exists in every runtime it runs in.
    (globalThis as { console?: { warn: (message: string) => void } }).console?.warn(
      `[i18n] missing message "${key}" in "${locale}"`,
    ),
): Translator {
  const cache = new Map<string, IntlMessageFormat>();
  const missing = new Set<string>();
  const report = (key: string, locale: Locale) => {
    const id = `${locale}:${key}`;
    if (missing.has(id)) return;
    missing.add(id);
    onMissing(key, locale);
  };
  const translate = ((locale: Locale, key: string, params?: MessageParams) => {
    let message = lookup(catalogues[locale], key);
    let used: Locale = locale;
    if (message === undefined) {
      report(key, locale);
      message = locale === DEFAULT_LOCALE ? undefined : lookup(catalogues[DEFAULT_LOCALE], key);
      used = DEFAULT_LOCALE;
      if (message === undefined) {
        if (locale !== DEFAULT_LOCALE) report(key, DEFAULT_LOCALE);
        message =
          lookup(catalogues[locale], LAST_RESORT_KEY) ??
          lookup(catalogues[DEFAULT_LOCALE], LAST_RESORT_KEY) ??
          '';
        used = locale;
      }
    }
    const id = `${used}\u0000${message}`;
    let format = cache.get(id);
    if (!format) {
      format = new IntlMessageFormat(message, used);
      cache.set(id, format);
    }
    return String(format.format(params));
  }) as Translator;
  Object.defineProperty(translate, 'missing', { get: () => missing });
  return translate;
}

const shared = createTranslator({ bn, en });

/** Server-side t(): the catalogue message of a key in a language (API, worker, tests). */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  return shared(locale, key, params);
}
