import type { Me } from '@css/shared/auth';

/**
 * The management audience of the admin area (SYSTEM_ARCHITECTURE 4.2, UX-15): Department Head,
 * Monitoring Team and Program Managers. This only decides what the PWA shows; every admin
 * endpoint checks its own permission on the server (RE-SEC-05, default deny).
 */
export const ADMIN_ROLES: readonly string[] = [
  'department_head',
  'monitoring_team',
  'program_manager',
];

/** The permission panel is for the Department Head and the Monitoring Team only (RBAC.md 7). */
export const PERMISSION_PANEL_ROLES: readonly string[] = ['department_head', 'monitoring_team'];

export function canManagePermissions(me: Pick<Me, 'roles'>): boolean {
  return me.roles.some((role) => PERMISSION_PANEL_ROLES.includes(role));
}

export function canOpenAdmin(me: Pick<Me, 'roles'>): boolean {
  return me.roles.some((role) => ADMIN_ROLES.includes(role));
}
