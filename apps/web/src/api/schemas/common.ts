import type { Bilingual } from '@css/shared/i18n';
import { SUPPORTED_LOCALES } from '@css/shared/i18n';
import { z } from 'zod';

/** The pieces most responses share: a name in both languages and the language. */
export const bilingual = z.object({
  bn: z.string(),
  en: z.string(),
}) satisfies z.ZodType<Bilingual>;
export const locale = z.enum(SUPPORTED_LOCALES);

/** A point in time as the API writes it (ISO 8601 with its offset). */
export const dateTime = z.iso.datetime({ offset: true });
/** A calendar day as the API writes it (`yyyy-mm-dd`). */
export const date = z.iso.date();

/** The id of a stored file, as a photo upload answers it. */
export const storedFileSchema = z.object({ fileId: z.uuid() });
export type StoredFile = z.infer<typeof storedFileSchema>;

/** A page of a list read with its envelope: the rows, the next cursor and the total if asked. */
export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    meta: z.object({
      nextCursor: z.string().nullable().optional(),
      total: z.number().int().optional(),
    }),
  });

/** One record read with its envelope, for the version a later write carries in If-Match. */
export const recordOf = <T extends z.ZodType>(item: T) =>
  z.object({ data: item, meta: z.object({ etag: z.string().optional() }) });

/** A record read with its envelope whose version a write must carry back in If-Match. */
export const versionedOf = <T extends z.ZodType>(item: T) =>
  z.object({ data: item, meta: z.object({ etag: z.string() }) });

/**
 * A page of a nationwide tab, read by number or by cursor, with a total that stops counting at
 * 10000.
 */
export const tabPageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    meta: z.object({
      nextCursor: z.string().nullable(),
      prevCursor: z.string().nullable(),
      total: z.union([z.number().int(), z.literal('10000+')]).optional(),
    }),
  });
