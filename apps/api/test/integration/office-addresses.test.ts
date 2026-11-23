import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
} from './support/auth-app.js';

// The office addresses an Admin lists skip the rate limits counted by the client address; the
// limits of a login id and of a registration draft count them like anyone. The real limits run.
let h: AuthHarness;
let admin: Account;
let head: Account;
const api = () => request(h.server());
const OFFICE = '203.0.113.0/24';

const startFrom = (address: string) =>
  api().post('/api/v1/auth/register/start').set('X-Forwarded-For', address).send({});
const loginFrom = (address: string, loginId: string) =>
  api()
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', address)
    .send({
      loginId,
      password: 'not the password',
      device: { name: 'Test device', platform: 'android', appVersion: '1.0.0' },
    });

beforeAll(async () => {
  h = await authHarness({ realRateLimits: true });
  admin = await account(h.db, { role: 'admin' });
  head = await account(h.db, { role: 'department_head' });
});
afterAll(async () => h.close());

describe('the office addresses', () => {
  it('are kept by an Admin alone, checked, audited and shown with the caller’s own address', async () => {
    const asHead = await login(h, head);
    expect((await api().get('/api/v1/admin/office-addresses').set(bearer(asHead))).status).toBe(
      403,
    );
    expect(
      (
        await api()
          .put('/api/v1/admin/office-addresses')
          .set(bearer(asHead))
          .send({ addresses: [OFFICE] })
      ).status,
    ).toBe(403);

    const asAdmin = await login(h, admin);
    const empty = await api()
      .get('/api/v1/admin/office-addresses')
      .set(bearer(asAdmin))
      .set('X-Forwarded-For', '198.51.100.40');
    expect(empty.status, JSON.stringify(empty.body)).toBe(200);
    expect(empty.body.data).toEqual({
      addresses: [],
      updatedAt: null,
      yourAddress: '198.51.100.40',
    });
    const wide = await api()
      .put('/api/v1/admin/office-addresses')
      .set(bearer(asAdmin))
      .send({ addresses: ['203.0.112.0/23'] });
    expect(wide.status).toBe(422);
    expect(wide.body.error.details).toEqual([
      expect.objectContaining({ code: 'validation.office_address' }),
    ]);
    const set = await api()
      .put('/api/v1/admin/office-addresses')
      .set(bearer(asAdmin))
      .send({ addresses: [` ${OFFICE} `] });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.data.addresses).toEqual([OFFICE]);
    const audit = await h.db.query<{ new: { key: string; value: unknown } }>(
      `SELECT new FROM audit_log WHERE action = 'settings.change' AND actor_user_id = $1`,
      [admin.id],
    );
    expect(audit.rows.map((r) => r.new)).toEqual([
      { key: 'security.office_ips', value: { addresses: [OFFICE] } },
    ]);
  });

  it('let twelve registrations start from the office in a day, and stop the eleventh elsewhere', async () => {
    for (let i = 0; i < 12; i += 1) expect((await startFrom('203.0.113.7')).status).toBe(201);
    for (let i = 0; i < 10; i += 1) expect((await startFrom('198.51.100.7')).status).toBe(201);
    const eleventh = await startFrom('198.51.100.7');
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error.code).toBe('rate_limit.exceeded');
  });

  it('still count the tries of one login id from the office', async () => {
    // eleven ids from one office address in a minute: none is held by the address
    for (let i = 0; i < 11; i += 1)
      expect((await loginFrom('203.0.113.8', `office${i}@example.org`)).status).not.toBe(429);
    // one id ten times is its own limit, office or not
    for (let i = 0; i < 9; i += 1)
      expect((await loginFrom('203.0.113.9', 'office0@example.org')).status).not.toBe(429);
    expect((await loginFrom('203.0.113.9', 'office0@example.org')).status).toBe(429);
  });
});
