import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
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
import { draftProject } from './support/projects.js';

// Projects: created from a workflow as drafts, read in scope, updated as their state allows and
// cancelled while never activated.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  // the seeded workflow definitions and list defaults a project starts from
  const ctx = new SeedContext(h.container.prisma);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
});
afterAll(async () => h.close());

let n = 0;
/** A project code of capital letters that no other test uses (each test file has its own database). */
const code = () => {
  n += 1;
  const letter = (v: number) => String.fromCharCode(65 + (Math.floor(v) % 26));
  return `N${letter(n / 676)}${letter(n / 26)}${letter(n)}`;
};
const name = { bn: 'শীতবস্ত্র নমুনা', en: 'Winter sample' };

const WORKFLOW = { kind: 'workflow', workflowKey: 'distribution' };
/** The setup's first step as it is sent: a session of a series. */
const create = (s: Session, body: Record<string, unknown>) =>
  api().post('/api/v1/projects').set(bearer(s)).send(body);
/** A project series of a program, with a code of its own. */
const newSeries = (s: Session, programId: string) =>
  api().post('/api/v1/project-series').set(bearer(s)).send({ programId, code: code(), name });
/** A draft as the setup makes one: a new series and its first session, the whole of 2026. */
const draft = (s: Session, programId: string, workflowKey = 'distribution') =>
  draftProject(h, s, {
    programId,
    code: code(),
    name,
    source: { kind: 'workflow', workflowKey },
  });
const get = (s: Session, id: string) => api().get(`/api/v1/projects/${id}`).set(bearer(s));
const patch = (s: Session, id: string, etag: string | undefined, body: Record<string, unknown>) =>
  api()
    .patch(`/api/v1/projects/${id}`)
    .set(bearer(s))
    .set('If-Match', etag ?? '')
    .send(body);
const setStatus = (id: string, status: string) =>
  h.db.query('UPDATE projects SET status = $1 WHERE id = $2', [status, id]);

const seriesIdOf = async (projectId: string) =>
  (
    await h.db.query<{ series_id: string }>('SELECT series_id FROM projects WHERE id = $1', [
      projectId,
    ])
  ).rows[0]!.series_id;

/** The series a project is a session of, and the days the session runs. */
async function seriesOf(projectId: string) {
  const { rows } = await h.db.query(
    `SELECT s.program_id, s.code, s.name_bn, s.name_en, s.created_by, s.updated_by,
            p.period_from::text, p.period_to::text
       FROM projects p JOIN project_series s ON s.id = p.series_id WHERE p.id = $1`,
    [projectId],
  );
  return rows[0];
}

async function audit(entityId: string, action: string) {
  const { rows } = await h.db.query<{ old: unknown; new: unknown; reason: string | null }>(
    'SELECT old, new, reason FROM audit_log WHERE entity_id = $1 AND action = $2 ORDER BY created_at',
    [entityId, action],
  );
  return rows;
}

describe('creating a project from a workflow', () => {
  it('gives the PM a draft with the workflow components, its sequence and an audit entry', async () => {
    const pm = await as(world.users.pm);
    const res = await draft(pm, world.a1.program);
    expect(res.status).toBe(201);
    const p = res.body.data;
    expect(p).toMatchObject({
      status: 'draft',
      workflowKey: 'distribution',
      year: 2026,
      name,
      programId: world.a1.program,
      seriesId: await seriesIdOf(p.id),
      periodFrom: '2026-01',
      periodTo: '2026-12',
      sessionLabel: '2026',
    });
    const { rows } = await h.db.query<{
      component_key: string;
      enabled: boolean;
      settings: unknown;
    }>('SELECT component_key, enabled, settings FROM project_components WHERE project_id = $1', [
      p.id,
    ]);
    expect(rows).toHaveLength(18);
    expect(
      rows
        .filter((r) => r.enabled)
        .map((r) => r.component_key)
        .sort(),
    ).toEqual(
      [
        'application_form',
        'dispatch_receive',
        'distribution',
        'rating_criteria',
        'volunteer_assignment',
        'volunteer_expenses',
      ].sort(),
    );
    const photo = rows.find((r) => r.component_key === 'distribution')!.settings as {
      source: { distribution_proof: string };
    };
    expect(photo.source.distribution_proof).toBe('camera_only');
    const seq = await h.db.query('SELECT last_value FROM id_sequences WHERE scope_key = $1', [
      `app:${p.id}`,
    ]);
    expect(seq.rows[0]).toEqual({ last_value: 0 });
    expect(await audit(p.id, 'project.create')).toHaveLength(1);
    // the project is a session of its series, with the series' program, code and names
    expect(await seriesOf(p.id)).toEqual({
      program_id: world.a1.program,
      code: p.code,
      name_bn: name.bn,
      name_en: name.en,
      created_by: world.users.pm,
      updated_by: world.users.pm,
      period_from: '2026-01-01',
      period_to: '2026-12-31',
    });
  });

  it('refuses another program, an RPM, a taken code, an unknown workflow and an inactive program', async () => {
    const pm = await as(world.users.pm);
    expect((await draft(pm, world.b1.program)).status).toBe(403);
    const rpm = await as(world.users.rpmDhaka);
    expect((await draft(rpm, world.a1.program)).status).toBe(403);

    const first = await draft(pm, world.a1.program);
    const taken = await draftProject(h, pm, {
      programId: world.a1.program,
      code: first.body.data.code,
      name,
      source: WORKFLOW,
    });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('project.series_code_taken');
    expect((await draft(pm, world.a1.program, 'unknown_flow')).status).toBe(422);

    const head = await as(world.users.head);
    const program = await f.project(h.db);
    await h.db.query('UPDATE programs SET active = false WHERE id = $1', [program.program]);
    const inactive = await draft(head, program.program);
    expect(inactive.status).toBe(409);
    expect(inactive.body.error.code).toBe('program.inactive');
  });

  it('creates the first session of a series from the series and a period, and one session per start year', async () => {
    const pm = await as(world.users.pm);
    const series = await newSeries(pm, world.a1.program);
    expect(series.status).toBe(201);
    const seriesId = series.body.data.id as string;
    const res = await create(pm, {
      seriesId,
      periodFrom: '2027-06',
      periodTo: '2028-07',
      source: WORKFLOW,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.headers.etag).toBeTruthy();
    expect(res.body.data).toMatchObject({
      seriesId,
      programId: world.a1.program,
      code: series.body.data.code,
      name,
      status: 'draft',
      // the year is the year the period starts in
      year: 2027,
      periodFrom: '2027-06',
      periodTo: '2028-07',
      sessionLabel: '2027-28',
    });
    const id = res.body.data.id as string;
    expect(await seriesOf(id)).toMatchObject({
      period_from: '2027-06-01',
      period_to: '2028-07-31',
    });
    const [entry] = await audit(id, 'project.create');
    expect(entry?.new).toMatchObject({ seriesId, year: 2027, source: WORKFLOW });

    // a series takes one session per start year, whatever its months
    const again = await create(pm, {
      seriesId,
      periodFrom: '2027-01',
      periodTo: '2027-12',
      source: WORKFLOW,
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('project.session_year_taken');
    // a cancelled session keeps its year
    await setStatus(id, 'cancelled');
    expect(
      (await create(pm, { seriesId, periodFrom: '2027-03', periodTo: '2027-09', source: WORKFLOW }))
        .body.error.code,
    ).toBe('project.session_year_taken');
    const other = await create(pm, {
      seriesId,
      periodFrom: '2028-08',
      periodTo: '2029-07',
      source: WORKFLOW,
    });
    expect(other.status).toBe(201);
    expect(other.body.data).toMatchObject({ year: 2028, sessionLabel: '2028-29' });
    const missing = await create(pm, {
      seriesId: randomUUID(),
      periodFrom: '2027-01',
      periodTo: '2027-12',
      source: WORKFLOW,
    });
    expect(missing.status).toBe(404);
  });

  it('checks the program the series is stored with: for a PM of another program the series is not found, and an RPM is refused', async () => {
    const head = await as(world.users.head);
    // a program of nobody's, with a series the Head made
    const { program } = await f.project(h.db);
    const foreign = await newSeries(head, program);
    const body = {
      seriesId: foreign.body.data.id as string,
      periodFrom: '2027-01',
      periodTo: '2027-12',
      source: WORKFLOW,
    };
    // as a series that does not exist answers
    const outside = await create(await as(world.users.pm), body);
    expect(outside.status).toBe(404);
    expect(outside.body.error.code).toBe('permission.not_found');
    const missing = await create(await as(world.users.pm), { ...body, seriesId: randomUUID() });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('permission.not_found');
    expect((await create(await as(world.users.rpmDhaka), body)).status).toBe(403);
    const { rows } = await h.db.query(
      'SELECT count(*)::int AS n FROM projects WHERE series_id = $1',
      [body.seriesId],
    );
    expect(rows).toEqual([{ n: 0 }]);
    // the Head creates it, and an inactive program takes no session
    expect((await create(head, body)).status).toBe(201);
    await h.db.query('UPDATE programs SET active = false WHERE id = $1', [program]);
    try {
      const inactive = await create(head, { ...body, periodFrom: '2028-01', periodTo: '2028-12' });
      expect(inactive.status).toBe(409);
      expect(inactive.body.error.code).toBe('program.inactive');
    } finally {
      await h.db.query('UPDATE programs SET active = true WHERE id = $1', [program]);
    }
  });

  it('takes nothing of the series from the body: the earlier body, a code, a program and a year are refused', async () => {
    const pm = await as(world.users.pm);
    const earlier = await create(pm, {
      programId: world.a1.program,
      code: code(),
      year: 2026,
      name,
      source: WORKFLOW,
    });
    expect(earlier.status).toBe(422);
    expect(
      (earlier.body.error.details as { path: string; code: string }[])
        .filter((d) => d.code === 'validation.unknown_parameter')
        .map((d) => d.path)
        .sort(),
    ).toEqual(['code', 'name', 'programId', 'year']);
    const series = await newSeries(pm, world.a1.program);
    const body = {
      seriesId: series.body.data.id as string,
      periodFrom: '2027-01',
      periodTo: '2027-12',
      source: WORKFLOW,
    };
    for (const extra of [{ code: 'OTHER' }, { programId: world.b1.program }, { year: 2030 }]) {
      const res = await create(pm, { ...body, ...extra });
      expect(res.status, Object.keys(extra)[0]).toBe(422);
    }
    // a period whose end is before its start, and one of more than 24 months
    expect((await create(pm, { ...body, periodTo: '2026-12' })).status).toBe(422);
    expect((await create(pm, { ...body, periodTo: '2029-01' })).status).toBe(422);
    const { rows } = await h.db.query(
      'SELECT count(*)::int AS n FROM projects WHERE series_id = $1',
      [body.seriesId],
    );
    expect(rows).toEqual([{ n: 0 }]);
  });

  it('starts a tree-planting project with its application kinds', async () => {
    const pm = await as(world.users.pm);
    const res = await draft(pm, world.a1.program, 'open_application_visit');
    const { rows } = await h.db.query<{ settings: { application_kinds?: { code: string }[] } }>(
      `SELECT settings FROM project_components WHERE project_id = $1 AND component_key = 'application_form'`,
      [res.body.data.id],
    );
    expect(rows[0]!.settings.application_kinds?.map((k) => k.code)).toEqual([
      'educational_institution',
      'personal_garden',
    ]);
  });
});

describe('updating a project', () => {
  it('changes a draft and audits before and after', async () => {
    const pm = await as(world.users.pm);
    const created = await draft(pm, world.a1.program);
    const id = created.body.data.id as string;
    const res = await patch(pm, id, created.headers.etag, {
      name: { bn: 'নতুন', en: 'New' },
      periodFrom: '2027-06',
      periodTo: '2028-07',
      perVolunteerLimit: 40,
      costPerBeneficiary: '1000.50',
      targetBeneficiaries: 100,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      year: 2027,
      periodFrom: '2027-06',
      periodTo: '2028-07',
      sessionLabel: '2027-28',
      perVolunteerLimit: 40,
      costPerBeneficiary: '1000.50',
      budgetPlanned: '100050.00',
    });
    const [entry] = await audit(id, 'project.configure');
    expect(entry?.old).toMatchObject({ year: 2026, periodFrom: '2026-01', sessionLabel: '2026' });
    expect(entry?.new).toMatchObject({
      year: 2027,
      periodFrom: '2027-06',
      periodTo: '2028-07',
      sessionLabel: '2027-28',
      perVolunteerLimit: 40,
    });
    // the series carries the new names, and the session runs its new months
    expect(await seriesOf(id)).toMatchObject({
      name_bn: 'নতুন',
      name_en: 'New',
      period_from: '2027-06-01',
      period_to: '2028-07-31',
    });
  });

  it('keeps the identity and the end date of an active project, and everything once closing', async () => {
    const pm = await as(world.users.pm);
    const created = await draft(pm, world.a1.program);
    const id = created.body.data.id as string;
    await setStatus(id, 'active');
    let current = await get(pm, id);
    const period = await patch(pm, id, current.headers.etag, {
      periodFrom: '2027-01',
      periodTo: '2027-12',
    });
    expect(period.status).toBe(409);
    expect(period.body.error.code).toBe('project.read_only');
    expect((await patch(pm, id, current.headers.etag, { applyTo: '2026-12-31' })).status).toBe(409);
    const renamed = await patch(pm, id, current.headers.etag, {
      name: { bn: 'চলমান', en: 'Running' },
      applyFrom: '2026-11-01',
    });
    expect(renamed.status).toBe(200);
    // the whole form sent back with the fixed fields unchanged is fine
    current = await get(pm, id);
    const resent = await patch(pm, id, current.headers.etag, {
      name: current.body.data.name,
      periodFrom: current.body.data.periodFrom,
      periodTo: current.body.data.periodTo,
      workflowKey: current.body.data.workflowKey,
      applyTo: current.body.data.applyTo,
      description: 'নতুন বর্ণনা',
    });
    expect(resent.status).toBe(200);
    for (const status of ['closing', 'closed']) {
      await setStatus(id, status);
      current = await get(pm, id);
      const res = await patch(pm, id, current.headers.etag, { name });
      expect(res.status, status).toBe(409);
    }
  });

  it('keeps what an active project needs, and a budget its column can hold', async () => {
    const pm = await as(world.users.pm);
    const created = await draft(pm, world.a1.program);
    const id = created.body.data.id as string;
    const set = await patch(pm, id, created.headers.etag, {
      applyFrom: '2026-11-01',
      perVolunteerLimit: 50,
      costPerBeneficiary: '1000.00',
      targetBeneficiaries: 100,
    });
    // the generated budget column holds at most twelve digits before the point
    const huge = await patch(pm, id, set.headers.etag, {
      costPerBeneficiary: '1000000',
      targetBeneficiaries: 1_000_000,
    });
    expect(huge.status).toBe(422);
    await setStatus(id, 'active');
    const current = await get(pm, id);
    for (const key of [
      'applyFrom',
      'perVolunteerLimit',
      'costPerBeneficiary',
      'targetBeneficiaries',
    ]) {
      const res = await patch(pm, id, current.headers.etag, { [key]: null });
      expect(res.status, key).toBe(422);
    }
    // an active budget changes only together with its fund sources
    const cheaper = await patch(pm, id, current.headers.etag, { costPerBeneficiary: '900.00' });
    expect(cheaper.status).toBe(422);
    expect(cheaper.body.error.code).toBe('project.budget_mismatch');
  });

  it('starts a draft again from the components of a new workflow', async () => {
    const pm = await as(world.users.pm);
    const created = await draft(pm, world.a1.program);
    const id = created.body.data.id as string;
    expect(created.body.data.dawahEnabled).toBe(false);
    const res = await patch(pm, id, created.headers.etag, {
      workflowKey: 'implementation_evidence',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      workflowKey: 'implementation_evidence',
      dawahEnabled: true,
    });
    const { rows } = await h.db.query<{ component_key: string }>(
      'SELECT component_key FROM project_components WHERE project_id = $1 AND enabled ORDER BY component_key',
      [id],
    );
    expect(rows.map((r) => r.component_key)).toContain('exams');
    expect(rows.map((r) => r.component_key)).not.toContain('dispatch_receive');
  });

  it('refuses the PM of another program and a volunteer', async () => {
    const pm = await as(world.users.pm);
    const created = await draft(pm, world.a1.program);
    const id = created.body.data.id as string;
    const other = await login(h, await account(h.db, { role: 'program_manager' }));
    expect((await patch(other, id, created.headers.etag, { name })).status).toBe(404);
    const volunteer = await as(world.users.general);
    expect((await patch(volunteer, id, created.headers.etag, { name })).status).toBe(403);
    expect(
      (
        await api()
          .patch(`/api/v1/projects/${id}`)
          .set('If-Match', String(created.headers.etag))
          .send({ name })
      ).status,
    ).toBe(401);
  });

  it('refuses a stale If-Match, an unknown key, an empty body and a window that runs backwards', async () => {
    const pm = await as(world.users.pm);
    const created = await draft(pm, world.a1.program);
    const id = created.body.data.id as string;
    expect((await patch(pm, id, '"stale"', { name })).status).toBe(412);
    expect((await patch(pm, id, created.headers.etag, { name, extra: 1 })).status).toBe(422);
    expect((await patch(pm, id, created.headers.etag, {})).status).toBe(422);
    const backwards = await patch(pm, id, created.headers.etag, {
      applyFrom: '2026-12-31',
      applyTo: '2026-11-01',
    });
    expect(backwards.status).toBe(422);
  });

  it('never gives a session another program, code or year: a body that names one is refused and changes nothing', async () => {
    const pm = await as(world.users.pm);
    const created = await draft(pm, world.a1.program);
    const id = created.body.data.id as string;
    const before = (await h.db.query('SELECT * FROM projects WHERE id = $1', [id])).rows;
    for (const extra of [{ programId: world.b1.program }, { code: 'OTHER' }, { year: 2027 }]) {
      const res = await patch(pm, id, created.headers.etag, { description: 'নতুন', ...extra });
      expect(res.status, Object.keys(extra)[0]).toBe(422);
      expect(res.body.error.details).toEqual([
        expect.objectContaining({
          path: Object.keys(extra)[0],
          code: 'validation.unknown_parameter',
        }),
      ]);
    }
    expect((await h.db.query('SELECT * FROM projects WHERE id = $1', [id])).rows).toEqual(before);
    expect(await seriesOf(id)).toMatchObject({ program_id: world.a1.program });
    expect(await audit(id, 'project.configure')).toEqual([]);
  });
});

describe('a session beside its series', () => {
  /** One more session of the project's series, as a later year of the same project. */
  async function sibling(projectId: string, year: number, over: Record<string, unknown> = {}) {
    const { rows } = await h.db.query(
      `SELECT program_id, series_id, code, name_bn, name_en, workflow_definition_id FROM projects WHERE id = $1`,
      [projectId],
    );
    return f.projectRow(h.db, {
      id: randomUUID(),
      ...rows[0],
      year,
      workflow_version: 1,
      ...over,
    });
  }
  const stored = async (id: string) =>
    (
      await h.db.query(
        `SELECT program_id, year, name_bn, status, period_from::text, period_to::text FROM projects WHERE id = $1`,
        [id],
      )
    ).rows[0];

  it('changes the period of a draft by its two months, and leaves it alone when they come back unchanged', async () => {
    const pm = await as(world.users.pm);
    const id = (await draft(pm, world.a1.program)).body.data.id as string;
    // July to June of the next year: the year stays the year it starts in
    const moved = await patch(pm, id, (await get(pm, id)).headers.etag, {
      periodFrom: '2026-07',
      periodTo: '2027-06',
    });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({
      year: 2026,
      periodFrom: '2026-07',
      periodTo: '2027-06',
      sessionLabel: '2026-27',
    });
    const months = { period_from: '2026-07-01', period_to: '2027-06-30', year: 2026 };
    expect(await stored(id)).toMatchObject(months);
    // the same months with another change: no change of the period
    const same = await patch(pm, id, moved.headers.etag, {
      periodFrom: '2026-07',
      periodTo: '2027-06',
      perVolunteerLimit: 30,
    });
    expect(same.status).toBe(200);
    expect(await stored(id)).toMatchObject(months);
    const entries = await audit(id, 'project.configure');
    expect(entries.at(-1)?.new).toEqual({ perVolunteerLimit: 30 });
    // one month alone says no period, and the rules of a period hold
    expect((await patch(pm, id, same.headers.etag, { periodFrom: '2026-08' })).status).toBe(422);
    expect(
      (await patch(pm, id, same.headers.etag, { periodFrom: '2026-08', periodTo: '2026-07' }))
        .status,
    ).toBe(422);
    expect(await stored(id)).toMatchObject(months);
  });

  it('refuses a period that starts in a year another session of the series starts in', async () => {
    const pm = await as(world.users.pm);
    const id = (await draft(pm, world.a1.program)).body.data.id as string;
    const next = await sibling(id, 2027);
    const etag = (await get(pm, id)).headers.etag;
    const taken = await patch(pm, id, etag, { periodFrom: '2027-06', periodTo: '2028-05' });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('project.session_year_taken');
    expect(await stored(id)).toMatchObject({
      year: 2026,
      period_from: '2026-01-01',
      period_to: '2026-12-31',
    });
    expect(await stored(next)).toMatchObject({ year: 2027 });
    // a year no session of the series holds is free
    const free = await patch(pm, id, etag, { periodFrom: '2025-04', periodTo: '2026-03' });
    expect(free.status).toBe(200);
    expect(await stored(id)).toMatchObject({
      year: 2025,
      period_from: '2025-04-01',
      period_to: '2026-03-31',
    });
  });

  it('keeps the period of a session once it is active, and takes it back unchanged when closed', async () => {
    const pm = await as(world.users.pm);
    const id = (await draft(pm, world.a1.program)).body.data.id as string;
    await setStatus(id, 'active');
    const active = await patch(pm, id, (await get(pm, id)).headers.etag, {
      periodFrom: '2026-07',
      periodTo: '2027-06',
    });
    expect(active.status).toBe(409);
    expect(active.body.error.code).toBe('project.read_only');
    await setStatus(id, 'closed');
    const current = await get(pm, id);
    const resent = await patch(pm, id, current.headers.etag, {
      periodFrom: current.body.data.periodFrom,
      periodTo: current.body.data.periodTo,
      name: current.body.data.name,
    });
    expect(resent.status).toBe(200);
    expect(await stored(id)).toMatchObject({
      year: 2026,
      period_from: '2026-01-01',
      period_to: '2026-12-31',
      status: 'closed',
    });
  });

  it('renames the series with its one session, and refuses a rename of one session beside another', async () => {
    const pm = await as(world.users.pm);
    const id = (await draft(pm, world.a1.program)).body.data.id as string;
    const first = await patch(pm, id, (await get(pm, id)).headers.etag, {
      name: { bn: 'একাই', en: 'Alone' },
    });
    expect(first.status).toBe(200);
    expect(await seriesOf(id)).toMatchObject({ name_bn: 'একাই', name_en: 'Alone' });

    const next = await sibling(id, 2027);
    const second = await patch(pm, id, first.headers.etag, {
      name: { bn: 'দুইয়ের একটি', en: 'One of two' },
    });
    // a session carries the names of its series: it is renamed through the series, with the others
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('project.read_only');
    expect(await stored(id)).toMatchObject({ name_bn: 'একাই' });
    expect(await seriesOf(id)).toMatchObject({ name_bn: 'একাই', name_en: 'Alone' });
    expect(await stored(next)).toMatchObject({ name_bn: 'একাই' });
    // the name sent back as it is changes nothing and is no rename
    const same = await patch(pm, id, first.headers.etag, {
      name: { bn: 'একাই', en: 'Alone' },
      perVolunteerLimit: 25,
    });
    expect(same.status).toBe(200);
  });
});

describe('cancelling a draft', () => {
  it('cancels a draft with a reason, which leaves the list but stays in the audit log', async () => {
    const pm = await as(world.users.pm);
    const created = await draft(pm, world.a1.program);
    const id = created.body.data.id as string;
    expect(
      (await api().post(`/api/v1/projects/${id}/cancel`).set(bearer(pm)).send({})).status,
    ).toBe(422);
    const res = await api()
      .post(`/api/v1/projects/${id}/cancel`)
      .set(bearer(pm))
      .send({ reason: 'ভুল করে তৈরি' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    const list = await api().get('/api/v1/projects').set(bearer(pm)).query({ limit: 100 });
    expect(list.body.data.map((p: { id: string }) => p.id)).not.toContain(id);
    const cancelled = await api()
      .get('/api/v1/projects')
      .set(bearer(pm))
      .query({ status: 'cancelled', limit: 100 });
    expect(cancelled.body.data.map((p: { id: string }) => p.id)).toContain(id);
    expect((await audit(id, 'project.cancel'))[0]?.reason).toBe('ভুল করে তৈরি');
  });

  it('never cancels a project that was activated', async () => {
    const pm = await as(world.users.pm);
    const created = await draft(pm, world.a1.program);
    await setStatus(created.body.data.id, 'active');
    const res = await api()
      .post(`/api/v1/projects/${created.body.data.id}/cancel`)
      .set(bearer(pm))
      .send({ reason: 'আর দরকার নেই' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('workflow.transition_not_allowed');
  });

  it('refuses the PM of another program and a volunteer', async () => {
    const pm = await as(world.users.pm);
    const created = await draft(pm, world.a1.program);
    const cancel = (s: Session) =>
      api()
        .post(`/api/v1/projects/${created.body.data.id}/cancel`)
        .set(bearer(s))
        .send({ reason: 'ভুল করে তৈরি' });
    const other = await login(h, await account(h.db, { role: 'program_manager' }));
    expect((await cancel(other)).status).toBe(404);
    expect((await cancel(await as(world.users.general))).status).toBe(403);
  });
});

describe('who sees which project', () => {
  it('shows the PM its program, the RPM its areas and the Department Head everything', async () => {
    const ids = async (s: Session) =>
      (await api().get('/api/v1/projects').set(bearer(s)).query({ limit: 100 })).body.data.map(
        (p: { id: string }) => p.id,
      ) as string[];
    const pm = await ids(await as(world.users.pm));
    expect(pm).toEqual(expect.arrayContaining([world.a1.id, world.a2.id]));
    expect(pm).not.toContain(world.b1.id);
    const rpm = await ids(await as(world.users.rpmDhaka));
    expect(rpm).toContain(world.a1.id);
    expect(rpm).not.toContain(world.b1.id);
    const head = await ids(await as(world.users.head));
    expect(head).toEqual(expect.arrayContaining([world.a1.id, world.a2.id, world.b1.id]));
    const byProgram = await api()
      .get('/api/v1/projects')
      .set(bearer(await as(world.users.head)))
      .query({ programId: world.b1.program });
    expect(byProgram.body.data.map((p: { id: string }) => p.id)).toEqual([world.b1.id]);
  });

  it('shows a volunteer only active projects it is on, and only their work facts', async () => {
    const volunteer = await as(world.users.general);
    const pm = await as(world.users.pm);
    const created = await draft(pm, world.a1.program);
    // a draft is never found by a volunteer, even by id
    expect((await get(volunteer, created.body.data.id)).status).toBe(404);
    expect((await get(volunteer, world.a1.id)).status).toBe(404);
    const before = await api().get('/api/v1/projects').set(bearer(volunteer));
    expect(before.body.data).toEqual([]);

    // the volunteer is on A1 and A2 only: an active B1 stays out of its reach
    await setStatus(world.a1.id, 'active');
    await setStatus(world.b1.id, 'active');
    try {
      const after = await api().get('/api/v1/projects').set(bearer(volunteer));
      expect(after.body.data.map((p: { id: string }) => p.id)).toEqual([world.a1.id]);
      expect((await get(volunteer, world.b1.id)).status).toBe(404);
      const one = await get(volunteer, world.a1.id);
      expect(one.status).toBe(200);
      for (const key of [
        'costPerBeneficiary',
        'targetBeneficiaries',
        'budgetPlanned',
        'programId',
        'seriesId',
      ])
        expect(one.body.data, key).not.toHaveProperty(key);
      // which session it is, is a work fact
      expect(one.body.data).toMatchObject({
        periodFrom: '2026-01',
        periodTo: '2026-12',
        sessionLabel: '2026',
      });
    } finally {
      await setStatus(world.a1.id, 'draft');
      await setStatus(world.b1.id, 'draft');
    }
  });

  it('shows the budget amounts only to a caller with budget.view on the project', async () => {
    const amounts = ['costPerBeneficiary', 'targetBeneficiaries', 'budgetPlanned'];
    const media = await as(
      await (async () => {
        const a = await account(h.db, { kind: 'staff', role: 'media_team' });
        accounts.set(a.id, a);
        return a.id;
      })(),
    );
    const finance = await as(
      await (async () => {
        const a = await account(h.db, { kind: 'staff', role: 'finance_team' });
        accounts.set(a.id, a);
        return a.id;
      })(),
    );
    // the Media Team reads every project (project.view at GLOBAL) but holds no budget.view
    const one = await get(media, world.a1.id);
    expect(one.status).toBe(200);
    for (const key of amounts) expect(one.body.data, key).not.toHaveProperty(key);
    const list = await api().get('/api/v1/projects').set(bearer(media)).query({ limit: 100 });
    const row = list.body.data.find((p: { id: string }) => p.id === world.a1.id);
    expect(row).toBeDefined();
    for (const key of amounts) expect(row, key).not.toHaveProperty(key);
    // the PM of the program and the Finance Team see them
    for (const s of [await as(world.users.pm), finance]) {
      const seen = await get(s, world.a1.id);
      for (const key of amounts) expect(seen.body.data, key).toHaveProperty(key);
    }
    // the RPM of Dhaka sees them on its own project, not on another program's
    const rpm = await as(world.users.rpmDhaka);
    for (const key of amounts) expect((await get(rpm, world.a1.id)).body.data).toHaveProperty(key);
  });

  it('lists the sessions of one series, each with its label', async () => {
    const pm = await as(world.users.pm);
    const first = await draft(pm, world.a1.program);
    const seriesId = first.body.data.seriesId as string;
    const second = await create(pm, {
      seriesId,
      periodFrom: '2027-06',
      periodTo: '2028-07',
      source: WORKFLOW,
    });
    expect(second.status).toBe(201);
    await draft(pm, world.a1.program);
    const list = await api()
      .get('/api/v1/projects')
      .set(bearer(pm))
      .query({ seriesId, limit: 100 });
    expect(list.status).toBe(200);
    // newest first
    expect(
      list.body.data.map((p: { id: string; sessionLabel: string; seriesId: string }) => [
        p.id,
        p.sessionLabel,
        p.seriesId,
      ]),
    ).toEqual([
      [second.body.data.id, '2027-28', seriesId],
      [first.body.data.id, '2026', seriesId],
    ]);
    // a series the caller's scope holds nothing of gives an empty list, and a bad id is refused
    const rpm = await api()
      .get('/api/v1/projects')
      .set(bearer(await as(world.users.rpmRangpur)))
      .query({ seriesId });
    expect(rpm.body.data).toEqual([]);
    expect(
      (await api().get('/api/v1/projects').set(bearer(pm)).query({ seriesId: 'x' })).status,
    ).toBe(422);
  });

  it('answers 401 without a sign-in and 404 for a project that does not exist', async () => {
    expect((await api().get('/api/v1/projects')).status).toBe(401);
    expect((await api().get(`/api/v1/projects/${randomUUID()}`)).status).toBe(401);
    const head = await as(world.users.head);
    expect((await get(head, randomUUID())).status).toBe(404);
  });
});
