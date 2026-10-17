import { randomUUID } from 'node:crypto';
import { SETTING_DEFAULTS } from '@css/shared/settings';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { account, type AuthHarness, authHarness, bearer, login } from './support/auth-app';

// The notification channels and the system health for the global roles; no secret leaves the
// server (plan docs/plans/2026-10-17-1800-feat-admin-settings-core-plan.md).
let h: AuthHarness;
const api = () => request(h.server());
const SMTP_PASSWORD = 'smtp-secret-for-the-test';
const SMS_API_KEY = 'sms-key-for-the-test';

beforeAll(async () => {
  h = await authHarness();
  Object.assign(h.container.env, {
    SMTP_USER: 'mailer',
    SMTP_PASSWORD,
    SMS_API_KEY,
  });
});
afterAll(async () => h.close());

const head = async () => login(h, await account(h.db, { role: 'department_head' }));
const sms = {
  provider: 'sample_gateway',
  senderId: 'ASF',
  enabled: true,
  endpoint: 'https://sms.example.com/send',
};

describe('the notification channels', () => {
  it('shows SMTP read-only, whether the key is set and the dummy OTP, never a secret', async () => {
    const s = await head();
    const res = await api().get('/api/v1/admin/channels').set(bearer(s));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      smtp: { host: h.container.env.SMTP_HOST, loginSet: true },
      sms: { keyPresent: true, config: SETTING_DEFAULTS['sms.provider'], updatedAt: null },
      otpDummy: true,
    });
    expect(JSON.stringify(res.body)).not.toContain(SMTP_PASSWORD);
    expect(JSON.stringify(res.body)).not.toContain(SMS_API_KEY);
  });

  it('says when the key is missing', async () => {
    const s = await head();
    const before = h.container.env.SMS_API_KEY;
    Object.assign(h.container.env, { SMS_API_KEY: undefined });
    try {
      const res = await api().get('/api/v1/admin/channels').set(bearer(s));
      expect(res.body.data.sms.keyPresent).toBe(false);
    } finally {
      Object.assign(h.container.env, { SMS_API_KEY: before });
    }
  });

  it('stores the SMS adapter configuration with an audit entry', async () => {
    const s = await head();
    const res = await api().put('/api/v1/admin/channels/sms').set(bearer(s)).send(sms);
    expect(res.status).toBe(200);
    expect(res.body.data.sms.config).toEqual(sms);
    const { rows } = await h.db.query(
      `SELECT old, new FROM audit_log WHERE action = 'settings.change' AND new->>'key' = 'sms.provider'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].new.value).toEqual(sms);
    expect(JSON.stringify(rows)).not.toContain(SMS_API_KEY);
  });

  it('refuses an endpoint that is not https or points at an internal host', async () => {
    const s = await head();
    for (const endpoint of [
      'http://sms.example.com/send',
      'https://localhost/send',
      'https://10.0.0.8/x',
    ]) {
      const res = await api()
        .put('/api/v1/admin/channels/sms')
        .set(bearer(s))
        .send({ ...sms, endpoint });
      expect(res.status, endpoint).toBe(422);
      expect(res.body.error.details[0]).toMatchObject({
        path: 'endpoint',
        code: 'validation.https_public_url',
      });
    }
  });

  it('refuses a PM and answers 401 without a session', async () => {
    const pm = await login(h, await account(h.db, { role: 'program_manager' }));
    expect((await api().get('/api/v1/admin/channels').set(bearer(pm))).status).toBe(403);
    expect((await api().put('/api/v1/admin/channels/sms').set(bearer(pm)).send(sms)).status).toBe(
      403,
    );
    expect((await api().get('/api/v1/admin/channels')).status).toBe(401);
  });
});

describe('the system health', () => {
  it('shows the checks, the dummy OTP, the audit partitions and the storage growth', async () => {
    const uploader = await account(h.db, { role: 'department_head' });
    const file = (kind: string, size: number, deleted = false) =>
      h.db.query(
        `INSERT INTO files (id, bucket, object_key, kind, mime, size_bytes, sha256, uploaded_by, source, deleted_at)
         VALUES ($1, 'private', $2, $3, 'image/jpeg', $4, $5, $6, 'camera', ${deleted ? 'now()' : 'NULL'})`,
        [
          randomUUID(),
          `test/${randomUUID()}`,
          kind,
          size,
          randomUUID().replace(/-/g, ''),
          uploader.id,
        ],
      );
    await file('profile_photo', 1000);
    await file('profile_photo', 2000);
    await file('nid_photo', 500);
    await file('export', 9999, true);
    const s = await login(h, uploader);
    const res = await api().get('/api/v1/admin/health').set(bearer(s));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      checks: { database: 'up' },
      otpDummy: true,
      environment: 'test',
    });
    expect(res.body.data.auditPartitionsUntil).toMatch(/^\d{4}-\d{2}$/);
    const { storage } = res.body.data;
    expect(storage.total).toEqual({ count: 3, bytes: 3500 });
    expect(storage.byKind).toEqual([
      { kind: 'profile_photo', count: 2, bytes: 3000 },
      { kind: 'nid_photo', count: 1, bytes: 500 },
    ]);
    expect(storage.byMonth).toHaveLength(12);
    expect(storage.byMonth.at(-1)).toMatchObject({ count: 3, bytes: 3500 });
  });

  it('refuses a PM and answers 401 without a session', async () => {
    const pm = await login(h, await account(h.db, { role: 'program_manager' }));
    expect((await api().get('/api/v1/admin/health').set(bearer(pm))).status).toBe(403);
    expect((await api().get('/api/v1/admin/health')).status).toBe(401);
  });
});
