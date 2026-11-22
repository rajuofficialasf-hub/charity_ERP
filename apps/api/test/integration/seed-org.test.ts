import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext, seedId } from '../../seed/context.js';
import { runSeed } from '../../seed/run.js';
import { SYSTEM_ACTOR_ID } from '../../seed/sets/base/index.js';
import { type OrgLink, seedOrg } from '../../seed/sets/org/index.js';
import type { StaffListRow } from '../../seed/sets/org/staff-file.js';
import { type AuthHarness, authHarness, PASSWORD } from './support/auth-app.js';

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

async function run(list = LIST, written: OrgLink[][] = []) {
  const ctx = new SeedContext(h.container.prisma);
  ctx.actorId = SYSTEM_ACTOR_ID;
  return seedOrg(ctx, list, {
    appOrigin: ORIGIN,
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
     VALUES ('project_executive', 'project_executive', 'project_executive', 'official', false)
     ON CONFLICT (key) DO NOTHING`,
  );
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
