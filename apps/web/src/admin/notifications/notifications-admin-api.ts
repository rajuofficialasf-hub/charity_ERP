import type { EditableChannel, TemplateEdit } from '@css/shared';
import { api } from '../../api/client';
import type {
  Delivery,
  DeliveryPage,
  NotificationTemplate,
  Rendered,
  StoredText,
  TemplateChannel,
  TemplatePreview,
} from '../../api/schemas';
import { listQuery } from '../list-query';

export type { Delivery, NotificationTemplate, Rendered, StoredText, TemplateChannel };

export const DELIVERY_STATUSES = [
  'queued',
  'sending',
  'sent',
  'failed',
  'dry_run',
  'suppressed',
] as const satisfies readonly Delivery['status'][];
// the list holds every state the API may name: one missing from it fails the typecheck
const everyStatusListed: Exclude<
  Delivery['status'],
  (typeof DELIVERY_STATUSES)[number]
> extends never
  ? true
  : never = true;
void everyStatusListed;
export const DELIVERY_CHANNELS = ['email', 'sms'] as const;

export const DELIVERY_FILTERS = ['status', 'channel', 'from', 'to'] as const;
export type DeliveryFilters = Partial<Record<(typeof DELIVERY_FILTERS)[number], string>>;

export const TEMPLATES_KEY = ['admin', 'notification-templates'] as const;
export const DELIVERIES_KEY = ['admin', 'deliveries'] as const;

export const notificationTemplates = () =>
  api<NotificationTemplate[]>('/admin/notification-templates');

export const previewTemplate = (key: string, channel: EditableChannel, body: TemplateEdit) =>
  api<TemplatePreview>(
    `/admin/notification-templates/${encodeURIComponent(key)}/${channel}/preview`,
    { method: 'POST', body },
  );

export const saveTemplate = (key: string, channel: EditableChannel, body: TemplateEdit) =>
  api<NotificationTemplate>(`/admin/notification-templates/${encodeURIComponent(key)}/${channel}`, {
    method: 'PUT',
    body,
  });

/** GET /admin/deliveries: one page, newest first, for the filters and a cursor. */
export const deliveriesPage = (filters: DeliveryFilters, cursor: string | null) =>
  api<DeliveryPage>(`/admin/deliveries${listQuery({ ...filters, cursor: cursor ?? undefined })}`, {
    envelope: true,
  });
