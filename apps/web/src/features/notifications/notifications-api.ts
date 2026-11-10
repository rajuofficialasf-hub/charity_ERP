import type { MarkRead } from '@css/shared';
import { api } from '../../api/client';
import type { InboxEntry, InboxMeta, InboxPage, Preferences, UnreadCount } from '../../api/schemas';

export type { InboxEntry, InboxMeta, Preferences };

export const NOTIFICATIONS_KEY = ['notifications'] as const;
export const UNREAD_KEY = [...NOTIFICATIONS_KEY, 'unread-count'] as const;
export const PREFERENCES_KEY = ['me', 'preferences'] as const;

/** GET /notifications: one page, newest first. */
export const inboxPage = (unread: boolean, cursor: string | null) => {
  const query = new URLSearchParams({ limit: '20' });
  if (unread) query.set('unread', 'true');
  if (cursor) query.set('cursor', cursor);
  return api<InboxPage>(`/notifications?${query.toString()}`, {
    envelope: true,
  });
};

/** GET /notifications/unread-count: the badge of the bell. */
export const unreadCount = () =>
  api<UnreadCount>('/notifications/unread-count').then((r) => r.count);

/** POST /notifications/read: some entries or all of them. */
export const markRead = (body: MarkRead) =>
  api<void>('/notifications/read', { method: 'POST', body });

export const preferences = () => api<Preferences>('/me/preferences');

export const savePreferences = (body: Preferences) =>
  api<Preferences>('/me/preferences', { method: 'PATCH', body });
