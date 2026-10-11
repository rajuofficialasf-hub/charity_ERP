import type { Locale, Messages } from '@css/shared/i18n';

// Typed message keys and locales for next-intl (I18N 3.4, D-067): an unknown key fails the typecheck.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
