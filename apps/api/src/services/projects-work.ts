import type { ProjectsWork, ProjectWork, ProjectWorkFigures } from '@css/shared/auth';
import { projectStatusOf } from '@css/shared/projects';
import type { AccessService } from '../access/service';
import type { Scope } from '../access/scope';
import type { Principal } from '../auth/principal';
import { boundedRead } from '../core/bounded-read';
import type { PrismaService, Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';

/** The states in which an application waits for an official's decision. */
const WAITING = ['needs_verification', 'submitted', 'under_review', 'reviewed'];

interface Tie {
  roles: Set<string>;
  areas: Map<string, { bn: string; en: string }>;
  wholeProject: boolean;
}

type Count = bigint | number;

/**
 * The projects an official works on and the figures of their work there (docs/BUSINESS_RULES.md,
 * "An official's projects" and "The work figures"): a PM through the program, an RPM through
 * their areas, any other official through an active project access; cancelled projects are left
 * out. The figures count the applications in the official's area and the decisions they made.
 */
export class ProjectsWorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** The caller's own projects and figures; a volunteer's projects are on their own page. */
  own(principal: Principal): Promise<ProjectsWork> {
    if (principal.kind !== 'staff') throw new ApiError('permission.not_found', 404);
    return this.read(principal.userId, null);
  }

  /**
   * Another official's projects and figures within the caller's `staff.work.view` scope: every
   * project at GLOBAL, the projects of the caller's own programs for a PM; an official the scope
   * does not reach is not found.
   */
  async ofOfficial(scope: Scope, userId: string): Promise<ProjectsWork> {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { kind: true, homeProgramId: true },
    });
    if (!target || target.kind !== 'staff') throw new ApiError('permission.not_found', 404);
    const i = scope.instances;
    if (i.global) return this.read(userId, { notIn: i.revokedProjectIds });
    const programIds = new Set(i.programIds);
    const work = await this.read(userId, { programIds, notIn: i.revokedProjectIds });
    const reached =
      (target.homeProgramId !== null && programIds.has(target.homeProgramId)) ||
      work.years.length > 0;
    if (!reached) throw new ApiError('permission.not_found', 404);
    return work;
  }

  private async read(
    userId: string,
    within: { programIds?: Set<string>; notIn: string[] } | null,
  ): Promise<ProjectsWork> {
    const grants = (await this.access.load(userId)).grants;
    // the Head, the Monitoring Team and the teams who view every project get one line instead
    if (grants.some((g) => g.permission === 'project.view' && g.scopeType === 'GLOBAL'))
      return { everyProject: true, years: [] };
    return boundedRead(this.prisma, async (tx) => {
      const ties = await this.ties(tx, userId);
      const projects = await tx.project.findMany({
        where: {
          id: { in: [...ties.keys()], ...(within?.notIn.length ? { notIn: within.notIn } : {}) },
          cancelledAt: null,
          ...(within?.programIds ? { programId: { in: [...within.programIds] } } : {}),
        },
        select: {
          id: true,
          code: true,
          nameBn: true,
          nameEn: true,
          year: true,
          status: true,
          applyFrom: true,
          applyTo: true,
          program: { select: { id: true, nameBn: true, nameEn: true } },
        },
        orderBy: [{ year: 'desc' }, { code: 'asc' }],
      });
      const figures = await this.figures(
        tx,
        userId,
        projects.map((p) => ({ id: p.id, tie: ties.get(p.id)! })),
      );
      const years: ProjectsWork['years'] = [];
      for (const p of projects) {
        const tie = ties.get(p.id)!;
        const work: ProjectWork = {
          id: p.id,
          code: p.code,
          name: { bn: p.nameBn, en: p.nameEn },
          year: p.year,
          status: projectStatusOf(p.status),
          program: { id: p.program.id, name: { bn: p.program.nameBn, en: p.program.nameEn } },
          applyFrom: p.applyFrom?.toISOString().slice(0, 10) ?? null,
          applyTo: p.applyTo?.toISOString().slice(0, 10) ?? null,
          roles: [...tie.roles].sort(),
          areas: tie.wholeProject ? [] : [...tie.areas].map(([id, name]) => ({ id, name })),
          wholeProject: tie.wholeProject,
          figures: figures.get(p.id)!,
        };
        const last = years.at(-1);
        if (last?.year === p.year) last.projects.push(work);
        else years.push({ year: p.year, projects: [work] });
      }
      return { everyProject: false, years };
    });
  }

  /** The person's ties to projects, by project: the program, the areas and the access rows. */
  private async ties(tx: Tx, userId: string): Promise<Map<string, Tie>> {
    const location = { select: { id: true, nameBn: true, nameEn: true } };
    const [programs, areas, staff] = await Promise.all([
      tx.project.findMany({
        where: { program: { pmUserId: userId } },
        select: { id: true },
      }),
      tx.projectArea.findMany({
        where: { rpmUserId: userId },
        select: { projectId: true, location },
      }),
      tx.projectStaff.findMany({
        where: { userId, endedAt: null },
        select: { projectId: true, roleKey: true, areaLocation: location },
      }),
    ]);
    const ties = new Map<string, Tie>();
    const tie = (projectId: string) => {
      let found = ties.get(projectId);
      if (!found) {
        found = { roles: new Set(), areas: new Map(), wholeProject: false };
        ties.set(projectId, found);
      }
      return found;
    };
    for (const p of programs) {
      const t = tie(p.id);
      t.roles.add('program_manager');
      t.wholeProject = true;
    }
    for (const a of areas) {
      const t = tie(a.projectId);
      t.roles.add('regional_program_manager');
      t.areas.set(a.location.id, { bn: a.location.nameBn, en: a.location.nameEn });
    }
    for (const s of staff) {
      const t = tie(s.projectId);
      t.roles.add(s.roleKey);
      if (s.areaLocation)
        t.areas.set(s.areaLocation.id, { bn: s.areaLocation.nameBn, en: s.areaLocation.nameEn });
      else t.wholeProject = true;
    }
    return ties;
  }

  /** The figures of every listed project, read in a fixed number of grouped queries. */
  private async figures(
    tx: Tx,
    userId: string,
    projects: { id: string; tie: Tie }[],
  ): Promise<Map<string, ProjectWorkFigures>> {
    const ids = projects.map((p) => p.id);
    const whole = projects.filter((p) => p.tie.wholeProject).map((p) => p.id);
    const pairs = projects
      .filter((p) => !p.tie.wholeProject)
      .flatMap((p) => [...p.tie.areas.keys()].map((locationId) => [p.id, locationId] as const));
    const areaProjects = pairs.map(([p]) => p);
    const areaLocations = pairs.map(([, l]) => l);
    const result = new Map<string, ProjectWorkFigures>(
      ids.map((id) => [
        id,
        {
          area: { received: 0, waiting: 0, approved: 0, rejected: 0, waitlisted: 0, volunteers: 0 },
          mine: { reviewed: 0, approved: 0, rejected: 0, waitlisted: 0, medianDays: null },
        },
      ]),
    );
    if (!ids.length) return result;
    const [area, volunteers, stamps, audited, median] = await Promise.all([
      // an application is in an area when it is placed there at any level, as the area scope reads it
      tx.$queryRaw<
        {
          project_id: string;
          received: Count;
          waiting: Count;
          approved: Count;
          rejected: Count;
          waitlisted: Count;
        }[]
      >`
        SELECT a.project_id,
          count(*) AS received,
          count(*) FILTER (WHERE a.status = ANY(${WAITING})) AS waiting,
          count(*) FILTER (WHERE a.approved_at IS NOT NULL) AS approved,
          count(*) FILTER (WHERE a.status = 'rejected') AS rejected,
          count(*) FILTER (WHERE a.status = 'waitlisted') AS waitlisted
        FROM applications a
        WHERE a.project_id = ANY(${ids}::uuid[])
          AND a.status NOT IN ('draft', 'deleted') AND a.deleted_at IS NULL
          AND (a.project_id = ANY(${whole}::uuid[]) OR EXISTS (
            SELECT 1 FROM unnest(${areaProjects}::uuid[], ${areaLocations}::uuid[]) AS ar(p, l)
            JOIN locations u ON u.id = a.union_id
            WHERE ar.p = a.project_id
              AND ar.l IN (a.region_location_id, a.district_id, a.union_id, u.parent_id)))
        GROUP BY a.project_id`,
      tx.$queryRaw<{ project_id: string; volunteers: Count }[]>`
        SELECT pv.project_id, count(DISTINCT pv.volunteer_id) AS volunteers
        FROM project_volunteers pv
        WHERE pv.project_id = ANY(${ids}::uuid[]) AND pv.ended_at IS NULL
          AND (pv.project_id = ANY(${whole}::uuid[]) OR EXISTS (
            SELECT 1 FROM unnest(${areaProjects}::uuid[], ${areaLocations}::uuid[]) AS ar(p, l)
            WHERE ar.p = pv.project_id AND ar.l = pv.region_location_id))
        GROUP BY pv.project_id`,
      tx.$queryRaw<{ project_id: string; reviewed: Count; approved: Count }[]>`
        SELECT a.project_id,
          count(*) FILTER (WHERE a.reviewed_by = ${userId}::uuid) AS reviewed,
          count(*) FILTER (WHERE a.approved_by = ${userId}::uuid) AS approved
        FROM applications a
        WHERE a.project_id = ANY(${ids}::uuid[])
          AND (a.reviewed_by = ${userId}::uuid OR a.approved_by = ${userId}::uuid)
        GROUP BY a.project_id`,
      // a rejection or a waitlisting leaves no stamp on the row, only the engine's audit entry
      tx.$queryRaw<{ project_id: string; status: string; n: Count }[]>`
        SELECT a.project_id, l.new->>'status' AS status, count(DISTINCT l.entity_id) AS n
        FROM audit_log l
        JOIN applications a ON a.id = l.entity_id
        WHERE l.actor_user_id = ${userId}::uuid AND l.entity_type = 'application'
          AND l.new->>'status' IN ('rejected', 'waitlisted')
          AND a.project_id = ANY(${ids}::uuid[])
        GROUP BY a.project_id, l.new->>'status'`,
      tx.$queryRaw<{ project_id: string; median_days: number | null }[]>`
        WITH acts AS (
          SELECT a.project_id, a.id, a.submitted_at, a.reviewed_at AS at
          FROM applications a
          WHERE a.reviewed_by = ${userId}::uuid AND a.project_id = ANY(${ids}::uuid[])
          UNION ALL
          SELECT a.project_id, a.id, a.submitted_at, a.approved_at
          FROM applications a
          WHERE a.approved_by = ${userId}::uuid AND a.project_id = ANY(${ids}::uuid[])
          UNION ALL
          SELECT a.project_id, a.id, a.submitted_at, l.created_at
          FROM audit_log l
          JOIN applications a ON a.id = l.entity_id
          WHERE l.actor_user_id = ${userId}::uuid AND l.entity_type = 'application'
            AND l.new->>'status' IN ('rejected', 'waitlisted')
            AND a.project_id = ANY(${ids}::uuid[])
        ), first_acts AS (
          SELECT project_id, min(at) - min(submitted_at) AS took
          FROM acts WHERE submitted_at IS NOT NULL AND at IS NOT NULL
          GROUP BY project_id, id
        )
        SELECT project_id,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM took) / 86400)::float8
            AS median_days
        FROM first_acts GROUP BY project_id`,
    ]);
    for (const r of area)
      Object.assign(result.get(r.project_id)!.area, {
        received: Number(r.received),
        waiting: Number(r.waiting),
        approved: Number(r.approved),
        rejected: Number(r.rejected),
        waitlisted: Number(r.waitlisted),
      });
    for (const r of volunteers) result.get(r.project_id)!.area.volunteers = Number(r.volunteers);
    for (const r of stamps)
      Object.assign(result.get(r.project_id)!.mine, {
        reviewed: Number(r.reviewed),
        approved: Number(r.approved),
      });
    for (const r of audited) {
      const mine = result.get(r.project_id)!.mine;
      if (r.status === 'rejected') mine.rejected = Number(r.n);
      else mine.waitlisted = Number(r.n);
    }
    for (const r of median)
      result.get(r.project_id)!.mine.medianDays =
        r.median_days === null ? null : Math.round(r.median_days * 10) / 10;
    return result;
  }
}
