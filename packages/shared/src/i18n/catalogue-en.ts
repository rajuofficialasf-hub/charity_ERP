/* The English catalogue, one import per namespace (I18N.md 3.1, D-067). */
import type { Messages } from './catalogue-bn.js';
import en_admin from './messages/en/admin.json' with { type: 'json' };
import en_applications from './messages/en/applications.json' with { type: 'json' };
import en_auth from './messages/en/auth.json' with { type: 'json' };
import en_codes from './messages/en/codes.json' with { type: 'json' };
import en_common from './messages/en/common.json' with { type: 'json' };
import en_errors from './messages/en/errors.json' with { type: 'json' };
import en_exports from './messages/en/exports.json' with { type: 'json' };
import en_forms from './messages/en/forms.json' with { type: 'json' };
import en_gallery from './messages/en/gallery.json' with { type: 'json' };
import en_home from './messages/en/home.json' with { type: 'json' };
import en_media from './messages/en/media.json' with { type: 'json' };
import en_nav from './messages/en/nav.json' with { type: 'json' };
import en_notifications from './messages/en/notifications.json' with { type: 'json' };
import en_projects from './messages/en/projects.json' with { type: 'json' };
import en_registration from './messages/en/registration.json' with { type: 'json' };
import en_sync from './messages/en/sync.json' with { type: 'json' };
import en_ui from './messages/en/ui.json' with { type: 'json' };

/** English must have exactly the keys of bn: a missing key fails the typecheck here. */
export const en: Messages = {
  admin: en_admin,
  applications: en_applications,
  auth: en_auth,
  codes: en_codes,
  common: en_common,
  errors: en_errors,
  exports: en_exports,
  forms: en_forms,
  gallery: en_gallery,
  home: en_home,
  media: en_media,
  nav: en_nav,
  notifications: en_notifications,
  projects: en_projects,
  registration: en_registration,
  sync: en_sync,
  ui: en_ui,
};
