import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

// The contact data of a beneficiary edited outside an application: the mobile and the address,
// each change logged; the identity fields never change this way.
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
});
afterAll(async () => h.close());

/** A Dhaka beneficiary who applied in project A1 (so the PM of its program reaches them too). */
async function applicant(over: Record<string, unknown> = {}) {
  const id = await f.beneficiary(h.db, world.dhaka, over);
  await f.application(h.db, { project: world.a1, loc: world.dhaka }, { beneficiary_id: id });
  return id;
}
const etag = async (s: Session, id: string) =>
  (await api().get(`/api/v1/beneficiaries/${id}`).set(bearer(s)).expect(200)).headers
    .etag as string;
const edit = (s: Session, id: string, body: Record<string, unknown>, tag?: string) =>
  api()
    .patch(`/api/v1/beneficiaries/${id}/contact`)
    .set(bearer(s))
    .set('If-Match', tag ?? '"none"')
    .send(body);
const changes = async (id: string) =>
  (
    await h.db.query(
      `SELECT field, old_value, new_value, kind, created_by FROM field_changes WHERE entity_type = 'beneficiary' AND entity_id = $1 ORDER BY field`,
      [id],
    )
  ).rows;

describe('the contact edit of a beneficiary', () => {
  it('changes the mobile and the village, logging each change with old and new value and who', async () => {
    const id = await applicant({ mobile: '01811000001', village: 'পুরনো গ্রাম' });
    const rpm = await as(world.users.rpmDhaka);
    const res = await edit(
      rpm,
      id,
      { mobile: '01811000002', village: 'নতুন গ্রাম' },
      await etag(rpm, id),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      mobile: '01811000002',
      village: 'নতুন গ্রাম',
      warnings: [],
    });
    expect(res.headers.etag).toBeTruthy();
    expect(await changes(id)).toEqual([
      {
        field: 'mobile',
        old_value: '01811000001',
        new_value: '01811000002',
        kind: 'contact_update',
        created_by: world.users.rpmDhaka,
      },
      {
        field: 'village',
        old_value: 'পুরনো গ্রাম',
        new_value: 'নতুন গ্রাম',
        kind: 'contact_update',
        created_by: world.users.rpmDhaka,
      },
    ]);
    const audit = (
      await h.db.query(
        `SELECT old, new FROM audit_log WHERE action = 'beneficiary.contact_updated' AND entity_id = $1`,
        [id],
      )
    ).rows[0];
    expect(audit).toEqual({
      old: { mobile: '01811000001', village: 'পুরনো গ্রাম' },
      new: { mobile: '01811000002', village: 'নতুন গ্রাম' },
    });
  });

  it('lets the PM of the program and the executive of the region edit as well', async () => {
    const id = await applicant();
    for (const user of [world.users.pm, world.users.executive]) {
      const s = await as(user);
      const res = await edit(
        s,
        id,
        { landmark: `মসজিদের পাশে ${user.slice(0, 4)}` },
        await etag(s, id),
      );
      expect(res.status, user).toBe(200);
    }
  });

  it('moves the address to another place as a whole chain, logging each place', async () => {
    const id = await applicant();
    const head = await as(world.users.head);
    const other = await f.locationTree(h.db);
    const res = await edit(
      head,
      id,
      {
        divisionId: other.division,
        districtId: other.district,
        upazilaId: other.upazila,
        unionId: other.union,
        village: 'নদীর ওপারের গ্রাম',
        postOffice: 'চরপাড়া',
        postCode: '5400',
      },
      await etag(head, id),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      divisionId: other.division,
      unionId: other.union,
      postOffice: 'চরপাড়া',
      postCode: '5400',
    });
    expect((await changes(id)).map((c) => c.field)).toEqual([
      'district_id',
      'division_id',
      'post_code',
      'post_office',
      'union_id',
      'upazila_id',
      'village',
    ]);
  });

  it('moves the address only as a whole chain of places', async () => {
    const id = await applicant();
    const rpm = await as(world.users.rpmDhaka);
    const other = await f.locationTree(h.db);
    const mixed = await edit(
      rpm,
      id,
      {
        divisionId: world.dhaka.division,
        districtId: world.dhaka.district,
        upazilaId: world.dhaka.upazila,
        unionId: other.union,
      },
      await etag(rpm, id),
    );
    expect(mixed.status).toBe(422);
    const part = await edit(rpm, id, { unionId: world.dhaka.union }, await etag(rpm, id));
    expect(part.status).toBe(422);
  });

  it('refuses the identity fields, which change only through a correction request', async () => {
    const id = await applicant();
    const rpm = await as(world.users.rpmDhaka);
    const res = await edit(rpm, id, { name: 'অন্য নাম' }, await etag(rpm, id));
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].code).toBe('beneficiary.locked_field');
  });

  it("refuses the mobile of a volunteer who owns one of the person's applications", async () => {
    const id = await f.beneficiary(h.db, world.dhaka);
    const owner = await h.db.query(`SELECT id FROM volunteers WHERE user_id = $1`, [
      world.users.general,
    ]);
    await f.application(
      h.db,
      { project: world.a1, loc: world.dhaka },
      { beneficiary_id: id, owner_volunteer_id: owner.rows[0].id },
    );
    const rpm = await as(world.users.rpmDhaka);
    const res = await edit(
      rpm,
      id,
      { mobile: accounts.get(world.users.general)!.mobile },
      await etag(rpm, id),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('beneficiary.mobile_is_volunteer_mobile');
  });

  it('saves a mobile another profile has, with the warning', async () => {
    // the other holder of the number is an applicant of the RPM's project, so it is named
    const other = await f.applicant(
      h.db,
      { project: world.a1, loc: world.dhaka },
      { mobile: '01811000077' },
    );
    const ben = (await h.db.query('SELECT ben_no FROM beneficiaries WHERE id = $1', [other]))
      .rows[0].ben_no as number;
    const id = await applicant();
    const rpm = await as(world.users.rpmDhaka);
    const res = await edit(rpm, id, { mobile: '01811000077' }, await etag(rpm, id));
    expect(res.status).toBe(200);
    expect(res.body.data.warnings).toEqual([
      {
        code: 'beneficiary.mobile_shared',
        count: 1,
        benNos: [`BEN-${String(ben).padStart(7, '0')}`],
      },
    ]);
  });

  it('refuses a stale version with 412', async () => {
    const id = await applicant();
    const rpm = await as(world.users.rpmDhaka);
    const tag = await etag(rpm, id);
    expect((await edit(rpm, id, { landmark: 'প্রথম পরিবর্তন' }, tag)).status).toBe(200);
    expect((await edit(rpm, id, { landmark: 'দ্বিতীয় পরিবর্তন' }, tag)).status).toBe(412);
  });

  it('refuses an official of another region, a volunteer and the Media Team', async () => {
    const id = await applicant();
    const head = await as(world.users.head);
    const tag = await etag(head, id);
    expect(
      (await edit(await as(world.users.rpmRangpur), id, { landmark: 'ক খ গ' }, tag)).status,
    ).toBe(404);
    expect((await edit(await as(world.users.general), id, { landmark: 'ক খ গ' }, tag)).status).toBe(
      403,
    );
    const media = await login(h, await account(h.db, { role: 'media_team' }));
    expect((await edit(media, id, { landmark: 'ক খ গ' }, tag)).status).toBe(403);
    expect(await changes(id)).toEqual([]);
  });
});
