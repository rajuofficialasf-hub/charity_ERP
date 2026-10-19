import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  account,
  type AuthHarness,
  auditRows,
  authHarness,
  bearer,
  login,
  PASSWORD,
} from './support/auth-app';

// Password change and reset with the dummy OTP (AUTH.md 2, 3; BD-44, BD-49; O-05, O-25, D-071).
// The test configuration sets OTP_DUMMY_CODE=246810.
const CODE = '246810';
let h: AuthHarness;

beforeAll(async () => {
  h = await authHarness();
});

afterAll(async () => {
  await h.close();
});

const post = (path: string) => request(h.server()).post(`/api/v1${path}`);

describe('POST /auth/password/change', () => {
  it('changes the password, keeps this session and logs out the other devices', async () => {
    const staff = await account(h.db);
    const here = await login(h, staff);
    const other = await login(h, staff);
    await post('/auth/password/change')
      .set(bearer(here))
      .send({ currentPassword: PASSWORD, newPassword: 'Shapla phul 77' })
      .expect(204);
    await request(h.server()).get('/api/v1/auth/me').set(bearer(here)).expect(200);
    const gone = await request(h.server()).get('/api/v1/auth/me').set(bearer(other)).expect(401);
    expect(gone.body.error.code).toBe('auth.session_revoked');
    await login(h, staff, { password: 'Shapla phul 77' });
    const audit = await auditRows(h.db, 'auth.password_changed');
    expect(audit.at(-1)).toMatchObject({ entity_id: staff.id, new: { otherSessionsRevoked: 1 } });
    expect(JSON.stringify(audit)).not.toContain('Shapla');
  });

  it('needs the current password and applies every rule to the new one', async () => {
    const staff = await account(h.db);
    const s = await login(h, staff);
    const wrong = await post('/auth/password/change')
      .set(bearer(s))
      .send({ currentPassword: 'not it 123', newPassword: 'Shapla phul 77' })
      .expect(422);
    expect(wrong.body.error.details).toEqual([
      expect.objectContaining({ path: 'currentPassword', code: 'auth.current_password_invalid' }),
    ]);
    const rules = await post('/auth/password/change')
      .set('Accept-Language', 'en')
      .set(bearer(s))
      .send({ currentPassword: PASSWORD, newPassword: 'nouppercase1' })
      .expect(422);
    expect(rules.body.error.details.map((d: { code: string }) => d.code)).toEqual([
      'validation.password_uppercase_digit',
    ]);
    const nodigit = await post('/auth/password/change')
      .set(bearer(s))
      .send({ currentPassword: PASSWORD, newPassword: 'NoDigitsHere' })
      .expect(422);
    expect(nodigit.body.error.details[0].code).toBe('validation.password_uppercase_digit');
    const short = await post('/auth/password/change')
      .set(bearer(s))
      .send({ currentPassword: PASSWORD, newPassword: 'ab1' })
      .expect(422);
    expect(short.body.error.details[0].code).toBe('validation.password_too_short');
  });

  it('accepts a password with the own mobile number or a common word, and refuses one over 128 characters', async () => {
    const staff = await account(h.db);
    const s = await login(h, staff);
    const long = await post('/auth/password/change')
      .set(bearer(s))
      .send({ currentPassword: PASSWORD, newPassword: `A1${'x'.repeat(127)}` });
    expect(long.status).toBe(422);
    await post('/auth/password/change')
      .set(bearer(s))
      .send({ currentPassword: PASSWORD, newPassword: `X${staff.mobile}` })
      .expect(204);
    const again = await login(h, staff, { password: `X${staff.mobile}` });
    await post('/auth/password/change')
      .set(bearer(again))
      .send({ currentPassword: `X${staff.mobile}`, newPassword: 'Bismillah786' })
      .expect(204);
  });

  it('asks 12 characters of GLOBAL-scope officials (O-25)', async () => {
    const head = await account(h.db, { role: 'monitoring_team' });
    const s = await login(h, head);
    const res = await post('/auth/password/change')
      .set(bearer(s))
      .send({ currentPassword: PASSWORD, newPassword: 'Shapla 2026' })
      .expect(422);
    expect(res.body.error.details[0].code).toBe('validation.password_too_short');
    await post('/auth/password/change')
      .set(bearer(s))
      .send({ currentPassword: PASSWORD, newPassword: 'Shapla phul 2026' })
      .expect(204);
  });
});

describe('password reset with the OTP', () => {
  it('answers the same for unknown and known ids and issues a code only for an account', async () => {
    const staff = await account(h.db);
    await post('/auth/password/reset/start').send({ loginId: staff.email }).expect(204);
    await post('/auth/password/reset/start').send({ loginId: 'nobody@example.org' }).expect(204);
    const codes = await h.db.query('SELECT channel, code_hash, purpose FROM otp_codes');
    expect(codes.rows).toHaveLength(1);
    expect(codes.rows[0]).toMatchObject({ channel: 'email', purpose: 'password_reset' });
    expect(codes.rows[0].code_hash).not.toContain(CODE);
    expect((await auditRows(h.db, 'auth.password_reset_started')).length).toBe(2);
  });

  it('sets a new password with the code, revokes every session and lifts a lock', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const old = await login(h, volunteer);
    await h.db.query(
      `UPDATE users SET locked_until = now() + interval '10 minutes' WHERE id = $1`,
      [volunteer.id],
    );
    await post('/auth/password/reset/start').send({ loginId: volunteer.mobile }).expect(204);
    const sms = await h.db.query(`SELECT channel FROM otp_codes WHERE created_by = $1`, [
      volunteer.id,
    ]);
    expect(sms.rows[0].channel).toBe('sms');
    await post('/auth/password/reset/complete')
      .send({ loginId: volunteer.mobile, code: CODE, newPassword: 'Shapla phul 77' })
      .expect(204);
    await request(h.server()).get('/api/v1/auth/me').set(bearer(old)).expect(401);
    await login(h, volunteer, { password: 'Shapla phul 77' });
    // a code is used once
    const again = await post('/auth/password/reset/complete')
      .send({ loginId: volunteer.mobile, code: CODE, newPassword: 'Kadam phul 88' })
      .expect(422);
    expect(again.body.error.code).toBe('otp.invalid');
    expect(await auditRows(h.db, 'auth.password_reset_completed')).toEqual(
      expect.arrayContaining([expect.objectContaining({ entity_id: volunteer.id })]),
    );
  });

  it('counts wrong codes and stops at the fifth (O-25)', async () => {
    const staff = await account(h.db);
    await post('/auth/password/reset/start').send({ loginId: staff.email }).expect(204);
    for (let i = 1; i <= 4; i++) {
      const res = await post('/auth/password/reset/complete')
        .send({ loginId: staff.email, code: '000000', newPassword: 'Shapla phul 77' })
        .expect(422);
      expect(res.body.error.code).toBe('otp.invalid');
    }
    const fifth = await post('/auth/password/reset/complete')
      .send({ loginId: staff.email, code: '000000', newPassword: 'Shapla phul 77' })
      .expect(429);
    expect(fifth.body.error.code).toBe('otp.attempts_exceeded');
    // even the right code is refused now; a new code is needed
    await post('/auth/password/reset/complete')
      .send({ loginId: staff.email, code: CODE, newPassword: 'Shapla phul 77' })
      .expect(429);
    expect((await auditRows(h.db, 'auth.otp_failed')).length).toBeGreaterThanOrEqual(6);
  });

  it('counts parallel wrong codes atomically: the right code is refused once five are spent', async () => {
    const staff = await account(h.db);
    await post('/auth/password/reset/start').send({ loginId: staff.email }).expect(204);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        post('/auth/password/reset/complete').send({
          loginId: staff.email,
          code: '111111',
          newPassword: 'Shapla phul 77',
        }),
      ),
    );
    // five attempts are reserved; the rest are refused. A request that reserved an early attempt
    // may still see the cap reached by the time it answers, so only the bounds are fixed.
    const invalid = results.filter((r) => r.status === 422).length;
    const exceeded = results.filter((r) => r.status === 429).length;
    expect(invalid + exceeded).toBe(8);
    expect(invalid).toBeLessThanOrEqual(4);
    expect(exceeded).toBeGreaterThanOrEqual(4);
    const right = await post('/auth/password/reset/complete')
      .send({ loginId: staff.email, code: CODE, newPassword: 'Shapla phul 77' })
      .expect(429);
    expect(right.body.error.code).toBe('otp.attempts_exceeded');
    // the attempted code carries exactly five attempts; no code ever exceeds the cap
    const counted = await h.db.query(
      'SELECT max(attempts)::int AS most, count(*) FILTER (WHERE attempts > 5)::int AS over FROM otp_codes',
    );
    expect(counted.rows[0]).toEqual({ most: 5, over: 0 });
  });

  it('refuses an expired code and a weak password without using the code', async () => {
    const staff = await account(h.db);
    await post('/auth/password/reset/start').send({ loginId: staff.email }).expect(204);
    const weak = await post('/auth/password/reset/complete')
      .send({ loginId: staff.email, code: CODE, newPassword: 'password12' })
      .expect(422);
    expect(weak.body.error.details[0].code).toBe('validation.password_uppercase_digit');
    h.clock.advance(5 * 60_000 + 1000);
    const expired = await post('/auth/password/reset/complete')
      .send({ loginId: staff.email, code: CODE, newPassword: 'Shapla phul 77' })
      .expect(422);
    expect(expired.body.error.code).toBe('otp.expired');
  });

  it('gives an unknown id the same error as a wrong code', async () => {
    const res = await post('/auth/password/reset/complete')
      .send({ loginId: 'nobody@example.org', code: CODE, newPassword: 'Shapla phul 77' })
      .expect(422);
    expect(res.body.error.code).toBe('otp.invalid');
  });

  it('stops issuing codes after 5 requests per hour without telling the caller', async () => {
    const staff = await account(h.db);
    for (let i = 0; i < 7; i++)
      await post('/auth/password/reset/start').send({ loginId: staff.email }).expect(204);
    const rows = await h.db.query(
      'SELECT count(*)::int AS n FROM otp_codes WHERE created_by = $1',
      [staff.id],
    );
    expect(rows.rows[0].n).toBe(5);
  });
});

describe('the request budget of the password change', () => {
  let limited: AuthHarness;
  beforeAll(async () => {
    limited = await authHarness({ realRateLimits: true });
  });
  afterAll(async () => limited.close());

  const change = (s: Awaited<ReturnType<typeof login>>, from: string, to: string) =>
    request(limited.server())
      .post('/api/v1/auth/password/change')
      .set(bearer(s))
      .send({ currentPassword: from, newPassword: to });

  it('counts the changes per user, so one user never uses up the window of the others', async () => {
    // six people change their password within the hour: each has a window of its own
    for (let i = 0; i < 6; i += 1) {
      const staff = await account(limited.db);
      const s = await login(limited, staff);
      expect((await change(s, PASSWORD, `Shapla phul ${70 + i}`)).status).toBe(204);
    }
    // one person gets five changes an hour
    const staff = await account(limited.db);
    const s = await login(limited, staff);
    const words = [
      PASSWORD,
      'Shapla phul 80',
      'Shapla phul 81',
      'Shapla phul 82',
      'Shapla phul 83',
      'Shapla phul 84',
      'Shapla phul 85',
    ];
    for (let i = 0; i < 5; i += 1)
      expect((await change(s, words[i]!, words[i + 1]!)).status).toBe(204);
    expect((await change(s, words[5]!, words[6]!)).status).toBe(429);
  });
});
