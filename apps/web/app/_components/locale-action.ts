'use server';

import { isLocale, LOCALE_COOKIE } from '@css/shared/i18n';
import { cookies } from 'next/headers';

/**
 * Stores the chosen language in the css_locale cookie (I18N 2). When signed in, the switch also
 * calls PUT /api/v1/me/language so the choice follows the user to every device (O-56, T1.7).
 */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
}
