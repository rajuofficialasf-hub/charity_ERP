/* eslint-disable security/detect-object-injection -- keys are typed unions, or checked with Object.hasOwn before use */
import { z } from 'zod';
import { DEFAULT_LOCALE, type Locale } from './locales.js';

/** A configuration text in both languages (I18N 7). */
export interface Bilingual {
  bn: string;
  en: string;
}

/** Unicode NFC and trimmed: equal Bengali names compare equal (I18N 6.4). */
export function normalizeText(value: string): string {
  return value.normalize('NFC').trim();
}

/** zod text that is trimmed, NFC-normalized and not empty. */
export const normalizedText = z.string().transform(normalizeText).pipe(z.string().min(1));

/** zod `{ bn, en }` with both languages required and normalized (I18N 7.2). */
export const bilingualText = z.strictObject({ bn: normalizedText, en: normalizedText });

/** Order in which languages are tried when a value is blank (I18N 8). */
function fallbackOrder(locale: Locale): Locale[] {
  return locale === DEFAULT_LOCALE ? [DEFAULT_LOCALE, 'en'] : [locale, 'en', DEFAULT_LOCALE];
}

/**
 * The text of a bilingual value in the requested language, falling back to the other language when
 * it is blank (possible only in drafts; I18N 7.3, 8).
 */
export function localized(value: Partial<Bilingual> | null | undefined, locale: Locale): string {
  if (!value) return '';
  for (const candidate of fallbackOrder(locale)) {
    const text = value[candidate];
    if (text && text.trim()) return text;
  }
  return '';
}

/** Same for a database row with a `<field>_bn` / `<field>_en` column pair. */
export function localizedColumn(
  row: Record<string, unknown>,
  field: string,
  locale: Locale,
): string {
  const pick = (l: Locale) => {
    const v = row[`${field}_${l}`];
    return typeof v === 'string' ? v : undefined;
  };
  return localized({ bn: pick('bn'), en: pick('en') }, locale);
}

/** Workflow definition parts that carry state and stage labels (WORKFLOW_ENGINE, I18N 7.1). */
interface LabelledDefinition {
  states?: { key: string; label_bn: string; label_en: string }[];
  stages?: { list: { key: string; label_bn: string; label_en: string }[] };
}

/** The name of a workflow state or stage in the requested language; the key if it is unknown. */
export function stateLabel(definition: LabelledDefinition, key: string, locale: Locale): string {
  const entry =
    definition.states?.find((s) => s.key === key) ??
    definition.stages?.list.find((s) => s.key === key);
  return entry ? localized({ bn: entry.label_bn, en: entry.label_en }, locale) || key : key;
}
