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
import { notificationsOf } from './support/notifications.js';

// The permission panel API (docs/security/RBAC.md, "Permission panel").
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const REASON = 'Panel change for the test';
const FUTURE = '2027-01-01T00:00:00Z';

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
});

afterAll(async () => {
  await h.close();
});

type Row = { permission: string; scopeType: string; source: string; grantId?: string };
const effective = async (s: Session, userId: string, query: Record<string, string> = {}) =>
  (
    await api()
      .get(`/api/v1/users/${userId}/effective-permissions`)
      .query(query)
      .set(bearer(s))
      .expect(200)
  ).body.data as Row[];
const version = async (userId: string) =>
  (await h.db.query('SELECT permission_version FROM users WHERE id = $1', [userId])).rows[0]
    .permission_version as number;
const audits = async (userId: string, action: string, override?: string) =>
  (
    await h.db.query(
      `SELECT old, new, reason FROM audit_log
        WHERE entity_id = $1 AND action = $2
          AND ($3::text IS NULL OR old->>'override' = $3 OR new->'created' ? $3)
        ORDER BY created_at`,
      [userId, action, override ?? null],
    )
  ).rows as { old: unknown; new: unknown; reason: string }[];
const grant = (s: Session, body: Record<string, unknown>) =>
  api()
    .post('/api/v1/permission-grants')
    .set(bearer(s))
    .send({ effect: 'grant', scopeType: 'GLOBAL', reason: REASON, ...body });

describe('catalogue and effective permissions', () => {
  it('lists roles and permissions, each by name, for every holder of the view at any scope', async () => {
    // the Head and the Monitoring Team at GLOBAL, a PM for the program, an RPM for the region
    for (const userId of [
      world.users.head,
      world.users.monitoring,
      world.users.pm,
      world.users.rpmDhaka,
    ]) {
      const s = await as(userId);
      const roles = await api().get('/api/v1/roles').set(bearer(s)).expect(200);
      expect(roles.body.data).toContainEqual({
        key: 'regional_program_manager',
        name: { bn: 'রিজিওনাল প্রোগ্রাম ম্যানেজার', en: 'Regional Program Manager' },
        kind: 'official',
        globalScope: false,
      });
      const permissions = await api().get('/api/v1/permissions').set(bearer(s)).expect(200);
      expect(permissions.body.data).toContainEqual(
        expect.objectContaining({
          name: 'permission.panel.manage',
          title: { bn: 'পারমিশন দেওয়া ও তুলে নেওয়া', en: 'Give and take away permissions' },
          module: 'M02',
        }),
      );
    }
    // a person without the view reads neither
    const executive = await as(world.users.executive);
    await api().get('/api/v1/permissions').set(bearer(executive)).expect(403);
  });

  it('names the project and the place of each scope, so no id is shown', async () => {
    const head = await as(world.users.head);
    const rows = (
      await api()
        .get(`/api/v1/users/${world.users.executive}/effective-permissions`)
        .set(bearer(head))
        .expect(200)
    ).body.data as {
      permission: string;
      source: string;
      projectId?: string | null;
      scopeName?: { bn: string; en: string } | null;
    }[];
    const extra = rows.find(
      (r) => r.permission === 'application.approve' && r.source === 'project_grant',
    )!;
    expect(extra.projectId).toBe(world.a1.id);
    // a project extra names no instance of its own: it is named by its project
    const project = (
      await h.db.query('SELECT name_bn, name_en FROM projects WHERE id = $1', [world.a1.id])
    ).rows[0];
    expect(extra.scopeName).toEqual({ bn: project.name_bn, en: project.name_en });
    // a scope without an instance and without a project has no name
    const unbound = rows.filter((r) => r.source === 'role_default' && !r.projectId);
    expect(unbound.length).toBeGreaterThan(0);
    for (const r of unbound) expect(r.scopeName ?? null, r.permission).toBeNull();
  });

  it('shows effective permissions with their source and filters by project', async () => {
    const head = await as(world.users.head);
    const rows = await effective(head, world.users.executive);
    expect(rows).toContainEqual(
      expect.objectContaining({ permission: 'application.approve', source: 'project_grant' }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ permission: 'application.review', source: 'role_default' }),
    );
    const onB1 = await effective(head, world.users.executive, { projectId: world.b1.id });
    expect(onB1.some((r) => r.source === 'project_grant')).toBe(false);
  });

  it('lets a PM view effective permissions inside the own program only, never change them', async () => {
    const pm = await as(world.users.pm);
    await effective(pm, world.users.executive);
    const outside = await api()
      .get(`/api/v1/users/${world.users.outsider}/effective-permissions`)
      .set(bearer(pm))
      .expect(404);
    expect(outside.body.error.code).toBe('permission.not_found');
    const res = await grant(pm, {
      userId: world.users.executive,
      permissions: ['permission.view'],
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('permission.denied');
  });
});

describe('grant and revoke', () => {
  it('grants with a reason and expiry, audits old and new grants and stales the old token', async () => {
    const head = await as(world.users.head);
    const target = await as(world.users.executive);
    await api().get('/api/v1/users').set(bearer(target)).expect(403);
    const before = await version(world.users.executive);
    // a region, not the whole country, which would ask for a new password first
    const res = await grant(head, {
      userId: world.users.executive,
      permissions: ['permission.view'],
      scopeType: 'REGION',
      scopeRef: world.dhaka.division,
      expiresAt: FUTURE,
    }).expect(201);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        userId: world.users.executive,
        permission: 'permission.view',
        effect: 'grant',
        scopeType: 'REGION',
        grantedBy: world.users.head,
        reason: REASON,
      }),
    ]);
    expect(await version(world.users.executive)).toBe(before + 1);
    const stale = await api().get('/api/v1/users').set(bearer(target)).expect(401);
    expect(stale.body.error.code).toBe('auth.token_stale');
    const fresh = await as(world.users.executive);
    await api().get('/api/v1/users').set(bearer(fresh)).expect(200);
    const rows = await effective(head, world.users.executive);
    expect(rows).toContainEqual(
      expect.objectContaining({
        permission: 'permission.view',
        source: 'panel_grant',
        grantId: res.body.data[0].id,
      }),
    );
    const entries = await audits(world.users.executive, 'permission_change', res.body.data[0].id);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.reason).toBe(REASON);
    expect(JSON.stringify(entry.old)).not.toContain('panel_grant');
    expect(JSON.stringify(entry.new)).toContain('panel_grant');
    // the person is told, in both languages, what changed
    const told = await notificationsOf(h.db, 'permission_changed', world.users.executive);
    expect(told).toHaveLength(1);
    expect(told[0]!.params.summary).toEqual({
      bn: 'অনুমতি দেওয়া হয়েছে: কার কী পারমিশন আছে দেখা',
      en: 'Permission given: View who holds which permissions',
    });
  });

  it('hides a role default with a revoke override and restores it when the override ends', async () => {
    const head = await as(world.users.head);
    const has = async () =>
      (await effective(head, world.users.rpmRangpur)).some(
        (r) => r.permission === 'permission.view',
      );
    expect(await has()).toBe(true);
    const created = await api()
      .post('/api/v1/permission-grants')
      .set(bearer(head))
      .send({
        userId: world.users.rpmRangpur,
        permissions: ['permission.view'],
        effect: 'revoke',
        scopeType: 'GLOBAL',
        reason: REASON,
      })
      .expect(201);
    expect(await has()).toBe(false);
    const before = await version(world.users.rpmRangpur);
    await api()
      .post(`/api/v1/permission-grants/${created.body.data[0].id}/revoke`)
      .set(bearer(head))
      .send({ reason: 'The override is no longer needed' })
      .expect(204);
    expect(await has()).toBe(true);
    expect(await version(world.users.rpmRangpur)).toBe(before + 1);
    expect(
      await audits(world.users.rpmRangpur, 'permission_change', created.body.data[0].id),
    ).toHaveLength(2);
    // an ended override cannot be ended again
    await api()
      .post(`/api/v1/permission-grants/${created.body.data[0].id}/revoke`)
      .set(bearer(head))
      .send({ reason: 'The override is no longer needed' })
      .expect(404);
  });
});

describe('several permissions at once, and what is taken away', () => {
  const overrides = (s: Session, userId: string) =>
    api().get(`/api/v1/users/${userId}/permission-overrides`).set(bearer(s));

  it('gives three permissions in one request: three rows, one audit entry and one notice', async () => {
    const target = await account(h.db, { role: 'project_executive' });
    const head = await as(world.users.head);
    const before = await version(target.id);
    const res = await grant(head, {
      userId: target.id,
      permissions: ['audit.view', 'monitoring.view', 'work_summary.view'],
    }).expect(201);
    const created = res.body.data as { id: string; permission: string }[];
    expect(created.map((r) => r.permission)).toEqual([
      'audit.view',
      'monitoring.view',
      'work_summary.view',
    ]);
    expect(await version(target.id)).toBe(before + 1);
    const entries = (
      await h.db.query(
        `SELECT new FROM audit_log WHERE entity_id = $1 AND action = 'permission_change'`,
        [target.id],
      )
    ).rows as { new: { created: string[] } }[];
    expect(entries).toHaveLength(1);
    expect(entries[0]!.new.created).toEqual(created.map((r) => r.id));
    const told = await notificationsOf(h.db, 'permission_changed', target.id);
    expect(told).toHaveLength(1);
    expect(told[0]!.params.summary).toEqual({
      bn: 'অনুমতি দেওয়া হয়েছে: অডিট লগ দেখা, মনিটরিং সেন্টার দেখা, কাজের সারসংক্ষেপ দেখা',
      en: 'Permission given: View the audit log, View the monitoring centre, View work summaries',
    });
  });

  it('refuses a request whole when one of its permissions is refused, and audits the refusal once', async () => {
    const head = await as(world.users.head);
    const admin = await as(world.users.admin);
    const target = await account(h.db, { role: 'program_manager' });
    const other = await account(h.db, { role: 'admin' });
    const rows = async (userId: string) =>
      (
        await h.db.query('SELECT count(*)::int AS n FROM user_permissions WHERE user_id = $1', [
          userId,
        ])
      ).rows[0].n as number;
    const refusals = async (userId: string) =>
      (await audits(userId, 'permission_change_refused')).length;
    const cases: [Session, string, Record<string, unknown>, string][] = [
      // nineteen plain permissions and one key permission, which only an Admin gives
      [
        head,
        target.id,
        {
          permissions: [
            'audit.view',
            'monitoring.view',
            'work_summary.view',
            'budget.view',
            'ledger.view',
            'donor.view',
            'dashboard.project.view',
            'dashboard.program.view',
            'dashboard.central.view',
            'dashboard.dawah.view',
            'document.register.view',
            'beneficiary.consent.view',
            'media.work.view',
            'story.view',
            'program.view',
            'project.view',
            'staff.work.view',
            'dawah.tracking.view',
            'export.list',
            'settings.manage',
          ],
        },
        'key_permission_admin_only',
      ],
      // the actor as the target: a change of the own access
      [head, world.users.head, { permissions: ['audit.export', 'monitoring.view'] }, 'self_change'],
      // a revoke on an Admin
      [
        admin,
        other.id,
        { permissions: ['audit.view', 'application.view'], effect: 'revoke' },
        'top_role_protected',
      ],
    ];
    for (const [session, userId, body, rule] of cases) {
      const written = await rows(userId);
      const refusedBefore = await refusals(userId);
      const res = await grant(session, { userId, ...body }).expect(403);
      expect(res.body.error.params).toEqual({ rule });
      expect(await rows(userId)).toBe(written);
      expect(await refusals(userId)).toBe(refusedBefore + 1);
    }
  });

  it('lists what is taken away by name, a project revoked from a program-wide grant too, and puts it in the audit', async () => {
    const head = await as(world.users.head);
    const target = await account(h.db, { role: 'project_executive' });
    await grant(head, {
      userId: target.id,
      permissions: ['budget.view'],
      scopeType: 'PROGRAM',
      scopeRef: world.a1.program,
    }).expect(201);
    const taken = await grant(head, {
      userId: target.id,
      permissions: ['budget.view'],
      effect: 'revoke',
      scopeType: 'PROJECT',
      scopeRef: world.a2.id,
    }).expect(201);
    const takenId = (taken.body.data as { id: string }[])[0]!.id;
    const list = (await overrides(head, target.id).expect(200)).body.data as {
      id: string;
      effect: string;
      scopeType: string;
    }[];
    // the newest first: the revoke of one project, then the program-wide grant
    expect(list.map((r) => [r.effect, r.scopeType])).toEqual([
      ['revoke', 'PROJECT'],
      ['grant', 'PROGRAM'],
    ]);
    const project = (
      await h.db.query('SELECT name_bn, name_en FROM projects WHERE id = $1', [world.a2.id])
    ).rows[0];
    expect(list[0]).toMatchObject({
      id: takenId,
      title: { bn: 'প্রকল্পের বাজেট দেখা', en: 'View project budgets' },
      scopeName: { bn: project.name_bn, en: project.name_en },
      reason: REASON,
      grantedBy: { id: world.users.head },
    });
    // the program-wide grant stands in the effective list, so the audit names the revoke itself
    const [entry] = (
      await h.db.query(
        `SELECT old, new FROM audit_log
          WHERE entity_id = $1 AND action = 'permission_change' AND new->'created' ? $2`,
        [target.id, takenId],
      )
    ).rows as {
      old: { overrides: { id: string }[] };
      new: { overrides: { id: string; effect: string }[] };
    }[];
    expect(entry!.old.overrides.map((o) => o.id)).not.toContain(takenId);
    expect(entry!.new.overrides).toContainEqual(
      expect.objectContaining({ id: takenId, effect: 'revoke' }),
    );
  });

  it('lets an RPM read the overrides of a person of the region and nobody outside it, without the reasons', async () => {
    const head = await as(world.users.head);
    await grant(head, {
      userId: world.users.executive,
      permissions: ['donor.view'],
      scopeType: 'REGION',
      scopeRef: world.dhaka.division,
    }).expect(201);
    const rpm = await as(world.users.rpmDhaka);
    const seen = (await overrides(rpm, world.users.executive).expect(200)).body.data as {
      permission: string;
      reason: string | null;
      grantedBy: unknown;
      scopeName: unknown;
    }[];
    const row = seen.find((r) => r.permission === 'donor.view')!;
    // a reason may concern the person: it and its author are for the readers at GLOBAL
    expect(row).toMatchObject({ reason: null, grantedBy: null });
    expect(row.scopeName).not.toBeNull();
    const byHead = (await overrides(head, world.users.executive).expect(200)).body.data as {
      permission: string;
      reason: string | null;
    }[];
    expect(byHead.find((r) => r.permission === 'donor.view')!.reason).toBe(REASON);
    const outside = await overrides(rpm, world.users.outsider).expect(404);
    expect(outside.body.error.code).toBe('permission.not_found');
  });
});

describe('refusals', () => {
  const refused = async (
    body: Record<string, unknown>,
    rule: string,
    target: string,
    actor: string = world.users.head,
  ) => {
    const session = await as(actor);
    const before = (await audits(target, 'permission_change_refused')).length;
    const rows = async () =>
      (
        await h.db.query('SELECT count(*)::int AS n FROM user_permissions WHERE user_id = $1', [
          target,
        ])
      ).rows[0].n as number;
    const written = await rows();
    const res = await api()
      .post('/api/v1/permission-grants')
      .set(bearer(session))
      .send({ effect: 'grant', scopeType: 'GLOBAL', reason: REASON, userId: target, ...body })
      .expect(403);
    expect(res.body.error).toMatchObject({ code: 'permission.grant_refused', params: { rule } });
    expect(await audits(target, 'permission_change_refused')).toHaveLength(before + 1);
    // a refused change writes nothing
    expect(await rows()).toBe(written);
  };
  const end = (s: Session, grantId: string) =>
    api()
      .post(`/api/v1/permission-grants/${grantId}/revoke`)
      .set(bearer(s))
      .send({ reason: 'Ending the override for the test' });

  it('refuses the owner transfer to anyone but an Admin, and leaves it to an Admin to give', async () => {
    for (const target of [world.users.monitoring, world.users.pm])
      await refused(
        { permissions: ['system.owner.transfer'] },
        'owner_transfer_only_admin',
        target,
        world.users.admin,
      );
    await refused(
      { permissions: ['system.owner.transfer'] },
      'key_permission_admin_only',
      world.users.pm,
    );
  });

  it('leaves the key permissions to an Admin: the Head is refused, and may still take one away', async () => {
    for (const permission of ['permission.panel.manage', 'user.role.change', 'settings.manage'])
      await refused({ permissions: [permission] }, 'key_permission_admin_only', world.users.pm);
    // the answer names the permission the rule refused, among others that would have passed
    const named = await api()
      .post('/api/v1/permission-grants')
      .set(bearer(await as(world.users.head)))
      .send({
        effect: 'grant',
        scopeType: 'PROGRAM',
        scopeRef: world.a1.program,
        reason: REASON,
        userId: world.users.pm,
        permissions: ['program.view', 'settings.manage'],
      })
      .expect(403);
    expect(named.body.error.details).toEqual([
      expect.objectContaining({
        path: 'permissions',
        code: 'permission.refused.key_permission_admin_only',
        message: expect.stringContaining('settings.manage'),
      }),
    ]);
    const admin = await as(world.users.admin);
    const head = await as(world.users.head);
    // the PM's own program, not the whole country, which would ask for a new password first
    const given = await grant(admin, {
      userId: world.users.pm,
      permissions: ['user.create'],
      scopeType: 'PROGRAM',
      scopeRef: world.a1.program,
    }).expect(201);
    // taking a key permission away lowers access, so the Head may: a revoke, or the end of a grant
    const taken = await grant(head, {
      userId: world.users.pm,
      permissions: ['user.create'],
      effect: 'revoke',
      scopeType: 'GLOBAL',
    }).expect(201);
    // lifting that revoke gives the permission back: an Admin's to do
    const before = (await audits(world.users.pm, 'permission_change_refused')).length;
    const lifted = await end(head, taken.body.data[0].id).expect(403);
    expect(lifted.body.error).toMatchObject({
      code: 'permission.grant_refused',
      params: { rule: 'key_permission_admin_only' },
    });
    expect(await audits(world.users.pm, 'permission_change_refused')).toHaveLength(before + 1);
    await end(admin, taken.body.data[0].id).expect(204);
    await end(head, given.body.data[0].id).expect(204);
  });

  it('refuses a change of the own access: a grant, a revoke and the end of an override', async () => {
    for (const actor of [world.users.head, world.users.admin]) {
      await refused({ permissions: ['permission.view'] }, 'self_change', actor, actor);
      await refused(
        { permissions: ['application.view'], effect: 'revoke', scopeType: 'SELF' },
        'self_change',
        actor,
        actor,
      );
    }
    // an override another Admin wrote on the Head: the Head does not end it
    const admin = await as(world.users.admin);
    const onHead = await grant(admin, {
      userId: world.users.head,
      permissions: ['form.library.manage'],
      scopeType: 'PROJECT',
      scopeRef: world.a1.id,
    }).expect(201);
    const res = await end(await as(world.users.head), onHead.body.data[0].id).expect(403);
    expect(res.body.error.params).toEqual({ rule: 'self_change' });
    const row = await h.db.query('SELECT revoked_at FROM user_permissions WHERE id = $1', [
      onHead.body.data[0].id,
    ]);
    expect(row.rows[0].revoked_at).toBeNull();
    await end(admin, onHead.body.data[0].id).expect(204);
  });

  it('writes no revoke against an Admin or the Department Head, at any scope', async () => {
    const other = await account(h.db, { role: 'admin' });
    for (const target of [world.users.head, other.id])
      for (const scope of [
        { scopeType: 'GLOBAL' },
        { scopeType: 'PROJECT', scopeRef: world.a1.id },
        { scopeType: 'REGION', scopeRef: world.dhaka.division },
      ])
        await refused(
          { permissions: ['application.view'], effect: 'revoke', ...scope },
          'top_role_protected',
          target,
          world.users.admin,
        );
  });

  it('refuses a condition on a revoke', async () => {
    const head = await as(world.users.head);
    const res = await grant(head, {
      userId: world.users.executive,
      permissions: ['application.view'],
      effect: 'revoke',
      scopeType: 'PROJECT',
      scopeRef: world.a1.id,
      condition: 'own_region',
    }).expect(422);
    expect(res.body.error.details).toContainEqual(
      expect.objectContaining({ path: 'condition', code: 'validation.unknown_parameter' }),
    );
  });

  it('refuses the Monitoring Team the panel itself', async () => {
    const monitoring = await as(world.users.monitoring);
    const res = await grant(monitoring, {
      userId: world.users.pm,
      permissions: ['permission.view'],
    }).expect(403);
    expect(res.body.error.code).toBe('permission.denied');
  });

  it('refuses to remove the GLOBAL scope of the Monitoring Team', async () => {
    await refused(
      { permissions: ['permission.view'], effect: 'revoke' },
      'global_scope_protected',
      world.users.monitoring,
    );
  });

  it('refuses a sensitive permission to a volunteer', async () => {
    await refused(
      { permissions: ['volunteer.view_sensitive'], scopeType: 'PROJECT', scopeRef: world.a1.id },
      'sensitive_to_volunteer',
      world.users.general,
    );
  });

  it('answers 409 for any change that targets the Main Admin, before every other rule', async () => {
    // a Main Admin of its own, so no other test depends on the flag (it cannot be unset)
    const owner = await account(h.db, { role: 'admin' });
    const head = await as(world.users.head);
    const live = await grant(head, {
      userId: owner.id,
      permissions: ['form.library.manage'],
    }).expect(201);
    await h.db.query('UPDATE users SET is_system_owner = true WHERE id = $1', [owner.id]);
    for (const body of [
      { permissions: ['permission.view'] },
      { permissions: ['permission.view'], effect: 'revoke' },
      { permissions: ['volunteer.view_sensitive'], scopeType: 'PROJECT' },
    ]) {
      const res = await api()
        .post('/api/v1/permission-grants')
        .set(bearer(head))
        .send({
          effect: 'grant',
          scopeType: 'GLOBAL',
          reason: REASON,
          userId: owner.id,
          ...body,
        })
        .expect(409);
      expect(res.body.error.code).toBe('user.system_owner_protected');
    }
    // ending a grant of the Main Admin is refused too, and the grant stays live
    const end = await api()
      .post(`/api/v1/permission-grants/${live.body.data[0].id}/revoke`)
      .set(bearer(head))
      .send({ reason: 'Trying to strip the owner' })
      .expect(409);
    expect(end.body.error.code).toBe('user.system_owner_protected');
    const row = await h.db.query('SELECT revoked_at FROM user_permissions WHERE id = $1', [
      live.body.data[0].id,
    ]);
    expect(row.rows[0].revoked_at).toBeNull();
    // every attempt is audited (three grants and one end)
    expect(await audits(owner.id, 'permission_change_refused')).toHaveLength(4);
  });

  it('refuses a caller without the panel permission to end a grant', async () => {
    const head = await as(world.users.head);
    const live = await grant(head, {
      userId: world.users.outsider,
      permissions: ['form.library.manage'],
    }).expect(201);
    const pm = await as(world.users.pm);
    const res = await api()
      .post(`/api/v1/permission-grants/${live.body.data[0].id}/revoke`)
      .set(bearer(pm))
      .send({ reason: 'Not my permission to end' })
      .expect(403);
    expect(res.body.error.code).toBe('permission.denied');
    const row = await h.db.query('SELECT revoked_at FROM user_permissions WHERE id = $1', [
      live.body.data[0].id,
    ]);
    expect(row.rows[0].revoked_at).toBeNull();
    expect(
      await audits(world.users.outsider, 'permission_change', live.body.data[0].id),
    ).toHaveLength(1);
  });

  it('validates the permission, the scope reference and the expiry', async () => {
    const head = await as(world.users.head);
    const bad = async (body: Record<string, unknown>, path: string) => {
      const res = await grant(head, {
        userId: world.users.executive,
        permissions: ['permission.view'],
        ...body,
      }).expect(422);
      expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
    };
    await bad({ permissions: ['no.such_permission'] }, 'permissions');
    await bad({ scopeType: 'PROGRAM' }, 'scopeRef');
    await bad({ scopeRef: world.a1.program }, 'scopeRef');
    await bad({ scopeType: 'PROGRAM', scopeRef: world.a1.id }, 'scopeRef');
    await bad({ scopeType: 'REGION', scopeRef: world.a1.program }, 'scopeRef');
    await bad({ condition: 'no_such_condition' }, 'condition');
    await bad({ expiresAt: '2020-01-01T00:00:00Z' }, 'expiresAt');
    await grant(head, {
      userId: world.users.executive,
      permissions: ['permission.view'],
      scopeType: 'REGION',
      scopeRef: world.dhaka.division,
    }).expect(201);
    const unknownUser = await grant(head, {
      userId: '00000000-0000-7000-8000-000000000000',
      permissions: ['permission.view'],
    }).expect(404);
    expect(unknownUser.body.error.code).toBe('permission.not_found');
  });
});
