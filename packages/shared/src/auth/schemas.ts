import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password.js';

/**
 * Request schemas of the auth, sessions and users operations (docs/api/openapi.yaml, AUTH.md).
 * The API validates with them and the PWA builds its forms on them; the OpenAPI drift test keeps
 * them equal to the contract.
 */
export const DEVICE_PLATFORMS = ['android', 'ios', 'desktop', 'other'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

const loginId = z.string().trim().min(1).max(254);
const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { message: 'validation.password_too_short' })
  .max(PASSWORD_MAX_LENGTH);

export const loginRequestSchema = z.strictObject({
  loginId,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  device: z
    .strictObject({
      name: z.string().max(100).optional(),
      platform: z.enum(DEVICE_PLATFORMS).optional(),
      appVersion: z.string().max(32).optional(),
    })
    .optional(),
  /** The device session the phone kept its encrypted outbox under, whose key it asks back. */
  recoverSessionId: z.uuid().optional(),
  /** Records the phone lost before this login: at an offline logout, or because nothing could open them. */
  lostPending: z
    .strictObject({
      count: z.number().int().min(0).max(100_000),
      reason: z.enum(['logout', 'unrecoverable']),
    })
    .optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** A logout may say how many records it leaves unsent on the device. */
export const logoutRequestSchema = z.strictObject({
  pendingCount: z.number().int().min(0).max(100_000).optional(),
});
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

export const passwordChangeRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword,
});
export type PasswordChangeRequest = z.infer<typeof passwordChangeRequestSchema>;

export const passwordResetStartRequestSchema = z.strictObject({ loginId });
export type PasswordResetStartRequest = z.infer<typeof passwordResetStartRequestSchema>;

export const otpCodeSchema = z.string().regex(/^[0-9]{6}$/, { message: 'otp.invalid' });

export const passwordResetCompleteRequestSchema = z.strictObject({
  loginId,
  code: otpCodeSchema,
  newPassword,
});
export type PasswordResetCompleteRequest = z.infer<typeof passwordResetCompleteRequestSchema>;

export const reasonRequestSchema = z.strictObject({ reason: z.string().trim().min(3).max(1000) });
export type ReasonRequest = z.infer<typeof reasonRequestSchema>;

export const USER_STATES = ['pending', 'active', 'blocked', 'deactivated'] as const;
export type UserState = (typeof USER_STATES)[number];

export const userStateRequestSchema = z.strictObject({
  state: z.enum(['active', 'blocked', 'deactivated']),
  reason: z.string().trim().min(3).max(1000),
});
export type UserStateRequest = z.infer<typeof userStateRequestSchema>;

export const languageRequestSchema = z.strictObject({ language: z.enum(['bn', 'en']) });
export type LanguageRequest = z.infer<typeof languageRequestSchema>;

/** The signed-in user as GET /auth/me and login return it (openapi Me). */
export interface Me {
  id: string;
  displayName: string;
  kind: 'staff' | 'volunteer';
  state: UserState;
  roles: string[];
  language: 'bn' | 'en';
  permissionVersion: number;
  /** A new password is due before anything else (a staff role with global scope was approved). */
  passwordChangeRequired?: boolean;
  blockMessage?: string | null;
  volunteerId?: string | null;
  /** The person's uploaded photo (a volunteer's or an official's); null shows the initial. */
  photoFileId?: string | null;
}

export interface TokenPair {
  accessToken: string;
  expiresAt: string;
  me: Me;
  /** The session's device key (base64url, 32 bytes): wraps the phone's offline store key; memory only. */
  deviceKey: string;
  /** The key of the expired session the phone named, once, so it can re-key its outbox. */
  previousDeviceKey?: string;
}

export interface DeviceSession {
  id: string;
  deviceName: string | null;
  platform: string | null;
  appVersion: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
  revokedAt: string | null;
  /** Records the device last reported as still waiting on it, and when; null before any report. */
  pendingCount: number | null;
  pendingReportedAt: string | null;
}
