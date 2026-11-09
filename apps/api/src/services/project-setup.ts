import { componentSettingsSchema, isComponentKey, uuidv7 } from '@css/shared';
import {
  type AreaCreate,
  type CandidateQuery,
  type ComponentPatch,
  componentsCheck,
  editableIn,
  FUND_SOURCES,
  type FundSources,
  projectStatusOf,
  type SetupField,
  STAFF_ACCESS_ROLES,
  type StaffCreate,
  type Syllabus,
} from '@css/shared/projects';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { PermissionVersionService } from '../auth/permission-version.service';
import { assertIfMatch, etagOf } from '../core/etag';
import { literalContains } from '../core/search';
import type { PrismaService, Tx } from '../core/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import { refuseIncompleteRules, storedRules, writeRulesVersion } from './project-rules';
import type { ProjectViewer, ProjectsService } from './projects';

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
const isForeignKeyViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';

/** A project status read from the database, checked against the known states. */
const money = (d: Prisma.Decimal | null) => (d === null ? null : d.toFixed(2));

/** The public link's settings without the token (any other component's settings as they are). */
function withoutToken(settings: unknown): Prisma.InputJsonValue {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings))
    return settings as Prisma.InputJsonValue;
  const { token: _token, ...rest } = settings as Record<string, unknown>;
  return rest as Prisma.InputJsonValue;
}

/**
 * The parts of a project's setup that are saved on their own (docs/MASTER_SPEC.md, A6): components
 * and their settings, the budget with its fund sources, areas with their RPMs, staff access and the
 * dawah syllabus. Every write loads the project inside the caller's scope, locks its row, applies
 * the state rule and audits, in one transaction. An active project keeps what its activation
 * needed. A volunteer reads only the enabled components, the photo rule and the syllabus.
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
  private async writable(tx: Tx, viewer: ProjectViewer, projectId: string, part: SetupField) {
    const project = await this.projects.locked(tx, viewer, projectId);
    const status = projectStatusOf(project.status);
    if (!editableIn(status, part)) throw new ApiError('project.read_only', 409);
    return { ...project, status };
  }

  private refuse(viewer: ProjectViewer): never {
    this.access.denied(viewer.principal.userId, viewer.scope.permission, viewer.scope.entity);
    throw new ApiError('permission.denied', 403);
  }

  /** Staff and areas are official reads: a volunteer is refused. */
  private officialsOnly(viewer: ProjectViewer): void {
    if (viewer.principal.kind === 'volunteer') this.refuse(viewer);
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
      // a volunteer sees what is switched on, and the photo rule it works by (a project-wide
      // setting kept on the distribution row, whether that component is on or not)
      return rows.flatMap((c) =>
        c.componentKey === 'distribution'
          ? [{ componentKey: c.componentKey, enabled: c.enabled, settings: c.settings }]
          : c.enabled
            ? [{ componentKey: c.componentKey, enabled: true }]
            : [],
      );
    // the public link's token is the whole access to the link: only its managers read it back
    const managesLink = await this.access.holdsOnProject(
      viewer.principal.userId,
      'form.public_link.manage',
      projectId,
    );
    return rows.map((c) => ({
      componentKey: c.componentKey,
      enabled: c.enabled,
      settings:
        c.componentKey === 'public_link' && !managesLink ? withoutToken(c.settings) : c.settings,
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
      const project = await this.writable(tx, viewer, projectId, 'components');
      const before = await tx.projectComponent.findUnique({
        where: { projectId_componentKey: { projectId, componentKey } },
        select: { enabled: true, settings: true, updatedAt: true },
      });
      if (!before) throw new ApiError('permission.not_found', 404);
      assertIfMatch(ifMatch, before.updatedAt);
      let settings: Prisma.InputJsonValue | undefined;
      if (body.settings !== undefined) {
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
        settings = parsed.data as Prisma.InputJsonValue;
      }
      if (componentKey === 'public_link') {
        // the link's token and form are set only by its own route, which issues a fresh token on
        // every enable and checks the form; this route only switches the link off, dropping both
        if (body.enabled || settings !== undefined)
          throw new ApiError('public.configure_through_link', 422);
        settings = { enabled: false };
      }
      if (project.status !== 'draft') {
        // an active project keeps a photo rule and valid settings for what is switched on
        const all = await tx.projectComponent.findMany({
          where: { projectId },
          select: { componentKey: true, enabled: true, settings: true },
        });
        const next = all.map((c) =>
          c.componentKey === componentKey
            ? {
                componentKey,
                enabled: body.enabled ?? c.enabled,
                settings: settings ?? c.settings,
              }
            : c,
        );
        const missing = componentsCheck(next);
        if (missing.length)
          throw new ApiError(
            'workflow.guard.project_setup_complete',
            409,
            undefined,
            missing.map((m) => ({ path: m, code: 'validation.required' })),
          );
      }
      const row = await tx.projectComponent.update({
        where: { projectId_componentKey: { projectId, componentKey } },
        data: { enabled: body.enabled, settings, updatedBy: actor },
        select: { componentKey: true, enabled: true, settings: true, updatedAt: true },
      });
      // the project's dawah flag follows its dawah component
      let rulesChange: Awaited<ReturnType<typeof writeRulesVersion>> | undefined;
      if (componentKey === 'dawah' && body.enabled !== undefined) {
        // dawah switched on in a running project adds the Local দায়ী duties to what volunteers
        // accept: the text must exist, and everyone accepts the rules again
        if (body.enabled && !before.enabled && project.status !== 'draft') {
          const current = await tx.project.findUniqueOrThrow({
            where: { id: projectId },
            select: { rules: true, rulesVersion: true },
          });
          const rules = storedRules(current.rules);
          refuseIncompleteRules(rules, true);
          rulesChange = await writeRulesVersion(tx, projectId, rules, current.rulesVersion, actor);
        }
        await tx.project.update({
          where: { id: projectId },
          data: { dawahEnabled: body.enabled, updatedBy: actor },
        });
      }
      await this.audit.record(tx, {
        action: 'project.component_change',
        entityType: 'project',
        entityId: projectId,
        old: { componentKey, enabled: before.enabled, settings: withoutToken(before.settings) },
        new: {
          componentKey,
          enabled: row.enabled,
          settings: withoutToken(row.settings),
          ...(rulesChange && {
            rulesVersion: rulesChange.version,
            consentsReset: rulesChange.consentsReset,
          }),
        },
      });
      const { updatedAt, ...rest } = row;
      return { ...rest, etag: etagOf(updatedAt) };
    });
  }

  // ---- budget and fund sources

  /** Fund sources are budget data: only the program's PM and the roles that reach every project read them. */
  async fundSources(viewer: ProjectViewer, projectId: string) {
    this.officialsOnly(viewer);
    const { project } = await this.projects.get(viewer, projectId);
    if (!('programId' in project) || !this.programLevel(viewer, project.programId))
      this.refuse(viewer);
    return this.readFundSources(this.prisma, projectId);
  }

  private async readFundSources(db: Tx, projectId: string) {
    const rows = await db.fundSource.findMany({
      where: { projectId },
      orderBy: { id: 'asc' },
      select: { id: true, source: true, label: true, amount: true },
    });
    // a fixed order: zakat, sadaqah, general donation, then the named donors
    const rank = (source: string) => (FUND_SOURCES as readonly string[]).indexOf(source);
    return rows
      .sort((a, b) => rank(a.source) - rank(b.source))
      .map((f) => ({ source: f.source, label: f.label, amount: f.amount.toFixed(2) }));
  }

  /**
   * Replaces the fund sources, with the cost per beneficiary and the target when sent. Rows are
   * kept by their source and name, so a later ledger entry keeps pointing at its source. Once a
   * project is active its fund sources always add up to its planned budget, so a budget change
   * comes with its fund sources in this one request.
   */
  async replaceFundSources(viewer: ProjectViewer, projectId: string, body: FundSources) {
    const actor = viewer.principal.userId;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const project = await this.writable(tx, viewer, projectId, 'fundSources');
        const cost =
          body.costPerBeneficiary === undefined
            ? money(project.costPerBeneficiary)
            : body.costPerBeneficiary;
        const target =
          body.targetBeneficiaries === undefined
            ? project.targetBeneficiaries
            : body.targetBeneficiaries;
        await this.projects.checkBudget(
          tx,
          projectId,
          project.status,
          cost,
          target,
          body.fundSources.map((f) => f.amount),
        );
        if (body.costPerBeneficiary !== undefined || body.targetBeneficiaries !== undefined)
          await tx.project.update({
            where: { id: projectId },
            data: { costPerBeneficiary: cost, targetBeneficiaries: target, updatedBy: actor },
          });
        const before = await this.readFundSources(tx, projectId);
        const existing = await tx.fundSource.findMany({
          where: { projectId },
          select: { id: true, source: true, label: true },
        });
        const key = (f: { source: string; label?: string | null }) =>
          `${f.source}|${f.label ?? ''}`;
        const byKey = new Map(existing.map((f) => [key(f), f.id]));
        const kept = new Set<string>();
        for (const f of body.fundSources) {
          const id = byKey.get(key(f));
          if (id && !kept.has(id)) {
            kept.add(id);
            await tx.fundSource.update({
              where: { id },
              data: { amount: f.amount, updatedBy: actor },
            });
          } else
            await tx.fundSource.create({
              data: {
                id: uuidv7(),
                projectId,
                source: f.source,
                label: f.label ?? null,
                amount: f.amount,
                createdBy: actor,
                updatedBy: actor,
              },
            });
        }
        const gone = existing.filter((f) => !kept.has(f.id)).map((f) => f.id);
        if (gone.length) await tx.fundSource.deleteMany({ where: { id: { in: gone } } });
        const after = await this.readFundSources(tx, projectId);
        await this.audit.record(tx, {
          action: 'project.fund_source_change',
          entityType: 'project',
          entityId: projectId,
          old: {
            costPerBeneficiary: money(project.costPerBeneficiary),
            targetBeneficiaries: project.targetBeneficiaries,
            fundSources: before,
          },
          new: { costPerBeneficiary: cost, targetBeneficiaries: target, fundSources: after },
        });
        return after;
      });
    } catch (error) {
      // a fund source a ledger entry already uses cannot be removed
      if (isForeignKeyViolation(error)) throw new ApiError('project.fund_source_in_use', 409);
      throw error;
    }
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

  /**
   * Removes an area. An active project keeps one; an area whose location still carries staff
   * access (and no other RPM covers it) stays until that access is ended.
   */
  async removeArea(viewer: ProjectViewer, areaId: string) {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.projectArea.findUnique({
        where: { id: areaId },
        select: { projectId: true },
      });
      if (!found) throw new ApiError('permission.not_found', 404);
      const project = await this.writable(tx, viewer, found.projectId, 'areas');
      // read again under the project lock: a removal at the same moment may have won
      const area = await tx.projectArea.findUnique({
        where: { id: areaId },
        select: { projectId: true, locationId: true, rpmUserId: true },
      });
      if (!area) throw new ApiError('permission.not_found', 404);
      if (project.status !== 'draft') {
        const count = await tx.projectArea.count({ where: { projectId: area.projectId } });
        if (count <= 1) throw new ApiError('validation.required', 422);
      }
      const otherRpm = await tx.projectArea.count({
        where: { projectId: area.projectId, locationId: area.locationId, id: { not: areaId } },
      });
      const staffThere = await tx.projectStaff.count({
        where: { projectId: area.projectId, areaLocationId: area.locationId, endedAt: null },
      });
      if (!otherRpm && staffThere) throw new ApiError('project.area_in_use', 409);
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

  // ---- people to assign

  /**
   * Active officials who hold a role and whose name contains the search, for the RPM of an area
   * (the PM and the global roles) or for staff access (also an RPM of the project). Names and
   * designations only, at most 20; the user list itself stays limited to the caller's scope.
   */
  async candidates(viewer: ProjectViewer, projectId: string, query: CandidateQuery) {
    this.officialsOnly(viewer);
    const { project } = await this.projects.get(viewer, projectId);
    const programLevel = 'programId' in project && this.programLevel(viewer, project.programId);
    if (query.role === 'regional_program_manager' && !programLevel) this.refuse(viewer);
    return this.prisma.user.findMany({
      where: {
        kind: 'staff',
        state: 'active',
        // no name: the first ones; % and _ in a name are letters, never wildcards
        ...(query.q
          ? { displayName: { contains: literalContains(query.q), mode: 'insensitive' } }
          : {}),
        userRolesUser: { some: { roleKey: query.role, revokedAt: null } },
      },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      take: 50,
      select: { id: true, displayName: true, designation: true },
    });
  }

  // ---- staff access

  /** The PM and the global roles see every access; an RPM or area staff the access of its areas. */
  async staff(viewer: ProjectViewer, projectId: string) {
    this.officialsOnly(viewer);
    const { project } = await this.projects.get(viewer, projectId);
    const all = await this.readStaff(this.prisma, projectId);
    if ('programId' in project && this.programLevel(viewer, project.programId)) return all;
    const own = this.ownAreas(viewer, projectId);
    return all.filter((s) => s.areaLocationId !== null && own.has(s.areaLocationId));
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
          if (body.canDelete || !body.areaLocationId || !own.has(body.areaLocationId))
            this.refuse(viewer);
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
        const change = { projectId, staffAccess: { id, ...body } };
        await this.versions.bump(tx, body.userId, { action: 'permission_change', new: change });
        // the project's own audit trail shows who got access too
        await this.audit.record(tx, {
          action: 'permission_change',
          entityType: 'project',
          entityId: projectId,
          new: change,
        });
        return this.readStaff(tx, projectId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiError('project.staff_exists', 409);
      throw error;
    }
  }

  /**
   * Ends a staff member's access, with a reason. Ending access protects the project's data, so it
   * is allowed in every state, a closed project included; an RPM ends only the access of its areas.
   */
  async endStaff(viewer: ProjectViewer, assignmentId: string, reason: string) {
    const actor = viewer.principal.userId;
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.projectStaff.findUnique({
        where: { id: assignmentId },
        select: { projectId: true },
      });
      if (!found) throw new ApiError('permission.not_found', 404);
      const project = await this.projects.locked(tx, viewer, found.projectId);
      const assignment = await tx.projectStaff.findFirst({
        where: { id: assignmentId, endedAt: null },
        select: { projectId: true, userId: true, areaLocationId: true, roleKey: true },
      });
      if (!assignment) throw new ApiError('permission.not_found', 404);
      if (!this.programLevel(viewer, project.programId)) {
        const own = this.ownAreas(viewer, assignment.projectId);
        if (!assignment.areaLocationId || !own.has(assignment.areaLocationId)) this.refuse(viewer);
      }
      const ended = await tx.projectStaff.updateMany({
        where: { id: assignmentId, endedAt: null },
        data: { endedAt: new Date(), updatedBy: actor },
      });
      if (ended.count === 0) throw new ApiError('permission.not_found', 404);
      const change = {
        old: { projectId: assignment.projectId, staffAccess: { id: assignmentId, ...assignment } },
        new: { projectId: assignment.projectId, staffAccess: null },
      };
      await this.versions.bump(tx, assignment.userId, {
        action: 'permission_change',
        ...change,
        reason,
      });
      await this.audit.record(tx, {
        action: 'permission_change',
        entityType: 'project',
        entityId: assignment.projectId,
        ...change,
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
      if (isForeignKeyViolation(error)) throw new ApiError('project.topic_in_use', 409);
      throw error;
    }
  }
}
