import { createHash, randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pino from 'pino';
import { identifierHash } from '../../src/auth/otp.service';
import { RegistrationCleanup } from '../../src/jobs/registration-cleanup';
import type { RegistrationEvent } from '../../src/notifications/registration-events';
import type { StorageDriver } from '../../src/storage';
import { account, authHarness, type AuthHarness } from './support/auth-app';
import * as f from './support/fixtures';

// Registration start, the two codes, resume and the reference lookup (AUTH.md 2; DECISION_LOG
// D-082, D-086, D-088; plan docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md,
// unit U4). The dummy OTP of the test configuration is 246810.
const CODE = '246810';
const TOKEN_HEADER = 'X-Registration-Token';
const logLines: string[] = [];
const events: RegistrationEvent[] = [];
let h: AuthHarness;
let n = 0;

beforeAll(async () => {
  h = await authHarness({
    logStream: new Writable({
      write(chunk, _enc, done) {
        logLines.push(String(chunk));
        done();
      },
    }),
    overrides: { registrationEvents: { emit: (event) => void events.push(event) } },
  });
});
afterAll(async () => h.close());

const contacts = () => ({
  mobile: f.fakeMobile(),
  email: `reg${++n}.${randomUUID().slice(0, 6)}@example.org`,
});
const api = () => request(h.server());

async function start(body: Record<string, unknown>) {
  return api().post('/api/v1/auth/register/start').send(body);
}

async function verify(registrationId: string, mobileCode = CODE, emailCode = CODE) {
  return api()
    .post('/api/v1/auth/register/otp/verify')
    .send({ registrationId, mobileCode, emailCode });
}

async function verified(kind: 'volunteer' | 'staff' = 'volunteer') {
  const c = contacts();
  const started = await start({ ...c, kind });
  expect(started.status).toBe(201);
  const res = await verify(started.body.data.registrationId);
  expect(res.status).toBe(200);
  return {
    ...c,
    registrationId: started.body.data.registrationId as string,
    token: res.body.data.registrationToken as string,
  };
}

/** The registration codes sent to one address (OTP addresses are stored only as HMACs). */
const codesOf = async (address: string) =>
  (
    await h.db.query(
      `SELECT channel, attempts FROM otp_codes WHERE purpose = 'registration' AND address_hash = $1 ORDER BY created_at`,
      [identifierHash(h.container.env, address)],
    )
  ).rows as { channel: string; attempts: number }[];

const auditActions = async (entityId: string) =>
  (
    await h.db.query('SELECT action FROM audit_log WHERE entity_id = $1 ORDER BY created_at', [
      entityId,
    ])
  ).rows.map((r) => r.action as string);

describe('POST /auth/register/start', () => {
  it('creates a draft, sends one code per channel and audits the start', async () => {
    const c = contacts();
    const res = await start(c);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      registrationId: expect.any(String),
      otpSentTo: ['sms', 'email'],
    });
    const id = res.body.data.registrationId as string;
    const draft = (await h.db.query('SELECT * FROM registration_drafts WHERE id = $1', [id]))
      .rows[0];
    expect(draft).toMatchObject({
      kind: 'volunteer',
      mobile: c.mobile,
      email: c.email,
      token_hash: null,
    });
    expect((await codesOf(c.mobile)).map((r) => r.channel)).toEqual(['sms']);
    expect((await codesOf(c.email)).map((r) => r.channel)).toEqual(['email']);
    expect(await auditActions(id)).toEqual(['auth.register_started']);
    expect(events).toContainEqual({ type: 'registration.started', draftId: id });
  });

  it('answers the same for the mobile of an existing account', async () => {
    const existing = await account(h.db, { kind: 'volunteer' });
    const res = await start({ mobile: existing.mobile, email: contacts().email });
    expect(res.status).toBe(201);
    expect(res.body.data.otpSentTo).toEqual(['sms', 'email']);
  });

  it('lower-cases the email and refuses a malformed mobile', async () => {
    const c = contacts();
    const res = await start({ ...c, email: c.email.toUpperCase() });
    expect(res.status).toBe(201);
    const row = await h.db.query('SELECT email FROM registration_drafts WHERE id = $1', [
      res.body.data.registrationId,
    ]);
    expect(row.rows[0].email).toBe(c.email);
    expect((await start({ ...contacts(), mobile: '12345' })).status).toBe(422);
  });

  it('resumes the open draft of the same mobile and email, but not an expired one', async () => {
    const c = contacts();
    const first = await start(c);
    const second = await start(c);
    expect(second.body.data.registrationId).toBe(first.body.data.registrationId);
    await h.db.query(
      `UPDATE registration_drafts SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [first.body.data.registrationId],
    );
    const third = await start(c);
    expect(third.body.data.registrationId).not.toBe(first.body.data.registrationId);
  });
});

describe('POST /auth/register/otp/verify', () => {
  it('marks the draft verified and returns the token once; only its hash is stored', async () => {
    const r = await verified();
    expect(r.token.length).toBeGreaterThanOrEqual(32);
    const draft = (
      await h.db.query(
        'SELECT token_hash, verified_at, expires_at FROM registration_drafts WHERE id = $1',
        [r.registrationId],
      )
    ).rows[0];
    expect(draft.verified_at).not.toBeNull();
    expect(draft.token_hash).toBe(createHash('sha256').update(r.token).digest('hex'));
    expect(draft.token_hash).not.toContain(r.token);
    expect(await auditActions(r.registrationId)).toEqual([
      'auth.register_started',
      'auth.otp_verified',
    ]);
    expect(events).toContainEqual({ type: 'registration.verified', draftId: r.registrationId });
    // the codes are used up
    expect((await verify(r.registrationId)).status).toBe(422);
  });

  it('names the channel of a wrong code and counts the attempt', async () => {
    const c = contacts();
    const id = (await start(c)).body.data.registrationId as string;
    const wrong = await verify(id, CODE, '111111');
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe('otp.invalid');
    expect(wrong.body.error.details).toEqual([
      expect.objectContaining({ path: 'emailCode', code: 'otp.invalid' }),
    ]);
    const mobileWrong = await verify(id, '111111', CODE);
    expect(mobileWrong.body.error.details[0].path).toBe('mobileCode');
    // the mobile code was checked twice (right, then wrong); the second call stopped before the
    // email code, which was checked once (wrong)
    expect((await codesOf(c.mobile)).map((r) => r.attempts)).toEqual([2]);
    expect((await codesOf(c.email)).map((r) => r.attempts)).toEqual([1]);
    expect((await verify(id)).status).toBe(200);
    expect(await auditActions(id)).toContain('auth.otp_failed');
  });

  it('reports an existing account only after both codes, and frees a rejected never-approved one', async () => {
    const pending = await account(h.db, { kind: 'volunteer', state: 'pending' });
    const id = (await start({ mobile: pending.mobile, email: contacts().email })).body.data
      .registrationId as string;
    const res = await verify(id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('registration.account_exists');

    const loc = await f.locationTree(h.db);
    const rejected = await account(h.db, { kind: 'volunteer', state: 'deactivated' });
    await f.volunteer(h.db, loc, rejected.id);
    const again = (await start({ mobile: rejected.mobile, email: contacts().email })).body.data
      .registrationId as string;
    expect((await verify(again)).status).toBe(200);
  });

  it('counts an approved, later closed volunteer and an official who held a role as taken', async () => {
    const loc = await f.locationTree(h.db);
    const closed = await account(h.db, { kind: 'volunteer', state: 'deactivated' });
    await f.volunteer(h.db, loc, closed.id, { approved_at: new Date() });
    const v = (await start({ mobile: closed.mobile, email: contacts().email })).body.data
      .registrationId as string;
    expect((await verify(v)).status).toBe(409);

    const withRole = await account(h.db, { kind: 'staff', state: 'deactivated' });
    const s1 = (await start({ mobile: f.fakeMobile(), email: withRole.email!, kind: 'staff' })).body
      .data.registrationId as string;
    expect((await verify(s1)).status).toBe(409);

    const noRole = `norole${++n}@example.org`;
    await f.user(h.db, { kind: 'staff', email: noRole, state: 'deactivated' });
    const s2 = (await start({ mobile: f.fakeMobile(), email: noRole, kind: 'staff' })).body.data
      .registrationId as string;
    expect((await verify(s2)).status).toBe(200);
  });

  it('a taken contact ends an earlier verification of the same draft', async () => {
    const r = await verified();
    await account(h.db, { kind: 'volunteer' }).then((a) =>
      h.db.query('UPDATE users SET mobile = $1 WHERE id = $2', [r.mobile, a.id]),
    );
    await api()
      .post('/api/v1/auth/register/otp/send')
      .send({ registrationId: r.registrationId, channel: 'sms' });
    await api()
      .post('/api/v1/auth/register/otp/send')
      .send({ registrationId: r.registrationId, channel: 'email' });
    expect((await verify(r.registrationId)).status).toBe(409);
    const res = await api()
      .post('/api/v1/auth/register/reference-lookup')
      .set(TOKEN_HEADER, r.token)
      .send({ registrationId: r.registrationId, nid: f.fakeNid() });
    expect(res.status).toBe(401);
  });

  it('refuses an unknown draft (404) and an expired one (410)', async () => {
    expect((await verify(randomUUID())).status).toBe(404);
    const id = (await start(contacts())).body.data.registrationId as string;
    await h.db.query(
      `UPDATE registration_drafts SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [id],
    );
    const res = await verify(id);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('registration.draft_expired');
  });
});

describe('POST /auth/register/otp/send', () => {
  it('resends a code within the hourly limit, then answers 429', async () => {
    const id = (await start(contacts())).body.data.registrationId as string;
    const resend = () =>
      api().post('/api/v1/auth/register/otp/send').send({ registrationId: id, channel: 'sms' });
    // start sent one code to the mobile; the address allows 5 per hour (AUTH.md 2)
    for (let i = 0; i < 4; i += 1) expect((await resend()).status).toBe(204);
    expect((await resend()).status).toBe(429);
    expect(await auditActions(id)).toContain('auth.otp_sent');
  });

  it('answers 404 for an unknown draft', async () => {
    const res = await api()
      .post('/api/v1/auth/register/otp/send')
      .send({ registrationId: randomUUID(), channel: 'email' });
    expect(res.status).toBe(404);
  });
});

describe('POST /auth/register/reference-lookup', () => {
  const lookup = (registrationId: string, nid: string, token?: string) => {
    const req = api().post('/api/v1/auth/register/reference-lookup');
    if (token) req.set(TOKEN_HEADER, token);
    return req.send({ registrationId, nid });
  };

  it('returns the name of an active volunteer and audits the lookup with a hashed NID', async () => {
    const loc = await f.locationTree(h.db);
    const main = await account(h.db, { kind: 'volunteer' });
    const nid = f.fakeNid();
    await f.volunteer(h.db, loc, main.id, { nid });
    const r = await verified();
    const res = await lookup(r.registrationId, nid, r.token);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ name: expect.stringMatching(/^নমুনা /) });
    const entry = (
      await h.db.query(
        `SELECT new FROM audit_log WHERE entity_id = $1 AND action = 'auth.reference_lookup'`,
        [r.registrationId],
      )
    ).rows[0];
    expect(entry.new.found).toBe(true);
    expect(JSON.stringify(entry.new)).not.toContain(nid);
  });

  it('answers 404 for an unknown NID and for a blocked or pending volunteer', async () => {
    const loc = await f.locationTree(h.db);
    const r = await verified();
    expect((await lookup(r.registrationId, f.fakeNid(), r.token)).status).toBe(404);
    for (const state of ['blocked', 'pending']) {
      const v = await account(h.db, { kind: 'volunteer', state });
      const nid = f.fakeNid();
      await f.volunteer(h.db, loc, v.id, { nid });
      expect((await lookup(r.registrationId, nid, r.token)).status).toBe(404);
    }
  });

  it('refuses a missing token, another draft token and an unverified draft (401)', async () => {
    const a = await verified();
    const b = await verified();
    const nid = f.fakeNid();
    for (const res of [
      await lookup(a.registrationId, nid),
      await lookup(a.registrationId, nid, b.token),
      await lookup(a.registrationId, nid, 'x'.repeat(43)),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('registration.token_invalid');
    }
    const unverified = (await start(contacts())).body.data.registrationId as string;
    expect((await lookup(unverified, nid, a.token)).status).toBe(401);
  });

  it('answers 410 for an expired draft with its valid token', async () => {
    const r = await verified();
    await h.db.query(
      `UPDATE registration_drafts SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [r.registrationId],
    );
    const res = await lookup(r.registrationId, f.fakeNid(), r.token);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('registration.draft_expired');
  });

  it('allows 5 lookups of one NID per day across drafts, counted only with a valid token', async () => {
    const nid = f.fakeNid();
    const a = await verified();
    const b = await verified();
    // requests without a valid token do not use up the NID
    for (let i = 0; i < 6; i += 1)
      expect((await lookup(a.registrationId, nid, 'y'.repeat(43))).status).toBe(401);
    for (let i = 0; i < 3; i += 1)
      expect((await lookup(a.registrationId, nid, a.token)).status).toBe(404);
    for (let i = 0; i < 2; i += 1)
      expect((await lookup(b.registrationId, nid, b.token)).status).toBe(404);
    expect((await lookup(b.registrationId, nid, b.token)).status).toBe(429);
  });

  it('stops after 5 lookups per draft', async () => {
    const r = await verified();
    for (let i = 0; i < 5; i += 1)
      expect((await lookup(r.registrationId, f.fakeNid(), r.token)).status).toBe(404);
    const res = await lookup(r.registrationId, f.fakeNid(), r.token);
    expect(res.status).toBe(429);
  });
});

describe('the daily cleanup of unsubmitted drafts', () => {
  it('deletes an expired unsubmitted draft with its photo objects and keeps a submitted one', async () => {
    const storage = h.container.storage;
    const photo = async () => {
      const id = randomUUID();
      const key = `registration/${id}.jpg`;
      await storage.put('profiles', key, Readable.from(Buffer.from('jpeg')), {
        contentType: 'image/jpeg',
      });
      await f.insert(h.db, 'files', {
        id,
        bucket: 'profiles',
        object_key: key,
        kind: 'profile_photo',
        mime: 'image/jpeg',
        size_bytes: 4,
        sha256: createHash('sha256').update(id).digest('hex'),
        source: 'camera',
      });
      return { id, key };
    };
    const gone = await photo();
    const kept = await photo();
    const expired = (await start(contacts())).body.data.registrationId as string;
    await h.db.query(
      `UPDATE registration_drafts SET expires_at = now() - interval '1 minute', photo_file_id = $2 WHERE id = $1`,
      [expired, gone.id],
    );
    const user = await account(h.db, { kind: 'volunteer', state: 'pending' });
    const submitted = (await start(contacts())).body.data.registrationId as string;
    await h.db.query(
      `UPDATE registration_drafts SET expires_at = now() - interval '1 minute', photo_file_id = $2,
         submitted_user_id = $3, submitted_at = now() WHERE id = $1`,
      [submitted, kept.id, user.id],
    );
    const result = await h.container.registrationCleanup.run();
    expect(result.files).toBeGreaterThanOrEqual(1);
    const drafts = await h.db.query('SELECT id FROM registration_drafts WHERE id = ANY($1)', [
      [expired, submitted],
    ]);
    expect(drafts.rows.map((r) => r.id)).toEqual([submitted]);
    expect(await storage.stat('profiles', gone.key)).toBeNull();
    expect(await storage.stat('profiles', kept.key)).not.toBeNull();
  });
});

describe('the cleanup when the storage fails', () => {
  it('still purges the rows, logs the failure and counts the photos', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'warn' }, { write: (l: string) => void lines.push(l) });
    const failing = {
      remove: async () => {
        throw new Error('storage down');
      },
    } as unknown as StorageDriver;
    const id = randomUUID();
    await f.insert(h.db, 'files', {
      id,
      bucket: 'profiles',
      object_key: `registration/${id}.jpg`,
      kind: 'nid_photo',
      mime: 'image/jpeg',
      size_bytes: 4,
      sha256: createHash('sha256').update(id).digest('hex'),
      source: 'gallery',
    });
    const draft = (await start(contacts())).body.data.registrationId as string;
    await h.db.query(
      `UPDATE registration_drafts SET expires_at = now() - interval '1 minute', nid_photo_file_id = $2 WHERE id = $1`,
      [draft, id],
    );
    const result = await new RegistrationCleanup(h.container.prisma, failing, logger).run();
    expect(result.files).toBe(1);
    expect(
      (await h.db.query('SELECT 1 FROM registration_drafts WHERE id = $1', [draft])).rowCount,
    ).toBe(0);
    expect(lines.join('')).toContain('draft photo object not removed');
  });

  it('works off a backlog larger than one batch, also of drafts without photos', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1)
      ids.push((await start(contacts())).body.data.registrationId as string);
    await h.db.query(
      `UPDATE registration_drafts SET expires_at = now() - interval '1 minute' WHERE id = ANY($1)`,
      [ids],
    );
    await h.container.registrationCleanup.run(1);
    expect(
      (await h.db.query('SELECT 1 FROM registration_drafts WHERE id = ANY($1)', [ids])).rowCount,
    ).toBe(0);
  });
});

describe('logs', () => {
  it('carry no draft token, code, mobile, email or NID', async () => {
    const r = await verified();
    const nid = f.fakeNid();
    await request(h.server())
      .post('/api/v1/auth/register/reference-lookup')
      .set(TOKEN_HEADER, r.token)
      .send({ registrationId: r.registrationId, nid });
    const text = logLines.join('');
    expect(text.length).toBeGreaterThan(0);
    for (const secret of [r.token, CODE, r.mobile, r.email, nid])
      expect(text).not.toContain(secret);
  });
});

describe('rate limits with the real values', () => {
  let real: AuthHarness;
  beforeAll(async () => {
    real = await authHarness({ realRateLimits: true });
  });
  afterAll(async () => real.close());

  it('gives every draft its own resend window', async () => {
    const drafts: string[] = [];
    for (const c of [contacts(), contacts()])
      drafts.push(
        (
          await real.db.query(
            `INSERT INTO registration_drafts (id, mobile, email, expires_at) VALUES (gen_random_uuid(), $1, $2, now() + interval '1 day') RETURNING id`,
            [c.mobile, c.email],
          )
        ).rows[0].id as string,
      );
    // 6 resends in all: one shared bucket of 5 would refuse the last
    for (const id of drafts)
      for (let i = 0; i < 3; i += 1)
        expect(
          (
            await request(real.server())
              .post('/api/v1/auth/register/otp/send')
              .send({ registrationId: id, channel: 'sms' })
          ).status,
        ).toBe(204);
  });

  it('refuses the eleventh start from one address in a day', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1)
      statuses.push(
        (await request(real.server()).post('/api/v1/auth/register/start').send(contacts())).status,
      );
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
