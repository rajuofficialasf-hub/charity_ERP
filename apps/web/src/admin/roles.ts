import type { Me } from '@css/shared/auth';

/**
 * The audience of the admin area (SYSTEM_ARCHITECTURE 4.2, UX-15): Department Head, Monitoring
 * Team and Program Managers, and the RPM and the Project Executive for the registrations page
 * (plan docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, R7). These lists
 * follow the role defaults of docs/security/permissions.yaml and only decide what the PWA shows;
 * every admin endpoint checks its own permission and scope on the server (RE-SEC-05, default deny).
 */
export const ADMIN_ROLES: readonly string[] = [
  'department_head',
  'monitoring_team',
  'program_manager',
  'regional_program_manager',
  'project_executive',
];

/** The permission panel is for the Department Head and the Monitoring Team only (RBAC.md 7). */
export const PERMISSION_PANEL_ROLES: readonly string[] = ['department_head', 'monitoring_team'];

/** Volunteer registration approvers (`registration.approve`, Q-19, BR-029). */
export const REGISTRATION_ROLES: readonly string[] = ADMIN_ROLES;

/** Staff registration approvers (`staff.registration.approve`, BR-028). */
export const STAFF_APPROVER_ROLES: readonly string[] = ['department_head', 'monitoring_team'];

/** Edit request approvers (`edit_request.approve`, BR-031 as amended by DECISION_LOG D-085). */
export const EDIT_REQUEST_ROLES: readonly string[] = [
  'department_head',
  'monitoring_team',
  'regional_program_manager',
  'project_executive',
];

/** Volunteer blocklist (`volunteer.block`, `volunteer.unblock`, BD-06, BR-047). */
export const BLOCKLIST_ROLES: readonly string[] = [
  'department_head',
  'monitoring_team',
  'program_manager',
  'regional_program_manager',
];

/** The staff handover and the deactivation after it (`user.handover`, `user.state.change`; BD-08). */
export const HANDOVER_ROLES: readonly string[] = ['department_head', 'monitoring_team'];

const holds = (me: Pick<Me, 'roles'>, roles: readonly string[]) =>
  me.roles.some((role) => roles.includes(role));

export const canManagePermissions = (me: Pick<Me, 'roles'>) => holds(me, PERMISSION_PANEL_ROLES);
export const canOpenAdmin = (me: Pick<Me, 'roles'>) => holds(me, ADMIN_ROLES);
export const canApproveStaff = (me: Pick<Me, 'roles'>) => holds(me, STAFF_APPROVER_ROLES);
export const canDecideEdits = (me: Pick<Me, 'roles'>) => holds(me, EDIT_REQUEST_ROLES);
export const canBlock = (me: Pick<Me, 'roles'>) => holds(me, BLOCKLIST_ROLES);
export const canHandOver = (me: Pick<Me, 'roles'>) => holds(me, HANDOVER_ROLES);
