import { uuidv7 } from '@css/shared';
import { editableIn, projectStatusOf, type QuotaTargets } from '@css/shared/projects';
import type { AccessService } from '../access/service.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';
import type { ProjectViewer, ProjectsService } from './projects.js';

/** The states in which an application has reached the office: neither a draft, deleted, nor waiting for verification. */
const NOT_RECEIVED = ['draft', 'deleted', 'needs_verification'];

/** One quota as the office reads it: the target beside the applications received and approved. */
export interface QuotaProgress {
  level: 'district' | 'union';
  locationId: string;
  locationName: { bn: string; en: string };
  target: number;
  received: number;
  approved: number;
  /** The approvals have reached the target; an approval there asks for a comment, it is never refused. */
  full: boolean;
}

/**
 * The district and union quotas of a project: the PM of its program sets
 * them in the setup, also while the project runs, every change audited; the office reads each
 * area's target, the applications received and the ones approved, counted when asked so they
 * never drift from the applications themselves. A quota informs the decision and never refuses it.
 */
export class ProjectQuotasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly projects: ProjectsService,
  ) {}

  private refuse(viewer: ProjectViewer): never {
    this.access.denied(viewer.principal.userId, viewer.scope.permission, viewer.scope.entity);
    throw new ApiError('permission.denied', 403);
  }

  /** The quotas of a project with their live counts, for the officials who reach it. */
  async list(viewer: ProjectViewer, projectId: string): Promise<QuotaProgress[]> {
    if (viewer.principal.kind === 'volunteer') this.refuse(viewer);
    await this.projects.get(viewer, projectId);
    return this.progress(this.prisma, projectId);
  }

  /** Replaces the targets of a project; an empty list takes every quota away. */
  async replace(
    viewer: ProjectViewer,
    projectId: string,
    body: QuotaTargets,
  ): Promise<QuotaProgress[]> {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      const project = await this.projects.locked(tx, viewer, projectId);
      if (!editableIn(projectStatusOf(project.status), 'quotas'))
        throw new ApiError('project.read_only', 409);
      await this.assertInsideAreas(tx, projectId, body.quotas);
      const before = await this.targets(tx, projectId);
      await tx.projectQuota.deleteMany({ where: { projectId } });
      for (const q of body.quotas)
        await tx.projectQuota.create({
          data: {
            id: uuidv7(),
            projectId,
            level: q.level,
            locationId: q.locationId,
            target: q.target,
            createdBy: actor,
            updatedBy: actor,
          },
        });
      await this.audit.record(tx, {
        action: 'project.quota_change',
        entityType: 'project',
        entityId: projectId,
        old: { quotas: before },
        new: { quotas: body.quotas },
      });
      return this.progress(tx, projectId);
    });
  }

  /**
   * Each quota's place must be of its level and inside one of the project's areas (a division,
   * or a district split among RPMs), so a target never names a place the project does not serve.
   */
  private async assertInsideAreas(
    tx: Tx,
    projectId: string,
    quotas: QuotaTargets['quotas'],
  ): Promise<void> {
    if (!quotas.length) return;
    const areas = new Set(
      (await tx.projectArea.findMany({ where: { projectId }, select: { locationId: true } })).map(
        (a) => a.locationId,
      ),
    );
    const places = await tx.location.findMany({
      where: { id: { in: quotas.map((q) => q.locationId) } },
      select: {
        id: true,
        level: true,
        parentId: true,
        parent: { select: { parentId: true, parent: { select: { parentId: true } } } },
      },
    });
    const byId = new Map(places.map((p) => [p.id, p]));
    const refused = quotas.some((q) => {
      const place = byId.get(q.locationId);
      if (!place || place.level !== q.level) return true;
      // a district's division, or a union's upazila, district and division
      const ancestors = [
        place.id,
        place.parentId,
        place.parent?.parentId,
        place.parent?.parent?.parentId,
      ];
      return !ancestors.some((id) => id && areas.has(id));
    });
    if (refused)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'quotas', code: 'validation.option_unknown' },
      ]);
  }

  private async targets(db: Tx, projectId: string) {
    const rows = await db.projectQuota.findMany({
      where: { projectId },
      orderBy: { id: 'asc' },
      select: { level: true, locationId: true, target: true },
    });
    return rows.map((r) => ({ level: r.level, locationId: r.locationId, target: r.target }));
  }

  private async progress(db: Tx, projectId: string): Promise<QuotaProgress[]> {
    const rows = await db.projectQuota.findMany({
      where: { projectId },
      select: {
        level: true,
        locationId: true,
        target: true,
        location: { select: { nameBn: true, nameEn: true } },
      },
    });
    if (!rows.length) return [];
    const live = { projectId, status: { notIn: NOT_RECEIVED } };
    const [byDistrict, byUnion, approvedDistrict, approvedUnion] = await Promise.all([
      db.application.groupBy({ by: ['districtId'], where: live, _count: { _all: true } }),
      db.application.groupBy({ by: ['unionId'], where: live, _count: { _all: true } }),
      db.application.groupBy({
        by: ['districtId'],
        where: { ...live, approvedAt: { not: null } },
        _count: { _all: true },
      }),
      db.application.groupBy({
        by: ['unionId'],
        where: { ...live, approvedAt: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const count = (
      groups: { districtId?: string; unionId?: string; _count: { _all: number } }[],
      id: string,
    ) => groups.find((g) => (g.districtId ?? g.unionId) === id)?._count._all ?? 0;
    // districts first, then unions, each by name, so the bars keep their place between reads
    return rows
      .map((r) => {
        const level = r.level === 'union' ? ('union' as const) : ('district' as const);
        const received = count(level === 'union' ? byUnion : byDistrict, r.locationId);
        const approved = count(level === 'union' ? approvedUnion : approvedDistrict, r.locationId);
        return {
          level,
          locationId: r.locationId,
          locationName: { bn: r.location.nameBn, en: r.location.nameEn },
          target: r.target,
          received,
          approved,
          full: approved >= r.target,
        };
      })
      .sort(
        (a, b) =>
          (a.level === b.level ? 0 : a.level === 'district' ? -1 : 1) ||
          a.locationName.en.localeCompare(b.locationName.en),
      );
  }
}
