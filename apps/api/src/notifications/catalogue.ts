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
}

const entry = (category: NotificationCategory, email = false, inApp = true): CatalogueEntry => ({
  inApp,
  email,
  category,
});

export const NOTIFICATION_CATALOGUE: Readonly<Record<string, CatalogueEntry>> = {
  registration_pending: entry('work'),
  registration_correction_requested: entry('work'),
  registration_approved: entry('info'),
  registration_rejected: entry('info'),
  staff_registration_pending: entry('work', true),
  edit_request_submitted: entry('work'),
  edit_request_approved: entry('info'),
  edit_request_closed: entry('info'),
  permission_changed: entry('security'),
  account_blocked: entry('security'),
  account_unblocked: entry('security'),
  session_revoked: entry('security'),
  account_locked: entry('security'),
  security_lockout_alert: entry('alert', true, false),
  security_refresh_reuse: entry('security', true),
  handover_items_assigned: entry('work', true),
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
  ops_alert: entry('alert'),
};

/** Security and alerts go first, then work assigned, then the rest (pg-boss priority). */
export const EMAIL_PRIORITY: Readonly<Record<NotificationCategory, number>> = {
  security: 30,
  alert: 30,
  work: 20,
  info: 10,
};
