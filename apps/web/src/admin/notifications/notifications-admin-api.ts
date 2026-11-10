import type { EditableChannel, TemplateEdit } from '@css/shared';
import { api } from '../../api/client';
import { listQuery } from '../list-query';

export interface StoredText {
  subject: string | null;
  title: string | null;
  body: string;
}

export interface TemplateChannel {
  version: number;
  bn: StoredText;
  en: StoredText;
}

/** One editable notification as GET /admin/notification-templates returns it. */
export interface NotificationTemplate {
  key: string;
  category: 'security' | 'work' | 'info' | 'alert';
  variables: string[];
  channels: Partial<Record<EditableChannel, TemplateChannel>>;
}

export interface Rendered {
  subject?: string;
  title?: string;
  body: string;
}

export const DELIVERY_STATUSES = [
  'queued',
  'sending',
  'sent',
  'failed',
  'dry_run',
  'suppressed',
] as const;
export const DELIVERY_CHANNELS = ['email', 'sms'] as const;

/** One queued email or SMS; the address is partly hidden by the server. */
export interface Delivery {
  id: string;
  createdAt: string;
  channel: string;
  templateKey: string;
  status: (typeof DELIVERY_STATUSES)[number];
  recipient: { id: string; name: string } | null;
  address: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  sentAt: string | null;
}

export const DELIVERY_FILTERS = ['status', 'channel', 'from', 'to'] as const;
export type DeliveryFilters = Partial<Record<(typeof DELIVERY_FILTERS)[number], string>>;

export const TEMPLATES_KEY = ['admin', 'notification-templates'] as const;
export const DELIVERIES_KEY = ['admin', 'deliveries'] as const;

const path = (key: string, channel: EditableChannel) =>
  `/admin/notification-templates/${encodeURIComponent(key)}/${channel}`;

export const notificationTemplates = () =>
  api<NotificationTemplate[]>('/admin/notification-templates');

export const previewTemplate = (key: string, channel: EditableChannel, body: TemplateEdit) =>
  api<{ bn: Rendered; en: Rendered }>(`${path(key, channel)}/preview`, { method: 'POST', body });

export const saveTemplate = (key: string, channel: EditableChannel, body: TemplateEdit) =>
  api<NotificationTemplate>(path(key, channel), { method: 'PUT', body });

/** GET /admin/deliveries: one page, newest first, for the filters and a cursor. */
export const deliveriesPage = (filters: DeliveryFilters, cursor: string | null) =>
  api<{ data: Delivery[]; meta: { nextCursor: string | null; prevCursor: string | null } }>(
    `/admin/deliveries${listQuery({ ...filters, cursor: cursor ?? undefined })}`,
    { envelope: true },
  );
