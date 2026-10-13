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

// Registration start and the per-channel codes (AUTH.md 2; DECISION_LOG
// D-082, D-086, D-088, D-090; plans docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md,
// U4, and docs/plans/2026-10-13-0922-feat-registration-redesign-plan.md, U3). The dummy OTP of the
// test configuration is 246810.
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
type Channel = 'sms' | 'email';

async function start(kind: 'volunteer' | 'staff' = 'volunteer') {
  const res = await api().post('/api/v1/auth/register/start').send({ kind });
  expect(res.status).toBe(201);
  return res.body.data.registrationId as string;
}

const send = (registrationId: string, channel: Channel, address: string) =>
  api().post('/api/v1/auth/register/otp/send').send({ registrationId, channel, address });

const verify = (registrationId: string, channel: Channel, code = CODE) =>
  api().post('/api/v1/auth/register/otp/verify').send({ registrationId, channel, code });

/** Sends and verifies both channels; returns the answer of the second verify. */
async function verifyBoth(registrationId: string, c: { mobile: string; email: string }) {
  expect((await send(registrationId, 'sms', c.mobile)).status).toBe(204);
  expect((await verify(registrationId, 'sms')).status).toBe(200);
  expect((await send(registrationId, 'email', c.email)).status).toBe(204);
  return verify(registrationId, 'email');
}

async function verified(kind: 'volunteer' | 'staff' = 'volunteer') {
  const c = contacts();
  const registrationId = await start(kind);
  const res = await verifyBoth(registrationId, c);
  expect(res.status).toBe(200);
  return { ...c, registrationId, token: res.body.data.registrationToken as string };
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

const draftRow = async (id: string) =>
  (await h.db.query('SELECT * FROM registration_drafts WHERE id = $1', [id])).rows[0];

describe('POST /auth/register/start', () => {
  it('creates an empty draft of the kind, sends nothing and audits the start', async () => {
    const id = await start();
    expect(await draftRow(id)).toMatchObject({
      kind: 'volunteer',
      mobile: null,
      email: null,
      otp_sends: 0,
      token_hash: null,
    });
    expect(await auditActions(id)).toEqual(['auth.register_started']);
    expect(events).toContainEqual({ type: 'registration.started', draftId: id });
    expect((await draftRow(await start('staff'))).kind).toBe('staff');
  });

  it('refuses contacts in the start body and an unknown kind (422)', async () => {
    for (const body of [contacts(), { kind: 'system' }])
      expect((await api().post('/api/v1/auth/register/start').send(body)).status).toBe(422);
  });
});

describe('POST /auth/register/otp/send', () => {
  it('stores the address and sends one code to it only, with a masked address in the audit', async () => {
    const c = contacts();
    const id = await start();
    expect((await send(id, 'sms', c.mobile)).status).toBe(204);
    expect(await draftRow(id)).toMatchObject({ mobile: c.mobile, email: null, otp_sends: 1 });
    expect((await codesOf(c.mobile)).map((r) => r.channel)).toEqual(['sms']);
    expect(await codesOf(c.email)).toEqual([]);
    expect((await send(id, 'email', c.email.toUpperCase())).status).toBe(204);
    expect((await draftRow(id)).email).toBe(c.email);
    const sent = (
      await h.db.query(
        `SELECT new FROM audit_log WHERE entity_id = $1 AND action = 'auth.otp_sent' ORDER BY created_at`,
        [id],
      )
    ).rows.map((r) => r.new as { channel: string; address: string });
    expect(sent.map((e) => e.channel)).toEqual(['sms', 'email']);
    expect(sent[0]!.address).toBe(`${c.mobile.slice(0, 2)}•••••••${c.mobile.slice(-2)}`);
    expect(JSON.stringify(sent)).not.toContain(c.mobile);
    expect(JSON.stringify(sent)).not.toContain(c.email);
  });

  it('accepts only the 01XXXXXXXXX spelling of a mobile, so its spellings share one window', async () => {
    const id = await start();
    const m = f.fakeMobile();
    for (const spelling of [`+88${m}`, `88${m}`, m.replace('01', '০১'), '12345'])
      expect((await send(id, 'sms', spelling)).status).toBe(422);
    expect((await send(id, 'sms', m)).status).toBe(204);
    expect((await draftRow(id)).otp_sends).toBe(1);
  });

  it('a changed address clears that channel; a verified channel with the same address is refused (409)', async () => {
    const c = contacts();
    const id = await start();
    await send(id, 'sms', c.mobile);
    expect((await verify(id, 'sms')).body.data).toEqual({ verified: ['sms'] });
    const again = await send(id, 'sms', c.mobile);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('registration.already_verified');
    const other = f.fakeMobile();
    expect((await send(id, 'sms', other)).status).toBe(204);
    expect(await draftRow(id)).toMatchObject({ mobile: other, mobile_verified_at: null });
    // the code of the earlier number no longer verifies the new one
    expect((await verify(id, 'sms', '000000')).status).toBe(422);
  });

  it('a send refused for its address changes nothing: the old number stays verified and the budget kept', async () => {
    const c = contacts();
    const id = await start();
    await send(id, 'sms', c.mobile);
    await verify(id, 'sms');
    // the new number already had 5 codes this hour
    const full = f.fakeMobile();
    for (let i = 0; i < 5; i += 1)
      await f.insert(h.db, 'otp_codes', {
        id: randomUUID(),
        purpose: 'registration',
        channel: 'sms',
        address_hash: identifierHash(h.container.env, full),
        code_hash: 'c',
        expires_at: new Date(Date.now() + 60_000),
      });
    expect((await send(id, 'sms', full)).status).toBe(429);
    const draft = await draftRow(id);
    expect(draft).toMatchObject({ mobile: c.mobile, otp_sends: 1 });
    expect(draft.mobile_verified_at).not.toBeNull();
  });

  it('allows 6 sends per draft across channels and address changes, then 429', async () => {
    const id = await start();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1)
      statuses.push(
        (await send(id, i % 2 ? 'email' : 'sms', i % 2 ? contacts().email : f.fakeMobile())).status,
      );
    expect(statuses).toEqual([204, 204, 204, 204, 204, 204, 429]);
  });

  it('answers the same for the address of an existing account', async () => {
    const existing = await account(h.db, { kind: 'volunteer' });
    const free = contacts();
    const a = await send(await start(), 'sms', existing.mobile!);
    const b = await send(await start(), 'sms', free.mobile);
    expect([a.status, a.body]).toEqual([b.status, b.body]);
  });

  it('answers 404 for an unknown draft and 409 once the draft holds its token', async () => {
    expect((await send(randomUUID(), 'email', contacts().email)).status).toBe(404);
    const r = await verified();
    const res = await send(r.registrationId, 'email', contacts().email);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('registration.already_verified');
  });
});

describe('POST /auth/register/otp/verify', () => {
  it('verifies one channel at a time; the second gives the token once, only its hash is stored', async () => {
    const c = contacts();
    const id = await start();
    await send(id, 'sms', c.mobile);
    const first = await verify(id, 'sms');
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ verified: ['sms'] });
    expect((await draftRow(id)).mobile_verified_at).not.toBeNull();
    await send(id, 'email', c.email);
    const second = await verify(id, 'email');
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ verified: ['sms', 'email'], kind: 'volunteer' });
    const token = second.body.data.registrationToken as string;
    expect(token.length).toBeGreaterThanOrEqual(32);
    const draft = await draftRow(id);
    expect(draft.verified_at).not.toBeNull();
    expect(draft.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(await auditActions(id)).toEqual([
      'auth.register_started',
      'auth.otp_sent',
      'auth.otp_verified',
      'auth.otp_sent',
      'auth.otp_verified',
    ]);
    expect(events).toContainEqual({ type: 'registration.verified', draftId: id });
    // a verified draft takes no further code
    expect((await verify(id, 'email')).status).toBe(409);
  });

  it('two channels verified at the same time still end in one token', async () => {
    const c = contacts();
    const id = await start();
    await send(id, 'sms', c.mobile);
    await send(id, 'email', c.email);
    const answers = await Promise.all([verify(id, 'sms'), verify(id, 'email')]);
    expect(answers.map((r) => r.status)).toEqual([200, 200]);
    expect(answers.filter((r) => r.body.data.registrationToken)).toHaveLength(1);
    expect((await draftRow(id)).verified_at).not.toBeNull();
  });

  it('the answer of a verified draft carries no program list (O-64)', async () => {
    for (const kind of ['staff', 'volunteer'] as const) {
      const done = await verifyBoth(await start(kind), contacts());
      expect(done.body.data).toMatchObject({ verified: ['sms', 'email'], kind });
      expect(done.body.data).not.toHaveProperty('programs');
    }
  });

  it('names the code of a wrong answer, counts the attempt and needs a sent code', async () => {
    const c = contacts();
    const id = await start();
    expect((await verify(id, 'sms')).status).toBe(422);
    await send(id, 'sms', c.mobile);
    const wrong = await verify(id, 'sms', '111111');
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.details).toEqual([
      expect.objectContaining({ path: 'code', code: 'otp.invalid' }),
    ]);
    expect((await codesOf(c.mobile)).map((r) => r.attempts)).toEqual([1]);
    expect((await verify(id, 'sms')).status).toBe(200);
    expect(await auditActions(id)).toContain('auth.otp_failed');
  });

  it('after 5 wrong codes a new send gives a new code but no fresh budget for the draft', async () => {
    const real = await authHarness({ realRateLimits: true });
    try {
      const go = () => request(real.server());
      const id = (await go().post('/api/v1/auth/register/start').send({})).body.data
        .registrationId as string;
      await go()
        .post('/api/v1/auth/register/otp/send')
        .send({ registrationId: id, channel: 'sms', address: f.fakeMobile() });
      const guess = () =>
        go()
          .post('/api/v1/auth/register/otp/verify')
          .send({ registrationId: id, channel: 'sms', code: '000000' });
      for (let i = 0; i < 5; i += 1) expect((await guess()).status).not.toBe(200);
      await go()
        .post('/api/v1/auth/register/otp/send')
        .send({ registrationId: id, channel: 'sms', address: f.fakeMobile() });
      expect((await guess()).status).toBe(429);
    } finally {
      await real.close();
    }
  });

  it('reports an existing account only after both codes, and frees a rejected never-approved one', async () => {
    const pending = await account(h.db, { kind: 'volunteer', state: 'pending' });
    const id = await start();
    await send(id, 'sms', pending.mobile!);
    // the first channel looks like any other
    expect((await verify(id, 'sms')).body.data).toEqual({ verified: ['sms'] });
    await send(id, 'email', contacts().email);
    const res = await verify(id, 'email');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('registration.account_exists');
    // both channels start again
    expect(await draftRow(id)).toMatchObject({
      mobile_verified_at: null,
      email_verified_at: null,
      token_hash: null,
    });

    const loc = await f.locationTree(h.db);
    const rejected = await account(h.db, { kind: 'volunteer', state: 'deactivated' });
    await f.volunteer(h.db, loc, rejected.id);
    const again = await verifyBoth(await start(), {
      mobile: rejected.mobile!,
      email: contacts().email,
    });
    expect(again.status).toBe(200);
  });

  it('counts an approved, later closed volunteer and an official who held a role as taken', async () => {
    const loc = await f.locationTree(h.db);
    const closed = await account(h.db, { kind: 'volunteer', state: 'deactivated' });
    await f.volunteer(h.db, loc, closed.id, { approved_at: new Date() });
    expect(
      (await verifyBoth(await start(), { mobile: closed.mobile!, email: contacts().email })).status,
    ).toBe(409);

    const withRole = await account(h.db, { kind: 'staff', state: 'deactivated' });
    expect(
      (await verifyBoth(await start('staff'), { mobile: f.fakeMobile(), email: withRole.email! }))
        .status,
    ).toBe(409);

    const noRole = `norole${++n}@example.org`;
    await f.user(h.db, { kind: 'staff', email: noRole, state: 'deactivated' });
    expect(
      (await verifyBoth(await start('staff'), { mobile: f.fakeMobile(), email: noRole })).status,
    ).toBe(200);
  });

  it('refuses an unknown draft (404) and an expired one (410)', async () => {
    expect((await verify(randomUUID(), 'sms')).status).toBe(404);
    const id = await start();
    await h.db.query(
      `UPDATE registration_drafts SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [id],
    );
    const res = await verify(id, 'sms');
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('registration.draft_expired');
  });
});

describe('the reference lookup of the team member registration is gone (O-64, D-091)', () => {
  it('answers 404 even with a valid draft token', async () => {
    const r = await verified();
    const res = await api()
      .post('/api/v1/auth/register/reference-lookup')
      .set(TOKEN_HEADER, r.token)
      .send({ registrationId: r.registrationId, nid: f.fakeNid() });
    expect(res.status).toBe(404);
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
    const expired = await start();
    await h.db.query(
      `UPDATE registration_drafts SET expires_at = now() - interval '1 minute', photo_file_id = $2 WHERE id = $1`,
      [expired, gone.id],
    );
    const user = await account(h.db, { kind: 'volunteer', state: 'pending' });
    const submitted = await start();
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
    const draft = await start();
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
    for (let i = 0; i < 3; i += 1) ids.push(await start());
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
  it('carry no draft token, code, mobile, email or NID, also from the per-channel steps', async () => {
    const r = await verified();
    const nid = f.fakeNid();
    // a refused submit carries the NID in its body
    await request(h.server())
      .post('/api/v1/auth/register/submit')
      .set(TOKEN_HEADER, r.token)
      .send({ kind: 'volunteer', registrationId: r.registrationId, nid });
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

  it('counts the sends to one address across drafts: 5 per hour', async () => {
    const mobile = f.fakeMobile();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      // drafts made directly, so the starts of the next test keep their own window
      const id = (
        await real.db.query(
          `INSERT INTO registration_drafts (id, expires_at) VALUES (gen_random_uuid(), now() + interval '1 day') RETURNING id`,
        )
      ).rows[0].id as string;
      statuses.push(
        (
          await request(real.server())
            .post('/api/v1/auth/register/otp/send')
            .send({ registrationId: id, channel: 'sms', address: mobile })
        ).status,
      );
    }
    expect(statuses).toEqual([204, 204, 204, 204, 204, 429]);
  });

  it('refuses the eleventh start from one address in a day', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1)
      statuses.push(
        (await request(real.server()).post('/api/v1/auth/register/start').send({})).status,
      );
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
