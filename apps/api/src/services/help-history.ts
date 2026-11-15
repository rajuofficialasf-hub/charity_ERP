import {
  countsAsHelped,
  HELPED_IF_DELIVERED_STATES,
  HELPED_STATES,
  type HelpFacts,
  helpSummary,
  NOT_DELIVERED_OUTCOMES,
} from '@css/shared';
import { z } from 'zod';
import type { Tx } from '../core/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

/**
 * How often a person was helped (docs/BUSINESS_RULES.md, "Beneficiary identity and master"):
 * which applications count is decided once in `@css/shared` (`countsAsHelped`); this file reads a
 * person's applications, the ones a merge left on a retired profile among them, and gives the
 * profile its summary.
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
 * The applications a merge left on a profile retired into each of these people (an application in
 * a project where the kept profile has one stays on the retired profile; docs/BUSINESS_RULES.md,
 * "Beneficiary identity and master", the merge), following a chain of merges, so a profile
 * retired into one that was later retired too still hands its applications on. A reverted merge hands nothing. A subquery of the rows
 * `(person_id, application_id)`; the people's own applications are not among them.
 */
export function leftBehindSql(beneficiaryIds: readonly string[]): Prisma.Sql {
  return Prisma.sql`
    WITH RECURSIVE into_person(person_id, id) AS (
      SELECT p, p FROM unnest(${[...beneficiaryIds]}::uuid[]) AS p
      UNION
      SELECT i.person_id, r.id FROM beneficiaries r JOIN into_person i ON r.merged_into_id = i.id
    )
    SELECT DISTINCT i.person_id, x.id::uuid AS application_id
    FROM into_person i
      JOIN profile_merges m ON m.kept_id = i.id AND m.status = 'merged',
      jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(m.snapshot -> 'leftBehind') = 'array'
             THEN m.snapshot -> 'leftBehind' ELSE '[]'::jsonb END) AS x(id)`;
}

/** The applications of a person: their own and the ones a merge left behind (`leftBehindSql`). */
export async function personApplicationsWhere(
  tx: Tx,
  beneficiaryId: string,
): Promise<Prisma.ApplicationWhereInput> {
  const left = await tx.$queryRaw<{ application_id: string }[]>`
    SELECT application_id FROM (${leftBehindSql([beneficiaryId])}) AS l`;
  const leftBehind = left.map((r) => r.application_id);
  return leftBehind.length
    ? { OR: [{ beneficiaryId }, { id: { in: leftBehind } }] }
    : { beneficiaryId };
}

/**
 * The times each of these people was helped, from their applications and the ones a merge left on
 * a profile retired into them (the same set as the profile's `personApplicationsWhere`): rows of
 * `(id, help_count, max_helps_in_year)`, one per person, zero for one never helped.
 */
export function helpCountsSql(beneficiaryIds: readonly string[]): Prisma.Sql {
  const ids = [...beneficiaryIds];
  return Prisma.sql`
    SELECT p.id, COALESCE(sum(y.n), 0)::int AS help_count, COALESCE(max(y.n), 0)::int AS max_helps_in_year
    FROM unnest(${ids}::uuid[]) AS p(id)
    LEFT JOIN (
      SELECT h.person_id, pr.year, count(*)::int AS n
      FROM (
        SELECT a.beneficiary_id AS person_id, a.id AS application_id
          FROM applications a WHERE a.beneficiary_id = ANY(${ids}::uuid[])
        UNION
        SELECT person_id, application_id FROM (${leftBehindSql(ids)}) AS l
      ) AS h
        JOIN applications a ON a.id = h.application_id
        JOIN projects pr ON pr.id = a.project_id
      WHERE ${helpedSql('a')}
      GROUP BY h.person_id, pr.year
    ) AS y ON y.person_id = p.id
    GROUP BY p.id`;
}

/**
 * Locks these people and every profile they were retired into (`FOR NO KEY UPDATE`, in id order),
 * then walks `merged_into_id` again under the locks and locks what a merge committed in between
 * added, until the set stops growing; answers the locked ids. Every writer that touches a person's
 * applications and their count takes the person first this way, before any application row: the
 * workflow engine, a bulk decision for all its rows at once, a merge (which locks both profiles
 * `FOR UPDATE` before it moves their applications), so two of them never wait on each other in
 * opposite orders. `FOR NO KEY UPDATE` changes no key, so a new application of the person, which
 * takes `FOR KEY SHARE` through its foreign key, is not held up.
 */
export async function lockPeople(tx: Tx, beneficiaryIds: readonly string[]): Promise<string[]> {
  const locked = new Set<string>();
  let wanted = [...new Set(beneficiaryIds)];
  while (wanted.length) {
    const chain = await tx.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE up(id) AS (
        SELECT unnest(${wanted}::uuid[])
        UNION
        SELECT b.merged_into_id FROM beneficiaries b JOIN up ON b.id = up.id
        WHERE b.merged_into_id IS NOT NULL
      )
      SELECT id FROM up`;
    const fresh = chain.map((r) => r.id).filter((id) => !locked.has(id));
    if (!fresh.length) break;
    await tx.$queryRaw`
      SELECT id FROM beneficiaries WHERE id = ANY(${fresh}::uuid[]) ORDER BY id FOR NO KEY UPDATE`;
    for (const id of fresh) locked.add(id);
    // the chain as it stands under the locks: a merge that committed meanwhile may have added to it
    wanted = [...locked];
  }
  return [...locked];
}

/**
 * Writes the kept counters of these people (docs/database/DATABASE_SCHEMA.md, "beneficiaries"),
 * locked first in id order (`FOR NO KEY UPDATE`, as `lockPeople`; a row the transaction holds
 * already is no new lock) so a count is never computed from a snapshot older than another writer's
 * committed change. Only a counter that differs is written, and such a write leaves the
 * profile's update stamp as it was (the migration's trigger reads `css.help_counts_only`). The
 * caller passes every person whose count may have changed; `recountHelp` adds the profiles above
 * them.
 */
export async function writeHelpCounts(tx: Tx, beneficiaryIds: readonly string[]): Promise<number> {
  const ids = [...new Set(beneficiaryIds)];
  if (!ids.length) return 0;
  await tx.$queryRaw`
    SELECT id FROM beneficiaries WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR NO KEY UPDATE`;
  // the counters alone: the update stamp stays (the migration's trigger), for this one statement
  // only, so another write of the same transaction still stamps the row; and no JIT, see
  // `withoutJit`
  const [before] = await tx.$queryRaw<{ jit: string }[]>`
    SELECT current_setting('jit') AS jit, set_config('jit', 'off', true),
           set_config('css.help_counts_only', 'on', true)`;
  const written = await tx.$executeRaw`
    UPDATE beneficiaries AS b
    SET help_count = c.help_count, max_helps_in_year = c.max_helps_in_year
    FROM (${helpCountsSql(ids)}) AS c
    WHERE b.id = c.id
      AND (b.help_count, b.max_helps_in_year) IS DISTINCT FROM (c.help_count, c.max_helps_in_year)`;
  await tx.$queryRaw`
    SELECT set_config('jit', ${before!.jit}, true), set_config('css.help_counts_only', 'off', true)`;
  return written;
}

/**
 * Runs the counting of `helpCountsSql` with PostgreSQL's JIT off for the transaction: the recursive
 * query over the merges is estimated far above the few rows it reads, and on the measurement data
 * set the JIT compilation took about 0.8 s of a statement that runs in 20 ms
 * (docs/testing/PERFORMANCE.md, "The times helped"). The setting is put back afterwards.
 */
export async function withoutJit<T>(tx: Tx, work: () => Promise<T>): Promise<T> {
  const [before] = await tx.$queryRaw<{ jit: string }[]>`
    SELECT current_setting('jit') AS jit, set_config('jit', 'off', true)`;
  const result = await work();
  await tx.$queryRaw`SELECT set_config('jit', ${before!.jit}, true)`;
  return result;
}

/**
 * Recounts these people and every profile they were retired into, through a chain of merges (an
 * application a merge left on a retired profile counts for the kept one too), the chain read under
 * the locks of `lockPeople`.
 */
export async function recountHelp(tx: Tx, beneficiaryIds: readonly string[]): Promise<number> {
  return writeHelpCounts(tx, await lockPeople(tx, beneficiaryIds));
}

/** The application as the counting reads it, with its person. */
export interface MovedApplication extends HelpFacts {
  beneficiaryId: string | null;
}

/**
 * After a move of the application: recounts its person when the move changed whether it counts
 * (or, for a counted one, whose it is). A move between two states that count alike changes nothing.
 */
export async function recountAfterMove(
  tx: Tx,
  applicationId: string,
  before: MovedApplication,
): Promise<void> {
  const after = await tx.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { status: true, approvedAt: true, outcome: true, beneficiaryId: true },
  });
  const counted = countsAsHelped(before);
  if (
    counted === countsAsHelped(after) &&
    (!counted || before.beneficiaryId === after.beneficiaryId)
  )
    return;
  await recountHelp(
    tx,
    [before.beneficiaryId, after.beneficiaryId].filter((id): id is string => id !== null),
  );
}

/**
 * How often a person was helped (docs/BUSINESS_RULES.md, "Beneficiary identity and master"), as
 * the profile and an application's record show it: a project the caller does not see is counted
 * in its year's `unnamed`, never named. A new instance per use, as `sensitive` marks the instance it is given.
 */
export const helpSummarySchema = () =>
  z.object({
    total: z.number().int().min(0),
    firstYear: z.number().int().nullable(),
    thisYear: z.number().int().min(0),
    repeatedInYear: z.boolean(),
    repeatedInProject: z.boolean(),
    years: z.array(
      z.object({
        year: z.number().int(),
        count: z.number().int().min(1),
        projects: z.array(
          z.object({
            id: z.uuid(),
            code: z.string(),
            nameBn: z.string(),
            nameEn: z.string(),
            count: z.number().int().min(1),
          }),
        ),
        /** The times helped that year in projects the caller does not see. */
        unnamed: z.number().int().min(0),
      }),
    ),
  });

const PROJECT_SELECT = { id: true, code: true, nameBn: true, nameEn: true, year: true } as const;

/**
 * Every application of a person (never cut to a page), newest first, with its project: what the
 * help counts and what the profile's page of applications shows.
 */
export async function personApplications(tx: Tx, where: Prisma.ApplicationWhereInput) {
  return tx.application.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      appNo: true,
      beneficiaryId: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
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
