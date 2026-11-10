import type { Locale, Messages } from '@css/shared/i18n';

// Typed message keys and locales for use-intl (docs/ui/I18N.md, "Typed keys and loading"): an
// unknown key fails the typecheck.
declare module 'use-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
