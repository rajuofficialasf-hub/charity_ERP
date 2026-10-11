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
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

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
  blockMessage?: string | null;
  volunteerId?: string | null;
}

export interface TokenPair {
  accessToken: string;
  expiresAt: string;
  me: Me;
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
}
