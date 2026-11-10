import { EMAIL_MODES } from '@css/shared';
import { z } from 'zod';
import { dateTime } from './common';

/** One entry of the own inbox, rendered by the server in the reader's language. */
export const inboxEntrySchema = z.object({
  id: z.uuid(),
  templateKey: z.string(),
  title: z.string(),
  body: z.string(),
  /** A fixed route of the app filled with the record id, or null. */
  link: z.string().nullable(),
  /** Events collapsed into this entry within 15 minutes. */
  count: z.number().int(),
  readAt: dateTime.nullable(),
  createdAt: dateTime,
});
export type InboxEntry = z.infer<typeof inboxEntrySchema>;

export const inboxMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  unreadCount: z.number().int(),
});
export type InboxMeta = z.infer<typeof inboxMetaSchema>;

/** One page of the inbox with its cursors and the unread count. */
export const inboxPageSchema = z.object({
  data: z.array(inboxEntrySchema),
  meta: inboxMetaSchema,
});
export type InboxPage = z.infer<typeof inboxPageSchema>;

/** The badge of the bell. */
export const unreadCountSchema = z.object({ count: z.number().int() });
export type UnreadCount = z.infer<typeof unreadCountSchema>;

/** How the person gets their notices by email. */
export const preferencesSchema = z.object({
  email_mode: z.enum(EMAIL_MODES).optional(),
  digest_time: z.string().optional(),
});
export type Preferences = z.infer<typeof preferencesSchema>;
