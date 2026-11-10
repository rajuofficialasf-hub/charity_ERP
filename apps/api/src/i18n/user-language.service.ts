import { isLocale, type Locale } from '@css/shared/i18n';
import type { PrismaClient } from '../generated/prisma/client.js';
import { ApiError } from './api-error.js';

/**
 * Stores a user's interface language in users.language (docs/ui/I18N.md, "Languages and locale
 * resolution"). The endpoint
 * `PUT /api/v1/me/language` routes here once login exists, which also writes the audit entry
 * of the profile change; until then nothing calls it outside the tests.
 */
export class UserLanguageService {
  constructor(private readonly db: Pick<PrismaClient, 'user'>) {}

  async setLanguage(userId: string, language: string): Promise<Locale> {
    if (!isLocale(language)) throw new ApiError('validation.option_unknown', 422);
    const { count } = await this.db.user.updateMany({ where: { id: userId }, data: { language } });
    if (count === 0) throw new ApiError('permission.not_found', 404);
    return language;
  }
}
