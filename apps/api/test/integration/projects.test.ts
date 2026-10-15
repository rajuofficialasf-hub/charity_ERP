import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists';
import { seedWorkflows } from '../../seed/sets/base/workflows';
import { accessWorld } from './support/access-fixtures';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';
import * as f from './support/fixtures';

// Projects: created from a workflow as drafts, read in scope, updated as their state allows and
// cancelled while never activated (plan docs/plans/2026-10-15-1440-feat-program-project-setup-plan.md).
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
  const ctx = new SeedContext(h.db);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
});
afterAll(async () => h.close());

let n = 0;
/** A project code of capital letters that no other test uses. */
const code = () => {
  n += 1;
  const letters = (v: number) => String.fromCharCode(65 + (v % 26));
  const r = Math.floor(Math.random() * 26 * 26 * 26);
  return `N${letters(n)}${letters(Math.floor(n / 26))}${letters(r)}${letters(r / 26)}${letters(r / 676)}`;
};
const name = { bn: 'শীতবস্ত্র নমুনা', en: 'Winter sample' };

const create = (s: Session, body: Record<string, unknown>) =>
  api().post('/api/v1/projects').set(bearer(s)).send(body);
const draft = (s: Session, programId: string, workflowKey = 'distribution') =>
  create(s, {
    programId,
    code: code(),
    year: 2026,
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
    expect(p).toMatchObject({ status: 'draft', workflowKey: 'distribution', year: 2026, name });
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
  });

  it('refuses another program, an RPM, a taken code, an unknown workflow and an inactive program', async () => {
    const pm = await as(world.users.pm);
    expect((await draft(pm, world.b1.program)).status).toBe(403);
    const rpm = await as(world.users.rpmDhaka);
    expect((await draft(rpm, world.a1.program)).status).toBe(403);

    const first = await draft(pm, world.a1.program);
    const taken = await create(pm, {
      programId: world.a1.program,
      code: first.body.data.code,
      year: 2026,
      name,
      source: { kind: 'workflow', workflowKey: 'distribution' },
    });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('project.code_taken');
    expect((await draft(pm, world.a1.program, 'unknown_flow')).status).toBe(422);

    const head = await as(world.users.head);
    const program = await f.project(h.db);
    await h.db.query('UPDATE programs SET active = false WHERE id = $1', [program.program]);
    const inactive = await draft(head, program.program);
    expect(inactive.status).toBe(409);
    expect(inactive.body.error.code).toBe('program.inactive');
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
      year: 2027,
      perVolunteerLimit: 40,
      costPerBeneficiary: '1000.50',
      targetBeneficiaries: 100,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      year: 2027,
      perVolunteerLimit: 40,
      costPerBeneficiary: '1000.50',
      budgetPlanned: '100050.00',
    });
    const [entry] = await audit(id, 'project.configure');
    expect(entry?.old).toMatchObject({ year: 2026 });
    expect(entry?.new).toMatchObject({ year: 2027, perVolunteerLimit: 40 });
  });

  it('keeps the identity and the end date of an active project, and everything once closing', async () => {
    const pm = await as(world.users.pm);
    const created = await draft(pm, world.a1.program);
    const id = created.body.data.id as string;
    await setStatus(id, 'active');
    let current = await get(pm, id);
    const year = await patch(pm, id, current.headers.etag, { year: 2027 });
    expect(year.status).toBe(409);
    expect(year.body.error.code).toBe('project.read_only');
    expect((await patch(pm, id, current.headers.etag, { applyTo: '2026-12-31' })).status).toBe(409);
    const renamed = await patch(pm, id, current.headers.etag, {
      name: { bn: 'চলমান', en: 'Running' },
      applyFrom: '2026-11-01',
    });
    expect(renamed.status).toBe(200);
    for (const status of ['closing', 'closed']) {
      await setStatus(id, status);
      current = await get(pm, id);
      const res = await patch(pm, id, current.headers.etag, { name });
      expect(res.status, status).toBe(409);
    }
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

  it('moves a draft only into an active program the PM may configure', async () => {
    const pm = await as(world.users.pm);
    const created = await draft(pm, world.a1.program);
    const id = created.body.data.id as string;
    expect(
      (await patch(pm, id, created.headers.etag, { programId: world.b1.program })).status,
    ).toBe(403);
    const second = await f.project(h.db);
    await h.db.query('UPDATE programs SET pm_user_id = $1, active = false WHERE id = $2', [
      world.users.pm,
      second.program,
    ]);
    const res = await patch(pm, id, created.headers.etag, { programId: second.program });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('program.inactive');
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

    await setStatus(world.a1.id, 'active');
    try {
      await h.db.query(
        `UPDATE projects SET cost_per_beneficiary = 1000, target_beneficiaries = 10 WHERE id = $1`,
        [world.a1.id],
      );
      const after = await api().get('/api/v1/projects').set(bearer(volunteer));
      expect(after.body.data.map((p: { id: string }) => p.id)).toEqual([world.a1.id]);
      const one = await get(volunteer, world.a1.id);
      expect(one.status).toBe(200);
      for (const key of ['costPerBeneficiary', 'targetBeneficiaries', 'budgetPlanned', 'programId'])
        expect(one.body.data, key).not.toHaveProperty(key);
    } finally {
      await setStatus(world.a1.id, 'draft');
    }
  });

  it('refuses a sign-in without the permission and no sign-in', async () => {
    expect((await api().get('/api/v1/projects')).status).toBe(401);
    expect((await api().get(`/api/v1/projects/${randomUUID()}`)).status).toBe(401);
    const head = await as(world.users.head);
    expect((await get(head, randomUUID())).status).toBe(404);
  });
});
