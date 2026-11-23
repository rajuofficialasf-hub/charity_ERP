import type { Me } from '@css/shared/auth';

/**
 * The audience of the admin area (docs/architecture/SYSTEM_ARCHITECTURE.md, "Route groups of the
 * PWA (apps/web/src, React Router)"): Department Head, Monitoring Team and Program Managers, and
 * the RPM and the Project Executive for the registrations page. These lists follow the role
 * defaults of docs/security/permissions.yaml and only decide what the PWA shows; every admin
 * endpoint checks its own permission and scope on the server (default deny).
 */
export const ADMIN_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'program_manager',
  'regional_program_manager',
  'project_executive',
];

/**
 * The nationwide volunteer tab (`volunteer.view_all`): the management roles and
 * the Official দায়ী.
 */
export const VOLUNTEER_TAB_ROLES: readonly string[] = [...ADMIN_ROLES, 'official_daee'];

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
 * Executive and the global roles, the same as `PROJECT_ROLES`); the server checks the project.
 */
export const BENEFICIARY_LOOKUP_ROLES: readonly string[] = ADMIN_ROLES;

/**
 * Who sees the suggested duplicate profiles and the merge proposals and marks a pair as two people
 * (`beneficiary.merge.dismiss`: the PM in its program, the RPM in its region and the global roles).
 * Whether a merge or a proposal is offered follows the action flags of the two profiles.
 */
export const DUPLICATE_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'program_manager',
  'regional_program_manager',
];

/** Who sees volunteer categories and ratings (the class `volunteer.rating`). */
export const CATEGORY_ROLES: readonly string[] = ADMIN_ROLES;

/**
 * The permission panel is for the Department Head and the Monitoring Team only
 * (docs/security/RBAC.md, "Permission panel").
 */
export const PERMISSION_PANEL_ROLES: readonly string[] = ['admin', 'department_head'];

/** Who sees the programs (`program.view`; the global roles and the PMs, each its own program). */
export const PROGRAM_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'program_manager',
];

/** Who creates, renames, deactivates programs and assigns their PM (the global roles). */
export const PROGRAM_ADMIN_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
];

/** Who sees projects in the admin area (`project.view`: the PM, the RPM and the Executive). */
export const PROJECT_ROLES: readonly string[] = ADMIN_ROLES;

/**
 * Who opens the programs and projects tab (`project.overview.view`: every program and project as
 * cards with counts; the PM, the RPM and the Executive, and the global roles).
 */
export const PROJECT_OVERVIEW_ROLES: readonly string[] = ADMIN_ROLES;

/**
 * Who opens the tab at all: the overview roles, and the Procurement Team, which sees only the list
 * of the house-construction sessions it is attached to (`project.view` with that condition), and
 * from a session only its applications.
 */
export const PROJECT_LIST_ROLES: readonly string[] = [
  ...PROJECT_OVERVIEW_ROLES,
  'procurement_team',
];

/** Who creates a draft project (`project.create`: the PM in its program, and the global roles). */
export const PROJECT_CREATE_ROLES: readonly string[] = PROGRAM_ROLES;

/** Volunteer registration approvers (`registration.approve`). */
export const REGISTRATION_ROLES: readonly string[] = ADMIN_ROLES;

/** Staff registration approvers (`staff.registration.approve`). */
export const STAFF_APPROVER_ROLES: readonly string[] = ['admin', 'department_head'];

/**
 * Who decides an official's own change request (`staff_edit_request.approve`; docs/DECISION_LOG.md,
 * the official's own profile of 2026-11-02): the two global roles, never the person who asked.
 */
export const STAFF_EDIT_DECIDER_ROLES: readonly string[] = ['admin', 'department_head'];

/** Edit request approvers (`edit_request.approve`). */
export const EDIT_REQUEST_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'regional_program_manager',
  'project_executive',
];

/** Volunteer blocklist (`volunteer.block`, `volunteer.unblock`). */
export const BLOCKLIST_ROLES: readonly string[] = [
  'admin',
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
  'admin',
  'department_head',
  'monitoring_team',
  'regional_program_manager',
  'project_executive',
];
/** Who marks a volunteer as paid on a project (`volunteer.mark_paid`). */
export const MARK_PAID_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'regional_program_manager',
];
/** Who grants "if RPM grants" extras to the staff of a project (`project.volunteer_grant.manage`). */
export const PROJECT_GRANT_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'regional_program_manager',
];

/**
 * The officials' directory and organogram (`permission.view`: the global roles, the PM in its
 * program, the RPM in its region).
 */
export const STAFF_DIRECTORY_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'program_manager',
  'regional_program_manager',
];
/** Who creates officials, edits their profile and renews their link (`user.create`, `user.profile.manage`). */
export const OFFICIAL_ADMIN_ROLES: readonly string[] = ['admin', 'department_head'];

/**
 * The settings page, the audit log, the active sessions and the system health: the global roles
 * only (`settings.manage`, `provider.settings.manage`, `audit.view` and `session.revoke_user` at
 * global scope, `system.health.view`; docs/DECISION_LOG.md, the admin and settings decision).
 */
export const SYSTEM_ADMIN_ROLES: readonly string[] = ['admin', 'department_head'];
/** The nisab versions: the Program Manager and above (`nisab.set`). */
export const NISAB_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'program_manager',
];

/** The staff handover and the deactivation after it (`user.handover`, `user.state.change`). */
/** Who may see and end another person's device sessions (the permission `session.revoke_user`). */
export const SESSION_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'regional_program_manager',
];
export const HANDOVER_ROLES: readonly string[] = ['admin', 'department_head'];

const holds = (me: Pick<Me, 'roles'>, roles: readonly string[]) =>
  me.roles.some((role) => roles.includes(role));

/**
 * The lists' export (`export.list`): the roles whose defaults hold it, and the two global roles.
 * A volunteer never sees the button; the server checks the permission, its scope and every
 * protected column again.
 */
export const EXPORT_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'program_manager',
  'regional_program_manager',
  'project_executive',
  'official_daee',
  'finance_team',
  'media_team',
  'media_director',
  'media_assistant_director',
  'procurement_team',
];

/** The beneficiary's 360° profile as a PDF (`report.beneficiary_journey`) and the global roles. */
export const JOURNEY_PDF_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'program_manager',
  'regional_program_manager',
  'project_executive',
  'official_daee',
];

export const canExport = (me: Pick<Me, 'roles'>) => holds(me, EXPORT_ROLES);
export const canPrintProfile = (me: Pick<Me, 'roles'>) => holds(me, JOURNEY_PDF_ROLES);

export const canManagePermissions = (me: Pick<Me, 'roles'>) => holds(me, PERMISSION_PANEL_ROLES);
export const canAdministerSystem = (me: Pick<Me, 'roles'>) => holds(me, SYSTEM_ADMIN_ROLES);
/** The office addresses the rate limits exempt: the Admin alone (`security.office_ips.manage`). */
export const canKeepOfficeAddresses = (me: Pick<Me, 'roles'>) => holds(me, ['admin']);
/**
 * The roles that hold every scope: an Admin, the Department Head and the Monitoring Team. They
 * read everything, and the server holds them to the longer password.
 */
export const GLOBAL_ROLES: readonly string[] = ['admin', 'department_head', 'monitoring_team'];
export const holdsGlobalRole = (me: Pick<Me, 'roles'>) => holds(me, GLOBAL_ROLES);
/**
 * The two roles at the top: an Admin, who maintains the system, and the Department Head. An Admin
 * alone gives them.
 */
export const TOP_ROLES: readonly string[] = ['admin', 'department_head'];
/**
 * The official roles a person may give in a new account or a registration's approval: an Admin
 * gives every one, anyone else every one but the two at the top. The server decides again.
 */
export const mayGiveRole = (me: Pick<Me, 'roles'>, roleKey: string) =>
  me.roles.includes('admin') || !TOP_ROLES.includes(roleKey);
/**
 * Who changes an official's role (`user.role.change`): an Admin and the Department Head, never for
 * themselves; the server checks the role given and the work to hand over again.
 */
export const canChangeRoles = (me: Pick<Me, 'roles'>) => holds(me, TOP_ROLES);
/** The oversight the Monitoring Team keeps beside them: the audit log and the message deliveries. */
export const canOversee = (me: Pick<Me, 'roles'>) => holds(me, GLOBAL_ROLES);
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
/**
 * Who sees a person's application history and how often they were helped (the class
 * `beneficiary.application_history`): the officials and the Procurement Team, never the Media Team.
 * The server masks the count and refuses its filter and order anyway.
 */
export const canSeeHelpHistory = (me: Pick<Me, 'roles'>) => holds(me, BENEFICIARY_ADDRESS_ROLES);
export const canLookUpBeneficiaries = (me: Pick<Me, 'roles'>) =>
  holds(me, BENEFICIARY_LOOKUP_ROLES);
export const canReviewDuplicates = (me: Pick<Me, 'roles'>) => holds(me, DUPLICATE_ROLES);
export const canApproveStaff = (me: Pick<Me, 'roles'>) => holds(me, STAFF_APPROVER_ROLES);
export const canDecideEdits = (me: Pick<Me, 'roles'>) => holds(me, EDIT_REQUEST_ROLES);
export const canDecideStaffEdits = (me: Pick<Me, 'roles'>) => holds(me, STAFF_EDIT_DECIDER_ROLES);
/**
 * Who sees an official's projects and the figures of their work (`staff.work.view`): the two
 * global roles, and the Program Manager for the projects of their program (the server narrows it).
 */
export const STAFF_WORK_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'program_manager',
];
export const canSeeStaffWork = (me: Pick<Me, 'roles'>) => holds(me, STAFF_WORK_ROLES);
export const canBlock = (me: Pick<Me, 'roles'>) => holds(me, BLOCKLIST_ROLES);
export const canHandOver = (me: Pick<Me, 'roles'>) => holds(me, HANDOVER_ROLES);
export const canEndSessions = (me: Pick<Me, 'roles'>) => holds(me, SESSION_ROLES);
/** Who may see and end another official's device sessions: the global roles only (an RPM reaches volunteers). */
export const canEndStaffSessions = (me: Pick<Me, 'roles'>) => holds(me, PERMISSION_PANEL_ROLES);
export const canSeePrograms = (me: Pick<Me, 'roles'>) => holds(me, PROGRAM_ROLES);
export const canManagePrograms = (me: Pick<Me, 'roles'>) => holds(me, PROGRAM_ADMIN_ROLES);
export const canSeeProjects = (me: Pick<Me, 'roles'>) => holds(me, PROJECT_ROLES);
export const canSeeProjectOverview = (me: Pick<Me, 'roles'>) => holds(me, PROJECT_OVERVIEW_ROLES);
export const canListProjects = (me: Pick<Me, 'roles'>) => holds(me, PROJECT_LIST_ROLES);
export const canCreateProjects = (me: Pick<Me, 'roles'>) => holds(me, PROJECT_CREATE_ROLES);
export const canAssignVolunteers = (me: Pick<Me, 'roles'>) => holds(me, ASSIGN_ROLES);

/**
 * Who hands a volunteer's applications to another (`application.transfer`): the two global roles,
 * the RPM and the Executive the RPM grants it; who moves the old volunteer's team with them
 * (`volunteer.team.transfer`): the RPM and the global roles. The server decides each by area.
 */
export const TRANSFER_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'regional_program_manager',
  'project_executive',
];
export const TEAM_TRANSFER_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'regional_program_manager',
];
export const canTransferApplications = (me: Pick<Me, 'roles'>) => holds(me, TRANSFER_ROLES);
export const canMoveTeams = (me: Pick<Me, 'roles'>) => holds(me, TEAM_TRANSFER_ROLES);
export const canMarkPaid = (me: Pick<Me, 'roles'>) => holds(me, MARK_PAID_ROLES);
export const canGrantOnProject = (me: Pick<Me, 'roles'>) => holds(me, PROJECT_GRANT_ROLES);
export const canSeeStaff = (me: Pick<Me, 'roles'>) => holds(me, STAFF_DIRECTORY_ROLES);

/**
 * Who gives and ends an official's extra area for volunteers (`user.extra_area.manage`): an Admin
 * and the Department Head for anyone, a PM and an RPM for those below them; the server checks the
 * person and the area again (docs/security/RBAC.md, "Data scopes and their resolution").
 */
const EXTRA_AREA_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'program_manager',
  'regional_program_manager',
];
export const canManageExtraAreas = (me: Pick<Me, 'roles'>) => holds(me, EXTRA_AREA_ROLES);
/** The whole country as an extra area is an Admin's or the Department Head's to give. */
export const canGiveWholeCountry = (me: Pick<Me, 'roles'>) => holds(me, OFFICIAL_ADMIN_ROLES);

/**
 * Who sees the volunteers and beneficiaries of the own projects' areas alone, so an empty tab
 * says so: the four roles that work by area. The roles that see the whole country, the Media
 * roles with their limited view of everyone and the Procurement Team with its own projects read
 * the plain empty state.
 */
const BY_AREA_ROLES: readonly string[] = [
  'program_manager',
  'regional_program_manager',
  'project_executive',
  'official_daee',
];
export const seesPeopleByArea = (me: Pick<Me, 'roles'>) =>
  holds(me, BY_AREA_ROLES) && !holdsGlobalRole(me);
export const canManageOfficials = (me: Pick<Me, 'roles'>) => holds(me, OFFICIAL_ADMIN_ROLES);

/**
 * Who builds and publishes forms and the question library: the two global roles (`form.build`,
 * `form.publish`, `form.library.manage`). A PM places a ready form on a project instead.
 */
export const FORM_BUILDER_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
];
export const canBuildForms = (me: Pick<Me, 'roles'>) => holds(me, FORM_BUILDER_ROLES);

/**
 * Who switches a project form's public link on and off (`form.public_link.manage`): the PM of the
 * program and the two global roles. The server decides each change by the scope of the grant.
 */
export const PUBLIC_LINK_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'program_manager',
];
export const canManagePublicLink = (me: Pick<Me, 'roles'>) => holds(me, PUBLIC_LINK_ROLES);

/**
 * Who places a published ready form on a project and takes its newer versions (`form.place`): the
 * PM of the program and the two global roles. The server decides each placement by its scope.
 */
export const FORM_PLACE_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'program_manager',
];
export const canPlaceForms = (me: Pick<Me, 'roles'>) => holds(me, FORM_PLACE_ROLES);

/** Who opens a project's applications: every official holding `application.view` (the server scopes the rows). */
export const APPLICATION_ROLES: readonly string[] = [...ADMIN_ROLES, 'procurement_team'];
export const canSeeApplications = (me: Pick<Me, 'roles'>) => holds(me, APPLICATION_ROLES);

/**
 * Who may decide on applications (`application.approve`, `application.waitlist`): the two global
 * roles, the PM, the RPM, and the Executive or Official দায়ী the RPM grants it to. The server
 * decides each project by its scope and grants.
 */
export const DECISION_ROLES: readonly string[] = [
  'admin',
  'department_head',
  'monitoring_team',
  'program_manager',
  'regional_program_manager',
  'project_executive',
  'official_daee',
];
export const canDecideApplications = (me: Pick<Me, 'roles'>) => holds(me, DECISION_ROLES);

/** The Media Team's own roles: the members and the two directors. */
export const MEDIA_ROLES: readonly string[] = [
  'media_team',
  'media_director',
  'media_assistant_director',
];

/**
 * Who opens the Media Team's screens (`media.work.view`): the Media Team, the referrers (PM, RPM)
 * and the two global roles; a member sees only their own works (the server limits it).
 */
export const MEDIA_WORK_ROLES: readonly string[] = [
  ...MEDIA_ROLES,
  'program_manager',
  'regional_program_manager',
  'admin',
  'department_head',
  'monitoring_team',
];
