/* eslint-disable security/detect-object-injection -- keys are checked with Object.hasOwn before use */
/**
 * Where an in-app notification leads (docs/architecture/NOTIFICATIONS.md, security and privacy): a
 * fixed relative route of the PWA for the template key, filled only with record ids, never a stored
 * or sent URL. Officials and volunteers open a project in different areas. Null when the entry has
 * nothing to open.
 */
export type NotificationAudience = 'staff' | 'volunteer';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id of a param when it is a uuid, else null (a forged value never becomes a path). */
const idOf = (params: Record<string, unknown>, name: string): string | null => {
  const value = Object.hasOwn(params, name) ? params[name] : undefined;
  return typeof value === 'string' && UUID.test(value) ? value : null;
};

/** `base/<id>` for the record the param names, else the base list. */
const withId = (params: Record<string, unknown>, name: string, base: string) => {
  const id = idOf(params, name);
  return id ? `${base}/${id}` : base;
};

const ROUTES: Record<string, (p: Record<string, unknown>) => string | null> = {
  registration_pending: (p) => withId(p, 'userId', '/admin/registrations'),
  staff_registration_pending: () => '/admin/registrations',
  registration_correction_requested: () => '/account/profile',
  registration_approved: () => '/',
  registration_rejected: () => null,
  edit_request_submitted: () => '/admin/registrations',
  edit_request_approved: () => '/account/profile',
  edit_request_closed: () => '/account/profile',
  designation_changed: () => '/account/profile',
  permission_changed: () => '/',
  role_changed: () => '/',
  account_blocked: () => null,
  account_unblocked: () => '/',
  session_revoked: () => '/account/sessions',
  account_locked: () => '/account/password',
  security_refresh_reuse: () => '/account/password',
  handover_items_assigned: () => '/admin/handover',
  handover_completed: () => '/admin/handover',
  system_owner_transferred: () => '/admin/permissions',
  project_assignment: (p) => withId(p, 'projectId', '/my-projects'),
  team_member_added: (p) => withId(p, 'projectId', '/my-projects'),
  project_consent_result: (p) => withId(p, 'projectId', '/admin/projects'),
  ops_alert: () => '/admin/deliveries',
  application_approved: (p) => withId(p, 'applicationId', '/my-applications'),
  application_rejected: (p) => withId(p, 'applicationId', '/my-applications'),
  application_waitlisted: (p) => withId(p, 'applicationId', '/my-applications'),
  application_reopened: (p) => withId(p, 'applicationId', '/my-applications'),
  field_unlocked: (p) => withId(p, 'applicationId', '/my-applications'),
  field_updated: (p) => withId(p, 'applicationId', '/admin/applications'),
  application_transferred: () => '/my-applications',
  application_transferred_away: () => null,
  media_referral_new: (p) => withId(p, 'referralId', '/media/referrals'),
  media_referral_decided: (p) => withId(p, 'referralId', '/media/referrals'),
  media_member_added: (p) => withId(p, 'referralId', '/media/referrals'),
  media_review_waiting: (p) => withId(p, 'referralId', '/media/referrals'),
  media_published: (p) => withId(p, 'referralId', '/media/referrals'),
  export_ready: () => '/account/exports',
  export_failed: () => '/account/exports',
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
  if (PROJECT_KEYS.includes(key))
    return withId(
      params,
      'projectId',
      audience === 'volunteer' ? '/my-projects' : '/admin/projects',
    );
  // a returned value goes to whoever entered it: a volunteer, or an official for an answer of
  // the official section or an application without a volunteer
  if (key === 'field_refused')
    return withId(
      params,
      'applicationId',
      audience === 'volunteer' ? '/my-applications' : '/admin/applications',
    );
  const route = Object.hasOwn(ROUTES, key) ? ROUTES[key] : undefined;
  return route ? route(params) : null;
}
