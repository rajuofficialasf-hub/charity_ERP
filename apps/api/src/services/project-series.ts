import { uuidv7 } from '@css/shared';
import { isoDateInDhaka } from '@css/shared/format';
import {
  type ProjectSeriesCreate,
  type ProjectSeriesFilter,
  type ProjectSeriesUpdate,
  type ProjectStatus,
  projectStatusOf,
  sessionLabel,
  type ShortDescription,
} from '@css/shared/projects';
import type { AccessService } from '../access/service.js';
import { holdsPermission, programWhere, projectWhere, type Scope } from '../access/scope.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import { boundedRead } from '../core/bounded-read.js';
import type { Clock } from '../core/clock.js';
import { assertIfMatch } from '../core/etag.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import { helpedSql } from './help-history.js';
import { WAITING } from './projects-work.js';
import type { ProjectsService } from './projects.js';
import { staffPhotos } from './staff-photos.js';

/**
 * Project series, the permanent projects, and the figures of the cards (docs/DECISION_LOG.md,
 * "Programs and projects in one tab, with permanent projects and yearly sessions";
 * docs/security/RBAC.md, "Data scopes and their resolution", the overview of programs and
 * projects). A card carries counts and the names of the RPMs only. What a caller may do or open
 * comes from the caller's own permissions, never from the permission that shows the cards.
 */

type Count = bigint | number;
const DAY_MS = 86_400_000;
/** The most officials a card names; the rest are a number. */
const NAMED_PEOPLE = 3;

/** An official a card names: the photo is the person's uploaded one, or none. */
export interface CardPerson {
  id: string;
  name: string;
  photoFileId: string | null;
}
export interface CardPeople {
  people: CardPerson[];
  total: number;
}

/** A session as the cards read it. */
export interface SessionRow {
  id: string;
  seriesId: string;
  programId: string;
  status: ProjectStatus;
  year: number;
  periodFrom: Date;
  periodTo: Date;
  applyTo: Date | null;
  target: number | null;
  budgetPlanned: Prisma.Decimal | null;
}

/** The states in which a session is running. */
const RUNNING: readonly ProjectStatus[] = ['active', 'closing'];
export const isRunning = (status: ProjectStatus) => RUNNING.includes(status);

/** The sessions of the given series, cancelled ones left out: a cancelled draft is no session. */
export async function sessionsOf(tx: Tx, seriesIds: readonly string[]): Promise<SessionRow[]> {
  if (!seriesIds.length) return [];
  const rows = await tx.project.findMany({
    where: { seriesId: { in: [...seriesIds] }, status: { not: 'cancelled' } },
    select: {
      id: true,
      seriesId: true,
      programId: true,
      status: true,
      year: true,
      periodFrom: true,
      periodTo: true,
      applyTo: true,
      targetBeneficiaries: true,
      budgetPlanned: true,
    },
  });
  return rows.map(({ targetBeneficiaries, status, ...r }) => ({
    ...r,
    status: projectStatusOf(status),
    target: targetBeneficiaries,
  }));
}

/**
 * The current session among the sessions of one series: its newest active or closing session,
 * else its newest session; none for a series without a session. The one definition the cards and
 * the counts read.
 */
export function currentSession(sessions: readonly SessionRow[]): SessionRow | undefined {
  const newest = (list: readonly SessionRow[]) =>
    list.reduce<SessionRow | undefined>((a, b) => (!a || b.year > a.year ? b : a), undefined);
  return newest(sessions.filter((s) => isRunning(s.status))) ?? newest(sessions);
}

/** The sessions of each series, by series. */
export function bySeries(sessions: readonly SessionRow[]): Map<string, SessionRow[]> {
  const map = new Map<string, SessionRow[]>();
  for (const s of sessions) map.set(s.seriesId, [...(map.get(s.seriesId) ?? []), s]);
  return map;
}

export interface SessionFigures {
  applications: number;
  approved: number;
  waiting: number;
  waitlisted: number;
  /** The people the session helped: a person has one application in a session, so each once. */
  helped: number;
}
const NO_FIGURES: SessionFigures = {
  applications: 0,
  approved: 0,
  waiting: 0,
  waitlisted: 0,
  helped: 0,
};

/**
 * The counts of each session in one read of the applications: received, approved, waiting and
 * waitlisted as an official's work figures count them, and the people helped by the one shared
 * rule of what counts as help.
 */
export async function sessionFigures(
  tx: Tx,
  projectIds: readonly string[],
): Promise<Map<string, SessionFigures>> {
  if (!projectIds.length) return new Map();
  const counted = Prisma.sql`a.status NOT IN ('draft', 'deleted') AND a.deleted_at IS NULL`;
  const rows = await tx.$queryRaw<
    {
      project_id: string;
      applications: Count;
      approved: Count;
      waiting: Count;
      waitlisted: Count;
      helped: Count;
    }[]
  >`
    SELECT a.project_id,
      count(*) FILTER (WHERE ${counted}) AS applications,
      count(*) FILTER (WHERE ${counted} AND a.approved_at IS NOT NULL) AS approved,
      count(*) FILTER (WHERE ${counted} AND a.status = ANY(${WAITING})) AS waiting,
      count(*) FILTER (WHERE ${counted} AND a.status = 'waitlisted') AS waitlisted,
      count(*) FILTER (WHERE a.beneficiary_id IS NOT NULL AND ${helpedSql('a')}) AS helped
    FROM applications a
    WHERE a.project_id = ANY(${[...projectIds]}::uuid[])
    GROUP BY a.project_id`;
  return new Map(
    rows.map((r) => [
      r.project_id,
      {
        applications: Number(r.applications),
        approved: Number(r.approved),
        waiting: Number(r.waiting),
        waitlisted: Number(r.waitlisted),
        helped: Number(r.helped),
      },
    ]),
  );
}
export const figuresOf = (figures: Map<string, SessionFigures>, projectId: string) =>
  figures.get(projectId) ?? NO_FIGURES;

/**
 * The people helped in any session of each series or program, each person once however many
 * sessions helped them. A session's own count is already each person once, so the sessions are
 * added up and the people helped in more than one session of the group are taken off again.
 * Counting distinct people over every application takes longer than a card may
 * (docs/testing/PERFORMANCE.md, "The cards of programs and projects"), so only the people whose
 * kept counter says they were helped more than once are looked at one by one. A profile retired
 * by a merge keeps the applications left on it and counts as itself.
 */
export async function helpedPeople(
  tx: Tx,
  by: 'series' | 'program',
  sessions: readonly SessionRow[],
  figures: Map<string, SessionFigures>,
): Promise<Map<string, number>> {
  const groupOf = (s: SessionRow) => (by === 'series' ? s.seriesId : s.programId);
  const people = new Map<string, number>();
  for (const s of sessions)
    people.set(groupOf(s), (people.get(groupOf(s)) ?? 0) + figuresOf(figures, s.id).helped);
  const ids = [...people.keys()].filter((id) => (people.get(id) ?? 0) > 1);
  if (!ids.length) return people;
  const group = by === 'series' ? Prisma.sql`p.series_id` : Prisma.sql`p.program_id`;
  const again = await tx.$queryRaw<{ id: string; extra: Count }[]>`
    SELECT ${group} AS id, count(*) - count(DISTINCT a.beneficiary_id) AS extra
    FROM beneficiaries b
    JOIN applications a ON a.beneficiary_id = b.id
    JOIN projects p ON p.id = a.project_id
    WHERE b.help_count > 1 AND b.merged_into_id IS NULL
      AND ${group} = ANY(${ids}::uuid[]) AND p.status <> 'cancelled' AND ${helpedSql('a')}
    GROUP BY ${group}`;
  for (const r of again) people.set(r.id, (people.get(r.id) ?? 0) - Number(r.extra));
  return people;
}

/**
 * The volunteers working in the given sessions, counted once per group: `groups[i]` is the card
 * the session `projectIds[i]` counts for (the session itself, or its program).
 */
export async function volunteerCounts(
  tx: Tx,
  projectIds: readonly string[],
  groups: readonly string[],
): Promise<Map<string, number>> {
  if (!projectIds.length) return new Map();
  const rows = await tx.$queryRaw<{ id: string; volunteers: Count }[]>`
    SELECT v.id, count(*) AS volunteers
    FROM (
      SELECT DISTINCT m.grp AS id, pv.volunteer_id
      FROM unnest(${[...projectIds]}::uuid[], ${[...groups]}::uuid[]) AS m(project_id, grp)
      JOIN project_volunteers pv ON pv.project_id = m.project_id AND pv.ended_at IS NULL
    ) v
    GROUP BY v.id`;
  return new Map(rows.map((r) => [r.id, Number(r.volunteers)]));
}

/** The districts each session works in: an area's own district, or every district of its division. */
export async function districtCounts(
  tx: Tx,
  projectIds: readonly string[],
): Promise<Map<string, number>> {
  if (!projectIds.length) return new Map();
  const rows = await tx.$queryRaw<{ project_id: string; districts: Count }[]>`
    WITH RECURSIVE up(project_id, id, level, parent_id) AS (
      SELECT pa.project_id, l.id, l.level, l.parent_id
      FROM project_areas pa JOIN locations l ON l.id = pa.location_id
      WHERE pa.project_id = ANY(${[...projectIds]}::uuid[])
      UNION
      SELECT up.project_id, l.id, l.level, l.parent_id
      FROM up JOIN locations l ON l.id = up.parent_id
      WHERE up.level NOT IN ('division', 'district')
    ), found AS (
      SELECT up.project_id, up.id FROM up WHERE up.level = 'district'
      UNION
      SELECT up.project_id, d.id
      FROM up JOIN locations d ON d.parent_id = up.id AND d.level = 'district'
      WHERE up.level = 'division'
    )
    SELECT project_id, count(*) AS districts FROM found GROUP BY project_id`;
  return new Map(rows.map((r) => [r.project_id, Number(r.districts)]));
}

/** The RPMs of each session's areas, each once per session, by name. */
export async function sessionRpms(
  tx: Tx,
  projectIds: readonly string[],
): Promise<Map<string, CardPerson[]>> {
  if (!projectIds.length) return new Map();
  const rows = await tx.projectArea.findMany({
    where: { projectId: { in: [...projectIds] } },
    distinct: ['projectId', 'rpmUserId'],
    select: { projectId: true, rpmUser: { select: { id: true, displayName: true } } },
  });
  const photos = await staffPhotos(tx, [...new Set(rows.map((r) => r.rpmUser.id))]);
  const bySession = new Map<string, CardPerson[]>();
  for (const r of rows) {
    const list = bySession.get(r.projectId) ?? [];
    list.push({
      id: r.rpmUser.id,
      name: r.rpmUser.displayName,
      photoFileId: photos.get(r.rpmUser.id) ?? null,
    });
    bySession.set(r.projectId, list);
  }
  return bySession;
}

/** The first few of the people by name, each once, and how many there are. */
export function namedPeople(people: readonly CardPerson[]): CardPeople {
  // code-point order, the same on every machine
  const key = (p: CardPerson) => `${p.name} ${p.id}`;
  const unique = [...new Map(people.map((p) => [p.id, p])).values()].sort((a, b) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0,
  );
  return { people: unique.slice(0, NAMED_PEOPLE), total: unique.length };
}

/** What the caller's own permissions reach among the sessions and programs on the screen. */
export interface Reach {
  /** The sessions the caller may open (`project.view`). */
  open: ReadonlySet<string>;
  /** The sessions whose budget the caller may see (`budget.view`). */
  budget: ReadonlySet<string>;
  /** The programs the caller may create a project in (`project.create`); inactive ones take none. */
  create: ReadonlySet<string>;
}

/**
 * The caller's reach, read from the caller's own grants and scopes: seeing a card gives none of
 * the three.
 */
export async function reachOf(
  access: AccessService,
  tx: Tx,
  principal: Principal,
  sessionIds: readonly string[],
  programIds: readonly string[],
): Promise<Reach> {
  const loaded = await access.load(principal.userId, tx);
  const sessions = async (permission: string): Promise<Set<string>> => {
    if (!sessionIds.length || !holdsPermission(permission, loaded.grants)) return new Set();
    const scope = await access.scopeFor(principal, loaded, permission, 'project', tx);
    const rows = await tx.project.findMany({
      where: { AND: [{ id: { in: [...sessionIds] } }, projectWhere(scope)] },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  };
  const programs = async (): Promise<Set<string>> => {
    if (!programIds.length || !holdsPermission('project.create', loaded.grants)) return new Set();
    const scope = await access.scopeFor(principal, loaded, 'project.create', 'program', tx);
    const rows = await tx.program.findMany({
      where: { AND: [{ id: { in: [...programIds] } }, { active: true }, programWhere(scope)] },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  };
  return {
    open: await sessions('project.view'),
    budget: await sessions('budget.view'),
    create: await programs(),
  };
}

const month = (d: Date) => d.toISOString().slice(0, 7);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** A description as the reader gets it: the pair, or null when neither language is written. */
export function descriptionOf(row: {
  descriptionBn: string | null;
  descriptionEn: string | null;
}): ShortDescription | null {
  if (row.descriptionBn === null && row.descriptionEn === null) return null;
  return { bn: row.descriptionBn ?? '', en: row.descriptionEn ?? '' };
}

/** The two columns of a description: an empty language is not written, null removes both. */
export function descriptionColumns(description: ShortDescription | null | undefined) {
  if (description === undefined) return {};
  return {
    descriptionBn: description?.bn || null,
    descriptionEn: description?.en || null,
  };
}

const SELECT = {
  id: true,
  programId: true,
  code: true,
  nameBn: true,
  nameEn: true,
  descriptionBn: true,
  descriptionEn: true,
  updatedAt: true,
} satisfies Prisma.ProjectSeriesSelect;
type Row = Prisma.ProjectSeriesGetPayload<{ select: typeof SELECT }>;

/** A series as it is stored, for the audit entries and the head of a card. */
const base = (s: Row) => ({
  id: s.id,
  programId: s.programId,
  code: s.code,
  name: { bn: s.nameBn, en: s.nameEn },
  description: descriptionOf(s),
});

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** The caller of a series route: who it is and what the route's scope reaches. */
export interface SeriesViewer {
  principal: Principal;
  scope: Scope;
}

export class ProjectSeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly projects: ProjectsService,
    private readonly clock: Clock,
  ) {}

  /** The whole days until the application window ends, today counted as none; null once it has. */
  private daysLeft(applyTo: Date | null): number | null {
    if (!applyTo) return null;
    const today = new Date(`${isoDateInDhaka(this.clock.now())}T00:00:00Z`);
    const left = Math.round((applyTo.getTime() - today.getTime()) / DAY_MS);
    return left < 0 ? null : left;
  }

  /** The cards of the given series, with a fixed number of grouped reads whatever their number. */
  private async cards(tx: Tx, principal: Principal, rows: readonly Row[]) {
    const sessions = await sessionsOf(
      tx,
      rows.map((s) => s.id),
    );
    const ofSeries = bySeries(sessions);
    const current = new Map(
      rows.flatMap((s) => {
        const session = currentSession(ofSeries.get(s.id) ?? []);
        return session ? [[s.id, session] as const] : [];
      }),
    );
    const currentIds = [...current.values()].map((c) => c.id);
    const figures = await sessionFigures(
      tx,
      sessions.map((s) => s.id),
    );
    const people = await helpedPeople(tx, 'series', sessions, figures);
    const volunteers = await volunteerCounts(tx, currentIds, currentIds);
    const districts = await districtCounts(tx, currentIds);
    const rpms = await sessionRpms(tx, currentIds);
    const reach = await reachOf(this.access, tx, principal, currentIds, [
      ...new Set(rows.map((s) => s.programId)),
    ]);
    return rows.map((s) => {
      const session = current.get(s.id);
      const counted = session ? figuresOf(figures, session.id) : NO_FIGURES;
      return {
        ...base(s),
        sessionCount: ofSeries.get(s.id)?.length ?? 0,
        beneficiaries: people.get(s.id) ?? 0,
        current: session
          ? {
              id: session.id,
              sessionLabel: sessionLabel(month(session.periodFrom), month(session.periodTo)),
              periodFrom: month(session.periodFrom),
              periodTo: month(session.periodTo),
              status: session.status,
              applyTo: day(session.applyTo),
              daysLeft: this.daysLeft(session.applyTo),
              target: session.target,
              approved: counted.approved,
              applications: counted.applications,
              rpms: namedPeople(rpms.get(session.id) ?? []),
              volunteers: volunteers.get(session.id) ?? 0,
              districts: districts.get(session.id) ?? 0,
            }
          : null,
        // the caller's own work on the current session, only where the caller may open it
        ...(session && reach.open.has(session.id)
          ? {
              todo: {
                reviewsWaiting: counted.waiting,
                waitlisted: counted.waitlisted,
                ...(reach.budget.has(session.id)
                  ? { budgetPlanned: session.budgetPlanned?.toFixed(2) ?? null }
                  : {}),
              },
            }
          : {}),
        canCreate: reach.create.has(s.programId),
      };
    });
  }

  /** The series the route's scope reaches, of one program when asked, by code. */
  async list(viewer: SeriesViewer, filter: ProjectSeriesFilter) {
    return boundedRead(this.prisma, async (tx) => {
      const rows = await tx.projectSeries.findMany({
        where: {
          program: programWhere(viewer.scope),
          ...(filter.programId ? { programId: filter.programId } : {}),
        },
        orderBy: { code: 'asc' },
        select: SELECT,
      });
      return this.cards(tx, viewer.principal, rows);
    });
  }

  /**
   * One series with its sessions, newest first; a cancelled session is left out, as the project
   * list leaves it out. Each session says whether the caller may open it.
   */
  async get(viewer: SeriesViewer, seriesId: string) {
    return boundedRead(this.prisma, async (tx) => {
      const row = await tx.projectSeries.findFirst({
        where: { id: seriesId, program: programWhere(viewer.scope) },
        select: { ...SELECT, program: { select: { id: true, nameBn: true, nameEn: true } } },
      });
      if (!row) throw new ApiError('permission.not_found', 404);
      const [card] = await this.cards(tx, viewer.principal, [row]);
      const sessions = await tx.project.findMany({
        where: { seriesId, status: { not: 'cancelled' } },
        orderBy: { year: 'desc' },
        select: { id: true, year: true, status: true, periodFrom: true, periodTo: true },
      });
      const ids = sessions.map((s) => s.id);
      const figures = await sessionFigures(tx, ids);
      const reach = await reachOf(this.access, tx, viewer.principal, ids, []);
      return {
        series: {
          ...card!,
          program: {
            id: row.program.id,
            name: { bn: row.program.nameBn, en: row.program.nameEn },
          },
          sessions: sessions.map((s) => ({
            id: s.id,
            year: s.year,
            sessionLabel: sessionLabel(month(s.periodFrom), month(s.periodTo)),
            periodFrom: month(s.periodFrom),
            periodTo: month(s.periodTo),
            status: projectStatusOf(s.status),
            applications: figuresOf(figures, s.id).applications,
            approved: figuresOf(figures, s.id).approved,
            canOpen: reach.open.has(s.id),
          })),
        },
        updatedAt: row.updatedAt,
      };
    });
  }

  /**
   * A new series in a program the caller may create projects in (403 otherwise; an inactive
   * program takes none). Its first session is created on its own.
   */
  async create(viewer: SeriesViewer, body: ProjectSeriesCreate) {
    const actor = viewer.principal.userId;
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await this.projects.lockedProgram(tx, viewer, body.programId);
        if (await tx.projectSeries.findUnique({ where: { code: body.code }, select: { id: true } }))
          throw new ApiError('project.series_code_taken', 409);
        const row = await tx.projectSeries.create({
          select: SELECT,
          data: {
            id: uuidv7(),
            programId: body.programId,
            code: body.code,
            nameBn: body.name.bn,
            nameEn: body.name.en,
            ...descriptionColumns(body.description),
            createdBy: actor,
            updatedBy: actor,
          },
        });
        await this.audit.record(tx, {
          action: 'project_series.create',
          entityType: 'project_series',
          entityId: row.id,
          new: base(row),
        });
        return row.id;
      });
    } catch (error) {
      // two creations with one code at the same moment: the unique index decides
      if (isUniqueViolation(error)) throw new ApiError('project.series_code_taken', 409);
      throw error;
    }
    return this.get(viewer, id);
  }

  /**
   * Renames a series or changes its description. The program is the one the series is stored
   * with, never one the request names: a caller who may not create projects there is refused. A
   * session carries the names of its series, so a rename renames every session in the same
   * transaction, under one audit entry.
   */
  async update(
    viewer: SeriesViewer,
    seriesId: string,
    body: ProjectSeriesUpdate,
    ifMatch: string | undefined,
  ) {
    const actor = viewer.principal.userId;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM project_series WHERE id = ${seriesId}::uuid FOR UPDATE`;
      const before = await tx.projectSeries.findUnique({ where: { id: seriesId }, select: SELECT });
      if (!before) throw new ApiError('permission.not_found', 404);
      const reached = await tx.program.count({
        where: { AND: [{ id: before.programId }, programWhere(viewer.scope)] },
      });
      if (!reached) {
        this.access.denied(actor, viewer.scope.permission, viewer.scope.entity);
        throw new ApiError('permission.denied', 403);
      }
      assertIfMatch(ifMatch, before.updatedAt);
      const row = await tx.projectSeries.update({
        where: { id: seriesId },
        select: SELECT,
        data: {
          nameBn: body.name?.bn,
          nameEn: body.name?.en,
          ...descriptionColumns(body.description),
          updatedBy: actor,
        },
      });
      const renamed =
        body.name && (body.name.bn !== before.nameBn || body.name.en !== before.nameEn)
          ? (
              await tx.project.updateMany({
                where: { seriesId },
                data: { nameBn: body.name.bn, nameEn: body.name.en, updatedBy: actor },
              })
            ).count
          : 0;
      const old = base(before);
      const now = base(row);
      await this.audit.record(tx, {
        action: 'project_series.update',
        entityType: 'project_series',
        entityId: seriesId,
        old: { name: old.name, description: old.description },
        new: { name: now.name, description: now.description, sessionsRenamed: renamed },
      });
    });
    return this.get(viewer, seriesId);
  }
}
