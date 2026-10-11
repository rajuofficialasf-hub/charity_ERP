import { isLocale, type Locale } from '@css/shared/i18n';
import type { PrismaClient } from '../generated/prisma/client';
import { ApiError } from './api-error';

/**
 * Stores a user's interface language in users.language (I18N 2, O-56). The endpoint
 * `PUT /api/v1/me/language` routes here once login exists (T1.7), which also writes the audit entry
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
