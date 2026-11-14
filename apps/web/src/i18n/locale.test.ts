import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bn,
  en,
  NAMESPACES,
  REST_NAMESPACES,
  type RestMessages,
  START_NAMESPACES,
} from '@css/shared/i18n';
import {
  forgetMessages,
  languageReady,
  loadCatalogue,
  loadLanguage,
  loadMessages,
  loadRest,
  messagesFor,
  noteShownLanguage,
  primeMessages,
  readLocale,
  storedLocaleValue,
  withRest,
  writeDefaultLocale,
  writeLocale,
} from './locale';

// The English rest part, failing as often as a test asks (a lost network on a first visit).
const network = vi.hoisted(() => ({ failures: 0 }));
vi.mock('@css/shared/i18n/en-rest', async (importOriginal) => {
  const real = await importOriginal<{ enRest: RestMessages }>();
  return {
    get enRest() {
      if (network.failures > 0) {
        network.failures -= 1;
        throw new Error('offline');
      }
      return real.enRest;
    },
  };
});

const clear = () => {
  document.cookie = 'css_locale=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  window.localStorage.clear();
};

// The device language (docs/ui/I18N.md, "Languages and locale resolution"): cookie, then
// localStorage, then bn.
describe('device locale', () => {
  afterEach(clear);

  it('falls back to bn, then reads localStorage, then prefers the cookie', () => {
    expect(readLocale()).toBe('bn');
    window.localStorage.setItem('css_locale', 'en');
    expect(readLocale()).toBe('en');
    document.cookie = 'css_locale=bn; path=/';
    expect(readLocale()).toBe('bn');
  });

  it('falls back to the system default language the server last named, never to an invalid one', () => {
    writeDefaultLocale('en');
    expect(readLocale()).toBe('en');
    expect(storedLocaleValue()).toBeUndefined();
    window.localStorage.setItem('css_default_locale', 'fr');
    expect(readLocale()).toBe('bn');
    window.localStorage.setItem('css_locale', 'bn');
    window.localStorage.setItem('css_default_locale', 'en');
    expect(readLocale()).toBe('bn');
  });

  it('ignores unknown values and writes both stores', () => {
    document.cookie = 'css_locale=fr; path=/';
    expect(readLocale()).toBe('bn');
    writeLocale('en');
    expect(document.cookie).toContain('css_locale=en');
    expect(window.localStorage.getItem('css_locale')).toBe('en');
    expect(storedLocaleValue()).toBe('en');
  });

  it('pseudo-localizes only in development', () => {
    expect(messagesFor('qps', true)?.common.app.name).not.toBe(messagesFor('bn')?.common.app.name);
    expect(messagesFor('qps', false)).toBe(messagesFor('bn'));
    expect(messagesFor('en')?.common.language.label).toBe('Language');
  });
});

// One language at a time, in two parts (docs/ui/I18N.md, "Typed keys and loading"): the device
// language's start part is loaded before the first render, its rest with the first page after the
// login, the other language when the person switches.
describe('loading a catalogue', () => {
  afterEach(() => {
    forgetMessages();
    primeMessages('bn', bn);
    primeMessages('en', en);
  });

  it('loads the start part of a language once and answers it alone', async () => {
    forgetMessages();
    expect(messagesFor('en')).toBeUndefined();
    const first = loadMessages('en');
    expect(loadMessages('en')).toBe(first);
    const start = await first;
    expect(Object.keys(start).sort()).toEqual([...START_NAMESPACES].sort());
    expect(start.common.language.label).toBe('Language');
    expect(messagesFor('en')?.common.language.label).toBe('Language');
    expect(messagesFor('en')).not.toHaveProperty('home');
    expect(messagesFor('bn')).toBeUndefined();
    await expect(loadMessages('en')).resolves.toBe(start);
  });

  it('merges the rest into the messages once it is loaded, loading it once', async () => {
    forgetMessages();
    await loadMessages('bn');
    const before = messagesFor('bn');
    const pending = loadRest('bn');
    expect(loadRest('bn')).toBe(pending);
    const restPart = await pending;
    expect(Object.keys(restPart).sort()).toEqual([...REST_NAMESPACES].sort());
    const whole = messagesFor('bn');
    expect(whole).not.toBe(before);
    expect(Object.keys(whole ?? {}).sort()).toEqual([...NAMESPACES].sort());
    expect(whole?.home).toEqual(bn.home);
    expect(whole?.auth).toEqual(bn.auth);
    // the merge is kept, so use-intl gets the same object on every render
    expect(messagesFor('bn')).toBe(whole);
    await expect(loadRest('bn')).resolves.toBe(restPart);
  });

  it('answers the whole catalogue of a language from both parts', async () => {
    forgetMessages();
    const whole = await loadCatalogue('en');
    expect(whole).toEqual(en);
  });

  it('tries a failed part again on the next call', async () => {
    forgetMessages();
    network.failures = 1;
    await expect(loadRest('en')).rejects.toThrow('offline');
    expect(languageReady('en')).toBe(false);
    await expect(loadRest('en')).resolves.toEqual(
      Object.fromEntries(REST_NAMESPACES.map((name) => [name, en[name]])),
    );
  });

  it('makes a page wait for the rest of the language shown', async () => {
    forgetMessages();
    await loadMessages('en');
    noteShownLanguage('en');
    const page = await withRest(Promise.resolve('page'));
    expect(page).toBe('page');
    expect(messagesFor('en')?.nav).toEqual(en.nav);
    expect(messagesFor('bn')).toBeUndefined();
  });

  it('waits for the rest of a switched-to language once a page has asked for the rest', async () => {
    forgetMessages();
    await loadMessages('bn');
    expect(languageReady('bn')).toBe(true);
    await loadLanguage('en');
    // before any page asked for the rest, the start part is enough
    expect(languageReady('en')).toBe(true);
    noteShownLanguage('en');
    await withRest(Promise.resolve(null));
    expect(languageReady('bn')).toBe(false);
    await loadLanguage('bn');
    expect(languageReady('bn')).toBe(true);
    expect(messagesFor('bn')?.home).toEqual(bn.home);
  });

  it('answers a primed catalogue without loading it', async () => {
    forgetMessages();
    primeMessages('bn', bn);
    expect(messagesFor('bn')).toBe(bn);
    await expect(loadMessages('bn')).resolves.toBe(bn);
    expect(languageReady('bn')).toBe(true);
  });
});
