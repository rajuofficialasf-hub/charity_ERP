import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_TEMPLATES } from '../src/notifications/templates.js';
import {
  BILINGUAL_COLUMNS,
  bilingualText,
  bn,
  checkCatalogue,
  createTranslator,
  en,
  localized,
  localizedColumn,
  NAMESPACES,
  normalizedText,
  pseudoLocalize,
  recipientLocale,
  renderNotification,
  resolveLocale,
  REST_NAMESPACES,
  START_NAMESPACES,
  stateLabel,
  translate,
} from '../src/i18n/index.js';
import { bn as bnAlone } from '../src/i18n/bn.js';
import { bnRest } from '../src/i18n/bn-rest.js';
import { bnStart } from '../src/i18n/bn-start.js';
import { en as enAlone } from '../src/i18n/en.js';
import { enRest } from '../src/i18n/en-rest.js';
import { enStart } from '../src/i18n/en-start.js';

const repo = join(__dirname, '../../..');

// The web app loads one language at a time through these entries; each must be the same catalogue
// the server and the checks use, and must carry no other language.
describe('one catalogue per language entry', () => {
  it('gives the same Bengali and English catalogues as the shared entry', () => {
    expect(bnAlone).toBe(bn);
    expect(enAlone).toBe(en);
    expect(enAlone.common.language.label).toBe('Language');
    expect(bnAlone.common.language.label).toBe('ভাষা');
  });

  it('keeps each entry free of the other language', () => {
    // the imports that load code (a type import loads nothing)
    const imports = (file: string) =>
      readFileSync(join(__dirname, '../src/i18n', file), 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('import ') && !line.startsWith('import type '))
        .join('\n');
    for (const file of ['catalogue-bn.ts', 'bn-start.ts', 'bn-rest.ts'])
      expect(imports(file)).not.toMatch(/messages\/en\/|'\.\/(en-|catalogue-en)/);
    for (const file of ['catalogue-en.ts', 'en-start.ts', 'en-rest.ts'])
      expect(imports(file)).not.toMatch(/messages\/bn\/|'\.\/(bn-|catalogue-bn)/);
    // and the parts load nothing but their own JSON files
    for (const file of ['bn-start.ts', 'bn-rest.ts', 'en-start.ts', 'en-rest.ts'])
      expect(imports(file)).not.toMatch(/from '\.\/[^m]/);
  });
});

// The web app loads each language in two parts: the start part before the first render, the rest
// with every page but the sign-in page. Together they are the whole catalogue, each namespace once.
describe('the start and rest parts of a language', () => {
  const sorted = (names: readonly string[]) => [...names].sort();

  it('names every namespace of the catalogue, each in exactly one part', () => {
    expect(sorted(NAMESPACES)).toEqual(sorted(Object.keys(bn)));
    expect(sorted(NAMESPACES)).toEqual(sorted(Object.keys(en)));
    expect(sorted([...START_NAMESPACES, ...REST_NAMESPACES])).toEqual(sorted(NAMESPACES));
    const rest = new Set<string>(REST_NAMESPACES);
    expect(START_NAMESPACES.filter((name) => rest.has(name))).toEqual([]);
  });

  it('gives each part exactly its namespaces, in both languages', () => {
    for (const start of [bnStart, enStart])
      expect(sorted(Object.keys(start))).toEqual(sorted(START_NAMESPACES));
    for (const rest of [bnRest, enRest])
      expect(sorted(Object.keys(rest))).toEqual(sorted(REST_NAMESPACES));
  });

  it('builds the whole catalogue from the same texts as its parts', () => {
    expect(bn.auth).toBe(bnStart.auth);
    expect(bn.home).toBe(bnRest.home);
    expect(en.ui).toBe(enStart.ui);
    expect(en.admin).toBe(enRest.admin);
    expect(enStart.common.language.label).toBe('Language');
    expect(bnRest.nav).toEqual(bn.nav);
  });
});

describe('locale resolution', () => {
  it('uses Accept-Language, then the stored language, then bn', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('en-US,en;q=0.9,bn;q=0.8')).toBe('en');
    expect(resolveLocale('fr-FR,bn;q=0.5')).toBe('bn');
    expect(resolveLocale('fr', 'en')).toBe('en');
    expect(resolveLocale(undefined, 'en')).toBe('en');
    expect(resolveLocale('fr', 'de')).toBe('bn');
    expect(resolveLocale('bn;q=0.4, en;q=0.6')).toBe('en');
    expect(resolveLocale(null)).toBe('bn');
  });
});

describe('translate and fallback', () => {
  it('renders catalogue messages with parameters and plurals in both languages', () => {
    expect(translate('bn', 'errors.permission.not_found')).toBe('খুঁজে পাওয়া যায়নি।');
    expect(translate('en', 'errors.validation.nid_format')).toBe(
      'The NID must have 10, 13 or 17 digits.',
    );
    const unread = 'home.attention.kind.unread_notifications';
    expect(translate('en', unread, { n: 1, count: '1' })).toBe('1 unread notification');
    expect(translate('en', unread, { n: 12, count: '12' })).toBe('12 unread notifications');
    expect(translate('bn', unread, { n: 12, count: '12' })).toBe('12টি না-পড়া নোটিফিকেশন');
  });

  it('falls back to bn once per key, and to the generic error text when bn lacks it too', () => {
    const onMissing = vi.fn();
    const t = createTranslator(
      {
        bn: { a: { b: 'বাংলা' }, common: { state: { error: { text: 'ত্রুটি' } } } },
        en: { a: {}, common: { state: { error: { text: 'Error' } } } },
      },
      onMissing,
    );
    expect(t('en', 'a.b')).toBe('বাংলা');
    expect(t('en', 'a.b')).toBe('বাংলা');
    expect(onMissing).toHaveBeenCalledTimes(1);
    expect(t('en', 'x.y')).toBe('Error');
    expect(t('bn', 'x.y')).toBe('ত্রুটি');
    expect(t.missing.size).toBeGreaterThan(1);
  });
});

describe('bilingual data', () => {
  it('picks the language and falls back when a draft value is blank', () => {
    expect(localized({ bn: 'অনুমোদিত', en: 'Approved' }, 'en')).toBe('Approved');
    expect(localized({ bn: 'অনুমোদিত', en: ' ' }, 'en')).toBe('অনুমোদিত');
    expect(localized({ bn: '', en: 'Approved' }, 'bn')).toBe('Approved');
    expect(localizedColumn({ name_bn: 'ঢাকা', name_en: 'Dhaka' }, 'name', 'bn')).toBe('ঢাকা');
    const definition = {
      states: [{ key: 'approved', label_bn: 'অনুমোদিত', label_en: 'Approved' }],
      stages: { list: [{ key: 'roof', label_bn: 'ছাদ', label_en: 'Roof' }] },
    };
    expect(stateLabel(definition, 'approved', 'en')).toBe('Approved');
    expect(stateLabel(definition, 'roof', 'bn')).toBe('ছাদ');
    expect(stateLabel(definition, 'unknown', 'bn')).toBe('unknown');
  });

  it('normalizes to NFC so two encodings of the same Bengali name compare equal', () => {
    const composed = 'রায়হান'; // য় as one code point (U+09DF)
    const decomposed = 'রায়হান'; // য + nukta (U+09AF U+09BC)
    expect(composed).not.toBe(decomposed);
    expect(normalizedText.parse(` ${decomposed} `)).toBe(normalizedText.parse(composed));
    expect(bilingualText.safeParse({ bn: 'নাম', en: '' }).success).toBe(false);
    expect(bilingualText.parse({ bn: ' নাম ', en: 'Name' })).toEqual({ bn: 'নাম', en: 'Name' });
  });

  it('registers exactly the bilingual columns of the database schema', () => {
    const schema = readFileSync(join(repo, 'apps/api/prisma/schema.prisma'), 'utf8');
    const found: Record<string, string[]> = {};
    for (const [, name, body] of schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
      const table = /@@map\("(\w+)"\)/.exec(body!)?.[1] ?? name!;
      const fields = [...body!.matchAll(/@map\("(\w+)_bn"\)/g)].map((m) => m[1]!);
      for (const field of fields) expect(body).toContain(`@map("${field}_en")`);
      if (fields.length) found[table] = fields;
    }
    expect(found).toEqual(BILINGUAL_COLUMNS);
  });
});

describe('catalogue check', () => {
  const codes = [
    ...readFileSync(join(repo, 'docs/api/API_STANDARDS.md'), 'utf8').matchAll(
      /^\| \w+ \| ([a-z_.,` ]+) \| /gm,
    ),
  ];

  it('passes for the real catalogue, including every API error code', () => {
    const errorCodes = codes
      .flatMap((m) => m[1]!.split(','))
      .map((c) => c.replace(/`/g, '').trim())
      .filter((c) => c.includes('.') && !c.includes('<'));
    expect(errorCodes.length).toBeGreaterThan(50);
    const report = checkCatalogue({ bn, en, errorCodes });
    expect(report.errors).toEqual([]);
  });

  it.each([
    ['a missing key', { a: 'এক', b: 'দুই' }, { a: 'one' }, /b: missing in en/],
    ['different parameters', { a: '{name} এসেছেন' }, { a: '{person} came' }, /parameters differ/],
    ['Bengali digits', { a: '৩টি' }, { a: '3' }, /Bengali digits/],
    [
      'a # in a plural',
      { a: '{n, plural, other {#টি}}' },
      { a: '{n, plural, other {# items}}' },
      /"#"/,
    ],
    [
      'a shown selector',
      { a: '{n, plural, other {{n}টি}}' },
      { a: '{n, plural, other {{n} items}}' },
      /also shown/,
    ],
    ['a number argument', { a: '{n, number}' }, { a: '{n, number}' }, /ICU number/],
    ['a parse error', { a: '{name' }, { a: '{name}' }, /does not parse/],
  ])('fails on %s', (_name, bnTree, enTree, problem) => {
    const report = checkCatalogue({ bn: bnTree, en: enTree });
    expect(report.errors.join('\n')).toMatch(problem);
  });

  it('fails on an error code without a message and warns about unused keys', () => {
    const report = checkCatalogue({
      bn: { errors: {}, x: { used: 'ক', spare: 'খ' } },
      en: { errors: {}, x: { used: 'a', spare: 'b' } },
      errorCodes: ['auth.new_code'],
      usedKeys: ['x.used'],
    });
    expect(report.errors).toEqual([
      'errors.auth.new_code: error code without a message (API_STANDARDS 8)',
    ]);
    expect(report.warnings).toEqual(['x.spare: not used in code']);
  });

  it('pseudo-localizes every text and keeps placeholders', () => {
    const pseudo = pseudoLocalize({ a: { b: 'Hello {name}' } });
    expect(pseudo).toEqual({ a: { b: '[!! Hello {name} !!]' } });
  });
});

describe('notification rendering', () => {
  const otp = NOTIFICATION_TEMPLATES.find((t) => t.key === 'otp_registration_sms')!;

  it('renders the recipient language with formatted variables', () => {
    expect(renderNotification(otp, 'sms', 'en', { code: '123456', minutes: '5' }).body).toBe(
      'Your registration code is 123456. It is valid for 5 minutes. Do not share it.',
    );
    expect(
      renderNotification(otp, 'sms', recipientLocale({ language: 'bn' }), {
        code: '123456',
        minutes: '5',
      }).body,
    ).toContain('123456');
    expect(recipientLocale(null)).toBe('bn');
    expect(() => renderNotification(otp, 'sms', 'bn', { code: '1' })).toThrow(/minutes/);
    expect(() => renderNotification(otp, 'email', 'bn', {})).toThrow(/no email channel/);
  });
});
