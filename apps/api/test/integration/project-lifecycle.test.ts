import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedFormTemplates } from '../../seed/sets/base/forms';
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
import { publishedForm } from './support/forms';
import { notificationsOf } from './support/notifications';

// The life of a project: activation of a complete draft, the deadline extension, the two-step
// close with the workflow's close guards, and the reopen.
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
  const ctx = new SeedContext(h.db);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
  await seedFormTemplates(ctx);
});
afterAll(async () => h.close());

let n = 0;
const code = () => {
  n += 1;
  const letter = (v: number) => String.fromCharCode(65 + (Math.floor(v) % 26));
  return `L${letter(n / 676)}${letter(n / 26)}${letter(n)}`;
};
const at = (s: Session, path: string) => api().post(`/api/v1${path}`).set(bearer(s));
const etag = async (s: Session, id: string) =>
  String((await api().get(`/api/v1/projects/${id}`).set(bearer(s))).headers.etag);
async function audit(entityId: string, action: string) {
  const { rows } = await h.db.query<{ old: unknown; new: unknown; reason: string | null }>(
    'SELECT old, new, reason FROM audit_log WHERE entity_id = $1 AND action = $2 ORDER BY created_at',
    [entityId, action],
  );
  return rows;
}

/** A draft of the PM's program, made through the API; `complete` fills every activation item. */
async function draft(complete: boolean, fundTotal = '100000.00') {
  const pm = await as(world.users.pm);
  const created = await at(pm, '/projects').send({
    programId: world.a1.program,
    code: code(),
    year: 2026,
    name: { bn: 'শীতবস্ত্র', en: 'Winter' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(created.status).toBe(201);
  const id = created.body.data.id as string;
  if (!complete) return id;
  const basics = await api()
    .patch(`/api/v1/projects/${id}`)
    .set(bearer(pm))
    .set('If-Match', String(created.headers.etag))
    .send({
      applyFrom: '2026-11-01',
      applyTo: '2026-12-31',
      perVolunteerLimit: 50,
      costPerBeneficiary: '1000.00',
      targetBeneficiaries: 100,
    });
  expect(basics.status).toBe(200);
  const funds = await api()
    .patch(`/api/v1/projects/${id}/fund-sources`)
    .set(bearer(pm))
    .send({ fundSources: [{ source: 'zakat', amount: fundTotal }] });
  expect(funds.status).toBe(200);
  const area = await at(pm, `/projects/${id}/areas`).send({
    locationId: world.dhaka.division,
    rpmUserId: world.users.rpmDhaka,
  });
  expect(area.status).toBe(201);
  const components = await api().get(`/api/v1/projects/${id}/components`).set(bearer(pm));
  const distribution = components.body.data.find(
    (c: { componentKey: string }) => c.componentKey === 'distribution',
  );
  const photo = await api()
    .patch(`/api/v1/projects/${id}/components/distribution`)
    .set(bearer(pm))
    .set('If-Match', distribution.etag)
    .send({ settings: { ...distribution.settings, rule: 'group' } });
  expect(photo.status).toBe(200);
  const text = (bn: string) => ({ bn, en: `${bn} (en)` });
  const rules = await api()
    .put(`/api/v1/projects/${id}/rules`)
    .set(bearer(pm))
    .send({
      volunteer_duties: text('দায়িত্ব'),
      implementation_process: text('প্রক্রিয়া'),
      misconduct: text('অনিয়ম'),
    });
  expect(rules.status).toBe(200);
  await publishedForm(h, pm, id);
  return id;
}
async function activated() {
  const id = await draft(true);
  const pm = await as(world.users.pm);
  const res = await at(pm, `/projects/${id}/activate`).set('If-Match', await etag(pm, id));
  expect(res.status).toBe(200);
  return id;
}

describe('activation', () => {
  it('refuses an incomplete draft with the list of what is missing', async () => {
    const pm = await as(world.users.pm);
    const id = await draft(false);
    const res = await at(pm, `/projects/${id}/activate`).set('If-Match', await etag(pm, id));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('workflow.guard.project_setup_complete');
    const paths = (res.body.error.details as { path: string }[]).map((d) => d.path);
    expect(paths).toEqual(
      expect.arrayContaining(['window', 'limit', 'cost', 'target', 'fund_sources', 'area']),
    );
    expect(paths).toContain('photo_rule');
  });

  it('needs a published application form before it activates', async () => {
    const pm = await as(world.users.pm);
    // everything but the form
    const id = await draft(false);
    const created = await api().get(`/api/v1/projects/${id}`).set(bearer(pm));
    await api()
      .patch(`/api/v1/projects/${id}`)
      .set(bearer(pm))
      .set('If-Match', String(created.headers.etag))
      .send({
        applyFrom: '2026-11-01',
        applyTo: '2026-12-31',
        perVolunteerLimit: 50,
        costPerBeneficiary: '1000.00',
        targetBeneficiaries: 100,
      });
    await api()
      .patch(`/api/v1/projects/${id}/fund-sources`)
      .set(bearer(pm))
      .send({ fundSources: [{ source: 'zakat', amount: '100000.00' }] });
    await at(pm, `/projects/${id}/areas`).send({
      locationId: world.dhaka.division,
      rpmUserId: world.users.rpmDhaka,
    });
    const components = await api().get(`/api/v1/projects/${id}/components`).set(bearer(pm));
    const distribution = components.body.data.find(
      (c: { componentKey: string }) => c.componentKey === 'distribution',
    );
    await api()
      .patch(`/api/v1/projects/${id}/components/distribution`)
      .set(bearer(pm))
      .set('If-Match', distribution.etag)
      .send({ settings: { ...distribution.settings, rule: 'group' } });
    const text = (bn: string) => ({ bn, en: `${bn} (en)` });
    await api()
      .put(`/api/v1/projects/${id}/rules`)
      .set(bearer(pm))
      .send({
        volunteer_duties: text('দায়িত্ব'),
        implementation_process: text('প্রক্রিয়া'),
        misconduct: text('অনিয়ম'),
      });
    const refused = await at(pm, `/projects/${id}/activate`).set('If-Match', await etag(pm, id));
    expect(refused.status).toBe(409);
    expect(refused.body.error.details).toEqual([
      expect.objectContaining({ path: 'form', code: 'validation.required' }),
    ]);
    // a draft form is not enough; the published one is
    const made = await at(pm, `/projects/${id}/forms`).send({
      key: 'default',
      title: { bn: 'আবেদন', en: 'Application' },
      source: { kind: 'template', templateKey: 'form_distribution' },
    });
    expect(made.status).toBe(201);
    const still = await at(pm, `/projects/${id}/activate`).set('If-Match', await etag(pm, id));
    expect(still.status).toBe(409);
    const read = await api()
      .get(`/api/v1/form-versions/${made.body.data.draftVersionId}`)
      .set(bearer(pm));
    const published = await at(pm, `/form-versions/${made.body.data.draftVersionId}/publish`).set(
      'If-Match',
      read.headers.etag as string,
    );
    expect(published.status).toBe(200);
    const res = await at(pm, `/projects/${id}/activate`).set('If-Match', await etag(pm, id));
    expect(res.status).toBe(200);
  });

  it('activates a complete draft and stores the workflow snapshot', async () => {
    const pm = await as(world.users.pm);
    const id = await draft(true);
    const res = await at(pm, `/projects/${id}/activate`).set('If-Match', await etag(pm, id));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.activatedAt).not.toBeNull();
    const { rows } = await h.db.query<{ snapshot: { template: string } }>(
      'SELECT workflow_snapshot AS snapshot FROM projects WHERE id = $1',
      [id],
    );
    expect(rows[0]!.snapshot.template).toBe('distribution');
    const [entry] = await audit(id, 'project.activate');
    expect(entry).toMatchObject({ old: { status: 'draft' }, new: { status: 'active' } });
    // the RPMs of the areas are told, with the project to open
    const { rows: areaRpms } = await h.db.query<{ rpm_user_id: string }>(
      'SELECT rpm_user_id FROM project_areas WHERE project_id = $1',
      [id],
    );
    expect(areaRpms.length).toBeGreaterThan(0);
    for (const { rpm_user_id } of areaRpms)
      expect(
        (await notificationsOf(h.db, 'project_activated', rpm_user_id)).map(
          (n) => n.params.projectId,
        ),
      ).toContain(id);
    // a second activation finds the project active
    const again = await at(pm, `/projects/${id}/activate`).set('If-Match', await etag(pm, id));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('workflow.transition_not_allowed');
  });

  it('blocks activation while the fund sources are one taka short of the budget', async () => {
    const pm = await as(world.users.pm);
    const id = await draft(true, '99999.00');
    const res = await at(pm, `/projects/${id}/activate`).set('If-Match', await etag(pm, id));
    expect(res.status).toBe(409);
    expect((res.body.error.details as { path: string }[]).map((d) => d.path)).toEqual([
      'fund_sources_total',
    ]);
  });

  it('lets one of two activations at the same moment win', async () => {
    const pm = await as(world.users.pm);
    const id = await draft(true);
    const tag = await etag(pm, id);
    const both = await Promise.all([
      at(pm, `/projects/${id}/activate`).set('If-Match', tag),
      at(pm, `/projects/${id}/activate`).set('If-Match', tag),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await audit(id, 'project.activate')).toHaveLength(1);
  });

  it('refuses a stale ETag', async () => {
    const pm = await as(world.users.pm);
    const id = await draft(true);
    const res = await at(pm, `/projects/${id}/activate`).set('If-Match', '"stale"');
    expect(res.status).toBe(412);
  });
});

describe('the deadline extension', () => {
  it('moves the end date later with a reason, and refuses an earlier date, no reason and a draft', async () => {
    const pm = await as(world.users.pm);
    const id = await activated();
    const extend = async (body: Record<string, unknown>) =>
      at(pm, `/projects/${id}/extend-deadline`)
        .set('If-Match', await etag(pm, id))
        .send(body);
    const later = await extend({ newApplyTo: '2027-01-15', reason: 'শীত বেশি' });
    expect(later.status).toBe(200);
    expect(later.body.data.applyTo).toBe('2027-01-15');
    const { rows: areaRpms } = await h.db.query<{ rpm_user_id: string }>(
      'SELECT rpm_user_id FROM project_areas WHERE project_id = $1',
      [id],
    );
    expect(areaRpms.length).toBeGreaterThan(0);
    const told = await notificationsOf(h.db, 'deadline_extended', areaRpms[0]!.rpm_user_id);
    expect(told.find((n) => n.params.projectId === id)?.params.new_date).toBe('15-01-2027');
    const [entry] = await audit(id, 'project.deadline_extend');
    expect(entry).toMatchObject({
      old: { applyTo: '2026-12-31' },
      new: { applyTo: '2027-01-15' },
      reason: 'শীত বেশি',
    });
    const earlier = await extend({ newApplyTo: '2027-01-15', reason: 'আবার' });
    expect(earlier.status).toBe(409);
    expect(earlier.body.error.code).toBe('project.deadline_not_later');
    expect((await extend({ newApplyTo: '2027-02-01' })).status).toBe(422);
    // nor once the project is closing or closed
    for (const status of ['closing', 'closed']) {
      await h.db.query('UPDATE projects SET status = $1 WHERE id = $2', [status, id]);
      const refused = await extend({ newApplyTo: '2027-03-01', reason: 'আরও সময়' });
      expect(refused.status, status).toBe(409);
      expect(refused.body.error.code).toBe('workflow.transition_not_allowed');
    }
    const { rows } = await h.db.query<{ applyTo: string }>(
      'SELECT to_char(apply_to, \'YYYY-MM-DD\') AS "applyTo" FROM projects WHERE id = $1',
      [id],
    );
    expect(rows[0]!.applyTo).toBe('2027-01-15');
    const plain = await draft(false);
    const onDraft = await at(pm, `/projects/${plain}/extend-deadline`)
      .set('If-Match', await etag(pm, plain))
      .send({ newApplyTo: '2027-02-01', reason: 'খসড়া' });
    expect(onDraft.status).toBe(409);
  });
});

describe('closing and reopening', () => {
  it('closes in two steps with a reason each, and reopens from closing and from closed', async () => {
    const pm = await as(world.users.pm);
    const id = await activated();
    const act = async (path: string, body: Record<string, unknown> = { reason: 'কাজ শেষ' }) =>
      at(pm, `/projects/${id}/${path}`)
        .set('If-Match', await etag(pm, id))
        .send(body);
    // close straight from active skips closing
    expect((await act('close')).status).toBe(409);
    expect((await act('start-closing', {})).status).toBe(422);
    const closing = await act('start-closing');
    expect(closing.status).toBe(200);
    expect(closing.body.data.status).toBe('closing');
    const reopened = await act('reopen', { reason: 'আরও বিতরণ' });
    expect(reopened.body.data.status).toBe('active');
    await act('start-closing');
    expect((await act('close', {})).status).toBe(422);
    // the distribution workflow's stock guard belongs to a module not built yet, so it passes
    const closed = await act('close');
    expect(closed.status).toBe(200);
    expect(closed.body.data).toMatchObject({ status: 'closed' });
    expect(closed.body.data.closedAt).not.toBeNull();
    const back = await act('reopen', { reason: 'ভুল করে বন্ধ' });
    expect(back.status).toBe(200);
    expect(back.body.data).toMatchObject({ status: 'active', closedAt: null });
    expect((await audit(id, 'project.reopen')).map((e) => e.reason)).toEqual([
      'আরও বিতরণ',
      'ভুল করে বন্ধ',
    ]);
    expect(await audit(id, 'project.closing')).toHaveLength(2);
    expect(await audit(id, 'project.close')).toHaveLength(1);
  });

  it('refuses to reopen a draft', async () => {
    const pm = await as(world.users.pm);
    const id = await draft(false);
    const res = await at(pm, `/projects/${id}/reopen`)
      .set('If-Match', await etag(pm, id))
      .send({ reason: 'খসড়া' });
    expect(res.status).toBe(409);
  });

  it('fails the close on a guard it does not know', async () => {
    const pm = await as(world.users.pm);
    const id = await activated();
    await h.db.query(
      `UPDATE projects SET workflow_snapshot = jsonb_set(workflow_snapshot, '{project_close_guards}', '["stock.balanced", "unknown.guard"]')
       WHERE id = $1`,
      [id],
    );
    await at(pm, `/projects/${id}/start-closing`)
      .set('If-Match', await etag(pm, id))
      .send({ reason: 'কাজ শেষ' });
    const res = await at(pm, `/projects/${id}/close`)
      .set('If-Match', await etag(pm, id))
      .send({ reason: 'কাজ শেষ' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('workflow.guard.template_project_close_guards');
    expect(res.body.error.details).toMatchObject([
      { path: 'unknown.guard', code: 'workflow.guard.template_project_close_guards' },
    ]);
  });
});

describe('an inactive program', () => {
  it('takes no reopened or activated project, and a close without a snapshot fails', async () => {
    let pm = await as(world.users.pm);
    const id = await activated();
    const pending = await draft(true);
    for (const path of ['start-closing', 'close'])
      await at(pm, `/projects/${id}/${path}`)
        .set('If-Match', await etag(pm, id))
        .send({ reason: 'কাজ শেষ' });
    // the program is switched off directly; the API itself refuses that while a project is open
    await h.db.query('UPDATE programs SET active = false WHERE id = $1', [world.a1.program]);
    try {
      const reopen = await at(pm, `/projects/${id}/reopen`)
        .set('If-Match', await etag(pm, id))
        .send({ reason: 'আবার' });
      expect(reopen.status).toBe(409);
      expect(reopen.body.error.code).toBe('program.inactive');
      const activate = await at(pm, `/projects/${pending}/activate`).set(
        'If-Match',
        await etag(pm, pending),
      );
      expect(activate.status).toBe(409);
      expect(activate.body.error.code).toBe('program.inactive');
    } finally {
      await h.db.query('UPDATE programs SET active = true WHERE id = $1', [world.a1.program]);
    }

    const bare = await activated();
    await h.db.query('UPDATE projects SET workflow_snapshot = NULL WHERE id = $1', [bare]);
    // each helper signs in anew, which may retire an older session of the same account
    pm = await as(world.users.pm);
    await at(pm, `/projects/${bare}/start-closing`)
      .set('If-Match', await etag(pm, bare))
      .send({ reason: 'কাজ শেষ' });
    const close = await at(pm, `/projects/${bare}/close`)
      .set('If-Match', await etag(pm, bare))
      .send({ reason: 'কাজ শেষ' });
    expect(close.status).toBe(409);
    expect(close.body.error.code).toBe('workflow.guard.template_project_close_guards');
  });
});

describe('who may move a project', () => {
  it('refuses the PM of another program and an RPM, and lets the global roles act', async () => {
    const id = await activated();
    const other = await account(h.db, { role: 'program_manager' });
    const otherSession = await login(h, other);
    const rpm = await as(world.users.rpmDhaka);
    const pm = await as(world.users.pm);
    const tag = await etag(pm, id);
    for (const path of ['start-closing', 'close', 'reopen', 'extend-deadline']) {
      const body = { reason: 'চেষ্টা', newApplyTo: '2027-03-01' };
      const send = (s: Session) =>
        at(s, `/projects/${id}/${path}`)
          .set('If-Match', tag)
          .send(path === 'extend-deadline' ? body : { reason: body.reason });
      expect((await send(otherSession)).status, path).toBe(404);
      expect((await send(rpm)).status, path).toBe(403);
    }
    const draftId = await draft(true);
    expect(
      (await at(otherSession, `/projects/${draftId}/activate`).set('If-Match', tag)).status,
    ).toBe(404);
    expect((await at(rpm, `/projects/${draftId}/activate`).set('If-Match', tag)).status).toBe(403);
    const head = await as(world.users.head);
    const byHead = await at(head, `/projects/${id}/start-closing`)
      .set('If-Match', await etag(head, id))
      .send({ reason: 'প্রধানের সিদ্ধান্ত' });
    expect(byHead.status).toBe(200);
    const monitoring = await as(world.users.monitoring);
    const byMonitoring = await at(monitoring, `/projects/${id}/reopen`)
      .set('If-Match', await etag(monitoring, id))
      .send({ reason: 'মনিটরিং' });
    expect(byMonitoring.status).toBe(200);
  });
});
