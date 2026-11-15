import { randomUUID } from 'node:crypto';
import { countsAsHelped } from '@css/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HELPED_WHERE, helpedSql } from '../../src/services/help-history.js';
import { accessWorld } from './support/access-fixtures.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';
import * as f from './support/fixtures.js';

// How often a person was helped, on the 360° profile: which applications count, the summary and
// its marks, every application however many, merged profiles, and who is told what.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
/** The year in Bangladesh by the clock the API itself reads. */
let THIS_YEAR: number;

type Project = Awaited<ReturnType<typeof f.project>>;
type Help = {
  total: number;
  firstYear: number | null;
  thisYear: number;
  repeatedInYear: boolean;
  repeatedInProject: boolean;
  years: {
    year: number;
    count: number;
    projects: { id: string; code: string; count: number }[];
    unnamed: number;
  }[];
};

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  THIS_YEAR = new Date(h.clock.now().getTime() + 6 * 3_600_000).getUTCFullYear();
});
afterAll(async () => h.close());

const person = () => f.beneficiary(h.db, world.dhaka);
const projectOf = (year = THIS_YEAR) => f.project(h.db, { year });
/** An application of the person; an approved one carries its approval time, as the engine writes it. */
function applyTo(project: Project, beneficiaryId: string, over: Record<string, unknown> = {}) {
  const status = (over.status as string | undefined) ?? 'approved';
  const approved = ['approved', 'implementation', 'completed'].includes(status);
  return f.application(
    h.db,
    { project, loc: world.dhaka },
    {
      beneficiary_id: beneficiaryId,
      status,
      ...(approved ? { approved_at: new Date().toISOString() } : {}),
      ...over,
    },
  );
}
const profile = async (s: Session, id: string) =>
  api().get(`/api/v1/beneficiaries/${id}`).set(bearer(s));
const helpOf = async (s: Session, id: string) => (await profile(s, id)).body.data.help as Help;
const head = () => as(world.users.head);

describe('the applications that count as help', () => {
  it('are the same in SQL, in the Prisma filter and in the shared rule', async () => {
    const someone = await person();
    const at = new Date().toISOString();
    const rows: Record<string, unknown>[] = [
      { status: 'draft' },
      { status: 'submitted' },
      { status: 'waitlisted' },
      { status: 'rejected' },
      { status: 'deleted', deleted_at: at },
      { status: 'approved', approved_at: at },
      { status: 'implementation', approved_at: at },
      { status: 'completed', approved_at: at, outcome: 'distributed' },
      { status: 'closed' },
      { status: 'closed', approved_at: at },
      { status: 'closed', approved_at: at, outcome: 'distributed' },
      { status: 'closed', approved_at: at, outcome: 'not_distributed' },
      { status: 'closed', approved_at: at, outcome: 'not_built' },
    ];
    const ids: string[] = [];
    // one application of a person per project
    for (const row of rows) ids.push(await applyTo(await projectOf(), someone, row));
    const expected = rows
      .map((row, i) => ({ row, id: ids[i]! }))
      .filter(({ row }) =>
        countsAsHelped({
          status: row.status as string,
          approvedAt: (row.approved_at as string | undefined) ?? null,
          outcome: (row.outcome as string | undefined) ?? null,
        }),
      )
      .map(({ id }) => id)
      .sort();
    expect(expected).toHaveLength(5);
    const prisma = h.container.prisma;
    const bySql = await prisma.$queryRaw<{ id: string }[]>`
      SELECT a.id FROM applications a WHERE a.beneficiary_id = ${someone}::uuid AND ${helpedSql('a')}`;
    expect(bySql.map((r) => r.id).sort()).toEqual(expected);
    const byFilter = await prisma.application.findMany({
      where: { AND: [{ beneficiaryId: someone }, HELPED_WHERE] },
      select: { id: true },
    });
    expect(byFilter.map((r) => r.id).sort()).toEqual(expected);
    // and the profile counts the same ones
    expect((await helpOf(await head(), someone)).total).toBe(5);
  });
});

describe('the help on the profile', () => {
  it('counts every helped application over the years, however many, and the projects by year with them', async () => {
    const someone = await person();
    const years = [2024, 2025, THIS_YEAR];
    for (let i = 0; i < 25; i += 1) await applyTo(await projectOf(years[i % 3]), someone);
    // a rejected, a waitlisted and a draft application count nothing
    for (const status of ['rejected', 'waitlisted', 'draft'])
      await applyTo(await projectOf(), someone, { status });
    const data = (await profile(await head(), someone)).body.data;
    const help = data.help as Help;
    expect(help).toMatchObject({
      total: 25,
      firstYear: 2024,
      thisYear: 8,
      repeatedInYear: true,
      repeatedInProject: false,
    });
    expect(help.years.map((y) => [y.year, y.count, y.projects.length, y.unnamed])).toEqual([
      [THIS_YEAR, 8, 8, 0],
      [2025, 8, 8, 0],
      [2024, 9, 9, 0],
    ]);
    // the list of applications is still a page; the projects by year are all of them
    expect(data.applications).toHaveLength(20);
    const listed = (data.projectsByYear as { projects: unknown[] }[]).flatMap((y) => y.projects);
    expect(listed).toHaveLength(28);
  });

  it('marks more than once in a year, and says nothing for a person never helped', async () => {
    const someone = await person();
    const winter = await projectOf();
    const iftar = await projectOf();
    await applyTo(winter, someone);
    await applyTo(iftar, someone, { status: 'implementation' });
    await applyTo(await projectOf(2024), someone);
    const help = await helpOf(await head(), someone);
    expect(help).toMatchObject({
      total: 3,
      firstYear: 2024,
      thisYear: 2,
      repeatedInYear: true,
      repeatedInProject: false,
    });
    expect(help.years[0]).toMatchObject({ year: THIS_YEAR, count: 2, unnamed: 0 });
    expect(help.years[0]!.projects.map((p) => [p.id, p.count]).sort()).toEqual(
      [
        [winter.id, 1],
        [iftar.id, 1],
      ].sort(),
    );
    expect(help.years[1]).toMatchObject({ year: 2024, count: 1 });
    const nobody = await person();
    await applyTo(await projectOf(), nobody, { status: 'rejected' });
    expect(await helpOf(await head(), nobody)).toEqual({
      total: 0,
      firstYear: null,
      thisYear: 0,
      repeatedInYear: false,
      repeatedInProject: false,
      years: [],
    });
  });

  it('counts a closed application only when it was approved before the close and delivered', async () => {
    // no code closes applications yet, so the closed rows are written as the close will leave them
    const someone = await person();
    const at = new Date().toISOString();
    const delivered = await projectOf();
    await applyTo(delivered, someone, { status: 'closed', approved_at: at, outcome: null });
    await applyTo(await projectOf(), someone, { status: 'closed', approved_at: null });
    await applyTo(await projectOf(), someone, {
      status: 'closed',
      approved_at: at,
      outcome: 'not_distributed',
    });
    const help = await helpOf(await head(), someone);
    expect(help.total).toBe(1);
    // the one counted is the approved one without an outcome
    expect(help.years).toEqual([
      {
        year: THIS_YEAR,
        count: 1,
        projects: [expect.objectContaining({ id: delivered.id, count: 1 })],
        unnamed: 0,
      },
    ]);
  });

  it('gives no help to a role outside the application history, and the projects still', async () => {
    const someone = await person();
    await applyTo(await projectOf(), someone);
    const media = await login(h, await account(h.db, { role: 'media_team' }));
    const data = (await profile(media, someone)).body.data;
    expect(data).not.toHaveProperty('help');
    expect(data.projectsByYear).toHaveLength(1);
  });

  it('counts a project the viewer does not see in the profile without naming it', async () => {
    const team = await account(h.db, { role: 'procurement_team' });
    const house = await projectOf();
    // the fixture gives each project a workflow definition of its own, so no other project changes
    await h.db.query(`UPDATE workflow_definitions SET key = 'construction' WHERE id = $1`, [
      house.workflow,
    ]);
    await h.db.query(
      `INSERT INTO project_staff (id, project_id, user_id, role_key, granted_by)
       VALUES ($1, $2, $3, 'procurement_team', $3)`,
      [randomUUID(), house.id, team.id],
    );
    const procurement = await login(h, team);
    const someone = await person();
    await applyTo(house, someone);
    const elsewhere = await projectOf();
    await applyTo(elsewhere, someone);
    const seen = await profile(procurement, someone);
    expect(seen.status).toBe(200);
    const help = seen.body.data.help as Help;
    expect(help.total).toBe(2);
    expect(help.years).toEqual([
      {
        year: THIS_YEAR,
        count: 2,
        projects: [expect.objectContaining({ id: house.id, count: 1 })],
        unnamed: 1,
      },
    ]);
    expect(JSON.stringify(seen.body.data)).not.toContain(elsewhere.id);
    const all = await helpOf(await head(), someone);
    expect(all.years[0]!.projects.map((p) => p.id).sort()).toEqual([house.id, elsewhere.id].sort());
    expect(all.years[0]!.unnamed).toBe(0);
    // a person outside the team's projects is refused as before
    const outside = await person();
    await applyTo(elsewhere, outside);
    expect((await profile(procurement, outside)).status).toBe(404);
  });

  it('counts on the kept profile what a merge left on the retired one, twice in one project, through a chain of merges', async () => {
    const kept = await person();
    const retired = await person();
    const shared = world.a1;
    await applyTo(shared, kept);
    await applyTo(shared, retired);
    await applyTo(await projectOf(2025), retired);
    const merge = (keptId: string, mergedId: string) =>
      head().then((s) =>
        api()
          .post('/api/v1/beneficiary-merges/direct')
          .set(bearer(s))
          .send({ keptId, mergedId, reason: 'একই মানুষ' })
          .expect(201),
      );
    await merge(kept, retired);
    // both applications of the shared project are the kept person's now: twice in one project
    const help = await helpOf(await head(), kept);
    expect(help).toMatchObject({ total: 3, firstYear: 2025, repeatedInProject: true });
    expect(help.years.find((y) => y.year === 2026)?.projects).toEqual([
      expect.objectContaining({ id: shared.id, count: 2 }),
    ]);
    // the kept profile retired in its turn: the last one counts all three
    const last = await person();
    await merge(last, kept);
    expect(await helpOf(await head(), last)).toMatchObject({ total: 3, repeatedInProject: true });
  });

  it('gives each profile back its own help when the merge is reverted', async () => {
    const kept = await person();
    const retired = await person();
    const shared = await projectOf();
    await applyTo(shared, kept);
    // one application left behind in the shared project, one moved with the merge
    await applyTo(shared, retired);
    await applyTo(await projectOf(2025), retired);
    const s = await head();
    const merged = await api()
      .post('/api/v1/beneficiary-merges/direct')
      .set(bearer(s))
      .send({ keptId: kept, mergedId: retired, reason: 'একই মানুষ' })
      .expect(201);
    expect((await helpOf(s, kept)).total).toBe(3);
    await api()
      .post(`/api/v1/beneficiary-merges/${merged.body.data.id}/revert`)
      .set(bearer(s))
      .send({ reason: 'ভুল করে মার্জ হয়েছিল' })
      .expect(200);
    expect(await helpOf(s, kept)).toMatchObject({
      total: 1,
      firstYear: THIS_YEAR,
      repeatedInProject: false,
    });
    expect(await helpOf(s, retired)).toMatchObject({
      total: 2,
      firstYear: 2025,
      repeatedInProject: false,
    });
  });
});
