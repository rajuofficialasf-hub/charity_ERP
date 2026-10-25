import { uuidv7 } from '@css/shared';
import {
  type AssignmentCreate,
  type AssignmentUpdate,
  type CandidateFilter,
  defaultPermissionSet,
  type PermissionSet,
  permissionSetAllowed,
} from '@css/shared/projects';
import { VOLUNTEER_TYPES, type VolunteerType } from '@css/shared/registration';
import type { AccessService } from '../access/service';
import { liveApplicationCounts } from '../applications/limit';
import type { AuditWriter } from '../audit/audit-writer';
import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  type PageQuery,
  parseSort,
} from '../core/pagination';
import type { PrismaService, Tx } from '../core/prisma.service';
import { isNumberTerm, literalContains, mobileOf } from '../core/search';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { ProjectViewer, ProjectsService } from './projects';
import type { ProjectEvents } from '../notifications/project-events';

/** Newest first, by id (UUID v7 follows the time of creation and pages without gaps). */
const SORT = parseSort(undefined, ['id'], [{ field: 'id', direction: 'desc' }]);

/** Volunteers are assigned while the project is set up or running. */
const ASSIGNABLE = ['draft', 'active'];

const ASSIGNMENT = {
  id: true,
  volunteerId: true,
  regionLocationId: true,
  permissionSet: true,
  isPaid: true,
  consentStatus: true,
  consentAt: true,
  createdAt: true,
  volunteer: { select: { type: true, user: { select: { displayName: true } } } },
} satisfies Prisma.ProjectVolunteerSelect;
type AssignmentRow = Prisma.ProjectVolunteerGetPayload<{ select: typeof ASSIGNMENT }>;

const typeOf = (value: string): VolunteerType => {
  const type = VOLUNTEER_TYPES.find((t) => t === value);
  if (!type) throw new Error(`unknown volunteer type ${value}`);
  return type;
};

/** One assignment as the office reads it, with the live count of the volunteer's applications. */
function view(a: AssignmentRow, applicationsCounted: number) {
  return {
    id: a.id,
    volunteerId: a.volunteerId,
    displayName: a.volunteer.user.displayName,
    type: a.volunteer.type,
    regionLocationId: a.regionLocationId,
    permissionSet: a.permissionSet,
    isPaid: a.isPaid,
    consentStatus: a.consentStatus === 'accepted' ? 'accepted' : 'pending',
    consentAt: a.consentAt?.toISOString() ?? null,
    applicationsCounted,
    assignedAt: a.createdAt.toISOString(),
  };
}

/** A volunteer's place in one of the caller's area locations (a division, or a district). */
const inAreas = (areas: string[]): Prisma.VolunteerWhereInput => ({
  OR: [{ divisionId: { in: areas } }, { districtId: { in: areas } }],
});

/**
 * Volunteers on a project (BR-037, BR-038; DECISION_LOG D-096): an RPM assigns the approved, not
 * blocked volunteers living in their own areas of the project, several at once, each with a
 * permission set meant for the volunteer's type and a paid flag; an executive does the same only
 * with the RPM's grant, in the area of their access; the global roles work in every area. Changing
 * and ending an assignment stay inside the same areas. A volunteer is never both assigned to a
 * project and on a team of it. A new assignment waits for the volunteer to accept the rules.
 */
export class ProjectVolunteersService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly projects: ProjectsService,
    private readonly clock: Clock,
    private readonly events: ProjectEvents,
  ) {}

  private refuse(viewer: ProjectViewer): never {
    this.access.denied(viewer.principal.userId, viewer.scope.permission, viewer.scope.entity);
    throw new ApiError('permission.denied', 403);
  }

  /**
   * The area locations of the project the caller works in: all of them for a global role and for a
   * caller who holds the permission on the whole project or its program, else the caller's own.
   */
  private async callerAreas(
    db: Tx,
    viewer: ProjectViewer,
    project: { id: string; programId: string },
  ) {
    const i = viewer.scope.instances;
    if (i.global || i.programIds.includes(project.programId) || i.projectIds.includes(project.id)) {
      const all = await db.projectArea.findMany({
        where: { projectId: project.id },
        select: { locationId: true },
      });
      return [...new Set(all.map((a) => a.locationId))];
    }
    return [
      ...new Set(
        i.areas
          .filter((a) => a.projectId === project.id || a.projectId === null)
          .map((a) => a.locationId),
      ),
    ];
  }

  /** The volunteers on the blocklist now, among some or all. */
  private async blocked(db: Tx, ids?: string[]): Promise<Set<string>> {
    const rows = await db.blocklist.findMany({
      where: { subjectType: 'volunteer', active: true, ...(ids ? { subjectId: { in: ids } } : {}) },
      select: { subjectId: true },
    });
    return new Set(rows.map((r) => r.subjectId));
  }

  private async mayMarkPaid(viewer: ProjectViewer, projectId: string, db: Tx): Promise<boolean> {
    return this.access.holdsOnProject(
      viewer.principal.userId,
      'volunteer.mark_paid',
      projectId,
      db,
    );
  }

  // ---- candidates

  async candidates(viewer: ProjectViewer, projectId: string, query: CandidateFilter & PageQuery) {
    const { project } = await this.projects.get(viewer, projectId);
    if (!('programId' in project)) this.refuse(viewer);
    const areas = await this.callerAreas(this.prisma, viewer, project);
    const binding = `projects.volunteerCandidates|${viewer.principal.userId}|${projectId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const and: Prisma.VolunteerWhereInput[] = [
      inAreas(areas),
      { user: { state: 'active' } },
      // a team member works through a team, never through an assignment
      { type: { not: 'team_member' } },
      { id: { notIn: [...(await this.blocked(this.prisma))] } },
      { projectVolunteersVolunteer: { none: { projectId, endedAt: null } } },
      { volunteerTeamsMemberVolunteer: { none: { projectId, removedAt: null } } },
    ];
    for (const column of ['districtId', 'upazilaId', 'unionId'] as const) {
      // eslint-disable-next-line security/detect-object-injection -- a fixed list of column names
      const value = query[column];
      if (value) and.push({ [column]: value });
    }
    if (query.q) and.push(this.search(query.q));
    const where: Prisma.VolunteerWhereInput = { AND: and };
    const fetched = await this.prisma.volunteer.findMany({
      where: cursor ? { AND: [where, keysetWhere(SORT, cursor)] } : where,
      orderBy: orderBy(SORT, direction),
      take: query.limit + 1,
      select: {
        id: true,
        type: true,
        divisionId: true,
        districtId: true,
        upazilaId: true,
        unionId: true,
        user: { select: { displayName: true } },
      },
    });
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort: SORT,
      direction,
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
    });
    return {
      rows: rows.map((v) => ({
        volunteerId: v.id,
        displayName: v.user.displayName,
        type: v.type,
        divisionId: v.divisionId,
        districtId: v.districtId,
        upazilaId: v.upazilaId,
        unionId: v.unionId,
        defaultPermissionSet: defaultPermissionSet(typeOf(v.type)),
      })),
      meta,
    };
  }

  /** A name matches by its letters (LIKE wildcards are letters); digits match the exact mobile only. */
  private search(term: string): Prisma.VolunteerWhereInput {
    if (!isNumberTerm(term))
      return { user: { displayName: { contains: literalContains(term), mode: 'insensitive' } } };
    const mobile = mobileOf(term.replace(/\D/g, ''));
    return mobile ? { user: { mobile } } : { id: { in: [] } };
  }

  /**
   * The assignment regions inside the caller's areas: the areas themselves and, for a division,
   * its districts (an assignment made in a district of a split division keeps that district).
   */
  private async regions(db: Tx, areas: string[]): Promise<string[]> {
    if (!areas.length) return [];
    const districts = await db.location.findMany({
      where: { parentId: { in: areas }, level: 'district' },
      select: { id: true },
    });
    return [...new Set([...areas, ...districts.map((d) => d.id)])];
  }

  // ---- the assigned volunteers

  async list(viewer: ProjectViewer, projectId: string, query: PageQuery) {
    if (viewer.principal.kind === 'volunteer') this.refuse(viewer);
    const { project } = await this.projects.get(viewer, projectId);
    if (!('programId' in project)) this.refuse(viewer);
    const areas = await this.callerAreas(this.prisma, viewer, project);
    const binding = `projects.volunteers|${viewer.principal.userId}|${projectId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const where: Prisma.ProjectVolunteerWhereInput = {
      projectId,
      endedAt: null,
      regionLocationId: { in: await this.regions(this.prisma, areas) },
    };
    const fetched = await this.prisma.projectVolunteer.findMany({
      where: cursor ? { AND: [where, keysetWhere(SORT, cursor)] } : where,
      orderBy: orderBy(SORT, direction),
      take: query.limit + 1,
      select: ASSIGNMENT,
    });
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort: SORT,
      direction,
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
    });
    const counted = await liveApplicationCounts(
      this.prisma,
      rows.map((r) => ({ projectId, ownerVolunteerId: r.volunteerId })),
    );
    return { rows: rows.map((r) => view(r, counted(projectId, r.volunteerId))), meta };
  }

  // ---- assign

  async assign(viewer: ProjectViewer, projectId: string, body: AssignmentCreate) {
    const actor = viewer.principal.userId;
    const ids = body.volunteers.map((v) => v.volunteerId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const project = await this.projects.locked(tx, viewer, projectId);
        if (!ASSIGNABLE.includes(project.status)) throw new ApiError('project.read_only', 409);
        if (
          body.volunteers.some((v) => v.isPaid) &&
          !(await this.mayMarkPaid(viewer, projectId, tx))
        )
          this.refuse(viewer);
        const areas = await this.callerAreas(tx, viewer, project);
        const [volunteers, blocked, assigned, onTeam] = await Promise.all([
          tx.volunteer.findMany({
            where: { AND: [{ id: { in: ids } }, inAreas(areas), { user: { state: 'active' } }] },
            select: { id: true, type: true, divisionId: true, districtId: true },
          }),
          this.blocked(tx, ids),
          tx.projectVolunteer.findMany({
            where: { projectId, endedAt: null, volunteerId: { in: ids } },
            select: { volunteerId: true },
          }),
          tx.volunteerTeam.findMany({
            where: { projectId, removedAt: null, memberVolunteerId: { in: ids } },
            select: { memberVolunteerId: true },
          }),
        ]);
        const found = new Map(volunteers.map((v) => [v.id, v]));
        // a volunteer the caller may not assign is not found for the caller
        if (
          ids.some(
            (id) => !found.has(id) || blocked.has(id) || found.get(id)!.type === 'team_member',
          )
        )
          throw new ApiError('permission.not_found', 404);
        if (assigned.length) throw new ApiError('volunteer.already_assigned', 409);
        if (onTeam.length) throw new ApiError('volunteer.on_team', 409);
        const rows = body.volunteers.map((item, index) => {
          const v = found.get(item.volunteerId)!;
          const type = typeOf(v.type);
          const set: PermissionSet | null = item.permissionSet ?? defaultPermissionSet(type);
          if (!set || !permissionSetAllowed(set, type))
            throw new ApiError('validation.failed', 422, undefined, [
              { path: `volunteers.${index}.permissionSet`, code: 'validation.option_unknown' },
            ]);
          // the area the volunteer lives in: the district when the division is split
          const region = areas.includes(v.districtId) ? v.districtId : v.divisionId;
          return {
            id: uuidv7(),
            projectId,
            volunteerId: v.id,
            regionLocationId: region,
            permissionSet: set,
            isPaid: item.isPaid,
            assignedBy: actor,
            createdBy: actor,
            updatedBy: actor,
          };
        });
        await tx.projectVolunteer.createMany({ data: rows });
        await this.audit.record(tx, {
          action: 'volunteer.assigned',
          entityType: 'project',
          entityId: projectId,
          new: {
            assignments: rows.map((r) => ({
              id: r.id,
              volunteerId: r.volunteerId,
              permissionSet: r.permissionSet,
              isPaid: r.isPaid,
            })),
          },
        });
        await this.events.assigned(
          tx,
          projectId,
          rows.map((r) => r.volunteerId),
          actor,
        );
        const created = await tx.projectVolunteer.findMany({
          where: { id: { in: rows.map((r) => r.id) } },
          select: ASSIGNMENT,
          orderBy: { id: 'asc' },
        });
        return created.map(view);
      });
    } catch (error) {
      // an assignment made at the same moment by someone else
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApiError('volunteer.already_assigned', 409);
      throw error;
    }
  }

  // ---- change and end

  /** An assignment that has not ended, inside the caller's areas of its project (404 otherwise). */
  private async own(tx: Tx, viewer: ProjectViewer, assignmentId: string) {
    const found = await tx.projectVolunteer.findFirst({
      where: { id: assignmentId, endedAt: null },
      select: { projectId: true },
    });
    if (!found) throw new ApiError('permission.not_found', 404);
    const project = await this.projects.locked(tx, viewer, found.projectId);
    const areas = await this.callerAreas(tx, viewer, project);
    const row = await tx.projectVolunteer.findFirst({
      // the region stored at assignment decides, as in the list; a later move of the volunteer's
      // address never hands the assignment to another area
      where: {
        id: assignmentId,
        endedAt: null,
        regionLocationId: { in: await this.regions(tx, areas) },
      },
      select: { ...ASSIGNMENT, projectId: true },
    });
    if (!row) {
      this.access.denied(viewer.principal.userId, viewer.scope.permission, viewer.scope.entity);
      throw new ApiError('permission.not_found', 404);
    }
    return { project, row };
  }

  async update(viewer: ProjectViewer, assignmentId: string, body: AssignmentUpdate) {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      const { project, row } = await this.own(tx, viewer, assignmentId);
      if (!ASSIGNABLE.includes(project.status)) throw new ApiError('project.read_only', 409);
      const paidChanges = body.isPaid !== undefined && body.isPaid !== row.isPaid;
      if (paidChanges && !(await this.mayMarkPaid(viewer, project.id, tx))) this.refuse(viewer);
      if (
        body.permissionSet &&
        !permissionSetAllowed(body.permissionSet, typeOf(row.volunteer.type))
      )
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'permissionSet', code: 'validation.option_unknown' },
        ]);
      const after = await tx.projectVolunteer.update({
        where: { id: assignmentId },
        data: { permissionSet: body.permissionSet, isPaid: body.isPaid, updatedBy: actor },
        select: ASSIGNMENT,
      });
      await this.audit.record(tx, {
        action: 'volunteer.assignment_changed',
        entityType: 'project',
        entityId: project.id,
        old: { assignmentId, permissionSet: row.permissionSet, isPaid: row.isPaid },
        new: { assignmentId, permissionSet: after.permissionSet, isPaid: after.isPaid },
      });
      const counted = await liveApplicationCounts(tx, [
        { projectId: project.id, ownerVolunteerId: after.volunteerId },
      ]);
      return view(after, counted(project.id, after.volunteerId));
    });
  }

  /** Ends the assignment and the team of that volunteer on the project; the records stay. */
  async end(viewer: ProjectViewer, assignmentId: string, reason: string) {
    const actor = viewer.principal.userId;
    await this.prisma.$transaction(async (tx) => {
      const { project, row } = await this.own(tx, viewer, assignmentId);
      const now = this.clock.now();
      await tx.projectVolunteer.update({
        where: { id: assignmentId },
        data: { endedAt: now, updatedBy: actor },
      });
      const team = await tx.volunteerTeam.updateMany({
        where: { projectId: project.id, leadVolunteerId: row.volunteerId, removedAt: null },
        data: { removedAt: now, updatedBy: actor },
      });
      await this.audit.record(tx, {
        action: 'volunteer.assignment_ended',
        entityType: 'project',
        entityId: project.id,
        old: { assignmentId, volunteerId: row.volunteerId, permissionSet: row.permissionSet },
        new: { assignmentId, ended: true, teamMembersRemoved: team.count },
        reason,
      });
    });
  }
}
