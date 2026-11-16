import { randomUUID } from 'node:crypto';
import { isoDateInDhaka } from '@css/shared/format';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeHelpCounts } from '../../src/services/help-history.js';
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

// The program cards and the project series: every official who holds the overview reads the cards
// with counts only; what a caller may open, see of the budget or create comes from the caller's own
// permissions; the PM of a program and the two global roles create and rename a series.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);

async function staff(role: string) {
  const a = await account(h.db, { role });
  accounts.set(a.id, a);
  return a.id;
}

const DAY = 86_400_000;
/** The Dhaka date some days from the test clock's today. */
const dayFromToday = (days: number) =>
  new Date(new Date(`${isoDateInDhaka(h.clock.now())}T00:00:00Z`).getTime() + days * DAY)
    .toISOString()
    .slice(0, 10);

let n = 0;
/** A series code of capital letters that no other test of this file uses. */
const code = () => {
  n += 1;
  return `S${String.fromCharCode(65 + (n % 26))}${String.fromCharCode(65 + Math.floor(n / 26))}Z`;
};
const name = { bn: 'স্বাবলম্বী প্রকল্প', en: 'Self-reliance project' };

const programRow = (pmUserId: string | null, over: Record<string, unknown> = {}) =>
  f.insert(h.db, 'programs', {
    id: randomUUID(),
    code: `PX${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase().replace(/[0-9]/g, 'Q')}`,
    name_bn: 'মানবিক প্রোগ্রাম',
    name_en: 'Humanitarian program',
    pm_user_id: pmUserId,
    ...over,
  });
const seriesRow = (programId: string, over: Record<string, unknown> = {}) =>
  f.insert(h.db, 'project_series', {
    id: randomUUID(),
    program_id: programId,
    code: code(),
    name_bn: name.bn,
    name_en: name.en,
    ...over,
  });
/** A session of a series; January to December of its year unless the row gives its months. */
async function sessionRow(seriesId: string, year: number, over: Record<string, unknown> = {}) {
  const { rows } = await h.db.query<{ program_id: string; code: string }>(
    'SELECT program_id, code FROM project_series WHERE id = $1',
    [seriesId],
  );
  return f.projectRow(h.db, {
    id: randomUUID(),
    program_id: rows[0]!.program_id,
    series_id: seriesId,
    code: rows[0]!.code,
    year,
    name_bn: name.bn,
    name_en: name.en,
    workflow_definition_id: world.a1.workflow,
    workflow_version: 1,
    ...over,
  });
}
const area = (projectId: string, locationId: string, rpmUserId: string) =>
  f.insert(h.db, 'project_areas', {
    id: randomUUID(),
    project_id: projectId,
    location_id: locationId,
    rpm_user_id: rpmUserId,
  });
/** An application of a new person in a session, placed in the Dhaka-like division unless told. */
async function apply(
  projectId: string,
  status: string,
  over: Record<string, unknown> = {},
  loc: Awaited<ReturnType<typeof f.locationTree>> = world.dhaka,
): Promise<string> {
  const person = (over.beneficiary_id as string) ?? (await f.beneficiary(h.db, loc));
  await f.application(
    h.db,
    { project: { ...world.a1, id: projectId }, loc },
    { status, ...over, beneficiary_id: person },
  );
  return person;
}
async function volunteerOn(projectId: string, over: Record<string, unknown> = {}) {
  const userId = await f.volunteerUser(h.db);
  const volunteerId = await f.volunteer(h.db, world.dhaka, userId);
  await f.insert(h.db, 'project_volunteers', {
    id: randomUUID(),
    project_id: projectId,
    volunteer_id: volunteerId,
    region_location_id: world.dhaka.division,
    permission_set: 'application_distribution',
    assigned_by: world.users.rpmDhaka,
    ...over,
  });
  return volunteerId;
}

/** The program of the card tests: four series in every shape a card can show. */
interface Cards {
  program: string;
  pm: string;
  swb: { id: string; y2025: string; y2026: string; y2027: string };
  wtr: { id: string; y2026: string };
  old: { id: string; y2025: string };
  empty: { id: string };
  rpmThree: string;
  rpmFour: string;
  rpmNoBudget: string;
}
let x: Cards;

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });

  const pm = await staff('program_manager');
  const program = await programRow(pm);
  const rpmThree = await staff('regional_program_manager');
  const rpmFour = await staff('regional_program_manager');
  const rpmNoBudget = await staff('regional_program_manager');
  // the budget taken from one RPM in the permission panel, before the first sign-in
  await h.db.query(
    `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, reason, granted_by)
     VALUES ($1, $2, 'budget.view', 'revoke', 'GLOBAL', 'Test override', $3)`,
    [randomUUID(), rpmNoBudget, world.users.head],
  );
  const third = await f.locationTree(h.db);

  // the project that runs every year: last year closed, this year active, next year a draft
  const swb = await seriesRow(program);
  const y2025 = await sessionRow(swb, 2025, { status: 'closed' });
  const y2026 = await sessionRow(swb, 2026, {
    status: 'active',
    period_from: '2026-06-01',
    period_to: '2027-07-31',
    apply_to: dayFromToday(45),
    cost_per_beneficiary: '1500.00',
    target_beneficiaries: 600,
  });
  const y2027 = await sessionRow(swb, 2027, { period_from: '2027-08-01', period_to: '2028-07-31' });
  await area(y2026, world.dhaka.division, world.users.rpmDhaka);
  await area(y2026, world.rangpur.division, world.users.rpmRangpur);
  // a district inside a division already counted, and a third division
  await area(y2026, world.dhaka.district, rpmThree);
  await area(y2026, third.division, rpmFour);
  await area(y2026, third.district, rpmNoBudget);

  const approvedAt = new Date().toISOString();
  // approved last year (closed with the project) and again this year: one person
  const twice = await apply(y2025, 'closed', { approved_at: approvedAt });
  await apply(y2026, 'approved', { approved_at: approvedAt, beneficiary_id: twice });
  await apply(y2026, 'approved', { approved_at: approvedAt });
  await apply(y2026, 'rejected');
  await apply(y2026, 'waitlisted');
  await apply(y2026, 'submitted');
  await apply(y2026, 'under_review');
  // one more waits in the other region of the session
  await apply(y2026, 'reviewed', {}, world.rangpur);
  await apply(y2026, 'draft');
  const both = await volunteerOn(y2026);
  await volunteerOn(y2026);
  await volunteerOn(y2026, { ended_at: approvedAt });

  // a project whose first session is still a draft, in the other region only
  const wtr = await seriesRow(program, { name_bn: 'নিরাপদ পানি', name_en: 'Safe water' });
  const wtr2026 = await sessionRow(wtr, 2026);
  await area(wtr2026, world.rangpur.division, world.users.rpmRangpur);
  await apply(wtr2026, 'submitted', {}, world.rangpur);
  await f.insert(h.db, 'project_volunteers', {
    id: randomUUID(),
    project_id: wtr2026,
    volunteer_id: both,
    region_location_id: world.rangpur.division,
    permission_set: 'application_distribution',
    assigned_by: world.users.rpmRangpur,
  });

  // a project that ran once and has no session since, and one that has none yet
  const old = await seriesRow(program, { name_bn: 'বৃক্ষরোপণ', name_en: 'Tree planting' });
  const old2025 = await sessionRow(old, 2025, { status: 'closed' });
  // the person of two sessions was helped by this project too: still one person of the program
  await apply(old2025, 'closed', { approved_at: approvedAt, beneficiary_id: twice });
  // the times a person was helped are kept on the profile by every change of an application
  await h.container.prisma.$transaction((tx) => writeHelpCounts(tx, [twice]));
  const empty = await seriesRow(program, { name_bn: 'নতুন প্রকল্প', name_en: 'New project' });

  x = {
    program,
    pm,
    swb: { id: swb, y2025, y2026, y2027 },
    wtr: { id: wtr, y2026: wtr2026 },
    old: { id: old, y2025: old2025 },
    empty: { id: empty },
    rpmThree,
    rpmFour,
    rpmNoBudget,
  };
});
afterAll(async () => h.close());

const programCards = (s: Session) => api().get('/api/v1/program-cards').set(bearer(s));
const seriesList = (s: Session, programId?: string) =>
  api()
    .get('/api/v1/project-series')
    .query(programId ? { programId } : {})
    .set(bearer(s));
const seriesGet = (s: Session, id: string) =>
  api().get(`/api/v1/project-series/${id}`).set(bearer(s));
const create = (s: Session, body: Record<string, unknown>) =>
  api().post('/api/v1/project-series').set(bearer(s)).send(body);
const patch = (s: Session, id: string, etag: string | undefined, body: Record<string, unknown>) =>
  api()
    .patch(`/api/v1/project-series/${id}`)
    .set(bearer(s))
    .set('If-Match', etag ?? '')
    .send(body);

/** The three RPMs of the running session a card names: the first by name, then by id. */
async function firstThreeRpms() {
  const { rows } = await h.db.query<{ id: string; name: string }>(
    `SELECT id, display_name AS name FROM users WHERE id = ANY($1::uuid[])`,
    [[world.users.rpmDhaka, world.users.rpmRangpur, x.rpmThree, x.rpmFour, x.rpmNoBudget]],
  );
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return rows
    .sort((a, b) => order(a.name, b.name) || order(a.id, b.id))
    .slice(0, 3)
    .map((r) => ({ ...r, photoFileId: null }));
}

type Card = Record<string, unknown> & { id: string };
const cardOf = (res: { body: { data: Card[] } }, id: string) =>
  res.body.data.find((c) => c.id === id)!;

async function audit(entityId: string, action: string) {
  const { rows } = await h.db.query<{ entity_type: string; old: unknown; new: unknown }>(
    'SELECT entity_type, old, new FROM audit_log WHERE entity_id = $1 AND action = $2 ORDER BY created_at',
    [entityId, action],
  );
  return rows;
}

describe('the program cards', () => {
  it('gives an RPM every program, also one without a project in the RPM’s region, with its counts', async () => {
    const res = await programCards(await as(world.users.rpmDhaka));
    expect(res.status).toBe(200);
    const ids = res.body.data.map((c: Card) => c.id);
    expect(ids).toEqual(expect.arrayContaining([world.a1.program, world.b1.program, x.program]));
    expect(cardOf(res, world.b1.program)).toMatchObject({
      projects: 1,
      runningProjects: 0,
      beneficiaries: 0,
      applications: 0,
      volunteers: 0,
      pm: null,
      canCreate: false,
    });
    expect(cardOf(res, world.b1.program)).not.toHaveProperty('todo');
    expect(cardOf(res, world.a1.program)).toMatchObject({ projects: 2, runningProjects: 0 });
    const card = cardOf(res, x.program);
    expect(card).toMatchObject({
      name: { bn: 'মানবিক প্রোগ্রাম', en: 'Humanitarian program' },
      description: null,
      active: true,
      pm: { id: x.pm, name: expect.any(String) },
      projects: 4,
      runningProjects: 1,
      // the person helped in three sessions of two projects once; nobody rejected, waitlisted or
      // waiting
      beneficiaries: 2,
      // the applications and the volunteers of the running session only
      applications: 7,
      volunteers: 2,
      canCreate: false,
    });
    // the RPMs of the current sessions: the first three by name, and the number of all five
    expect(card.rpms).toEqual({ people: await firstThreeRpms(), total: 5 });
    // a card holds counts, these names and its cover only
    expect(Object.keys(card).sort()).toEqual(
      [
        'active',
        'applications',
        'beneficiaries',
        'canCreate',
        'code',
        'coverFileId',
        'description',
        'id',
        'name',
        'pm',
        'projects',
        'rpms',
        'runningProjects',
        'todo',
        'volunteers',
      ].sort(),
    );
  });

  it('sums the caller’s work over the current sessions the caller reaches, within the caller’s areas, and leaves it out when there is none', async () => {
    const todoOf = async (userId: string) =>
      cardOf(await programCards(await as(userId)), x.program).todo;
    // the whole program: three waiting in the running session and one in the draft, one waitlisted
    expect(await todoOf(world.users.head)).toEqual({ reviewsWaiting: 4, waitlisted: 1 });
    expect(await todoOf(x.pm)).toEqual({ reviewsWaiting: 4, waitlisted: 1 });
    // the Dhaka RPM holds one of the running session's regions: what waits there, and nothing of
    // the other region or of the draft
    expect(await todoOf(world.users.rpmDhaka)).toEqual({ reviewsWaiting: 2, waitlisted: 1 });
    // the Rangpur RPM: the other region of the running session and the draft's one region
    expect(await todoOf(world.users.rpmRangpur)).toEqual({ reviewsWaiting: 2, waitlisted: 0 });
    // an Executive and a PM of other work reach no session of this program
    expect(await todoOf(world.users.executive)).toBeUndefined();
    expect(await todoOf(world.users.pm)).toBeUndefined();
  });

  it('says who may create a project in a program: its PM and the two global roles, while it is active', async () => {
    const flag = async (userId: string, programId = x.program) =>
      cardOf(await programCards(await as(userId)), programId).canCreate;
    expect(await flag(x.pm)).toBe(true);
    expect(await flag(world.users.head)).toBe(true);
    expect(await flag(world.users.monitoring)).toBe(true);
    expect(await flag(world.users.pm)).toBe(false);
    expect(await flag(world.users.pm, world.a1.program)).toBe(true);
    expect(await flag(world.users.rpmDhaka)).toBe(false);
    expect(await flag(world.users.executive)).toBe(false);
    const inactive = await programRow(x.pm, { active: false });
    expect(await flag(x.pm, inactive)).toBe(false);
    expect(await flag(world.users.head, inactive)).toBe(false);
  });
});

describe('the cards of a program’s project series', () => {
  it('shows the current session with its state, window, target, counts, RPMs, volunteers and districts', async () => {
    const res = await seriesList(await as(world.users.executive), x.program);
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: Card) => c.id).sort()).toEqual(
      [x.swb.id, x.wtr.id, x.old.id, x.empty.id].sort(),
    );
    const card = cardOf(res, x.swb.id);
    expect(card).toMatchObject({
      programId: x.program,
      name,
      description: null,
      sessionCount: 3,
      beneficiaries: 2,
      canCreate: false,
    });
    // an Executive of other work sees the counts and no work of their own
    expect(card).not.toHaveProperty('todo');
    const current = card.current as Record<string, unknown>;
    expect(current).toMatchObject({
      // the active session, not the newer draft
      id: x.swb.y2026,
      sessionLabel: '2026-27',
      periodFrom: '2026-06',
      periodTo: '2027-07',
      status: 'active',
      applyTo: dayFromToday(45),
      daysLeft: 45,
      target: 600,
      approved: 2,
      applications: 7,
      volunteers: 2,
      // two divisions of one district each, a district of the first again, and a third division
      districts: 3,
    });
    // five RPMs hold areas of the session: the first three by name, and the number of all
    expect(current.rpms).toEqual({ people: await firstThreeRpms(), total: 5 });
    expect(Object.keys(current).sort()).toEqual(
      [
        'applications',
        'applyTo',
        'approved',
        'daysLeft',
        'districts',
        'id',
        'periodFrom',
        'periodTo',
        'rpms',
        'sessionLabel',
        'status',
        'target',
        'volunteers',
      ].sort(),
    );
  });

  it('takes the newest session that is not cancelled where none is running, and none for a series without one', async () => {
    const res = await seriesList(await as(world.users.head), x.program);
    expect(cardOf(res, x.old.id).current).toMatchObject({
      id: x.old.y2025,
      status: 'closed',
      sessionLabel: '2025',
      periodFrom: '2025-01',
      periodTo: '2025-12',
      applyTo: null,
      daysLeft: null,
      target: null,
      applications: 1,
      approved: 1,
    });
    // a person helped by two projects counts for each of them
    expect(cardOf(res, x.old.id).beneficiaries).toBe(1);
    expect(cardOf(res, x.swb.id).beneficiaries).toBe(2);
    expect(cardOf(res, x.wtr.id).current).toMatchObject({ id: x.wtr.y2026, status: 'draft' });
    expect(cardOf(res, x.empty.id)).toMatchObject({
      current: null,
      sessionCount: 0,
      beneficiaries: 0,
    });
    // a cancelled draft is no session of the series any more
    const cancelled = await seriesRow(x.program);
    await sessionRow(cancelled, 2026, { status: 'cancelled', cancelled_at: new Date() });
    const again = await seriesList(await as(world.users.head), x.program);
    expect(cardOf(again, cancelled)).toMatchObject({ current: null, sessionCount: 0 });
  });

  it('gives the days left to the end of the window, none on a past one, and zero on its last day', async () => {
    const series = await seriesRow(x.program);
    const session = await sessionRow(series, 2026, { status: 'active', apply_to: dayFromToday(0) });
    const left = async () =>
      (
        cardOf(await seriesList(await as(world.users.head), x.program), series).current as {
          daysLeft: number | null;
        }
      ).daysLeft;
    expect(await left()).toBe(0);
    await h.db.query('UPDATE projects SET apply_to = $1 WHERE id = $2', [dayFromToday(5), session]);
    expect(await left()).toBe(5);
    await h.db.query('UPDATE projects SET apply_to = $1 WHERE id = $2', [
      dayFromToday(-1),
      session,
    ]);
    expect(await left()).toBeNull();
  });

  it('shows the caller’s work only on a session the caller may open, and the budget only to who may see it', async () => {
    const todoOf = async (userId: string, seriesId: string) =>
      cardOf(await seriesList(await as(userId), x.program), seriesId).todo;
    // the Dhaka RPM: an area in the running session, with the budget of the region's RPM
    // an RPM of one of the session's two regions: what waits in that region only
    expect(await todoOf(world.users.rpmDhaka, x.swb.id)).toEqual({
      reviewsWaiting: 2,
      waitlisted: 1,
      budgetPlanned: '900000.00',
    });
    expect(await todoOf(world.users.rpmRangpur, x.swb.id)).toEqual({
      reviewsWaiting: 1,
      waitlisted: 0,
      budgetPlanned: '900000.00',
    });
    // an RPM of a district inside the first region sees that district's
    expect(await todoOf(x.rpmThree, x.swb.id)).toMatchObject({ reviewsWaiting: 2, waitlisted: 1 });
    // the PM and the Head reach the whole session
    expect(await todoOf(x.pm, x.swb.id)).toEqual({
      reviewsWaiting: 3,
      waitlisted: 1,
      budgetPlanned: '900000.00',
    });
    expect(await todoOf(world.users.head, x.swb.id)).toMatchObject({
      reviewsWaiting: 3,
      waitlisted: 1,
    });
    // and no area in the other project
    expect(await todoOf(world.users.rpmDhaka, x.wtr.id)).toBeUndefined();
    expect(await todoOf(world.users.rpmRangpur, x.wtr.id)).toEqual({
      reviewsWaiting: 1,
      waitlisted: 0,
      budgetPlanned: null,
    });
    // an RPM of the session whose budget permission was taken away, in a district where nothing
    // waits
    expect(await todoOf(x.rpmNoBudget, x.swb.id)).toEqual({ reviewsWaiting: 0, waitlisted: 0 });
    // the last session of a project that no longer runs: nothing waits, and the PM may open it
    expect(await todoOf(x.pm, x.old.id)).toEqual({
      reviewsWaiting: 0,
      waitlisted: 0,
      budgetPlanned: null,
    });
    expect(await todoOf(world.users.executive, x.swb.id)).toBeUndefined();
  });

  it('counts an application once for a caller who holds its division and its district in every project', async () => {
    // an official with no project of their own, given two areas that name no project
    const official = await account(h.db, { role: 'project_executive' });
    accounts.set(official.id, official);
    for (const [scope, location] of [
      ['REGION', world.rangpur.division],
      ['DISTRICT', world.rangpur.district],
    ] as const)
      await h.db.query(
        `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, scope_ref, reason, granted_by)
         VALUES ($1, $2, 'project.view', 'grant', $3, $4, 'Test override', $5)`,
        [randomUUID(), official.id, scope, location, world.users.head],
      );
    const cards = await seriesList(await as(official.id), x.program);
    expect(cards.status).toBe(200);
    // both sessions with an area in the division, each with what waits there, counted once
    expect(cardOf(cards, x.swb.id).todo).toEqual({ reviewsWaiting: 1, waitlisted: 0 });
    expect(cardOf(cards, x.wtr.id).todo).toEqual({ reviewsWaiting: 1, waitlisted: 0 });
    // a project without an area there is not theirs to open
    expect(cardOf(cards, x.old.id).todo).toBeUndefined();
    const programs = await programCards(await as(official.id));
    expect(
      (programs.body.data as { id: string; todo?: unknown }[]).find((p) => p.id === x.program)
        ?.todo,
    ).toEqual({ reviewsWaiting: 2, waitlisted: 0 });
  });

  it('lists every series the overview reaches without a program, and only the program’s with one', async () => {
    const head = await as(world.users.head);
    const all = await seriesList(head);
    expect(all.status).toBe(200);
    const programs = new Set(all.body.data.map((c: { programId: string }) => c.programId));
    expect(programs.has(x.program) && programs.has(world.a1.program)).toBe(true);
    const one = await seriesList(head, world.b1.program);
    expect(one.body.data.map((c: { programId: string }) => c.programId)).toEqual([
      world.b1.program,
    ]);
  });

  it('answers 422 to a program that is no id', async () => {
    const res = await seriesList(await as(world.users.head), 'not-a-uuid');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('validation.failed');
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: 'programId' })]);
  });

  it('counts by profile: a profile retired by a merge and the profile it went into, both helped in one session, are two', async () => {
    const series = await seriesRow(x.program);
    const session = await sessionRow(series, 2026, { status: 'active' });
    const approvedAt = new Date().toISOString();
    const kept = await apply(session, 'approved', { approved_at: approvedAt });
    const retired = await f.beneficiary(h.db, world.dhaka);
    // the merge left the retired profile's application of this session where it was
    const left = await f.application(
      h.db,
      { project: { ...world.a1, id: session }, loc: world.dhaka },
      { status: 'approved', approved_at: approvedAt, beneficiary_id: retired },
    );
    await h.db.query(
      `INSERT INTO profile_merges (id, kept_id, merged_id, status, reason, proposed_by, merged_by, merged_at, snapshot)
       VALUES (gen_random_uuid(), $1, $2, 'merged', 'একই মানুষ', $3, $3, now(), $4)`,
      [kept, retired, world.users.head, JSON.stringify({ moved: {}, leftBehind: [left] })],
    );
    await h.db.query('UPDATE beneficiaries SET merged_into_id = $1 WHERE id = $2', [kept, retired]);
    await h.container.prisma.$transaction((tx) => writeHelpCounts(tx, [kept, retired]));
    const { rows } = await h.db.query('SELECT help_count FROM beneficiaries WHERE id = $1', [kept]);
    expect(rows).toEqual([{ help_count: 2 }]);
    const card = cardOf(await seriesList(await as(world.users.head), x.program), series);
    expect(card.beneficiaries).toBe(2);
  });
});

describe('one project series with its sessions', () => {
  it('lists the sessions newest first and marks each by the caller’s own reach', async () => {
    const res = await seriesGet(await as(world.users.rpmDhaka), x.swb.id);
    expect(res.status).toBe(200);
    expect(res.headers.etag).toBeTruthy();
    expect(res.body.data).toMatchObject({
      id: x.swb.id,
      code: expect.any(String),
      program: { id: x.program, name: { bn: 'মানবিক প্রোগ্রাম', en: 'Humanitarian program' } },
      beneficiaries: 2,
      sessionCount: 3,
      current: { id: x.swb.y2026 },
    });
    expect(res.body.data.sessions).toEqual([
      {
        id: x.swb.y2027,
        year: 2027,
        sessionLabel: '2027-28',
        periodFrom: '2027-08',
        periodTo: '2028-07',
        status: 'draft',
        applications: 0,
        approved: 0,
        canOpen: false,
      },
      {
        id: x.swb.y2026,
        year: 2026,
        sessionLabel: '2026-27',
        periodFrom: '2026-06',
        periodTo: '2027-07',
        status: 'active',
        applications: 7,
        approved: 2,
        canOpen: true,
      },
      {
        id: x.swb.y2025,
        year: 2025,
        sessionLabel: '2025',
        periodFrom: '2025-01',
        periodTo: '2025-12',
        status: 'closed',
        applications: 1,
        approved: 1,
        canOpen: false,
      },
    ]);
    const opens = async (userId: string) =>
      (await seriesGet(await as(userId), x.swb.id)).body.data.sessions.map(
        (s: { canOpen: boolean }) => s.canOpen,
      );
    expect(await opens(world.users.head)).toEqual([true, true, true]);
    expect(await opens(x.pm)).toEqual([true, true, true]);
    expect(await opens(world.users.executive)).toEqual([false, false, false]);
  });

  it('answers 404 for a series that does not exist', async () => {
    const res = await seriesGet(await as(world.users.head), randomUUID());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('permission.not_found');
  });
});

describe('who reads the cards', () => {
  it('refuses the Finance Team, the Media Team, the Official দায়ী and a volunteer, and a caller who is not signed in', async () => {
    for (const role of ['finance_team', 'media_team', 'official_daee', 'procurement_team']) {
      const s = await as(await staff(role));
      for (const res of [
        await programCards(s),
        await seriesList(s),
        await seriesGet(s, x.swb.id),
      ]) {
        expect(res.status, role).toBe(403);
        expect(res.body.error.code).toBe('permission.denied');
      }
    }
    const volunteer = await as(world.users.general);
    expect((await programCards(volunteer)).status).toBe(403);
    expect((await seriesList(volunteer, x.program)).status).toBe(403);
    expect((await seriesGet(volunteer, x.swb.id)).status).toBe(403);
    for (const path of ['/program-cards', '/project-series', `/project-series/${x.swb.id}`])
      expect((await api().get(`/api/v1${path}`)).status, path).toBe(401);
  });

  it('gives the five project roles the cards', async () => {
    for (const userId of [
      world.users.head,
      world.users.monitoring,
      world.users.pm,
      world.users.rpmRangpur,
      world.users.executive,
    ]) {
      const s = await as(userId);
      expect((await programCards(s)).status).toBe(200);
      expect((await seriesList(s, x.program)).status).toBe(200);
      expect((await seriesGet(s, x.swb.id)).status).toBe(200);
    }
  });
});

describe('creating and renaming a project series', () => {
  it('lets the PM create a series in the own program, audited, and refuses another program and an RPM', async () => {
    const pm = await as(x.pm);
    const taken = code();
    const description = { bn: 'পরিবারকে স্বাবলম্বী করার প্রকল্প', en: '' };
    const res = await create(pm, { programId: x.program, code: taken, name, description });
    expect(res.status).toBe(201);
    expect(res.headers.etag).toBeTruthy();
    expect(res.body.data).toMatchObject({
      programId: x.program,
      code: taken,
      name,
      description,
      sessionCount: 0,
      beneficiaries: 0,
      current: null,
      sessions: [],
      canCreate: true,
      program: { id: x.program },
    });
    const id = res.body.data.id as string;
    expect(await audit(id, 'project_series.create')).toEqual([
      {
        entity_type: 'project_series',
        old: null,
        new: { id, programId: x.program, code: taken, name, description },
      },
    ]);
    const { rows } = await h.db.query(
      'SELECT description_bn, description_en, created_by, updated_by FROM project_series WHERE id = $1',
      [id],
    );
    // a language left empty is not written
    expect(rows).toEqual([
      { description_bn: description.bn, description_en: null, created_by: x.pm, updated_by: x.pm },
    ]);

    const again = await create(pm, { programId: x.program, code: taken, name });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('project.series_code_taken');

    // the program comes from the body here, so it is checked against the caller's own programs
    const foreign = await create(pm, { programId: world.a1.program, code: code(), name });
    expect(foreign.status).toBe(403);
    const rpm = await create(await as(world.users.rpmDhaka), {
      programId: x.program,
      code: code(),
      name,
    });
    expect(rpm.status).toBe(403);
    const executive = await create(await as(world.users.executive), {
      programId: x.program,
      code: code(),
      name,
    });
    expect(executive.status).toBe(403);
    const head = await create(await as(world.users.head), {
      programId: world.b1.program,
      code: code(),
      name,
    });
    expect(head.status).toBe(201);
    const inactive = await programRow(x.pm, { active: false });
    const closed = await create(pm, { programId: inactive, code: code(), name });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('program.inactive');
    for (const body of [
      { programId: x.program, code: 'swb', name },
      { programId: x.program, code: code() },
      { programId: x.program, code: code(), name, year: 2026 },
    ])
      expect((await create(pm, body)).status).toBe(422);
  });

  it('renames a series with every session under one audit entry, and answers 412 to a stale If-Match', async () => {
    const pm = await as(x.pm);
    const series = await seriesRow(x.program);
    const first = await sessionRow(series, 2025, { status: 'closed' });
    const second = await sessionRow(series, 2026, { status: 'active' });
    const read = await seriesGet(pm, series);
    const renamed = { bn: 'নতুন নাম', en: 'New name' };
    const res = await patch(pm, series, read.headers.etag, {
      name: renamed,
      description: { bn: 'বছরজুড়ে চলে', en: 'Runs all year' },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: renamed,
      description: { bn: 'বছরজুড়ে চলে', en: 'Runs all year' },
    });
    const { rows } = await h.db.query(
      'SELECT id, name_bn, name_en, updated_by FROM projects WHERE series_id = $1 ORDER BY year',
      [series],
    );
    expect(rows).toEqual([
      { id: first, name_bn: renamed.bn, name_en: renamed.en, updated_by: x.pm },
      { id: second, name_bn: renamed.bn, name_en: renamed.en, updated_by: x.pm },
    ]);
    expect(await audit(series, 'project_series.update')).toEqual([
      {
        entity_type: 'project_series',
        old: { name, description: null },
        new: {
          name: renamed,
          description: { bn: 'বছরজুড়ে চলে', en: 'Runs all year' },
          sessionsRenamed: 2,
        },
      },
    ]);

    const stale = await patch(pm, series, read.headers.etag, { description: null });
    expect(stale.status).toBe(412);
    expect(stale.body.error.code).toBe('conflict.stale_version');
    const cleared = await patch(pm, series, res.headers.etag, { description: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.description).toBeNull();
    // a description alone renames nothing
    expect((await audit(series, 'project_series.update')).at(-1)?.new).toMatchObject({
      sessionsRenamed: 0,
    });
    expect((await patch(pm, series, cleared.headers.etag, {})).status).toBe(422);
    expect((await patch(pm, randomUUID(), cleared.headers.etag, { name })).status).toBe(404);
  });

  it('never moves a series to another program or code: a body that names either is refused and changes nothing', async () => {
    const pm = await as(x.pm);
    const series = await seriesRow(x.program);
    const read = await seriesGet(pm, series);
    const before = (await h.db.query('SELECT * FROM project_series WHERE id = $1', [series])).rows;
    for (const extra of [{ programId: world.a1.program }, { code: 'OTHER' }]) {
      const res = await patch(pm, series, read.headers.etag, { name, ...extra });
      expect(res.status).toBe(422);
      expect(res.body.error.details).toEqual([
        expect.objectContaining({
          path: Object.keys(extra)[0],
          code: 'validation.unknown_parameter',
        }),
      ]);
    }
    expect((await h.db.query('SELECT * FROM project_series WHERE id = $1', [series])).rows).toEqual(
      before,
    );
    expect(await audit(series, 'project_series.update')).toEqual([]);
  });

  it('lets the unique index decide between two creations of one code at the same moment', async () => {
    const head = await as(world.users.head);
    const taken = code();
    // two programs, so neither request waits for the other's lock on its program
    const results = await Promise.all([
      create(head, { programId: x.program, code: taken, name }),
      create(head, { programId: world.b1.program, code: taken, name }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.error.code).toBe(
      'project.series_code_taken',
    );
    const { rows } = await h.db.query(
      'SELECT count(*)::int AS n FROM project_series WHERE code = $1',
      [taken],
    );
    expect(rows).toEqual([{ n: 1 }]);
  });

  it('checks the program the series is stored with: a PM of another program and an RPM are refused', async () => {
    const series = await seriesRow(x.program);
    const read = await seriesGet(await as(world.users.pm), series);
    expect(read.status).toBe(200);
    // a series of a program that is not the caller's answers as a series that does not exist
    const other = await patch(await as(world.users.pm), series, read.headers.etag, {
      name: { bn: 'অন্যের', en: 'Someone else’s' },
    });
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe('permission.not_found');
    const missing = await patch(await as(world.users.pm), randomUUID(), read.headers.etag, {
      name: { bn: 'অন্যের', en: 'Someone else’s' },
    });
    expect([missing.status, missing.body.error.code]).toEqual([
      other.status,
      other.body.error.code,
    ]);
    const rpm = await patch(await as(world.users.rpmDhaka), series, read.headers.etag, {
      name: { bn: 'অন্যের', en: 'Someone else’s' },
    });
    expect(rpm.status).toBe(403);
    const { rows } = await h.db.query('SELECT name_bn FROM project_series WHERE id = $1', [series]);
    expect(rows).toEqual([{ name_bn: name.bn }]);
    const head = await patch(await as(world.users.head), series, read.headers.etag, {
      name: { bn: 'হেডের দেওয়া নাম', en: 'Named by the Head' },
    });
    expect(head.status).toBe(200);
  });
});

describe('the request budget of the card reads', () => {
  let limited: AuthHarness;
  beforeAll(async () => {
    limited = await authHarness({ realRateLimits: true });
    await accessWorld(limited.db);
  });
  afterAll(async () => limited.close());

  it('shares 60 calls a minute per user across the program cards and the series', async () => {
    const head = await account(limited.db, { role: 'department_head' });
    const s = await login(limited, head);
    const call = (path: string) => request(limited.server()).get(`/api/v1${path}`).set(bearer(s));
    for (let i = 0; i < 30; i += 1) expect((await call('/program-cards')).status).toBe(200);
    for (let i = 0; i < 30; i += 1) expect((await call('/project-series')).status).toBe(200);
    const refused = await call('/program-cards');
    expect(refused.status).toBe(429);
    expect(refused.headers['retry-after']).toBeTruthy();
    expect((await call('/project-series')).status).toBe(429);
    expect((await call(`/project-series/${randomUUID()}`)).status).toBe(429);
  }, 60_000);
});
