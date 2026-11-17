// Entry `@css/shared/i18n/en-rest`: the English rest part, every namespace outside
// START_NAMESPACES (docs/ui/I18N.md, "Typed keys and loading").
import type { RestMessages } from './catalogue.js';
import en_admin from './messages/en/admin.json' with { type: 'json' };
import en_applications from './messages/en/applications.json' with { type: 'json' };
import en_codes from './messages/en/codes.json' with { type: 'json' };
import en_exports from './messages/en/exports.json' with { type: 'json' };
import en_forms from './messages/en/forms.json' with { type: 'json' };
import en_gallery from './messages/en/gallery.json' with { type: 'json' };
import en_home from './messages/en/home.json' with { type: 'json' };
import en_media from './messages/en/media.json' with { type: 'json' };
import en_nav from './messages/en/nav.json' with { type: 'json' };
import en_photos from './messages/en/photos.json' with { type: 'json' };
import en_projects from './messages/en/projects.json' with { type: 'json' };
import en_sync from './messages/en/sync.json' with { type: 'json' };

/** English must have exactly the keys of bn: a missing key fails the typecheck here. */
export const enRest: RestMessages = {
  admin: en_admin,
  applications: en_applications,
  codes: en_codes,
  exports: en_exports,
  forms: en_forms,
  gallery: en_gallery,
  home: en_home,
  media: en_media,
  nav: en_nav,
  photos: en_photos,
  projects: en_projects,
  sync: en_sync,
};
