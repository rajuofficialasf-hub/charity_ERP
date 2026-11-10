import {
  localizationSettingSchema,
  monitoringThresholdsSchema,
  organisationSettingSchema,
  smsProviderSettingSchema,
} from '@css/shared/settings';
import { z } from 'zod';
import { dateTime } from './common';
import { type referenceItemSchema } from './media';

/** One key of `GET /settings` with its value; `updatedAt` is null while the default is in force. */
const settingEntryOf = <K extends string, V extends z.ZodType>(key: K, value: V) =>
  z.object({ key: z.literal(key), value, updatedAt: dateTime.nullable() });

export const organisationEntrySchema = settingEntryOf('organisation', organisationSettingSchema);
export const localizationEntrySchema = settingEntryOf('localization', localizationSettingSchema);
export const thresholdsEntrySchema = settingEntryOf(
  'monitoring.thresholds',
  monitoringThresholdsSchema,
);

/** A setting of the settings page, its value read with the key's own schema. */
export const settingEntrySchema = z.discriminatedUnion('key', [
  organisationEntrySchema,
  localizationEntrySchema,
  thresholdsEntrySchema,
]);
export type SettingEntry = z.infer<typeof settingEntrySchema>;

/** The settings of the settings page by key. */
export interface GeneralSettings {
  organisation: z.infer<typeof organisationEntrySchema>;
  localization: z.infer<typeof localizationEntrySchema>;
  'monitoring.thresholds': z.infer<typeof thresholdsEntrySchema>;
}

/** An item of an editable reference list (the same shape as the media lists). */
export type ReferenceItem = z.infer<typeof referenceItemSchema>;

/** The message channels: the SMTP read-only, the SMS adapter's configuration, the dummy OTP. */
export const channelsSchema = z.object({
  smtp: z.object({
    host: z.string(),
    port: z.number().int(),
    secure: z.boolean(),
    from: z.string(),
    loginSet: z.boolean(),
  }),
  sms: z.object({
    mode: z.enum(['logging', 'dry_run']),
    keyPresent: z.boolean(),
    config: smsProviderSettingSchema,
    updatedAt: dateTime.nullable(),
  }),
  otpDummy: z.boolean(),
});
export type Channels = z.infer<typeof channelsSchema>;
