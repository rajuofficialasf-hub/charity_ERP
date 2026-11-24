import { templateName } from '@css/shared';
import type { Locale } from '@css/shared/i18n';
import { useLocale } from 'use-intl';

/** A notification by its name in the reader's language; a key the catalogue lacks as it is. */
export function useTemplateName(): (key: string) => string {
  const locale = useLocale() as Locale;
  // eslint-disable-next-line security/detect-object-injection -- locale is one of the two languages
  return (key) => templateName(key)?.[locale] ?? key;
}
