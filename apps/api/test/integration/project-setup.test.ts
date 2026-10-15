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
// access and the syllabus (plan docs/plans/2026-10-15-1440-feat-program-project-setup-plan.md).
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
  });

  it('shows a volunteer only the enabled components and the photo rule', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const { rows } = await h.db.query<{ id: string }>(
      'SELECT id FROM volunteers WHERE user_id = $1',
      [world.users.general],
    );
    await h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, assigned_by)
       VALUES (gen_random_uuid(), $1, $2, $3, 'application_distribution', $4)`,
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

  it('keeps at least one fund source once active, and refuses a volunteer the list', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    await at(pm, 'patch', `/projects/${id}/fund-sources`).send({
      fundSources: [{ source: 'zakat', amount: '1.00' }],
    });
    await setStatus(id, 'active');
    const empty = await at(pm, 'patch', `/projects/${id}/fund-sources`).send({ fundSources: [] });
    expect(empty.status).toBe(422);
    const volunteer = await as(world.users.general);
    expect((await at(volunteer, 'get', `/projects/${world.a1.id}/fund-sources`)).status).toBe(403);
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
    // a staff access is a permission change of that person, audited on the person
    expect(await audit(executive.id, 'permission_change')).toHaveLength(1);

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
