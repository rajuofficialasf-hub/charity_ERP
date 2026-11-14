import {
  type EffectiveAccess,
  WORKING_ASSIGNMENT,
  workingTeamProjects,
} from '../access/effective.js';
import { holdsPermission, projectWhere, type Scope } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { Principal } from '../auth/principal.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';

/** Whether the user is a volunteer on the active blocklist; a blocked volunteer reaches no application. */
export async function isBlockedVolunteer(db: Tx | PrismaService, userId: string): Promise<boolean> {
  const own = await db.volunteer.findUnique({ where: { userId }, select: { id: true } });
  if (!own) return false;
  const blocked = await db.blocklist.count({
    where: { subjectType: 'volunteer', subjectId: own.id, active: true },
  });
  return blocked > 0;
}

/** Whether the caller holds the permission with a scope that reaches the application. */
export async function reachesApplication(
  access: AccessService,
  principal: Principal,
  effective: EffectiveAccess,
  permission: string,
  applicationId: string,
): Promise<boolean> {
  if (!holdsPermission(permission, effective.grants)) return false;
  const scope = await access.scopeFor(principal, effective, permission, 'application');
  return access.reaches(scope, { applicationId });
}

/** 403 without the permission, 404 when its scope misses the application (or there is none). */
export async function assertReachesApplication(
  access: AccessService,
  principal: Principal,
  effective: EffectiveAccess,
  permission: string,
  applicationId: string | null,
): Promise<void> {
  if (!holdsPermission(permission, effective.grants)) {
    access.denied(principal.userId, permission, 'application');
    throw new ApiError('permission.denied', 403);
  }
  if (
    !applicationId ||
    !(await reachesApplication(access, principal, effective, permission, applicationId))
  )
    throw new ApiError('permission.not_found', 404);
}

/**
 * Whether the caller's project scope reaches the project: a global, program, project or area
 * instance through the project filter; a SELF instance through the caller's own work on it (an
 * accepted assignment, a staff place, or a team whose lead works there). A project a panel revoke
 * took out is never reached. The project must exist.
 */
export async function reachesProject(
  db: Tx | PrismaService,
  principal: Principal,
  scope: Scope,
  projectId: string,
): Promise<boolean> {
  const i = scope.instances;
  if (i.revokedProjectIds.includes(projectId)) return false;
  const filtered = await db.project.count({
    where: { AND: [{ id: projectId }, projectWhere(scope)] },
  });
  if (filtered > 0) return true;
  return i.self && (await worksOn(db, principal.userId, projectId));
}

/** Whether the user works on the project: a staff place, an accepted assignment, or a team. */
async function worksOn(db: Tx | PrismaService, userId: string, projectId: string) {
  const [staff, assignment, member] = await Promise.all([
    db.projectStaff.count({ where: { projectId, userId, endedAt: null } }),
    db.projectVolunteer.count({
      where: { ...WORKING_ASSIGNMENT, projectId, volunteer: { userId } },
    }),
    db.volunteer.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  if (staff + assignment > 0) return true;
  return member ? (await workingTeamProjects(db, member.id)).includes(projectId) : false;
}
