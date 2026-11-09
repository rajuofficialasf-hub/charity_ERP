import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EmailMessage } from '../../src/notifications/adapters';
import { DeliveryError } from '../../src/notifications/adapters';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  auditRows,
  bearer,
  login,
  PASSWORD,
  type Session,
} from './support/auth-app';
import * as f from './support/fixtures';

// Officials created by the admin with a set-password link, login by job ID, staff self-registration
// closed. test-only passwords for the rules of AUTH.md 3 (8 characters, 12 for a global role)
const TOO_SHORT = 'Ab1';
const UNDER_TWELVE = `${PASSWORD.slice(0, 4)} 20261`;
const TWELVE_OR_MORE = `${PASSWORD} 1`.slice(0, 14);
const WRONG = `${PASSWORD}x`;
const RESET_TO = `${PASSWORD}7`;
const sent: EmailMessage[] = [];
let failEmail = false;
let h: AuthHarness;
let head: Account;
let headSession: Session;
let pm: Account;
let loc: Awaited<ReturnType<typeof f.locationTree>>;
const api = () => request(h.server());
let n = 0;

beforeAll(async () => {
  h = await authHarness({
    overrides: {
      email: {
        send: async (message) => {
          if (failEmail) throw new DeliveryError('transient', 'smtp ECONNREFUSED');
          sent.push(message);
          return { providerMessageId: `test-${sent.length}` };
        },
      },
    },
  });
  for (const key of ['project_executive', 'official_daee'])
    await h.db.query(
      `INSERT INTO roles (key, name_bn, name_en, kind, global_scope) VALUES ($1, $1, $1, 'official', false)`,
      [key],
    );
  head = await account(h.db, { role: 'department_head' });
  pm = await account(h.db, { role: 'program_manager' });
  headSession = await login(h, head);
  loc = await f.locationTree(h.db);
});
afterAll(async () => h.close());
beforeEach(() => {
  sent.length = 0;
  failEmail = false;
});

/** A complete create request with a job ID and an email of its own. */
function official(over: Record<string, unknown> = {}) {
  n += 1;
  return {
    jobId: `asf-${1000 + n}`,
    displayName: `নতুন কর্মকর্তা ${n}`,
    designation: 'প্রজেক্ট এক্সিকিউটিভ',
    email: `new${n}.${randomUUID().slice(0, 6)}@example.org`,
    mobile: null,
    affiliation: 'department',
    affiliationUnit: null,
    homeProgramId: null,
    homeDivisionId: null,
    supervisorUserId: null,
    roleKey: 'project_executive',
    ...over,
  };
}

const create = (body: Record<string, unknown>, session: Session = headSession) =>
  api().post('/api/v1/users').set(bearer(session)).send(body);
const tokenOf = (link: string) => link.slice(link.indexOf('#') + 1);
const check = (token: string) => api().post('/api/v1/auth/invitations/check').send({ token });
const accept = (token: string, password = PASSWORD) =>
  api().post('/api/v1/auth/invitations/accept').send({ token, password });

describe('creating an official', () => {
  it('creates a pending account without a password, with its role and an emailed link', async () => {
    const body = official({ mobile: f.fakeMobile(), homeDivisionId: loc.division });
    const res = await create(body);
    expect(res.status).toBe(201);
    const issued = res.body.data as Record<string, string | boolean>;
    expect(issued).toMatchObject({ emailed: true });
    expect(issued.link).toMatch(/^http:\/\/127\.0\.0\.1:3000\/invite#[A-Za-z0-9_-]{43}$/);
    // the link reaches the email, and the token is stored only as a hash
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(body.email);
    expect(sent[0]!.text).toContain(issued.link as string);
    expect(sent[0]!.text).toContain(`ASF-${1000 + n}`);
    const user = (
      await h.db.query(
        'SELECT state, password_hash, job_id, affiliation, home_division_id, created_by FROM users WHERE id = $1',
        [issued.userId],
      )
    ).rows[0];
    expect(user).toEqual({
      state: 'pending',
      password_hash: null,
      job_id: `ASF-${1000 + n}`,
      affiliation: 'department',
      home_division_id: loc.division,
      created_by: head.id,
    });
    const roles = await h.db.query(
      'SELECT role_key, granted_by FROM user_roles WHERE user_id = $1 AND revoked_at IS NULL',
      [issued.userId],
    );
    expect(roles.rows).toEqual([{ role_key: 'project_executive', granted_by: head.id }]);
    const links = await h.db.query(
      'SELECT token_hash, emailed FROM account_invitations WHERE user_id = $1',
      [issued.userId],
    );
    expect(links.rows).toHaveLength(1);
    expect(links.rows[0].emailed).toBe(true);
    expect(links.rows[0].token_hash).not.toContain(tokenOf(issued.link as string));
    const created = (await auditRows(h.db, 'user.created')).at(-1)!;
    expect(created).toMatchObject({ actor_user_id: head.id, entity_id: issued.userId });
    expect(JSON.stringify(created.new)).not.toContain(body.email as string);
    expect((await auditRows(h.db, 'user.invited')).at(-1)).toMatchObject({
      entity_id: issued.userId,
    });
  });

  it('gives an official without a chosen language the system default language', async () => {
    const languageOf = async (userId: string) =>
      (await h.db.query('SELECT language FROM users WHERE id = $1', [userId])).rows[0].language;
    const first = await create(official());
    expect(await languageOf(first.body.data.userId)).toBe('bn');
    await h.db.query(
      `INSERT INTO settings (key, value) VALUES ('localization', '{"defaultLanguage":"en"}')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    try {
      const second = await create(official());
      expect(await languageOf(second.body.data.userId)).toBe('en');
      const chosen = await create(official({ language: 'bn' }));
      expect(await languageOf(chosen.body.data.userId)).toBe('bn');
    } finally {
      await h.db.query(`DELETE FROM settings WHERE key = 'localization'`);
    }
  });

  it('still creates the account when the email cannot be sent, so the admin copies the link', async () => {
    failEmail = true;
    const res = await create(official());
    expect(res.status).toBe(201);
    expect(res.body.data.emailed).toBe(false);
    expect(await check(tokenOf(res.body.data.link)).then((r) => r.status)).toBe(200);
  });

  it('is refused to an official without the permission', async () => {
    const res = await create(official(), await login(h, pm));
    expect(res.status).toBe(403);
  });

  it('refuses a taken job ID in any case, a taken email and a taken mobile', async () => {
    const first = official();
    expect((await create(first)).status).toBe(201);
    const again = await create(official({ jobId: (first.jobId as string).toUpperCase() }));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('user.job_id_taken');
    const email = await create(official({ email: first.email }));
    expect(email.status).toBe(409);
    expect(email.body.error.code).toBe('registration.account_exists');
    const mobile = await create(official({ mobile: pm.mobile }));
    expect(mobile.body.error.code).toBe('registration.account_exists');
  });

  it('gives only an official role, never the Department Head role', async () => {
    for (const roleKey of ['department_head', 'volunteer_general', 'no_such_role']) {
      const res = await create(official({ roleKey }));
      expect(res.status, roleKey).toBe(422);
      expect(res.body.error.details[0]).toMatchObject({
        path: 'roleKey',
        code: 'validation.option_unknown',
      });
    }
  });

  it('checks the program, the division and the supervisor', async () => {
    const program = await create(official({ homeProgramId: randomUUID() }));
    expect(program.status).toBe(422);
    expect(program.body.error.details[0].path).toBe('homeProgramId');
    const division = await create(official({ homeDivisionId: loc.district }));
    expect(division.body.error.details[0].path).toBe('homeDivisionId');
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const supervisor = await create(official({ supervisorUserId: volunteer.id }));
    expect(supervisor.status).toBe(422);
    expect(supervisor.body.error.details[0]).toMatchObject({
      path: 'supervisorUserId',
      code: 'user.supervisor_invalid',
    });
    const outsider = await create(
      official({ affiliation: 'external', affiliationUnit: 'সহযোগী সংস্থা' }),
    );
    expect(outsider.status).toBe(201);
    const underOutsider = await create(official({ supervisorUserId: outsider.body.data.userId }));
    expect(underOutsider.body.error.details[0].code).toBe('user.supervisor_invalid');
    expect((await create(official({ supervisorUserId: pm.id }))).status).toBe(201);
  });
});

describe('the set-password link', () => {
  it('shows the name and the job ID, sets the password once and opens the account', async () => {
    const body = official();
    const issued = (await create(body)).body.data;
    const token = tokenOf(issued.link);
    const view = await check(token);
    expect(view.status).toBe(200);
    expect(view.body.data).toMatchObject({
      displayName: body.displayName,
      jobId: (body.jobId as string).toUpperCase(),
      minPasswordLength: 8,
    });
    const weak = await accept(token, TOO_SHORT);
    expect(weak.status).toBe(422);
    expect(await accept(token).then((r) => r.status)).toBe(204);
    const user = (
      await h.db.query('SELECT state, password_hash IS NOT NULL AS has FROM users WHERE id = $1', [
        issued.userId,
      ])
    ).rows[0];
    expect(user).toEqual({ state: 'active', has: true });
    expect((await auditRows(h.db, 'auth.invitation_accepted')).at(-1)).toMatchObject({
      actor_user_id: issued.userId,
      entity_id: issued.userId,
    });
    // used once
    const again = await accept(token);
    expect(again.status).toBe(410);
    expect(again.body.error.code).toBe('auth.invitation_expired');
    expect((await check(token)).status).toBe(410);
    // a new link is not needed any more
    const reissue = await api()
      .post(`/api/v1/users/${issued.userId}/invitation`)
      .set(bearer(headSession))
      .send({});
    expect(reissue.status).toBe(409);
    expect(reissue.body.error.code).toBe('user.invitation_not_needed');
  });

  it('refuses an unknown token and a link older than 72 hours', async () => {
    const unknown = await check(randomBytes(32).toString('base64url'));
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('auth.invitation_invalid');
    const token = tokenOf((await create(official())).body.data.link);
    h.clock.advance(72 * 3_600_000 + 1_000);
    expect((await check(token)).status).toBe(410);
    expect((await accept(token)).status).toBe(410);
    // the access token of the admin ran out with the clock
    headSession = await login(h, head);
  });

  it('a new link revokes the open one', async () => {
    const issued = (await create(official())).body.data;
    const res = await api()
      .post(`/api/v1/users/${issued.userId}/invitation`)
      .set(bearer(headSession))
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.data.link).not.toBe(issued.link);
    expect(sent).toHaveLength(2);
    expect((await check(tokenOf(issued.link))).status).toBe(410);
    expect((await accept(tokenOf(res.body.data.link))).status).toBe(204);
    const pmRes = await api()
      .post(`/api/v1/users/${issued.userId}/invitation`)
      .set(bearer(await login(h, pm)))
      .send({});
    expect(pmRes.status).toBe(403);
  });

  it('sends a new link to a corrected email; the link to the mistyped one dies', async () => {
    const issued = (await create(official())).body.data;
    const corrected = `fixed.${randomUUID().slice(0, 8)}@example.org`;
    const res = await api()
      .post(`/api/v1/users/${issued.userId}/invitation`)
      .set(bearer(headSession))
      .send({ email: corrected.toUpperCase() });
    expect(res.status).toBe(201);
    expect(sent.at(-1)!.to).toBe(corrected);
    expect((await check(tokenOf(issued.link))).status).toBe(410);
    const row = await h.db.query('SELECT email FROM users WHERE id = $1', [issued.userId]);
    expect(row.rows[0].email).toBe(corrected);
    expect((await auditRows(h.db, 'user.email_corrected')).at(-1)).toMatchObject({
      entity_id: issued.userId,
    });
    // an address of another account is refused
    const taken = await api()
      .post(`/api/v1/users/${issued.userId}/invitation`)
      .set(bearer(headSession))
      .send({ email: head.email });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('registration.account_exists');
  });

  it('asks 12 characters of an official with a global role', async () => {
    const token = tokenOf((await create(official({ roleKey: 'monitoring_team' }))).body.data.link);
    expect((await check(token)).body.data.minPasswordLength).toBe(12);
    const short = await accept(token, UNDER_TWELVE);
    expect(short.status).toBe(422);
    expect(short.body.error.details[0].code).toBe('validation.password_too_short');
    expect((await accept(token, TWELVE_OR_MORE)).status).toBe(204);
  });
});

describe('login by job ID', () => {
  it('takes the job ID in any case, the email and the mobile', async () => {
    const body = official({ mobile: f.fakeMobile() });
    const issued = (await create(body)).body.data;
    // no password yet: no login
    const before = await api()
      .post('/api/v1/auth/login')
      .send({ loginId: body.jobId, password: PASSWORD });
    expect(before.status).toBe(401);
    await accept(tokenOf(issued.link));
    for (const loginId of [
      (body.jobId as string).toLowerCase(),
      ` ${(body.jobId as string).toUpperCase()} `,
      body.email,
      body.mobile,
    ]) {
      const res = await api().post('/api/v1/auth/login').send({ loginId, password: PASSWORD });
      expect(res.status, String(loginId)).toBe(200);
      expect(res.body.data.me.id).toBe(issued.userId);
    }
    const wrong = await api()
      .post('/api/v1/auth/login')
      .send({ loginId: body.jobId, password: WRONG });
    expect(wrong.status).toBe(401);
  });

  it('resets a password with the job ID; an account still waiting for its link gets no code', async () => {
    const body = official();
    const issued = (await create(body)).body.data;
    const waiting = await api()
      .post('/api/v1/auth/password/reset/complete')
      .send({ loginId: body.jobId, code: '246810', newPassword: RESET_TO });
    expect(waiting.status).toBe(422);
    await accept(tokenOf(issued.link));
    expect(
      (await api().post('/api/v1/auth/password/reset/start').send({ loginId: body.jobId })).status,
    ).toBe(204);
    const done = await api()
      .post('/api/v1/auth/password/reset/complete')
      .send({ loginId: body.jobId, code: '246810', newPassword: RESET_TO });
    expect(done.status).toBe(204);
    expect(
      (await api().post('/api/v1/auth/login').send({ loginId: body.jobId, password: RESET_TO }))
        .status,
    ).toBe(200);
  });
});

describe('staff self-registration (closed: the admin creates officials)', () => {
  it('is closed; a volunteer still starts a registration', async () => {
    const staff = await api().post('/api/v1/auth/register/start').send({ kind: 'staff' });
    expect(staff.status).toBe(422);
    expect(staff.body.error.code).toBe('registration.staff_by_invitation');
    expect((await api().post('/api/v1/auth/register/start').send({})).status).toBe(201);
  });

  it('keeps invited accounts out of the pending registrations', async () => {
    const issued = (await create(official())).body.data;
    const list = await api().get('/api/v1/registrations?kind=staff').set(bearer(headSession));
    expect(list.status).toBe(200);
    expect(list.body.data.map((r: { id: string }) => r.id)).not.toContain(issued.userId);
    const decide = await api()
      .post(`/api/v1/staff-registrations/${issued.userId}/decision`)
      .set(bearer(headSession))
      .send({ decision: 'approve', roleKey: 'program_manager' });
    expect(decide.status).toBe(404);
  });
});
