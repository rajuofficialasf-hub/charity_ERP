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
  return (await reachedProjects(db, principal, scope, [projectId])).has(projectId);
}

/**
 * Those of the projects the caller's project scope reaches, by the rule of `reachesProject`, read
 * together: one query through the project filter, and one read of the caller's own work for the
 * rest under a SELF instance, however many projects are asked about.
 */
export async function reachedProjects(
  db: Tx | PrismaService,
  principal: Principal,
  scope: Scope,
  projectIds: readonly string[],
): Promise<Set<string>> {
  const i = scope.instances;
  const asked = [...new Set(projectIds)].filter((id) => !i.revokedProjectIds.includes(id));
  if (!asked.length) return new Set();
  const filtered = await db.project.findMany({
    where: { AND: [{ id: { in: asked } }, projectWhere(scope)] },
    select: { id: true },
  });
  const reached = new Set(filtered.map((p) => p.id));
  const rest = asked.filter((id) => !reached.has(id));
  if (i.self && rest.length)
    for (const id of await worksOn(db, principal.userId, rest)) reached.add(id);
  return reached;
}

/** Those of the projects the user works on: a staff place, an accepted assignment, or a team. */
async function worksOn(
  db: Tx | PrismaService,
  userId: string,
  projectIds: string[],
): Promise<string[]> {
  const [staff, assignments, member] = await Promise.all([
    db.projectStaff.findMany({
      where: { projectId: { in: projectIds }, userId, endedAt: null },
      select: { projectId: true },
    }),
    db.projectVolunteer.findMany({
      where: { ...WORKING_ASSIGNMENT, projectId: { in: projectIds }, volunteer: { userId } },
      select: { projectId: true },
    }),
    db.volunteer.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  const own = new Set([...staff, ...assignments].map((r) => r.projectId));
  // the team's projects only where the user's own places leave a project open
  if (member && projectIds.some((id) => !own.has(id)))
    for (const id of await workingTeamProjects(db, member.id)) own.add(id);
  return projectIds.filter((id) => own.has(id));
}
