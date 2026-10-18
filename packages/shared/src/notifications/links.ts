/* eslint-disable security/detect-object-injection -- keys are checked with Object.hasOwn before use */
/**
 * Where an in-app notification leads (NOTIFICATIONS.md §12): a fixed relative route of the PWA for
 * the template key, filled only with record ids, never a stored or sent URL. Officials and
 * volunteers open a project in different areas. Null when the entry has nothing to open.
 */
export type NotificationAudience = 'staff' | 'volunteer';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id of a param when it is a uuid, else null (a forged value never becomes a path). */
const idOf = (params: Record<string, unknown>, name: string): string | null => {
  const value = Object.hasOwn(params, name) ? params[name] : undefined;
  return typeof value === 'string' && UUID.test(value) ? value : null;
};

const ROUTES: Record<
  string,
  (p: Record<string, unknown>, who: NotificationAudience) => string | null
> = {
  registration_pending: (p) => {
    const id = idOf(p, 'userId');
    return id ? `/admin/registrations/${id}` : '/admin/registrations';
  },
  staff_registration_pending: () => '/admin/registrations',
  registration_correction_requested: () => '/account/profile',
  registration_approved: () => '/',
  registration_rejected: () => null,
  edit_request_submitted: () => '/admin/registrations',
  edit_request_approved: () => '/account/profile',
  edit_request_closed: () => '/account/profile',
  permission_changed: () => '/',
  account_blocked: () => null,
  account_unblocked: () => '/',
  session_revoked: () => '/account/sessions',
  account_locked: () => '/account/password',
  security_refresh_reuse: () => '/account/password',
  handover_items_assigned: () => '/admin/handover',
  handover_completed: () => '/admin/handover',
  system_owner_transferred: () => '/admin/permissions',
  project_assignment: (p) => {
    const id = idOf(p, 'projectId');
    return id ? `/my-projects/${id}` : '/my-projects';
  },
  team_member_added: (p) => {
    const id = idOf(p, 'projectId');
    return id ? `/my-projects/${id}` : '/my-projects';
  },
  project_consent_result: (p) => {
    const id = idOf(p, 'projectId');
    return id ? `/admin/projects/${id}` : '/admin/projects';
  },
  ops_alert: () => '/admin/deliveries',
};

/** Project events lead officials to the project page and volunteers to their own project page. */
const PROJECT_KEYS = [
  'project_activated',
  'deadline_extended',
  'project_closing',
  'project_closed',
  'project_reopened',
  'project_grant_changed',
];

export function notificationLink(
  key: string,
  params: Record<string, unknown>,
  audience: NotificationAudience,
): string | null {
  if (PROJECT_KEYS.includes(key)) {
    const id = idOf(params, 'projectId');
    if (audience === 'volunteer') return id ? `/my-projects/${id}` : '/my-projects';
    return id ? `/admin/projects/${id}` : '/admin/projects';
  }
  const route = Object.hasOwn(ROUTES, key) ? ROUTES[key] : undefined;
  return route ? route(params, audience) : null;
}
