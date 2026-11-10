/**
 * Entry `@css/shared/i18n` (I18N.md 3): the message catalogue, the server-side t(), locale
 * resolution, bilingual-data helpers and the catalogue check. Kept out of the package index so the
 * web client never bundles every catalogue.
 */
export { bn, en, NAMESPACES, type Messages, type Namespace } from './catalogue.js';
export {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  resolveLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from './locales.js';
export {
  createTranslator,
  translate,
  type Catalogues,
  type KeyPaths,
  type MessageKey,
  type MessageParams,
  type Translator,
} from './translate.js';
export {
  bilingualText,
  localized,
  localizedColumn,
  normalizedText,
  normalizeText,
  stateLabel,
  type Bilingual,
} from './bilingual.js';
export { BILINGUAL_COLUMNS, type BilingualTable } from './bilingual-columns.js';
export {
  checkCatalogue,
  flattenMessages,
  type CatalogueInput,
  type CatalogueReport,
} from './check.js';
export { PSEUDO_LOCALE, pseudoLocalize } from './pseudo.js';
export {
  type NotificationParam,
  recipientLocale,
  renderNotification,
  renderTemplateText,
  type RenderedNotification,
  type TemplateText,
} from './notifications.js';
