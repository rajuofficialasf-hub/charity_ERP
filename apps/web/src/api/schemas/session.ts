import type { Me, TokenPair } from '@css/shared/auth';
import { USER_STATES } from '@css/shared/auth';
import { z } from 'zod';
import { bilingual, locale } from './common';

/**
 * The signed-in user as the login, the refresh and the session read return it. Tied to the shared
 * `Me` both ways, so the type the pages use and the shape the API is checked against cannot drift.
 */
export const meSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  kind: z.enum(['staff', 'volunteer']),
  state: z.enum(USER_STATES),
  roles: z.array(z.string()),
  language: locale,
  permissionVersion: z.number().int(),
  passwordChangeRequired: z.boolean().optional(),
  blockMessage: z.string().nullable().optional(),
  volunteerId: z.uuid().nullable().optional(),
  photoFileId: z.uuid().nullable().optional(),
}) satisfies z.ZodType<Me>;

export const tokenPairSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.iso.datetime({ offset: true }),
  me: meSchema,
  deviceKey: z.string().min(1),
  previousDeviceKey: z.string().optional(),
}) satisfies z.ZodType<TokenPair>;

/** What every visitor reads from the server: the default language and the organisation's names. */
export const publicSettingsSchema = z.object({
  defaultLanguage: locale,
  organisation: z.object({
    foundationName: bilingual,
    departmentName: bilingual,
    address: bilingual,
    phone: z.string(),
    email: z.string(),
  }),
});
export type PublicSettings = z.infer<typeof publicSettingsSchema>;
