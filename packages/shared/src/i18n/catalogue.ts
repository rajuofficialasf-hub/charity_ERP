/* One import per namespace and language (I18N.md 3.1, D-067). A new namespace is added here. */
import bn_auth from './messages/bn/auth.json' with { type: 'json' };
import bn_codes from './messages/bn/codes.json' with { type: 'json' };
import bn_common from './messages/bn/common.json' with { type: 'json' };
import bn_errors from './messages/bn/errors.json' with { type: 'json' };
import bn_gallery from './messages/bn/gallery.json' with { type: 'json' };
import bn_nav from './messages/bn/nav.json' with { type: 'json' };
import bn_ui from './messages/bn/ui.json' with { type: 'json' };
import en_auth from './messages/en/auth.json' with { type: 'json' };
import en_codes from './messages/en/codes.json' with { type: 'json' };
import en_common from './messages/en/common.json' with { type: 'json' };
import en_errors from './messages/en/errors.json' with { type: 'json' };
import en_gallery from './messages/en/gallery.json' with { type: 'json' };
import en_nav from './messages/en/nav.json' with { type: 'json' };
import en_ui from './messages/en/ui.json' with { type: 'json' };

/** The bn catalogue is the source language; its shape types every key (I18N 3.4). */
export const bn = {
  auth: bn_auth,
  codes: bn_codes,
  common: bn_common,
  errors: bn_errors,
  gallery: bn_gallery,
  nav: bn_nav,
  ui: bn_ui,
};

export type Messages = typeof bn;

/** English must have exactly the keys of bn: a missing key fails the typecheck here. */
export const en: Messages = {
  auth: en_auth,
  codes: en_codes,
  common: en_common,
  errors: en_errors,
  gallery: en_gallery,
  nav: en_nav,
  ui: en_ui,
};

export const NAMESPACES = ['auth', 'codes', 'common', 'errors', 'gallery', 'nav', 'ui'] as const;
export type Namespace = (typeof NAMESPACES)[number];
