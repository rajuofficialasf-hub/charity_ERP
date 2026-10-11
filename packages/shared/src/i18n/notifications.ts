/* eslint-disable security/detect-object-injection -- keys are typed unions, or checked with Object.hasOwn before use */
import type { NotificationChannel, NotificationTemplateSeed } from '../notifications/templates.js';
import { DEFAULT_LOCALE, type Locale } from './locales.js';

export interface RenderedNotification {
  subject?: string;
  title?: string;
  body: string;
}

/** Recipient language of a queued message (I18N 5): the user's stored language, else bn. */
export function recipientLocale(user: { language?: string | null } | null | undefined): Locale {
  return user?.language === 'en' ? 'en' : DEFAULT_LOCALE;
}

/**
 * Renders a notification template for a channel and language (NOTIFICATIONS 6, I18N 5). Variables
 * use {{name}} and arrive already formatted with English digits. A missing language falls back to
 * en, then bn (I18N 8); an unknown variable or channel is a programming error.
 */
export function renderNotification(
  template: NotificationTemplateSeed,
  channel: NotificationChannel,
  locale: Locale,
  variables: Record<string, string>,
): RenderedNotification {
  const texts = template.channels[channel];
  if (!texts) throw new Error(`template ${template.key} has no ${channel} channel`);
  const text = texts[locale] ?? texts.en ?? texts[DEFAULT_LOCALE];
  const fill = (s?: string) =>
    s?.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
      if (!template.variables.includes(name) || !Object.hasOwn(variables, name))
        throw new Error(`template ${template.key}: variable "${name}" missing`);
      return variables[name] as string;
    });
  return { subject: fill(text.subject), title: fill(text.title), body: fill(text.body) ?? '' };
}
