import { afterEach, describe, expect, it } from 'vitest';
import {
  messagesFor,
  readLocale,
  storedLocaleValue,
  writeDefaultLocale,
  writeLocale,
} from './locale';

const clear = () => {
  document.cookie = 'css_locale=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  window.localStorage.clear();
};

// The device language (I18N 2, D-067 amended by D-073): cookie, then localStorage, then bn.
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

  it('pseudo-localizes only in development (I18N 4)', () => {
    expect(messagesFor('qps', true).common.app.name).not.toBe(messagesFor('bn').common.app.name);
    expect(messagesFor('qps', false)).toBe(messagesFor('bn'));
    expect(messagesFor('en').common.language.label).toBe('Language');
  });
});
