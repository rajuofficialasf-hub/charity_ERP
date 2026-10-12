import { z } from 'zod';
import { otpCodeSchema } from '../auth/schemas.js';

/**
 * Registration before login (AUTH.md 2; DECISION_LOG D-082, D-086, D-088): request schemas of the
 * `/auth/register/*` operations and the rules of a registration draft. The API validates with
 * them and the PWA builds the registration screens on them.
 */
export const REGISTRATION_RULES = {
  /** A draft lives this long after the start or the last verification (O-25). */
  draftLifeMs: 24 * 60 * 60_000,
  /** Reference lookups a team member may make per draft (D-088). */
  maxReferenceLookups: 5,
  /** Lookups of one NID per day across all drafts (D-088). */
  maxLookupsPerNidPerDay: 5,
} as const;

export const REGISTRATION_KINDS = ['volunteer', 'staff'] as const;
export type RegistrationKind = (typeof REGISTRATION_KINDS)[number];

/** The draft token header (D-082): never in a URL or a log. */
export const REGISTRATION_TOKEN_HEADER = 'X-Registration-Token';

export const mobileSchema = z
  .string()
  .regex(/^01[3-9][0-9]{8}$/, { message: 'validation.mobile_format' });
export const nidSchema = z
  .string()
  .regex(/^([0-9]{10}|[0-9]{13}|[0-9]{17})$/, { message: 'validation.nid_format' });

export const registrationStartRequestSchema = z.strictObject({
  mobile: mobileSchema,
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  kind: z.enum(REGISTRATION_KINDS).default('volunteer'),
});
export type RegistrationStartRequest = z.infer<typeof registrationStartRequestSchema>;

export const otpSendRequestSchema = z.strictObject({
  registrationId: z.uuid(),
  channel: z.enum(['sms', 'email']),
});
export type OtpSendRequest = z.infer<typeof otpSendRequestSchema>;

export const otpVerifyRequestSchema = z.strictObject({
  registrationId: z.uuid(),
  mobileCode: otpCodeSchema,
  emailCode: otpCodeSchema,
});
export type OtpVerifyRequest = z.infer<typeof otpVerifyRequestSchema>;

export const referenceLookupRequestSchema = z.strictObject({
  registrationId: z.uuid(),
  nid: nidSchema,
});
export type ReferenceLookupRequest = z.infer<typeof referenceLookupRequestSchema>;

export interface RegistrationStart {
  registrationId: string;
  otpSentTo: ('sms' | 'email')[];
}

export interface RegistrationVerified {
  registrationToken: string;
  expiresAt: string;
  kind: RegistrationKind;
}

/** The expiry of a draft started or verified at `at`. */
export function draftExpiry(at: Date): Date {
  return new Date(at.getTime() + REGISTRATION_RULES.draftLifeMs);
}
