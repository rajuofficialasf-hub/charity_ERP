// Entry `@css/shared/i18n/en-start`: the English start part, the namespaces of START_NAMESPACES
// (docs/ui/I18N.md, "Typed keys and loading").
import type { StartMessages } from './catalogue.js';
import en_auth from './messages/en/auth.json' with { type: 'json' };
import en_common from './messages/en/common.json' with { type: 'json' };
import en_errors from './messages/en/errors.json' with { type: 'json' };
import en_notifications from './messages/en/notifications.json' with { type: 'json' };
import en_registration from './messages/en/registration.json' with { type: 'json' };
import en_ui from './messages/en/ui.json' with { type: 'json' };

/** English must have exactly the keys of bn: a missing key fails the typecheck here. */
export const enStart: StartMessages = {
  auth: en_auth,
  common: en_common,
  errors: en_errors,
  notifications: en_notifications,
  registration: en_registration,
  ui: en_ui,
};
