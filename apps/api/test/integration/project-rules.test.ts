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

// The four rules texts of a project, saved as versions, and the activation that needs them.
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
  return `R${letter(n / 676)}${letter(n / 26)}${letter(n)}`;
};
const at = (s: Session, method: 'get' | 'post' | 'put' | 'patch', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));
const text = (bn: string) => ({ bn, en: `${bn} (en)` });
const three = {
  volunteer_duties: text('দায়িত্ব'),
  implementation_process: text('প্রক্রিয়া'),
  misconduct: text('অনিয়ম'),
};

async function draft() {
  const res = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code: code(),
    year: 2026,
    name: { bn: 'নিয়মের পরীক্ষা', en: 'Rules test' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}
async function versions(projectId: string) {
  const { rows } = await h.db.query<{ version: number; texts: unknown }>(
    'SELECT version, texts FROM project_rules_versions WHERE project_id = $1 ORDER BY version',
    [projectId],
  );
  return rows;
}

describe('the rules texts', () => {
  it('saves every change as a new version and keeps them all', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const empty = await at(pm, 'get', `/projects/${id}/rules`);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual({ version: 0, rules: {} });

    const first = await at(pm, 'put', `/projects/${id}/rules`).send(three);
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ version: 1, rules: three });
    const second = await at(pm, 'put', `/projects/${id}/rules`).send({
      ...three,
      misconduct: text('অনিয়মের ফল'),
    });
    expect(second.body.data.version).toBe(2);
    // the same texts again are no new version
    const same = await at(pm, 'put', `/projects/${id}/rules`).send(second.body.data.rules);
    expect(same.body.data.version).toBe(2);
    expect((await versions(id)).map((v) => v.version)).toEqual([1, 2]);
    expect((await versions(id))[0]!.texts).toEqual(three);
    expect((await at(pm, 'get', `/projects/${id}/rules`)).body.data.version).toBe(2);
    const { rows } = await h.db.query<{ new: { rulesVersion: number; unchanged?: boolean } }>(
      `SELECT new FROM audit_log WHERE entity_id = $1 AND action = 'project.configure' ORDER BY created_at`,
      [id],
    );
    expect(rows.map((r) => r.new.rulesVersion)).toEqual([1, 2, 2]);
    expect(rows[2]!.new.unchanged).toBe(true);
  });

  it('refuses unknown parts, a missing language and a closed project', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    expect((await at(pm, 'put', `/projects/${id}/rules`).send({ other: text('x') })).status).toBe(
      422,
    );
    expect(
      (await at(pm, 'put', `/projects/${id}/rules`).send({ misconduct: { bn: 'অনিয়ম' } })).status,
    ).toBe(422);
    await h.db.query(`UPDATE projects SET status = 'closed' WHERE id = $1`, [id]);
    const closed = await at(pm, 'put', `/projects/${id}/rules`).send(three);
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('project.read_only');
  });

  it('is read and written only by officials who reach the project', async () => {
    const id = await draft();
    const otherPm = await account(h.db, { role: 'program_manager' });
    accounts.set(otherPm.id, otherPm);
    expect((await at(await as(otherPm.id), 'get', `/projects/${id}/rules`)).status).toBe(404);
    expect(
      (await at(await as(otherPm.id), 'put', `/projects/${id}/rules`).send(three)).status,
    ).toBe(404);
    const volunteer = await as(world.users.general);
    expect((await at(volunteer, 'get', `/projects/${world.a1.id}/rules`)).status).toBe(403);
    expect((await at(volunteer, 'put', `/projects/${world.a1.id}/rules`).send(three)).status).toBe(
      403,
    );
  });
});

describe('activation needs the rules', () => {
  it('lists the missing rules texts, and the Local দায়ী duties only while dawah is on', async () => {
    const pm = await as(world.users.pm);
    const id = await draft();
    const etag = async () => String((await at(pm, 'get', `/projects/${id}`)).headers.etag);
    const missing = async () => {
      const res = await at(pm, 'post', `/projects/${id}/activate`).set('If-Match', await etag());
      expect(res.status).toBe(409);
      return (res.body.error.details as { path: string }[])
        .map((d) => d.path)
        .filter((p) => p.startsWith('rules:'));
    };
    expect(await missing()).toEqual([
      'rules:volunteer_duties',
      'rules:implementation_process',
      'rules:misconduct',
    ]);
    await at(pm, 'put', `/projects/${id}/rules`).send(three);
    expect(await missing()).toEqual([]);
    const components = await at(pm, 'get', `/projects/${id}/components`);
    const dawah = components.body.data.find(
      (c: { componentKey: string }) => c.componentKey === 'dawah',
    );
    const on = await at(pm, 'patch', `/projects/${id}/components/dawah`)
      .set('If-Match', dawah.etag)
      .send({ enabled: true });
    expect(on.status).toBe(200);
    expect(await missing()).toEqual(['rules:daee_duties']);
  });
});
