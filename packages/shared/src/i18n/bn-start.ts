// Entry `@css/shared/i18n/bn-start`: the Bengali start part, the namespaces of START_NAMESPACES,
// loaded before the web app's first render (docs/ui/I18N.md, "Typed keys and loading").
import type { StartNamespace } from './catalogue.js';
import bn_auth from './messages/bn/auth.json' with { type: 'json' };
import bn_common from './messages/bn/common.json' with { type: 'json' };
import bn_errors from './messages/bn/errors.json' with { type: 'json' };
import bn_notifications from './messages/bn/notifications.json' with { type: 'json' };
import bn_registration from './messages/bn/registration.json' with { type: 'json' };
import bn_ui from './messages/bn/ui.json' with { type: 'json' };

export const bnStart = {
  auth: bn_auth,
  common: bn_common,
  errors: bn_errors,
  notifications: bn_notifications,
  registration: bn_registration,
  ui: bn_ui,
} satisfies Record<StartNamespace, object>;
