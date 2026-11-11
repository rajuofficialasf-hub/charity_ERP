import { randomUUID } from 'node:crypto';
import { SETTING_DEFAULTS } from '@css/shared/settings';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { account, type AuthHarness, authHarness, bearer, login } from './support/auth-app.js';

// The notification channels and the system health for the global roles; no secret leaves the
// server.
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

/** The harness clock as a Dhaka wall clock (six hours ahead of UTC all year). */
const dhakaNow = () => new Date(h.clock.now().getTime() + 6 * 3_600_000);
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
    expect((await api().put('/api/v1/admin/channels/sms').send(sms)).status).toBe(401);
  });
});

describe('the system health', () => {
  it('shows the checks, the dummy OTP, the audit partitions and the storage growth', async () => {
    const uploader = await account(h.db, { role: 'department_head' });
    const file = (kind: string, size: number, deleted = false, at = h.clock.now()) =>
      h.db.query(
        `INSERT INTO files (id, bucket, storage_driver, object_key, kind, mime, size_bytes, sha256, uploaded_by, source, uploaded_at, deleted_at)
         VALUES ($1, 'private', 'nas', $2, $3, 'image/jpeg', $4, $5, $6, 'camera', $7, ${deleted ? 'now()' : 'NULL'})`,
        [
          randomUUID(),
          `test/${randomUUID()}`,
          kind,
          size,
          randomUUID().replace(/-/g, ''),
          uploader.id,
          at,
        ],
      );
    // three months back counts in its month; thirteen months back is outside the twelve
    const monthsBack = (n: number) =>
      new Date(Date.UTC(dhakaNow().getUTCFullYear(), dhakaNow().getUTCMonth() - n, 15));
    await file('nid_photo', 700, false, monthsBack(3));
    await file('nid_photo', 800, false, monthsBack(13));
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
    const { rows: parts } = await h.db.query(
      `SELECT max(c.relname) AS last FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
       JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname = 'audit_log'`,
    );
    expect(res.body.data.auditPartitionsUntil).toBe(
      (parts[0].last as string).replace(/^audit_log_(\d{4})_(\d{2})$/, '$1-$2'),
    );
    const { storage } = res.body.data;
    expect(storage.total).toEqual({ count: 5, bytes: 5000 });
    expect(storage.byKind).toEqual([
      { kind: 'profile_photo', count: 2, bytes: 3000 },
      { kind: 'nid_photo', count: 3, bytes: 2000 },
    ]);
    const month = (n: number) => monthsBack(n).toISOString().slice(0, 7);
    expect(storage.byMonth).toHaveLength(12);
    expect(storage.byMonth[0].month).toBe(month(11));
    expect(storage.byMonth.at(-1)).toEqual({ month: month(0), count: 3, bytes: 3500 });
    expect(storage.byMonth.find((m: { month: string }) => m.month === month(3))).toMatchObject({
      count: 1,
      bytes: 700,
    });
    expect(storage.byMonth.filter((m: { count: number }) => m.count > 0)).toHaveLength(2);
    // no nightly snapshot of a month ago yet, so no growth
    expect(storage.byBucket).toEqual([
      { bucket: 'private', count: 5, bytes: 5000, monthGrowth: null },
    ]);

    // the figures are reused for a minute, then measured again
    await file('profile_photo', 100);
    const again = await api().get('/api/v1/admin/health').set(bearer(s));
    expect(again.body.data.storage.total.count).toBe(5);
    h.clock.advance(61_000);
    const later = await api().get('/api/v1/admin/health').set(bearer(s));
    expect(later.body.data.storage.total.count).toBe(6);
  });

  it('records one snapshot a day per bucket and project, and shows the growth since a month ago', async () => {
    const before = await h.db.query('SELECT count(*)::int AS n FROM storage_stats');
    const first = await h.container.storageStats.run();
    const groups = await h.db.query(
      `SELECT count(*)::int AS n FROM (SELECT DISTINCT bucket, project_id FROM files WHERE deleted_at IS NULL) g`,
    );
    expect(first.rows).toBe(groups.rows[0].n);
    // a second run the same day writes nothing
    expect(await h.container.storageStats.run()).toEqual({ rows: 0 });
    const after = await h.db.query('SELECT count(*)::int AS n FROM storage_stats');
    expect(after.rows[0].n - before.rows[0].n).toBe(first.rows);
    // a snapshot of forty days ago gives the month's growth per bucket
    await h.db.query(
      `INSERT INTO storage_stats (id, captured_at, bucket, project_id, bytes, objects)
       VALUES ($1, $2, 'private', NULL, 3000, 3)`,
      [randomUUID(), new Date(h.clock.now().getTime() - 40 * 86_400_000)],
    );
    h.clock.advance(61_000);
    const res = await api()
      .get('/api/v1/admin/health')
      .set(bearer(await head()));
    const now = await h.db.query(
      `SELECT sum(size_bytes)::bigint AS bytes FROM files WHERE deleted_at IS NULL AND bucket = 'private'`,
    );
    expect(
      res.body.data.storage.byBucket.find((b: { bucket: string }) => b.bucket === 'private'),
    ).toMatchObject({ monthGrowth: Number(now.rows[0].bytes) - 3000 });
  });

  it('still answers with the checks when the database reads fail', async () => {
    const s = await head();
    const failing = h.container.systemHealth as unknown as { prisma: { $queryRaw: unknown } };
    const real = failing.prisma;
    failing.prisma = {
      $queryRaw: () => Promise.reject(new Error('database down')),
    };
    h.clock.advance(61_000);
    try {
      const res = await api().get('/api/v1/admin/health').set(bearer(s));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ auditPartitionsUntil: null, storage: null });
    } finally {
      failing.prisma = real;
    }
  });

  it('refuses a PM and answers 401 without a session', async () => {
    const pm = await login(h, await account(h.db, { role: 'program_manager' }));
    expect((await api().get('/api/v1/admin/health').set(bearer(pm))).status).toBe(403);
    expect((await api().get('/api/v1/admin/health')).status).toBe(401);
  });
});
