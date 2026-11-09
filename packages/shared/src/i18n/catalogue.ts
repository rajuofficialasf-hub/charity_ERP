/*
 * Both catalogues, for the server and the tests (I18N.md 3.1). The web app loads one
 * language at a time through `@css/shared/i18n/bn` and `@css/shared/i18n/en` (docs/ui/I18N.md).
 */
export { bn, type Messages } from './catalogue-bn.js';
export { en } from './catalogue-en.js';

export const NAMESPACES = [
  'admin',
  'applications',
  'auth',
  'codes',
  'common',
  'errors',
  'exports',
  'forms',
  'gallery',
  'home',
  'nav',
  'projects',
  'registration',
  'sync',
  'ui',
] as const;
export type Namespace = (typeof NAMESPACES)[number];
