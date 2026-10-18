/* eslint-disable security/detect-object-injection -- keys are typed unions, or checked with Object.hasOwn before use */
import { formatCount } from '../format/index.js';
import type { NotificationChannel, NotificationTemplateSeed } from '../notifications/templates.js';
import { type Bilingual, localized } from './bilingual.js';
import { DEFAULT_LOCALE, type Locale } from './locales.js';

export interface RenderedNotification {
  subject?: string;
  title?: string;
  body: string;
}

/**
 * A value of a template variable: text as it is (a date already as dd-mm-yyyy), a number shown
 * with English digits, or bilingual data shown in the reader's language.
 */
export type NotificationParam = string | number | Bilingual;

/** The texts of one template version for one channel and language. */
export interface TemplateText {
  subject?: string | null;
  title?: string | null;
  body: string;
}

/** Recipient language of a queued message (I18N 5): the user's stored language, else bn. */
export function recipientLocale(user: { language?: string | null } | null | undefined): Locale {
  return user?.language === 'en' ? 'en' : DEFAULT_LOCALE;
}

function show(value: NotificationParam, locale: Locale): string {
  if (typeof value === 'number') return formatCount(value, locale);
  if (typeof value === 'string') return value;
  return localized(value, locale);
}

/**
 * Fills the {{name}} placeholders of one template text (NOTIFICATIONS 6). A placeholder that is
 * not declared for the key, or a declared one without a value, fails closed. `escape` is applied
 * to every substituted value (an email's HTML part), never to the template's own text.
 */
export function renderTemplateText(
  key: string,
  text: TemplateText,
  declared: readonly string[],
  locale: Locale,
  params: Record<string, NotificationParam>,
  options: { escape?: (value: string) => string } = {},
): RenderedNotification {
  const fill = (s?: string | null) =>
    s?.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => {
      if (!declared.includes(name) || !Object.hasOwn(params, name))
        throw new Error(`template ${key}: variable "${name}" missing`);
      const value = show(params[name] as NotificationParam, locale);
      return options.escape ? options.escape(value) : value;
    }) ?? undefined;
  return {
    ...(text.subject ? { subject: fill(text.subject) } : {}),
    ...(text.title ? { title: fill(text.title) } : {}),
    body: fill(text.body) ?? '',
  };
}

/**
 * Renders a seeded notification template for a channel and language (NOTIFICATIONS 6, I18N 5).
 * A missing language falls back to en, then bn (I18N 8); an unknown variable or channel is a
 * programming error.
 */
export function renderNotification(
  template: NotificationTemplateSeed,
  channel: NotificationChannel,
  locale: Locale,
  variables: Record<string, NotificationParam>,
): RenderedNotification {
  const texts = template.channels[channel];
  if (!texts) throw new Error(`template ${template.key} has no ${channel} channel`);
  const text = texts[locale] ?? texts.en ?? texts[DEFAULT_LOCALE];
  return renderTemplateText(template.key, text, template.variables, locale, variables);
}
