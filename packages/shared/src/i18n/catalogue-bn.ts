/* The Bengali catalogue, one import per namespace (I18N.md 3.1, D-067). A new namespace is added
 * here and in catalogue-en.ts. */
import bn_admin from './messages/bn/admin.json' with { type: 'json' };
import bn_auth from './messages/bn/auth.json' with { type: 'json' };
import bn_codes from './messages/bn/codes.json' with { type: 'json' };
import bn_common from './messages/bn/common.json' with { type: 'json' };
import bn_errors from './messages/bn/errors.json' with { type: 'json' };
import bn_gallery from './messages/bn/gallery.json' with { type: 'json' };
import bn_home from './messages/bn/home.json' with { type: 'json' };
import bn_nav from './messages/bn/nav.json' with { type: 'json' };
import bn_notifications from './messages/bn/notifications.json' with { type: 'json' };
import bn_projects from './messages/bn/projects.json' with { type: 'json' };
import bn_registration from './messages/bn/registration.json' with { type: 'json' };
import bn_ui from './messages/bn/ui.json' with { type: 'json' };

/** The bn catalogue is the source language; its shape types every key (I18N 3.4). */
export const bn = {
  admin: bn_admin,
  auth: bn_auth,
  codes: bn_codes,
  common: bn_common,
  errors: bn_errors,
  gallery: bn_gallery,
  home: bn_home,
  nav: bn_nav,
  notifications: bn_notifications,
  projects: bn_projects,
  registration: bn_registration,
  ui: bn_ui,
};

export type Messages = typeof bn;
