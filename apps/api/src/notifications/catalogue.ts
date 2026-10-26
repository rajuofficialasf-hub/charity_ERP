/**
 * The Phase 1 events of the notification matrix (docs/architecture/NOTIFICATIONS.md, the matrix of
 * registration, accounts, security, projects, assignment and consent): which channels a template
 * key uses and how urgent its email is. In-app reaches staff and volunteers; email reaches only
 * officials with an address; SMS is used for OTP alone and never through this catalogue.
 */
export type NotificationCategory = 'security' | 'work' | 'info' | 'alert';

export interface CatalogueEntry {
  inApp: boolean;
  /** An email to each official recipient with an address. */
  email: boolean;
  category: NotificationCategory;
  /** The entry's {{count}} is the number of events collapsed into it, not a value of one event. */
  countsEvents?: boolean;
}

const entry = (
  category: NotificationCategory,
  channels: { email?: boolean; inApp?: boolean } = {},
): CatalogueEntry => ({ inApp: channels.inApp ?? true, email: channels.email ?? false, category });

export const NOTIFICATION_CATALOGUE: Readonly<Record<string, CatalogueEntry>> = {
  registration_pending: entry('work'),
  registration_correction_requested: entry('work'),
  registration_approved: entry('info'),
  registration_rejected: entry('info'),
  staff_registration_pending: entry('work', { email: true }),
  edit_request_submitted: entry('work'),
  edit_request_approved: entry('info'),
  edit_request_closed: entry('info'),
  permission_changed: entry('security'),
  account_blocked: entry('security'),
  account_unblocked: entry('security'),
  session_revoked: entry('security'),
  account_locked: entry('security'),
  security_lockout_alert: entry('alert', { email: true, inApp: false }),
  security_refresh_reuse: entry('security', { email: true }),
  handover_items_assigned: entry('work', { email: true }),
  handover_completed: entry('info'),
  project_activated: entry('info'),
  project_assignment: entry('work'),
  project_consent_result: entry('info'),
  team_member_added: entry('info'),
  deadline_extended: entry('info'),
  project_closing: entry('info'),
  project_closed: entry('info'),
  project_reopened: entry('info'),
  project_grant_changed: entry('security'),
  application_submitted: entry('work'),
  application_reviewed: entry('work', { email: true }),
  application_approved: entry('info'),
  application_rejected: entry('info'),
  application_waitlisted: entry('info'),
  field_unlocked: entry('work'),
  field_updated: entry('work'),
  application_transferred: entry('work'),
  application_transferred_away: entry('info'),
  application_reopened: entry('info'),
  ops_alert: { ...entry('alert'), countsEvents: true },
};

/** Security and alerts go first, then work assigned, then the rest (pg-boss priority). */
export const EMAIL_PRIORITY: Readonly<Record<NotificationCategory, number>> = {
  security: 30,
  alert: 30,
  work: 20,
  info: 10,
};
