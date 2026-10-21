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
  'media_director',
  'media_assistant_director',
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

/**
 * Who gets the lookup by NID or birth registration on the beneficiary tab: the roles that hold
 * `beneficiary.lookup` and can pick one of their projects there (the PM, the RPM, the Project
 * Executive and the global roles, the same as `PROJECT_ROLES`). The Implementer holds the
 * permission too but has no project list on this tab, so it looks up from the application form;
 * the server checks the project.
 */
export const BENEFICIARY_LOOKUP_ROLES: readonly string[] = ADMIN_ROLES;

/** Who sees volunteer categories and ratings (the class `volunteer.rating`). */
export const CATEGORY_ROLES: readonly string[] = ADMIN_ROLES;

/** The permission panel is for the Department Head and the Monitoring Team only (RBAC.md 7). */
export const PERMISSION_PANEL_ROLES: readonly string[] = ['department_head', 'monitoring_team'];

/** Who sees the programs (`program.view`; the global roles and the PMs, each its own program). */
export const PROGRAM_ROLES: readonly string[] = [
  'department_head',
  'monitoring_team',
  'program_manager',
];

/** Who creates, renames, deactivates programs and assigns their PM (the global roles). */
export const PROGRAM_ADMIN_ROLES: readonly string[] = ['department_head', 'monitoring_team'];

/** Who sees projects in the admin area (`project.view`: the PM, the RPM and the Executive). */
export const PROJECT_ROLES: readonly string[] = ADMIN_ROLES;

/** Who creates a draft project (`project.create`: the PM in its program, and the global roles). */
export const PROJECT_CREATE_ROLES: readonly string[] = PROGRAM_ROLES;

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

/**
 * Who assigns volunteers to a project (`volunteer.assign_project`: the RPM in its areas, an
 * executive only with the RPM's grant, and the global roles; the server decides per project).
 */
export const ASSIGN_ROLES: readonly string[] = [
  'department_head',
  'monitoring_team',
  'regional_program_manager',
  'project_executive',
];
/** Who marks a volunteer as paid on a project (`volunteer.mark_paid`). */
export const MARK_PAID_ROLES: readonly string[] = [
  'department_head',
  'monitoring_team',
  'regional_program_manager',
];
/** Who grants "if RPM grants" extras to the staff of a project (`project.volunteer_grant.manage`). */
export const PROJECT_GRANT_ROLES: readonly string[] = [
  'department_head',
  'monitoring_team',
  'regional_program_manager',
];

/**
 * The officials' directory and organogram (`permission.view`: the global roles, the PM in its
 * program, the RPM in its region; DECISION_LOG D-097).
 */
export const STAFF_DIRECTORY_ROLES: readonly string[] = [
  'department_head',
  'monitoring_team',
  'program_manager',
  'regional_program_manager',
];
/** Who creates officials, edits their profile and renews their link (`user.create`, `user.profile.manage`). */
export const OFFICIAL_ADMIN_ROLES: readonly string[] = ['department_head', 'monitoring_team'];

/**
 * The settings page, the audit log, the active sessions and the system health: the global roles
 * only (`settings.manage`, `provider.settings.manage`, `audit.view` and `session.revoke_user` at
 * global scope, `system.health.view`; docs/DECISION_LOG.md, the admin and settings decision).
 */
export const SYSTEM_ADMIN_ROLES: readonly string[] = ['department_head', 'monitoring_team'];
/** The nisab versions: the Program Manager and above (`nisab.set`). */
export const NISAB_ROLES: readonly string[] = [
  'department_head',
  'monitoring_team',
  'program_manager',
];

/** The staff handover and the deactivation after it (`user.handover`, `user.state.change`; BD-08). */
/** Who may see and end another person's device sessions (the permission `session.revoke_user`). */
export const SESSION_ROLES: readonly string[] = [
  'department_head',
  'monitoring_team',
  'regional_program_manager',
];
export const HANDOVER_ROLES: readonly string[] = ['department_head', 'monitoring_team'];

const holds = (me: Pick<Me, 'roles'>, roles: readonly string[]) =>
  me.roles.some((role) => roles.includes(role));

export const canManagePermissions = (me: Pick<Me, 'roles'>) => holds(me, PERMISSION_PANEL_ROLES);
export const canAdministerSystem = (me: Pick<Me, 'roles'>) => holds(me, SYSTEM_ADMIN_ROLES);
export const canKeepNisab = (me: Pick<Me, 'roles'>) => holds(me, NISAB_ROLES);
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
export const canLookUpBeneficiaries = (me: Pick<Me, 'roles'>) =>
  holds(me, BENEFICIARY_LOOKUP_ROLES);
export const canApproveStaff = (me: Pick<Me, 'roles'>) => holds(me, STAFF_APPROVER_ROLES);
export const canDecideEdits = (me: Pick<Me, 'roles'>) => holds(me, EDIT_REQUEST_ROLES);
export const canBlock = (me: Pick<Me, 'roles'>) => holds(me, BLOCKLIST_ROLES);
export const canHandOver = (me: Pick<Me, 'roles'>) => holds(me, HANDOVER_ROLES);
export const canEndSessions = (me: Pick<Me, 'roles'>) => holds(me, SESSION_ROLES);
/** Who may see and end another official's device sessions: the global roles only (an RPM reaches volunteers). */
export const canEndStaffSessions = (me: Pick<Me, 'roles'>) => holds(me, PERMISSION_PANEL_ROLES);
export const canSeePrograms = (me: Pick<Me, 'roles'>) => holds(me, PROGRAM_ROLES);
export const canManagePrograms = (me: Pick<Me, 'roles'>) => holds(me, PROGRAM_ADMIN_ROLES);
export const canSeeProjects = (me: Pick<Me, 'roles'>) => holds(me, PROJECT_ROLES);
export const canCreateProjects = (me: Pick<Me, 'roles'>) => holds(me, PROJECT_CREATE_ROLES);
export const canAssignVolunteers = (me: Pick<Me, 'roles'>) => holds(me, ASSIGN_ROLES);
export const canMarkPaid = (me: Pick<Me, 'roles'>) => holds(me, MARK_PAID_ROLES);
export const canGrantOnProject = (me: Pick<Me, 'roles'>) => holds(me, PROJECT_GRANT_ROLES);
export const canSeeStaff = (me: Pick<Me, 'roles'>) => holds(me, STAFF_DIRECTORY_ROLES);
export const canManageOfficials = (me: Pick<Me, 'roles'>) => holds(me, OFFICIAL_ADMIN_ROLES);
