/*
 * Both catalogues, for the server and the tests (docs/ui/I18N.md, "Layout"). The web app loads one
 * language at a time, in two parts each: `@css/shared/i18n/bn-start` and `bn-rest`, `en-start` and
 * `en-rest` (docs/ui/I18N.md, "Typed keys and loading").
 */
import type { Messages } from './catalogue-bn.js';

export { bn, type Messages } from './catalogue-bn.js';
export { en } from './catalogue-en.js';

/** Every namespace of the catalogue, one JSON file per language each (a test keeps it complete). */
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
  'media',
  'nav',
  'notifications',
  'projects',
  'registration',
  'sync',
  'ui',
] as const;
export type Namespace = (typeof NAMESPACES)[number];

/**
 * The start part: the namespaces the sign-in page and the frame around every page use, loaded
 * before the first render. Every other namespace is in the rest part, which every page but the
 * sign-in page waits for. A new namespace goes here only if the sign-in page or the always-mounted
 * frame renders one of its texts.
 *
 * - `auth`: the sign-in page and its form.
 * - `common`: the system name of the sign-in frame, the language switch, the route error and the
 *   loading state of the session provider.
 * - `errors`: the sign-in form's validation (the schema resolver translates its messages).
 * - `notifications`: the notification bell of the top bar asks for its namespace on every page.
 * - `registration`: the link to the volunteer registration below the sign-in form.
 * - `ui`: the words of the asf UI system, handed to its provider around every page.
 */
export const START_NAMESPACES = [
  'auth',
  'common',
  'errors',
  'notifications',
  'registration',
  'ui',
] as const satisfies readonly Namespace[];
export type StartNamespace = (typeof START_NAMESPACES)[number];

/** The rest part: every namespace that is not in the start part. */
export const REST_NAMESPACES = NAMESPACES.filter(
  (name): name is RestNamespace => !(START_NAMESPACES as readonly string[]).includes(name),
);
export type RestNamespace = Exclude<Namespace, StartNamespace>;

/** The catalogue's start part of one language. */
export type StartMessages = Pick<Messages, StartNamespace>;
/** The catalogue's rest part of one language. */
export type RestMessages = Pick<Messages, RestNamespace>;
