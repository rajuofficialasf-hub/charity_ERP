import {
  HELPED_IF_DELIVERED_STATES,
  HELPED_STATES,
  helpSummary,
  NOT_DELIVERED_OUTCOMES,
} from '@css/shared';
import type { Tx } from '../core/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

/**
 * How often a person was helped (docs/BUSINESS_RULES.md, BR-307): which applications count is
 * decided once in `@css/shared` (`countsAsHelped`); this file reads a person's applications, the
 * ones a merge left on a retired profile among them, and gives the profile its summary.
 */

/** The counted applications as SQL, for an `applications` row under the given alias. */
export function helpedSql(alias: string): Prisma.Sql {
  const a = Prisma.raw(alias);
  return Prisma.sql`(${a}.status = ANY(${[...HELPED_STATES]}::text[])
    OR (${a}.status = ANY(${[...HELPED_IF_DELIVERED_STATES]}::text[])
        AND ${a}.approved_at IS NOT NULL
        AND (${a}.outcome IS NULL OR ${a}.outcome <> ALL(${[...NOT_DELIVERED_OUTCOMES]}::text[]))))`;
}

/** The counted applications as a Prisma filter, the same rule as `helpedSql`. */
export const HELPED_WHERE: Prisma.ApplicationWhereInput = {
  OR: [
    { status: { in: [...HELPED_STATES] } },
    {
      status: { in: [...HELPED_IF_DELIVERED_STATES] },
      approvedAt: { not: null },
      OR: [{ outcome: null }, { outcome: { notIn: [...NOT_DELIVERED_OUTCOMES] } }],
    },
  ],
};

/**
 * The applications of a person: their own and the ones a merge left on a profile retired into
 * them (an application in a project where the kept profile has one stays on the retired profile;
 * docs/BUSINESS_RULES.md, BR-013), following a chain of merges, so a profile retired into one
 * that was later retired too still hands its applications on. A reverted merge hands nothing.
 */
export async function personApplicationsWhere(
  tx: Tx,
  beneficiaryId: string,
): Promise<Prisma.ApplicationWhereInput> {
  const left = await tx.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE into_person(id) AS (
      SELECT ${beneficiaryId}::uuid
      UNION
      SELECT r.id FROM beneficiaries r JOIN into_person i ON r.merged_into_id = i.id
    )
    SELECT DISTINCT x.id
    FROM profile_merges m,
      jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(m.snapshot -> 'leftBehind') = 'array'
             THEN m.snapshot -> 'leftBehind' ELSE '[]'::jsonb END) AS x(id)
    WHERE m.status = 'merged' AND m.kept_id IN (SELECT id FROM into_person)`;
  const leftBehind = left.map((r) => r.id);
  return leftBehind.length
    ? { OR: [{ beneficiaryId }, { id: { in: leftBehind } }] }
    : { beneficiaryId };
}

const PROJECT_SELECT = { id: true, code: true, nameBn: true, nameEn: true, year: true } as const;

/** Every application of a person (never cut to a page), newest first, with its project. */
export async function personApplications(tx: Tx, where: Prisma.ApplicationWhereInput) {
  return tx.application.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      status: true,
      approvedAt: true,
      outcome: true,
      project: { select: PROJECT_SELECT },
    },
  });
}

type PersonApplication = Awaited<ReturnType<typeof personApplications>>[number];

/** A project of the help list, named for a viewer who sees it. */
export interface HelpProject {
  id: string;
  code: string;
  nameBn: string;
  nameEn: string;
  count: number;
}

/**
 * The profile's help summary. Every counted application is counted; a project is named only
 * where `visible` holds it, and the times helped in the others are the year's `unnamed`.
 */
export function helpView(
  applications: readonly PersonApplication[],
  visible: ReadonlySet<string>,
  thisYear: number,
) {
  const projects = new Map(applications.map((a) => [a.project.id, a.project]));
  const summary = helpSummary(
    applications.map((a) => ({
      status: a.status,
      approvedAt: a.approvedAt,
      outcome: a.outcome,
      projectId: a.project.id,
      year: a.project.year,
    })),
    thisYear,
  );
  return {
    total: summary.total,
    firstYear: summary.firstYear,
    thisYear: summary.thisYear,
    repeatedInYear: summary.repeatedInYear,
    repeatedInProject: summary.repeatedInProject,
    years: summary.years.map((y) => {
      const named: HelpProject[] = [];
      let unnamed = 0;
      for (const p of y.projects) {
        const project = projects.get(p.projectId)!;
        if (visible.has(p.projectId))
          named.push({
            id: project.id,
            code: project.code,
            nameBn: project.nameBn,
            nameEn: project.nameEn,
            count: p.count,
          });
        else unnamed += p.count;
      }
      return { year: y.year, count: y.count, projects: named, unnamed };
    }),
  };
}

/** The projects of these applications the viewer sees; `rows` null reaches every project. */
export async function visibleProjects(
  tx: Tx,
  applications: readonly PersonApplication[],
  rows: Prisma.ProjectWhereInput | null,
): Promise<Set<string>> {
  const ids = [...new Set(applications.map((a) => a.project.id))];
  if (!rows || !ids.length) return new Set(ids);
  const seen = await tx.project.findMany({
    where: { AND: [{ id: { in: ids } }, rows] },
    select: { id: true },
  });
  return new Set(seen.map((p) => p.id));
}
