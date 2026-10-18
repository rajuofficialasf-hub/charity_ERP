import { z } from 'zod';

/**
 * Request bodies of the inbox, the preferences and the template editor
 * (docs/architecture/NOTIFICATIONS.md, inbox, preferences and templates).
 */

/** Mark some of the own entries read, or all of them. */
export const markReadSchema = z
  .strictObject({
    ids: z.array(z.uuid()).min(1).max(100).optional(),
    all: z.literal(true).optional(),
  })
  .refine((v) => (v.ids === undefined) !== (v.all === undefined), {
    message: 'validation.required',
  });
export type MarkRead = z.infer<typeof markReadSchema>;

/** The email mode of an official; digest-eligible events only (Phase 2), the rest is immediate. */
export const EMAIL_MODES = ['digest', 'immediate'] as const;
export type EmailMode = (typeof EMAIL_MODES)[number];
export const preferencesUpdateSchema = z
  .strictObject({
    email_mode: z.enum(EMAIL_MODES).optional(),
    digest_time: z
      .string()
      .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
      .optional(),
  })
  .refine((v) => v.email_mode !== undefined || v.digest_time !== undefined, {
    message: 'validation.required',
  });
export type PreferencesUpdate = z.infer<typeof preferencesUpdateSchema>;

/** A template text may hold no markup and no link: values are escaped, links are built by the app. */
const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/[<>]|https?:|www\./i.test(v), { message: 'notification.unsafe_text' });

export const templateTextSchema = z.strictObject({
  subject: plainText(200).optional(),
  title: plainText(200).optional(),
  body: plainText(2000),
});
export type TemplateTextInput = z.infer<typeof templateTextSchema>;

/** A new version of one channel of a template: both languages at once. */
export const templateEditSchema = z.strictObject({
  bn: templateTextSchema,
  en: templateTextSchema,
});
export type TemplateEdit = z.infer<typeof templateEditSchema>;

/** The channels an administrator edits; SMS and the direct OTP texts stay in code. */
export const EDITABLE_CHANNELS = ['in_app', 'email'] as const;
export type EditableChannel = (typeof EDITABLE_CHANNELS)[number];
