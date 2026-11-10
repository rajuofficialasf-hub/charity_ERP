import { resolveLocale, type Locale } from '@css/shared/i18n';
import type { Request } from 'express';

/** The authenticated user's stored language, set on the request by the auth guard. */
interface RequestWithUser extends Request {
  user?: { language?: string | null };
}

/**
 * Language of a response (I18N 2, API_STANDARDS 7): Accept-Language if it is bn or en, else the
 * authenticated user's users.language, else bn. Resolved when needed, so the user set by the auth
 * guard is taken into account.
 */
export function requestLocale(req: Request): Locale {
  return resolveLocale(req.headers['accept-language'], (req as RequestWithUser).user?.language);
}
