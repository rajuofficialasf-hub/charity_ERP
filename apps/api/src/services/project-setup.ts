import { componentSettingsSchema, isComponentKey, uuidv7 } from '@css/shared';
import {
  type AreaCreate,
  type ComponentPatch,
  editableIn,
  FUND_SOURCES,
  type FundSources,
  type ProjectStatus,
  type SetupField,
  STAFF_ACCESS_ROLES,
  type StaffCreate,
  type Syllabus,
} from '@css/shared/projects';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { PermissionVersionService } from '../auth/permission-version.service';
import { assertIfMatch, etagOf } from '../core/etag';
import type { PrismaService, Tx } from '../core/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { ProjectViewer, ProjectsService } from './projects';

/** The setup part a component change belongs to, for the state rule. */
const PART: Record<'components' | 'fundSources' | 'areas' | 'staff' | 'syllabus', SetupField> = {
  components: 'components',
  fundSources: 'fundSources',
  areas: 'areas',
  staff: 'staff',
  syllabus: 'syllabus',
};

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
const isForeignKeyViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';

/**
 * The parts of a project's setup that are saved on their own (docs/MASTER_SPEC.md, A6; DECISION_LOG
 * D-095): components and their settings, fund sources, areas with their RPMs, staff access and the
 * dawah syllabus. Every write loads the project inside the caller's scope, locks its row, applies
 * the state rule and audits, in one transaction. A volunteer reads only the enabled components
 * with the photo rule, and the syllabus.
 */
export class ProjectSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly projects: ProjectsService,
    private readonly versions: PermissionVersionService,
  ) {}

  /** Loads and locks the project and refuses a write its state does not allow. */
  private async writable(
    tx: Tx,
    viewer: ProjectViewer,
    projectId: string,
    part: keyof typeof PART,
  ) {
    const project = await this.projects.locked(tx, viewer, projectId);
    // eslint-disable-next-line security/detect-object-injection -- part is a fixed key
    if (!editableIn(project.status as ProjectStatus, PART[part]))
      throw new ApiError('project.read_only', 409);
    return project;
  }

  /** Fund sources, staff and areas are official reads: a volunteer is refused. */
  private officialsOnly(viewer: ProjectViewer): void {
    if (viewer.principal.kind !== 'volunteer') return;
    this.access.denied(viewer.principal.userId, viewer.scope.permission, viewer.scope.entity);
    throw new ApiError('permission.denied', 403);
  }

  /** Whether the caller acts as the program's PM (or a global role) rather than as an area RPM. */
  private programLevel(viewer: ProjectViewer, programId: string): boolean {
    const i = viewer.scope.instances;
    return i.global || i.programIds.includes(programId);
  }

  /** The caller's own area locations on this project (an RPM, or staff with an area). */
  private ownAreas(viewer: ProjectViewer, projectId: string): Set<string> {
    return new Set(
      viewer.scope.instances.areas
        .filter((a) => a.projectId === projectId || a.projectId === null)
        .map((a) => a.locationId),
    );
  }

  // ---- components

  async components(viewer: ProjectViewer, projectId: string) {
    await this.projects.get(viewer, projectId);
    const rows = await this.prisma.projectComponent.findMany({
      where: { projectId },
      orderBy: { componentKey: 'asc' },
      select: { componentKey: true, enabled: true, settings: true, updatedAt: true },
    });
    if (viewer.principal.kind === 'volunteer')
      // a volunteer sees what is switched on, and the photo rule it works by
      return rows
        .filter((c) => c.enabled)
        .map((c) =>
          c.componentKey === 'distribution'
            ? { componentKey: c.componentKey, enabled: true, settings: c.settings }
            : { componentKey: c.componentKey, enabled: true },
        );
    return rows.map((c) => ({
      componentKey: c.componentKey,
      enabled: c.enabled,
      settings: c.settings,
      etag: etagOf(c.updatedAt),
    }));
  }

  async updateComponent(
    viewer: ProjectViewer,
    projectId: string,
    componentKey: string,
    body: ComponentPatch,
    ifMatch: string | undefined,
  ) {
    if (!isComponentKey(componentKey)) throw new ApiError('permission.not_found', 404);
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      await this.writable(tx, viewer, projectId, 'components');
      const before = await tx.projectComponent.findUnique({
        where: { projectId_componentKey: { projectId, componentKey } },
        select: { enabled: true, settings: true, updatedAt: true },
      });
      if (!before) throw new ApiError('permission.not_found', 404);
      assertIfMatch(ifMatch, before.updatedAt);
      if (body.settings !== undefined && Object.keys(body.settings).length > 0) {
        const parsed = componentSettingsSchema(componentKey).safeParse(body.settings);
        if (!parsed.success)
          throw new ApiError(
            'validation.failed',
            422,
            undefined,
            parsed.error.issues.map((i) => ({
              path: ['settings', ...i.path].join('.'),
              code: 'validation.failed',
            })),
          );
      }
      const row = await tx.projectComponent.update({
        where: { projectId_componentKey: { projectId, componentKey } },
        data: {
          enabled: body.enabled,
          settings: body.settings as Prisma.InputJsonValue | undefined,
          updatedBy: actor,
        },
        select: { componentKey: true, enabled: true, settings: true, updatedAt: true },
      });
      // the project's dawah flag follows its dawah component
      if (componentKey === 'dawah' && body.enabled !== undefined)
        await tx.project.update({
          where: { id: projectId },
          data: { dawahEnabled: body.enabled, updatedBy: actor },
        });
      await this.audit.record(tx, {
        action: 'project.component_change',
        entityType: 'project',
        entityId: projectId,
        old: { componentKey, enabled: before.enabled, settings: before.settings },
        new: { componentKey, enabled: row.enabled, settings: row.settings },
      });
      return { ...row, etag: etagOf(row.updatedAt), updatedAt: undefined };
    });
  }

  // ---- fund sources

  async fundSources(viewer: ProjectViewer, projectId: string) {
    this.officialsOnly(viewer);
    await this.projects.get(viewer, projectId);
    return this.readFundSources(this.prisma, projectId);
  }

  private async readFundSources(db: Tx, projectId: string) {
    const rows = await db.fundSource.findMany({
      where: { projectId },
      orderBy: { id: 'asc' },
      select: { source: true, label: true, amount: true },
    });
    // a fixed order: zakat, sadaqah, general donation, then the named donors
    const rank = (source: string) => (FUND_SOURCES as readonly string[]).indexOf(source);
    return rows
      .sort((a, b) => rank(a.source) - rank(b.source))
      .map((f) => ({ source: f.source, label: f.label, amount: f.amount.toFixed(2) }));
  }

  async replaceFundSources(viewer: ProjectViewer, projectId: string, body: FundSources) {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      const project = await this.writable(tx, viewer, projectId, 'fundSources');
      // activation needed a fund source; an activated project keeps one
      if (project.status !== 'draft' && body.fundSources.length === 0)
        throw new ApiError('validation.required', 422);
      const before = await this.readFundSources(tx, projectId);
      await tx.fundSource.deleteMany({ where: { projectId } });
      await tx.fundSource.createMany({
        data: body.fundSources.map((f) => ({
          id: uuidv7(),
          projectId,
          source: f.source,
          label: f.label ?? null,
          amount: f.amount,
          createdBy: actor,
          updatedBy: actor,
        })),
      });
      const after = await this.readFundSources(tx, projectId);
      await this.audit.record(tx, {
        action: 'project.fund_source_change',
        entityType: 'project',
        entityId: projectId,
        old: { fundSources: before },
        new: { fundSources: after },
      });
      return after;
    });
  }

  // ---- areas

  async areas(viewer: ProjectViewer, projectId: string) {
    this.officialsOnly(viewer);
    await this.projects.get(viewer, projectId);
    return this.readAreas(this.prisma, projectId);
  }

  private async readAreas(db: Tx, projectId: string) {
    const rows = await db.projectArea.findMany({
      where: { projectId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        locationId: true,
        rpmUserId: true,
        location: { select: { level: true, nameBn: true, nameEn: true } },
        rpmUser: { select: { displayName: true } },
      },
    });
    return rows.map((a) => ({
      id: a.id,
      locationId: a.locationId,
      level: a.location.level,
      locationName: { bn: a.location.nameBn, en: a.location.nameEn },
      rpmUserId: a.rpmUserId,
      rpmName: a.rpmUser.displayName,
    }));
  }

  async addArea(viewer: ProjectViewer, projectId: string, body: AreaCreate) {
    const actor = viewer.principal.userId;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.writable(tx, viewer, projectId, 'areas');
        const location = await tx.location.findUnique({
          where: { id: body.locationId },
          select: { level: true },
        });
        // an area is a division, or a district (a district split among RPMs)
        if (!location || !['division', 'district'].includes(location.level))
          throw new ApiError('validation.option_unknown', 422);
        const rpm = await tx.user.count({
          where: {
            id: body.rpmUserId,
            kind: 'staff',
            state: 'active',
            userRolesUser: { some: { roleKey: 'regional_program_manager', revokedAt: null } },
          },
        });
        if (!rpm) throw new ApiError('project.rpm_role_required', 422);
        const id = uuidv7();
        await tx.projectArea.create({
          data: { id, projectId, ...body, createdBy: actor, updatedBy: actor },
        });
        await this.audit.record(tx, {
          action: 'project.area_assign',
          entityType: 'project',
          entityId: projectId,
          new: { areaId: id, ...body },
        });
        return this.readAreas(tx, projectId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiError('project.area_exists', 409);
      throw error;
    }
  }

  async removeArea(viewer: ProjectViewer, areaId: string) {
    return this.prisma.$transaction(async (tx) => {
      const area = await tx.projectArea.findUnique({
        where: { id: areaId },
        select: { projectId: true, locationId: true, rpmUserId: true },
      });
      if (!area) throw new ApiError('permission.not_found', 404);
      const project = await this.writable(tx, viewer, area.projectId, 'areas');
      // activation needed an area; an activated project keeps one
      if (project.status !== 'draft') {
        const count = await tx.projectArea.count({ where: { projectId: area.projectId } });
        if (count <= 1) throw new ApiError('validation.required', 422);
      }
      await tx.projectArea.delete({ where: { id: areaId } });
      await this.audit.record(tx, {
        action: 'project.area_assign',
        entityType: 'project',
        entityId: area.projectId,
        old: { areaId, ...area },
        new: { removed: true },
      });
    });
  }

  // ---- staff access

  async staff(viewer: ProjectViewer, projectId: string) {
    this.officialsOnly(viewer);
    await this.projects.get(viewer, projectId);
    return this.readStaff(this.prisma, projectId);
  }

  private async readStaff(db: Tx, projectId: string) {
    const rows = await db.projectStaff.findMany({
      where: { projectId, endedAt: null },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        userId: true,
        roleKey: true,
        areaLocationId: true,
        canView: true,
        canEdit: true,
        canDelete: true,
        extraPermissions: true,
        user: { select: { displayName: true } },
      },
    });
    return rows.map(({ user, ...s }) => ({ ...s, displayName: user.displayName, endedAt: null }));
  }

  async addStaff(viewer: ProjectViewer, projectId: string, body: StaffCreate) {
    const actor = viewer.principal.userId;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const project = await this.writable(tx, viewer, projectId, 'staff');
        if (!this.programLevel(viewer, project.programId)) {
          // an RPM gives view and edit, only in its own areas of this project
          const own = this.ownAreas(viewer, projectId);
          if (body.canDelete || !body.areaLocationId || !own.has(body.areaLocationId)) {
            this.access.denied(actor, viewer.scope.permission, viewer.scope.entity);
            throw new ApiError('permission.denied', 403);
          }
        }
        if (body.areaLocationId) {
          const inProject = await tx.projectArea.count({
            where: { projectId, locationId: body.areaLocationId },
          });
          if (!inProject) throw new ApiError('validation.option_unknown', 422);
        }
        // only the field officials who work under an RPM get project access
        const holds = await tx.user.count({
          where: {
            id: body.userId,
            kind: 'staff',
            state: 'active',
            userRolesUser: { some: { roleKey: body.roleKey, revokedAt: null } },
          },
        });
        if (!holds || !(STAFF_ACCESS_ROLES as readonly string[]).includes(body.roleKey))
          throw new ApiError('project.staff_role_required', 422);
        const id = uuidv7();
        await tx.projectStaff.create({
          data: {
            id,
            projectId,
            userId: body.userId,
            roleKey: body.roleKey,
            areaLocationId: body.areaLocationId ?? null,
            canView: body.canView,
            canEdit: body.canEdit,
            canDelete: body.canDelete,
            grantedBy: actor,
            createdBy: actor,
            updatedBy: actor,
          },
        });
        await this.versions.bump(tx, body.userId, {
          action: 'permission_change',
          new: { projectId, staffAccess: { id, ...body } },
        });
        return this.readStaff(tx, projectId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiError('project.staff_exists', 409);
      throw error;
    }
  }

  async endStaff(viewer: ProjectViewer, assignmentId: string, reason: string) {
    const actor = viewer.principal.userId;
    await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.projectStaff.findFirst({
        where: { id: assignmentId, endedAt: null },
        select: { projectId: true, userId: true, areaLocationId: true, roleKey: true },
      });
      if (!assignment) throw new ApiError('permission.not_found', 404);
      const project = await this.writable(tx, viewer, assignment.projectId, 'staff');
      if (!this.programLevel(viewer, project.programId)) {
        const own = this.ownAreas(viewer, assignment.projectId);
        if (!assignment.areaLocationId || !own.has(assignment.areaLocationId)) {
          this.access.denied(actor, viewer.scope.permission, viewer.scope.entity);
          throw new ApiError('permission.denied', 403);
        }
      }
      await tx.projectStaff.update({
        where: { id: assignmentId },
        data: { endedAt: new Date(), updatedBy: actor },
      });
      await this.versions.bump(tx, assignment.userId, {
        action: 'permission_change',
        old: { projectId: assignment.projectId, staffAccess: { id: assignmentId, ...assignment } },
        new: { projectId: assignment.projectId, staffAccess: null },
        reason,
      });
    });
  }

  // ---- syllabus

  async syllabus(viewer: ProjectViewer, projectId: string) {
    await this.projects.get(viewer, projectId);
    return this.readSyllabus(this.prisma, projectId);
  }

  private async readSyllabus(db: Tx, projectId: string) {
    const rows = await db.dawahSyllabusTopic.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, titleBn: true, titleEn: true },
    });
    return rows.map((t) => ({ id: t.id, title: { bn: t.titleBn, en: t.titleEn } }));
  }

  /** Replaces the topic list in its order; a topic sent with its id keeps that id. */
  async replaceSyllabus(viewer: ProjectViewer, projectId: string, body: Syllabus) {
    const actor = viewer.principal.userId;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.writable(tx, viewer, projectId, 'syllabus');
        const before = await this.readSyllabus(tx, projectId);
        const known = new Set(before.map((t) => t.id));
        const keep = new Set(body.topics.flatMap((t) => (t.id && known.has(t.id) ? [t.id] : [])));
        await tx.dawahSyllabusTopic.deleteMany({
          where: { projectId, id: { notIn: [...keep] } },
        });
        for (const [index, topic] of body.topics.entries()) {
          const data = {
            titleBn: topic.title.bn,
            titleEn: topic.title.en,
            sortOrder: index + 1,
            updatedBy: actor,
          };
          if (topic.id && keep.has(topic.id))
            await tx.dawahSyllabusTopic.update({ where: { id: topic.id }, data });
          else
            await tx.dawahSyllabusTopic.create({
              data: { id: uuidv7(), projectId, ...data, createdBy: actor },
            });
        }
        const after = await this.readSyllabus(tx, projectId);
        await this.audit.record(tx, {
          action: 'project.configure',
          entityType: 'project',
          entityId: projectId,
          old: { syllabus: before },
          new: { syllabus: after },
        });
        return after;
      });
    } catch (error) {
      // a topic that classes or progress already refer to cannot be removed
      if (isForeignKeyViolation(error)) throw new ApiError('project.read_only', 409);
      throw error;
    }
  }
}
