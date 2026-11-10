import type { EmailMode, MarkRead } from '@css/shared';
import { api } from '../../api/client';

/** One entry of the own inbox, rendered by the server in the reader's language. */
export interface InboxEntry {
  id: string;
  templateKey: string;
  title: string;
  body: string;
  /** A fixed route of the app filled with the record id, or null. */
  link: string | null;
  /** Events collapsed into this entry within 15 minutes. */
  count: number;
  readAt: string | null;
  createdAt: string;
}

export interface InboxMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  unreadCount: number;
}

export interface Preferences {
  email_mode?: EmailMode;
  digest_time?: string;
}

export const NOTIFICATIONS_KEY = ['notifications'] as const;
export const UNREAD_KEY = [...NOTIFICATIONS_KEY, 'unread-count'] as const;
export const PREFERENCES_KEY = ['me', 'preferences'] as const;

/** GET /notifications: one page, newest first. */
export const inboxPage = (unread: boolean, cursor: string | null) => {
  const query = new URLSearchParams({ limit: '20' });
  if (unread) query.set('unread', 'true');
  if (cursor) query.set('cursor', cursor);
  return api<{ data: InboxEntry[]; meta: InboxMeta }>(`/notifications?${query.toString()}`, {
    envelope: true,
  });
};

/** GET /notifications/unread-count: the badge of the bell. */
export const unreadCount = () =>
  api<{ count: number }>('/notifications/unread-count').then((r) => r.count);

/** POST /notifications/read: some entries or all of them. */
export const markRead = (body: MarkRead) =>
  api<void>('/notifications/read', { method: 'POST', body });

export const preferences = () => api<Preferences>('/me/preferences');

export const savePreferences = (body: Preferences) =>
  api<Preferences>('/me/preferences', { method: 'PATCH', body });
