// Entry `@css/shared/i18n/bn-rest`: the Bengali rest part, every namespace outside
// START_NAMESPACES, which every page of the web app but the sign-in page waits for
// (docs/ui/I18N.md, "Typed keys and loading").
import type { RestNamespace } from './catalogue.js';
import bn_admin from './messages/bn/admin.json' with { type: 'json' };
import bn_applications from './messages/bn/applications.json' with { type: 'json' };
import bn_codes from './messages/bn/codes.json' with { type: 'json' };
import bn_exports from './messages/bn/exports.json' with { type: 'json' };
import bn_forms from './messages/bn/forms.json' with { type: 'json' };
import bn_gallery from './messages/bn/gallery.json' with { type: 'json' };
import bn_home from './messages/bn/home.json' with { type: 'json' };
import bn_media from './messages/bn/media.json' with { type: 'json' };
import bn_nav from './messages/bn/nav.json' with { type: 'json' };
import bn_photos from './messages/bn/photos.json' with { type: 'json' };
import bn_projects from './messages/bn/projects.json' with { type: 'json' };
import bn_sync from './messages/bn/sync.json' with { type: 'json' };

export const bnRest = {
  admin: bn_admin,
  applications: bn_applications,
  codes: bn_codes,
  exports: bn_exports,
  forms: bn_forms,
  gallery: bn_gallery,
  home: bn_home,
  media: bn_media,
  nav: bn_nav,
  photos: bn_photos,
  projects: bn_projects,
  sync: bn_sync,
} satisfies Record<RestNamespace, object>;
