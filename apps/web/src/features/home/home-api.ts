import type { AttentionItem } from '@css/shared';
import { api } from '../../lib/api';
import type { InboxEntry } from '../notifications/notifications-api';

export const ATTENTION_KEY = ['me', 'attention'] as const;
export const LATEST_NOTIFICATIONS_KEY = ['notifications', 'latest'] as const;
export const HOME_PROJECTS_KEY = ['home', 'projects'] as const;

/** GET /me/attention: what waits for the caller, counted per kind. */
export const attention = () => api<AttentionItem[]>('/me/attention');

/** The newest five entries of the own inbox. */
export const latestNotifications = () => api<InboxEntry[]>('/notifications?limit=5');

/** A project as the home lists it (a part of GET /projects). */
export interface HomeProject {
  id: string;
  code: string;
  name: { bn: string; en: string };
  status: string;
  applyTo: string | null;
}

/** The running projects in the caller's scope, the newest five. */
export const runningProjects = () => api<HomeProject[]>('/projects?status=active&limit=5');

/** How many projects in the caller's scope have this state. */
export const projectCount = (status: string) =>
  api<{ data: unknown[]; meta: { total?: number } }>(
    `/projects?status=${status}&limit=1&include=total`,
    { envelope: true },
  ).then((page) => page.meta.total ?? page.data.length);
