import type { Bilingual } from '@css/shared/i18n';
import { SUPPORTED_LOCALES } from '@css/shared/i18n';
import { z } from 'zod';

/** The pieces most responses share: a name in both languages, the language, a page's meta. */
export const bilingual = z.object({
  bn: z.string(),
  en: z.string(),
}) satisfies z.ZodType<Bilingual>;
export const locale = z.enum(SUPPORTED_LOCALES);
