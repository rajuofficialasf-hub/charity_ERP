import { fakeMobile, isFakeNid } from '@css/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext, seedId } from '../../seed/context.js';
import { runSeed } from '../../seed/run.js';
import { SYSTEM_ACTOR_ID } from '../../seed/sets/base/index.js';
import { DEMO_PASSWORD } from '../../seed/sets/demo/index.js';
import { type OrgLink, seedOrg } from '../../seed/sets/org/index.js';
import type { StaffListRow } from '../../seed/sets/org/staff-file.js';
import { type AuthHarness, authHarness, login, PASSWORD } from './support/auth-app.js';
import * as f from './support/fixtures.js';
import type { VolunteerListRow } from '../../seed/sets/org/volunteer-file.js';

// The org seed set: the department's own officials loaded from a checked staff list. Every row
// here is made up; the real list stays outside the repository.
let h: AuthHarness;
const api = () => request(h.server());
const ORIGIN = 'http://127.0.0.1:3000';

const row = (over: Partial<StaffListRow> & Pick<StaffListRow, 'jobId'>): StaffListRow => ({
  line: 2,
  name: `Test ${over.jobId}`,
  mobile: null,
  email: `${over.jobId.toLowerCase()}@example.test`,
  designation: 'Test designation',
  roleKey: 'project_executive',
  programCode: null,
  supervisorJobId: null,
  ...over,
});

const LIST: StaffListRow[] = [
  row({ jobId: 'ORG-1', roleKey: 'department_head', mobile: '01700000951' }),
  row({ jobId: 'ORG-2', roleKey: 'admin', supervisorJobId: 'ORG-1' }),
  row({ jobId: 'ORG-3', roleKey: 'program_manager', programCode: 'HUM', supervisorJobId: 'ORG-1' }),
  row({
    jobId: 'ORG-4',
    roleKey: 'project_executive',
    programCode: 'HUM',
    supervisorJobId: 'ORG-3',
  }),
];
const userOf = (jobId: string) => seedId(`org-user:${jobId}`);

let home: Awaited<ReturnType<typeof f.locationTree>>;
const VOLUNTEERS: VolunteerListRow[] = [
  { line: 2, name: 'Sample Volunteer One', mobile: fakeMobile(961) },
  { line: 3, name: 'Sample Volunteer Two', mobile: fakeMobile(962) },
];
const volunteerUser = (mobile: string) => seedId(`org-volunteer:${mobile}`);

async function run(
  list = LIST,
  written: OrgLink[][] = [],
  demoPassword = false,
  volunteers: VolunteerListRow[] = [],
) {
  const ctx = new SeedContext(h.container.prisma);
  ctx.actorId = SYSTEM_ACTOR_ID;
  return seedOrg(ctx, list, {
    appOrigin: ORIGIN,
    demoPassword,
    volunteers,
    volunteerHome: home,
    // the links are issued on the app's own clock, so the set-password page reads them as open
    now: h.clock.now(),
    writeLinks: (links) => {
      written.push(links);
    },
  });
}

const tokenOf = (link: string) => link.slice(link.indexOf('#') + 1);

beforeAll(async () => {
  h = await authHarness();
  const ctx = new SeedContext(h.container.prisma);
  await ctx.upsert('users', {
    id: SYSTEM_ACTOR_ID,
    kind: 'system',
    display_name: 'System',
    state: 'active',
  });
  // the harness brings the global and PM roles; the list also names an Executive
  await h.db.query(
    `INSERT INTO roles (key, name_bn, name_en, kind, global_scope)
     VALUES ('project_executive', 'project_executive', 'project_executive', 'official', false),
            ('volunteer_general', 'volunteer_general', 'volunteer_general', 'volunteer', false)
     ON CONFLICT (key) DO NOTHING`,
  );
  home = await f.locationTree(h.db);
});
afterAll(async () => h.close());

describe('the org seed set', () => {
  it('makes pending officials with their roles, designations, programs and supervisors, the programs their PM, and the list Admin the Main Admin', async () => {
    const written: OrgLink[][] = [];
    await run(LIST, written);
    const { rows } = await h.db.query(
      `SELECT u.job_id, u.state, u.password_hash IS NULL AS no_password, u.designation,
              u.mobile, u.email, p.code AS program, s.job_id AS supervisor, r.role_key
       FROM users u
       LEFT JOIN programs p ON p.id = u.home_program_id
       LEFT JOIN users s ON s.id = u.supervisor_user_id
       JOIN user_roles r ON r.user_id = u.id AND r.revoked_at IS NULL
       WHERE u.job_id LIKE 'ORG-%' ORDER BY u.job_id`,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        job_id: 'ORG-1',
        state: 'pending',
        no_password: true,
        role_key: 'department_head',
        supervisor: null,
        mobile: '01700000951',
      }),
      expect.objectContaining({ job_id: 'ORG-2', role_key: 'admin', supervisor: 'ORG-1' }),
      expect.objectContaining({
        job_id: 'ORG-3',
        role_key: 'program_manager',
        program: 'HUM',
        supervisor: 'ORG-1',
      }),
      expect.objectContaining({
        job_id: 'ORG-4',
        role_key: 'project_executive',
        program: 'HUM',
        supervisor: 'ORG-3',
        designation: 'Test designation',
      }),
    ]);
    const programs = await h.db.query(
      `SELECT p.code, u.job_id AS pm FROM programs p LEFT JOIN users u ON u.id = p.pm_user_id
       WHERE p.code IN ('UCD', 'HUM', 'ERR') ORDER BY p.code`,
    );
    expect(programs.rows).toEqual([
      { code: 'ERR', pm: null },
      { code: 'HUM', pm: 'ORG-3' },
      { code: 'UCD', pm: null },
    ]);
    expect(written).toHaveLength(1);
    // a fresh database has no Main Admin: the list's first Admin becomes it
    const owner = await h.db.query(`SELECT job_id FROM users WHERE is_system_owner`);
    expect(owner.rows).toEqual([{ job_id: 'ORG-2' }]);
  });

  it('gives each pending official one open link that the set-password page opens, issued by the system actor', async () => {
    const written: OrgLink[][] = [];
    await run(LIST, written);
    const links = written[0]!;
    expect(links.map((l) => [l.jobId, l.roleKey])).toEqual([
      ['ORG-1', 'department_head'],
      ['ORG-2', 'admin'],
      ['ORG-3', 'program_manager'],
      ['ORG-4', 'project_executive'],
    ]);
    // the links file holds the job ID, name, role, link and expiry, and nothing else
    expect(Object.keys(links[0]!).sort()).toEqual([
      'expiresAt',
      'jobId',
      'link',
      'name',
      'roleKey',
    ]);
    expect(links[0]!.link.startsWith(`${ORIGIN}/invite#`)).toBe(true);
    expect(links[0]!.expiresAt).toBe(
      new Date(h.clock.now().getTime() + 72 * 3_600_000).toISOString(),
    );
    const checked = await api()
      .post('/api/v1/auth/invitations/check')
      .send({ token: tokenOf(links[3]!.link) });
    expect(checked.status).toBe(200);
    expect(checked.body.data).toMatchObject({ jobId: 'ORG-4', displayName: 'Test ORG-4' });
    const open = await h.db.query(
      `SELECT count(*)::int AS n FROM account_invitations
       WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
      [userOf('ORG-4')],
    );
    expect(open.rows[0].n).toBe(1);
    const audit = await h.db.query(
      `SELECT DISTINCT actor_user_id FROM audit_log WHERE action = 'user.invited' AND entity_id = $1`,
      [userOf('ORG-4')],
    );
    expect(audit.rows).toEqual([{ actor_user_id: SYSTEM_ACTOR_ID }]);
  });

  it('changes no account on a second run, and replaces the open links', async () => {
    const before = await h.db.query(
      `SELECT id, updated_at FROM users WHERE job_id LIKE 'ORG-%' ORDER BY id`,
    );
    const written: OrgLink[][] = [];
    await run(LIST, written);
    const after = await h.db.query(
      `SELECT id, updated_at FROM users WHERE job_id LIKE 'ORG-%' ORDER BY id`,
    );
    expect(after.rows).toEqual(before.rows);
    const open = await h.db.query(
      `SELECT count(*)::int AS n FROM account_invitations
       WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
      [userOf('ORG-4')],
    );
    expect(open.rows[0].n).toBe(1);
    expect(written[0]).toHaveLength(4);
  });

  it('leaves an official who has set a password active, with the password, and gives them no link', async () => {
    const written: OrgLink[][] = [];
    await run(LIST, written);
    const accepted = await api()
      .post('/api/v1/auth/invitations/accept')
      .send({
        token: tokenOf(written[0]!.find((l) => l.jobId === 'ORG-4')!.link),
        password: PASSWORD,
      });
    expect(accepted.status).toBe(204);
    const again: OrgLink[][] = [];
    await run(LIST, again);
    expect(again[0]!.map((l) => l.jobId)).not.toContain('ORG-4');
    const user = await h.db.query(
      `SELECT state, password_hash IS NOT NULL AS has_password FROM users WHERE id = $1`,
      [userOf('ORG-4')],
    );
    expect(user.rows[0]).toEqual({ state: 'active', has_password: true });
  });

  it('writes nothing when the links cannot be written', async () => {
    const ctx = new SeedContext(h.container.prisma);
    ctx.actorId = SYSTEM_ACTOR_ID;
    const extra = [...LIST, row({ jobId: 'ORG-5', supervisorJobId: 'ORG-1' })];
    await expect(
      seedOrg(ctx, extra, {
        appOrigin: ORIGIN,
        now: h.clock.now(),
        writeLinks: () => {
          throw new Error('disk full');
        },
      }),
    ).rejects.toThrow('disk full');
    const made = await h.db.query(`SELECT count(*)::int AS n FROM users WHERE job_id = 'ORG-5'`);
    expect(made.rows[0].n).toBe(0);
  });

  it('makes no new Main Admin where the database has one', async () => {
    // the database never lets go of its Main Admin, so the first run's stays
    await run();
    await run([LIST[0]!, row({ jobId: 'ORG-21', roleKey: 'admin', supervisorJobId: 'ORG-1' })]);
    const owner = await h.db.query(`SELECT job_id FROM users WHERE is_system_owner`);
    expect(owner.rows).toEqual([{ job_id: 'ORG-2' }]);
  });

  it('opens the officials without a password with the demo password, and leaves a password of their own alone', async () => {
    const list = [
      ...LIST,
      row({ jobId: 'ORG-30', supervisorJobId: 'ORG-1' }),
      row({ jobId: 'ORG-31', supervisorJobId: 'ORG-1' }),
    ];
    // the last official of the list sets a password of their own through a link first
    const links: OrgLink[][] = [];
    await run(list, links);
    const own = links[0]!.find((l) => l.jobId === 'ORG-31')!;
    const accepted = await api()
      .post('/api/v1/auth/invitations/accept')
      .send({ token: tokenOf(own.link), password: PASSWORD });
    expect(accepted.status).toBe(204);

    const handed: OrgLink[][] = [];
    await run(list, handed, true);
    expect(handed).toEqual([[]]);
    const state = await h.db.query(
      `SELECT state, password_hash IS NOT NULL AS has_password FROM users WHERE id = $1`,
      [userOf('ORG-30')],
    );
    expect(state.rows[0]).toEqual({ state: 'active', has_password: true });
    await expect(login(h, 'ORG-30', { password: DEMO_PASSWORD })).resolves.toBeTruthy();
    // a password of one's own stays: the demo password does not open that account
    await expect(login(h, 'ORG-31', { password: PASSWORD })).resolves.toBeTruthy();
    await expect(login(h, 'ORG-31', { password: DEMO_PASSWORD })).rejects.toThrow(/login failed/);
    const open = await h.db.query(
      `SELECT count(*)::int AS n FROM account_invitations
       WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
      [userOf('ORG-30')],
    );
    expect(open.rows[0].n).toBe(0);
  });

  it('makes the volunteers approved general volunteers with sample details, signing in by mobile with the demo password', async () => {
    await run(LIST, [], true, VOLUNTEERS);
    const { rows } = await h.db.query(
      `SELECT u.kind, u.state, u.display_name, u.mobile, v.nid, v.type, v.father_name, v.mother_name,
              v.union_id, v.approved_at IS NOT NULL AS approved, r.role_key
       FROM users u JOIN volunteers v ON v.user_id = u.id
       JOIN user_roles r ON r.user_id = u.id AND r.revoked_at IS NULL
       WHERE u.id = ANY($1::uuid[]) ORDER BY u.mobile`,
      [VOLUNTEERS.map((v) => volunteerUser(v.mobile))],
    );
    expect(rows).toHaveLength(2);
    for (const [i, r] of rows.entries()) {
      expect(r).toMatchObject({
        kind: 'volunteer',
        state: 'active',
        display_name: VOLUNTEERS[i]!.name,
        mobile: VOLUNTEERS[i]!.mobile,
        type: 'general',
        union_id: home.union,
        approved: true,
        role_key: 'volunteer_general',
      });
      expect(isFakeNid(r.nid)).toBe(true);
      expect(r.father_name).toContain('(নমুনা)');
      expect(r.mother_name).toContain('(নমুনা)');
    }
    await expect(
      login(h, VOLUNTEERS[0]!.mobile, { password: DEMO_PASSWORD }),
    ).resolves.toBeTruthy();
  });

  it('changes no volunteer on a rerun, and keeps a password a volunteer set', async () => {
    await run(LIST, [], true, VOLUNTEERS);
    const own = volunteerUser(VOLUNTEERS[1]!.mobile);
    await h.db.query(`UPDATE users SET password_hash = 'own-password-hash' WHERE id = $1`, [own]);
    const before = await h.db.query(
      `SELECT u.id, u.updated_at, v.updated_at AS v_updated, v.nid FROM users u
       JOIN volunteers v ON v.user_id = u.id WHERE u.id = ANY($1::uuid[]) ORDER BY u.id`,
      [VOLUNTEERS.map((v) => volunteerUser(v.mobile))],
    );
    await run(LIST, [], true, VOLUNTEERS);
    const after = await h.db.query(
      `SELECT u.id, u.updated_at, v.updated_at AS v_updated, v.nid FROM users u
       JOIN volunteers v ON v.user_id = u.id WHERE u.id = ANY($1::uuid[]) ORDER BY u.id`,
      [VOLUNTEERS.map((v) => volunteerUser(v.mobile))],
    );
    expect(after.rows).toEqual(before.rows);
    const kept = await h.db.query(`SELECT password_hash FROM users WHERE id = $1`, [own]);
    expect(kept.rows[0].password_hash).toBe('own-password-hash');
  });

  it('refuses a volunteer whose mobile another account holds, and writes nothing', async () => {
    const taken = fakeMobile(963);
    await h.db.query(
      `INSERT INTO users (id, kind, mobile, state, display_name) VALUES (gen_random_uuid(), 'volunteer', $1, 'active', 'Someone else')`,
      [taken],
    );
    const extra: VolunteerListRow = { line: 4, name: 'Sample Taken', mobile: taken };
    const fresh: VolunteerListRow = { line: 5, name: 'Sample Fresh', mobile: fakeMobile(964) };
    await expect(run(LIST, [], true, [...VOLUNTEERS, extra, fresh])).rejects.toThrow(
      /line 4: the mobile belongs to another account/,
    );
    const made = await h.db.query(`SELECT count(*)::int AS n FROM users WHERE id = $1`, [
      volunteerUser(fresh.mobile),
    ]);
    expect(made.rows[0].n).toBe(0);
  });

  it('keeps the demo set out of a database that holds the department’s own officials', async () => {
    await h.db.query(
      `INSERT INTO settings (key, value) VALUES ('seed.marker.org', '{"version":1}'::jsonb)`,
    );
    try {
      await expect(
        runSeed(h.container.prisma, ['demo'], {
          NODE_ENV: 'test',
          DATABASE_URL: h.container.env.DATABASE_URL,
        }),
      ).rejects.toThrow(/own officials; reset it/);
    } finally {
      await h.db.query(`DELETE FROM settings WHERE key = 'seed.marker.org'`);
    }
  });

  it('refuses a database that holds the demo set', async () => {
    await h.db.query(
      `INSERT INTO settings (key, value) VALUES ('seed.marker.demo', '{"version":1}'::jsonb)`,
    );
    try {
      await expect(run()).rejects.toThrow(/demo set/);
    } finally {
      await h.db.query(`DELETE FROM settings WHERE key = 'seed.marker.demo'`);
    }
  });
});
