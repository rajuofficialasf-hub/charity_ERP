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

// The setup parts of a project, each saved on its own: components, fund sources, areas, staff
// access and the syllabus.
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
  const ctx = new SeedContext(h.container.prisma);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
});
afterAll(async () => h.close());

let n = 0;
const code = () => {
  n += 1;
  const letter = (v: number) => String.fromCharCode(65 + (Math.floor(v) % 26));
  return `S${letter(n / 676)}${letter(n / 26)}${letter(n)}`;
};
async function staff(role: string) {
  const a = await account(h.db, { role });
  accounts.set(a.id, a);
  return { id: a.id, session: await login(h, a) };
}
/** A draft of the PM's program, made through the API. */
async function draft(workflowKey = 'distribution') {
  const res = await api()
    .post('/api/v1/projects')
    .set(bearer(await as(world.users.pm)))
    .send({
      programId: world.a1.program,
      code: code(),
      year: 2026,
      name: { bn: 'নমুনা', en: 'Sample' },
      source: { kind: 'workflow', workflowKey },
    });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}
const setStatus = (id: string, status: string) =>
  h.db.query('UPDATE projects SET status = $1 WHERE id = $2', [status, id]);
async function audit(entityId: string, action: string) {
  const { rows } = await h.db.query<{ old: unknown; new: unknown; reason: string | null }>(
    'SELECT old, new, reason FROM audit_log WHERE entity_id = $1 AND action = $2 ORDER BY created_at',
    [entityId, action],
  );
  return rows;
}
const at = (s: Session, method: 'get' | 'post' | 'patch' | 'put', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));
async function etagOf(s: Session, id: string, componentKey: string) {
  const list = await at(s, 'get', `/projects/${id}/components`);
  return list.body.data.find((c: { componentKey: string }) => c.componentKey === componentKey)
    .etag as string;
}

describe('components', () => {
  it('switches a component and replaces its settings, checked against its schema', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const list = await at(pm, 'get', `/projects/${id}/components`);
    expect(list.status).toBe(200);
    const rating = list.body.data.find(
      (c: { componentKey: string }) => c.componentKey === 'rating_criteria',
    );
    const criteria = (k: number) =>
      Array.from({ length: k }, (_, i) => ({ code: `c${i}`, label: { bn: 'মান', en: 'Quality' } }));
    const ok = await at(pm, 'patch', `/projects/${id}/components/rating_criteria`)
      .set('If-Match', rating.etag)
      .send({ settings: { criteria: criteria(5) } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.settings.criteria).toHaveLength(5);
    const six = await at(pm, 'patch', `/projects/${id}/components/rating_criteria`)
      .set('If-Match', ok.body.data.etag)
      .send({ settings: { criteria: criteria(6) } });
    expect(six.status).toBe(422);
    expect(JSON.stringify(six.body.error.details)).toContain('criteria');
    const unknownKey = await at(pm, 'patch', `/projects/${id}/components/rating_criteria`)
      .set('If-Match', ok.body.data.etag)
      .send({ settings: { criteria: [], extra: 1 } });
    expect(unknownKey.status).toBe(422);
    const stale = await at(pm, 'patch', `/projects/${id}/components/rating_criteria`)
      .set('If-Match', '"stale"')
      .send({ enabled: false });
    expect(stale.status).toBe(412);
    expect(
      (
        await at(pm, 'patch', `/projects/${id}/components/no_such_component`)
          .set('If-Match', rating.etag)
          .send({ enabled: true })
      ).status,
    ).toBe(404);
    expect(await audit(id, 'project.component_change')).toHaveLength(1);
  });

  it('checks empty settings too, and switches the public link on only through its own route', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const empty = await at(pm, 'patch', `/projects/${id}/components/distribution`)
      .set('If-Match', await etagOf(pm, id, 'distribution'))
      .send({ settings: {} });
    expect(empty.status).toBe(422);
    const token = await at(pm, 'patch', `/projects/${id}/components/public_link`)
      .set('If-Match', await etagOf(pm, id, 'public_link'))
      .send({ settings: { enabled: true, token: 'a-token-of-my-own-choice' } });
    expect(token.status).toBe(422);
    expect(token.body.error.code).toBe('public.configure_through_link');
    const on = await at(pm, 'patch', `/projects/${id}/components/public_link`)
      .set('If-Match', await etagOf(pm, id, 'public_link'))
      .send({ enabled: true });
    expect(on.status).toBe(422);
    expect(on.body.error.code).toBe('public.configure_through_link');
    const off = await at(pm, 'patch', `/projects/${id}/components/public_link`)
      .set('If-Match', await etagOf(pm, id, 'public_link'))
      .send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data.settings).toEqual({ enabled: false });
  });

  it('keeps an active project complete: no enabled component without valid settings', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    // activation needs a photo rule, so an active project has one
    await at(pm, 'patch', `/projects/${id}/components/distribution`)
      .set('If-Match', await etagOf(pm, id, 'distribution'))
      .send({ settings: { rule: 'group' } });
    await setStatus(id, 'active');
    const stages = await at(pm, 'patch', `/projects/${id}/components/stages`)
      .set('If-Match', await etagOf(pm, id, 'stages'))
      .send({ enabled: true, settings: {} });
    // the settings fail their schema before the completeness rule is reached
    expect(stages.status).toBe(422);
  });

  it('refuses component writes to a volunteer and to the PM of another program', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const etag = await etagOf(pm, id, 'dawah');
    const volunteer = await as(world.users.general);
    expect(
      (
        await at(volunteer, 'patch', `/projects/${id}/components/dawah`)
          .set('If-Match', etag)
          .send({ enabled: true })
      ).status,
    ).toBe(403);
    const other = await staff('program_manager');
    expect(
      (
        await at(other.session, 'patch', `/projects/${id}/components/dawah`)
          .set('If-Match', etag)
          .send({ enabled: true })
      ).status,
    ).toBe(404);
  });

  it('keeps the project dawah flag with the dawah component', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const list = await at(pm, 'get', `/projects/${id}/components`);
    const dawah = list.body.data.find((c: { componentKey: string }) => c.componentKey === 'dawah');
    const on = await at(pm, 'patch', `/projects/${id}/components/dawah`)
      .set('If-Match', dawah.etag)
      .send({ enabled: true });
    expect(on.status).toBe(200);
    const project = await at(pm, 'get', `/projects/${id}`);
    expect(project.body.data.dawahEnabled).toBe(true);
    const off = await at(pm, 'patch', `/projects/${id}/components/dawah`)
      .set('If-Match', on.body.data.etag)
      .send({ enabled: false });
    expect(off.status).toBe(200);
    expect((await at(pm, 'get', `/projects/${id}`)).body.data.dawahEnabled).toBe(false);
  });

  it('shows a volunteer only the enabled components and the photo rule', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const { rows } = await h.db.query<{ id: string }>(
      'SELECT id FROM volunteers WHERE user_id = $1',
      [world.users.general],
    );
    await h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, assigned_by, consent_status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'application_distribution', $4, 'accepted')`,
      [id, rows[0]!.id, world.dhaka.division, world.users.pm],
    );
    await setStatus(id, 'active');
    const volunteer = await as(world.users.general);
    const res = await at(volunteer, 'get', `/projects/${id}/components`);
    expect(res.status).toBe(200);
    const seen = res.body.data as { componentKey: string; enabled: boolean; settings?: unknown }[];
    expect(seen.length).toBeGreaterThan(0);
    for (const c of seen) {
      expect(c.enabled, c.componentKey).toBe(true);
      if (c.componentKey !== 'distribution')
        expect(c, c.componentKey).not.toHaveProperty('settings');
    }
    const all = (await at(pm, 'get', `/projects/${id}/components`)).body.data;
    expect(all.length).toBeGreaterThan(seen.length);
  });
});

describe('fund sources', () => {
  it('replaces the list, audits it and refuses a nameless donor and a negative amount', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const res = await at(pm, 'patch', `/projects/${id}/fund-sources`).send({
      fundSources: [
        { source: 'zakat', amount: '60000.00' },
        { source: 'donor', label: 'নমুনা দাতা', amount: '40000.00' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const [entry] = await audit(id, 'project.fund_source_change');
    expect(entry?.new).toMatchObject({ fundSources: [{ source: 'zakat' }, { source: 'donor' }] });
    expect(
      (
        await at(pm, 'patch', `/projects/${id}/fund-sources`).send({
          fundSources: [{ source: 'donor', amount: '1.00' }],
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await at(pm, 'patch', `/projects/${id}/fund-sources`).send({
          fundSources: [{ source: 'zakat', amount: '-5' }],
        })
      ).status,
    ).toBe(422);
    const read = await at(pm, 'get', `/projects/${id}/fund-sources`);
    expect(read.body.data.map((f: { source: string }) => f.source)).toEqual(['zakat', 'donor']);
  });

  it('keeps an active budget and its fund sources equal, saved together', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const current = await at(pm, 'get', `/projects/${id}`);
    await at(pm, 'patch', `/projects/${id}`)
      .set('If-Match', String(current.headers.etag))
      .send({ costPerBeneficiary: '100.00', targetBeneficiaries: 10 });
    // a draft saves them apart, whatever the total
    expect(
      (
        await at(pm, 'patch', `/projects/${id}/fund-sources`).send({
          fundSources: [{ source: 'zakat', amount: '1.00' }],
        })
      ).status,
    ).toBe(200);
    await at(pm, 'patch', `/projects/${id}/fund-sources`).send({
      fundSources: [{ source: 'zakat', amount: '1000.00' }],
    });
    await setStatus(id, 'active');
    const empty = await at(pm, 'patch', `/projects/${id}/fund-sources`).send({ fundSources: [] });
    expect(empty.status).toBe(422);
    expect(empty.body.error.code).toBe('project.budget_mismatch');
    const short = await at(pm, 'patch', `/projects/${id}/fund-sources`).send({
      fundSources: [{ source: 'zakat', amount: '900.00' }],
    });
    expect(short.status).toBe(422);
    expect(short.body.error.code).toBe('project.budget_mismatch');
    const together = await at(pm, 'patch', `/projects/${id}/fund-sources`).send({
      costPerBeneficiary: '90.00',
      targetBeneficiaries: 10,
      fundSources: [{ source: 'zakat', amount: '900.00' }],
    });
    expect(together.status).toBe(200);
    const project = await at(pm, 'get', `/projects/${id}`);
    expect(project.body.data).toMatchObject({
      costPerBeneficiary: '90.00',
      budgetPlanned: '900.00',
    });
    const [entry] = (await audit(id, 'project.fund_source_change')).slice(-1);
    expect(entry?.new).toMatchObject({ costPerBeneficiary: '90.00', targetBeneficiaries: 10 });
    // the project form alone cannot move an active budget away from its fund sources
    const alone = await at(pm, 'patch', `/projects/${id}`)
      .set('If-Match', String(project.headers.etag))
      .send({ targetBeneficiaries: 11 });
    expect(alone.status).toBe(422);
    expect(alone.body.error.code).toBe('project.budget_mismatch');
  });

  it('keeps a fund source by its source and name when the list is replaced', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const ids = async () =>
      (
        await h.db.query<{ id: string; source: string }>(
          'SELECT id, source FROM fund_sources WHERE project_id = $1 ORDER BY source',
          [id],
        )
      ).rows;
    await at(pm, 'patch', `/projects/${id}/fund-sources`).send({
      fundSources: [
        { source: 'zakat', amount: '10.00' },
        { source: 'general', amount: '5.00' },
      ],
    });
    const before = await ids();
    await at(pm, 'patch', `/projects/${id}/fund-sources`).send({
      fundSources: [{ source: 'zakat', amount: '12.00' }],
    });
    expect(await ids()).toEqual(before.filter((f) => f.source === 'zakat'));
  });

  it('shows fund sources only at program level, never to area staff or a volunteer', async () => {
    const executive = await as(world.users.executive);
    expect((await at(executive, 'get', `/projects/${world.a1.id}/fund-sources`)).status).toBe(403);
    const volunteer = await as(world.users.general);
    expect((await at(volunteer, 'get', `/projects/${world.a1.id}/fund-sources`)).status).toBe(403);
    const pm = await as(world.users.pm);
    expect((await at(pm, 'get', `/projects/${world.a1.id}/fund-sources`)).status).toBe(200);
  });
});

describe('areas', () => {
  it('adds an area with its RPM, refuses a wrong RPM, a wrong level and a duplicate, and removes it', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const tree = await f.locationTree(h.db);
    const rpm = await staff('regional_program_manager');
    const added = await at(pm, 'post', `/projects/${id}/areas`).send({
      locationId: tree.division,
      rpmUserId: rpm.id,
    });
    expect(added.status).toBe(201);
    const areaId = added.body.data.find((a: { rpmUserId: string }) => a.rpmUserId === rpm.id).id;
    // a district split among RPMs
    const district = await at(pm, 'post', `/projects/${id}/areas`).send({
      locationId: tree.district,
      rpmUserId: rpm.id,
    });
    expect(district.status).toBe(201);
    const executive = await staff('project_executive');
    const wrongRole = await at(pm, 'post', `/projects/${id}/areas`).send({
      locationId: tree.division,
      rpmUserId: executive.id,
    });
    expect(wrongRole.status).toBe(422);
    expect(wrongRole.body.error.code).toBe('project.rpm_role_required');
    expect(
      (
        await at(pm, 'post', `/projects/${id}/areas`).send({
          locationId: tree.upazila,
          rpmUserId: rpm.id,
        })
      ).status,
    ).toBe(422);
    const twice = await at(pm, 'post', `/projects/${id}/areas`).send({
      locationId: tree.division,
      rpmUserId: rpm.id,
    });
    expect(twice.status).toBe(409);
    const removed = await at(pm, 'post', `/project-areas/${areaId}/remove`).send({});
    expect(removed.status).toBe(204);
    expect(await audit(id, 'project.area_assign')).toHaveLength(3);
  });

  it('lists the areas with their RPMs, and keeps an area while staff still work in it', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const tree = await f.locationTree(h.db);
    const rpm = await staff('regional_program_manager');
    const added = await at(pm, 'post', `/projects/${id}/areas`).send({
      locationId: tree.division,
      rpmUserId: rpm.id,
    });
    const areaId = added.body.data[0].id as string;
    const list = await at(pm, 'get', `/projects/${id}/areas`);
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ rpmUserId: rpm.id, level: 'division' });
    expect(typeof list.body.data[0].rpmName).toBe('string');
    const executive = await staff('project_executive');
    const given = await at(pm, 'post', `/projects/${id}/staff`).send({
      userId: executive.id,
      roleKey: 'project_executive',
      areaLocationId: tree.division,
    });
    expect(given.status).toBe(201);
    const inUse = await at(pm, 'post', `/project-areas/${areaId}/remove`).send({});
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.code).toBe('project.area_in_use');
    const assignment = given.body.data[0].id as string;
    await at(pm, 'post', `/project-staff/${assignment}/end`).send({ reason: 'বদল' });
    expect((await at(pm, 'post', `/project-areas/${areaId}/remove`).send({})).status).toBe(204);
    expect((await at(pm, 'post', `/project-areas/${areaId}/remove`).send({})).status).toBe(404);
  });

  it('keeps the last area of an active project, and refuses outsiders', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const tree = await f.locationTree(h.db);
    const rpm = await staff('regional_program_manager');
    const added = await at(pm, 'post', `/projects/${id}/areas`).send({
      locationId: tree.division,
      rpmUserId: rpm.id,
    });
    await setStatus(id, 'active');
    const last = await at(pm, 'post', `/project-areas/${added.body.data[0].id}/remove`).send({});
    expect(last.status).toBe(422);
    const other = await staff('program_manager');
    expect(
      (await at(other.session, 'post', `/project-areas/${added.body.data[0].id}/remove`).send({}))
        .status,
    ).toBe(404);
    const rangpur = await as(world.users.rpmRangpur);
    expect((await at(rangpur, 'post', `/projects/${id}/areas`).send({})).status).toBe(403);
    const volunteer = await as(world.users.general);
    expect((await at(volunteer, 'get', `/projects/${world.a1.id}/areas`)).status).toBe(403);
  });
});

describe('people to assign', () => {
  it('finds an RPM by name for the PM only, field officials also for an RPM, and names only', async () => {
    const rpm = await staff('regional_program_manager');
    await h.db.query('UPDATE users SET display_name = $1 WHERE id = $2', ['খোঁজার আরপিএম', rpm.id]);
    const executive = await staff('project_executive');
    await h.db.query('UPDATE users SET display_name = $1 WHERE id = $2', [
      'খোঁজার এক্সিকিউটিভ',
      executive.id,
    ]);
    // an RPM who left and one whose role was taken back are not offered
    const gone = await staff('regional_program_manager');
    await h.db.query(
      "UPDATE users SET display_name = 'খোঁজার বিদায়ী', state = 'deactivated' WHERE id = $1",
      [gone.id],
    );
    const revoked = await staff('regional_program_manager');
    await h.db.query("UPDATE users SET display_name = 'খোঁজার প্রত্যাহৃত' WHERE id = $1", [
      revoked.id,
    ]);
    await h.db.query('UPDATE user_roles SET revoked_at = now() WHERE user_id = $1', [revoked.id]);
    const find = (s: Session, query: string) =>
      at(s, 'get', `/projects/${world.a1.id}/candidates?${query}`);
    const pm = await as(world.users.pm);
    const rpms = await find(pm, `role=regional_program_manager&q=${encodeURIComponent('খোঁজার')}`);
    expect(rpms.status).toBe(200);
    expect(rpms.body.data).toEqual([
      { id: rpm.id, displayName: 'খোঁজার আরপিএম', designation: null },
    ]);
    // without a name the picker opens on the role's active officials
    const opened = await find(pm, 'role=regional_program_manager');
    expect(opened.status).toBe(200);
    const openedIds = opened.body.data.map((c: { id: string }) => c.id);
    expect(openedIds).toContain(rpm.id);
    expect(openedIds).not.toContain(gone.id);
    expect(openedIds).not.toContain(revoked.id);
    expect(openedIds).not.toContain(executive.id);
    const dhaka = await as(world.users.rpmDhaka);
    expect(
      (await find(dhaka, `role=regional_program_manager&q=${encodeURIComponent('খোঁজার')}`)).status,
    ).toBe(403);
    const executives = await find(
      dhaka,
      `role=project_executive&q=${encodeURIComponent('খোঁজার')}`,
    );
    expect(executives.status).toBe(200);
    expect(executives.body.data.map((c: { id: string }) => c.id)).toEqual([executive.id]);
    // a wildcard is a letter: no official's name contains "%%"
    const wildcard = await find(pm, `role=project_executive&q=${encodeURIComponent('%%')}`);
    expect(wildcard.body.data).toEqual([]);
    expect((await find(pm, 'role=project_executive&q=x')).status).toBe(422);
    expect((await find(pm, 'role=finance_team&q=abc')).status).toBe(422);
    const volunteer = await as(world.users.general);
    expect((await find(volunteer, 'role=project_executive&q=abc')).status).toBe(403);
    const other = await staff('program_manager');
    expect((await find(other.session, 'role=project_executive&q=abc')).status).toBe(404);
  });
});

describe('staff access', () => {
  it('lets the RPM give view and edit in its own area, never delete, and only to field officials', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const executive = await staff('project_executive');
    const give = (s: Session, body: Record<string, unknown>) =>
      at(s, 'post', `/projects/${world.a1.id}/staff`).send(body);
    const res = await give(rpm, {
      userId: executive.id,
      roleKey: 'project_executive',
      areaLocationId: world.dhaka.division,
      canEdit: true,
    });
    expect(res.status).toBe(201);
    const given = res.body.data.find((s: { userId: string }) => s.userId === executive.id);
    expect(given).toMatchObject({ canView: true, canEdit: true, canDelete: false });
    // a staff access is a permission change of that person, audited on the person and the project
    expect(await audit(executive.id, 'permission_change')).toHaveLength(1);
    const onProject = await audit(world.a1.id, 'permission_change');
    expect(onProject.some((e) => JSON.stringify(e.new).includes(executive.id))).toBe(true);

    const another = await staff('project_executive');
    expect(
      (
        await give(rpm, {
          userId: another.id,
          roleKey: 'project_executive',
          areaLocationId: world.dhaka.division,
          canDelete: true,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await give(rpm, {
          userId: another.id,
          roleKey: 'project_executive',
          areaLocationId: world.rangpur.division,
        })
      ).status,
    ).toBe(403);
    const finance = await staff('finance_team');
    const wrong = await give(rpm, {
      userId: finance.id,
      roleKey: 'project_executive',
      areaLocationId: world.dhaka.division,
    });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe('project.staff_role_required');
    const volunteer = await give(rpm, {
      userId: world.users.general,
      roleKey: 'project_executive',
      areaLocationId: world.dhaka.division,
    });
    expect(volunteer.status).toBe(422);
    // the same person twice
    expect(
      (
        await give(rpm, {
          userId: executive.id,
          roleKey: 'project_executive',
          areaLocationId: world.dhaka.division,
        })
      ).status,
    ).toBe(409);

    // a second RPM of the project cannot end what the first gave in its area
    const rangpur = await as(world.users.rpmRangpur);
    expect(
      (await at(rangpur, 'post', `/project-staff/${given.id}/end`).send({ reason: 'বদল' })).status,
    ).toBe(403);
    // the PM gives delete access and ends any access
    const pm = await as(world.users.pm);
    const full = await give(pm, {
      userId: another.id,
      roleKey: 'project_executive',
      areaLocationId: world.rangpur.division,
      canDelete: true,
    });
    expect(full.status).toBe(201);
    const ended = await at(pm, 'post', `/project-staff/${given.id}/end`).send({ reason: 'বদল' });
    expect(ended.status).toBe(204);
    const after = await at(pm, 'get', `/projects/${world.a1.id}/staff`);
    expect(after.body.data.map((s: { userId: string }) => s.userId)).not.toContain(executive.id);
  });

  it('ends access in any state, once', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const executive = await staff('project_executive');
    const given = await at(pm, 'post', `/projects/${id}/staff`).send({
      userId: executive.id,
      roleKey: 'project_executive',
    });
    expect(given.status).toBe(201);
    await setStatus(id, 'closed');
    const assignment = given.body.data[0].id as string;
    const ended = await at(pm, 'post', `/project-staff/${assignment}/end`).send({ reason: 'শেষ' });
    expect(ended.status).toBe(204);
    const twice = await at(pm, 'post', `/project-staff/${assignment}/end`).send({ reason: 'শেষ' });
    expect(twice.status).toBe(404);
  });

  it('shows an RPM only the staff of its own areas', async () => {
    const pm = await as(world.users.pm);
    const executive = await staff('project_executive');
    const given = await at(pm, 'post', `/projects/${world.a1.id}/staff`).send({
      userId: executive.id,
      roleKey: 'project_executive',
      areaLocationId: world.rangpur.division,
    });
    expect(given.status).toBe(201);
    const dhaka = await as(world.users.rpmDhaka);
    const seen = await at(dhaka, 'get', `/projects/${world.a1.id}/staff`);
    expect(seen.status).toBe(200);
    for (const s of seen.body.data as { areaLocationId: string | null }[])
      expect(s.areaLocationId).toBe(world.dhaka.division);
    const all = await at(pm, 'get', `/projects/${world.a1.id}/staff`);
    expect(all.body.data.map((s: { userId: string }) => s.userId)).toContain(executive.id);
  });

  it('refuses a volunteer the staff list and another program the writes', async () => {
    const volunteer = await as(world.users.general);
    expect((await at(volunteer, 'get', `/projects/${world.a1.id}/staff`)).status).toBe(403);
    const other = await staff('program_manager');
    const executive = await staff('project_executive');
    expect(
      (
        await at(other.session, 'post', `/projects/${world.a1.id}/staff`).send({
          userId: executive.id,
          roleKey: 'project_executive',
        })
      ).status,
    ).toBe(404);
  });
});

describe('the syllabus', () => {
  it('replaces the topics in order, keeps a topic by its id, and is read-only when closed', async () => {
    const pm = await as(world.users.pm);
    const id = await draft('implementation_evidence');
    const first = await at(pm, 'put', `/projects/${id}/syllabus`).send({
      topics: [{ title: { bn: 'ঈমান', en: 'Faith' } }, { title: { bn: 'সালাত', en: 'Prayer' } }],
    });
    expect(first.status).toBe(200);
    const keep = first.body.data[1].id as string;
    const second = await at(pm, 'put', `/projects/${id}/syllabus`).send({
      topics: [
        { id: keep, title: { bn: 'সালাত', en: 'Prayer' } },
        { title: { bn: 'যাকাত', en: 'Zakat' } },
      ],
    });
    expect(second.body.data.map((t: { id: string; title: { en: string } }) => t.title.en)).toEqual([
      'Prayer',
      'Zakat',
    ]);
    expect(second.body.data[0].id).toBe(keep);
    const read = await at(pm, 'get', `/projects/${id}/syllabus`);
    expect(read.status).toBe(200);
    expect(read.body.data).toEqual(second.body.data);
    const twice = await at(pm, 'put', `/projects/${id}/syllabus`).send({
      topics: [
        { id: keep, title: { bn: 'সালাত', en: 'Prayer' } },
        { id: keep, title: { bn: 'যাকাত', en: 'Zakat' } },
      ],
    });
    expect(twice.status).toBe(422);
    const volunteer = await as(world.users.general);
    expect(
      (await at(volunteer, 'put', `/projects/${world.a1.id}/syllabus`).send({ topics: [] })).status,
    ).toBe(403);
    const other = await staff('program_manager');
    expect((await at(other.session, 'get', `/projects/${id}/syllabus`)).status).toBe(404);
    await setStatus(id, 'closed');
    const closed = await at(pm, 'put', `/projects/${id}/syllabus`).send({ topics: [] });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('project.read_only');
  });
});

describe('a closed project', () => {
  it('refuses every setup write with project.read_only', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const components = await at(pm, 'get', `/projects/${id}/components`);
    const tree = await f.locationTree(h.db);
    const rpm = await staff('regional_program_manager');
    for (const status of ['closing', 'closed']) {
      await setStatus(id, status);
      const writes = [
        at(pm, 'patch', `/projects/${id}/components/dawah`)
          .set('If-Match', components.body.data[0].etag)
          .send({ enabled: true }),
        at(pm, 'patch', `/projects/${id}/fund-sources`).send({ fundSources: [] }),
        at(pm, 'post', `/projects/${id}/areas`).send({
          locationId: tree.division,
          rpmUserId: rpm.id,
        }),
      ];
      for (const res of await Promise.all(writes)) {
        expect(res.status, status).toBe(409);
        expect(res.body.error.code).toBe('project.read_only');
      }
    }
  });
});
