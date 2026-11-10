import { EDITABLE_CHANNELS } from '@css/shared';
import { z } from 'zod';
import { dateTime } from './common';

/** One language's stored text of a notification. */
export const storedTextSchema = z.object({
  subject: z.string().nullable(),
  title: z.string().nullable(),
  body: z.string(),
});
export type StoredText = z.infer<typeof storedTextSchema>;

export const templateChannelSchema = z.object({
  version: z.number().int(),
  bn: storedTextSchema,
  en: storedTextSchema,
});
export type TemplateChannel = z.infer<typeof templateChannelSchema>;

/** One editable notification as `GET /admin/notification-templates` returns it. */
export const notificationTemplateSchema = z.object({
  key: z.string(),
  category: z.enum(['security', 'work', 'info', 'alert']),
  variables: z.array(z.string()),
  channels: z.partialRecord(z.enum(EDITABLE_CHANNELS), templateChannelSchema),
});
export type NotificationTemplate = z.infer<typeof notificationTemplateSchema>;

export const renderedSchema = z.object({
  subject: z.string().optional(),
  title: z.string().optional(),
  body: z.string(),
});
export type Rendered = z.infer<typeof renderedSchema>;

/** A text as it would read in both languages, before it is saved. */
export const templatePreviewSchema = z.object({ bn: renderedSchema, en: renderedSchema });
export type TemplatePreview = z.infer<typeof templatePreviewSchema>;

/** The states of a queued email or SMS. */
export const deliveryStatusSchema = z.enum([
  'queued',
  'sending',
  'sent',
  'failed',
  'dry_run',
  'suppressed',
]);

/** One queued email or SMS; the address is partly hidden by the server. */
export const deliverySchema = z.object({
  id: z.uuid(),
  createdAt: dateTime,
  channel: z.string(),
  templateKey: z.string(),
  status: deliveryStatusSchema,
  recipient: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  address: z.string(),
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  nextAttemptAt: dateTime.nullable(),
  sentAt: dateTime.nullable(),
});
export type Delivery = z.infer<typeof deliverySchema>;

/** One page of the deliveries, newest first, with its cursors. */
export const deliveryPageSchema = z.object({
  data: z.array(deliverySchema),
  meta: z.object({ nextCursor: z.string().nullable(), prevCursor: z.string().nullable() }),
});
export type DeliveryPage = z.infer<typeof deliveryPageSchema>;
