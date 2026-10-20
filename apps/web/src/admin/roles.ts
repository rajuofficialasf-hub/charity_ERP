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

/**
 * The nationwide volunteer tab (`volunteer.view_all`, DECISION_LOG O-67): the management roles and
 * the Official দায়ী and the Implementer.
 */
export const VOLUNTEER_TAB_ROLES: readonly string[] = [
  ...ADMIN_ROLES,
  'official_daee',
  'implementer',
];

/**
 * The nationwide beneficiary tab (`beneficiary.view_all`): also the Media Team and the Procurement
 * Team, who see a limited view (the server masks it).
 */
export const BENEFICIARY_TAB_ROLES: readonly string[] = [
  ...VOLUNTEER_TAB_ROLES,
  'media_team',
  'procurement_team',
];

/**
 * Who sees a beneficiary's personal details, care data and blocklist status (the classes
 * `beneficiary.profile_detail` and `beneficiary.care`), and who sees the union and the village
 * (`beneficiary.address_detail`, also the Procurement Team). The server masks them anyway.
 */
const BENEFICIARY_DETAIL_ROLES: readonly string[] = VOLUNTEER_TAB_ROLES;
export const BENEFICIARY_ADDRESS_ROLES: readonly string[] = [
  ...BENEFICIARY_DETAIL_ROLES,
  'procurement_team',
];

/** Who sees volunteer categories and ratings (the class `volunteer.rating`). */
export const CATEGORY_ROLES: readonly string[] = ADMIN_ROLES;

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
/** Everyone with at least one destination in the admin area. */
export const canOpenAdmin = (me: Pick<Me, 'roles'>) => holds(me, BENEFICIARY_TAB_ROLES);
export const canApproveRegistrations = (me: Pick<Me, 'roles'>) => holds(me, REGISTRATION_ROLES);
export const canSeeVolunteers = (me: Pick<Me, 'roles'>) => holds(me, VOLUNTEER_TAB_ROLES);
export const canSeeBeneficiaries = (me: Pick<Me, 'roles'>) => holds(me, BENEFICIARY_TAB_ROLES);
export const canSeeCategories = (me: Pick<Me, 'roles'>) => holds(me, CATEGORY_ROLES);
export const canSeeBeneficiaryDetails = (me: Pick<Me, 'roles'>) =>
  holds(me, BENEFICIARY_DETAIL_ROLES);
export const canSeeBeneficiaryAddress = (me: Pick<Me, 'roles'>) =>
  holds(me, BENEFICIARY_ADDRESS_ROLES);
export const canApproveStaff = (me: Pick<Me, 'roles'>) => holds(me, STAFF_APPROVER_ROLES);
export const canDecideEdits = (me: Pick<Me, 'roles'>) => holds(me, EDIT_REQUEST_ROLES);
export const canBlock = (me: Pick<Me, 'roles'>) => holds(me, BLOCKLIST_ROLES);
export const canHandOver = (me: Pick<Me, 'roles'>) => holds(me, HANDOVER_ROLES);
