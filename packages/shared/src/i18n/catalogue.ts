/*
 * Both catalogues, for the server and the tests (I18N.md 3.1, D-067). The web app loads one
 * language at a time through `@css/shared/i18n/bn` and `@css/shared/i18n/en` (docs/ui/I18N.md).
 */
export { bn, type Messages } from './catalogue-bn.js';
export { en } from './catalogue-en.js';

export const NAMESPACES = [
  'admin',
  'auth',
  'codes',
  'common',
  'errors',
  'gallery',
  'home',
  'nav',
  'projects',
  'registration',
  'ui',
] as const;
export type Namespace = (typeof NAMESPACES)[number];
