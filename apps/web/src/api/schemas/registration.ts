import type { RegistrationStart, RegistrationVerifyResult } from '@css/shared/registration';
import { OTP_CHANNELS, REGISTRATION_KINDS } from '@css/shared/registration';
import { z } from 'zod';
import { bilingual, dateTime } from './common';

/** A new registration draft (`POST /auth/register/start`). */
export const registrationStartSchema = z.object({
  registrationId: z.uuid(),
}) satisfies z.ZodType<RegistrationStart>;

/** The channels verified so far; once both are, the draft token and what the form needs. */
export const registrationVerifyResultSchema = z.object({
  verified: z.array(z.enum(OTP_CHANNELS)),
  registrationToken: z.string().min(1).optional(),
  expiresAt: dateTime.optional(),
  kind: z.enum(REGISTRATION_KINDS).optional(),
}) satisfies z.ZodType<RegistrationVerifyResult>;

/** A child of a location as the address cascade offers it (`GET /locations?parentId=`). */
export const locationSchema = z.object({
  id: z.uuid(),
  name: bilingual,
  /** The four-digit post code of an upazila or a union-level place; null above them. */
  postCode: z.string().nullable(),
});
export type Location = z.infer<typeof locationSchema>;
